# Debugging Extraction API Crashes

## Summary of Changes

I've added comprehensive structured logging to the `/api/extract-quote` endpoint to identify the exact crash cause. The endpoint now logs every milestone of the extraction process with detailed information.

---

## Structured Logging Added

### Milestones Logged

**Format:** All logs include unique `requestId` for tracking

1. **(a) RECEIVED REQUEST**
   - Content-Type header
   - Content-Length header
   - Base64 image size in MB
   - Extraction path (PDF vs IMAGE)
   - Model being used

2. **(b) PDF TEXT EXTRACTION** (if PDF)
   - PDF buffer size in KB
   - Number of pages extracted
   - Header text length (chars)
   - Footer text length (chars)
   - Body text length (chars)
   - Regex extraction results (email, name, phone)

3. **(c) BUILD MODEL REQUEST**
   - Payload size in KB
   - Number of content items in message
   - Header/footer text injection status

4. **(d) CALL LLM API**
   - API call duration in milliseconds
   - HTTP response status

5. **(e) PARSE MODEL RESPONSE**
   - Token usage (input/output)
   - Stop reason
   - Content length
   - Content preview
   - JSON block size
   - Number of line items parsed

6. **(f) RETURNING RESPONSE**
   - Supplier name (found/not found)
   - Supplier email (found/not found)
   - Number of line items
   - Success status

### Error Logging

**PDF Parse Errors:**
```
❌ [req_123...] PDF parsing failed:
   - Error name: TypeError
   - Error message: Cannot read property 'text' of undefined
   - Full stack trace
```

**Anthropic API Errors:**
```
❌ [req_123...] Anthropic API returned error status
   - Error type: invalid_request_error
   - Error message: Invalid API key
```

**JSON Parse Errors:**
```
❌ [req_123...] JSON parse failed: Unexpected token...
   - Invalid JSON: (first 200 chars)
```

**Fatal Errors (Catch-all):**
```
❌ [req_123...] FATAL ERROR - Extraction failed
   - Error name: ReferenceError
   - Error message: extractSupplierInfo is not defined
   - Error cause: N/A
   - Full stack trace
```

---

## Safety Checks Added

### 1. Payload Size Limit (Vercel Compatible)

```javascript
if (imageSize > 4 * 1024 * 1024) { // 4MB limit
  return sendError(res, 'Image too large. Maximum size is 4MB.', 413, 'PAYLOAD_TOO_LARGE');
}
```

**Why:** Vercel serverless functions have a 4.5MB request body limit. We enforce 4MB to leave room for JSON overhead.

### 2. Try-Catch Around PDF Parsing

```javascript
try {
  pdfTextData = await extractHeaderFooterFromPdf(pdfBuffer);
} catch (pdfError) {
  console.error(`❌ [${requestId}] PDF parsing failed:`, {
    name: pdfError.name,
    message: pdfError.message,
    stack: pdfError.stack,
  });
  return sendError(res, `PDF parsing failed: ${pdfError.message}`, 500, 'PDF_PARSE_ERROR');
}
```

**Why:** `pdf-parse` can fail on corrupted PDFs or PDFs with complex structures.

### 3. JSON Parse Error Handling

```javascript
try {
  rawData = JSON.parse(jsonMatch[0]);
} catch (parseError) {
  console.error(`❌ [${requestId}] JSON parse failed:`, parseError.message);
  console.error(`   - Invalid JSON: ${jsonMatch[0].substring(0, 200)}`);
  return sendError(res, `Invalid JSON from model: ${parseError.message}`, 500, 'PARSE_ERROR');
}
```

**Why:** LLM might return malformed JSON or include extra text.

---

## Local Testing Script

### Usage

```bash
# Start server in one terminal
npm run server

# In another terminal, run the test
npm run test:extraction [path-to-pdf]

# Or specify a different PDF
npm run test:extraction /path/to/your/quote.pdf
```

### What It Does

1. Reads PDF file
2. Converts to base64
3. Calls `/api/extract-quote` endpoint
4. Parses and validates response
5. Shows all extracted data with source annotations
6. Reports success or failure with full error details

### Example Output

