'use strict';

import Homey from 'homey';
import { executeQuery, discoverSslMode, type UnraidClientConfig, type SslMode, type SslDiscoveryResult } from '../../lib/api/client';
import { z } from 'zod';

/**
 * Data stored during pairing process
 */
interface PairingData {
  host: string;
  apiKey: string;
  httpPort?: number;
  httpsPort?: number;
  sslSettings?: SslDiscoveryResult;
  serverInfo?: {
    hostname: string;
    version: string;
    uptime: number;
  };
  features?: {
    hasDocker: boolean;
    hasVMs: boolean;
    hasUPS: boolean;
  };
}

/**
 * Login data received from the pairing form
 */
interface LoginFormData {
  host: string;
  apiKey: string;
  httpPort?: number;
  httpsPort?: number;
}

/**
 * Device data stored with the device
 */
interface DeviceData {
  host: string;
}

/**
 * Store data for the device
 */
interface StoreData {
  apiKey: string;
  sslMode: SslMode;
  resolvedUrl: string;
  httpPort?: number;
  httpsPort?: number;
  hasDocker?: boolean;
  hasVMs?: boolean;
  hasUPS?: boolean;
}

/**
 * UnraidServerDriver handles pairing and device management for Unraid servers
 */
class UnraidServerDriver extends Homey.Driver {
  /**
   * Called when the driver is initialized
   */
  async onInit(): Promise<void> {
    this.log('UnraidServerDriver has been initialized');
  }

  /**
   * Called when a pairing session starts
   */
  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    this.log('Starting pairing session');

    // Store pairing data across views
    const pairingData: PairingData = {
      host: '',
      apiKey: '',
    };

    // Handle login from the single login view
    session.setHandler('login', async (data: LoginFormData) => {
      this.log('Login attempt for:', data.host);
      pairingData.host = data.host;
      pairingData.apiKey = data.apiKey;
      pairingData.httpPort = data.httpPort;
      pairingData.httpsPort = data.httpsPort;

      // Log if custom ports are being used
      if (data.httpPort || data.httpsPort) {
        this.log(`Using custom ports - HTTP: ${data.httpPort || 80}, HTTPS: ${data.httpsPort || 443}`);
      }

      try {
        // Step 1: Discover SSL mode with custom ports if provided
        this.log('Discovering SSL mode...');
        const sslSettings = await discoverSslMode(data.host, {
          httpPort: data.httpPort,
          httpsPort: data.httpsPort,
          timeout: 15000,
        });
        pairingData.sslSettings = sslSettings;
        this.log(`SSL mode detected: ${sslSettings.sslMode} (URL: ${sslSettings.url}, verifySsl: ${sslSettings.verifySsl})`);

        // Log warning for non-strict modes
        if (sslSettings.sslMode === 'no') {
          this.log('WARNING: Server is configured without SSL. Connection is not encrypted.');
        } else if (sslSettings.sslMode === 'yes') {
          this.log('WARNING: Server uses self-signed certificate. Connection is encrypted but server identity is not verified.');
        }

        // Step 2: Validate connection with discovered settings
        const config: UnraidClientConfig = {
          host: pairingData.host,
          apiKey: pairingData.apiKey,
          timeout: 15000,
          sslMode: sslSettings.sslMode,
          resolvedUrl: sslSettings.url,
        };

        this.log('Testing connection...');
        const serverInfo = await this.fetchServerInfo(config);
        pairingData.serverInfo = serverInfo;
        this.log('Connection successful:', serverInfo.hostname);

        // Step 3: Detect available features (Docker, VMs, UPS)
        this.log('Detecting available features...');
        const features = await this.detectFeatures(config);
        pairingData.features = features;
        this.log(`Features detected - Docker: ${features.hasDocker}, VMs: ${features.hasVMs}, UPS: ${features.hasUPS}`);

        return true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        this.error('Connection failed:', errorMsg);
        throw new Error(`Could not connect: ${errorMsg}`);
      }
    });

