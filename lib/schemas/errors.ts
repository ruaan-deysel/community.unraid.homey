'use strict';

import { z } from 'zod';

/**
 * Error codes for API operations
 */
export const ErrorCodeSchema = z.enum([
  'CONNECTION_ERROR',
  'AUTHENTICATION_ERROR',
  'TIMEOUT_ERROR',
  'VALIDATION_ERROR',
  'RESOURCE_NOT_FOUND',
  'OPERATION_FAILED',
  'RATE_LIMITED',
  'SERVER_ERROR',
  'UNKNOWN_ERROR',
]);

/**
 * API error schema with structured error information
 */
export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
  retryable: z.boolean().default(false),
}).passthrough();

/**
 * API response wrapper for type-safe responses
 */
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: ApiErrorSchema.optional(),
  }).passthrough();

/**
 * Validation error schema for Zod parse failures
 */
export const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string().optional(),
}).passthrough();

/**
 * GraphQL error schema for API responses
 */
export const GraphQLErrorSchema = z.object({
  message: z.string(),
  locations: z.array(z.object({
    line: z.number(),
    column: z.number(),
  })).optional(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

/**
 * GraphQL response schema
 */
export const GraphQLResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.nullable(),
    errors: z.array(GraphQLErrorSchema).optional(),
  }).passthrough();

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type GraphQLError = z.infer<typeof GraphQLErrorSchema>;

/**
 * Custom error class for API errors
 */
export class UnraidApiError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly retryable: boolean;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'UnraidApiError';
    this.code = error.code;
    this.details = error.details;
    this.retryable = error.retryable ?? false;
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnraidApiError);
    }
  }

  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
    };
  }
}
