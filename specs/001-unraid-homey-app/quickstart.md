# Quickstart: Unraid Homey App Development

## Prerequisites

- VS Code with Dev Containers extension
- Docker Desktop running
- Node.js 18+ (provided by dev container)
- Homey CLI (installed by setup script)

## Setup

1. **Open in Dev Container**
   ```bash
   # Open VS Code, then:
   # Command Palette → "Dev Containers: Reopen in Container"
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Setup Script** (first time only)
   ```bash
   ./scripts/setup.sh
   ```

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `.homeybuild/` |
| `npm run lint` | Run ESLint (must pass with zero errors/warnings) |
| `homey app run` | Run app on connected Homey device |
| `homey app validate` | Validate app manifest and structure |

## Project Structure Quick Reference

```
.homeycompose/          # Source of truth for app manifest
├── app.json            # Base app config (SDK, version, permissions)
├── capabilities/       # Custom capability definitions
├── drivers/            # Driver compose files
│   ├── unraid-server/
│   ├── docker-container/
│   └── virtual-machine/
└── flow/               # Flow card definitions

lib/                    # Shared TypeScript utilities
├── api/                # GraphQL client and queries
├── schemas/            # Zod validation schemas
└── utils/              # Helpers (polling, formatting)

drivers/                # Driver implementations
├── unraid-server/      # Main server device + pairing
├── docker-container/   # Container device
└── virtual-machine/    # VM device
```

## Key Patterns

### Zod Schema with Forward Compatibility

```typescript
// Always use .passthrough() for API responses
const ResponseSchema = z.object({
  knownField: z.string(),
}).passthrough(); // Ignores unknown fields from API
```

### Polling with Backoff

```typescript
// In device.ts
private pollInterval: NodeJS.Timeout | null = null;
private retryCount = 0;

async onInit() {
  this.startPolling();
}

async onDeleted() {
  this.stopPolling(); // CRITICAL: Always clean up timers
}

private startPolling() {
  this.pollInterval = setInterval(() => this.poll(), 30000);
}
```

### Device Capability Updates

```typescript
// Use setCapabilityValue for all updates
await this.setCapabilityValue('measure_cpu', cpuUsage);
await this.setCapabilityValue('measure_temperature', temp);

// Use setAvailable/setUnavailable for connection state
await this.setUnavailable('Connection lost');
await this.setAvailable();
```

### Logging

```typescript
// Use Homey's built-in logging
this.log('Device initialized');
this.error('Failed to connect:', err.message);
```

## Testing Workflow

1. **Unit Tests** (Zod schemas)
   ```bash
   npm test
   ```

2. **Manual Testing**
   ```bash
   homey app run  # Connect to Homey and test live
   ```

3. **Validate Before Commit**
   ```bash
   npm run build && npm run lint && homey app validate
   ```

## Common Tasks

### Add a New Capability

1. Create `.homeycompose/capabilities/my_capability.json`
2. Add to driver's `driver.compose.json` capabilities array
3. Run `homey app build` to regenerate `app.json`

### Add a New Flow Card

1. Create `.homeycompose/flow/triggers/my_trigger.json`
2. Register handler in driver/device `onInit()`
3. Add localization in `.homeycompose/locales/en.json`

### Debug API Issues

```typescript
// Temporarily add verbose logging
this.log('API Response:', JSON.stringify(response, null, 2));
```

## Constitution Reminders

- ✅ Never edit `app.json` directly (it's generated)
- ✅ All API data must be validated with Zod schemas
- ✅ System metrics poll max every 30s, storage min every 5min
- ✅ Always clean up timers in `onDeleted()`
- ✅ Zero tolerance for linting errors
