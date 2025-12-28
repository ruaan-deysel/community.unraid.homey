# Feature Specification: Unraid Server Monitoring and Control

**Feature Branch**: `001-unraid-homey-app`
**Created**: 2025-12-28
**Status**: Draft
**Input**: User description: "Create Unraid Homey App to connect to Unraid server for monitoring and control. Must only require server IP/hostname and API key during setup. Must handle server redirect URLs. Must have user-friendly and human-readable names. Must follow test-driven development approach."

## Clarifications

### Session 2025-12-28

- Q: When a user has multiple Unraid servers, how should devices be organized in Homey? → A: Each server creates its own set of devices (Server + Containers + VMs) with server name as prefix to distinguish them
- Q: How should the app handle connection failures and retry attempts during polling? → A: Retry failed polls using exponential backoff (1s, 2s, 4s, 8s, max 30s) for up to 5 attempts, then mark unavailable
- Q: Should users be able to specify custom ports during setup? → A: Assume standard ports only (80/443), no custom port support
- Q: When are container and VM devices created after initial server connection? → A: Discover and create all container/VM devices automatically during first successful poll after server pairing
- Q: How should the app handle containers/VMs that are added or removed from Unraid after initial discovery? → A: Automatically create devices for new containers/VMs, but leave removed ones as "Unavailable" (user manually deletes)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initial Server Connection (Priority: P1)

A Homey user wants to add their Unraid server to Homey to begin monitoring it. They need a simple setup process that only requires the server's IP address (or hostname) and API key.

**Why this priority**: This is the foundational capability - without successful connection, no other features work. This represents the minimal viable product.

**Independent Test**: Can be fully tested by completing the pairing flow with valid credentials and verifying the server device appears in Homey with "Connected" status.

**Acceptance Scenarios**:

1. **Given** Homey user has Unraid server with API key enabled, **When** user initiates "Add Device" and selects Unraid, provides valid IP/hostname and API key, **Then** connection succeeds, server device is added to Homey, and first poll automatically discovers and creates all container and VM devices
2. **Given** user provides invalid API key, **When** attempting to connect, **Then** clear error message displays "Invalid API key - please check your Unraid settings"
3. **Given** user provides unreachable server address, **When** attempting to connect, **Then** error message displays "Cannot reach server at [address] - please verify IP/hostname"
4. **Given** Unraid server returns redirect URL, **When** connection is established, **Then** app automatically follows redirect and completes connection
5. **Given** user has existing Unraid device, **When** server connection is lost, **Then** device shows "Unavailable" status in Homey

---

### User Story 2 - Real-Time System Monitoring (Priority: P2)

A user wants to monitor their Unraid server's CPU usage, memory usage, and CPU temperature in real-time through Homey's interface and use these values in Homey Flows.

**Why this priority**: Core monitoring capability that provides immediate value and enables automation scenarios. This is the primary reason users install the app.

**Independent Test**: Can be fully tested by verifying CPU, memory, and temperature values update every 30 seconds and match values shown in Unraid web UI.

**Acceptance Scenarios**:

1. **Given** Unraid server device is connected, **When** user views device in Homey app, **Then** displays current CPU usage percentage, memory usage percentage, and CPU temperature
2. **Given** system metrics are updating, **When** 30 seconds pass, **Then** values refresh with current data from server
3. **Given** user creates Flow with condition "CPU usage above 80%", **When** CPU usage exceeds threshold, **Then** Flow triggers correctly
4. **Given** server is under load, **When** viewing device, **Then** values reflect actual server state (validated against Unraid web UI)
5. **Given** connection to server fails, **When** polling occurs, **Then** device shows "Unavailable" and retains last known values

---

### User Story 3 - Storage Array Monitoring (Priority: P3)

A user wants to monitor their Unraid array status, including array state (started/stopped), total capacity, used space, and individual disk health.

**Why this priority**: Important for proactive maintenance and preventing data loss, but less time-critical than real-time system metrics. Users typically check this less frequently.

