---
id: decision-001
title: Frontend Technology Stack - React 19 and TanStack Ecosystem
date: "2025-08-24 11:59"
status: approved
---

## Context

The IoT Gateway UI requires a modern, type-safe frontend that can handle real-time data updates, complex form interactions, and provide an excellent developer experience. Key requirements include:

- Type safety between frontend and backend
- Real-time data synchronization for IoT device status
- Complex form handling with validation
- Internationalization support (English/Spanish)
- Modern UI components with consistent styling
- Fast development cycles and hot reloading
- Support for both light and dark themes

## Decision

**Frontend Framework**: React 19 with functional components and hooks

- Chosen over Vue.js and Angular for team familiarity and ecosystem maturity
- React 19 provides concurrent features and improved performance
- Hooks-based architecture for better composition and reusability

**Routing**: TanStack Router instead of React Router

- File-based routing with type-safe route definitions
- Better TypeScript integration and compile-time route validation
- Automatic code splitting and lazy loading capabilities

**State Management**: TanStack Query + tRPC

- Server state managed by TanStack Query for caching and synchronization
- Local state kept minimal with React's built-in hooks
- tRPC provides end-to-end type safety between frontend and backend

**Styling**: Tailwind CSS v4 with Shadcn/UI

- Utility-first CSS for rapid development and consistent design
- Tailwind v4 with native OKCLH color formats for better color management
- Shadcn/UI provides pre-built accessible components with Radix UI primitives

**Forms**: React Hook Form with Zod validation

- Performance-optimized uncontrolled components
- Zod schema validation shared between frontend and backend
- Excellent TypeScript integration

**Build Tool**: Vite

- Fast development server with instant hot module replacement
- Optimized production builds with tree shaking
- Native ES modules support

## Consequences

**Positive:**

- End-to-end type safety reduces runtime errors
- Excellent developer experience with fast builds and hot reloading
- Modern component architecture promotes reusability
- Consistent styling system with theme support
- Strong ecosystem and community support

**Negative:**

- Learning curve for developers not familiar with TanStack ecosystem
- Bundle size considerations with multiple libraries
- Potential over-engineering for simple forms

**Risks:**

- TanStack Router is newer than React Router, potential breaking changes
- React 19 is cutting edge, may have stability issues
- Heavy dependency on TanStack ecosystem for multiple concerns