```
============================================
LOCAL EXTRACTION TEST
============================================

📄 PDF file: tests/fixtures/wanpu-cleaning-cloth.pdf
📏 File size: 245.67 KB
🔑 API key: sk-ant-api...xxxx
🌐 API endpoint: http://localhost:3001/api/extract-quote

🚀 Sending request...

⏱️  Request completed in 3450ms
📊 Response status: 200 OK

✅ EXTRACTION SUCCESSFUL

📋 Supplier Information:
   Name: XI'AN WANPU IMPORT AND EXPORT TRADING CO., LTD. [header]
   Email: alex.autoway@gmail.com [header]
   Phone: Tel: +86-29-88888888 [header]

📦 Line Items: 2

   Item 1:
      Product: Cleaning Cloth
      SKU: C430
      Price: $0.50
      MOQ: 5000
      Dimensions: 38x50cm
      Weight: 50g
      Packing: 1000 pcs/ctn

✅ TEST PASSED
```

---

## Likely Root Causes (Prioritized)

Based on the error "FUNCTION_INVOCATION_FAILED" on Vercel, here are the most likely causes:

### 1. ⚠️ **pdf-parse Module Not Compatible with Vercel** (MOST LIKELY)

**Issue:** `pdf-parse` uses native bindings that may not work in Vercel's serverless environment.

**Evidence:**
- Uses `canvas` which requires native dependencies
- May try to access filesystem paths that don't exist in serverless
- May use `child_process` which is restricted in Vercel

**How to Check:**
Look for this error in Vercel logs:
```
Error: Cannot find module 'canvas'
Error: spawn ENOENT
Error: ENOTDIR: not a directory, open '/var/task/...'
```