    // Handle list_devices view - create the device
    session.setHandler('list_devices', async () => {
      this.log('Creating device for', pairingData.host);

      const hostname = pairingData.serverInfo?.hostname || pairingData.host;
      const sslMode = pairingData.sslSettings?.sslMode || 'yes';
      const resolvedUrl = pairingData.sslSettings?.url || `https://${pairingData.host}/graphql`;

      // Build store data with optional custom ports and detected features
      const storeData: StoreData = {
        apiKey: pairingData.apiKey,
        sslMode,
        resolvedUrl,
        hasDocker: pairingData.features?.hasDocker ?? false,
        hasVMs: pairingData.features?.hasVMs ?? false,
        hasUPS: pairingData.features?.hasUPS ?? false,
      };
      if (pairingData.httpPort) storeData.httpPort = pairingData.httpPort;
      if (pairingData.httpsPort) storeData.httpsPort = pairingData.httpsPort;

      const device = {
        name: `Unraid: ${hostname}`,
        data: {
          id: `unraid-${pairingData.host.replace(/\./g, '-')}`,
        } as { id: string },
        store: storeData,
        settings: {
          host: pairingData.host,
        } as DeviceData,
      };

      this.log('Device created:', device.name, `(SSL mode: ${sslMode})`);
      if (pairingData.httpPort || pairingData.httpsPort) {
        this.log(`Custom ports - HTTP: ${pairingData.httpPort || 80}, HTTPS: ${pairingData.httpsPort || 443}`);
      }
      return [device];
    });
  }

  /**
   * Fetch server info for display during pairing
   */
  private async fetchServerInfo(config: UnraidClientConfig): Promise<{
    hostname: string;
    version: string;
    uptime: number;
  }> {
    // Schema for the pairing info query response
    // Note: uptime is returned as ISO date string, versions are under core
    const pairingInfoSchema = z.object({
      info: z.object({
        os: z.object({
          hostname: z.string(),
          uptime: z.string(), // ISO date string
        }),
        versions: z.object({
          core: z.object({
            unraid: z.string().optional(),
          }).optional(),
        }).optional(),
      }),
    });

    type PairingInfoResponse = z.infer<typeof pairingInfoSchema>;

    const query = `
      query {
        info {
          os {
            hostname
            uptime
          }
          versions {
            core {
              unraid
            }
          }
        }
      }
    `;

    const result = await executeQuery<PairingInfoResponse>(
      config,
      query,
      {},
      pairingInfoSchema,
    );

    // Calculate uptime in seconds from ISO date
    let uptimeSeconds = 0;
    try {
      const bootTime = new Date(result.info.os.uptime);
      uptimeSeconds = Math.floor((Date.now() - bootTime.getTime()) / 1000);
    } catch {
      uptimeSeconds = 0;
    }

    return {
      hostname: result.info.os.hostname,
      version: result.info.versions?.core?.unraid ?? 'Unknown',
      uptime: uptimeSeconds,
    };
  }

  /**
   * Detect available features on the Unraid server
   * Each feature is queried separately so one failure doesn't affect others
   */
  private async detectFeatures(config: UnraidClientConfig): Promise<{
    hasDocker: boolean;
    hasVMs: boolean;
    hasUPS: boolean;
  }> {
    // Query each feature separately - if one fails (e.g., UPS disabled), others still work
    const [hasDocker, hasVMs, hasUPS] = await Promise.all([
      this.detectDocker(config),
      this.detectVMs(config),
      this.detectUPS(config),
    ]);

    return { hasDocker, hasVMs, hasUPS };
  }

  /**
   * Detect if Docker is available
   */
  private async detectDocker(config: UnraidClientConfig): Promise<boolean> {
    const schema = z.object({
      docker: z.object({
        containers: z.array(z.unknown()).optional(),
      }).optional().nullable(),
    });

    try {
      const result = await executeQuery(
        config,
        `query { docker { containers { id } } }`,
        {},
        schema,
      );
      return result.docker !== null && result.docker !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Detect if VMs are available
   */
  private async detectVMs(config: UnraidClientConfig): Promise<boolean> {
    const schema = z.object({
      vms: z.object({
        domain: z.array(z.unknown()).optional(),
      }).optional().nullable(),
    });

    try {
      const result = await executeQuery(
        config,
        `query { vms { domain { uuid } } }`,
        {},
        schema,
      );
      return result.vms !== null && result.vms !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Detect if UPS is available (requires apcupsd to be running)
   */
  private async detectUPS(config: UnraidClientConfig): Promise<boolean> {
    const schema = z.object({
      upsDevices: z.array(z.unknown()).optional().nullable(),
    });

    try {
      const result = await executeQuery(
        config,
        `query { upsDevices { id } }`,
        {},
        schema,
      );
      return result.upsDevices !== undefined && 
             result.upsDevices !== null && 
             result.upsDevices.length > 0;
    } catch {
      // UPS query fails if apcupsd service is not running - this is expected
      return false;
    }
  }

  /**
   * Called when the driver is being unloaded
   */
  async onUninit(): Promise<void> {
    this.log('UnraidServerDriver has been uninitialized');
  }
}

module.exports = UnraidServerDriver;
