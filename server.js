// ============================================
// BACKEND SERVER FOR QUOTE EXTRACTION & DOCUMENT STORAGE
// ============================================
// This server proxies API calls to Anthropic and handles Supabase Storage uploads

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

dotenv.config();

// Supabase client with service role key (for backend only)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials. Add VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================
// UTILITY: CRASH-PROOF JSON RESPONSE HELPER
// ============================================

/**
 * Safely serialize object to JSON, removing non-serializable values
 * Handles: circular refs, BigInt, Buffer, Error, undefined, functions, symbols
 */
function safeSerialize(obj) {
  const seen = new WeakSet();

  return JSON.stringify(obj, (key, value) => {
    // Handle primitives
    if (value === null || value === undefined) {
      return value;
    }

    // Convert BigInt to string
    if (typeof value === 'bigint') {
      return value.toString();
    }

    // Skip functions and symbols
    if (typeof value === 'function' || typeof value === 'symbol') {
      return undefined;
    }

    // Handle non-object types
    if (typeof value !== 'object') {
      return value;
    }

    // Handle circular references
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    // Convert Buffer to base64 string
    if (Buffer.isBuffer(value)) {
      return `[Buffer ${value.length} bytes]`;
    }

    // Convert Error to plain object
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    // Convert Date to ISO string
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Return the value as-is for arrays and plain objects
    return value;
  });
}

/**
 * Send JSON response with crash-proof serialization
 * NEVER throws, always sets correct headers
 */
function sendJson(res, statusCode, obj) {
  try {
    // Set headers first
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
      res.status(statusCode);
    }

    // Safely serialize
    const json = safeSerialize(obj);
    res.send(json);
  } catch (error) {
    // Last resort: send minimal error object
    console.error('[sendJson] Failed to serialize response:', error);
    console.error('[sendJson] Object type:', typeof obj);
    console.error('[sendJson] Object keys:', obj ? Object.keys(obj) : 'null');

    try {
      res.status(500).send('{"ok":false,"error":{"message":"Serialization error","code":"SERIALIZATION_ERROR"}}');
    } catch (finalError) {
      // Absolute last resort
      res.end();
    }
  }
}

// ============================================
// UTILITY: STANDARDIZED API RESPONSES
// ============================================

/**
 * Generate a unique request ID for error tracking
 */
