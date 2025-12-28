# Implementation Plan: Unraid Server Monitoring and Control

**Branch**: `001-unraid-homey-app` | **Date**: 2025-12-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-unraid-homey-app/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create a Homey app for monitoring Unraid servers via GraphQL API. The app allows users to connect using IP/hostname and API key, then monitors system metrics (CPU, memory, temperature), storage array status, Docker containers, and VMs. Each container and VM appears as a separate Homey device with polling-based updates. Uses Zod for runtime validation with forward compatibility.

## Technical Context

**Language/Version**: TypeScript 5.9, targeting ES2021/Node 16  
**Primary Dependencies**: Homey SDK v3, Zod (runtime validation), native fetch (GraphQL client)  
**Storage**: Homey Settings API for credentials, device data store for device state  
**Testing**: Homey app manual testing, unit tests with Vitest for Zod schemas  
**Target Platform**: Homey Pro (local execution), SDK v3, compatibility >=12.4.0  
**Project Type**: Single Homey app with composition-based manifest  
**Performance Goals**: <200ms per GraphQL query response processing, 50+ containers without degradation  
**Constraints**: 30s max poll interval for metrics, 5min min for storage, no custom ports  
**Scale/Scope**: Single app, 3 device drivers (server, container, VM), ~15 capabilities

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| I. Homey Integration Quality | All code complies with Homey standards | ✅ PASS | Using SDK v3 patterns, proper device lifecycle |
| II. Composition-Based Config | Manifest in `.homeycompose/`, root `app.json` generated | ✅ PASS | Will use composition structure |
| III. TypeScript Build Integrity | Clean `npm run build` and `npm run lint` | ✅ PASS | TypeScript with strict typing, no `any` |
| IV. Schema Validation with Zod | All API data validated with `.passthrough()` | ✅ PASS | Zod schemas for all GraphQL responses |
| V. Device Polling Discipline | 30s metrics, 5min storage, cleanup on delete | ✅ PASS | Per spec intervals, timers cleared in `onDeleted` |

**Pre-Phase 0 Gate**: ✅ PASSED - No violations requiring justification

## Project Structure

### Documentation (this feature)

```text
specs/001-unraid-homey-app/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Homey App Composition Structure
.homeycompose/
├── app.json                    # Base app manifest (source of truth)
├── capabilities/               # Custom capability definitions
│   ├── array_state.json
│   ├── parity_status.json
│   └── ...
├── drivers/
│   ├── unraid-server/
│   │   ├── driver.compose.json
│   │   └── pair/               # Pairing views
│   ├── docker-container/
│   │   └── driver.compose.json
│   └── virtual-machine/
│       └── driver.compose.json
├── flow/
│   ├── triggers/               # Flow trigger cards
│   ├── conditions/             # Flow condition cards
│   └── actions/                # Flow action cards (future)
└── locales/
    └── en.json

# TypeScript Source
lib/
├── api/
│   ├── client.ts               # GraphQL API client
│   ├── queries.ts              # GraphQL query definitions
│   └── types.ts                # API response types
├── schemas/
│   ├── system.ts               # Zod schemas for system metrics
│   ├── storage.ts              # Zod schemas for array/disk data
│   ├── docker.ts               # Zod schemas for container data
│   └── vm.ts                   # Zod schemas for VM data
└── utils/
    ├── polling.ts              # Polling with exponential backoff
    └── format.ts               # Value formatting utilities

# Drivers (TypeScript)
drivers/
├── unraid-server/
│   ├── device.ts               # Server device implementation
│   └── driver.ts               # Server driver with pairing
├── docker-container/
│   ├── device.ts               # Container device implementation
│   └── driver.ts               # Container driver
└── virtual-machine/
    ├── device.ts               # VM device implementation
    └── driver.ts               # VM driver

# Tests
tests/
├── unit/
│   └── schemas/                # Zod schema unit tests
└── integration/
    └── api/                    # API client integration tests

# Generated (gitignored)
app.json                        # Generated from .homeycompose/
.homeybuild/                    # TypeScript output
```

**Structure Decision**: Homey composition-based structure with TypeScript sources in `lib/` and `drivers/`. Follows SDK v3 conventions with separate drivers for server, container, and VM device types. Shared API client and Zod schemas in `lib/`.

## Constitution Check (Post-Design)

*Re-evaluation after Phase 1 design completion.*

| Principle | Requirement | Status | Design Evidence |
|-----------|-------------|--------|-----------------|
| I. Homey Integration Quality | All code complies with Homey standards | ✅ PASS | SDK v3 patterns in data-model.md, proper Device/Driver inheritance |
| II. Composition-Based Config | Manifest in `.homeycompose/`, root `app.json` generated | ✅ PASS | Project structure uses `.homeycompose/` for all manifests |
| III. TypeScript Build Integrity | Clean `npm run build` and `npm run lint` | ✅ PASS | Typed schemas in data-model.md, strict typing planned |
| IV. Schema Validation with Zod | All API data validated with `.passthrough()` | ✅ PASS | All schemas in data-model.md use `.passthrough()` |
| V. Device Polling Discipline | 30s metrics, 5min storage, cleanup on delete | ✅ PASS | Quickstart.md documents polling cleanup pattern |

**Post-Design Gate**: ✅ PASSED - Design artifacts align with constitution

## Complexity Tracking

> **No violations requiring justification** - All constitution principles satisfied with standard patterns.
