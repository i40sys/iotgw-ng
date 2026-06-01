---
id: TASK-032
title: Add ssh_key_id column to devices table
status: Done
assignee:
  - '@claude'
created_date: '2026-03-02 05:23'
updated_date: '2026-03-02 05:38'
labels:
  - database
  - migration
  - kms
  - security
dependencies: []
references:
  - >-
    backlog/decisions/decision-010 -
    ADR-001-SSH-Key-Management-with-Cosmian-KMS.md
documentation:
  - backlog/docs/doc-010 - Database Migration and Webhook Management Guide.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a Supabase migration to add the `ssh_key_id` column to the devices table. This column will store the Cosmian KMS object identifier that references the device's SSH key pair. The actual key material is never stored in Supabase - only the KMS reference.

## Background

As defined in decision-010 (ADR-001 - SSH Key Management with Cosmian KMS), we are implementing SSH key management using Cosmian KMS. The `ssh_key_id` column serves as the link between a device record and its corresponding SSH key stored securely in KMS.

## Technical Details

- Column name: `ssh_key_id`
- Type: `VARCHAR(255)` or `TEXT`
- Nullable: `YES` (existing devices won't have keys initially)
- Format: KMS object identifier (e.g., `device_ssh_<device_uuid>`)

## Migration SQL

```sql
-- Migration: add_ssh_key_id_to_devices
ALTER TABLE devices ADD COLUMN ssh_key_id VARCHAR(255) NULL;

COMMENT ON COLUMN devices.ssh_key_id IS 
  'Reference to SSH key object in Cosmian KMS. Contains the KMS object identifier, not key material. Format: device_ssh_<device_id>';

-- Optional: Add index for lookups
CREATE INDEX idx_devices_ssh_key_id ON devices(ssh_key_id) WHERE ssh_key_id IS NOT NULL;
```

## Related Files

- `supabase/migrations/` - New migration file
- `packages/supabase-contract/src/database.types.ts` - Will be auto-generated after migration
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Migration file created in supabase/migrations/ with proper timestamp naming
- [x] #2 Column ssh_key_id added to devices table as VARCHAR(255) NULL
- [x] #3 Column has descriptive comment explaining its purpose
- [x] #4 Index created for non-null ssh_key_id values
- [x] #5 Migration tested locally with `supabase db reset`
- [x] #6 Contract types regenerated with `pnpm generate:contract`
- [x] #7 TypeScript types include ssh_key_id as string | null in Device type
- [x] #8 Existing device records unaffected (NULL values for ssh_key_id)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create migration file in supabase/migrations/ with timestamp naming (YYYYMMDDHHMMSS_description.sql)
2. Migration SQL includes:
   - ALTER TABLE to add ssh_key_id VARCHAR(255) NULL
   - COMMENT ON COLUMN for documentation
   - CREATE INDEX with WHERE clause for non-null values
3. Test migration locally: pnpm db:reset (requires local Supabase running)
4. Regenerate TypeScript types: pnpm generate:contract
5. Verify types compile: pnpm typecheck
6. Confirm Device type includes ssh_key_id: string | null
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Completed

**Migration file**: `supabase/migrations/20260302000000_add_ssh_key_id_to_devices.sql`

### Database Changes
- Added `ssh_key_id` column (VARCHAR(255), NULL)
- Added column comment documenting KMS reference purpose
- Created partial index `idx_devices_ssh_key_id` for non-null values

### Verification
- Column exists in database: ✅
- 12 existing devices have NULL ssh_key_id: ✅
- TypeScript types regenerated with `ssh_key_id: string | null`: ✅

### Note
`pnpm typecheck` shows 4 pre-existing errors in `deployments.ts` unrelated to this migration (already modified in working tree before this task).
<!-- SECTION:NOTES:END -->
