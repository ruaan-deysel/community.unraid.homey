'use strict';

import { z } from 'zod';
import https from 'https';
import http from 'http';
import {
  UnraidApiError,
  GraphQLResponseSchema,
  type ErrorCode,
} from '../schemas/errors';

/**
 * SSL/TLS modes supported by Unraid servers
 * - 'no': HTTP only, no SSL/TLS
 * - 'yes': HTTPS with self-signed certificate (skip verification)
 * - 'strict': HTTPS with valid Let's Encrypt certificate via myunraid.net
 */
export type SslMode = 'no' | 'yes' | 'strict';

/**
 * Result of SSL mode discovery
 */
export interface SslDiscoveryResult {
  /** The resolved URL to use for API requests */
  url: string;
  /** The detected SSL mode */
  sslMode: SslMode;
  /** Whether to verify SSL certificates */
  verifySsl: boolean;
  /** Whether HTTPS is used */
  useHttps: boolean;
  /** Port number */
  port: number;
}

/**
 * Options for SSL mode discovery
 */
export interface SslDiscoveryOptions {
  /** Custom HTTP port (default: 80) */
  httpPort?: number;
  /** Custom HTTPS port (default: 443) */
  httpsPort?: number;
  /** Connection timeout in ms (default: 10000) */
  timeout?: number;
}

/**
 * Configuration for the Unraid API client
 */
export interface UnraidClientConfig {
  /** Unraid server host (IP or hostname) */
  host: string;
  /** API key for authentication */
  apiKey: string;
  /** Connection timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Whether to use HTTPS (default: true) */
  useHttps?: boolean;
  /** Port number (default: 443 for HTTPS, 80 for HTTP) */
  port?: number;
  /** Allow self-signed certificates (default: true) */
  allowSelfSigned?: boolean;
  /** SSL mode (detected during pairing) */
  sslMode?: SslMode;
  /** Resolved URL from discovery (cached) */
  resolvedUrl?: string;
  /** Custom HTTP port for discovery (default: 80) */
  httpPort?: number;
  /** Custom HTTPS port for discovery (default: 443) */
  httpsPort?: number;
}

/**
 * Response from executeQuery
 */
export interface QueryResult<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

// Cache for discovered SSL settings
const sslDiscoveryCache = new Map<string, SslDiscoveryResult>();

/**
 * Create an error based on HTTP status code
 */
function createHttpError(status: number, statusText: string): UnraidApiError {
  const errorMap: Record<number, { code: ErrorCode; retryable: boolean }> = {
    401: { code: 'AUTHENTICATION_ERROR', retryable: false },
    403: { code: 'AUTHENTICATION_ERROR', retryable: false },
    404: { code: 'RESOURCE_NOT_FOUND', retryable: false },
    429: { code: 'RATE_LIMITED', retryable: true },
    500: { code: 'SERVER_ERROR', retryable: true },
    502: { code: 'SERVER_ERROR', retryable: true },
    503: { code: 'SERVER_ERROR', retryable: true },
    504: { code: 'TIMEOUT_ERROR', retryable: true },
  };
  
  const mapped = errorMap[status] ?? { code: 'UNKNOWN_ERROR' as ErrorCode, retryable: false };
  
  return new UnraidApiError({
    code: mapped.code,
    message: `HTTP ${status}: ${statusText}`,
    details: { status },
    retryable: mapped.retryable,
  });
}

/**
 * Map GraphQL error to error code
 */
