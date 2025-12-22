# API Error Handling Guide

## The Problem That Was Fixed

### Actual Error That Occurred

**Root Cause:** The `pdf-parse` module was imported incorrectly in `server.js`:

```javascript
// ❌ WRONG - Doesn't work with ES6 modules
import pdfParse from 'pdf-parse';

// This caused:
// SyntaxError: The requested module 'pdf-parse' does not provide an export named 'default'
```

**What Happened:**
1. Server failed to start extraction handler due to import error
2. Express caught the unhandled error
3. Express returned default HTML error page (not JSON)
4. Frontend called `response.json()` on HTML response
5. **CRASH:** `SyntaxError: Unexpected token 'A', "A server e..." is not valid JSON`

### How We Fixed It

**Two-Layer Fix:**

#### Layer 1: Backend - Always Return JSON (Even on Crash)

**Before:**
```javascript
app.post('/api/extract-quote', async (req, res) => {
  try {
    // ... extraction logic
    res.json({ success: true, data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
    // ⚠️ But if error happens BEFORE try block, Express sends HTML!
  }
});
```

**After:**
```javascript
app.post('/api/extract-quote', async (req, res) => {
  const requestId = generateRequestId();

  try {
    // ... extraction logic
    return sendSuccess(res, result);
  } catch (error) {
    // Catch EVERYTHING and return standardized JSON
    return sendError(res, error, 500, 'EXTRACTION_FAILED');
  }
});

function sendError(res, error, statusCode, code) {
  const requestId = generateRequestId();

  // Log full error server-side
  console.error(`[ERROR ${requestId}] ${code}:`, error);
  console.error(`[ERROR ${requestId}] Stack:`, error.stack);

  // Return safe JSON to client (no stack traces)
  return res.status(statusCode).json({
    ok: false,
    error: {
      message: error.message,
      code,
      requestId,
    },
  });
}
```

#### Layer 2: Frontend - Never Crash on Invalid JSON

**Before:**
```javascript
const response = await fetch(API_URL, { ... });

if (!response.ok) {
  const error = await response.json(); // ❌ CRASHES if response is HTML
  throw new Error(error.error);
}

const result = await response.json(); // ❌ CRASHES if response is HTML
```

**After:**
```javascript
import { fetchJson, formatApiError } from './apiHelpers.js';

const result = await fetchJson(API_URL, { ... });

if (!result.ok) {
  const errorMessage = formatApiError(result.error);
  throw new Error(errorMessage); // ✅ Never crashes, always has error object
}
```

**How `fetchJson` Works:**
```javascript
async function fetchJson(url, options) {
  try {
    const response = await fetch(url, options);

    // Read as TEXT first (safer than .json())
    const text = await response.text();

    // Try to parse as JSON
    const { parsed, isJson } = parseJsonSafe(text);

    if (!isJson) {
      // Not JSON? Create error object instead of crashing
      return {
        ok: false,
        error: {
          message: `Server returned invalid response: ${text.substring(0, 100)}`,
          code: 'INVALID_RESPONSE',
          requestId: 'client_parse_error',
        },
      };
    }

    // Return parsed JSON (already has ok: true/false)
    return parsed;

  } catch (error) {
    // Network failure? Create error object
    return {
      ok: false,
      error: {
        message: error.message,
        code: 'NETWORK_ERROR',
        requestId: 'client_network_error',
      },
    };
  }
}
```

## Error Code Reference

### Backend Error Codes

| Code | Status | Meaning | User Message |
|------|--------|---------|--------------|
| `MISSING_IMAGE` | 400 | No file uploaded | "Please select a file to upload" |
| `MISSING_API_KEY` | 400 | API key not set | "Please add your Anthropic API key in Settings" |
| `ANTHROPIC_API_ERROR` | varies | AI service failed | "Failed to connect to AI service" |
| `EMPTY_RESPONSE` | 500 | AI returned no content | "AI service returned empty response" |
| `PARSE_ERROR` | 500 | Can't parse AI output | "Failed to parse quote data" |
| `EXTRACTION_FAILED` | 500 | General extraction error | "Quote extraction failed" |

### Frontend Error Codes

| Code | Source | Meaning |
|------|--------|---------|
| `INVALID_JSON` | parseJsonSafe | Response text is not valid JSON |
| `INVALID_RESPONSE` | fetchJson | Server returned HTML/text instead of JSON |
| `NETWORK_ERROR` | fetchJson | Network/fetch failed (CORS, timeout, etc.) |

## Request ID Format

Every error gets a unique request ID:

```
req_1703012345_a1b2c3d4
 │   │          └─ Random hex (8 chars)
 │   └─ Unix timestamp (milliseconds)
 └─ Prefix
```

**Usage:**
- Logged server-side with full error details
- Returned to client for support tickets
- Client-side errors use special IDs:
  - `client_parse_error` - JSON parsing failed
  - `client_network_error` - Network request failed

## Example Error Flows

### Scenario 1: Server Returns HTML Error Page

```
1. User uploads PDF
2. Server crashes with unhandled error
3. Express returns: "<!DOCTYPE html>...<h1>500 Internal Server Error</h1>..."

OLD BEHAVIOR:
4. Frontend: response.json()
5. ❌ CRASH: "SyntaxError: Unexpected token '<', '<!DOCTYPE'..."

NEW BEHAVIOR:
4. Frontend: fetchJson() reads as text
5. parseJsonSafe() detects invalid JSON
6. Returns: { ok: false, error: { code: 'INVALID_RESPONSE', ... } }
7. ✅ User sees: "Server returned invalid response. Reference ID: client_parse_error"
```

