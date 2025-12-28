'use strict';

import { z } from 'zod';

/**
 * Virtual machine state enum - matches Unraid API values
 */
export const VMStateSchema = z.enum([
  'RUNNING',
  'PAUSED',
  'SHUTOFF',
  'PMSUSPENDED',
  'IDLE',
  'CRASHED',
  'BLOCKED',
  'SHUTDOWN',
  'NOSTATE',
]);

/**
 * VM disk schema (optional - may not be available from API)
 */
export const VMDiskSchema = z.object({
  path: z.string().optional(),
  size: z.number().min(0).optional(),
  driver: z.string().default('qcow2'),
}).passthrough();

/**
 * VM network interface schema (optional - may not be available from API)
 */
export const VMNetworkSchema = z.object({
  mac: z.string().optional(),
  bridge: z.string().optional(),
  model: z.string().default('virtio'),
}).passthrough();

/**
 * Virtual machine schema - matches actual Unraid API (VmDomain type)
 * Note: The API only provides id, name, and state - no memory/vcpu info
 */
export const VirtualMachineSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  state: z.string(),
}).passthrough().transform(data => ({
  ...data,
  name: data.name ?? data.id,
  powerState: data.state, // Alias for vm_power_state capability
  // Note: memory/vcpu not available from API
}));

/**
 * VM info schema - matches actual Unraid API structure
 */
export const VMInfoSchema = z.object({
  domain: z.array(VirtualMachineSchema),
}).passthrough().transform(data => ({
  vms: data.domain, // Normalize to 'vms' for backward compatibility
  isEnabled: true,
}));

export type VMState = z.infer<typeof VMStateSchema>;
export type VMDisk = z.infer<typeof VMDiskSchema>;
export type VMNetwork = z.infer<typeof VMNetworkSchema>;
export type VirtualMachine = z.infer<typeof VirtualMachineSchema>;
export type VMInfo = z.infer<typeof VMInfoSchema>;
