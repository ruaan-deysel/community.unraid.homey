'use strict';

import Homey from 'homey';
import { executeQuery, type UnraidClientConfig } from '../../lib/api/client';
import { z } from 'zod';

/**
 * Data stored during pairing process
 */
interface PairingData {
  host: string;
  apiKey: string;
  serverInfo?: {
    hostname: string;
    version: string;
    uptime: number;
  };
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

    // Handle login from login_credentials template
    // username = host, password = apiKey
    session.setHandler('login', async (data: { username: string; password: string }) => {
      this.log('Login handler called');
      this.log('Host (username):', data.username);
      
      pairingData.host = data.username;
      pairingData.apiKey = data.password;

      if (!pairingData.host) {
        throw new Error('Server address is required');
      }
      
      if (!pairingData.apiKey) {
        throw new Error('API key is required');
      }

      const config: UnraidClientConfig = {
        host: pairingData.host,
        apiKey: pairingData.apiKey,
        timeout: 15000,
        allowSelfSigned: true,
      };

      try {
        this.log('Testing connection to', pairingData.host);
        const serverInfo = await this.fetchServerInfo(config);
        pairingData.serverInfo = serverInfo;
        this.log('Connection successful! Server:', serverInfo.hostname, 'Version:', serverInfo.version);
        
        // Return true to indicate login was successful
        return true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        this.error('Connection failed:', errorMsg);
        throw new Error(`Could not connect to Unraid server: ${errorMsg}`);
      }
    });

    // Handle list_devices view - return the device based on verified connection
    session.setHandler('list_devices', async () => {
      this.log('list_devices handler called');
      this.log('Creating device for host:', pairingData.host);

      if (!pairingData.host) {
        this.error('Host is empty in list_devices!');
        throw new Error('No server configured. Please go back and enter your server details.');
      }

      const hostname = pairingData.serverInfo?.hostname || pairingData.host;

      const device = {
        name: `Unraid: ${hostname}`,
        data: {
          id: `unraid-${pairingData.host.replace(/\./g, '-')}`,
        } as { id: string },
        store: {
          apiKey: pairingData.apiKey,
        } as StoreData,
        settings: {
          host: pairingData.host,
        } as DeviceData,
      };

      this.log('Returning device:', device.name);
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
   * Called when the driver is being unloaded
   */
  async onUninit(): Promise<void> {
    this.log('UnraidServerDriver has been uninitialized');
  }
}

module.exports = UnraidServerDriver;