**Independent Test**: Can be fully tested by verifying array capacity, disk status, and parity check information display correctly and update every 5 minutes.

**Acceptance Scenarios**:

1. **Given** Unraid array is started, **When** user views storage device, **Then** displays array state, total capacity, used space, free space, and usage percentage
2. **Given** array information is available, **When** 5 minutes pass, **Then** storage metrics refresh from server
3. **Given** parity check is running, **When** viewing storage device, **Then** displays parity check status and progress percentage
4. **Given** disk has SMART errors, **When** viewing storage device, **Then** shows disk health warning with affected disk name
5. **Given** array is stopped, **When** viewing storage device, **Then** displays "Array Stopped" status

---

### User Story 4 - Docker Container Status (Priority: P4)

A user wants to see the status of their Docker containers running on Unraid and know which containers are running or stopped.

**Why this priority**: Useful for monitoring services but less critical than server health metrics. Users can check container status directly in Unraid if needed.

**Independent Test**: Can be fully tested by verifying container list displays with accurate running/stopped states that update every 30 seconds.

**Acceptance Scenarios**:

1. **Given** Unraid server has Docker containers, **When** user views container devices, **Then** each container appears as separate device showing name and running status
2. **Given** containers are being monitored, **When** 30 seconds pass, **Then** container states refresh
3. **Given** container transitions from running to stopped, **When** next update occurs, **Then** device reflects new stopped state
4. **Given** user views container device, **Then** displays human-readable container name (not internal ID)
5. **Given** container has Web UI, **When** viewing device details, **Then** displays Web UI URL for quick access
6. **Given** new container is added to Unraid, **When** next poll occurs, **Then** new device is automatically created in Homey
7. **Given** container is removed from Unraid, **When** next poll occurs, **Then** device is marked "Unavailable" (user manually deletes if desired)

---

### User Story 5 - Virtual Machine Status (Priority: P5)

A user wants to monitor their virtual machines running on Unraid and see their power states.

**Why this priority**: Specialized use case for users running VMs. Lower priority as fewer users run VMs compared to Docker containers or need basic monitoring.

**Independent Test**: Can be fully tested by verifying VM list displays with accurate power states that update every 30 seconds.

**Acceptance Scenarios**:

1. **Given** Unraid server has VMs configured, **When** user views VM devices, **Then** each VM appears as separate device showing name and power state
2. **Given** VMs are being monitored, **When** 30 seconds pass, **Then** VM states refresh
3. **Given** VM is running, **When** viewing VM device, **Then** displays "Running" state with allocated memory and vCPU count
4. **Given** VM is shut down, **When** next update occurs, **Then** device shows "Stopped" state
5. **Given** user views VM device, **Then** displays human-readable VM name matching Unraid configuration
6. **Given** new VM is added to Unraid, **When** next poll occurs, **Then** new device is automatically created in Homey
7. **Given** VM is removed from Unraid, **When** next poll occurs, **Then** device is marked "Unavailable" (user manually deletes if desired)

---

### Edge Cases

- What happens when Unraid server's IP address changes after initial setup?
- What if the API key is revoked while the device is connected?
- How are extremely long server/container/VM names handled in device naming with prefixes?
- What happens if Unraid server is running very old version with different API schema?
- How does the app behave during Unraid server reboot?
- What if API query returns partial data due to server issues?
- How are extremely long container/VM names displayed in Homey UI?

## Requirements *(mandatory)*

### Functional Requirements

#### Connection & Authentication

- **FR-001**: System MUST allow users to connect to Unraid server using only IP address or hostname and API key during pairing
- **FR-001a**: System MUST use standard ports only (port 80 for HTTP, port 443 for HTTPS)
- **FR-001b**: System MUST NOT provide option for custom port configuration during setup
- **FR-002**: System MUST validate API key by testing connection to server before completing device pairing
- **FR-003**: System MUST handle HTTPS redirect URLs from Unraid servers automatically
- **FR-004**: System MUST support both HTTP and HTTPS connections to Unraid servers on standard ports
- **FR-005**: System MUST store server credentials securely using Homey's Settings API
- **FR-006**: System MUST display clear, user-friendly error messages when connection fails (invalid credentials, unreachable server, timeout)

