# Kestra Call Edge Function

This Supabase Edge Function allows you to execute Kestra workflows via HTTP requests.

## Environment Variables

- `KESTRA_BASE_URL`: Base URL of your Kestra instance (default: `http://wsl.ymbihq.local:8080`)

## Usage

### Request Format

Send a POST request to the Edge Function endpoint:

```bash
curl -X POST \
  'https://your-project.supabase.co/functions/v1/kestra-call' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "main",
    "flowId": "hello-world",
    "inputs": {
      "user": "Rick Astley"
    }
  }'
```

### Request Body Schema

```typescript
{
  "namespace": string,    // Required: Kestra namespace
  "flowId": string,       // Required: Kestra flow ID
  "inputs": {             // Optional: Input parameters for the flow
    "key": "value"
  }
}
```

### Response Format

**Success Response (200):**
```json
{
  "success": true,
  "execution": {
    "id": "execution-id",
    "namespace": "main",
    "flowId": "hello-world",
    "state": "CREATED",
    "created": "2025-06-25T10:00:00Z",
    "updated": "2025-06-25T10:00:00Z",
    "inputs": {
      "user": "Rick Astley"
    }
  },
  "message": "Kestra flow main/hello-world executed successfully"
}
```

**Error Response (4xx/5xx):**
```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error information"
}
```

## Examples

### Execute a simple flow:
```bash
curl -X POST \
  'https://your-project.supabase.co/functions/v1/kestra-call' \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "tutorial",
    "flowId": "hello-world",
    "inputs": {
      "user": "Rick Astley"
    }
  }'
```

### Execute a flow with multiple inputs:
```bash
curl -X POST \
  'https://your-project.supabase.co/functions/v1/kestra-call' \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "production",
    "flowId": "data-processing",
    "inputs": {
      "file_path": "/data/input.csv",
      "batch_size": "1000",
      "environment": "prod"
    }
  }'
```

## Features

- ✅ Calls Kestra flows via multipart/form-data (matching the new Kestra API format)
- ✅ Supports dynamic namespace and flow ID
- ✅ Passes input parameters as JSON data in the `json_data` form field
- ✅ Uses the updated Kestra API endpoint format: `/api/v1/main/executions/{namespace}/{flowId}`
- ✅ Returns Kestra execution details
- ✅ CORS support for web applications
- ✅ Error handling and logging
- ✅ Environment-based Kestra URL configuration

## Notes

This function replicates the functionality of your curl command:

```bash
curl -v -X POST -H 'Content-Type: multipart/form-data' -F 'json_data={"key":"value","number":123}' 'http://wsl.ymbihq.local:8080/api/v1/main/executions/company.team/iotgwui-integration01'
```

The function provides a structured JSON API interface while maintaining compatibility with Kestra's multipart/form-data requirement. All input parameters are serialized as JSON and sent in the `json_data` form field, exactly as shown in the curl example.