function generateRequestId() {
  return `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Send a standardized success response
 */
function sendSuccess(res, data, statusCode = 200) {
  return sendJson(res, statusCode, {
    ok: true,
    data,
  });
}

/**
 * Send a standardized error response
 * @param {Object} res - Express response object
 * @param {Error|string} error - Error object or message
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Error code for categorization
 * @param {string} requestId - Request ID for tracking
 * @param {string} step - Current processing step when error occurred
 */
function sendError(res, error, statusCode = 500, code = 'INTERNAL_ERROR', requestId = null, step = 'unknown') {
  if (!requestId) {
    requestId = generateRequestId();
  }

  const message = typeof error === 'string' ? error : error.message;

  // Log full error server-side with requestId and step
  console.error(`[ERROR ${requestId}] Step: ${step}, Code: ${code}`);
  console.error(`[ERROR ${requestId}] Message: ${message}`);
  if (error.stack) {
    console.error(`[ERROR ${requestId}] Stack:`, error.stack);
  }

  // Send safe error to client (no stack traces)
  return sendJson(res, statusCode, {
    ok: false,
    requestId,
    error: {
      name: typeof error === 'object' ? error.name : 'Error',
      message,
      code,
      step,
    },
  });
}

// ============================================
// EXTRACTION SYSTEM PROMPT
// ============================================
// These rules are ALWAYS enforced during extraction
const EXTRACTION_SYSTEM_PROMPT = `You are a precise quote extraction AI. Follow these rules EXACTLY:

PRODUCT NAME RULES (CRITICAL):
- product_name MUST be clean product/material name ONLY
- NEVER include: size, dimensions, weight, GSM, material specs, packing, MOQ, price
- Examples:
  ✓ CORRECT: "Cleaning Cloth", "Aluminum Foil Container", "Paper Cup"
  ✗ WRONG: "Cleaning Cloth 50x80cm", "Container - 225x175mm", "Cup 8oz 50pcs/box"
- Put specs in dedicated fields:
  - Dimensions → dimensions field (e.g. "50x80cm", "225×175×42mm")
  - Model/SKU → sku field (e.g. "C430", "LS-N22542")
  - Weight → weight_g field (convert to grams)
  - Material → material field if exists
  - Packing → packing_pcs_per_ctn field

VARIANT SPLITTING (CRITICAL):
- Each purchasable option = ONE separate row
- If table shows: "C430 - 38x50cm - $0.50" AND "C430 - 50x80cm - $0.65"
  → Extract as TWO separate items, not one merged item
- If different prices → separate rows
- If different packings → separate rows
- If different sizes → separate rows
- NEVER merge variants into one row

SUPPLIER INFO EXTRACTION:
- Parse ENTIRE document including header/footer/letterhead
- Extract from top-of-page and bottom-of-page text
- Look for:
  - supplierName: Company name (often ends with "Co., Ltd.", "Inc.", etc.)
  - supplierEmail: Email with @ symbol (use regex to find it)
  - supplierPhone: Phone with country code (+86, etc.) or local format
  - supplierAddress: Full address if present
- If ambiguous, extract best guess and set confidence to "low"
- If truly missing, set to null (do NOT guess)

CONFIDENCE TRACKING:
- Mark confidence for each field: "high", "medium", "low"
- High = explicitly stated, clear, unambiguous
- Medium = inferred from context, somewhat clear
- Low = ambiguous, multiple interpretations possible

HEADER/FOOTER PARSING:
- Read text above and below the main table
- Company name often in letterhead (top-left or center)
- Email often labeled "Email:", "E-mail:", "Mail:"
- Phone often labeled "Tel:", "Phone:", "Mob:", "WhatsApp:"
- Look for patterns like: info@company.com, +86-xxx-xxxx`;

// ============================================
// POST-EXTRACTION SANITIZER
// ============================================
// Enforces clean product names at code level (not just prompt)
function sanitizeExtractedData(data) {
  if (!data || !data.lineItems) return data;

  // Forbidden patterns in product_name
  const forbiddenPatterns = [
    /\d+\s*[x×*]\s*\d+/i,  // dimensions: 50x80, 225×175
    /\d+\s*(cm|mm|inch|in|ft)/i,  // units: 50cm, 175mm
    /\d+\s*(gsm|g|kg|oz|lb)/i,  // weight: 100gsm, 50g
    /(moq|pcs\/box|pcs\/ctn|box|pack|carton)/i,  // packing terms
    /\$\d+|\d+\s*(usd|eur|cny|rmb)/i,  // prices
  ];

  data.lineItems = data.lineItems.map(item => {
    let productName = item.productName || '';
    const raw_product_name = productName; // Keep original for debugging

    // Check for forbidden patterns
    let cleaned = productName;
    let extracted = {
      dimensions: item.dimensions || null,
      weight: item.weight_g || null,
      packing: item.packing_pcs_per_ctn || null,
    };

    forbiddenPatterns.forEach(pattern => {
      const match = cleaned.match(pattern);
      if (match) {
        const matchedText = match[0];

        // Try to categorize and move to appropriate field
        if (/\d+\s*[x×*]\s*\d+/i.test(matchedText)) {
          // Dimensions
          if (!extracted.dimensions) {
            extracted.dimensions = matchedText.trim();
          }
        } else if (/\d+\s*(cm|mm|inch)/i.test(matchedText)) {
          // Also dimensions
          if (!extracted.dimensions) {
            extracted.dimensions = matchedText.trim();
          }
        } else if (/\d+\s*(gsm|g|kg)/i.test(matchedText)) {
          // Weight
          if (!extracted.weight) {
            const weightMatch = matchedText.match(/(\d+)\s*(gsm|g|kg)/i);
            if (weightMatch) {
              let grams = parseInt(weightMatch[1]);
              if (weightMatch[2].toLowerCase() === 'kg') grams *= 1000;
              extracted.weight = grams;
            }
          }
        } else if (/(pcs\/box|pcs\/ctn|pack)/i.test(matchedText)) {
          // Packing
          if (!extracted.packing) {
            const packMatch = matchedText.match(/(\d+)\s*pcs/i);
            if (packMatch) extracted.packing = parseInt(packMatch[1]);
          }
        }

        // Remove from product name
        cleaned = cleaned.replace(matchedText, '').trim();
      }
    });

    // Clean up extra separators
    cleaned = cleaned
      .replace(/\s*-\s*-\s*/g, ' - ')  // Double dashes
      .replace(/\s+-\s*$/g, '')  // Trailing dash
      .replace(/^\s*-\s*/g, '')  // Leading dash
      .replace(/\s+/g, ' ')  // Multiple spaces
      .trim();

    return {
      ...item,
      productName: cleaned || raw_product_name, // Fallback to original if fully stripped
      raw_product_name,
      dimensions: extracted.dimensions || item.dimensions,
      weight_g: extracted.weight || item.weight_g,
      packing_pcs_per_ctn: extracted.packing || item.packing_pcs_per_ctn,
    };
  });

  return data;
}

// ============================================
// SUPPLIER INFO EXTRACTION WITH REGEX
// ============================================
/**
 * Extracts supplier information from text using regex patterns
 * @param {Object} options - Extraction options
 * @param {string} options.headerText - Text from top 20% of page
 * @param {string} options.footerText - Text from bottom 20% of page
 * @param {string} options.bodyText - Full page text
 * @returns {Object} Extracted supplier info with confidence and source
 */
function extractSupplierInfoFromText({ headerText = '', footerText = '', bodyText = '' }) {
  const result = {
    supplierName: { value: null, confidence: 'not_found', source: null },
    supplierEmail: { value: null, confidence: 'not_found', source: null },
    supplierPhone: { value: null, confidence: 'not_found', source: null },
    supplierAddress: { value: null, confidence: 'not_found', source: null },
  };

  // ============================================
  // EMAIL EXTRACTION
  // ============================================
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const emailMatches = [];

  // Try header first
  let match = headerText.match(emailRegex);
  if (match && match.length > 0) {
    emailMatches.push({ email: match[0], source: 'header' });
  }

  // Try footer if not found in header
  if (emailMatches.length === 0) {
    match = footerText.match(emailRegex);
    if (match && match.length > 0) {
      emailMatches.push({ email: match[0], source: 'footer' });
    }
  }

  // Try body if still not found
  if (emailMatches.length === 0) {
    match = bodyText.match(emailRegex);
    if (match && match.length > 0) {
      emailMatches.push({ email: match[0], source: 'body' });
    }
  }

  if (emailMatches.length > 0) {
    result.supplierEmail = {
      value: emailMatches[0].email,
      confidence: 'high',
      source: emailMatches[0].source,
    };
  }

  // ============================================
  // PHONE EXTRACTION
  // ============================================
  const phoneRegex = /(?:Tel|TEL|Phone|PHONE|Mob|Mobile|WhatsApp|WeChat)[:\s]*([+\d\s()-]{8,})|(?:\+86|0086)[- ]?[\d\s()-]{8,}|(?:\(\d{3,4}\))[- ]?[\d\s-]{6,}/gi;
  const phoneMatches = [];

  // Try header first
  match = headerText.match(phoneRegex);
  if (match && match.length > 0) {
    phoneMatches.push({ phone: match[0].trim(), source: 'header' });
  }

  // Try footer if not found
  if (phoneMatches.length === 0) {
    match = footerText.match(phoneRegex);
    if (match && match.length > 0) {
      phoneMatches.push({ phone: match[0].trim(), source: 'footer' });
    }
  }

  if (phoneMatches.length > 0) {
    result.supplierPhone = {
      value: phoneMatches[0].phone,
      confidence: 'high',
      source: phoneMatches[0].source,
    };
  }

  // ============================================
  // SUPPLIER NAME EXTRACTION
  // ============================================
  const lines = (headerText + '\n' + footerText).split('\n').filter(l => l.trim().length > 0);
  const companyPatterns = [
    /CO\.,?\s*LTD\.?/i,
    /COMPANY\s*LIMITED/i,
    /TRADING\s*CO/i,
    /IMPORT.*EXPORT|EXPORT.*IMPORT/i,
    /CORPORATION/i,
    /INDUSTRIAL/i,
    /FACTORY/i,
    /LTD\.?$/i,
    /INC\.?$/i,
  ];

  let bestMatch = null;
  let bestScore = 0;
  let bestSource = null;

  lines.forEach(line => {
    let score = 0;
    const cleanLine = line.trim();

    if (cleanLine.length < 5) return;

    companyPatterns.forEach(pattern => {
      if (pattern.test(cleanLine)) {
        score += 10;
      }
    });

    if (result.supplierEmail.value && cleanLine.toLowerCase().includes(result.supplierEmail.value.toLowerCase())) {
      score += 5;
    }

    if (cleanLine === cleanLine.toUpperCase() && cleanLine.length > 10) {
      score += 3;
    }

    const source = headerText.includes(line) ? 'header' : 'footer';

    if (score > bestScore) {
      bestScore = score;
      bestMatch = cleanLine;
      bestSource = source;
    }
  });

  if (bestMatch && bestScore > 0) {
    result.supplierName = {
      value: bestMatch,
      confidence: bestScore >= 10 ? 'high' : 'medium',
      source: bestSource,
    };
  }

  return result;
}

// ============================================
// TIMEOUT WRAPPER FOR ASYNC OPERATIONS
// ============================================
/**
 * Wrap a promise with a timeout
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of operation for error message
 * @returns {Promise} - Promise that rejects on timeout
 */
function withTimeout(promise, timeoutMs, operationName) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and images allowed.'));
    }
  },
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large image uploads

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'quote-extraction-api' });
});

// ============================================
// DEBUG ROUTES
// ============================================

// Health check for extract-quote endpoint
app.get('/api/health/extract-quote', (req, res) => {
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const region = process.env.VERCEL_REGION || 'local';

  sendJson(res, 200, {
    ok: true,
    hasEnv: hasAnthropicKey,
    runtime: 'node',
    region,
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
  });
});

// Debug route to test extraction pipeline without file upload
app.post('/api/debug/extract-quote', async (req, res) => {
  const requestId = generateRequestId();
  let step = 'start';

  try {
    console.log(`🔍 [DEBUG ${requestId}] Starting debug extraction test`);

    step = 'validate-env';
    // Check for API key
    const apiKey = req.body?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return sendError(res, 'ANTHROPIC_API_KEY not found in env or request', 500, 'MISSING_ENV', requestId, step);
    }

    step = 'build-test-payload';
    // Create a simple test payload (text-based, no file)
    const MODEL = 'claude-sonnet-4-5-20250929';
    const testPayload = {
      model: MODEL,
      max_tokens: 1000,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: 'Extract quote data from this text: Product: Widget, Price: $5.00, MOQ: 100. Return JSON with lineItems array.'
        }
      ],
    };

    step = 'call-llm';
    console.log(`🌐 [DEBUG ${requestId}] Calling Anthropic API...`);

    const response = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(testPayload),
      }),
      30000, // 30 second timeout
      'Anthropic API call'
    );

    if (!response.ok) {
      const error = await response.json();
      return sendError(
        res,
        `API returned ${response.status}: ${error.error?.message || 'Unknown error'}`,
        response.status,
        'ANTHROPIC_API_ERROR',
        requestId,
        step
      );
    }

    step = 'parse-response';
    const data = await response.json();

    step = 'done';
    console.log(`✅ [DEBUG ${requestId}] Test completed successfully`);

    return sendJson(res, 200, {
      ok: true,
      requestId,
      message: 'LLM call successful',
      modelResponse: data.content?.[0]?.text?.substring(0, 200) || 'No content',
      usage: data.usage,
    });

  } catch (error) {
    console.error(`❌ [DEBUG ${requestId}] Error at step ${step}:`, error);
    return sendError(res, error.message, 500, 'DEBUG_TEST_FAILED', requestId, step);
  }
});

// ============================================
// DOCUMENT STORAGE ENDPOINTS
// ============================================

// Upload document to Supabase Storage
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { userId, supplierQuoteId, buyingIntentId } = req.body;

    if (!userId || !supplierQuoteId || !buyingIntentId) {
      return res.status(400).json({
        error: 'Missing required fields: userId, supplierQuoteId, buyingIntentId'
      });
    }

    // Generate file path with folder structure
    const timestamp = Date.now();
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${timestamp}.${fileExtension}`;
    const filePath = `${userId}/buying-intents/${buyingIntentId}/${fileName}`;

    console.log(`📤 Uploading file: ${filePath}`);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Storage upload error:', uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    console.log(`✅ File uploaded successfully: ${uploadData.path}`);

    // Return file metadata
    res.json({
      success: true,
      file: {
        path: uploadData.path,
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
      },
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload file' });
  }
});