#### System Monitoring

- **FR-007**: System MUST retrieve system information from Unraid server (CPU, memory, temperature)
- **FR-008**: System MUST poll system metrics at 30-second intervals maximum
- **FR-009**: System MUST display CPU usage as percentage (0-100%)
- **FR-010**: System MUST display memory usage as percentage (0-100%)
- **FR-011**: System MUST display CPU temperature in degrees Celsius
- **FR-012**: System MUST update device availability status when connection state changes

#### Storage Monitoring

- **FR-013**: System MUST retrieve array information from Unraid server (state, capacity, disks)
- **FR-014**: System MUST poll storage data at 5-minute intervals minimum
- **FR-015**: System MUST display array state (Started, Stopped)
- **FR-016**: System MUST display total capacity, used space, and free space in human-readable format (TB, GB)
- **FR-017**: System MUST display storage usage as percentage
- **FR-018**: System MUST display parity check status and progress when active
- **FR-019**: System MUST indicate disk health issues from SMART status

#### Docker Container Monitoring

- **FR-020**: System MUST retrieve Docker container list and states from Unraid server
- **FR-021**: System MUST create separate Homey device for each Docker container
- **FR-021a**: System MUST automatically discover and create all container devices during first successful poll after server pairing
- **FR-021b**: System MUST automatically create new devices when new containers are detected during regular polls
- **FR-021c**: System MUST mark container devices as "Unavailable" when corresponding container no longer exists on server (user must manually delete device)
- **FR-022**: System MUST poll container states at 30-second intervals maximum
- **FR-023**: System MUST display container running/stopped state
- **FR-024**: System MUST use human-readable container names (not internal IDs)
- **FR-024a**: System MUST prefix container device names with server name when multiple servers exist (e.g., "Tower-Plex", "Backup-Nginx")
- **FR-025**: System MUST display container Web UI URL when available

#### Virtual Machine Monitoring

- **FR-026**: System MUST retrieve VM list and power states from Unraid server
- **FR-027**: System MUST create separate Homey device for each VM
- **FR-027a**: System MUST automatically discover and create all VM devices during first successful poll after server pairing
- **FR-027b**: System MUST automatically create new devices when new VMs are detected during regular polls
- **FR-027c**: System MUST mark VM devices as "Unavailable" when corresponding VM no longer exists on server (user must manually delete device)
- **FR-028**: System MUST poll VM states at 30-second intervals maximum
- **FR-029**: System MUST display VM power state (Running, Stopped)
- **FR-029a**: System MUST prefix VM device names with server name when multiple servers exist (e.g., "Tower-Windows10", "Backup-Ubuntu")
- **FR-030**: System MUST display VM resource allocation (memory, vCPUs) when running

#### Data Validation

- **FR-031**: System MUST validate all server responses before processing
- **FR-032**: System MUST handle unknown fields from server gracefully (forward compatibility)
- **FR-033**: System MUST handle missing optional fields gracefully without errors
- **FR-034**: System MUST compute derived values (usage percentages, byte conversions) from raw server data

#### Error Handling

- **FR-035**: System MUST handle server query errors without crashing device
- **FR-036**: System MUST handle network timeouts (30-second timeout per request)
- **FR-037**: System MUST recover gracefully from temporary connection loss using exponential backoff retry strategy
- **FR-037a**: System MUST retry failed polls with exponential backoff intervals (1s, 2s, 4s, 8s, maximum 30s)
- **FR-037b**: System MUST attempt up to 5 retries before marking device unavailable
- **FR-037c**: System MUST resume normal polling interval immediately upon successful retry
- **FR-038**: System MUST log errors using Homey logging system for troubleshooting
- **FR-039**: System MUST mark device unavailable when connection cannot be established after retry attempts exhausted

