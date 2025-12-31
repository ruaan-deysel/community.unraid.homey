'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';

// We need to mock http/https before importing the module
vi.mock('http');
vi.mock('https');

// Import after mocking
import { discoverSslMode, clearSslDiscoveryCache, type SslDiscoveryResult } from '../../../lib/api/client';

/**
 * Helper to create a mock HTTP response
 */
function createMockResponse(statusCode: number, headers: Record<string, string> = {}): EventEmitter & { statusCode: number; headers: Record<string, string>; resume: () => void } {
  const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string>; resume: () => void };
  res.statusCode = statusCode;
  res.headers = headers;
  res.resume = vi.fn();
  return res;
}

/**
 * Helper to create a mock HTTP request
 */
function createMockRequest(): EventEmitter & { end: () => void; destroy: () => void } {
  const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

describe('SSL Mode Discovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearSslDiscoveryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Strict mode detection (myunraid.net)', () => {
    it('should detect strict mode when host is already myunraid.net', async () => {
      const result = await discoverSslMode('abc123.myunraid.net', 5000);

      expect(result.sslMode).toBe('strict');
      expect(result.verifySsl).toBe(true);
      expect(result.useHttps).toBe(true);
      expect(result.url).toBe('https://abc123.myunraid.net/graphql');
    });

    it('should detect strict mode when HTTP redirects to myunraid.net', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse(302, { location: 'https://abc123.myunraid.net/login' });

      vi.mocked(http.request).mockImplementation((...args: unknown[]) => {
        const callback = args.find((arg) => typeof arg === 'function') as ((res: http.IncomingMessage) => void) | undefined;
        if (callback) {
          process.nextTick(() => callback(mockRes as unknown as http.IncomingMessage));
        }
        return mockReq as unknown as http.ClientRequest;
      });

      const result = await discoverSslMode('192.168.1.100', 5000);

      expect(result.sslMode).toBe('strict');
      expect(result.verifySsl).toBe(true);
      expect(result.useHttps).toBe(true);
      expect(result.url).toContain('myunraid.net');
    });
  });

  describe('Yes mode detection (self-signed)', () => {
    it('should detect yes mode when HTTP redirects to HTTPS on same host', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse(302, { location: 'https://192.168.1.100/graphql' });

      vi.mocked(http.request).mockImplementation((...args: unknown[]) => {
        const callback = args.find((arg) => typeof arg === 'function') as ((res: http.IncomingMessage) => void) | undefined;
        if (callback) {
          process.nextTick(() => callback(mockRes as unknown as http.IncomingMessage));
        }
        return mockReq as unknown as http.ClientRequest;
      });

      const result = await discoverSslMode('192.168.1.100', 5000);

      expect(result.sslMode).toBe('yes');
      expect(result.verifySsl).toBe(false);
      expect(result.useHttps).toBe(true);
      expect(result.url).toBe('https://192.168.1.100/graphql');
    });

    it('should detect yes mode when HTTPS works with self-signed cert only', async () => {
      const mockHttpReq = createMockRequest();
      const mockHttpsReq = createMockRequest();
      const mockHttpsRes = createMockResponse(200);

      // HTTP request fails
      vi.mocked(http.request).mockImplementation((...args: unknown[]) => {
        process.nextTick(() => mockHttpReq.emit('error', new Error('ECONNREFUSED')));
        return mockHttpReq as unknown as http.ClientRequest;
      });

      // First HTTPS (strict) fails with cert error
      let httpsCallCount = 0;
      vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
        httpsCallCount++;
        const callback = args.find((arg) => typeof arg === 'function') as ((res: http.IncomingMessage) => void) | undefined;
        if (httpsCallCount === 1) {
          // First call with cert verification - fails
          process.nextTick(() => mockHttpsReq.emit('error', new Error('self signed certificate')));
        } else {
          // Second call without cert verification - succeeds
          if (callback) {
            process.nextTick(() => callback(mockHttpsRes as unknown as http.IncomingMessage));
          }
        }
        return mockHttpsReq as unknown as http.ClientRequest;
      });

      const result = await discoverSslMode('192.168.1.100', 5000);

      expect(result.sslMode).toBe('yes');
      expect(result.verifySsl).toBe(false);
      expect(result.useHttps).toBe(true);
    });
  });

  describe('No mode detection (HTTP only)', () => {
    it('should detect no mode when HTTP returns 200 without redirect', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse(200);

      vi.mocked(http.request).mockImplementation((...args: unknown[]) => {
        const callback = args.find((arg) => typeof arg === 'function') as ((res: http.IncomingMessage) => void) | undefined;
        if (callback) {
          process.nextTick(() => callback(mockRes as unknown as http.IncomingMessage));
        }
        return mockReq as unknown as http.ClientRequest;
      });

      const result = await discoverSslMode('192.168.1.100', 5000);

      expect(result.sslMode).toBe('no');
      expect(result.verifySsl).toBe(false);
      expect(result.useHttps).toBe(false);
      expect(result.url).toBe('http://192.168.1.100/graphql');
    });

    it('should detect no mode when HTTP returns 4xx without redirect', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse(401); // Unauthorized but endpoint exists

      vi.mocked(http.request).mockImplementation((...args: unknown[]) => {
        const callback = args.find((arg) => typeof arg === 'function') as ((res: http.IncomingMessage) => void) | undefined;
        if (callback) {
          process.nextTick(() => callback(mockRes as unknown as http.IncomingMessage));
        }
        return mockReq as unknown as http.ClientRequest;
      });

      const result = await discoverSslMode('192.168.1.100', 5000);

      expect(result.sslMode).toBe('no');
      expect(result.verifySsl).toBe(false);
      expect(result.useHttps).toBe(false);
    });
  });

  describe('Caching', () => {
    it('should cache discovery results', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse(200);

      vi.mocked(http.request).mockImplementation((...args: unknown[]) => {
        const callback = args.find((arg) => typeof arg === 'function') as ((res: http.IncomingMessage) => void) | undefined;
        if (callback) {
          process.nextTick(() => callback(mockRes as unknown as http.IncomingMessage));
        }
        return mockReq as unknown as http.ClientRequest;
      });

      // First call
      const result1 = await discoverSslMode('192.168.1.100', 5000);
      expect(result1.sslMode).toBe('no');

      // Second call should use cache (http.request should only be called once)
      const result2 = await discoverSslMode('192.168.1.100', 5000);
      expect(result2.sslMode).toBe('no');
      expect(http.request).toHaveBeenCalledTimes(1);
    });

    it('should clear cache for specific host', async () => {
      const mockReq = createMockRequest();
      const mockRes = createMockResponse(200);

      vi.mocked(http.request).mockImplementation((...args: unknown[]) => {
        const callback = args.find((arg) => typeof arg === 'function') as ((res: http.IncomingMessage) => void) | undefined;
        if (callback) {
          process.nextTick(() => callback(mockRes as unknown as http.IncomingMessage));
        }
        return mockReq as unknown as http.ClientRequest;
      });

      // First call
      await discoverSslMode('192.168.1.100', 5000);
      expect(http.request).toHaveBeenCalledTimes(1);

      // Clear cache for this host
      clearSslDiscoveryCache('192.168.1.100');

      // Second call should make new request
      await discoverSslMode('192.168.1.100', 5000);
      expect(http.request).toHaveBeenCalledTimes(2);
    });
  });

  describe('Fallback behavior', () => {
    it('should fallback to yes mode when all probes fail', async () => {
      const mockReq = createMockRequest();

      // All requests fail
      vi.mocked(http.request).mockImplementation((...args: unknown[]) => {
        process.nextTick(() => mockReq.emit('error', new Error('ECONNREFUSED')));
        return mockReq as unknown as http.ClientRequest;
      });

      vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
        process.nextTick(() => mockReq.emit('error', new Error('ECONNREFUSED')));
        return mockReq as unknown as http.ClientRequest;
      });

      const result = await discoverSslMode('192.168.1.100', 5000);

      // Default fallback is yes mode (self-signed)
      expect(result.sslMode).toBe('yes');
      expect(result.verifySsl).toBe(false);
      expect(result.useHttps).toBe(true);
    });
  });

  describe('SSL error detection', () => {
    it.each([
      'self signed certificate',
      'unable to verify the first certificate',
      'certificate has expired',
      'SSL certificate problem',
      'CERT_HAS_EXPIRED',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'depth zero self signed cert',
    ])('should recognize "%s" as SSL error', async (errorMessage) => {
      const mockHttpReq = createMockRequest();
      const mockHttpsReq = createMockRequest();
      const mockHttpsRes = createMockResponse(200);

      // HTTP fails
      vi.mocked(http.request).mockImplementation((...args: unknown[]) => {
        process.nextTick(() => mockHttpReq.emit('error', new Error('ECONNREFUSED')));
        return mockHttpReq as unknown as http.ClientRequest;
      });

      let httpsCallCount = 0;
      vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
        httpsCallCount++;
        const callback = args.find((arg) => typeof arg === 'function') as ((res: http.IncomingMessage) => void) | undefined;
        if (httpsCallCount === 1) {
          // First HTTPS with cert verification fails with SSL error
          process.nextTick(() => mockHttpsReq.emit('error', new Error(errorMessage)));
        } else {
          // Second HTTPS without verification succeeds
          if (callback) {
            process.nextTick(() => callback(mockHttpsRes as unknown as http.IncomingMessage));
          }
        }
        return mockHttpsReq as unknown as http.ClientRequest;
      });

      const result = await discoverSslMode('192.168.1.100', 5000);

      // Should detect yes mode because SSL error triggered self-signed fallback
      expect(result.sslMode).toBe('yes');
    });
  });
});