// Get signed URL for document preview/download
app.post('/api/documents/signed-url', async (req, res) => {
  try {
    const { filePath, expiresIn = 3600 } = req.body; // Default 1 hour expiry

    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    console.log(`🔗 Generating signed URL for: ${filePath}`);

    // Generate signed URL
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error('❌ Signed URL error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`✅ Signed URL generated`);

    res.json({
      success: true,
      signedUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });

  } catch (error) {
    console.error('❌ Signed URL error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate signed URL' });
  }
});

// ============================================
// EXTRACT QUOTE FROM IMAGE/PDF
// ============================================
app.post('/api/extract-quote', async (req, res) => {
  const requestId = generateRequestId();
  let step = 'start';

  // TOP-LEVEL TRY-CATCH: Catches ALL errors including sync errors
  try {
    console.log(`🚀 [${requestId}] START`);

    // ============================================
    // STEP: validate-env
    // ============================================
    step = 'validate-env';
    console.log(`📋 [${requestId}] Step: ${step}`);

    // Validate environment variables
    const missingEnvVars = [];
    if (!process.env.VITE_SUPABASE_URL) missingEnvVars.push('VITE_SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnvVars.push('SUPABASE_SERVICE_ROLE_KEY');

    if (missingEnvVars.length > 0) {
      console.error(`❌ [${requestId}] Missing env vars: ${missingEnvVars.join(', ')}`);
      return sendError(
        res,
        `Missing environment variables: ${missingEnvVars.join(', ')}`,
        500,
        'MISSING_ENV',
        requestId,
        step
      );
    }

    // ============================================
    // STEP: read-body
    // ============================================
    step = 'read-body';
    console.log(`📋 [${requestId}] Step: ${step}`);

    if (!req.body) {
      console.error(`❌ [${requestId}] No request body`);
      return sendError(res, 'Request body is required', 400, 'MISSING_BODY', requestId, step);
    }

    const { image, mediaType, apiKey } = req.body;

    // Validate required fields
    if (!image) {
      console.error(`❌ [${requestId}] Missing image data`);
      return sendError(res, 'Image data required', 400, 'MISSING_IMAGE', requestId, step);
    }

    if (!apiKey) {
      console.error(`❌ [${requestId}] Missing API key`);
      return sendError(res, 'Anthropic API key required', 400, 'MISSING_API_KEY', requestId, step);
    }

    // ============================================
    // STEP: decode-file
    // ============================================
    step = 'decode-file';
    console.log(`📋 [${requestId}] Step: ${step}`);

    // Check payload size (Vercel body limit: 4.5MB, we enforce 8MB as reasonable max)
    const imageSize = Buffer.byteLength(image, 'base64');
    const imageSizeMB = (imageSize / 1024 / 1024).toFixed(2);
    console.log(`📏 [${requestId}] File size: ${imageSizeMB} MB`);

    if (imageSize > 8 * 1024 * 1024) { // 8MB hard limit
      console.error(`❌ [${requestId}] File too large: ${imageSizeMB} MB`);
      return sendError(
        res,
        `File too large (${imageSizeMB} MB). Maximum is 8 MB.`,
        413,
        'PAYLOAD_TOO_LARGE',
        requestId,
        step
      );
    }

    const MODEL = 'claude-sonnet-4-5-20250929';
    const isPdf = mediaType === 'application/pdf';

    console.log(`📋 [${requestId}] File type: ${isPdf ? 'PDF' : 'IMAGE'}, size: ${imageSize} bytes (${imageSizeMB} MB)`);
    console.log(`🤖 [${requestId}] Model: ${MODEL}`);

    // ============================================
    // STEP: pdf-text (optional - for logging/debugging)
    // ============================================
    step = 'pdf-text';
    let pdfTextData = null;
    let regexSupplierInfo = null;

    if (isPdf) {
      console.log(`📋 [${requestId}] Step: ${step}`);

      // Try to extract text for debugging/logging (optional, won't crash if fails)
      try {
        // Dynamic import to avoid cold-start crash
        // Only import if we're in local development or pdf-parse is available
        const pdfBuffer = Buffer.from(image, 'base64');

        // Try to use pdf-parse if available (dynamic import won't crash if missing)
        try {
          const { default: pdfParse } = await import('pdf-parse');
          const pdfData = await pdfParse(pdfBuffer);
          const fullText = pdfData.text || '';
          const lines = fullText.split('\n');

          // Extract header (top 20%) and footer (bottom 20%)
          const headerLineCount = Math.ceil(lines.length * 0.2);
          const footerLineCount = Math.ceil(lines.length * 0.2);
          const headerText = lines.slice(0, headerLineCount).join('\n');
          const footerText = lines.slice(-footerLineCount).join('\n');

          pdfTextData = {
            headerText,
            footerText,
            bodyText: fullText,
            pageCount: pdfData.numpages,
          };

          console.log(`📄 [${requestId}] PDF text extracted successfully`);
          console.log(`   - Pages: ${pdfData.numpages}`);
          console.log(`   - Total text length: ${fullText.length} chars`);
          console.log(`   - Header length: ${headerText.length} chars`);
          console.log(`   - Footer length: ${footerText.length} chars`);
          console.log(`   - Header preview: ${headerText.substring(0, 200).replace(/\n/g, ' ')}`);
          console.log(`   - Body preview: ${fullText.substring(0, 200).replace(/\n/g, ' ')}`);

          // Validate extracted text
          if (fullText.trim().length < 50) {
            console.warn(`⚠️  [${requestId}] WARNING: Extracted text is very short (${fullText.length} chars)`);
            console.warn(`   This may indicate OCR/parsing issues. Will proceed with native PDF support.`);
          }

          // Try regex-based supplier extraction from header/footer
          if (headerText || footerText) {
            regexSupplierInfo = extractSupplierInfoFromText({ headerText, footerText, bodyText: fullText });
            console.log(`📧 [${requestId}] Regex supplier extraction:`);
            console.log(`   - Email: ${regexSupplierInfo.supplierEmail?.value || 'not found'} (${regexSupplierInfo.supplierEmail?.source || 'n/a'})`);
            console.log(`   - Phone: ${regexSupplierInfo.supplierPhone?.value || 'not found'} (${regexSupplierInfo.supplierPhone?.source || 'n/a'})`);
            console.log(`   - Name: ${regexSupplierInfo.supplierName?.value || 'not found'} (${regexSupplierInfo.supplierName?.source || 'n/a'})`);
          }

        } catch (pdfParseError) {
          // pdf-parse not available or failed - not critical, Anthropic handles PDFs natively
          console.log(`📄 [${requestId}] pdf-parse not available (${pdfParseError.message}), using native PDF support`);
        }

      } catch (error) {
        // Text extraction failed - not critical
        console.warn(`⚠️  [${requestId}] PDF text extraction failed: ${error.message}`);
        console.log(`   Will proceed with Anthropic's native PDF support`);
      }
    }

    // ============================================
    // STEP: build-llm-request
    // ============================================
    step = 'build-llm-request';
    console.log(`📋 [${requestId}] Step: ${step}`);

    const contentItem = isPdf ? {
      type: 'document',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: image,
      },
    } : {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: image,
      },
    };

    const requestPayload = {
      model: MODEL,
      max_tokens: 4000,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            contentItem,
            {
              type: 'text',
              text: `${EXTRACTION_SYSTEM_PROMPT}

You extract supplier quote data from ${isPdf ? 'PDF documents' : 'images'}. Follow these steps EXACTLY.

SUPPLIER INFO EXTRACTION (PRIORITY):
Before extracting line items, find supplier/factory information in the document header/footer:
- supplierName: Company name (look for "From:", letterhead, company seal, CO., LTD)
- supplierContact: Contact person name (if explicitly stated)
- supplierEmail: Email address (look for "Email:", "E-mail:", "Mail:" in header/footer)
- supplierPhone: Phone/WhatsApp number (look for "Tel:", "Phone:", "WhatsApp:", "Mob:")
- supplierAddress: Full address (factory/office location)

RULES FOR SUPPLIER INFO:
- ONLY extract if explicitly present in header/footer/contact section
- DO NOT infer or guess
- If not found → set to null
- Email must be actual email address (contains @)
- Phone must include country code if shown (+86, etc.)

STEP-BY-STEP INSTRUCTIONS (DO NOT SKIP):

STEP 1: IDENTIFY THE TABLE
- Look at the image
- Find the table with product/quote information

STEP 2: IDENTIFY COLUMN HEADERS
- Read the FIRST ROW of the table (column headers)
- Write down which column is which

STEP 3: FIND THE PRICE COLUMN
- Which column header contains these words: "Unit Price" OR "Price" OR "/PC" OR "USD"?
- That is the PRICE column
- Remember which column number it is (1st? 2nd? 3rd?)

STEP 4: FIND COLUMNS TO IGNORE
- Which columns say "CBM" OR "Meas" OR "Volume"?
- Those are NOT price columns - they are measurement columns
- NEVER use these columns for unitPrice

STEP 5: EXTRACT EACH ROW
For each data row in the table:
a) Go to the PRICE column (from Step 3)
b) Extract the number from that column
c) That number is the unitPrice
d) DO NOT use numbers from other columns

EXAMPLE (THIS IS YOUR ACTUAL QUOTE):
Row 1 headers: [Item No] [Unit Price] [Meas/CBM]
Row 2 data:    [LS-323]  [USD0.0389/PC] [0.077]

CORRECT EXTRACTION FOR ROW 2:
- unitPrice = 0.0389 (from column 2 "Unit Price")
- cbm = 0.077 (from column 3 "Meas/CBM")

WRONG EXTRACTION (DO NOT DO THIS):
- unitPrice = 0.077 ← WRONG! This is from the CBM column, not the price column!

VERIFICATION STEP:
After extracting unitPrice, ask yourself:
"Did I get this number from a column that says Price/Unit Price/USD/PC?"
If NO → You extracted from the wrong column! Set unitPrice = null instead.

CRITICAL RULES:
1. Column header determines what data is in that column
2. If header says "CBM" or "Meas", that column is NOT unitPrice
3. Only extract from columns labeled with price-related words
4. Extract ALL rows in the table

PRIORITY: Extract ALL line items. Extract ALL logistics fields for landed cost.

Return ONLY the JSON object, nothing else.`
            }
          ]
        }
      ],
    };

    const requestPayloadSize = JSON.stringify(requestPayload).length;
    console.log(`   - Payload size: ${(requestPayloadSize / 1024).toFixed(2)} KB`);

    // ============================================
    // STEP: llm-call
    // ============================================
    step = 'llm-call';
    console.log(`📋 [${requestId}] Step: ${step}`);
    console.log(`🌐 [${requestId}] Calling Anthropic API...`);
    const apiCallStart = Date.now();

    // Wrap API call with 60 second timeout
    const response = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestPayload),
      }),
      60000, // 60 second timeout
      'Anthropic API call'
    );

    const apiCallDuration = Date.now() - apiCallStart;
    console.log(`   - API call completed in ${apiCallDuration}ms`);
    console.log(`   - Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`❌ [${requestId}] Anthropic API returned error status`);
      const error = await response.json();
      console.error(`   - Error type: ${error.error?.type}`);
      console.error(`   - Error message: ${error.error?.message}`);

      return sendError(
        res,
        `Model '${MODEL}' failed: ${error.error?.message || 'Unknown error'}`,
        response.status,
        'ANTHROPIC_API_ERROR',
        requestId,
        step
      );
    }

    // ============================================
    // STEP: parse-llm-response
    // ============================================
    step = 'parse-llm-response';
    console.log(`📋 [${requestId}] Step: ${step}`);

    const data = await response.json();
    console.log(`   - Response tokens: ${data.usage?.input_tokens || 0} in, ${data.usage?.output_tokens || 0} out`);
    console.log(`   - Stop reason: ${data.stop_reason}`);

    const content = data.content?.[0]?.text;

    if (!content) {
      console.error(`❌ [${requestId}] Empty content in response`);
      return sendError(res, 'No response from Claude', 500, 'EMPTY_RESPONSE', requestId, step);
    }

    console.log(`   - Content length: ${content.length} chars`);
    console.log(`   - Content preview: ${content.substring(0, 100)}...`);

    // ============================================
    // STEP: post-parse
    // ============================================
    step = 'post-parse';
    console.log(`📋 [${requestId}] Step: ${step}`);

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`❌ [${requestId}] No JSON found in model output`);
      console.error(`   - Full content: ${content.substring(0, 500)}`);
      return sendError(res, 'Could not parse extraction result from model output', 500, 'PARSE_ERROR', requestId, step);
    }

    console.log(`   - Found JSON block: ${jsonMatch[0].length} chars`);

    let rawData;
    try {
      rawData = JSON.parse(jsonMatch[0]);
      console.log(`   - Parsed successfully`);
      console.log(`   - Line items: ${rawData.lineItems?.length || 0}`);
    } catch (parseError) {
      console.error(`❌ [${requestId}] JSON parse failed:`, parseError.message);
      console.error(`   - Invalid JSON: ${jsonMatch[0].substring(0, 200)}`);
      return sendError(res, `Invalid JSON from model: ${parseError.message}`, 500, 'PARSE_ERROR', requestId, step);
    }

    // Apply sanitizer to enforce clean product names
    const sanitizedData = sanitizeExtractedData(rawData);

    // ============================================
    // STEP: validate-results
    // ============================================
    step = 'validate-results';
    console.log(`📋 [${requestId}] Step: ${step}`);

    const itemCount = sanitizedData.lineItems?.length || 0;
    console.log(`   - Validated line items: ${itemCount}`);

    // Fail fast if we got 0 items (likely extraction failure)
    if (itemCount === 0) {
      console.error(`❌ [${requestId}] Extraction returned 0 items`);
      console.error(`   - Raw data preview: ${JSON.stringify(sanitizedData).substring(0, 300)}`);
      console.error(`   - Model output preview: ${content.substring(0, 500)}`);

      return sendError(
        res,
        'Extraction returned 0 items. The PDF may be image-based (requiring OCR) or the table format is not recognized. Please try a different file or contact support.',
        500,
        'EMPTY_EXTRACTION',
        requestId,
        step
      );
    }

    // Merge regex-based supplier info if available
    if (regexSupplierInfo) {
      // Override with regex-extracted values if LLM didn't find them
      if (!sanitizedData.supplierEmail && regexSupplierInfo.supplierEmail?.value) {
        sanitizedData.supplierEmail = regexSupplierInfo.supplierEmail;
        console.log(`   ✓ Using regex-extracted email: ${regexSupplierInfo.supplierEmail.value}`);
      }
      if (!sanitizedData.supplierPhone && regexSupplierInfo.supplierPhone?.value) {
        sanitizedData.supplierPhone = regexSupplierInfo.supplierPhone;
        console.log(`   ✓ Using regex-extracted phone: ${regexSupplierInfo.supplierPhone.value}`);
      }
      if (!sanitizedData.supplierName && regexSupplierInfo.supplierName?.value) {
        sanitizedData.supplierName = regexSupplierInfo.supplierName;
        console.log(`   ✓ Using regex-extracted name: ${regexSupplierInfo.supplierName.value}`);
      }
    }

    // ============================================
    // STEP: done
    // ============================================
    step = 'done';
    console.log(`✅ [${requestId}] Step: ${step}`);
    console.log(`   - Supplier name: ${sanitizedData.supplierName?.value || 'not found'}`);
    console.log(`   - Supplier email: ${sanitizedData.supplierEmail?.value || 'not found'}`);
    console.log(`   - Line items: ${sanitizedData.lineItems?.length || 0}`);

    // Add debug metadata (non-production only)
    const responseData = {
      ...sanitizedData,
      ...(process.env.NODE_ENV !== 'production' && {
        _debug: {
          requestId,
          pdfTextExtracted: !!pdfTextData,
          bodyTextLen: pdfTextData?.bodyText?.length || 0,
          headerTextLen: pdfTextData?.headerText?.length || 0,
          footerTextLen: pdfTextData?.footerText?.length || 0,
          headerPreview: pdfTextData?.headerText?.substring(0, 200).replace(/\n/g, ' ') || 'N/A',
          bodyPreview: pdfTextData?.bodyText?.substring(0, 200).replace(/\n/g, ' ') || 'N/A',
          regexFoundEmail: !!regexSupplierInfo?.supplierEmail?.value,
          regexFoundPhone: !!regexSupplierInfo?.supplierPhone?.value,
          regexFoundName: !!regexSupplierInfo?.supplierName?.value,
        },
      }),
    };

    // Return the extracted data with standardized success response
    return sendSuccess(res, responseData);

  } catch (error) {
    // ============================================
    // TOP-LEVEL CATCH: Handles ALL errors
    // ============================================
    console.error(`❌ [${requestId}] FATAL ERROR at step: ${step}`);
    console.error(`   - Name: ${error.name}`);
    console.error(`   - Message: ${error.message}`);
    if (error.stack) {
      console.error(`   - Stack:`);
      console.error(error.stack);
    }

    // Check for specific error types
    let errorCode = 'EXTRACTION_FAILED';
    if (error.message && error.message.includes('timed out')) {
      errorCode = 'TIMEOUT';
    } else if (error.message && error.message.includes('fetch')) {
      errorCode = 'NETWORK_ERROR';
    }

    // ALWAYS return JSON, never throw
    return sendError(res, error, 500, errorCode, requestId, step);
  }
});

// Extract quote from text message
app.post('/api/extract-quote-from-text', async (req, res) => {
  console.log('📝 [TEXT EXTRACTION] Starting text quote extraction');

  try {
    const { text, apiKey } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text content required' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic API key required' });
    }

    const MODEL = 'claude-sonnet-4-5-20250929';
    console.log(`[API] Using model: ${MODEL} for text extraction`);

    // Call Anthropic API with text-only prompt
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `${EXTRACTION_SYSTEM_PROMPT}

Extract supplier quote information from this message. Parse all pricing, quantities, and terms.

MESSAGE:
${text}

Extract into this JSON format (return ONLY JSON, no markdown):

{
  "supplierName": "company name" or null,
  "supplierContact": "contact person" or null,
  "supplierEmail": "email" or null,
  "supplierPhone": "phone/whatsapp number" or null,
  "supplierAddress": "full address" or null,
  "currency": "USD" or "EUR" or "CNY" or "RMB" etc. or null,
  "incoterm": "FOB Shanghai" or "CIF LA" etc. or null,
  "quoteDate": "YYYY-MM-DD" or null,
  "validUntil": "YYYY-MM-DD" or null,
  "paymentTerms": "exact terms" or null,
  "leadTime": "exact lead time" or null,
  "notes": "important notes (like local fees, delivery options)" or null,
  "lineItems": [
    {
      "productName": "clean product name ONLY (NO specs/dimensions/weight)",
      "sku": "model/item number" or null,
      "material": "material type (e.g. cotton, aluminum, paper)" or null,
      "unitPrice": 1.23 (per piece, number only) or null,
      "priceConfidence": "high" or "medium" or "low",
      "moq": 1000 (number only) or null,
      "moqConfidence": "high" or "medium" or "low",
      "quantity": 5000 or null,
      "dimensions": "exact dimensions text" or null,
      "weight_g": 50 (grams, number only) or null,
      "packing_pcs_per_ctn": 600 (number only) or null,
      "carton_length_cm": 45.5 (cm, number only) or null,
      "carton_width_cm": 35.0 (cm, number only) or null,
      "carton_height_cm": 30.0 (cm, number only) or null,
      "cbm_per_carton": 0.077 (number only) or null
    }
  ]
}

RULES:
- Extract ALL line items mentioned
- For currency: extract exact currency mentioned (USD, CNY, RMB, EUR, etc.)
- For MOQ: extract from text like "MOQ 500rolls" → 500
- For pricing: extract unit price per piece (e.g., "USD 0.5 per roll" → 0.5)
- For incoterm: extract FOB location if mentioned
- For notes: include special terms like local fees, delivery options, payment conditions
- If only one item, still return array with one item
- Set priceConfidence and moqConfidence to "high" if explicitly stated
- If field not found, set to null (NOT empty string)`
          }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[API Error] Status:', response.status);
      console.error('[API Error] Error:', JSON.stringify(error, null, 2));
      return res.status(response.status).json({
        error: `Model '${MODEL}' failed: ${error.error?.message || 'Unknown error'}`
      });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return res.status(500).json({ error: 'No response from Claude' });
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse extraction result' });
    }

    const rawData = JSON.parse(jsonMatch[0]);

    // Apply sanitizer to enforce clean product names
    const sanitizedData = sanitizeExtractedData(rawData);

    console.log('✅ [TEXT EXTRACTION] Successfully extracted quote from text');

    // Return the extracted data
    res.json({ success: true, data: sanitizedData });

  } catch (error) {
    console.error('[Text Extraction Error]', error);
    res.status(500).json({
      error: error.message || 'Failed to extract quote from text'
    });
  }
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`✅ Quote extraction API running on http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless
export default app;
