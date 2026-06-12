# Device Key Extraction Implementation

## Overview

This document describes the implementation of automatic extraction of device private and public keys from Ansible task output in Kestra execution logs.

## Problem Statement

When a device is created through the Netmaker Ansible workflow, the "Retrieve created device" task returns a JSON response containing the device's WireGuard private and public keys. These keys need to be extracted and stored in the database for later use.

## Solution

### 1. New Function: `extractDeviceKeysFromLogs()`

Located in: `/home/oriol/iotgw-ng/supabase/volumes/functions/kestra-call/index.ts`

This function performs the following steps:

1. **Fetch Execution Logs**: Retrieves all logs from the Kestra API for the given execution ID
2. **Filter Ansible Logs**: Filters for logs from the `docker-java-stream` thread (Ansible output)
3. **Locate Task**: Finds the "TASK [Retrieve created device]" section in the logs
4. **Extract JSON**: Collects all log lines from this task until the next task or play recap
5. **Parse Resource**: Extracts the `resource` JSON object from the task output
6. **Clean Timestamps**: Removes embedded timestamps that would break JSON parsing
7. **Extract Keys & IP**: Parses the JSON and retrieves `privatekey`, `publickey`, and any available device IP address (e.g., the `address` field)

### 2. Integration with Background Polling

The key extraction is triggered automatically when:
- A device creation workflow completes
- The execution status is `SUCCESS`
- Background polling detects the completion

The flow:

```typescript
pollExecutionUntilComplete()
  .then(async (finalStatus) => {
    // Update device_jobs table with final status
    
    if (finalStatus.state.current === 'SUCCESS' && tableParam === 'devices') {
      // Extract keys from logs
      const deviceKeys = await extractDeviceKeysFromLogs(executionId, transactionId)
      
      if (deviceKeys) {
        // Update devices table with private_key/public_key and IP if available
        const updates: Record<string, string> = {
          private_key: deviceKeys.privatekey,
          public_key: deviceKeys.publickey,
          updated_at: new Date().toISOString()
        }

        if (deviceKeys.address) {
          updates.ip_address = deviceKeys.address
        }

        await supabase
          .from('devices')
          .update(updates)
          .eq('id', deviceId)

        if (deviceKeys.address) {
          await supabase
            .from('device_jobs')
            .update({ device_ip_address: deviceKeys.address })
            .eq('execution_id', executionId)
        }
      }
    }
  })
```

## Log Format Handling

The Ansible task output looks like this:

```text
2025-11-13T05:51:09.497918Z
ok: [localhost] => {
2025-11-13T05:51:09.497920Z
    "changed": false,
2025-11-13T05:51:09.497922Z
    "invocation": {
        ...
    },
2025-11-13T05:51:09.498096Z
    "resource": {
2025-11-13T05:51:09.498099Z
        "address": "10.121.102.60",
        ...
2025-11-13T05:51:09.498185Z
        "privatekey": "REDACTED_EXAMPLE_PRIVATE_KEY_xxxxxxxxxxxxxxxxxxxx=",
        ...
2025-11-13T05:51:09.498195Z
        "publickey": "6b3rxLde9cpou2rMnaqfOxhTHBtlTonc8xC3ZrPK2WE=",
        ...
    }
}
```

### Parsing Strategy

1. Join all log lines into a single string
2. Find the `"resource": {` marker
3. Count braces to find the matching closing brace
4. Remove timestamp prefixes using regex: `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?\s*/gm`
5. Wrap in braces and parse as JSON
6. Extract the keys from the parsed object

## Error Handling

The implementation includes comprehensive error handling:

- **Logs Not Available**: Returns `null` if logs cannot be fetched
- **Task Not Found**: Returns `null` if "Retrieve created device" task is not found
- **Parse Errors**: Logs the error and first 500 characters of the JSON string for debugging
- **Database Errors**: Logs errors but doesn't fail the entire workflow
- **Key Extraction Failures**: Logged but don't prevent the job status update

All errors are logged with the transaction ID prefix for easy troubleshooting.

## Database Updates

When keys are successfully extracted, the `devices` table is updated with:

```sql
UPDATE devices 
SET 
  private_key = <extracted_privatekey>,
  public_key = <extracted_publickey>,
  ip_address = <extracted_address_if_available>,
  updated_at = <current_timestamp>
WHERE id = <device_id>
```

## Logging

The implementation includes detailed logging at each step:

- `[txId][extractDeviceKeys] Fetching logs for execution...`
- `[txId][extractDeviceKeys] Found X Ansible log entries`
- `[txId][extractDeviceKeys] Found "Retrieve created device" task at index X`
- `[txId][extractDeviceKeys] Successfully extracted keys`
- `[txId][BACKGROUND] Successfully updated device with private and public keys`

All log messages include the transaction ID prefix for correlation.

## Testing

To test this implementation:

1. Create a new device through the UI
2. Wait for the workflow to complete
3. Check the device record in the database to verify `private_key` and `public_key` are populated
4. Review the Edge Function logs to see the extraction process

Example log output:

```text
[abc12345][BACKGROUND] Execution succeeded, attempting to extract device keys...
[abc12345][extractDeviceKeys] Fetching logs for execution abc12345-...
[abc12345][extractDeviceKeys] Found "Retrieve created device" task at index 42
[abc12345][extractDeviceKeys] Successfully extracted keys
[abc12345][extractDeviceKeys] Private key: REDACTED_EXAMPLE...
[abc12345][extractDeviceKeys] Public key: 6b3rxLde9c...
[abc12345][BACKGROUND] Successfully updated device with private and public keys
```

## Future Enhancements

Possible improvements:

1. Store keys in a more secure location (e.g., encrypted at rest)
2. Add validation for key format (base64, proper length)
3. Extract additional device metadata (done for IP address; endpoint, etc. still pending)
4. Support for updating existing keys if device is recreated
5. Add retry logic if log parsing fails initially

## Related Files

- `/home/oriol/iotgw-ng/supabase/volumes/functions/kestra-call/index.ts` - Main implementation
- `/home/oriol/iotgw-ng/kestra/data/main/iotgw-ng/_files/device_update.yml` - Ansible playbook that creates the device
- Database tables: `devices`, `device_jobs`
