'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeQuery, type UnraidClientConfig } from '../../../lib/api/client';
import { UnraidApiError } from '../../../lib/schemas/errors';
import { z } from 'zod';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Client - Error Scenarios', () => {
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

  it('should throw AUTHENTICATION_ERROR for 401 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    try {
      await executeQuery(config, 'query { info { os { hostname } } }', {}, mockResponseSchema);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnraidApiError);
      expect((error as UnraidApiError).code).toBe('AUTHENTICATION_ERROR');
      expect((error as UnraidApiError).retryable).toBe(false);
    }
  });

  it('should throw AUTHENTICATION_ERROR for 403 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    try {
      await executeQuery(config, 'query { }', {}, mockResponseSchema);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnraidApiError);
      expect((error as UnraidApiError).code).toBe('AUTHENTICATION_ERROR');
    }
  });

  it('should throw RESOURCE_NOT_FOUND for 404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    try {
      await executeQuery(config, 'query { }', {}, mockResponseSchema);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnraidApiError);
      expect((error as UnraidApiError).code).toBe('RESOURCE_NOT_FOUND');
    }
  });

  it('should throw RATE_LIMITED for 429 response with retryable=true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    try {
      await executeQuery(config, 'query { }', {}, mockResponseSchema);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnraidApiError);
      expect((error as UnraidApiError).code).toBe('RATE_LIMITED');
      expect((error as UnraidApiError).retryable).toBe(true);
    }
  });

  it('should throw SERVER_ERROR for 500 response with retryable=true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    try {
      await executeQuery(config, 'query { }', {}, mockResponseSchema);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnraidApiError);
      expect((error as UnraidApiError).code).toBe('SERVER_ERROR');
      expect((error as UnraidApiError).retryable).toBe(true);
    }
  });

  it('should throw TIMEOUT_ERROR for 504 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 504,
      statusText: 'Gateway Timeout',
    });

    try {
      await executeQuery(config, 'query { }', {}, mockResponseSchema);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnraidApiError);
      expect((error as UnraidApiError).code).toBe('TIMEOUT_ERROR');
    }
  });

  it('should throw CONNECTION_ERROR for network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    try {
      await executeQuery(config, 'query { }', {}, mockResponseSchema);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnraidApiError);
      expect((error as UnraidApiError).code).toBe('CONNECTION_ERROR');
      expect((error as UnraidApiError).retryable).toBe(true);
    }
  });

  it('should throw TIMEOUT_ERROR when request is aborted', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    try {
      await executeQuery(config, 'query { }', {}, mockResponseSchema);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnraidApiError);
      expect((error as UnraidApiError).code).toBe('TIMEOUT_ERROR');
      expect((error as UnraidApiError).retryable).toBe(true);
    }
  });

  it('should handle GraphQL errors in response', async () => {
    const mockResponse = {
      data: null,
      errors: [
        {
          message: 'Query failed',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    try {
      await executeQuery(config, 'query { }', {}, mockResponseSchema);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnraidApiError);
      expect((error as UnraidApiError).code).toBe('SERVER_ERROR');
      expect((error as UnraidApiError).message).toBe('Query failed');
    }
  });

  it('should throw VALIDATION_ERROR for invalid response format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ invalid: 'response' }),
    });

    try {
      await executeQuery(config, 'query { }', {}, mockResponseSchema);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnraidApiError);
      expect((error as UnraidApiError).code).toBe('VALIDATION_ERROR');
    }
  });
});
