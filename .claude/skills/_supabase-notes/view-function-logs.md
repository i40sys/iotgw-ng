---
description: View and analyze Supabase edge function logs
---

# View Function Logs Skill

You are helping view and analyze Supabase edge function logs. Follow these steps:

1. **Identify the scope**:
   - All functions or specific function?
   - Recent logs or specific time period?
   - Looking for errors or all logs?
   - Need to follow in real-time?

2. **Basic log viewing**:

   **All function logs (real-time)**:
   ```bash
   docker compose logs -f supabase-edge-functions
   ```

   **Last N lines**:
   ```bash
   docker compose logs --tail=100 supabase-edge-functions
   ```

   **Specific time range**:
   ```bash
   docker compose logs --since="2024-01-01T10:00:00" supabase-edge-functions
   ```

   **Save logs to file**:
   ```bash
   docker compose logs supabase-edge-functions > function-logs.txt
   ```

3. **Filter for specific function**:
   ```bash
   # Filter by function name
   docker compose logs -f supabase-edge-functions | grep "kestra-call"

   # Filter out function name
   docker compose logs -f supabase-edge-functions | grep -v "hello"
   ```

4. **Filter by log level**:
   ```bash
   # Errors only
   docker compose logs -f supabase-edge-functions | grep -i error

   # Warnings and errors
   docker compose logs -f supabase-edge-functions | grep -iE "error|warn"
   ```

5. **Filter by transaction/request ID**:
   ```bash
   # If your functions use transaction IDs
   docker compose logs -f supabase-edge-functions | grep "TXN:12345678"

   # If using request IDs
   docker compose logs -f supabase-edge-functions | grep "REQUEST abc123"
   ```

6. **Analyze common patterns**:

   **Function startup**:
   ```bash
   docker compose logs supabase-edge-functions | grep "function started"
   ```

   **HTTP requests**:
   ```bash
   docker compose logs supabase-edge-functions | grep -E "POST|GET|PUT|DELETE"
   ```

   **Database errors**:
   ```bash
   docker compose logs supabase-edge-functions | grep -i "database error"
   ```

   **Timeout issues**:
   ```bash
   docker compose logs supabase-edge-functions | grep -i timeout
   ```

   **CORS issues**:
   ```bash
   docker compose logs supabase-edge-functions | grep -i cors
   ```

7. **Advanced filtering with awk/sed**:

   **Show only timestamps and errors**:
   ```bash
   docker compose logs supabase-edge-functions | grep -i error | awk '{print $1, $2, $3}'
   ```

   **Count errors per function**:
   ```bash
   docker compose logs supabase-edge-functions | grep -i error | grep -oP '\w+-\w+ function' | sort | uniq -c
   ```

   **Extract JSON logs** (if functions output JSON):
   ```bash
   docker compose logs supabase-edge-functions | grep -o '{.*}' | jq '.'
   ```

8. **Monitor logs in real-time with highlighting**:
   ```bash
   # Highlight errors in red
   docker compose logs -f supabase-edge-functions | grep --color=always -iE 'error|$'

   # Highlight multiple patterns
   docker compose logs -f supabase-edge-functions | grep --color=always -iE 'error|warn|success|$'
   ```

9. **Compare logs before/after change**:
   ```bash
   # Save logs before change
   docker compose logs supabase-edge-functions > logs-before.txt

   # Make changes, restart function
   docker compose restart functions

   # Save logs after
   docker compose logs supabase-edge-functions > logs-after.txt

   # Compare
   diff logs-before.txt logs-after.txt
   ```

10. **Check for specific issues**:

    **Memory issues**:
    ```bash
    docker compose logs supabase-edge-functions | grep -iE "memory|out of memory|oom"
    ```

    **Timeout issues**:
    ```bash
    docker compose logs supabase-edge-functions | grep -iE "timeout|timed out|deadline exceeded"
    ```

    **Import errors**:
    ```bash
    docker compose logs supabase-edge-functions | grep -iE "import|module not found|cannot find"
    ```

    **JWT errors**:
    ```bash
    docker compose logs supabase-edge-functions | grep -iE "jwt|invalid token|unauthorized"
    ```

11. **Structured log analysis**:

    If functions log in structured format:
    ```bash
    # Extract and pretty-print JSON logs
    docker compose logs supabase-edge-functions | \
      grep -o '{.*}' | \
      jq 'select(.level == "error")'

    # Group by error type
    docker compose logs supabase-edge-functions | \
      grep -o '{.*}' | \
      jq -r '.error_type' | \
      sort | uniq -c
    ```

12. **Export logs for analysis**:
    ```bash
    # Export with timestamp
    docker compose logs --timestamps supabase-edge-functions > logs-$(date +%Y%m%d-%H%M%S).txt

    # Export only errors
    docker compose logs supabase-edge-functions | grep -i error > errors.txt

    # Export in JSON format (if structured logging)
    docker compose logs supabase-edge-functions | grep -o '{.*}' | jq -s '.' > logs.json
    ```

13. **Correlate with other services**:
    ```bash
    # Compare function logs with Kong (API gateway)
    docker compose logs -f kong supabase-edge-functions

    # Compare with database logs
    docker compose logs -f db supabase-edge-functions
    ```

14. **Performance analysis**:
    ```bash
    # Find slow requests (if duration is logged)
    docker compose logs supabase-edge-functions | grep -E "duration|took|ms" | \
      awk '{if ($NF > 1000) print $0}'

    # Count requests per minute
    docker compose logs --timestamps supabase-edge-functions | \
      grep "REQUEST" | \
      awk '{print $1}' | \
      uniq -c
    ```

15. **Present findings**:
    - Summarize error counts and types
    - Show relevant log excerpts
    - Identify patterns (time-based, request-based)
    - Suggest solutions for common errors
    - Highlight any critical issues

## Common Log Patterns to Look For

**Success patterns**:
- "function started"
- "REQUEST COMPLETE"
- "Status: 200"
- "success: true"

**Error patterns**:
- "Error:", "ERROR:"
- "Failed to", "Cannot", "Unable to"
- "Exception", "Uncaught"
- Status codes: 400, 401, 403, 404, 500, 502, 503

**Performance issues**:
- "timeout", "timed out"
- "slow", "exceeded"
- Large durations (> 1000ms)

**Configuration issues**:
- "Missing", "undefined"
- "Invalid", "Incorrect"
- "Not found", "Does not exist"

## Quick Reference

```bash
# Real-time all functions
docker compose logs -f supabase-edge-functions

# Last 100 lines
docker compose logs --tail=100 supabase-edge-functions

# Specific function
docker compose logs -f supabase-edge-functions | grep "function-name"

# Errors only
docker compose logs -f supabase-edge-functions | grep -i error

# Save to file
docker compose logs supabase-edge-functions > logs.txt

# Follow with timestamps
docker compose logs -f --timestamps supabase-edge-functions

# Since specific time
docker compose logs --since="10m" supabase-edge-functions
```
