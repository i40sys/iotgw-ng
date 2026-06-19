---
description: Debug issues with a Supabase edge function
---

# Debug Edge Function Skill

You are helping debug a Supabase edge function. Follow these systematic steps:

1. **Identify the problem**:
   - Ask what error or unexpected behavior is occurring
   - Get error messages, status codes, or describe the issue
   - Determine when it started (after recent changes, always failing, intermittent)

2. **Check function code**:
   - Read the function code from `volumes/functions/<function-name>/index.ts`
   - Look for obvious issues:
     - Syntax errors
     - Missing error handling
     - Incorrect async/await usage
     - Missing return statements
     - Type mismatches

3. **Check recent logs**:
   ```bash
   # Get recent function logs
   kubectl -n iotgw logs --tail=100 deploy/functions

   # Follow logs in real-time
   kubectl -n iotgw logs -f deploy/functions
   ```

4. **Verify function is accessible**:
   ```bash
   # Check if the functions pod is running
   kubectl -n iotgw get pods -l app=functions

   # Check if function directory exists (code is baked into the image)
   ls -la volumes/functions/<function-name>/
   ```

5. **Test the main routing**:
   ```bash
   # Test main function first
   curl -X POST http://localhost:8000/functions/v1/hello \
     -H "Authorization: Bearer ${ANON_KEY}" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

6. **Check environment variables**:
   - Env for the functions Deployment comes from the `supabase-env` k8s Secret
     (envFrom on deploy/functions), sourced from `secrets/supabase.enc.env`. To
     add/change a var: edit `secrets/supabase.enc.env`, run
     `deploy/kind/bootstrap.sh secrets`, then
     `kubectl -n iotgw rollout restart deploy/functions`.
   - Test access: Add console.log(Deno.env.get('VAR_NAME')) temporarily

7. **Test with minimal request**:
   ```bash
   # Simplest possible request
   curl -X POST http://localhost:8000/functions/v1/<function-name> \
     -H "Authorization: Bearer ${ANON_KEY}" \
     -H "Content-Type: application/json" \
     -d '{}' \
     -v
   ```

8. **Check for common issues**:

   **CORS Issues**:
   - Missing OPTIONS handler
   - Missing CORS headers in response
   - Incorrect Access-Control-Allow-Origin

   **Authentication Issues**:
   - FUNCTIONS_VERIFY_JWT=true but no valid token
   - Using wrong key (ANON_KEY vs SERVICE_ROLE_KEY)
   - Main function rejecting before reaching your function

   **Timeout Issues**:
   - Function taking > 1 minute (worker timeout)
   - External API calls hanging
   - Missing timeout on fetch calls

   **Memory Issues**:
   - Function exceeding 150MB limit
   - Memory leaks from unclosed connections
   - Large data processing

   **Import Issues**:
   - Incorrect Deno import URLs
   - Missing dependencies
   - Version mismatches

9. **Add debug logging**:
   - Add console.log at key points
   - Log request body, headers
   - Log intermediate values
   - Log before external calls
   - Deploy the edit: function code is baked into `iotgw-functions:local`, so
     rebuild + kind-load + rollout:
     `deploy/kind/bootstrap.sh functions` then
     `kubectl -n iotgw rollout restart deploy/functions`

10. **Test in isolation**:
    - Create a minimal test version
    - Remove external dependencies
    - Test each part separately

11. **Check network connectivity** (for external APIs):
    ```bash
    # Execute from within the functions pod
    kubectl -n iotgw exec -it deploy/functions -- sh
    curl -v <external-api-url>
    ```

12. **Review recent changes**:
    - Compare with last working version
    - Check git diff if using version control
    - Identify what changed

13. **Provide solution**:
    - Explain root cause
    - Show the fix
    - Apply the fix if requested
    - Verify fix works with test

## Debug Checklist

- [ ] Function code syntax is valid TypeScript
- [ ] Function exports serve() handler
- [ ] CORS headers present for browser requests
- [ ] Error handling catches all exceptions
- [ ] Environment variables are accessible
- [ ] External API calls have timeouts
- [ ] Request/response types match
- [ ] Function restarts after code changes
- [ ] Logs show function being invoked
- [ ] No 404 errors (function path correct)