#### User Experience

- **FR-040**: System MUST display all metric names in human-readable format (e.g., "CPU Usage" not "cpu_percent")
- **FR-041**: System MUST format all numeric values appropriately (percentages, temperatures, capacities)
- **FR-042**: System MUST use appropriate Homey capability types (measure_cpu, measure_memory, measure_temperature)
- **FR-043**: System MUST provide device icons that clearly identify device type (server, container, VM)

### Key Entities

- **Unraid Server**: Represents the Unraid server itself, has unique server name identifier, tracks connection credentials (IP/hostname, API key), monitors system health (CPU, memory, temperature), maintains connection state, serves as parent context for child devices (containers, VMs)
- **Storage Array**: Represents Unraid's storage array, tracks capacity metrics (total, used, free), monitors array state and parity status, reports disk health
- **Docker Container**: Represents individual Docker container, belongs to specific Unraid server, device name prefixed with server name in multi-server scenarios, tracks container name and state (running/stopped), stores Web UI URL for access, automatically created when new containers detected, marked unavailable when removed from server
- **Virtual Machine**: Represents individual VM, belongs to specific Unraid server, device name prefixed with server name in multi-server scenarios, tracks VM name and power state, stores resource allocation (memory, vCPUs), automatically created when new VMs detected, marked unavailable when removed from server
- **API Client**: Manages communication with Unraid server, handles authentication and redirects, executes queries and validates responses, manages connection lifecycle

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can successfully connect to their Unraid server in under 2 minutes from starting device pairing, with all containers and VMs automatically discovered
- **SC-002**: System metrics (CPU, memory, temperature) update within 30 seconds of server state changes
- **SC-003**: Storage metrics update within 5 minutes of array state changes
- **SC-004**: 95% of connection attempts succeed on first try with valid credentials
- **SC-005**: Device availability status accurately reflects server reachability within 1 minute of persistent connection loss (after retry attempts)
- **SC-006**: All displayed values match Unraid web UI values within acceptable precision (±1% for percentages, ±1°C for temperature)
- **SC-007**: Users can create Flows using device metrics with 100% reliability (triggers fire when conditions met)
- **SC-008**: App handles server redirects transparently with zero user intervention required
- **SC-009**: Error messages enable users to resolve 90% of connection issues without support
- **SC-010**: App supports monitoring of servers with 50+ Docker containers without performance degradation

### Test-Driven Development Requirements

- **SC-011**: All data validation schemas have unit tests validating parsing, optional field handling, and forward compatibility
- **SC-012**: All API client methods have integration tests covering success and error scenarios
- **SC-013**: Connection handling has tests covering redirects, timeouts, invalid credentials, and unreachable servers
- **SC-014**: Polling logic has tests verifying correct intervals, exponential backoff retry behavior, and error recovery
- **SC-015**: 100% of functional requirements have corresponding automated tests written before implementation

## Assumptions

### Technical Assumptions

- Unraid server is running version 6.9+ with remote API available
- Unraid server has API key functionality enabled (standard for recent versions)
- User has network connectivity to Unraid server from Homey device
- Server API structure is stable and documented
- Server uses standard ports (80 for HTTP, 443 for HTTPS) - custom ports are not supported

### User Assumptions

- User has administrator access to Unraid server to generate API key
- User knows their server's local IP address or hostname
- User wants monitoring capabilities (not remote control/management in this version)
- User is familiar with basic Homey device pairing process

### Scope Assumptions

- This specification covers monitoring only - control features (start/stop containers, VMs, array) are explicitly out of scope for version 1.0
- UPS monitoring is deferred to future version
- Share monitoring is deferred to future version
- Historical data/trending is out of scope (Homey handles this via Insights)
- Multi-server support is included but not the primary use case (most users have one Unraid server)
- Custom port configuration is out of scope - only standard ports (80/443) supported in version 1.0
