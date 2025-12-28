# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Homey app for monitoring and controlling Unraid servers via GraphQL API. The architecture mirrors the Home Assistant Unraid integration but uses TypeScript + Zod instead of Python + Pydantic.

**Critical**: Development MUST be done within the dev container. Never work outside the containerized environment.

## Essential Commands

### Build & Quality
```bash
npm run build          # Compile TypeScript to .homeybuild/
npm run lint           # ESLint validation (ZERO tolerance - must pass)
```

**Zero tolerance policy**: All linting errors and warnings MUST be fixed before committing. Run `npm run lint` after every code change.

### Homey CLI
```bash
homey login            # Authenticate with Homey (required once)
homey app run          # Run app on Homey device for testing
homey app validate     # Validate app structure (run before commit)
homey app build        # Build for production/publishing
homey app test         # Run tests (if defined)
```

### Development Setup
```bash
# First time setup (automated in dev container)
bash scripts/setup.sh

# Authenticate tools
gh auth login          # GitHub CLI
# Set ANTHROPIC_API_KEY env var before running claude
```

## Architecture: Critical Patterns

### 1. Composition-Based Configuration (NON-NEGOTIABLE)

**NEVER edit `app.json` directly** - it is GENERATED and will be overwritten.

```
.homeycompose/         # Source of truth - edit these
├── app.json           # App metadata, SDK version, compatibility
├── drivers/           # Device driver definitions
├── flow/              # Flow card definitions
│   ├── actions/       # Action cards
│   ├── conditions/    # Condition cards
│   └── triggers/      # Trigger cards
├── capabilities/      # Custom capability definitions
└── locales/           # Translations

app.json               # GENERATED - read-only
```

Any manifest change MUST be made in `.homeycompose/` directory.

### 2. Homey Device & Driver Pattern

**Device lifecycle:**
```typescript
// Devices extend Homey.Device
class UnraidDevice extends Homey.Device {
  async onInit() {
    // Get shared API client from driver (never duplicate)
    const driver = this.getDriver() as UnraidDriver;
    this.client = driver.getApiClient();

    // Start polling with appropriate interval
    // System metrics: 30s max, Storage: 5min min
    this.startPolling();
  }

  async onDeleted() {
    // MUST clean up polling timers
    this.stopPolling();
  }
}
```

**Driver manages pairing & shared resources:**
```typescript
// Drivers extend Homey.Driver
class UnraidDriver extends Homey.Driver {
  private client: UnraidAPIClient | null = null;

  async onPair(session: Homey.Driver.PairSession) {
    // Handle device pairing flow
  }

  getApiClient() {
    return this.client; // Shared across all devices
  }
}
```

**Key rules:**
- API clients shared via driver, NOT duplicated per device
- Use `this.log()` and `this.error()` for logging
- Update capabilities: `setCapabilityValue(capability, value)`
- Manage availability: `setAvailable()` / `setUnavailable(message)`

### 3. Zod Schema Validation (REQUIRED)

All GraphQL API responses MUST be validated with Zod schemas:

```typescript
import { z } from 'zod';

// Base schema with passthrough for forward compatibility
const UnraidBaseSchema = z.object({}).passthrough();

// Schema definition
const SystemInfoSchema = UnraidBaseSchema.merge(z.object({
  time: z.coerce.date().nullable().optional(),
  cpu: z.object({
    brand: z.string().nullable().optional(),
    threads: z.number().int().nullable().optional(),
  }).passthrough(),
}));

// Extract TypeScript type
type SystemInfo = z.infer<typeof SystemInfoSchema>;

// Validate API response
async getSystemInfo() {
  const data = await this.query(SYSTEM_INFO_QUERY);
  return SystemInfoSchema.parse(data.info); // Runtime validation
}
```

**Critical requirements:**
- ALL schemas MUST use `.passthrough()` for forward compatibility
- Compute properties with `.transform()`, not manual post-processing
- Types inferred with `z.infer<typeof Schema>`, not manually defined
- Schemas in `src/schemas/`, separate from implementation

### 4. Polling Discipline

Device polling intervals based on data cost:

```typescript
// System metrics (CPU, memory): 30 second interval MAXIMUM
const SYSTEM_POLL_INTERVAL = 30000;

// Storage data (SMART queries): 5 minute interval MINIMUM
const STORAGE_POLL_INTERVAL = 300000;

private startPolling() {
  this.pollingInterval = setInterval(() => {
    this.updateCapabilities().catch((err) => {
      // Errors MUST NOT crash device
      this.error('Update failed:', err);
      // Update availability status on connection failure
      if (err instanceof UnraidConnectionError) {
        this.setUnavailable('Connection lost');
      }
    });
  }, SYSTEM_POLL_INTERVAL);
}

private stopPolling() {
  if (this.pollingInterval) {
    clearInterval(this.pollingInterval);
    this.pollingInterval = null;
  }
}
```

