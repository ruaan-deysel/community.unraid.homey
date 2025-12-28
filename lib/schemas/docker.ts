'use strict';

import { z } from 'zod';

/**
 * Docker container state enum - matches Unraid API values
 */
export const DockerContainerStateSchema = z.enum([
  'RUNNING',
  'PAUSED',
  'EXITED',
  'DEAD',
  'CREATED',
  'RESTARTING',
]);

/**
 * Container port mapping schema
 */
export const PortMappingSchema = z.object({
  container: z.number().int().min(1).max(65535).optional(),
  host: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
}).passthrough();

/**
 * Container volume mount schema
 */
export const VolumeMountSchema = z.object({
  source: z.string().optional(),
  destination: z.string().optional(),
  readOnly: z.boolean().default(false),
}).passthrough();

/**
 * Docker container schema - matches actual Unraid API response
 * Note: 'names' is an array, not 'name' (single string)
 */
export const DockerContainerSchema = z.object({
  id: z.string().min(1),
  names: z.array(z.string()),
  image: z.string().min(1),
  state: z.string(),
  status: z.string(),
  autoStart: z.boolean().default(false),
  created: z.number().optional(),
  ports: z.array(z.any()).default([]),
  mounts: z.array(z.any()).nullable().default([]),
}).passthrough().transform(data => ({
  ...data,
  // Extract first name and strip leading slash for backward compatibility
  name: data.names[0]?.replace(/^\//, '') ?? data.id,
  // Normalize state to lowercase for backward compatibility
  running: data.state === 'RUNNING',
}));

/**
 * Docker info schema (list of containers)
 */
export const DockerInfoSchema = z.object({
  containers: z.array(DockerContainerSchema),
  isEnabled: z.boolean().default(true),
}).passthrough();

export type DockerContainerState = z.infer<typeof DockerContainerStateSchema>;
export type PortMapping = z.infer<typeof PortMappingSchema>;
export type VolumeMount = z.infer<typeof VolumeMountSchema>;
export type DockerContainer = z.infer<typeof DockerContainerSchema>;
export type DockerInfo = z.infer<typeof DockerInfoSchema>;
