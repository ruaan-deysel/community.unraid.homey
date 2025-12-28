# Research: Unraid Server Monitoring and Control

**Feature Branch**: `001-unraid-homey-app`
**Date**: 2025-12-28

## Research Tasks

### 1. Unraid GraphQL API Structure

**Task**: Research Unraid's GraphQL API for system metrics, containers, and VMs.

**Decision**: Use Unraid's GraphQL API at `/graphql` endpoint with API key authentication via `x-api-key` header.

**Rationale**: 
- GraphQL is Unraid's primary API (introduced in 6.9+)
- Single endpoint with flexible queries
- Supports all required data: system info, Docker containers, VMs, array status

**Alternatives considered**:
- REST API: Limited/legacy, not all data exposed
- SSH commands: Security concerns, parsing complexity
- SNMP: Not available on Unraid

**Key Findings**:
- Base URL: `http(s)://{host}/graphql`
- Authentication: `x-api-key` header with API key from Unraid settings
- Redirect handling: Server may return 302 to HTTPS, must follow redirects
- Query structure: Nested queries for related data

### 2. Homey SDK v3 Device Patterns

**Task**: Research Homey SDK v3 best practices for multi-device apps with polling.

**Decision**: Use driver-per-device-type pattern with shared API client at driver level.

**Rationale**:
- SDK v3 recommends one driver per logical device type
- API client shared via driver prevents duplicate connections
- Device lifecycle (`onInit`, `onDeleted`) handles polling setup/cleanup

**Alternatives considered**:
- Single driver with multiple device classes: Complex, harder to maintain
- API client per device: Wasteful, potential rate limiting

**Key Findings**:
- Driver owns API client instance
- Devices receive client reference during construction
- Pairing flow in server driver discovers all devices
- Container/VM drivers receive devices via programmatic creation

### 3. Zod Schema Patterns for GraphQL

**Task**: Research Zod best practices for GraphQL response validation with forward compatibility.

**Decision**: Use `.passthrough()` on all object schemas, `.transform()` for computed values.

**Rationale**:
- `.passthrough()` ignores unknown fields (forward compatible when Unraid adds fields)
- `.transform()` keeps computed logic with schema (percentages, formatted values)
- Type inference via `z.infer<>` ensures TypeScript alignment

**Alternatives considered**:
- `.strict()`: Breaks when API adds fields
- Manual type guards: No runtime validation
- io-ts: More complex syntax, less popular

**Key Findings**:
```typescript
// Example pattern
const SystemInfoSchema = z.object({
  cpu: z.object({
    usage: z.number(),
    temperature: z.number().nullable(),
  }),
  memory: z.object({
    total: z.number(),
    used: z.number(),
  }),
}).passthrough().transform(data => ({
  ...data,
  memoryPercent: (data.memory.used / data.memory.total) * 100,
}));
```

### 4. Polling with Exponential Backoff

**Task**: Research retry strategies for resilient polling in Homey apps.

**Decision**: Implement exponential backoff (1s, 2s, 4s, 8s, max 30s) with 5 retries.

**Rationale**:
- Prevents hammering server during outages
- Matches spec requirement FR-037a/b/c
- Standard practice for network resilience

**Alternatives considered**:
- Fixed interval retry: Can overwhelm recovering server
- No retry: Poor UX during brief outages
- Linear backoff: Less efficient than exponential

**Key Findings**:
```typescript
// Backoff calculation
const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
// 1s, 2s, 4s, 8s, 16s, 30s (capped)
```

### 5. Homey Capability Mapping

**Task**: Research appropriate Homey capabilities for Unraid metrics.

**Decision**: Use standard Homey capabilities where available, custom capabilities for Unraid-specific data.

**Rationale**:
- Standard capabilities integrate with Homey Insights and Energy
- Custom capabilities needed for array-specific states
- Consistent UX with other Homey apps

**Capability Mapping**:

| Unraid Metric | Homey Capability | Type |
|---------------|------------------|------|
| CPU usage | `measure_cpu` (custom) | number (0-100) |
| Memory usage | `measure_memory` (custom) | number (0-100) |
| CPU temperature | `measure_temperature` | number (°C) |
| Array state | `array_state` (custom) | enum |
| Storage used | `measure_storage_used` (custom) | number (bytes) |
| Container running | `onoff` | boolean |
| VM running | `onoff` | boolean |

### 6. Device Pairing Flow

**Task**: Research Homey pairing flow for credential-based device setup.

**Decision**: Use socket-based pairing with custom views for IP/hostname and API key input.

**Rationale**:
- Custom views allow proper UX for credential entry
- Socket events enable validation before device creation
- Can display meaningful error messages

**Flow Steps**:
1. User selects "Unraid Server" driver
2. Custom view displays IP/hostname input
3. Custom view displays API key input
4. Backend validates connection
5. On success: create server device, trigger initial discovery
6. Discovery creates container and VM devices programmatically

### 7. Multi-Server Device Naming

**Task**: Research naming conventions for devices from multiple servers.

**Decision**: Prefix child device names with server name (e.g., "Tower-Plex", "Backup-nginx").

**Rationale**:
- Matches spec requirement FR-024a, FR-029a
- Clear identification in Homey UI
- Prevents name collisions

**Implementation**:
```typescript
const deviceName = serverCount > 1 
  ? `${serverName}-${containerName}`
  : containerName;
```

## Dependencies

| Dependency | Purpose | Version |
|------------|---------|---------|
| `zod` | Runtime schema validation | ^3.22 |
| `homey` | Homey SDK types | SDK v3 |

## Open Questions Resolved

| Question | Resolution |
|----------|------------|
| How to handle redirect URLs? | Follow 302 redirects, update stored URL |
| How to share API client? | Driver owns client, passed to devices |
| When to discover containers/VMs? | First successful poll after server pairing |
| How to handle removed containers? | Mark device unavailable, user deletes |
