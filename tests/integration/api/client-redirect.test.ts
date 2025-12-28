'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeQuery, type UnraidClientConfig } from '../../../lib/api/client';
import { z } from 'zod';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Note: The API client uses `redirect: 'follow'` in fetch options,
 * which means redirects are handled automatically by the fetch API.
 * These tests verify that:
 * 1. The redirect option is passed correctly
 * 2. When fetch automatically follows redirects, the final response is processed correctly
 */
describe('API Client - Redirect Handling', () => {
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

  it('should pass redirect: follow option to fetch', async () => {
    const mockResponse = {
      info: {
        os: {
          hostname: 'tower',
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockResponse }),
    });

    await executeQuery(
      config,
      'query { info { os { hostname } } }',
      {},
      mockResponseSchema,
    );

    // Verify fetch was called with redirect: 'follow'
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        redirect: 'follow',
      }),
    );
  });

  it('should successfully process response after automatic redirect', async () => {
    // When fetch follows a redirect automatically, we only see the final response
    const mockResponse = {
      info: {
        os: {
          hostname: 'tower',
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      // response.redirected would be true after a redirect, but we don't check it
      json: () => Promise.resolve({ data: mockResponse }),
    });

    const result = await executeQuery(
      config,
      'query { info { os { hostname } } }',
      {},
      mockResponseSchema,
    );

    expect(result.info.os.hostname).toBe('tower');
  });

  it('should use HTTPS URL by default', async () => {
    const mockResponse = {
      info: {
        os: {
          hostname: 'tower',
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockResponse }),
    });

    await executeQuery(config, 'query { }', {}, mockResponseSchema);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://192.168.1.100/graphql',
      expect.any(Object),
    );
  });

  it('should use HTTP URL when useHttps is false', async () => {
    const httpConfig: UnraidClientConfig = {
      ...config,
      useHttps: false,
    };

    const mockResponse = {
      info: {
        os: {
          hostname: 'tower',
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockResponse }),
    });

    await executeQuery(httpConfig, 'query { }', {}, mockResponseSchema);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://192.168.1.100/graphql',
      expect.any(Object),
    );
  });

  it('should include authorization header for API key authentication', async () => {
    const mockResponse = {
      info: {
        os: {
          hostname: 'tower',
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockResponse }),
    });

    await executeQuery(config, 'query { }', {}, mockResponseSchema);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
        }),
      }),
    );
  });

  it('should include custom port in URL when specified', async () => {
    const customPortConfig: UnraidClientConfig = {
      ...config,
      port: 8443,
    };

    const mockResponse = {
      info: {
        os: {
          hostname: 'tower',
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockResponse }),
    });

    await executeQuery(customPortConfig, 'query { }', {}, mockResponseSchema);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://192.168.1.100:8443/graphql',
      expect.any(Object),
    );
  });

  it('should omit standard HTTPS port 443 from URL', async () => {
    const standardPortConfig: UnraidClientConfig = {
      ...config,
      port: 443,
    };

    const mockResponse = {
      info: {
        os: {
          hostname: 'tower',
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockResponse }),
    });

    await executeQuery(standardPortConfig, 'query { }', {}, mockResponseSchema);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://192.168.1.100/graphql',
      expect.any(Object),
    );
  });

  it('should omit standard HTTP port 80 from URL', async () => {
    const httpConfig: UnraidClientConfig = {
      ...config,
      useHttps: false,
      port: 80,
    };

    const mockResponse = {
      info: {
        os: {
          hostname: 'tower',
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockResponse }),
    });

    await executeQuery(httpConfig, 'query { }', {}, mockResponseSchema);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://192.168.1.100/graphql',
      expect.any(Object),
    );
  });
});
