# Supabase Skills Guide

This guide explains how to use the Claude Code skills created for this Supabase deployment.

## What Are Skills?

Skills are specialized prompts that guide Claude Code through common development tasks in your Supabase environment. They provide structured, step-by-step workflows for edge functions, database operations, authentication, real-time features, and more.

## Available Skills

### 🚀 Edge Functions (5 skills)

1. **create-edge-function**
   - Creates a new edge function with TypeScript structure
   - Includes CORS handling, error handling, and type definitions
   - Generates README and testing instructions
   - Example: *"Create an edge function called 'send-email' that sends notifications"*

2. **test-edge-function**
   - Tests edge functions with various scenarios
   - Creates test cases for valid, invalid, and edge cases
   - Monitors logs during testing
   - Example: *"Test the kestra-call function with different inputs"*

3. **debug-edge-function**
   - Systematic debugging of edge function issues
   - Checks code, logs, environment variables, and network
   - Identifies common issues (CORS, auth, timeouts, imports)
   - Example: *"Debug why my function is returning 500 errors"*

4. **edge-function-with-db**
   - Creates functions that interact with PostgreSQL
   - Shows both Supabase client and direct postgres patterns
   - Includes connection pooling and transaction examples
   - Example: *"Create a function to query and update the devices table"*

5. **view-function-logs**
   - Analyzes and filters edge function logs
   - Searches for errors, performance issues, patterns
   - Exports and correlates logs with other services
   - Example: *"Show me the error logs from the last hour"*

### 🗄️ Database (1 skill)

6. **database-migration**
   - Creates SQL migration files
   - Follows best practices (transactions, idempotency, RLS)
   - Handles both initialization and runtime migrations
   - Example: *"Create a migration for a users table with RLS policies"*

### 📦 Storage (1 skill)

7. **setup-storage-bucket**
   - Creates storage buckets with policies
   - Configures file size limits and MIME types
   - Creates upload/download edge functions
   - Example: *"Set up a public bucket for user avatars, max 5MB"*

### ⚡ Real-time (1 skill)

8. **setup-realtime**
   - Enables real-time subscriptions on tables
   - Configures RLS for real-time
   - Provides client-side examples
   - Example: *"Enable real-time on the messages table"*

### 🔐 Authentication (1 skill)

9. **setup-auth**
   - Configures email/password, OAuth, phone auth
   - Creates user profile tables and triggers
   - Sets up custom access token hooks
   - Example: *"Set up email authentication with password reset"*

### 🛠️ Services (1 skill)

10. **manage-services**
    - Manages Docker services (start, stop, restart)
    - Views logs and checks health
    - Handles troubleshooting
    - Example: *"Restart the edge functions service"*

## How to Use Skills

### Method 1: Natural Requests

Just describe what you want to do, and Claude Code will use the appropriate skill:

```
"I need to create a new edge function that validates webhook signatures"
→ Uses create-edge-function skill

"Why is my function timing out?"
→ Uses debug-edge-function skill

"Set up a private storage bucket for documents"
→ Uses setup-storage-bucket skill
```

### Method 2: Explicit Skill Request

You can explicitly ask for a skill:

```
"Use the create-edge-function skill to create a new function"
"Debug my edge function using the debug skill"
"Help me set up authentication"
```

### Method 3: Combined Skills

Multiple skills work together:

```
"Create an edge function that queries the database and test it"
→ Uses create-edge-function + edge-function-with-db + test-edge-function

"Set up a products table with realtime and create a migration"
→ Uses database-migration + setup-realtime
```

## Common Workflows

### Creating a New Feature

1. **Database**: Use `database-migration` to create tables
2. **Realtime**: Use `setup-realtime` to enable subscriptions
3. **Edge Function**: Use `create-edge-function` or `edge-function-with-db`
4. **Testing**: Use `test-edge-function` to verify
5. **Debugging**: Use `debug-edge-function` if issues arise

### Setting Up User Features