**Fix:**
Replace `pdf-parse` with a serverless-compatible alternative:
- `pdf.js` (Mozilla's PDF library, pure JavaScript)
- Or upload PDF to Supabase Storage and use Anthropic's native PDF support via URL

### 2. ⚠️ **Payload Too Large**

**Issue:** Even with 4MB limit, compressed PDF + base64 + JSON overhead may exceed Vercel's limit.

**How to Check:**
Look for this in logs:
```
📏 [req_123...] Base64 image size: 4.5 MB
```

**Fix:**
- Reduce max size to 3MB
- Or upload to storage first, send URL instead

### 3. ⚠️ **Memory Limit Exceeded**

**Issue:** PDF parsing + LLM API call may use too much memory (Vercel free: 1024MB, Pro: 3008MB).

**How to Check:**
Look for:
```
Error: JavaScript heap out of memory
```

**Fix:**
- Upgrade Vercel plan
- Process only first page for preview
- Optimize pdf-parse usage

### 4. ⚠️ **Timeout (10 seconds on Hobby, 60s on Pro)**

**Issue:** PDF parsing + LLM API call takes too long.

**How to Check:**
Look for:
```
🌐 [req_123...] (d) CALLING ANTHROPIC API...
<no further logs>
```

**Fix:**
- Increase `maxDuration` in vercel.json
- Optimize by skipping full PDF text extraction
- Cache extracted text

### 5. ⚠️ **Missing Environment Variable**

**Issue:** ANTHROPIC_API_KEY not set in Vercel environment.

**How to Check:**
Look for:
```
❌ [req_123...] Anthropic API returned error status
   - Error type: authentication_error
   - Error message: Invalid API key
```

**Fix:**
Add to Vercel dashboard: Settings → Environment Variables

---

## Debugging Steps

### Step 1: Check Vercel Function Logs

Go to Vercel dashboard → Deployments → [Your deployment] → Functions → Logs

Look for the last log entry before crash:
- If you see **(a) RECEIVED REQUEST** but not **(b)** → PDF parsing failed
- If you see **(b)** but not **(c)** → Regex extraction failed
- If you see **(c)** but not **(d)** → Request building failed
- If you see **(d)** but not **(e)** → API call timed out or crashed
- If you see **(e)** but not **(f)** → JSON parsing failed

### Step 2: Test Locally

```bash
# Terminal 1
npm run server

# Terminal 2
npm run test:extraction tests/fixtures/wanpu-cleaning-cloth.pdf
```

Watch the server logs - you'll see all milestones.

If it works locally but fails on Vercel → likely a serverless environment issue (pdf-parse, memory, timeout).

### Step 3: Check PDF Parse Module

```bash
# See if pdf-parse works in your environment
node -e "import('pdf-parse').then(m => console.log('OK')).catch(e => console.error(e))"
```

### Step 4: Simplify to Find Exact Failure Point

Create a minimal test endpoint:

```javascript
app.post('/api/test-pdf-parse', async (req, res) => {
  try {
    const { image } = req.body;
    const pdfBuffer = Buffer.from(image, 'base64');
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(pdfBuffer);
    res.json({ ok: true, pageCount: data.numpages });
  } catch (error) {
    res.json({ ok: false, error: error.message, stack: error.stack });
  }
});
```

Test this endpoint - if it fails, `pdf-parse` is the culprit.

---

## Recommended Fixes

### Option A: Replace pdf-parse with PDF.js (BEST FOR SERVERLESS)

```bash
npm install pdfjs-dist
```

```javascript
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractHeaderFooterFromPdf(pdfBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
  const pdf = await loadingTask.promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }

  // Split into header/footer as before
  const lines = fullText.split('\n');
  const headerLineCount = Math.ceil(lines.length * 0.2);
  const footerLineCount = Math.ceil(lines.length * 0.2);

  return {
    headerText: lines.slice(0, headerLineCount).join('\n'),
    footerText: lines.slice(-footerLineCount).join('\n'),
    bodyText: fullText,
    pageCount: pdf.numPages,
  };
}
```

### Option B: Upload to Storage, Use URL (BEST FOR LARGE FILES)

```javascript
// 1. Frontend uploads PDF to Supabase Storage
const { data: uploadData } = await supabase.storage
  .from('documents')
  .upload(filePath, pdfFile);

// 2. Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('documents')
  .getPublicUrl(filePath);

// 3. Send URL to Anthropic (supports PDF URLs natively)
const response = await fetch('https://api.anthropic.com/v1/messages', {
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: [{
        type: 'document',
        source: {
          type: 'url',
          url: publicUrl, // ← Direct URL to PDF
        },
      }, ...]
    }]
  })
});
```

### Option C: Skip PDF Text Extraction (QUICKEST FIX)

```javascript
if (isPdf) {
  console.log(`📄 [${requestId}] PDF detected - using native PDF support`);
  // Let Anthropic handle PDF directly, skip our text extraction
  pdfTextData = null;
  regexSupplierInfo = null;
}
```

Just send the PDF directly to Anthropic and remove the `pdf-parse` dependency.

---

## Vercel Configuration

Add to `vercel.json` in project root:

```json
{
  "functions": {
    "api/**/*.js": {
      "maxDuration": 60,
      "memory": 3008
    }
  }
}
```

---

## Environment Variables Checklist

Ensure these are set in Vercel:

- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` (if passed from frontend, not needed)

---

## Next Steps

1. **Deploy and check logs** - Look for the exact milestone where it crashes
2. **If crashes at (b)** - Replace pdf-parse with PDF.js or skip text extraction
3. **If crashes at (d)** - Check timeout/memory limits
4. **If works locally but fails on Vercel** - It's definitely a serverless environment issue

---

## Summary

### What Was Done

✅ Added comprehensive logging to every stage of extraction
✅ Added payload size checks (4MB limit)
✅ Added specific error handling for PDF parsing
✅ Added JSON parse error handling with previews
✅ Created local test script for reproduction
✅ Always return JSON (never crash with HTML)

### Most Likely Root Cause

**`pdf-parse` is not compatible with Vercel's serverless environment.**

It likely uses native bindings (`canvas`) or filesystem access that don't work in the restricted serverless environment, causing the function to crash before it can return any logs.

### Immediate Fix

**Replace `pdf-parse` with one of:**
1. PDF.js (pure JavaScript, serverless-safe)
2. Anthropic's native PDF URL support (best for large files)
3. Skip text extraction entirely (let Anthropic handle PDFs natively)

Use the logs from the next deployment to confirm the exact crash point!
