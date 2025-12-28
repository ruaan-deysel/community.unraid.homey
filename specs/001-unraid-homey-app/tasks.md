# Tasks: Unraid Server Monitoring and Control

**Input**: Design documents from `/specs/001-unraid-homey-app/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: TDD is explicitly required per SC-011 to SC-015 in spec.md. All data validation schemas and API client methods require tests before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Homey composition**: `.homeycompose/` for manifest sources
- **TypeScript source**: `lib/` for shared code, `drivers/` for device implementations
- **Tests**: `tests/unit/` for schema tests, `tests/integration/` for API tests

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, Homey composition structure, and dependencies

- [X] T001 Create Homey composition base manifest in .homeycompose/app.json (SDK v3, compatibility >=12.4.0)
- [X] T002 Install Zod dependency via npm install zod in package.json
- [X] T003 [P] Configure TypeScript for Homey build output in tsconfig.json (outDir: .homeybuild)
- [X] T004 [P] Configure Vitest for unit testing in vitest.config.ts and package.json scripts
- [X] T005 [P] Create lib/ directory structure: lib/api/, lib/schemas/, lib/utils/
- [X] T006 [P] Create drivers/ directory structure: drivers/unraid-server/, drivers/docker-container/, drivers/virtual-machine/
- [X] T007 [P] Create tests/ directory structure: tests/unit/schemas/, tests/integration/api/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Zod Schemas (Forward Compatible)

- [X] T008 [P] Create SystemInfoSchema with .passthrough() and memoryPercent transform in lib/schemas/system.ts
- [X] T009 [P] Create StorageArraySchema with .passthrough() and computed fields in lib/schemas/storage.ts
- [X] T010 [P] Create DockerContainerSchema with .passthrough() in lib/schemas/docker.ts
- [X] T011 [P] Create VirtualMachineSchema with .passthrough() in lib/schemas/vm.ts
- [X] T012 [P] Create GraphQL error response schema in lib/schemas/errors.ts

### Schema Tests (SC-011 - Must FAIL first)

- [X] T013 [P] Unit test for SystemInfoSchema parsing and forward compatibility in tests/unit/schemas/system.test.ts
- [X] T014 [P] Unit test for StorageArraySchema parsing and computed fields in tests/unit/schemas/storage.test.ts
- [X] T015 [P] Unit test for DockerContainerSchema parsing and optional webUiUrl in tests/unit/schemas/docker.test.ts
- [X] T016 [P] Unit test for VirtualMachineSchema parsing and power states in tests/unit/schemas/vm.test.ts

### API Client Core

- [X] T017 Create GraphQL query definitions in lib/api/queries.ts (SystemInfo, StorageArray, DockerContainers, VMs, ConnectionTest)
- [X] T018 Create UnraidApiClient class with constructor(host, apiKey) in lib/api/client.ts
- [X] T019 Implement executeQuery() method with fetch, redirect handling, and timeout in lib/api/client.ts
- [X] T020 [P] Create API response types re-exported from schemas in lib/api/types.ts

### API Client Tests (SC-012, SC-013)

- [X] T021 [P] Integration test for API client success scenarios in tests/integration/api/client-success.test.ts
- [X] T022 [P] Integration test for API client error scenarios (401, timeout) in tests/integration/api/client-errors.test.ts
- [X] T023 [P] Integration test for redirect handling (302 to HTTPS) in tests/integration/api/client-redirect.test.ts

### Polling Infrastructure

- [X] T024 Create PollManager class with exponential backoff in lib/utils/polling.ts (1s, 2s, 4s, 8s, max 30s, 5 retries)
- [X] T025 Unit test for PollManager backoff calculation and retry limits in tests/unit/utils/polling.test.ts

### Utility Functions

- [X] T026 [P] Create formatBytes() and formatPercent() helpers in lib/utils/format.ts
- [X] T027 [P] Create device naming utilities (prefixing for multi-server) in lib/utils/naming.ts

### Custom Capabilities

- [X] T028 [P] Create measure_cpu capability definition in .homeycompose/capabilities/measure_cpu.json
- [X] T029 [P] Create measure_memory capability definition in .homeycompose/capabilities/measure_memory.json
- [X] T030 [P] Create array_state capability definition in .homeycompose/capabilities/array_state.json
- [X] T031 [P] Create parity_status capability definition in .homeycompose/capabilities/parity_status.json
- [X] T032 [P] Create disk_health capability definition in .homeycompose/capabilities/disk_health.json
- [X] T033 [P] Create measure_storage_used capability definition in .homeycompose/capabilities/measure_storage_used.json
- [X] T034 [P] Create measure_storage_free capability definition in .homeycompose/capabilities/measure_storage_free.json
- [X] T034a [P] Create vm_memory_mb capability definition in .homeycompose/capabilities/vm_memory_mb.json
- [X] T034b [P] Create vm_vcpus capability definition in .homeycompose/capabilities/vm_vcpus.json
- [X] T034c [P] Create vm_power_state capability definition (running/stopped/paused) in .homeycompose/capabilities/vm_power_state.json

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Initial Server Connection (Priority: P1) 🎯 MVP

**Goal**: User can add their Unraid server to Homey using IP/hostname and API key, connection validates, and server device is created.

**Independent Test**: Complete pairing flow with valid credentials, verify server device appears in Homey with "Connected" status.

### Driver Compose Files

- [X] T035 [US1] Create unraid-server driver compose with capabilities in .homeycompose/drivers/unraid-server/driver.compose.json
- [X] T036 [P] [US1] Create pairing view for host input in .homeycompose/drivers/unraid-server/pair/host.html
- [X] T037 [P] [US1] Create pairing view for API key input in .homeycompose/drivers/unraid-server/pair/api-key.html
- [X] T038 [P] [US1] Create pairing view for connection test in .homeycompose/drivers/unraid-server/pair/test-connection.html

### Server Driver Implementation

- [X] T039 [US1] Implement UnraidServerDriver class extending Homey.Driver in drivers/unraid-server/driver.ts
- [X] T040 [US1] Implement onPair() with socket handlers for pairing views in drivers/unraid-server/driver.ts
- [X] T041 [US1] Implement connection validation using ConnectionTest query in drivers/unraid-server/driver.ts
- [X] T042 [US1] Store credentials securely using Homey Settings API in drivers/unraid-server/driver.ts

### Server Device Implementation

- [X] T043 [US1] Implement UnraidServerDevice class extending Homey.Device in drivers/unraid-server/device.ts
- [X] T044 [US1] Implement onInit() with API client initialization and initial poll in drivers/unraid-server/device.ts
- [X] T045 [US1] Implement onDeleted() to clean up polling timers in drivers/unraid-server/device.ts
- [X] T046 [US1] Implement setAvailable/setUnavailable for connection state in drivers/unraid-server/device.ts

### Error Handling (FR-006)

- [X] T047 [US1] Create user-friendly error messages for invalid credentials in drivers/unraid-server/driver.ts
- [X] T048 [US1] Create user-friendly error messages for unreachable server in drivers/unraid-server/driver.ts
- [X] T049 [US1] Create user-friendly error messages for timeout in drivers/unraid-server/driver.ts

### Localization

- [X] T050 [P] [US1] Add English translations for server driver in .homeycompose/locales/en.json

**Checkpoint**: User Story 1 complete - server pairing works independently

---

## Phase 4: User Story 2 - Real-Time System Monitoring (Priority: P2)

**Goal**: Connected server device displays CPU usage, memory usage, and CPU temperature with 30-second polling.

**Independent Test**: Verify CPU, memory, and temperature values update every 30 seconds and match Unraid web UI.

### System Metrics Implementation

- [X] T051 [US2] Add system metrics query method to UnraidApiClient in lib/api/client.ts
- [X] T052 [US2] Implement pollSystemMetrics() method in UnraidServerDevice in drivers/unraid-server/device.ts
- [X] T053 [US2] Start 30-second polling interval in onInit() in drivers/unraid-server/device.ts
- [X] T054 [US2] Update capability values (measure_cpu, measure_memory, measure_temperature) in drivers/unraid-server/device.ts

### Polling with Backoff

- [X] T055 [US2] Integrate PollManager for system metrics polling in drivers/unraid-server/device.ts
- [X] T056 [US2] Implement retry logic with exponential backoff on poll failure in drivers/unraid-server/device.ts
- [X] T057 [US2] Mark device unavailable after 5 failed retries in drivers/unraid-server/device.ts
- [X] T058 [US2] Resume normal polling on successful retry in drivers/unraid-server/device.ts

### Polling Tests (SC-014)

- [X] T059 [P] [US2] Unit test for polling interval correctness in tests/unit/device/polling.test.ts
- [X] T060 [P] [US2] Unit test for exponential backoff behavior in tests/unit/device/backoff.test.ts

### Flow Integration

- [X] T061 [P] [US2] Create flow condition card for CPU usage threshold in .homeycompose/flow/conditions/cpu-above.json
- [X] T062 [P] [US2] Create flow condition card for memory usage threshold in .homeycompose/flow/conditions/memory-above.json
- [X] T063 [P] [US2] Create flow condition card for temperature threshold in .homeycompose/flow/conditions/temp-above.json
- [X] T064 [US2] Register flow card handlers in UnraidServerDevice.onInit() in drivers/unraid-server/device.ts

**Checkpoint**: User Story 2 complete - system monitoring works independently

---

## Phase 5: User Story 3 - Storage Array Monitoring (Priority: P3)

**Goal**: Display array state, capacity metrics, parity status, and disk health with 5-minute polling.

**Independent Test**: Verify array capacity, disk status, and parity check information display correctly and update every 5 minutes.

### Storage Metrics Implementation

- [X] T065 [US3] Add storage array query method to UnraidApiClient in lib/api/client.ts
- [X] T066 [US3] Implement pollStorageMetrics() method in UnraidServerDevice in drivers/unraid-server/device.ts
- [X] T067 [US3] Start 5-minute polling interval for storage in onInit() in drivers/unraid-server/device.ts
- [X] T068 [US3] Update storage capability values (array_state, storage_used, parity_status) in drivers/unraid-server/device.ts

### Capacity Formatting

- [X] T069 [US3] Format storage values using formatBytes() helper in drivers/unraid-server/device.ts
- [X] T070 [US3] Compute and display usage percentage in drivers/unraid-server/device.ts

### Disk Health

- [X] T071 [US3] Parse disk health from array response in lib/schemas/storage.ts
- [X] T072 [US3] Display disk health warning when SMART errors detected in drivers/unraid-server/device.ts

### Flow Integration

- [X] T073 [P] [US3] Create flow trigger card for parity check started in .homeycompose/flow/triggers/parity-started.json
- [X] T074 [P] [US3] Create flow trigger card for disk health warning in .homeycompose/flow/triggers/disk-warning.json
- [X] T075 [P] [US3] Create flow condition card for array state in .homeycompose/flow/conditions/array-state.json
- [X] T076 [US3] Register storage flow card handlers in drivers/unraid-server/device.ts

**Checkpoint**: User Story 3 complete - storage monitoring works independently

---

## Phase 6: User Story 4 - Docker Container Status (Priority: P4)

**Goal**: Each Docker container appears as separate Homey device showing running/stopped state with 30-second polling.

**Independent Test**: Verify container list displays with accurate running/stopped states that update every 30 seconds.

### Container Driver Setup

- [X] T077 [US4] Create docker-container driver compose in .homeycompose/drivers/docker-container/driver.compose.json
- [X] T078 [US4] Implement DockerContainerDriver class in drivers/docker-container/driver.ts
- [X] T079 [US4] Implement DockerContainerDevice class in drivers/docker-container/device.ts

### Container Discovery

- [X] T080 [US4] Add Docker containers query method to UnraidApiClient in lib/api/client.ts
- [X] T081 [US4] Implement discoverContainers() in UnraidServerDevice in drivers/unraid-server/device.ts
- [X] T082 [US4] Programmatically create container devices after first poll in drivers/unraid-server/device.ts
- [X] T083 [US4] Apply server name prefix for multi-server support using naming utility in drivers/unraid-server/device.ts

### Container Polling

- [X] T084 [US4] Implement container state polling in DockerContainerDevice in drivers/docker-container/device.ts
- [X] T085 [US4] Update onoff capability based on running state in drivers/docker-container/device.ts
- [X] T086 [US4] Store and display Web UI URL if available in drivers/docker-container/device.ts

### Auto-Discovery Updates

- [X] T087 [US4] Detect new containers during regular polls in drivers/unraid-server/device.ts
- [X] T088 [US4] Create new container devices for newly detected containers in drivers/unraid-server/device.ts
- [X] T089 [US4] Mark removed containers as unavailable in drivers/unraid-server/device.ts

### Container Localization

- [X] T090 [P] [US4] Add English translations for container driver in .homeycompose/locales/en.json

**Checkpoint**: User Story 4 complete - container monitoring works independently

---

## Phase 7: User Story 5 - Virtual Machine Status (Priority: P5)

**Goal**: Each VM appears as separate Homey device showing power state with 30-second polling.

**Independent Test**: Verify VM list displays with accurate power states that update every 30 seconds.

### VM Driver Setup

- [X] T091 [US5] Create virtual-machine driver compose in .homeycompose/drivers/virtual-machine/driver.compose.json
- [X] T092 [US5] Implement VirtualMachineDriver class in drivers/virtual-machine/driver.ts
- [X] T093 [US5] Implement VirtualMachineDevice class in drivers/virtual-machine/device.ts

### VM Discovery

- [X] T094 [US5] Add VMs query method to UnraidApiClient in lib/api/client.ts
- [X] T095 [US5] Implement discoverVMs() in UnraidServerDevice in drivers/unraid-server/device.ts
- [X] T096 [US5] Programmatically create VM devices after first poll in drivers/unraid-server/device.ts
- [X] T097 [US5] Apply server name prefix for multi-server support in drivers/unraid-server/device.ts

### VM Polling

- [X] T098 [US5] Implement VM state polling in VirtualMachineDevice in drivers/virtual-machine/device.ts
- [X] T099 [US5] Update vm_power_state capability for running/stopped/paused states in drivers/virtual-machine/device.ts
- [X] T099a [US5] Update onoff capability based on power state (true=running, false=stopped/paused) in drivers/virtual-machine/device.ts
- [X] T100 [US5] Display allocated memory (vm_memory_mb) and vCPU count (vm_vcpus) when running in drivers/virtual-machine/device.ts

### Auto-Discovery Updates

- [X] T101 [US5] Detect new VMs during regular polls in drivers/unraid-server/device.ts
- [X] T102 [US5] Create new VM devices for newly detected VMs in drivers/unraid-server/device.ts
- [X] T103 [US5] Mark removed VMs as unavailable in drivers/unraid-server/device.ts

### VM Localization

- [X] T104 [P] [US5] Add English translations for VM driver in .homeycompose/locales/en.json

**Checkpoint**: User Story 5 complete - VM monitoring works independently

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T105 [P] Add device icons for server, container, and VM in assets/
- [X] T106 [P] Update app icon in assets/icon.svg
- [X] T107 Run npm run lint and fix all warnings/errors
- [X] T108 Run npm run build and verify clean compilation
- [X] T109 Run homey app validate and fix any issues
- [X] T110 Update .homeychangelog.json with v1.0.0 release notes
- [X] T111 Run quickstart.md validation (manual smoke test)
- [X] T112 Test multi-server scenario (add two servers, verify naming)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P4 → P5)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Builds on server device from US1
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Builds on server device from US1
- **User Story 4 (P4)**: Can start after Foundational (Phase 2) - Requires US1 server device for discovery
- **User Story 5 (P5)**: Can start after Foundational (Phase 2) - Requires US1 server device for discovery

### Within Each User Story

- Tests MUST be written and FAIL before implementation (per SC-015)
- Schemas before client methods
- Client methods before device implementation
- Core implementation before flow integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, US1 must complete first (others depend on server device)
- After US1, user stories 2-5 can be worked on in parallel
- All capability definitions marked [P] can run in parallel
- All flow card definitions marked [P] can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# Launch all Zod schemas together:
Task: "Create SystemInfoSchema in lib/schemas/system.ts"
Task: "Create StorageArraySchema in lib/schemas/storage.ts"
Task: "Create DockerContainerSchema in lib/schemas/docker.ts"
Task: "Create VirtualMachineSchema in lib/schemas/vm.ts"

# Launch all schema tests together:
Task: "Unit test for SystemInfoSchema in tests/unit/schemas/system.test.ts"
Task: "Unit test for StorageArraySchema in tests/unit/schemas/storage.test.ts"
Task: "Unit test for DockerContainerSchema in tests/unit/schemas/docker.test.ts"
Task: "Unit test for VirtualMachineSchema in tests/unit/schemas/vm.test.ts"

# Launch all capabilities together:
Task: "Create measure_cpu capability in .homeycompose/capabilities/measure_cpu.json"
Task: "Create measure_memory capability in .homeycompose/capabilities/measure_memory.json"
Task: "Create array_state capability in .homeycompose/capabilities/array_state.json"
# ... etc
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 - Initial Server Connection
4. **STOP and VALIDATE**: Test server pairing independently
5. Deploy/demo if ready - users can connect to Unraid!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → **MVP: Basic connection**
3. Add User Story 2 → Test independently → **System monitoring**
4. Add User Story 3 → Test independently → **Storage monitoring**
5. Add User Story 4 → Test independently → **Container monitoring**
6. Add User Story 5 → Test independently → **VM monitoring**
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers after US1 is complete:

1. Team completes Setup + Foundational + US1 together
2. Once US1 is done:
   - Developer A: User Story 2 (System Monitoring)
   - Developer B: User Story 3 (Storage Monitoring)
   - Developer C: User Story 4 (Container Status)
   - Developer D: User Story 5 (VM Status)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD required per SC-015)
- Run `npm run lint` after each task - zero tolerance for errors
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All `.homeycompose/` edits require `homey app build` to regenerate `app.json`