### Scenario 2: Server Returns Proper Error JSON

```
1. User uploads PDF without API key
2. Backend: if (!apiKey) return sendError(res, 'API key required', 400, 'MISSING_API_KEY')
3. Response: { ok: false, error: { message: '...', code: 'MISSING_API_KEY', requestId: 'req_...' } }
4. Frontend: fetchJson() parses JSON successfully
5. formatApiError() maps MISSING_API_KEY → "Please add your Anthropic API key in Settings"
6. ✅ User sees helpful message with request ID
```

### Scenario 3: Network Failure (CORS, timeout, DNS)

```
1. User tries to extract quote
2. fetch() throws: "TypeError: Failed to fetch"

OLD BEHAVIOR:
3. ❌ CRASH: Unhandled promise rejection

NEW BEHAVIOR:
3. fetchJson() catches error
4. Returns: { ok: false, error: { code: 'NETWORK_ERROR', message: 'Failed to fetch' } }
5. formatApiError() → "Network connection failed: Failed to fetch"
6. ✅ User sees error message, app doesn't crash
```

## Testing

Run the test suite to verify error handling:

```bash
# Test API error handling (11 tests)
npm run test:api

# Test supplier extraction
npm run test:supplier

# Run all tests
npm test
```

**What's Tested:**
- ✅ Valid JSON parsing
- ✅ Invalid JSON → error object
- ✅ HTML error page → error object
- ✅ Plain text error → error object
- ✅ Network failure → error object
- ✅ Standardized error responses
- ✅ User-friendly error messages
- ✅ Request ID handling

## Best Practices

### When Adding New API Endpoints

1. **Always use standardized responses:**
   ```javascript
   app.post('/api/my-endpoint', async (req, res) => {
     try {
       const result = await doSomething();
       return sendSuccess(res, result);
     } catch (error) {
       return sendError(res, error, 500, 'MY_ERROR_CODE');
     }
   });
   ```

2. **Validate inputs with specific error codes:**
   ```javascript
   if (!req.body.data) {
     return sendError(res, 'Data required', 400, 'MISSING_DATA');
   }
   ```

3. **Catch specific errors with appropriate codes:**
   ```javascript
   try {
     await externalAPI.call();
   } catch (error) {
     if (error.code === 'ECONNREFUSED') {
       return sendError(res, 'Service unavailable', 503, 'SERVICE_DOWN');
     }
     return sendError(res, error, 500, 'EXTERNAL_API_ERROR');
   }
   ```

### When Calling APIs from Frontend

1. **Always use `fetchJson`:**
   ```javascript
   import { fetchJson, formatApiError } from './utils/apiHelpers.js';

   const result = await fetchJson('/api/endpoint', { ... });

   if (!result.ok) {
     throw new Error(formatApiError(result.error));
   }
   ```

2. **Never use `response.json()` directly:**
   ```javascript
   // ❌ BAD - Can crash
   const response = await fetch('/api/endpoint');
   const data = await response.json();

   // ✅ GOOD - Never crashes
   const result = await fetchJson('/api/endpoint');
   ```

3. **Show user-friendly error messages:**
   ```javascript
   try {
     const result = await fetchJson('/api/extract-quote', { ... });
     if (!result.ok) {
       alert(formatApiError(result.error)); // Includes helpful context
     }
   } catch (error) {
     alert(error.message); // Already formatted
   }
   ```

## Debugging Errors

### Server-Side Logs

Every error is logged with full details:

```
[ERROR req_1703012345_a1b2c3d4] EXTRACTION_FAILED: Error: pdf-parse import failed
[ERROR req_1703012345_a1b2c3d4] Stack: Error: ...
    at extractHeaderFooterFromPdf (server.js:360:15)
    at app.post (server.js:605:28)
    ...
```

### Client-Side Logs

Non-JSON responses are logged with preview:

```
[fetchJson] Non-JSON response: {
  url: 'http://localhost:3001/api/extract-quote',
  status: 500,
  statusText: 'Internal Server Error',
  preview: '<!DOCTYPE html><html>...'
}
```

### Finding Errors by Request ID

1. User reports error with request ID: `req_1703012345_a1b2c3d4`
2. Search server logs: `grep "req_1703012345_a1b2c3d4" server.log`
3. See full error with stack trace
4. Fix the issue

## Migration Checklist

If you have old API code:

- [ ] Replace `res.json({ success: true, ... })` with `sendSuccess(res, data)`
- [ ] Replace `res.status(500).json({ error: ... })` with `sendError(res, error, 500, 'CODE')`
- [ ] Add try/catch around entire endpoint
- [ ] Replace `fetch().then(r => r.json())` with `fetchJson()`
- [ ] Use `formatApiError()` for error messages
- [ ] Add error code constants
- [ ] Update tests to expect `{ ok, data?, error? }` structure

## Summary

**The Fix:**
1. ✅ Backend always returns JSON (even on crash)
2. ✅ Frontend never crashes on non-JSON responses
3. ✅ Request IDs for error tracking
4. ✅ User-friendly error messages
5. ✅ Full error logging server-side
6. ✅ Comprehensive test coverage

**Result:**
- **No more crashes** when server returns unexpected responses
- **Better UX** with helpful error messages
- **Easier debugging** with request IDs and full logs
- **Consistent API** with standardized response format
