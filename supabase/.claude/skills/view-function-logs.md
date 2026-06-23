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
   kubectl -n supabase-app logs -f deploy/functions
   ```

   **Last N lines**:
   ```bash
   kubectl -n supabase-app logs --tail=100 deploy/functions
   ```

   **Specific time range**:
   ```bash
   kubectl -n supabase-app logs --since-time="2024-01-01T10:00:00Z" deploy/functions
   ```

   **Save logs to file**:
   ```bash
   kubectl -n supabase-app logs deploy/functions > function-logs.txt
   ```

3. **Filter for specific function**:
   ```bash
   # Filter by function name
   kubectl -n supabase-app logs -f deploy/functions | grep "kestra-call"

   # Filter out function name
   kubectl -n supabase-app logs -f deploy/functions | grep -v "hello"
   ```

4. **Filter by log level**:
   ```bash
   # Errors only
   kubectl -n supabase-app logs -f deploy/functions | grep -i error

   # Warnings and errors
   kubectl -n supabase-app logs -f deploy/functions | grep -iE "error|warn"
   ```

5. **Filter by transaction/request ID**:
   ```bash
   # If your functions use transaction IDs
   kubectl -n supabase-app logs -f deploy/functions | grep "TXN:12345678"

   # If using request IDs
   kubectl -n supabase-app logs -f deploy/functions | grep "REQUEST abc123"
   ```

6. **Analyze common patterns**:

   **Function startup**:
   ```bash
   kubectl -n supabase-app logs deploy/functions | grep "function started"
   ```

   **HTTP requests**:
   ```bash
   kubectl -n supabase-app logs deploy/functions | grep -E "POST|GET|PUT|DELETE"
   ```

   **Database errors**:
   ```bash
   kubectl -n supabase-app logs deploy/functions | grep -i "database error"
   ```

   **Timeout issues**:
   ```bash
   kubectl -n supabase-app logs deploy/functions | grep -i timeout
   ```

   **CORS issues**:
   ```bash
   kubectl -n supabase-app logs deploy/functions | grep -i cors
   ```

7. **Advanced filtering with awk/sed**:

   **Show only timestamps and errors**:
   ```bash
   kubectl -n supabase-app logs deploy/functions | grep -i error | awk '{print $1, $2, $3}'
   ```

   **Count errors per function**:
   ```bash
   kubectl -n supabase-app logs deploy/functions | grep -i error | grep -oP '\w+-\w+ function' | sort | uniq -c
   ```

   **Extract JSON logs** (if functions output JSON):
   ```bash
   kubectl -n supabase-app logs deploy/functions | grep -o '{.*}' | jq '.'
   ```

8. **Monitor logs in real-time with highlighting**:
   ```bash
   # Highlight errors in red
   kubectl -n supabase-app logs -f deploy/functions | grep --color=always -iE 'error|$'

   # Highlight multiple patterns
   kubectl -n supabase-app logs -f deploy/functions | grep --color=always -iE 'error|warn|success|$'
   ```

9. **Compare logs before/after change**:
   ```bash
   # Save logs before change
   kubectl -n supabase-app logs deploy/functions > logs-before.txt

   # Make changes, then redeploy (function code is baked into the image)
   deploy/kind/bootstrap.sh functions
   kubectl -n supabase-app rollout restart deploy/functions

   # Save logs after
   kubectl -n supabase-app logs deploy/functions > logs-after.txt

   # Compare
   diff logs-before.txt logs-after.txt
   ```

10. **Check for specific issues**:

    **Memory issues**:
    ```bash
    kubectl -n supabase-app logs deploy/functions | grep -iE "memory|out of memory|oom"
    ```

    **Timeout issues**:
    ```bash
    kubectl -n supabase-app logs deploy/functions | grep -iE "timeout|timed out|deadline exceeded"
    ```

    **Import errors**:
    ```bash
    kubectl -n supabase-app logs deploy/functions | grep -iE "import|module not found|cannot find"
    ```

    **JWT errors**:
    ```bash
    kubectl -n supabase-app logs deploy/functions | grep -iE "jwt|invalid token|unauthorized"
    ```

11. **Structured log analysis**:

    If functions log in structured format:
    ```bash
    # Extract and pretty-print JSON logs
    kubectl -n supabase-app logs deploy/functions | \
      grep -o '{.*}' | \
      jq 'select(.level == "error")'

    # Group by error type
    kubectl -n supabase-app logs deploy/functions | \
      grep -o '{.*}' | \
      jq -r '.error_type' | \
      sort | uniq -c
    ```

12. **Export logs for analysis**:
    ```bash
    # Export with timestamp
    kubectl -n supabase-app logs --timestamps deploy/functions > logs-$(date +%Y%m%d-%H%M%S).txt

    # Export only errors
    kubectl -n supabase-app logs deploy/functions | grep -i error > errors.txt

    # Export in JSON format (if structured logging)
    kubectl -n supabase-app logs deploy/functions | grep -o '{.*}' | jq -s '.' > logs.json
    ```

13. **Correlate with other services**:
    `kubectl logs` follows one Deployment at a time, so to compare two services
    run a `kubectl logs -f` per service in separate terminals (or background one):
    ```bash
    # Terminal 1: function logs
    kubectl -n supabase-app logs -f deploy/functions

    # Terminal 2: Kong (API gateway)
    kubectl -n supabase-app logs -f deploy/kong

    # For database logs, follow the StackGres primary pod's patroni container:
    PG=$(kubectl -n supabase-db get pod -l 'stackgres.io/cluster-name=supabase-db,role=master' \
           -o jsonpath='{.items[0].metadata.name}')
    kubectl -n supabase-db logs -f "$PG" -c patroni
    ```

14. **Performance analysis**:
    ```bash
    # Find slow requests (if duration is logged)
    kubectl -n supabase-app logs deploy/functions | grep -E "duration|took|ms" | \
      awk '{if ($NF > 1000) print $0}'

    # Count requests per minute
    kubectl -n supabase-app logs --timestamps deploy/functions | \
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
kubectl -n supabase-app logs -f deploy/functions

# Last 100 lines
kubectl -n supabase-app logs --tail=100 deploy/functions

# Specific function
kubectl -n supabase-app logs -f deploy/functions | grep "function-name"

# Errors only
kubectl -n supabase-app logs -f deploy/functions | grep -i error

# Save to file
kubectl -n supabase-app logs deploy/functions > logs.txt

# Follow with timestamps
kubectl -n supabase-app logs -f --timestamps deploy/functions

# Since specific time
kubectl -n supabase-app logs --since=10m deploy/functions
```