function mapGraphQLErrorCode(error: { message: string; extensions?: Record<string, unknown> }): ErrorCode {
  const code = error.extensions?.code as string | undefined;
  
  const codeMap: Record<string, ErrorCode> = {
    'UNAUTHENTICATED': 'AUTHENTICATION_ERROR',
    'FORBIDDEN': 'AUTHENTICATION_ERROR',
    'NOT_FOUND': 'RESOURCE_NOT_FOUND',
    'INTERNAL_SERVER_ERROR': 'SERVER_ERROR',
    'BAD_USER_INPUT': 'VALIDATION_ERROR',
  };
  
  if (code && codeMap[code]) {
    return codeMap[code];
  }
  
  // Try to infer from message
  const message = error.message.toLowerCase();
  if (message.includes('not found')) return 'RESOURCE_NOT_FOUND';
  if (message.includes('unauthorized') || message.includes('authentication')) return 'AUTHENTICATION_ERROR';
  if (message.includes('timeout')) return 'TIMEOUT_ERROR';
  
  return 'OPERATION_FAILED';
}

/**
 * Parse a URL string into its components
 */
function parseUrl(urlString: string): { hostname: string; port: number; protocol: string; path: string } | null {
  try {
    const match = urlString.match(/^(https?):\/\/([^:/]+)(?::(\d+))?(\/.*)?$/);
    if (!match) return null;
    
    const [, protocol, hostname, portStr, path] = match;
    const defaultPort = protocol === 'https' ? 443 : 80;
    const port = portStr ? parseInt(portStr, 10) : defaultPort;
    
    return { hostname, port, protocol, path: path || '/' };
  } catch {
    return null;
  }
}

/**
 * Check if an error is SSL/certificate related
 */
function isSslError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('ssl') ||
         msg.includes('certificate') ||
         msg.includes('cert') ||
         msg.includes('unable to verify') ||
         msg.includes('self signed') ||
         msg.includes('self-signed') ||
         msg.includes('depth zero') ||
         msg.includes('unable to get local issuer');
}

/**
 * Make a simple HTTP GET request to check for redirects or connectivity
 * Returns status code, redirect location, or error
 */
function probeHttp(
  hostname: string,
  port: number,
  path: string,
  timeout: number,
): Promise<{ status: number; location?: string; error?: string }> {
  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname,
      port,
      path,
      method: 'GET',
    };
    
    let req: http.ClientRequest | null = null;
    
    // eslint-disable-next-line homey-app/global-timers
    const timeoutId = setTimeout(() => {
      if (req) req.destroy();
      resolve({ status: 0, error: 'timeout' });
    }, timeout);
    
    req = http.request(options, (res) => {
      clearTimeout(timeoutId);
      resolve({
        status: res.statusCode ?? 0,
        location: res.headers.location,
      });
      res.resume(); // Consume response to free resources
    });
    
    req.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({ status: 0, error: err.message });
    });
    
    req.end();
  });
}

/**
 * Make a simple HTTPS GET request to check connectivity
 * Returns status code or error
 */
function probeHttps(
  hostname: string,
  port: number,
  path: string,
  timeout: number,
  rejectUnauthorized: boolean,
): Promise<{ status: number; error?: string }> {
  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname,
      port,
      path,
      method: 'GET',
      rejectUnauthorized,
    };
    
    let req: http.ClientRequest | null = null;
    
    // eslint-disable-next-line homey-app/global-timers
    const timeoutId = setTimeout(() => {
      if (req) req.destroy();
      resolve({ status: 0, error: 'timeout' });
    }, timeout);
    
    req = https.request(options, (res) => {
      clearTimeout(timeoutId);
      resolve({ status: res.statusCode ?? 0 });
      res.resume(); // Consume response to free resources
    });
    
    req.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({ status: 0, error: err.message });
    });
    
    req.end();
  });
}

/**
 * Discover SSL mode for an Unraid server
 * 
 * Detection algorithm:
 * 1. Try HTTP request to httpPort (default 80)
 *    - If redirect to myunraid.net -> Strict mode (valid cert)
 *    - If redirect to HTTPS on same host -> Yes mode (self-signed)
 *    - If HTTP works (2xx/4xx response) -> No mode
 * 2. If HTTP fails, try HTTPS with cert verification on httpsPort (default 443)
 *    - If works -> Strict mode
 * 3. If HTTPS with verification fails with SSL error, try without verification
 *    - If works -> Yes mode (self-signed)
 * 
 * @param host - Server hostname or IP
 * @param options - Discovery options including custom ports and timeout
 * @returns SSL discovery result with URL and settings
 */
