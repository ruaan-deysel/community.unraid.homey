# Data Model: Unraid Server Monitoring and Control

**Feature Branch**: `001-unraid-homey-app`
**Date**: 2025-12-28

## Entities

### UnraidServer

Represents a connected Unraid server device in Homey.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `id` | string | Homey device ID | UUID format |
| `name` | string | Server name from Unraid | Non-empty, max 64 chars |
| `host` | string | IP address or hostname | Valid IP or hostname |
| `apiKey` | string | API key for authentication | Non-empty |
| `connected` | boolean | Current connection state | - |
| `cpuUsage` | number | CPU usage percentage | 0-100 |
| `memoryUsage` | number | Memory usage percentage | 0-100 |
| `cpuTemperature` | number \| null | CPU temperature in °C | nullable |

**Relationships**:
- Has many `DockerContainer` (parent server)
- Has many `VirtualMachine` (parent server)
- Has one `StorageArray` (embedded)

**State Transitions**:
- `disconnected` → `connecting` → `connected`
- `connected` → `disconnected` (on connection loss after retries)

### StorageArray

Represents the Unraid storage array (embedded in server).

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `state` | enum | Array state | `started`, `stopped` |
| `totalBytes` | number | Total capacity in bytes | >= 0 |
| `usedBytes` | number | Used space in bytes | >= 0, <= totalBytes |
| `freeBytes` | number | Free space in bytes | >= 0 |
| `usagePercent` | number | Computed usage percentage | 0-100 |
| `parityStatus` | enum \| null | Parity check status | `idle`, `running`, `error`, nullable |
| `parityProgress` | number \| null | Parity check progress | 0-100, nullable |
| `diskHealth` | enum | Overall disk health | `healthy`, `warning`, `error` |

**Computed Fields**:
- `usagePercent` = (usedBytes / totalBytes) * 100
- `freeBytes` = totalBytes - usedBytes

### DockerContainer

Represents a Docker container as a Homey device.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `id` | string | Homey device ID | UUID format |
| `containerId` | string | Docker container ID | Non-empty |
| `name` | string | Human-readable container name | Non-empty |
| `displayName` | string | Name shown in Homey (may include server prefix) | Non-empty |
| `serverId` | string | Parent server device ID | Valid device ID |
| `running` | boolean | Container running state | - |
| `webUiUrl` | string \| null | Web UI URL if available | Valid URL or null |

**Relationships**:
- Belongs to `UnraidServer` (via serverId)

**State Transitions**:
- `running` ↔ `stopped`
- Any state → `unavailable` (when container removed from Unraid)

### VirtualMachine

Represents a VM as a Homey device.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `id` | string | Homey device ID | UUID format |
| `vmId` | string | VM identifier in Unraid | Non-empty |
| `name` | string | Human-readable VM name | Non-empty |
| `displayName` | string | Name shown in Homey (may include server prefix) | Non-empty |
| `serverId` | string | Parent server device ID | Valid device ID |
| `powerState` | enum | VM power state | `running`, `stopped`, `paused` |
| `memoryMB` | number | Allocated memory in MB | > 0 |
| `vcpus` | number | Allocated vCPUs | > 0 |

**Relationships**:
- Belongs to `UnraidServer` (via serverId)

**State Transitions**:
- `stopped` → `running` → `stopped`
- `running` → `paused` → `running`
- Any state → `unavailable` (when VM removed from Unraid)

## Zod Schemas

### System Info Response Schema

```typescript
import { z } from 'zod';

export const CpuInfoSchema = z.object({
  usage: z.number().min(0).max(100),
  temperature: z.number().nullable(),
}).passthrough();

export const MemoryInfoSchema = z.object({
  total: z.number().min(0),
  used: z.number().min(0),
  free: z.number().min(0),
}).passthrough();

export const SystemInfoSchema = z.object({
  cpu: CpuInfoSchema,
  memory: MemoryInfoSchema,
  serverName: z.string(),
}).passthrough().transform(data => ({
  ...data,
  memoryPercent: data.memory.total > 0 
    ? (data.memory.used / data.memory.total) * 100 
    : 0,
}));

export type SystemInfo = z.infer<typeof SystemInfoSchema>;
```

### Storage Array Response Schema

```typescript
export const ArrayStateSchema = z.enum(['started', 'stopped']);
export const ParityStatusSchema = z.enum(['idle', 'running', 'error']);
export const DiskHealthSchema = z.enum(['healthy', 'warning', 'error']);

export const StorageArraySchema = z.object({
  state: ArrayStateSchema,
  totalBytes: z.number().min(0),
  usedBytes: z.number().min(0),
  parityStatus: ParityStatusSchema.nullable(),
  parityProgress: z.number().min(0).max(100).nullable(),
  diskHealth: DiskHealthSchema,
}).passthrough().transform(data => ({
  ...data,
  freeBytes: data.totalBytes - data.usedBytes,
  usagePercent: data.totalBytes > 0 
    ? (data.usedBytes / data.totalBytes) * 100 
    : 0,
}));

export type StorageArray = z.infer<typeof StorageArraySchema>;
```

### Docker Container Response Schema

```typescript
export const DockerContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  running: z.boolean(),
  webUiUrl: z.string().url().nullable().optional(),
}).passthrough();

export const DockerContainersResponseSchema = z.object({
  containers: z.array(DockerContainerSchema),
}).passthrough();

export type DockerContainer = z.infer<typeof DockerContainerSchema>;
```

### Virtual Machine Response Schema

```typescript
export const VmPowerStateSchema = z.enum(['running', 'stopped', 'paused']);

export const VirtualMachineSchema = z.object({
  id: z.string(),
  name: z.string(),
  powerState: VmPowerStateSchema,
  memoryMB: z.number().min(0),
  vcpus: z.number().min(1),
}).passthrough();

export const VirtualMachinesResponseSchema = z.object({
  vms: z.array(VirtualMachineSchema),
}).passthrough();

export type VirtualMachine = z.infer<typeof VirtualMachineSchema>;
```

## Homey Device Data Store

### Server Device Store

```typescript
interface ServerDeviceStore {
  host: string;           // Stored in settings
  apiKey: string;         // Stored in settings (encrypted by Homey)
  lastPollTime: number;   // Unix timestamp
  retryCount: number;     // Current retry count for backoff
}
```

### Container/VM Device Store

```typescript
interface ChildDeviceStore {
  serverId: string;       // Parent server device ID
  externalId: string;     // Docker container ID or VM ID
}
```

## Capability Definitions

### Custom Capabilities

```json
// .homeycompose/capabilities/measure_cpu.json
{
  "type": "number",
  "title": { "en": "CPU Usage" },
  "units": "%",
  "min": 0,
  "max": 100,
  "decimals": 1,
  "getable": true,
  "setable": false,
  "insights": true
}

// .homeycompose/capabilities/measure_memory.json
{
  "type": "number",
  "title": { "en": "Memory Usage" },
  "units": "%",
  "min": 0,
  "max": 100,
  "decimals": 1,
  "getable": true,
  "setable": false,
  "insights": true
}

// .homeycompose/capabilities/array_state.json
{
  "type": "enum",
  "title": { "en": "Array State" },
  "values": [
    { "id": "started", "title": { "en": "Started" } },
    { "id": "stopped", "title": { "en": "Stopped" } }
  ],
  "getable": true,
  "setable": false
}
```
