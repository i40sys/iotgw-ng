#!/bin/bash

# Database Reset and Webhook Setup Script
#
# This script performs a complete database reset followed by webhook configuration.
# It ensures your database schema and webhooks are in sync.
#
# Prerequisites in supabase/.env file:
# - ANON_KEY: Already present in the file
# - SUPABASE_ACCESS_TOKEN: Personal access token for Management API
# - SUPABASE_PROJECT_REF: Your project reference ID
#
# Prerequisites in .env file:
# - DATABASE_URL: PostgreSQL connection string
# - PGSSLMODE: SSL mode (usually "disable" for local)

set -e  # Exit on error

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get the project root (parent of scripts directory)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# Get the parent of project root (where supabase folder is)
PARENT_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

echo "🚀 Database Reset (Self-Hosted Supabase)"
echo "========================================="
echo ""

# Load environment variables from project .env file
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found in $PROJECT_ROOT"
  exit 1
fi
set -a
source .env
set +a

if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: DATABASE_URL not found in .env file"
  exit 1
fi

echo "📊 Configuration:"
echo "   Database: $DATABASE_URL"
echo ""

# Reset database (migrations include webhook triggers)
echo "📦 Resetting database and applying migrations..."
echo "------------------------------------------------"

if ! PGSSLMODE=disable npx supabase@latest db reset --db-url "$DATABASE_URL" <<< "y"; then
  echo ""
  echo "❌ Database reset failed!"
  exit 1
fi

echo ""
echo "✨ All done!"
echo ""
echo "📋 Summary:"
echo "   ✅ Database schema reset and migrations applied"
echo "   ✅ PostgreSQL triggers created for devices and networks tables"
echo "   ✅ Triggers will automatically call kestra-call edge function on INSERT/UPDATE"
echo ""
echo "🧪 Next steps:"
echo "   1. Test by inserting a device or network record"
echo "   2. Check PostgreSQL logs for trigger execution notices"
echo "   3. Verify job records in device_jobs or network_jobs tables"
echo ""