1. **Auth**: Use `setup-auth` for authentication
2. **Storage**: Use `setup-storage-bucket` for avatars/files
3. **Database**: Create user profile tables
4. **Realtime**: Enable real-time for user presence

### Troubleshooting

1. **Logs**: Use `view-function-logs` to see what's happening
2. **Debug**: Use `debug-edge-function` for systematic debugging
3. **Services**: Use `manage-services` to restart or check health

## Skill Features

All skills include:
- ✅ Step-by-step instructions
- ✅ Code examples and templates
- ✅ Best practices and security considerations
- ✅ Testing procedures
- ✅ Common issues and solutions
- ✅ Command references
- ✅ Checklists for verification

## Examples by Use Case

### Use Case: Build a Chat Application

```
1. "Create a migration for a messages table with user_id, room_id, and content"
2. "Enable realtime on the messages table"
3. "Create an edge function that sends messages and notifies users"
4. "Set up authentication with email/password"
5. "Create a storage bucket for chat attachments"
```

### Use Case: IoT Device Management

```
1. "Create a migration for devices and telemetry tables"
2. "Create an edge function that receives device data and stores it"
3. "Enable realtime on the telemetry table for live updates"
4. "Set up authentication for device registration"
```

### Use Case: E-commerce API

```
1. "Create migrations for products, orders, and customers tables"
2. "Create edge functions for CRUD operations on products"
3. "Set up storage for product images"
4. "Create an edge function that processes orders with database transactions"
5. "Set up authentication with OAuth for social login"
```

## Tips for Best Results

1. **Be Specific**: The more context you provide, the better the result
   - Good: *"Create a function that validates webhook signatures from Stripe"*
   - Better: *"Create an edge function that validates Stripe webhook signatures using the webhook secret and returns the parsed event"*

2. **Mention Constraints**: Include any specific requirements
   - *"Create a function with a 30-second timeout"*
   - *"The table needs RLS policies for multi-tenant access"*

3. **Ask for Testing**: Always verify your work
   - *"Create and test an edge function for sending emails"*

4. **Iterate**: Skills can be used multiple times
   - *"Now add error handling to that function"*
   - *"Add logging for debugging"*

5. **Combine Skills**: Many tasks need multiple skills
   - *"Set up a complete user system with auth, profiles table, and avatar storage"*

## Customizing Skills

Skills are markdown files in `.claude/skills/`. You can:
- Edit existing skills to match your patterns
- Add project-specific requirements
- Include your own conventions
- Reference internal documentation

## Troubleshooting

**Skill not working?**
- Ensure you're in the correct directory
- Check that skill files exist in `.claude/skills/`
- Provide more context about your goal

**Need a skill that doesn't exist?**
- Describe what you need, and Claude Code can help create a new skill
- Request modifications to existing skills

**Want to see what a skill does?**
- Ask: *"Show me the create-edge-function skill"*
- Or read the skill files directly in `.claude/skills/`

## Support

- **CLAUDE.md**: Architecture and setup guide
- **README.md**: General Supabase documentation
- **.claude/skills/README.md**: Skills overview
- **This file**: How to use skills effectively

## Quick Reference Card

| Task | Skill | Example |
|------|-------|---------|
| New function | create-edge-function | *"Create a function for webhooks"* |
| Database table | database-migration | *"Create a users table"* |
| File uploads | setup-storage-bucket | *"Set up image storage"* |
| Live updates | setup-realtime | *"Enable realtime on messages"* |
| User login | setup-auth | *"Set up email authentication"* |
| Function error | debug-edge-function | *"Debug timeout error"* |
| View errors | view-function-logs | *"Show recent errors"* |
| Service issue | manage-services | *"Restart functions service"* |
| Test function | test-edge-function | *"Test my webhook function"* |
| DB + function | edge-function-with-db | *"Create function to query devices"* |

---

**Remember**: Skills are here to help you work faster and follow best practices. Don't hesitate to use them for any Supabase development task!
