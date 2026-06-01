---
id: decision-011
title: Get debug of the connectivity check button
type: other
created_date: '2025-11-27 08:33'
---
# Get debug of the connectivity check button

## Decision

Use environment variable `LOG_LEVEL` to control logging verbosity across the backend application. Debug-level logging is disabled by default and must be explicitly enabled.

## Context

During development of the device connectivity check feature (task-007, task-008), detailed debug logging was needed to troubleshoot Kestra workflow output parsing. Initially, this was implemented by writing to a dedicated `connectivity-debug.log` file, but this approach had drawbacks:

- Creates files on disk that need manual cleanup
- Not integrated with the existing pino logger
- Always writes regardless of environment
- Difficult to enable/disable dynamically

## Solution

### Environment Variable

Set `LOG_LEVEL=debug` to enable debug-level logging:

```bash
# Enable debug logging
LOG_LEVEL=debug pnpm dev

# Or in .env file
LOG_LEVEL=debug
```

### Valid Log Levels

Pino supports the following log levels (from most to least verbose):

- `trace` - Most detailed logging
- `debug` - Debug information (connectivity checks, Kestra responses)
- `info` - General informational messages (default)
- `warn` - Warning messages
- `error` - Error messages only
- `fatal` - Critical errors only
- `silent` - No logging

### Connectivity Check Debug Logs

When `LOG_LEVEL=debug` is set, the device connectivity check procedure logs:

- Kestra workflow execution requests and responses
- Poll status for each execution check
- Task run list parsing details
- ICMP ping and Ansible task output extraction
- Final parsed results

Example debug output:
```
DEBUG [connectivity] Step 1: Fetching device information from Supabase...
DEBUG [connectivity] Device found: {"id":"...","name":"iotgw-m3v5",...}
DEBUG [connectivity] Step 2: Calling Kestra workflow...
DEBUG [connectivity] Kestra URL: http://...
DEBUG [connectivity] Poll #1 state: running
DEBUG [connectivity] ICMP Ping task found: yes
DEBUG [connectivity] Parsed ping result: success=true, latency=95.6
DEBUG [connectivity] Ansible task found: yes
DEBUG [connectivity] Parsed ansible result: success=true
```

### Implementation Details

1. **Logger Configuration** (`apps/backend/src/logger.ts`):
   - Reads `LOG_LEVEL` environment variable
   - Defaults to `info` if not set
   - Applies level to both development (pino-pretty) and production configurations

2. **Debug Log Function** (`apps/backend/src/routers/devices.ts`):
   - Checks if `LOG_LEVEL === "debug"`
   - Uses `logger.debug()` with `{ connectivity: true }` context
   - No file I/O - uses standard pino logger

## Consequences

### Positive

- No debug log files created in production
- Integrated with existing pino logging infrastructure
- Easy to enable/disable via environment variable
- Consistent with standard logging practices
- Debug logs include timestamps and can be piped to log aggregation systems

### Negative

- Requires restart to change log level (no runtime toggle)
- Debug output goes to stdout/stderr, not a separate file

## Related

- Task-007: Backend procedure for device connectivity check
- Task-008: Check Online button with status indicator
