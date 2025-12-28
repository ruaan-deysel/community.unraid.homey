<!--
Sync Impact Report:
- Version change: Initial version → 1.0.0
- Principles added: 1 (Homey Integration Quality)
- Sections added: 2 (Homey-Specific Standards, Governance)
- Templates status:
  ✅ plan-template.md - reviewed, "Constitution Check" section aligns
  ✅ spec-template.md - reviewed, requirements section compatible
  ✅ tasks-template.md - reviewed, quality gates compatible
  ⚠ commands/*.md - no command templates found in repository
- Follow-up TODOs: None - ratification date set to today (initial constitution)
-->

# Unraid Homey App Constitution

## Core Principles

### I. Homey Integration Quality (NON-NEGOTIABLE)

All code MUST comply with Homey's App integration quality standards and architectural patterns. This is the foundation for all development work.

**Requirements:**
- All integrations MUST pass Homey's integration quality checklist
- Code MUST follow Homey's coding style and conventions
- MUST use Homey's recommended libraries and patterns
- MUST NOT introduce dependencies that conflict with Homey core requirements
- All changes MUST be tested against current stable Homey releases before merge

**Rationale**: Homey has established quality standards to ensure integrations are stable, secure, and maintainable. Non-compliance creates technical debt and risks breaking user installations.

### II. Composition-Based Configuration

Homey apps use a composition-based manifest system. The root `app.json` is GENERATED and must NEVER be edited directly.

**Requirements:**
- All manifest changes MUST be made in `.homeycompose/` directory
- The root `app.json` is read-only (generated from `.homeycompose/app.json`)
- Drivers, flow cards, capabilities, and locales defined in `.homeycompose/` subdirectories
- Build process MUST regenerate `app.json` from composition sources

**Rationale**: Editing generated files leads to lost changes and merge conflicts. Homey's composition system provides modularity and prevents accidental manifest corruption.

### III. TypeScript Build Integrity

TypeScript source MUST compile cleanly to the `.homeybuild/` output directory without errors or warnings.

**Requirements:**
- All TypeScript code MUST type-check successfully (`npm run build`)
- No TypeScript `any` types unless explicitly justified
- ESLint MUST pass without errors (`npm run lint`)
- Output directory `.homeybuild/` is gitignored (build artifact)
- Source files remain in root or organized subdirectories

**Rationale**: Type safety prevents runtime errors. Clean builds ensure the app can be published to the Homey App Store.

### IV. Schema Validation with Zod

All external API data MUST be validated at runtime using Zod schemas that provide both type safety and forward compatibility.

**Requirements:**
- GraphQL responses MUST be validated with Zod schemas before use
- All schemas MUST use `.passthrough()` for forward compatibility (ignore unknown fields)
- Schemas MUST be separate from implementation (in `lib/schemas/` or equivalent)
- TypeScript types MUST be inferred from schemas using `z.infer<typeof Schema>`
- Computed properties MUST use `.transform()` rather than manual post-processing

**Rationale**: Runtime validation catches API contract violations. Forward compatibility (`.passthrough()`) ensures the app doesn't break when Unraid adds new API fields, mirroring the Python/Pydantic approach in the Home Assistant integration.

### V. Device Polling Discipline

Device updates MUST use appropriate polling intervals based on data cost and user experience requirements.

**Requirements:**
- System metrics (CPU, memory): 30 second interval maximum
- Storage data (SMART queries, array status): 5 minute interval minimum
- Polling timers MUST be cleared on device deletion (`onDeleted`)
- Errors during polling MUST NOT crash the device or app
- Connection failures MUST update device availability status

**Rationale**: Aggressive polling degrades Unraid server performance. Defensive error handling ensures stability. Following Home Assistant's coordinator pattern provides proven interval guidance.

## Homey-Specific Standards

### SDK Version Compliance

- App MUST declare `"sdk": 3` in `.homeycompose/app.json`
- Compatibility MUST specify minimum Homey version (e.g., `"compatibility": ">=12.4.0"`)
- Use Homey SDK types from `@types/homey` (dev dependency)
- Platform targeting: `"platforms": ["local"]` for local-only apps

### Device and Driver Patterns

- Devices extend `Homey.Device` with lifecycle methods (`onInit`, `onDeleted`, `onSettings`)
- Drivers extend `Homey.Driver` with pairing logic (`onPair`, `onRepair`)
- API clients MUST be shared via driver, not duplicated per device
- Use `this.log()` and `this.error()` for Homey-integrated logging
- Capability values updated via `setCapabilityValue(capability, value)`
- Device availability managed via `setAvailable()` / `setUnavailable(message)`

### Flow Card Integration

- Action cards defined in `.homeycompose/flow/actions/`
- Condition cards defined in `.homeycompose/flow/conditions/`
- Trigger cards defined in `.homeycompose/flow/triggers/`
- Each card must have localized `title` and argument schemas
- Card handlers registered in driver or device `onInit()`

## Development Workflow

### Pre-Commit Quality Gates

Before committing code, the following MUST pass:

1. `npm run build` - TypeScript compilation succeeds
2. `npm run lint` - ESLint validation succeeds
3. Homey CLI validation (if available): `homey app validate`
4. Manual smoke test with `homey app run` (device pairing, basic functionality)

### Testing Strategy

- Unit tests for Zod schemas (validation, forward compatibility, computed properties)
- Integration tests for API client (connection, auth errors, timeouts, GraphQL errors)
- Manual testing on Homey device/emulator for:
  - Device pairing flow
  - Capability updates during polling
  - Error recovery (network loss, invalid credentials)
  - Flow card execution

### Version Bumping

Follow semantic versioning for `version` in `.homeycompose/app.json`:

- **MAJOR**: Breaking changes to device capabilities or pairing flow
- **MINOR**: New device types, new capabilities, new flow cards
- **PATCH**: Bug fixes, performance improvements, non-breaking changes

Update `.homeychangelog.json` with user-facing release notes.

## Governance

### Amendment Process

This constitution may be amended when:

1. Homey SDK introduces breaking changes requiring pattern updates
2. New quality requirements emerge from Homey App Store review
3. Project scales require additional architectural principles

Amendments require:

- Documentation of rationale and impact
- Update to constitution version (semantic versioning)
- Propagation to dependent templates (plan, spec, tasks)
- Team review and approval

### Compliance Verification

All pull requests and code reviews MUST verify:

- Adherence to Homey integration quality standards (Principle I)
- Proper use of composition-based configuration (Principle II)
- TypeScript builds without errors (Principle III)
- API data validated with Zod schemas (Principle IV)
- Polling intervals within defined limits (Principle V)

### Complexity Justification

Violations of simplicity (e.g., introducing additional dependencies, complex abstractions) MUST be documented in implementation plans with:

- Why the complexity is needed
- What simpler alternative was rejected and why
- How the complexity will be maintained going forward

### Runtime Development Guidance

For day-to-day development guidance not covered by this constitution, refer to:

- `unraid_app_development.md` - Comprehensive Zod/TypeScript patterns, API client implementation, common pitfalls
- Homey SDK Documentation - https://developers.homey.app/
- `.github/copilot-instructions.md` - AI assistant guidance (if present)

**Version**: 1.0.0 | **Ratified**: 2025-12-28 | **Last Amended**: 2025-12-28
