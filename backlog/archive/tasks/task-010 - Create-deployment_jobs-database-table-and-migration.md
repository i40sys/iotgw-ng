---
id: task-010
title: Create deployment_jobs database table and migration
status: Done
assignee:
  - "@myself"
created_date: "2025-10-02 04:54"
updated_date: "2025-10-02 08:34"
labels:
  - database
  - backend
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Create a new database table 'deployment_jobs' to store the historical execution records from Kestra deployments. This table will track each deployment execution triggered from the Deployment Form, storing a complete snapshot of all related information at the time of execution. The table uses denormalized data (copies rather than foreign keys) to preserve historical accuracy even if devices, networks, domains, or configurations are modified or deleted after execution.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Table includes execution tracking fields: id (uuid PK), execution_id (text, Kestra execution ID), flow_id (text, Kestra flow ID), status (text), started_at (timestamptz), completed_at (timestamptz), error_message (text)
- [x] #2 Table includes denormalized device snapshot: device_id (uuid, copied not FK), device_name (text), device_description (text), device_ip_address (text)
- [x] #3 Table includes denormalized network snapshot: network_id (uuid, copied not FK), network_name (text), network_cidr (text), network_ipv4 (text), network_ipv6 (text)
- [x] #4 Table includes denormalized domain snapshot: domain_id (uuid, copied not FK), domain_name (text), domain_display_name (text)
- [x] #5 Table includes deployment snapshot: deployment_id (uuid, copied not FK), deployment_name (text), deployment_version (text), configuration_json (jsonb, complete copy of deployment configuration)
- [x] #6 Table includes metadata fields: created_by (uuid), created_at (timestamptz with default now())
- [x] #7 Appropriate indexes created on: execution_id (unique), status, device_id, started_at, created_at for optimal query performance
- [x] #8 RLS policies follow existing patterns with separate policies for SELECT, INSERT, UPDATE operations for authenticated users
- [x] #9 Migration file follows naming convention YYYYMMDDHHMMSS_create_deployment_jobs.sql and includes all grants for anon, authenticated, postgres, and service_role roles
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Analyze existing migration patterns and table structures\n2. Create migration file with timestamp naming convention\n3. Define deployment_jobs table with all required fields (execution tracking, device snapshot, network snapshot, domain snapshot, deployment snapshot, metadata)\n4. Add appropriate indexes for optimal query performance\n5. Configure RLS policies following established patterns\n6. Grant permissions to all required roles (anon, authenticated, postgres, service_role)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Created migration file /home/oriol/iotgw-ui/supabase/migrations/20251002051200_create_deployment_jobs.sql with complete deployment_jobs table definition.

Key implementation details:

- Table uses denormalized structure (no foreign keys) to preserve historical data integrity
- All snapshots store copies of data at execution time (device, network, domain, deployment)
- Network fields follow AC specification: network_cidr, network_ipv4, network_ipv6
- Comprehensive indexing strategy for optimal query performance:
  - Unique index on execution_id to prevent duplicate Kestra executions
  - Performance indexes on status, device_id, started_at, created_at
- RLS policies follow established project pattern with separate policies for SELECT, INSERT, UPDATE, DELETE operations
- Complete permission grants for all required roles: anon, authenticated, postgres, service_role
- Migration file naming follows YYYYMMDDHHMMSS_create_deployment_jobs.sql convention

The table is ready to store complete execution history from Kestra deployments with all contextual information frozen at the time of execution.

<!-- SECTION:NOTES:END -->