export async function discoverSslMode(host: string, options: SslDiscoveryOptions | number = {}): Promise<SslDiscoveryResult> {
  // Handle legacy signature where second param was timeout number
  const opts: SslDiscoveryOptions = typeof options === 'number' 
    ? { timeout: options }
    : options;
  
  const timeout = opts.timeout ?? 10000;
  const httpPort = opts.httpPort ?? 80;
  const httpsPort = opts.httpsPort ?? 443;
  
  const cleanHost = host.trim();
  
  // Create cache key that includes ports
  const cacheKey = `${cleanHost}:${httpPort}:${httpsPort}`;
  
  // Check cache first
  const cached = sslDiscoveryCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Check if host is already a myunraid.net URL (Strict mode)
  if (cleanHost === 'myunraid.net' || cleanHost.endsWith('.myunraid.net')) {
    const portSuffix = httpsPort !== 443 ? `:${httpsPort}` : '';
    const result: SslDiscoveryResult = {
      url: `https://${cleanHost}${portSuffix}/graphql`,
      sslMode: 'strict',
      verifySsl: true,
      useHttps: true,
      port: httpsPort,
    };
    sslDiscoveryCache.set(cacheKey, result);
    return result;
  }
  
  // Step 1: Try HTTP to detect redirects (common for Yes and Strict modes)
  const httpProbe = await probeHttp(cleanHost, httpPort, '/graphql', timeout);
  
  // Check for redirects
  if (httpProbe.status && [301, 302, 307, 308].includes(httpProbe.status) && httpProbe.location) {
    const parsed = parseUrl(httpProbe.location);
    if (parsed && parsed.hostname) {
      // Strict mode: redirect to myunraid.net
      if (parsed.hostname === 'myunraid.net' || parsed.hostname.endsWith('.myunraid.net')) {
        const baseUrl = `${parsed.protocol}://${parsed.hostname}${parsed.port !== 443 ? `:${parsed.port}` : ''}`;
        const result: SslDiscoveryResult = {
          url: `${baseUrl}/graphql`,
          sslMode: 'strict',
          verifySsl: true,
          useHttps: true,
          port: parsed.port,
        };
        sslDiscoveryCache.set(cleanHost, result);
        return result;
      }
      
      // Yes mode: redirect to HTTPS on same host (or any non-myunraid HTTPS)
      if (parsed.protocol === 'https') {
        const baseUrl = `${parsed.protocol}://${parsed.hostname}${parsed.port !== 443 ? `:${parsed.port}` : ''}`;
        const result: SslDiscoveryResult = {
          url: `${baseUrl}/graphql`,
          sslMode: 'yes',
          verifySsl: false, // Self-signed certificate
          useHttps: true,
          port: parsed.port,
        };
        sslDiscoveryCache.set(cleanHost, result);
        return result;
      }
    }
  }
  
  // No mode: HTTP responded without redirect (2xx, 4xx, or 5xx means endpoint is accessible)
  if (httpProbe.status && httpProbe.status >= 200) {
    const portSuffix = httpPort !== 80 ? `:${httpPort}` : '';
    const result: SslDiscoveryResult = {
      url: `http://${cleanHost}${portSuffix}/graphql`,
      sslMode: 'no',
      verifySsl: false,
      useHttps: false,
      port: httpPort,
    };
    sslDiscoveryCache.set(cacheKey, result);
    return result;
  }
  
  // Step 2: HTTP failed, try HTTPS with certificate verification (Strict mode check)
  const httpsStrictProbe = await probeHttps(cleanHost, httpsPort, '/graphql', timeout, true);
  
  if (httpsStrictProbe.status && httpsStrictProbe.status >= 200) {
    // HTTPS with valid cert works - this could be Strict mode or a custom setup
    const portSuffix = httpsPort !== 443 ? `:${httpsPort}` : '';
    const result: SslDiscoveryResult = {
      url: `https://${cleanHost}${portSuffix}/graphql`,
      sslMode: 'strict',
      verifySsl: true,
      useHttps: true,
      port: httpsPort,
    };
    sslDiscoveryCache.set(cacheKey, result);
    return result;
  }
  
  // Step 3: HTTPS with verification failed - check if it's a cert error (Yes mode)
  if (httpsStrictProbe.error && isSslError(new Error(httpsStrictProbe.error))) {
    // Try without certificate verification
    const httpsSelfSignedProbe = await probeHttps(cleanHost, httpsPort, '/graphql', timeout, false);
    
    if (httpsSelfSignedProbe.status && httpsSelfSignedProbe.status >= 200) {
      // HTTPS works with self-signed cert - Yes mode
      const portSuffix = httpsPort !== 443 ? `:${httpsPort}` : '';
      const result: SslDiscoveryResult = {
        url: `https://${cleanHost}${portSuffix}/graphql`,
        sslMode: 'yes',
        verifySsl: false,
        useHttps: true,
        port: httpsPort,
      };
      sslDiscoveryCache.set(cacheKey, result);
      return result;
    }
  }
  
  // Default fallback: assume HTTPS with self-signed (most common Unraid setup)
  const portSuffix = httpsPort !== 443 ? `:${httpsPort}` : '';
  const result: SslDiscoveryResult = {
    url: `https://${cleanHost}${portSuffix}/graphql`,
    sslMode: 'yes',
    verifySsl: false,
    useHttps: true,
    port: httpsPort,
  };
  sslDiscoveryCache.set(cacheKey, result);
  return result;
}

