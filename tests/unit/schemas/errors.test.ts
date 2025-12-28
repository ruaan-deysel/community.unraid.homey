'use strict';

import { describe, it, expect } from 'vitest';
import {
  ErrorCodeSchema,
  ApiErrorSchema,
  ValidationErrorSchema,
  GraphQLErrorSchema,
  UnraidApiError,
} from '../../../lib/schemas/errors';

describe('ErrorSchemas', () => {
  describe('ErrorCodeSchema', () => {
    it('should accept all valid error codes', () => {
      const codes = [
        'CONNECTION_ERROR',
        'AUTHENTICATION_ERROR',
        'TIMEOUT_ERROR',
        'VALIDATION_ERROR',
        'RESOURCE_NOT_FOUND',
        'OPERATION_FAILED',
        'RATE_LIMITED',
        'SERVER_ERROR',
        'UNKNOWN_ERROR',
      ];
      codes.forEach(code => {
        const result = ErrorCodeSchema.parse(code);
        expect(result).toBe(code);
      });
    });

    it('should reject invalid error codes', () => {
      expect(() => ErrorCodeSchema.parse('INVALID_CODE')).toThrow();
    });
  });

  describe('ApiErrorSchema', () => {
    it('should parse minimal error', () => {
      const data = { code: 'CONNECTION_ERROR', message: 'Failed to connect' };
      const result = ApiErrorSchema.parse(data);
      expect(result.code).toBe('CONNECTION_ERROR');
      expect(result.message).toBe('Failed to connect');
    });

    it('should default retryable to false', () => {
      const data = { code: 'SERVER_ERROR', message: 'Internal error' };
      const result = ApiErrorSchema.parse(data);
      expect(result.retryable).toBe(false);
    });

    it('should accept optional details', () => {
      const data = {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'apiKey', reason: 'required' },
      };
      const result = ApiErrorSchema.parse(data);
      expect(result.details).toEqual({ field: 'apiKey', reason: 'required' });
    });

    it('should accept optional timestamp', () => {
      const data = {
        code: 'TIMEOUT_ERROR',
        message: 'Request timed out',
        timestamp: '2024-01-01T00:00:00Z',
      };
      const result = ApiErrorSchema.parse(data);
      expect(result.timestamp).toBe('2024-01-01T00:00:00Z');
    });

    it('should allow unknown fields with passthrough', () => {
      const data = {
        code: 'UNKNOWN_ERROR',
        message: 'Unknown',
        requestId: 'req-123',
      };
      const result = ApiErrorSchema.parse(data);
      expect(result).toHaveProperty('requestId', 'req-123');
    });
  });

  describe('ValidationErrorSchema', () => {
    it('should parse validation error', () => {
      const data = { field: 'host', message: 'Invalid hostname' };
      const result = ValidationErrorSchema.parse(data);
      expect(result.field).toBe('host');
      expect(result.message).toBe('Invalid hostname');
    });

    it('should accept optional code', () => {
      const data = { field: 'port', message: 'Out of range', code: 'too_big' };
      const result = ValidationErrorSchema.parse(data);
      expect(result.code).toBe('too_big');
    });
  });

  describe('GraphQLErrorSchema', () => {
    it('should parse minimal GraphQL error', () => {
      const data = { message: 'Query failed' };
      const result = GraphQLErrorSchema.parse(data);
      expect(result.message).toBe('Query failed');
    });

    it('should accept locations', () => {
      const data = {
        message: 'Syntax error',
        locations: [{ line: 5, column: 10 }],
      };
      const result = GraphQLErrorSchema.parse(data);
      expect(result.locations).toEqual([{ line: 5, column: 10 }]);
    });

    it('should accept path with mixed types', () => {
      const data = {
        message: 'Field error',
        path: ['query', 'users', 0, 'name'],
      };
      const result = GraphQLErrorSchema.parse(data);
      expect(result.path).toEqual(['query', 'users', 0, 'name']);
    });

    it('should accept extensions', () => {
      const data = {
        message: 'Error with extensions',
        extensions: { code: 'UNAUTHENTICATED', timestamp: 12345 },
      };
      const result = GraphQLErrorSchema.parse(data);
      expect(result.extensions).toHaveProperty('code', 'UNAUTHENTICATED');
    });
  });

  describe('UnraidApiError', () => {
    it('should create error from ApiError', () => {
      const apiError = {
        code: 'CONNECTION_ERROR' as const,
        message: 'Cannot reach server',
        retryable: true,
      };
      const error = new UnraidApiError(apiError);
      expect(error.name).toBe('UnraidApiError');
      expect(error.message).toBe('Cannot reach server');
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.retryable).toBe(true);
    });

    it('should default retryable to false', () => {
      const apiError = {
        code: 'AUTHENTICATION_ERROR' as const,
        message: 'Invalid API key',
        retryable: false,
      };
      const error = new UnraidApiError(apiError);
      expect(error.retryable).toBe(false);
    });

    it('should preserve details', () => {
      const apiError = {
        code: 'VALIDATION_ERROR' as const,
        message: 'Bad input',
        details: { field: 'host' },
        retryable: false,
      };
      const error = new UnraidApiError(apiError);
      expect(error.details).toEqual({ field: 'host' });
    });

    it('should convert to JSON', () => {
      const apiError = {
        code: 'SERVER_ERROR' as const,
        message: 'Server down',
        retryable: true,
      };
      const error = new UnraidApiError(apiError);
      const json = error.toJSON();
      expect(json.code).toBe('SERVER_ERROR');
      expect(json.message).toBe('Server down');
      expect(json.retryable).toBe(true);
    });

    it('should be instanceof Error', () => {
      const error = new UnraidApiError({
        code: 'UNKNOWN_ERROR',
        message: 'Test',
        retryable: false,
      });
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnraidApiError);
    });

    it('should have stack trace', () => {
      const error = new UnraidApiError({
        code: 'TIMEOUT_ERROR',
        message: 'Timeout',
        retryable: true,
      });
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('UnraidApiError');
    });
  });
});
