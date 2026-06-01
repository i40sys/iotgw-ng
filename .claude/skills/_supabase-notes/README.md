# Supabase Claude Code Skills

This directory contains Claude Code skills specifically designed for working with this Supabase deployment.

## Available Skills

### Edge Functions
- **create-edge-function** - Create a new Supabase edge function with proper TypeScript structure
- **test-edge-function** - Test a Supabase edge function with various scenarios
- **debug-edge-function** - Debug issues with a Supabase edge function
- **edge-function-with-db** - Create an edge function that interacts with the PostgreSQL database
- **view-function-logs** - View and analyze Supabase edge function logs

### Database
- **database-migration** - Create and run database migrations for Supabase PostgreSQL

### Storage
- **setup-storage-bucket** - Set up and configure a Supabase storage bucket with policies

### Realtime
- **setup-realtime** - Set up real-time subscriptions for database tables

### Authentication
- **setup-auth** - Configure authentication providers and policies in Supabase

### Services
- **manage-services** - Manage Supabase Docker services (start, stop, restart, logs, health)

## How to Use Skills

Skills can be invoked by Claude Code when working on relevant tasks. You can also explicitly request a skill by asking for it:

```
"Use the create-edge-function skill to create a new function"
"Help me debug my edge function using the debug skill"
"Set up realtime for my devices table"
```

## Skill Categories

### 🔧 Development
- Creating and modifying edge functions
- Database migrations
- Testing and debugging

### 📊 Operations
- Managing Docker services
- Viewing logs
- Monitoring health

### 🔐 Security & Auth
- Setting up authentication
- Configuring storage policies
- Managing RLS policies

### ⚡ Real-time
- Configuring real-time subscriptions
- Setting up presence
- Broadcast channels

## Quick Start Examples

**Create a new edge function:**
```
"Create an edge function called 'send-notification' that sends email notifications"
```

**Debug an issue:**
```
"My kestra-call function is timing out, help me debug it"
```

**Set up database table:**
```
"Create a migration for a 'products' table with realtime enabled"
```

**Configure storage:**
```
"Set up a storage bucket for user avatars with a 5MB size limit"
```

## Tips

1. Skills work best when you provide context about what you're trying to achieve
2. Multiple skills can be used together (e.g., create function + test function)
3. Skills follow best practices for Supabase development
4. All skills include detailed examples and common patterns
5. Error handling and security considerations are built into skill templates

## Customizing Skills

Skills are markdown files that can be edited to match your specific needs. Feel free to:
- Add project-specific patterns
- Update default configurations
- Add custom validation rules
- Include your own best practices

## Support

For issues or questions about Supabase, refer to:
- [Supabase Documentation](https://supabase.com/docs)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Database Guide](https://supabase.com/docs/guides/database)
- The CLAUDE.md file in the repository root
