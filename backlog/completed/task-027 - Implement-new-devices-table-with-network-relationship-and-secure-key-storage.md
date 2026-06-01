---
id: task-027
title: Implement new devices table with network relationship and secure key storage
status: Done
assignee:
  - "@oriol"
created_date: "2025-09-22 09:33"
updated_date: "2025-09-22 09:47"
labels:
  - devices
  - database
  - migration
  - security
  - backend
  - frontend
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Redesign the devices table to support the network-based IoT Gateway architecture with proper relationships to networks, secure storage for device keys, and comprehensive CRUD operations. This replaces the existing simple devices table with a full-featured implementation that follows the established patterns from domains and networks.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Database migration drops existing devices table and creates new one with required fields
- [x] #2 New devices table includes name, description, ip_address, private_key, public_key, and network_id fields
- [x] #3 IP address has unique constraint per network (not globally unique)
- [x] #4 Private key storage is encrypted/secure in the database
- [x] #5 Network_id foreign key relationship with CASCADE delete is properly configured
- [x] #6 TypeScript types are updated in supabase-contract package with all device types
- [x] #7 Backend tRPC router implements full CRUD operations (create, read, update, delete)
- [x] #8 Backend router includes proper validation for all fields and constraints
- [x] #9 Backend router handles all database errors with appropriate tRPC error codes
- [x] #10 Device operations are properly secured with appropriate permissions
- [x] #11 UI components support device management with proper network relationship display
- [x] #12 Device forms validate IP address uniqueness within the selected network
- [x] #13 Private key is handled securely in the UI (masked input, proper storage)
- [x] #14 All device operations integrate with existing navigation and routing
- [x] #15 Database schema changes are reflected in generated types
- [x] #16 All tests pass and build succeeds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Database Schema Design and Migration

   - Create new devices table structure with proper fields and relationships
   - Implement secure key storage (encrypted private keys)
   - Add unique constraints for IP addresses per network
   - Set up CASCADE delete for network relationships

2. Backend Implementation

   - Generate updated TypeScript types from new schema
   - Create tRPC router for devices with full CRUD operations
   - Implement proper validation for all fields and network constraints
   - Add secure handling of private keys in API layer
   - Implement proper error handling and tRPC error codes

3. Frontend Implementation

   - Create device management UI components following established patterns
   - Build device forms with network relationship selection
   - Implement IP address validation within network scope
   - Add secure private key input handling (masked, proper storage)
   - Create device list/table view with network information display

4. Integration and Testing
   - Integrate device management with existing navigation
   - Update routing to include device pages
   - Run database migration and verify schema changes
   - Test all CRUD operations end-to-end
   - Verify proper error handling and validation
   - Ensure all tests pass and build succeeds
   <!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Implementation completed successfully:

• Created new devices table with proper schema and relationships - Implemented comprehensive database schema with name, description, ip_address, private_key, public_key, and network_id fields with proper foreign key constraints and CASCADE delete behavior

• Implemented full CRUD operations in tRPC backend - Built complete tRPC router with create, read, update, and delete procedures including proper Zod validation, error handling, and tRPC error codes for all database operations

• Built complete UI with create/read/update/delete functionality - Developed comprehensive device management interface following established patterns from domains and networks, with proper form validation and error handling

• Added secure key management with masked private key inputs - Implemented secure handling of private keys with masked input fields in the UI and proper encryption/storage patterns in the database

• Integrated with existing navigation and routing system - Updated application navigation to include device management pages and integrated with existing routing structure

• All tests pass and builds successfully - Verified that all existing tests continue to pass and the application builds without errors after implementing the new devices functionality

The implementation follows all established patterns from the codebase and maintains consistency with the domains and networks modules already in place.

<!-- SECTION:NOTES:END -->
