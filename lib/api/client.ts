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
}

/**
 * Response from executeQuery
 */
export interface QueryResult<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

// Cache for discovered redirect URLs
const redirectUrlCache = new Map<string, string>();

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
 * Discover redirect URL by making HTTP request to port 80
 * Unraid often redirects HTTP -> myunraid.net cloud URL
 */
function discoverRedirectUrl(host: string, timeout: number): Promise<string | null> {
  return new Promise((resolve) => {
    // Skip if host is empty
    if (!host || host.trim() === '') {
      resolve(null);
      return;
    }
    
    const options: http.RequestOptions = {
      hostname: host.trim(),
      port: 80,
      path: '/graphql',
      method: 'GET',
    };
    
    let req: http.ClientRequest | null = null;
    
    // eslint-disable-next-line homey-app/global-timers
    const timeoutId = setTimeout(() => {
      if (req) req.destroy();
      resolve(null);
    }, timeout);
    
    req = http.request(options, (res) => {
      clearTimeout(timeoutId);
      
      // Check for redirect
      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode)) {
        const { location } = res.headers;
        if (location) {
          // Validate the redirect URL is parseable and has a hostname
          const parsed = parseUrl(location);
          if (parsed && parsed.hostname && parsed.hostname.length > 0) {
            // Check if it's a myunraid.net URL
            if (parsed.hostname === 'myunraid.net' || parsed.hostname.endsWith('.myunraid.net')) {
              resolve(location);
              return;
            }
          }
        }
      }
      
      resolve(null);
    });
    
    req.on('error', () => {
      clearTimeout(timeoutId);
      resolve(null);
    });
    
    req.end();
  });
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
  const allowSelfSigned = config.allowSelfSigned !== false;
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
  
  // Check cache for redirect URL
  const cacheKey = host;
  let resolvedUrl = redirectUrlCache.get(cacheKey);
  
  // If no cached URL, try to discover redirect
  if (!resolvedUrl) {
    const redirectUrl = await discoverRedirectUrl(host, timeout);
    if (redirectUrl) {
      // Remove trailing path if present and add /graphql
      const parsed = parseUrl(redirectUrl);
      if (parsed) {
        const baseUrl = `${parsed.protocol}://${parsed.hostname}${parsed.port !== 443 && parsed.port !== 80 ? `:${parsed.port}` : ''}`;
        resolvedUrl = `${baseUrl}/graphql`;
        redirectUrlCache.set(cacheKey, resolvedUrl);
      }
    }
    
    // If no redirect found, use direct URL
    if (!resolvedUrl) {
      const useHttps = config.useHttps !== false;
      const protocol = useHttps ? 'https' : 'http';
      const defaultPort = useHttps ? 443 : 80;
      const port = config.port ?? defaultPort;
      const portSuffix = (port === 443 && useHttps) || (port === 80 && !useHttps) ? '' : `:${port}`;
      resolvedUrl = `${protocol}://${host}${portSuffix}/graphql`;
    }
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
      // Update cache with new redirect URL
      const parsed = parseUrl(response.redirectUrl);
      if (parsed) {
        resolvedUrl = response.redirectUrl;
        redirectUrlCache.set(cacheKey, resolvedUrl);
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
 */
export function clearRedirectCache(): void {
  redirectUrlCache.clear();
}

// ========================================================================
// Mutation Schemas
// ========================================================================

/**
 * Schema for container mutation response
 */
const ContainerMutationSchema = z.object({
  docker: z.object({
    start: z.object({
      id: z.string(),
      state: z.string(),
      status: z.string(),
    }).optional(),
    stop: z.object({
      id: z.string(),
      state: z.string(),
      status: z.string(),
    }).optional(),
    restart: z.object({
      id: z.string(),
      state: z.string(),
      status: z.string(),
    }).optional(),
  }),
});

/**
 * Schema for VM mutation response
 */
const VMMutationSchema = z.object({
  vm: z.object({
    start: z.boolean().optional(),
    stop: z.boolean().optional(),
  }),
});

/**
 * Schema for array mutation response
 */
const ArrayMutationSchema = z.object({
  array: z.object({
    setState: z.object({
      id: z.string(),
      state: z.string(),
    }),
  }),
});

/**
 * Schema for parity check mutation response
 */
const ParityCheckMutationSchema = z.object({
  parityCheck: z.object({
    start: z.boolean().optional(),
    pause: z.boolean().optional(),
    resume: z.boolean().optional(),
    cancel: z.boolean().optional(),
  }),
});

/**
 * Schema for disk spin mutation response
 */
const DiskSpinMutationSchema = z.object({
  disk: z.object({
    spinUp: z.boolean().optional(),
    spinDown: z.boolean().optional(),
  }),
});

// ========================================================================
// Container Control Functions
// ========================================================================

/**
 * Start a Docker container
 * @param config - Client configuration
 * @param containerId - Container ID to start
 * @returns Container state after starting
 */
export async function startContainer(
  config: UnraidClientConfig,
  containerId: string,
): Promise<{ id: string; state: string; status: string }> {
  const mutation = `
    mutation StartContainer($id: PrefixedID!) {
      docker {
        start(id: $id) {
          id
          state
          status
        }
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    { id: containerId },
    ContainerMutationSchema,
  );

  if (!result.docker.start) {
    throw new UnraidApiError({
      code: 'OPERATION_FAILED',
      message: 'Failed to start container - no response data',
      retryable: false,
    });
  }

  return result.docker.start;
}

/**
 * Stop a Docker container
 * @param config - Client configuration
 * @param containerId - Container ID to stop
 * @returns Container state after stopping
 */
export async function stopContainer(
  config: UnraidClientConfig,
  containerId: string,
): Promise<{ id: string; state: string; status: string }> {
  const mutation = `
    mutation StopContainer($id: PrefixedID!) {
      docker {
        stop(id: $id) {
          id
          state
          status
        }
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    { id: containerId },
    ContainerMutationSchema,
  );

  if (!result.docker.stop) {
    throw new UnraidApiError({
      code: 'OPERATION_FAILED',
      message: 'Failed to stop container - no response data',
      retryable: false,
    });
  }

  return result.docker.stop;
}

/**
 * Restart a Docker container
 * @param config - Client configuration
 * @param containerId - Container ID to restart
 * @returns Container state after restarting
 */
export async function restartContainer(
  config: UnraidClientConfig,
  containerId: string,
): Promise<{ id: string; state: string; status: string }> {
  const mutation = `
    mutation RestartContainer($id: PrefixedID!) {
      docker {
        restart(id: $id) {
          id
          state
          status
        }
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    { id: containerId },
    ContainerMutationSchema,
  );

  if (!result.docker.restart) {
    throw new UnraidApiError({
      code: 'OPERATION_FAILED',
      message: 'Failed to restart container - no response data',
      retryable: false,
    });
  }

  return result.docker.restart;
}

// ========================================================================
// VM Control Functions
// ========================================================================

/**
 * Start a Virtual Machine
 * @param config - Client configuration
 * @param vmId - VM ID to start
 * @returns Success boolean
 */
export async function startVM(
  config: UnraidClientConfig,
  vmId: string,
): Promise<boolean> {
  const mutation = `
    mutation StartVM($id: PrefixedID!) {
      vm {
        start(id: $id)
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    { id: vmId },
    VMMutationSchema,
  );

  return result.vm.start === true;
}

/**
 * Stop a Virtual Machine
 * @param config - Client configuration
 * @param vmId - VM ID to stop
 * @returns Success boolean
 */
export async function stopVM(
  config: UnraidClientConfig,
  vmId: string,
): Promise<boolean> {
  const mutation = `
    mutation StopVM($id: PrefixedID!) {
      vm {
        stop(id: $id)
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    { id: vmId },
    VMMutationSchema,
  );

  return result.vm.stop === true;
}

// ========================================================================
// Array Control Functions
// ========================================================================

/**
 * Start the Unraid array
 * WARNING: This is a critical system operation
 * @param config - Client configuration
 * @returns Array state after starting
 */
export async function startArray(
  config: UnraidClientConfig,
): Promise<{ id: string; state: string }> {
  const mutation = `
    mutation StartArray {
      array {
        setState(input: { desiredState: START }) {
          id
          state
        }
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    {},
    ArrayMutationSchema,
  );

  return result.array.setState;
}

/**
 * Stop the Unraid array
 * WARNING: This is a critical system operation that will stop all containers and VMs using array storage
 * @param config - Client configuration
 * @returns Array state after stopping
 */
export async function stopArray(
  config: UnraidClientConfig,
): Promise<{ id: string; state: string }> {
  const mutation = `
    mutation StopArray {
      array {
        setState(input: { desiredState: STOP }) {
          id
          state
        }
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    {},
    ArrayMutationSchema,
  );

  return result.array.setState;
}

// ========================================================================
// Parity Check Control Functions
// ========================================================================

/**
 * Start a parity check
 * @param config - Client configuration
 * @param correct - If true, write corrections to parity. If false, only check (read-only)
 * @returns Success boolean
 */
export async function startParityCheck(
  config: UnraidClientConfig,
  correct = false,
): Promise<boolean> {
  const mutation = `
    mutation StartParityCheck($correct: Boolean!) {
      parityCheck {
        start(correct: $correct)
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    { correct },
    ParityCheckMutationSchema,
  );

  return result.parityCheck.start === true;
}

/**
 * Pause a running parity check
 * @param config - Client configuration
 * @returns Success boolean
 */
export async function pauseParityCheck(
  config: UnraidClientConfig,
): Promise<boolean> {
  const mutation = `
    mutation PauseParityCheck {
      parityCheck {
        pause
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    {},
    ParityCheckMutationSchema,
  );

  return result.parityCheck.pause === true;
}

/**
 * Resume a paused parity check
 * @param config - Client configuration
 * @returns Success boolean
 */
export async function resumeParityCheck(
  config: UnraidClientConfig,
): Promise<boolean> {
  const mutation = `
    mutation ResumeParityCheck {
      parityCheck {
        resume
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    {},
    ParityCheckMutationSchema,
  );

  return result.parityCheck.resume === true;
}

/**
 * Cancel/stop a running parity check
 * @param config - Client configuration
 * @returns Success boolean
 */
export async function cancelParityCheck(
  config: UnraidClientConfig,
): Promise<boolean> {
  const mutation = `
    mutation CancelParityCheck {
      parityCheck {
        cancel
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    {},
    ParityCheckMutationSchema,
  );

  return result.parityCheck.cancel === true;
}

// ========================================================================
// Disk Control Functions
// ========================================================================

/**
 * Spin up a disk
 * @param config - Client configuration
 * @param diskId - Disk ID to spin up
 * @returns Success boolean
 */
export async function spinUpDisk(
  config: UnraidClientConfig,
  diskId: string,
): Promise<boolean> {
  const mutation = `
    mutation SpinUpDisk($id: String!) {
      disk {
        spinUp(id: $id)
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    { id: diskId },
    DiskSpinMutationSchema,
  );

  return result.disk.spinUp === true;
}

/**
 * Spin down a disk
 * @param config - Client configuration
 * @param diskId - Disk ID to spin down
 * @returns Success boolean
 */
export async function spinDownDisk(
  config: UnraidClientConfig,
  diskId: string,
): Promise<boolean> {
  const mutation = `
    mutation SpinDownDisk($id: String!) {
      disk {
        spinDown(id: $id)
      }
    }
  `;

  const result = await executeQuery(
    config,
    mutation,
    { id: diskId },
    DiskSpinMutationSchema,
  );

  return result.disk.spinDown === true;
}
