---
description: Test a Supabase edge function with various scenarios
---

# Test Edge Function Skill

You are helping test a Supabase edge function. Follow these steps:

1. **Identify the function to test**:
   - Ask which function to test (or detect from context)
   - Read the function code from `volumes/functions/<function-name>/index.ts`
   - Understand its expected inputs and outputs

2. **Check if function is running**:
   ```bash
   docker compose ps supabase-edge-functions
   ```

3. **Restart the function if needed**:
   ```bash
   docker compose restart functions
   ```

4. **Get necessary credentials**:
   - Read ANON_KEY and SERVICE_ROLE_KEY from .env
   - Determine which key to use based on the test scenario

5. **Create test cases**:
   - Valid request with correct data
   - Invalid request (missing fields, wrong types)
   - Edge cases (empty values, very large values, special characters)
   - Error scenarios

6. **Execute tests using curl**:
   ```bash
   # Basic test
   curl -X POST http://localhost:8000/functions/v1/<function-name> \
     -H "Authorization: Bearer <ANON_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"test":"data"}' \
     -v

   # Test with service role key
   curl -X POST http://localhost:8000/functions/v1/<function-name> \
     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"test":"data"}'

   # Test CORS preflight
   curl -X OPTIONS http://localhost:8000/functions/v1/<function-name> \
     -H "Access-Control-Request-Method: POST" \
     -H "Origin: http://localhost:3000" \
     -v
   ```

7. **Monitor logs during testing**:
   ```bash
   docker compose logs -f supabase-edge-functions | grep <function-name>
   ```

8. **Report results**:
   - Show request sent
   - Show response received
   - Show relevant log entries
   - Highlight any errors or unexpected behavior
   - Suggest fixes if issues found

9. **Performance testing** (if requested):
   - Test response time
   - Test with concurrent requests
   - Check for memory leaks or timeouts

10. **Integration testing** (if applicable):
    - Test database interactions
    - Test external API calls
    - Test authentication/authorization
    - Test with actual frontend application

## Common Issues to Check

- CORS headers present in response
- Proper error handling for invalid input
- Correct HTTP status codes
- JSON response format
- Authorization header handling
- Request timeout handling
- Environment variable availability