**Rules:**
- MUST clear timers in `onDeleted()`
- Errors MUST NOT crash device or app
- Connection failures MUST update device availability status

## TypeScript Configuration

```json
{
  "extends": "@tsconfig/node16/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "outDir": ".homeybuild/"
  }
}
```

- Target: Node.js 16
- Output: `.homeybuild/` (gitignored, build artifact)
- Allow JavaScript files alongside TypeScript

## Pre-Commit Quality Gates

Before committing, ALL of these MUST pass:

1. ✅ `npm run build` - TypeScript compilation succeeds
2. ✅ `npm run lint` - ESLint passes (zero tolerance)
3. ✅ `homey app validate` - Homey CLI validation
4. ✅ Manual smoke test with `homey app run`

## Constitution Compliance

This project has a formal constitution at `.specify/memory/constitution.md` (v1.0.0). All code MUST comply with:

**5 Core Principles:**
1. **Homey Integration Quality** - Follow Homey's standards (NON-NEGOTIABLE)
2. **Composition-Based Configuration** - Never edit `app.json` directly
3. **TypeScript Build Integrity** - Clean builds, no `any` types
4. **Schema Validation with Zod** - Runtime validation + forward compatibility
5. **Device Polling Discipline** - Appropriate intervals, defensive error handling

## Key Anti-Patterns to Avoid

### ❌ Editing Generated Files
```typescript
// ❌ WRONG
// Edit app.json directly

// ✅ CORRECT
// Edit .homeycompose/app.json
```

### ❌ Duplicating API Clients
```typescript
// ❌ WRONG
class UnraidDevice extends Homey.Device {
  private client = new UnraidAPIClient(...); // Per device
}

// ✅ CORRECT
class UnraidDevice extends Homey.Device {
  async onInit() {
    const driver = this.getDriver();
    this.client = driver.getApiClient(); // Shared
  }
}
```

### ❌ Missing Passthrough in Schemas
```typescript
// ❌ WRONG - breaks on new API fields
const Schema = z.object({
  field: z.string(),
});

// ✅ CORRECT - forward compatible
const Schema = UnraidBaseSchema.merge(z.object({
  field: z.string(),
})); // UnraidBaseSchema has .passthrough()
```

### ❌ Not Clearing Polling Timers
```typescript
// ❌ WRONG - memory leak
async onDeleted() {
  // Forgot to clear interval
}

// ✅ CORRECT
async onDeleted() {
  this.stopPolling(); // Clears setInterval
}
```

### ❌ Aggressive Polling
```typescript
// ❌ WRONG - hammers Unraid server
setInterval(() => update(), 5000); // 5 seconds

// ✅ CORRECT - respects data cost
const INTERVAL = 30000; // 30s for metrics
const INTERVAL = 300000; // 5min for storage
```

## Error Handling Pattern

Use typed error classes for GraphQL API errors:

```typescript
try {
  const data = await client.getSystemInfo();
} catch (err) {
  if (err instanceof UnraidAuthError) {
    // Handle invalid API key
    this.setUnavailable('Invalid credentials');
  } else if (err instanceof UnraidConnectionError) {
    // Handle network issues
    this.setUnavailable('Connection failed');
  } else if (err instanceof UnraidTimeoutError) {
    // Handle timeout
    this.error('Request timeout');
  } else if (err instanceof UnraidGraphQLError) {
    // Handle GraphQL errors
    this.error('GraphQL error:', err.graphqlErrors);
  }
}
```

## Version Bumping

Edit `version` in `.homeycompose/app.json` (NOT root `app.json`):

- **MAJOR**: Breaking changes to device capabilities or pairing flow
- **MINOR**: New device types, new capabilities, new flow cards
- **PATCH**: Bug fixes, performance improvements

Update `.homeychangelog.json` with user-facing release notes.

## Reference Documentation

- **Constitution**: `.specify/memory/constitution.md` - Architectural principles
- **Development Guide**: `unraid_app_development.md` - Comprehensive Zod/TypeScript patterns, 1400+ lines covering:
  - Zod fundamentals and patterns
  - Data model examples (System, Array, Docker, VM, UPS)
  - API client implementation
  - Device/capability mapping
  - Common pitfalls (7 detailed anti-patterns)
- **Copilot Instructions**: `.github/copilot-instructions.md` - AI assistant guidance
- **Homey SDK**: https://developers.homey.app/

## Linting Configuration

ESLint configured with:
- `eslint-config-athom` - Homey's official config
- `eslint-config-prettier` - Prettier integration
- Zero tolerance: All errors and warnings MUST be fixed

Run after every code change: `npm run lint`
