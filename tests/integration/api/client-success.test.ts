'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeQuery, testConnection, type UnraidClientConfig } from '../../../lib/api/client';
import { z } from 'zod';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Client - Success Scenarios', () => {
  const config: UnraidClientConfig = {
    host: '192.168.1.100',
    apiKey: 'test-api-key',
    timeout: 5000,
  };

  const mockResponseSchema = z.object({
    info: z.object({
      os: z.object({
        hostname: z.string(),
      }),
    }),
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute a successful GraphQL query', async () => {
    const mockData = {
      data: {
        info: {
          os: {
            hostname: 'unraid-tower',
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await executeQuery(
      config,
      'query { info { os { hostname } } }',
      {},
      mockResponseSchema,
    );

    expect(result.info.os.hostname).toBe('unraid-tower');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://192.168.1.100/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-api-key',
        },
      }),
    );
  });

  it('should include variables in the request', async () => {
    const mockData = {
      data: {
        info: {
          os: {
            hostname: 'test-server',
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    await executeQuery(
      config,
      'query TestQuery($id: ID!) { info { os { hostname } } }',
      { id: '123' },
      mockResponseSchema,
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.variables).toEqual({ id: '123' });
  });

  it('should use HTTP when useHttps is false', async () => {
    const httpConfig: UnraidClientConfig = {
      ...config,
      useHttps: false,
      port: 80,
    };

    const mockData = {
      data: {
        info: {
          os: {
            hostname: 'test-server',
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    await executeQuery(
      httpConfig,
      'query { info { os { hostname } } }',
      {},
      mockResponseSchema,
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'http://192.168.1.100/graphql',
      expect.anything(),
    );
  });

  it('should include custom port in URL', async () => {
    const customPortConfig: UnraidClientConfig = {
      ...config,
      port: 8443,
    };

    const mockData = {
      data: {
        info: {
          os: {
            hostname: 'test-server',
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    await executeQuery(
      customPortConfig,
      'query { info { os { hostname } } }',
      {},
      mockResponseSchema,
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://192.168.1.100:8443/graphql',
      expect.anything(),
    );
  });

  it('testConnection should return true for successful connection', async () => {
    const mockData = {
      data: {
        info: {
          os: {
            hostname: 'unraid-tower',
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await testConnection(config);
    expect(result).toBe(true);
  });

  it('testConnection should return false for failed connection', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await testConnection(config);
    expect(result).toBe(false);
  });
});
