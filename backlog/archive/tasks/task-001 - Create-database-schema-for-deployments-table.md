---
id: task-001
title: Create database schema for deployments table
status: Done
assignee:
  - "@myself"
created_date: "2025-09-24 04:53"
updated_date: "2025-09-24 05:17"
labels:
  - database
  - backend
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Design and implement the deployments table in Supabase with all required fields and relationships

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Database table 'deployments' exists with fields: id, name, configuration (JSON), version, short, created_at, created_by, modified_at, modified_by, device_id
- [x] #2 Foreign key relationship established between deployments.device_id and devices.id
- [x] #3 Appropriate indexes created for performance
- [x] #4 RLS policies configured for deployments table
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Analyze task requirements and existing database patterns\n2. Create SQL migration file for deployments table\n3. Define table structure with all required fields\n4. Add foreign key relationship to devices table\n5. Create appropriate indexes for performance\n6. Configure RLS policies following project patterns\n7. Test migration locally
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Successfully created the deployments table migration with all required specifications:

Database Schema Created:

- Table: public.deployments with all required fields
- Fields: id (UUID PK), device_id (FK), name, configuration (JSONB), version, short, created_at, created_by, modified_at, modified_by
- Used JSONB datatype for configuration field for better PostgreSQL performance

Relationships and Constraints:

- Foreign key constraint: deployments.device_id to devices.id with CASCADE DELETE
- Primary key constraint on id field
- All fields follow existing project naming conventions

Performance Optimization:

- Created strategic indexes on: device_id, name, version, created_at, modified_at, created_by, modified_by
- Used btree indexes for optimal query performance
- Primary key has dedicated unique index

Security and Access Control:

- RLS (Row Level Security) enabled following project patterns
- Four separate RLS policies for CRUD operations (select, insert, update, delete)
- Proper role permissions granted (anon, authenticated, postgres, service_role)
- Backend access via service role bypasses RLS as intended

Trigger Automation:

- Created dedicated function update_deployments_modified_at() for automatic timestamp updates
- Trigger automatically updates modified_at field on any record update
- Follows established pattern but adapted for correct field naming

File Created:

- Migration file: /home/oriol/iotgw-ui/supabase/migrations/20250924045700_deployments_table.sql
- Timestamped following project conventions
- Ready for deployment to Supabase environment
<!-- SECTION:NOTES:END -->
