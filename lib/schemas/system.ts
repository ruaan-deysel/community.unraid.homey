'use strict';

import { z } from 'zod';

/**
 * CPU utilization schema - from the metrics endpoint
 */
export const CpuInfoSchema = z.object({
  percentTotal: z.number().min(0).max(100),
}).passthrough();

/**
 * Memory utilization schema - from the metrics endpoint
 * Note: values are in bytes as BigInt strings
 */
export const MemoryInfoSchema = z.object({
  total: z.union([z.number(), z.string()]).transform(v => Number(v)),
  used: z.union([z.number(), z.string()]).transform(v => Number(v)),
  free: z.union([z.number(), z.string()]).transform(v => Number(v)),
  available: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
  percentTotal: z.number().min(0).max(100),
}).passthrough();

/**
 * Metrics schema - the actual shape returned by the Unraid GraphQL API
 */
export const MetricsSchema = z.object({
  cpu: CpuInfoSchema,
  memory: MemoryInfoSchema,
}).passthrough();

/**
 * System information schema with computed memoryPercent (for backward compatibility)
 */
export const SystemInfoSchema = z.object({
  metrics: MetricsSchema,
  serverName: z.string().optional(),
}).passthrough().transform(data => ({
  ...data,
  cpuUsage: data.metrics.cpu.percentTotal,
  memoryPercent: data.metrics.memory.percentTotal,
}));

export type CpuInfo = z.infer<typeof CpuInfoSchema>;
export type MemoryInfo = z.infer<typeof MemoryInfoSchema>;
export type Metrics = z.infer<typeof MetricsSchema>;
export type SystemInfo = z.infer<typeof SystemInfoSchema>;
