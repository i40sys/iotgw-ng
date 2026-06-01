---
id: TASK-038
title: Implement SSH key cleanup job for orphaned KMS keys
status: To Do
assignee: []
created_date: '2026-03-02 05:23'
updated_date: '2026-03-02 05:24'
labels:
  - kestra
  - kms
  - maintenance
  - security
dependencies:
  - TASK-040
  - TASK-039
references:
  - >-
    backlog/decisions/decision-010 -
    ADR-001-SSH-Key-Management-with-Cosmian-KMS.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a background job/scheduled task that identifies and cleans up orphaned SSH keys in Cosmian KMS - keys that exist in KMS but no longer have a corresponding device record in Supabase.

## Background

As defined in decision-010 (ADR-001 - SSH Key Management with Cosmian KMS), SSH keys are stored in KMS with references in Supabase. When devices are deleted, keys may become orphaned if the deletion workflow fails or is incomplete. A cleanup job ensures KMS doesn't accumulate unused keys.

## Technical Implementation

### Option A: Kestra Scheduled Workflow

Create a scheduled Kestra flow that runs periodically:

```yaml
id: ssh-key-cleanup
namespace: iotgw-ng
description: Cleanup orphaned SSH keys from KMS

triggers:
  - id: daily_cleanup
    type: io.kestra.plugin.core.trigger.Schedule
    cron: "0 3 * * *"  # Run at 3 AM daily

tasks:
  - id: list_kms_keys
    type: io.kestra.plugin.scripts.shell.Commands
    description: List all device SSH keys in KMS
    commands:
      - |
        cosmian kms ec keys search --tag ssh-key --tag "device-*" -o json > /tmp/kms_keys.json
        cat /tmp/kms_keys.json

  - id: list_supabase_devices
    type: io.kestra.plugin.scripts.shell.Commands
    description: Get all device IDs from Supabase
    commands:
      - |
        curl -s "${SUPABASE_URL}/rest/v1/devices?select=id,ssh_key_id" \
          -H "apikey: ${SUPABASE_SERVICE_KEY}" \
          -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
          > /tmp/devices.json
        cat /tmp/devices.json

  - id: find_orphaned_keys
    type: io.kestra.plugin.scripts.python.Script
    description: Compare and identify orphaned keys
    script: |
      import json
      
      with open('/tmp/kms_keys.json') as f:
          kms_keys = json.load(f)
      
      with open('/tmp/devices.json') as f:
          devices = json.load(f)
      
      device_key_ids = {d['ssh_key_id'] for d in devices if d.get('ssh_key_id')}
      
      orphaned = []
      for key in kms_keys:
          if key['id'] not in device_key_ids:
              orphaned.append(key['id'])
      
      with open('/tmp/orphaned_keys.json', 'w') as f:
          json.dump(orphaned, f)
      
      print(f"Found {len(orphaned)} orphaned keys")

  - id: revoke_orphaned_keys
    type: io.kestra.plugin.scripts.shell.Commands
    description: Revoke orphaned keys in KMS
    commands:
      - |
        for key_id in $(jq -r '.[]' /tmp/orphaned_keys.json); do
          echo "Revoking orphaned key: ${key_id}"
          cosmian kms ec keys revoke -k "${key_id}" --revocation-reason "cessation_of_operation"
        done

  - id: destroy_revoked_keys
    type: io.kestra.plugin.scripts.shell.Commands
    description: Destroy revoked keys after grace period
    commands:
      - |
        # Only destroy keys revoked more than 7 days ago
        cosmian kms ec keys search --tag ssh-key --revoked --revoked-before "7 days ago" -o json | \
        jq -r '.[].id' | while read key_id; do
          echo "Destroying revoked key: ${key_id}"
          cosmian kms ec keys destroy -k "${key_id}"
        done
```

### Option B: Supabase Database Trigger + Edge Function

Alternative: Use Supabase trigger on device deletion to immediately revoke key:

```sql
-- Trigger function to revoke SSH key on device deletion
CREATE OR REPLACE FUNCTION revoke_device_ssh_key()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.ssh_key_id IS NOT NULL THEN
    -- Call Edge Function to revoke key in KMS
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/kms-revoke-key',
      body := json_build_object('key_id', OLD.ssh_key_id)::text
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER device_delete_revoke_ssh_key
  BEFORE DELETE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION revoke_device_ssh_key();
```

### Logging and Alerting

- Log all revocation and destruction operations
- Alert if orphaned key count exceeds threshold
- Generate weekly report of cleanup actions

## Key Lifecycle States

| State | Description | Action |
|-------|-------------|--------|
| Active | Key in use by device | None |
| Orphaned | Key exists but device deleted | Revoke |
| Revoked | Key revoked, in grace period | Wait |
| Destroyed | Key permanently removed | N/A |
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cleanup mechanism implemented (Kestra scheduled workflow or DB trigger)
- [ ] #2 Job identifies orphaned keys by comparing KMS inventory to Supabase devices
- [ ] #3 Orphaned keys are revoked with appropriate revocation reason
- [ ] #4 Revoked keys destroyed after configurable grace period (default 7 days)
- [ ] #5 Cleanup runs on schedule (e.g., daily at 3 AM)
- [ ] #6 All operations logged with key IDs and timestamps
- [ ] #7 Alerting configured for high orphaned key counts
- [ ] #8 Dry-run mode available for testing without actual revocation
- [ ] #9 Documentation for manual cleanup procedures
- [ ] #10 Metrics exposed for monitoring (keys revoked, destroyed, errors)
- [ ] #11 Error handling for KMS API failures
- [ ] #12 Idempotent execution (safe to run multiple times)
<!-- AC:END -->
