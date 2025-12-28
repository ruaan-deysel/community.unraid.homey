'use strict';

import { z } from 'zod';

/**
 * Array disk status enum values from the API
 */
export const ArrayDiskStatusEnum = z.enum([
  'DISK_OK',
  'DISK_NP',
  'DISK_NP_DSBL',
  'DISK_DSBL',
  'DISK_NEW',
  'DISK_INVALID',
  'DISK_ERROR',
]);

/**
 * Array state enum values from the API
 */
export const ArrayStateEnum = z.enum([
  'STARTED',
  'STOPPED',
  'STOPPING',
  'STARTING',
  'NEW_ARRAY',
  'RECON_DISK',
  'DISABLE_DISK',
  'SWAP_DSBL',
]);

/**
 * Individual array disk schema - matches Unraid API
 */
export const DiskSchema = z.object({
  name: z.string(),
  status: z.string(),
  temp: z.number().nullable(),
  numErrors: z.number().optional(),
}).passthrough();

/**
 * Array capacity in kilobytes schema
 */
export const ArrayCapacityKilobytesSchema = z.object({
  free: z.string().transform(v => Number(v)),
  used: z.string().transform(v => Number(v)),
  total: z.string().transform(v => Number(v)),
});

/**
 * Array capacity schema wrapper
 */
export const ArrayCapacitySchema = z.object({
  kilobytes: ArrayCapacityKilobytesSchema,
});

/**
 * Parity check status schema
 */
export const ParityCheckStatusSchema = z.object({
  status: z.string(),
  progress: z.number().nullable(),
  running: z.boolean().nullable(),
  errors: z.number().nullable().optional(),
  speed: z.string().nullable().optional(),
  paused: z.boolean().nullable().optional(),
});

/**
 * Storage array schema - matches actual Unraid API response
 */
export const StorageArraySchema = z.object({
  state: z.string(),
  capacity: ArrayCapacitySchema,
  parityCheckStatus: ParityCheckStatusSchema,
  disks: z.array(DiskSchema),
}).passthrough().transform(data => {
  const totalBytes = data.capacity.kilobytes.total * 1024;
  const usedBytes = data.capacity.kilobytes.used * 1024;
  return {
    ...data,
    totalSize: totalBytes,
    usedSize: usedBytes,
    freeSize: data.capacity.kilobytes.free * 1024,
    usagePercent: totalBytes > 0 
      ? (usedBytes / totalBytes) * 100 
      : 0,
  };
});

/**
 * Share schema - matches Unraid API
 */
export const ShareSchema = z.object({
  name: z.string(),
  comment: z.string().nullable().optional(),
  free: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
  used: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
}).passthrough();

/**
 * Storage info schema (combines array and shares)
 */
export const StorageInfoSchema = z.object({
  array: StorageArraySchema,
  shares: z.array(ShareSchema).optional(),
}).passthrough();

export type Disk = z.infer<typeof DiskSchema>;
export type ArrayCapacity = z.infer<typeof ArrayCapacitySchema>;
export type ParityCheckStatus = z.infer<typeof ParityCheckStatusSchema>;
export type StorageArray = z.infer<typeof StorageArraySchema>;
export type Share = z.infer<typeof ShareSchema>;
export type StorageInfo = z.infer<typeof StorageInfoSchema>;