/**
 * Clear the SSL discovery cache for a specific host or all hosts
 * When clearing for a specific host, removes all entries matching that host
 * regardless of port configuration
 */
export function clearSslDiscoveryCache(host?: string): void {
  if (host) {
    const cleanHost = host.trim();
    // Remove all cache entries that start with this host
    // Cache keys are in format "host:httpPort:httpsPort"
    for (const key of sslDiscoveryCache.keys()) {
      if (key === cleanHost || key.startsWith(`${cleanHost}:`)) {
        sslDiscoveryCache.delete(key);
      }
    }
  } else {
    sslDiscoveryCache.clear();
  }
}

/**
 * Make an HTTP/HTTPS request
 */
function makeHttpRequest(
  url: string,
  body: string,
  apiKey: string,
  timeout: number,
  allowSelfSigned: boolean,
): Promise<{ status: number; statusText: string; body: string; redirectUrl?: string }> {
  return new Promise((resolve, reject) => {
    const parsed = parseUrl(url);
    if (!parsed) {
      reject(new Error(`Invalid URL: ${url}`));
      return;
    }
    
    const { hostname, port, protocol, path } = parsed;
    const useHttps = protocol === 'https';
    
    const options: https.RequestOptions = {
      hostname,
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    
    if (useHttps && allowSelfSigned) {
      options.rejectUnauthorized = false;
    }
    
    const protocolModule = useHttps ? https : http;
    
    let req: http.ClientRequest | null = null;
    
    // eslint-disable-next-line homey-app/global-timers
    const timeoutId = setTimeout(() => {
      if (req) req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms`));
    }, timeout);
    
    req = protocolModule.request(options, (res) => {
      // Handle redirects
      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode)) {
        clearTimeout(timeoutId);
        const { location } = res.headers;
        if (location) {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage ?? 'Redirect',
            body: '',
            redirectUrl: location,
          });
          return;
        }
      }
      
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        clearTimeout(timeoutId);
        resolve({
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          body: data,
        });
      });
      
      res.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
    
    req.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
    
    req.write(body);
    req.end();
  });
}

/**
 * Execute a GraphQL query against the Unraid API
 * 
 * @param config - Client configuration
 * @param query - GraphQL query string
 * @param variables - Optional query variables
 * @param schema - Zod schema for response validation
 * @returns Validated response data
 * @throws UnraidApiError on failure
 */
export async function executeQuery<T>(
  config: UnraidClientConfig,
  query: string,
  variables: Record<string, unknown> = {},
  schema: z.ZodType<T>,
): Promise<T> {
  const timeout = config.timeout ?? 10000;
  const body = JSON.stringify({ query, variables });
  
  // Validate host is present
  if (!config.host || config.host.trim() === '') {
    throw new UnraidApiError({
      code: 'VALIDATION_ERROR',
      message: 'Host is required but was empty',
      retryable: false,
    });
  }
  
  const host = config.host.trim();
  
  // Determine SSL settings - use provided config or discover
  let resolvedUrl: string;
  let allowSelfSigned: boolean;
  
  if (config.resolvedUrl) {
    // Use pre-configured URL from pairing
    resolvedUrl = config.resolvedUrl;
    // If sslMode is 'strict', verify certs; otherwise allow self-signed
    allowSelfSigned = config.sslMode !== 'strict';
  } else {
    // Discover SSL mode
    const sslSettings = await discoverSslMode(host, timeout);
    resolvedUrl = sslSettings.url;
    allowSelfSigned = !sslSettings.verifySsl;
  }
  
  // Final validation of the URL
  const parsedUrl = parseUrl(resolvedUrl);
  if (!parsedUrl || !parsedUrl.hostname) {
    throw new UnraidApiError({
      code: 'VALIDATION_ERROR',
      message: `Invalid URL constructed: ${resolvedUrl}. Host: ${host}`,
      retryable: false,
    });
  }
  
  try {
    let response = await makeHttpRequest(resolvedUrl, body, config.apiKey, timeout, allowSelfSigned);
    
    // Handle additional redirects
    let redirectCount = 0;
    const MAX_REDIRECTS = 5;
    while (response.redirectUrl && redirectCount < MAX_REDIRECTS) {
      redirectCount++;
      // Update resolved URL
      const parsed = parseUrl(response.redirectUrl);
      if (parsed) {
        resolvedUrl = response.redirectUrl;
      }
      response = await makeHttpRequest(response.redirectUrl, body, config.apiKey, timeout, allowSelfSigned);
    }
    
    if (response.status < 200 || response.status >= 300) {
      throw createHttpError(response.status, response.statusText);
    }
    
    let json: unknown;
    try {
      json = JSON.parse(response.body);
    } catch {
      throw new UnraidApiError({
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON response from server',
        details: { body: response.body.substring(0, 200) },
        retryable: false,
      });
    }
    
    // Validate GraphQL response structure
    const graphqlResponse = GraphQLResponseSchema(schema).safeParse(json);
    
    if (!graphqlResponse.success) {
      throw new UnraidApiError({
        code: 'VALIDATION_ERROR',
        message: 'Invalid response format from server',
        details: { zodIssues: graphqlResponse.error.issues },
        retryable: false,
      });
    }
    
    // Check for GraphQL errors
    if (graphqlResponse.data.errors?.length) {
      const firstError = graphqlResponse.data.errors[0];
      throw new UnraidApiError({
        code: mapGraphQLErrorCode(firstError),
        message: firstError.message,
        details: { graphqlErrors: graphqlResponse.data.errors },
        retryable: false,
      });
    }
    
    // Return validated data
    if (graphqlResponse.data.data === null) {
      throw new UnraidApiError({
        code: 'SERVER_ERROR',
        message: 'Server returned null data',
        retryable: true,
      });
    }
    
    return graphqlResponse.data.data;
    
  } catch (error) {
    if (error instanceof UnraidApiError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.message.includes('timed out')) {
        throw new UnraidApiError({
          code: 'TIMEOUT_ERROR',
          message: error.message,
          retryable: true,
        });
      }
      
      if (error.message.includes('ECONNREFUSED')) {
        throw new UnraidApiError({
          code: 'CONNECTION_ERROR',
          message: `Connection refused - is the server running at ${config.host}?`,
          retryable: true,
        });
      }
      
      if (error.message.includes('ENOTFOUND') || error.message.includes('EAI_AGAIN')) {
        throw new UnraidApiError({
          code: 'CONNECTION_ERROR',
          message: `Could not resolve hostname: ${config.host}`,
          retryable: true,
        });
      }
      
      throw new UnraidApiError({
        code: 'CONNECTION_ERROR',
        message: error.message,
        retryable: true,
      });
    }
    
    throw new UnraidApiError({
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
      retryable: false,
    });
  }
}

/**
 * Test connection to Unraid server
 */
export async function testConnection(config: UnraidClientConfig): Promise<boolean> {
  const testQuery = `query { online }`;
  const testSchema = z.object({
    online: z.boolean(),
  });
  
  try {
    const result = await executeQuery(config, testQuery, {}, testSchema);
    return result.online;
  } catch {
    return false;
  }
}

/**
 * Test connection and return detailed result
 */
export async function testConnectionDetailed(config: UnraidClientConfig): Promise<{ 
  success: boolean; 
  error?: string;
}> {
  const testQuery = `query { online }`;
  const testSchema = z.object({
    online: z.boolean(),
  });
  
  try {
    const result = await executeQuery(config, testQuery, {}, testSchema);
    if (!result.online) {
      return {
        success: false,
        error: 'Server reports offline status',
      };
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { 
      success: false, 
      error: message,
    };
  }
}

/**
 * Clear the redirect URL cache (useful for testing or reconnection)
 * @deprecated Use clearSslDiscoveryCache instead
 */
export function clearRedirectCache(): void {
  sslDiscoveryCache.clear();
}

// =============================================================================
// Docker Container Mutations
// =============================================================================

/**
 * Start a Docker container
 */
export async function startContainer(
  config: UnraidClientConfig,
  containerId: string
): Promise<{ id: string; state: string }> {
  const mutation = `
    mutation StartContainer($id: ID!) {
      dockerContainerStart(id: $id) {
        id
        state
      }
    }
  `;
  const schema = z.object({
    dockerContainerStart: z.object({
      id: z.string(),
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, { id: containerId }, schema);
  return result.dockerContainerStart;
}

/**
 * Stop a Docker container
 */
export async function stopContainer(
  config: UnraidClientConfig,
  containerId: string
): Promise<{ id: string; state: string }> {
  const mutation = `
    mutation StopContainer($id: ID!) {
      dockerContainerStop(id: $id) {
        id
        state
      }
    }
  `;
  const schema = z.object({
    dockerContainerStop: z.object({
      id: z.string(),
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, { id: containerId }, schema);
  return result.dockerContainerStop;
}

/**
 * Restart a Docker container
 */
export async function restartContainer(
  config: UnraidClientConfig,
  containerId: string
): Promise<{ id: string; state: string }> {
  const mutation = `
    mutation RestartContainer($id: ID!) {
      dockerContainerRestart(id: $id) {
        id
        state
      }
    }
  `;
  const schema = z.object({
    dockerContainerRestart: z.object({
      id: z.string(),
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, { id: containerId }, schema);
  return result.dockerContainerRestart;
}

// =============================================================================
// VM Mutations
// =============================================================================

/**
 * Start a VM
 */
export async function startVM(
  config: UnraidClientConfig,
  vmId: string
): Promise<{ id: string; state: string }> {
  const mutation = `
    mutation StartVM($id: ID!) {
      vmStart(id: $id) {
        id
        state
      }
    }
  `;
  const schema = z.object({
    vmStart: z.object({
      id: z.string(),
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, { id: vmId }, schema);
  return result.vmStart;
}

/**
 * Stop a VM
 */
export async function stopVM(
  config: UnraidClientConfig,
  vmId: string
): Promise<{ id: string; state: string }> {
  const mutation = `
    mutation StopVM($id: ID!) {
      vmStop(id: $id) {
        id
        state
      }
    }
  `;
  const schema = z.object({
    vmStop: z.object({
      id: z.string(),
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, { id: vmId }, schema);
  return result.vmStop;
}

// =============================================================================
// Array Mutations
// =============================================================================

/**
 * Start the array
 */
export async function startArray(
  config: UnraidClientConfig
): Promise<{ state: string }> {
  const mutation = `
    mutation StartArray {
      arrayAction(action: START) {
        state
      }
    }
  `;
  const schema = z.object({
    arrayAction: z.object({
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, {}, schema);
  return result.arrayAction;
}

/**
 * Stop the array
 */
export async function stopArray(
  config: UnraidClientConfig
): Promise<{ state: string }> {
  const mutation = `
    mutation StopArray {
      arrayAction(action: STOP) {
        state
      }
    }
  `;
  const schema = z.object({
    arrayAction: z.object({
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, {}, schema);
  return result.arrayAction;
}

// =============================================================================
// Parity Check Mutations
// =============================================================================

/**
 * Start a parity check
 */
export async function startParityCheck(
  config: UnraidClientConfig,
  correct: boolean = false
): Promise<{ state: string }> {
  const mutation = `
    mutation StartParityCheck($correct: Boolean!) {
      parityCheckStart(correct: $correct) {
        state
      }
    }
  `;
  const schema = z.object({
    parityCheckStart: z.object({
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, { correct }, schema);
  return result.parityCheckStart;
}

/**
 * Pause a parity check
 */
export async function pauseParityCheck(
  config: UnraidClientConfig
): Promise<{ state: string }> {
  const mutation = `
    mutation PauseParityCheck {
      parityCheckPause {
        state
      }
    }
  `;
  const schema = z.object({
    parityCheckPause: z.object({
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, {}, schema);
  return result.parityCheckPause;
}

/**
 * Resume a parity check
 */
export async function resumeParityCheck(
  config: UnraidClientConfig
): Promise<{ state: string }> {
  const mutation = `
    mutation ResumeParityCheck {
      parityCheckResume {
        state
      }
    }
  `;
  const schema = z.object({
    parityCheckResume: z.object({
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, {}, schema);
  return result.parityCheckResume;
}

/**
 * Cancel a parity check
 */
export async function cancelParityCheck(
  config: UnraidClientConfig
): Promise<{ state: string }> {
  const mutation = `
    mutation CancelParityCheck {
      parityCheckCancel {
        state
      }
    }
  `;
  const schema = z.object({
    parityCheckCancel: z.object({
      state: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, {}, schema);
  return result.parityCheckCancel;
}

// =============================================================================
// Disk Mutations
// =============================================================================

/**
 * Spin up a disk
 */
export async function spinUpDisk(
  config: UnraidClientConfig,
  diskName: string
): Promise<{ name: string; status: string }> {
  const mutation = `
    mutation SpinUpDisk($name: String!) {
      diskSpinUp(name: $name) {
        name
        status
      }
    }
  `;
  const schema = z.object({
    diskSpinUp: z.object({
      name: z.string(),
      status: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, { name: diskName }, schema);
  return result.diskSpinUp;
}

/**
 * Spin down a disk
 */
export async function spinDownDisk(
  config: UnraidClientConfig,
  diskName: string
): Promise<{ name: string; status: string }> {
  const mutation = `
    mutation SpinDownDisk($name: String!) {
      diskSpinDown(name: $name) {
        name
        status
      }
    }
  `;
  const schema = z.object({
    diskSpinDown: z.object({
      name: z.string(),
      status: z.string(),
    }),
  });
  const result = await executeQuery(config, mutation, { name: diskName }, schema);
  return result.diskSpinDown;
}
