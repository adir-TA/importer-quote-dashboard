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

const supabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

if (!supabaseConfigured) {
  // NOTE: deliberately NOT process.exit(1). Under serverless this module is the
  // function entrypoint, so exiting here killed every invocation - including the
  // health checks meant to diagnose the missing configuration. Fail per-request
  // instead, with a readable error.
  console.error('❌ Missing Supabase credentials. Add VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env');
}

// Service-role client. Bypasses RLS, so every route that uses it MUST first
// establish who the caller is (see requireAuth) and scope the query to them.
const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// ============================================
// UTILITY: CRASH-PROOF JSON RESPONSE HELPER
// ============================================

/**
 * Safely serialize object to JSON, removing non-serializable values
 * Handles: circular refs, BigInt, Buffer, Error, undefined, functions, symbols
 */
function safeSerialize(obj) {
  // Tracks the ancestor chain of the value currently being serialized.
  // A plain WeakSet of everything visited would flag legitimately *shared*
  // (non-circular) references as '[Circular]'.
  const ancestors = [];

  return JSON.stringify(obj, function replacer(key, value) {
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

    // Pop ancestors that we have finished descending into
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop();
    }

    // Handle circular references (value is one of its own ancestors)
    if (ancestors.includes(value)) {
      return '[Circular]';
    }
    ancestors.push(value);

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

  // `error` may be a string, an Error, null, or anything else a caller threw.
  const message =
    typeof error === 'string'
      ? error
      : (error && error.message) || 'Unknown error';
  const name = (error && typeof error === 'object' && error.name) || 'Error';

  // Log full error server-side with requestId and step
  console.error(`[ERROR ${requestId}] Step: ${step}, Code: ${code}`);
  console.error(`[ERROR ${requestId}] Message: ${message}`);
  if (error && error.stack) {
    console.error(`[ERROR ${requestId}] Stack:`, error.stack);
  }

  // Send safe error to client (no stack traces)
  return sendJson(res, statusCode, {
    ok: false,
    requestId,
    error: {
      name,
      message,
      code,
      step,
    },
  });
}

// ============================================
// MODEL
// ============================================
// Single source of truth. Three separate `const MODEL = ...` declarations had
// drifted apart (the AI helpers used an older id than extraction).
// Override with ANTHROPIC_MODEL without touching code.
const MODEL_ID = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

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
// QUANTITY/MOQ POST-PROCESSOR
// ============================================
/**
 * Detects and corrects quantity_type based on heuristics
 * - Small values (< 100) likely MOQ
 * - Large values (> 10000) likely regular quantity
 */
function detectAndCorrectQuantityType(data) {
  if (!data || !data.lineItems) return data;

  data.lineItems = data.lineItems.map(item => {
    const rawQty = item.quantity_value ?? item.moq ?? item.quantity;
    // The model sometimes returns "1,000" or "500 pcs" - the numeric
    // comparisons below silently did nothing for those.
    const qtyValue =
      typeof rawQty === 'number'
        ? rawQty
        : rawQty != null && String(rawQty).replace(/[^\d.]/g, '') !== ''
          ? parseFloat(String(rawQty).replace(/[^\d.]/g, ''))
          : null;
    const qtyType = item.quantity_type || 'UNKNOWN';

    // If no quantity data, skip
    if (qtyValue === null || Number.isNaN(qtyValue)) {
      return {
        ...item,
        quantity_value: null,
        quantity_type: 'UNKNOWN',
      };
    }

    // Heuristic detection
    let correctedType = qtyType;

    // Small values likely MOQ
    if (qtyValue < 100 && qtyType === 'UNKNOWN') {
      correctedType = 'MOQ';
    }

    // Very large values likely regular quantity
    if (qtyValue > 10000 && qtyType === 'MOQ') {
      correctedType = 'QTY';
    }

    // If old `moq` field exists and no quantity_value, use it
    const finalValue = qtyValue;
    const finalType = correctedType;

    return {
      ...item,
      quantity_value: finalValue,
      quantity_type: finalType,
      // Keep legacy fields for backwards compatibility
      moq: item.moq || null,
      quantity: item.quantity || null,
    };
  });

  return data;
}

// ============================================
// POST-EXTRACTION SANITIZER
// ============================================
// Enforces clean product names at code level (not just prompt)
function sanitizeExtractedData(data) {
  if (!data || !data.lineItems) return data;

  // Forbidden patterns in product_name.
  // All unit/keyword patterns are anchored with word boundaries. Without them
  // `box` matched inside "Boxing Gloves" and `\d+\s*g` matched inside
  // "5 Gallon Drum", silently mangling legitimate product names.
  const forbiddenPatterns = [
    /\b\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?(?:\s*[x×*]\s*\d+(?:\.\d+)?)?\b/i,  // dimensions: 50x80, 225×175×42
    /\b\d+(?:\.\d+)?\s*(cm|mm|inch|in|ft)\b/i,  // units: 50cm, 175mm
    /\b\d+(?:\.\d+)?\s*(gsm|g|kg|oz|lb)\b/i,  // weight: 100gsm, 50g
    /\b(moq|pcs\s*\/\s*box|pcs\s*\/\s*ctn|pcs\s*per\s*(box|ctn|carton))\b/i,  // packing terms
    /\$\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(usd|eur|cny|rmb)\b/i,  // prices
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
        if (/\d+(?:\.\d+)?\s*[x×*]\s*\d+/i.test(matchedText)) {
          // Dimensions
          if (!extracted.dimensions) {
            extracted.dimensions = matchedText.trim();
          }
        } else if (/\b\d+(?:\.\d+)?\s*(cm|mm|inch)\b/i.test(matchedText)) {
          // Also dimensions
          if (!extracted.dimensions) {
            extracted.dimensions = matchedText.trim();
          }
        } else if (/\b\d+(?:\.\d+)?\s*(gsm|g|kg)\b/i.test(matchedText)) {
          // Weight
          if (!extracted.weight) {
            const weightMatch = matchedText.match(/(\d+(?:\.\d+)?)\s*(gsm|g|kg)/i);
            if (weightMatch) {
              let grams = parseFloat(weightMatch[1]);
              if (weightMatch[2].toLowerCase() === 'kg') grams *= 1000;
              extracted.weight = Math.round(grams);
            }
          }
        } else if (/pcs\s*(\/|per)\s*(box|ctn|carton)/i.test(matchedText)) {
          // Packing
          if (!extracted.packing) {
            const packMatch = matchedText.match(/(\d+)\s*pcs/i);
            if (packMatch) extracted.packing = parseInt(packMatch[1], 10);
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
  // EMAIL EXTRACTION (Enhanced)
  // ============================================
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const emailMatches = [];

  // Try header first (highest priority)
  let matches = headerText.match(emailRegex);
  if (matches && matches.length > 0) {
    // Prefer non-noreply emails
    const nonReply = matches.find(e => !e.toLowerCase().includes('noreply'));
    emailMatches.push({ email: nonReply || matches[0], source: 'header' });
  }

  // Try footer if not found in header
  if (emailMatches.length === 0) {
    matches = footerText.match(emailRegex);
    if (matches && matches.length > 0) {
      const nonReply = matches.find(e => !e.toLowerCase().includes('noreply'));
      emailMatches.push({ email: nonReply || matches[0], source: 'footer' });
    }
  }

  // Try body if still not found
  if (emailMatches.length === 0) {
    matches = bodyText.match(emailRegex);
    if (matches && matches.length > 0) {
      const nonReply = matches.find(e => !e.toLowerCase().includes('noreply'));
      emailMatches.push({ email: nonReply || matches[0], source: 'body' });
    }
  }

  if (emailMatches.length > 0) {
    result.supplierEmail = {
      value: emailMatches[0].email.toLowerCase(), // Normalize
      confidence: 'high',
      source: `regex-${emailMatches[0].source}`,
    };
  }

  // ============================================
  // PHONE EXTRACTION (Enhanced with multiple patterns)
  // ============================================
  const phonePatterns = [
    // Labeled phone (Tel:, Phone:, etc.)
    /(?:Tel|TEL|T|Phone|PHONE|P|Mob|Mobile|MOB|WhatsApp|WeChat|Wechat|WX)[:\s]+([+\d\s().-]{9,})/gi,
    // International format: +86 xxx-xxxx-xxxx
    /(\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})/g,
    // Country code: (0086) or 0086
    /((?:\(00\d{2}\)|00\d{2})[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})/g,
    // Long digit sequences (at least 8 digits with optional separators)
    /(\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?)/g,
  ];

  const phoneMatches = [];

  // Try header first
  for (const pattern of phonePatterns) {
    const matches = [...headerText.matchAll(new RegExp(pattern.source, pattern.flags))];
    if (matches.length > 0) {
      matches.forEach(m => {
        const phone = (m[1] || m[0]).trim();
        // Filter out obvious non-phones (too short, all same digit, etc.)
        if (phone.replace(/[^\d]/g, '').length >= 8 && !/^(\d)\1+$/.test(phone.replace(/[^\d]/g, ''))) {
          phoneMatches.push({ phone, source: 'header' });
        }
      });
      if (phoneMatches.length > 0) break; // Found in header, stop
    }
  }

  // Try footer if not found
  if (phoneMatches.length === 0) {
    for (const pattern of phonePatterns) {
      const matches = [...footerText.matchAll(new RegExp(pattern.source, pattern.flags))];
      if (matches.length > 0) {
        matches.forEach(m => {
          const phone = (m[1] || m[0]).trim();
          if (phone.replace(/[^\d]/g, '').length >= 8 && !/^(\d)\1+$/.test(phone.replace(/[^\d]/g, ''))) {
            phoneMatches.push({ phone, source: 'footer' });
          }
        });
        if (phoneMatches.length > 0) break;
      }
    }
  }

  if (phoneMatches.length > 0) {
    result.supplierPhone = {
      value: phoneMatches[0].phone,
      confidence: 'high',
      source: `regex-${phoneMatches[0].source}`,
    };
  }

  // ============================================
  // SUPPLIER NAME EXTRACTION (Enhanced heuristics)
  // ============================================
  const lines = (headerText + '\n' + footerText).split('\n').filter(l => l.trim().length > 0);
  const companyKeywords = [
    { pattern: /CO\.,?\s*LTD\.?/i, score: 15 },
    { pattern: /COMPANY\s*LIMITED/i, score: 15 },
    { pattern: /LIMITED\s*COMPANY/i, score: 15 },
    { pattern: /\bLTD\.?\b/i, score: 12 },
    { pattern: /\bINC\.?\b/i, score: 12 },
    { pattern: /TRADING\s*CO/i, score: 10 },
    { pattern: /IMPORT.*EXPORT|EXPORT.*IMPORT/i, score: 10 },
    { pattern: /CORPORATION/i, score: 10 },
    { pattern: /INDUSTRIAL/i, score: 8 },
    { pattern: /FACTORY/i, score: 8 },
    { pattern: /MANUFACTURER/i, score: 8 },
    { pattern: /GROUP/i, score: 5 },
  ];

  let bestMatch = null;
  let bestScore = 0;
  let bestSource = null;

  lines.forEach(line => {
    let score = 0;
    const cleanLine = line.trim();

    // Skip very short lines or common headers
    if (cleanLine.length < 5 || /^(page|total|quotation|invoice|from|to|date)/i.test(cleanLine)) {
      return;
    }

    // Check company keywords
    companyKeywords.forEach(({ pattern, score: points }) => {
      if (pattern.test(cleanLine)) {
        score += points;
      }
    });

    // Boost if line is near email (likely company name + contact)
    if (result.supplierEmail.value && cleanLine.toLowerCase().includes(result.supplierEmail.value.toLowerCase())) {
      score += 8;
    }

    // Boost if line is all caps and reasonable length (common for company names)
    if (cleanLine === cleanLine.toUpperCase() && cleanLine.length >= 10 && cleanLine.length <= 80) {
      score += 5;
    }

    // Boost if line contains both letters and common business words
    if (/[A-Z]/.test(cleanLine) && /\b(TRADING|IMPORT|EXPORT|INDUSTRIAL|MANUFACTURING)\b/i.test(cleanLine)) {
      score += 7;
    }

    // Penalize if line contains too many numbers (likely not company name)
    const digitRatio = (cleanLine.match(/\d/g) || []).length / cleanLine.length;
    if (digitRatio > 0.3) {
      score -= 5;
    }

    const source = headerText.includes(line) ? 'header' : 'footer';

    if (score > bestScore) {
      bestScore = score;
      bestMatch = cleanLine;
      bestSource = source;
    }
  });

  if (bestMatch && bestScore >= 8) { // Lower threshold since we have better scoring
    result.supplierName = {
      value: bestMatch,
      confidence: bestScore >= 15 ? 'high' : (bestScore >= 10 ? 'medium' : 'low'),
      source: `regex-${bestSource}`,
    };
  }

  // ============================================
  // ADDRESS EXTRACTION (Enhanced)
  // ============================================
  const addressKeywords = ['address', 'addr', 'room', 'floor', 'building', 'street', 'road', 'avenue', 'city', 'province', 'district', 'zip', 'postal'];
  const addressLines = [];

  lines.forEach(line => {
    const lowerLine = line.toLowerCase();
    // Check if line contains address keywords
    if (addressKeywords.some(keyword => lowerLine.includes(keyword))) {
      const source = headerText.includes(line) ? 'header' : footerText.includes(line) ? 'footer' : 'body';
      addressLines.push({ address: line.trim(), source });
    }
  });

  if (addressLines.length > 0) {
    // Prefer header addresses
    const headerAddr = addressLines.find(a => a.source === 'header');
    const bestAddr = headerAddr || addressLines[0];

    result.supplierAddress = {
      value: bestAddr.address,
      confidence: 'medium',
      source: `regex-${bestAddr.source}`,
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

// ============================================
// ROBUST JSON EXTRACTION FROM MODEL OUTPUT
// ============================================
/**
 * Extract JSON from model output, handling code fences, trailing commas, etc.
 * @param {string} text - Model output text
 * @returns {Object|null} - Parsed JSON object or null if extraction failed
 */
/** Redact contact details before a model output preview reaches the logs. */
function redactPreview(text = '') {
  return String(text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[PHONE]')
    .replace(/\n/g, ' ');
}

function extractJsonFromText(text) {
  if (!text) return null;

  // Step 1: Remove code fences (```json ... ``` or ``` ... ```)
  let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');

  // Step 2: Find first '{' and last '}'
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    return null;
  }

  let jsonStr = cleaned.substring(firstBrace, lastBrace + 1);

  // Step 3: Try parsing as-is
  try {
    return JSON.parse(jsonStr);
  } catch (e1) {
    // Step 4: Try fixing common issues

    // Fix trailing commas before ] or }
    let fixed = jsonStr
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');

    try {
      return JSON.parse(fixed);
    } catch (e2) {
      // Step 5: Try removing all newlines and extra whitespace
      fixed = jsonStr
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ');

      try {
        return JSON.parse(fixed);
      } catch (e3) {
        // Give up
        return null;
      }
    }
  }
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

// ============================================
// CORS - explicit allowlist
// ============================================
// Previously `app.use(cors())` allowed every origin on every route, including
// the service-role storage endpoints below.
const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
];

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
);

if (process.env.NODE_ENV !== 'production') {
  DEFAULT_DEV_ORIGINS.forEach(o => allowedOrigins.add(o));
}

// Vercel serves the API from the same origin as the app, so same-origin
// requests (no Origin header) are always fine.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    if (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) {
      return callback(null, true);
    }
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' })); // Allow large image uploads

// ============================================
// AUTHENTICATION
// ============================================
/**
 * Verify the Supabase access token sent by the browser and attach the user.
 *
 * Every endpoint that touches the service-role client must sit behind this.
 * Without it, `userId` / `bucket` / `filePath` came straight from the request
 * body and any anonymous caller could read or overwrite another user's files.
 */
async function requireAuth(req, res, next) {
  const requestId = generateRequestId();
  req.requestId = requestId;

  if (!supabase) {
    return sendError(
      res,
      'Server is not configured (missing Supabase credentials)',
      503,
      'MISSING_ENV',
      requestId,
      'auth'
    );
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return sendError(res, 'Authentication required', 401, 'UNAUTHENTICATED', requestId, 'auth');
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return sendError(res, 'Invalid or expired session', 401, 'UNAUTHENTICATED', requestId, 'auth');
    }
    req.user = data.user;
    return next();
  } catch (error) {
    console.error(`[ERROR ${requestId}] Auth check failed:`, error.message);
    return sendError(res, 'Could not verify session', 401, 'UNAUTHENTICATED', requestId, 'auth');
  }
}

/**
 * Resolve the Anthropic API key for a request WITHOUT it ever travelling
 * through the browser. Order of preference:
 *   1. A server-wide key (ANTHROPIC_API_KEY) - the operator pays.
 *   2. The authenticated user's own key, read server-side from user_settings.
 */
async function resolveApiKey(userId) {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from('user_settings')
    .select('api_key')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[resolveApiKey] Failed to load user settings:', error.message);
    return null;
  }

  return data?.api_key || null;
}

/**
 * Storage paths are always `${userId}/...`. Reject anything else, including
 * traversal attempts, before handing the path to the service-role client.
 */
const ALLOWED_BUCKETS = new Set(['documents', 'business-cards']);

function assertOwnedStoragePath(path, userId) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1024) {
    return 'Invalid path';
  }
  if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
    return 'Invalid path';
  }
  if (!path.startsWith(`${userId}/`)) {
    return 'Path must be inside your own folder';
  }
  return null;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'quote-extraction-api' });
});

// ============================================
// DEBUG ROUTES
// ============================================

// Health check for extract-quote endpoint
app.get('/api/health/extract-quote', requireAuth, async (req, res) => {
  const region = process.env.VERCEL_REGION || 'local';
  const apiKey = await resolveApiKey(req.user.id);

  sendJson(res, 200, {
    ok: true,
    hasEnv: !!apiKey, // whether *this user* can extract, not whether a server key exists
    runtime: 'node',
    region,
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
  });
});

// Debug route to test extraction pipeline without file upload
app.post('/api/debug/extract-quote', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  let step = 'start';

  try {
    console.log(`🔍 [DEBUG ${requestId}] Starting debug extraction test`);

    step = 'validate-env';
    // Resolved server-side for the authenticated user. This route used to fall
    // back to the operator's ANTHROPIC_API_KEY for *anonymous* callers, which
    // made it a free, public proxy onto a billed account.
    const apiKey = await resolveApiKey(req.user.id);
    if (!apiKey) {
      return sendError(res, 'No Anthropic API key configured. Add one in Settings.', 400, 'MISSING_API_KEY', requestId, step);
    }

    step = 'build-test-payload';
    // Create a simple test payload (text-based, no file)
    const MODEL = MODEL_ID;
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
      modelResponse: redactPreview(data.content?.[0]?.text?.substring(0, 200) || 'No content'),
      usage: data.usage,
    });

  } catch (error) {
    console.error(`❌ [DEBUG ${requestId}] Error at step ${step}:`, error);
    return sendError(res, error.message, 500, 'DEBUG_TEST_FAILED', requestId, step);
  }
});

// ============================================
// STORAGE UPLOAD ENDPOINTS
// ============================================

// Generate a presigned upload URL for any storage bucket
// Client uploads directly to Supabase Storage — no Vercel size limit
app.post('/api/storage/create-upload-url', requireAuth, async (req, res) => {
  const requestId = req.requestId;
  try {
    const { bucket, path } = req.body || {};

    if (!bucket || !path) {
      return sendError(res, 'Missing required fields: bucket, path', 400, 'MISSING_FIELDS', requestId, 'validate');
    }

    if (!ALLOWED_BUCKETS.has(bucket)) {
      return sendError(res, 'Unknown storage bucket', 400, 'INVALID_BUCKET', requestId, 'validate');
    }

    // The signing below uses the service-role key and therefore bypasses RLS.
    // Confine the caller to their own folder or they can overwrite anything.
    const pathError = assertOwnedStoragePath(path, req.user.id);
    if (pathError) {
      return sendError(res, pathError, 403, 'FORBIDDEN_PATH', requestId, 'validate');
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error) {
      console.error(`[ERROR ${requestId}] Failed to create signed upload URL:`, error.message);
      return sendError(res, error.message, 500, 'STORAGE_ERROR', requestId, 'sign');
    }

    // Public URL only makes sense for public buckets
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

    return sendSuccess(res, {
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
      publicUrl: urlData?.publicUrl || null,
    });

  } catch (error) {
    return sendError(res, error, 500, 'STORAGE_ERROR', requestId, 'create-upload-url');
  }
});

// ============================================
// DOCUMENT STORAGE ENDPOINTS
// ============================================

// Upload document to Supabase Storage
app.post('/api/documents/upload', requireAuth, upload.single('file'), async (req, res) => {
  const requestId = req.requestId;
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded', 400, 'MISSING_FILE', requestId, 'validate');
    }

    const { buyingIntentId } = req.body;
    // userId comes from the verified token, never from the request body.
    const userId = req.user.id;

    if (!buyingIntentId) {
      return sendError(res, 'Missing required field: buyingIntentId', 400, 'MISSING_FIELDS', requestId, 'validate');
    }

    // Confirm the caller actually owns the Buying Intent they are filing under
    const { data: intent, error: intentError } = await supabase
      .from('products')
      .select('id')
      .eq('id', buyingIntentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (intentError) {
      return sendError(res, intentError.message, 500, 'DB_ERROR', requestId, 'verify-owner');
    }
    if (!intent) {
      return sendError(res, 'Buying Intent not found', 404, 'NOT_FOUND', requestId, 'verify-owner');
    }

    // Generate file path with folder structure. Sanitize the extension - it
    // comes from a user-supplied filename.
    const timestamp = Date.now();
    const rawExtension = (req.file.originalname.split('.').pop() || '').toLowerCase();
    const fileExtension = /^[a-z0-9]{1,8}$/.test(rawExtension) ? rawExtension : 'bin';
    const fileName = `${timestamp}-${crypto.randomBytes(4).toString('hex')}.${fileExtension}`;
    const filePath = `${userId}/buying-intents/${buyingIntentId}/${fileName}`;

    console.log(`📤 [${requestId}] Uploading document (${req.file.size} bytes)`);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error(`[ERROR ${requestId}] Storage upload error:`, uploadError.message);
      return sendError(res, uploadError.message, 500, 'STORAGE_ERROR', requestId, 'upload');
    }

    console.log(`✅ [${requestId}] File uploaded successfully`);

    return sendSuccess(res, {
      file: {
        path: uploadData.path,
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
      },
    });

  } catch (error) {
    return sendError(res, error, 500, 'UPLOAD_FAILED', requestId, 'documents-upload');
  }
});

// Multer rejects oversized files and disallowed mime types by throwing.
// Without this handler Express returned an HTML error page, which the client's
// JSON parser then reported as "invalid server response".
app.use('/api/documents/upload', (err, req, res, next) => {
  if (!err) return next();
  const requestId = req.requestId || generateRequestId();
  const isLimit = err.code === 'LIMIT_FILE_SIZE';
  return sendError(
    res,
    isLimit ? 'File is larger than the 10MB limit' : err.message,
    isLimit ? 413 : 400,
    isLimit ? 'PAYLOAD_TOO_LARGE' : 'INVALID_FILE',
    requestId,
    'multer'
  );
});

// Get signed URL for document preview/download
const MAX_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

app.post('/api/documents/signed-url', requireAuth, async (req, res) => {
  const requestId = req.requestId;
  try {
    const { filePath } = req.body || {};

    if (!filePath) {
      return sendError(res, 'filePath is required', 400, 'MISSING_FIELDS', requestId, 'validate');
    }

    // This endpoint used to sign ANY path with the service-role key, so any
    // caller could read any user's private documents.
    const pathError = assertOwnedStoragePath(filePath, req.user.id);
    if (pathError) {
      return sendError(res, pathError, 403, 'FORBIDDEN_PATH', requestId, 'validate');
    }

    // Clamp the TTL - it was previously taken verbatim from the client.
    const requested = parseInt(req.body?.expiresIn, 10);
    const expiresIn = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 60), MAX_SIGNED_URL_TTL_SECONDS)
      : MAX_SIGNED_URL_TTL_SECONDS;

    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error(`[ERROR ${requestId}] Signed URL error:`, error.message);
      return sendError(res, error.message, 500, 'STORAGE_ERROR', requestId, 'sign');
    }

    return sendSuccess(res, {
      signedUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });

  } catch (error) {
    return sendError(res, error, 500, 'SIGNED_URL_FAILED', requestId, 'documents-signed-url');
  }
});

// ============================================
// EXTRACT QUOTE FROM IMAGE/PDF
// ============================================
app.post('/api/extract-quote', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
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

    const { image, mediaType } = req.body;

    // Validate required fields
    if (!image) {
      console.error(`❌ [${requestId}] Missing image data`);
      return sendError(res, 'Image data required', 400, 'MISSING_IMAGE', requestId, step);
    }

    if (typeof image !== 'string') {
      return sendError(res, 'Image data must be a base64 string', 400, 'MISSING_IMAGE', requestId, step);
    }

    // The key is resolved server-side from the authenticated user's settings.
    // It used to be posted from the browser in every request body.
    const apiKey = await resolveApiKey(req.user.id);
    if (!apiKey) {
      console.error(`❌ [${requestId}] No API key available for user`);
      return sendError(
        res,
        'No Anthropic API key configured. Add one in Settings.',
        400,
        'MISSING_API_KEY',
        requestId,
        step
      );
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

    const MODEL = MODEL_ID;
    const isPdf = mediaType === 'application/pdf';

    console.log(`📋 [${requestId}] File type: ${isPdf ? 'PDF' : 'IMAGE'}, size: ${imageSize} bytes (${imageSizeMB} MB)`);
    console.log(`🤖 [${requestId}] Model: ${MODEL}`);

    // Track which extraction route was used
    let extractionRoute = 'unknown';
    let ocrTextLen = 0;

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
        const pdfBuffer = Buffer.from(image, 'base64');

        // Try to use pdf-parse if available (dynamic import won't crash if missing)
        try {
          const { default: pdfParse } = await import('pdf-parse');
          const pdfData = await pdfParse(pdfBuffer);
          const fullText = pdfData.text || '';
          const lines = fullText.split('\n');

          // Smart header extraction: first ~30 lines OR lines before common document markers
          const documentMarkers = ['QUOTATION', 'INVOICE', 'PROFORMA', 'PURCHASE ORDER', 'Item No', 'ITEM NO', 'Product', 'PRODUCT', 'Description', 'DESCRIPTION'];
          let headerEndIndex = Math.min(30, lines.length);

          // Find first occurrence of document marker
          for (let i = 0; i < Math.min(50, lines.length); i++) {
            const line = lines[i].toUpperCase();
            if (documentMarkers.some(marker => line.includes(marker.toUpperCase()))) {
              headerEndIndex = i;
              break;
            }
          }

          const headerLines = lines.slice(0, headerEndIndex);
          const bodyLines = lines.slice(headerEndIndex);
          const headerText = headerLines.join('\n');
          const footerText = lines.slice(-Math.ceil(lines.length * 0.15)).join('\n'); // Bottom 15%

          pdfTextData = {
            headerText,
            footerText,
            bodyText: fullText,
            pageCount: pdfData.numpages,
          };

          console.log(`📄 [${requestId}] PDF text extracted successfully`);
          console.log(`   - Pages: ${pdfData.numpages}`);
          console.log(`   - Total text length: ${fullText.length} chars`);
          console.log(`   - Header lines: ${headerEndIndex} (${headerText.length} chars)`);
          console.log(`   - Body length: ${bodyLines.length} lines`);
          console.log(`   - Header length: ${headerText.length} chars`);

          // Validate extracted text
          if (fullText.trim().length < 200) {
            console.warn(`⚠️  [${requestId}] WARNING: Extracted text is short (${fullText.length} chars)`);
            console.warn(`   This may indicate image-based PDF. Will use vision fallback if needed.`);
          } else {
            extractionRoute = 'text';
          }

          // ENHANCED regex-based supplier extraction from header
          if (headerText || footerText) {
            regexSupplierInfo = extractSupplierInfoFromText({ headerText, footerText, bodyText: fullText });
            // Log only whether a field was found, never the value itself -
            // these are supplier contact details.
            console.log(`📧 [${requestId}] Regex supplier extraction (enhanced):`);
            console.log(`   - Email: ${regexSupplierInfo.supplierEmail?.value ? 'found' : 'not found'} (${regexSupplierInfo.supplierEmail?.source || 'n/a'})`);
            console.log(`   - Phone: ${regexSupplierInfo.supplierPhone?.value ? 'found' : 'not found'} (${regexSupplierInfo.supplierPhone?.source || 'n/a'})`);
            console.log(`   - Name: ${regexSupplierInfo.supplierName?.value ? 'found' : 'not found'} (${regexSupplierInfo.supplierName?.source || 'n/a'})`);
            console.log(`   - Address: ${regexSupplierInfo.supplierAddress?.value ? 'found' : 'not found'} (${regexSupplierInfo.supplierAddress?.source || 'n/a'})`);
          }

        } catch (pdfParseError) {
          // pdf-parse not available or failed - not critical, will use vision
          console.log(`📄 [${requestId}] pdf-parse not available (${pdfParseError.message}), will use vision route`);
          extractionRoute = 'vision';
        }

      } catch (error) {
        // Text extraction failed - not critical
        console.warn(`⚠️  [${requestId}] PDF text extraction failed: ${error.message}`);
        console.log(`   Will use vision route`);
        extractionRoute = 'vision';
      }
    }


    // Helper function to call LLM with document/image
    async function callLLMWithDocument(contentType, logPrefix, customImage = null, customMediaType = null) {
      console.log(`📋 [${requestId}] ${logPrefix}: Calling LLM with ${contentType} type`);

      const contentItem = {
        type: contentType,
        source: {
          type: 'base64',
          media_type: customMediaType || mediaType,
          data: customImage || image,
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
- Look at the ${contentType === 'image' ? 'image' : 'document'}
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

CRITICAL RULES:
1. Column header determines what data is in that column
2. If header says "CBM" or "Meas", that column is NOT unitPrice
3. Only extract from columns labeled with price-related words
4. Extract ALL rows in the table

QUANTITY/MOQ EXTRACTION (CRITICAL):
For each line item, extract:
- quantity_value: The numeric quantity mentioned (e.g., "MOQ 500" → 500, "Qty: 1000" → 1000)
- quantity_type: One of: "MOQ", "QTY", or "UNKNOWN"
  * Set to "MOQ" if labeled as MOQ, Minimum Order, Min Qty
  * Set to "QTY" if labeled as Quantity, Qty, Order Qty
  * Set to "UNKNOWN" if ambiguous or not specified

PRIORITY: Extract ALL line items. Extract ALL logistics fields for landed cost.

Return ONLY the JSON object, nothing else.`
              }
            ]
          }
        ],
      };

      // Call API with timeout
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

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Model '${MODEL}' failed: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text;

      if (!content) {
        throw new Error('No response from Claude');
      }

      return { content, usage: data.usage };
    }

    // ============================================
    // STEP: llm-call (with fallback)
    // ============================================
    step = 'llm-call';
    console.log(`📋 [${requestId}] Step: ${step}`);

    let content;
    let attemptedVisionFallback = false;

    try {
      // First attempt: Try document type for PDFs, image for images
      const initialType = isPdf ? 'document' : 'image';
      extractionRoute = isPdf ? 'native-pdf' : 'image';

      const result = await callLLMWithDocument(initialType, 'Primary route');
      content = result.content;

      console.log(`   - Content length: ${content.length} chars`);
  

    } catch (error) {
      console.error(`❌ [${requestId}] Primary route failed: ${error.message}`);

      return sendError(
        res,
        error.message,
        500,
        'ANTHROPIC_API_ERROR',
        requestId,
        step
      );
    }

    // ============================================
    // STEP: post-parse
    // ============================================
    step = 'post-parse';
    console.log(`📋 [${requestId}] Step: ${step}`);

    // Use robust JSON extraction
    const rawData = extractJsonFromText(content);

    if (!rawData) {
      console.error(`❌ [${requestId}] Failed to extract JSON from model output`);
      console.error(`   - Model output preview: ${redactPreview(content.substring(0, 500))}`);
      return sendError(
        res,
        'Could not extract valid JSON from model output. The model may have returned malformed data.',
        500,
        'PARSE_MODEL_OUTPUT',
        requestId,
        step
      );
    }

    console.log(`   - Parsed successfully`);
    console.log(`   - Line items: ${rawData.lineItems?.length || 0}`);

    // Apply sanitizer to enforce clean product names
    let sanitizedData = sanitizeExtractedData(rawData);

    // Apply quantity/MOQ post-processor
    sanitizedData = detectAndCorrectQuantityType(sanitizedData);

    // ============================================
    // STEP: validate-results (with vision fallback)
    // ============================================
    step = 'validate-results';
    console.log(`📋 [${requestId}] Step: ${step}`);

    const itemCount = sanitizedData.lineItems?.length || 0;
    console.log(`   - Validated line items: ${itemCount}`);

    // Track render metadata for debug
    let renderMetadata = null;
    let modelOutputChars = content.length;

    // If we got 0 items and this is a PDF that we tried as "document", try vision fallback
    if (itemCount === 0 && isPdf && !attemptedVisionFallback && extractionRoute === 'native-pdf') {
      console.warn(`⚠️  [${requestId}] Got 0 items from native PDF route, trying vision fallback...`);

      try {
        step = 'llm-call-vision-fallback';
        attemptedVisionFallback = true;
        extractionRoute = 'vision-fallback';

        // Try sending the same PDF but with type="image" instead of type="document"
        // Claude's API can handle PDFs as images without needing server-side rendering
        console.log(`📋 [${requestId}] Sending PDF as type="image" (serverless-safe, no rendering)`);

        renderMetadata = {
          bytes: imageSize,
          approach: 'pdf-as-image',
          mime: mediaType,
        };

        const visionResult = await callLLMWithDocument(
          'image',
          'Vision fallback (PDF as image)',
          image, // Same PDF base64
          mediaType // Same media type (application/pdf)
        );
        content = visionResult.content;
        modelOutputChars = content.length;

        console.log(`   - Vision fallback output length: ${content.length} chars`);
        console.log(`   - Vision output preview: ${redactPreview(content.substring(0, 200))}`);

        // Re-parse using robust extraction
        step = 'post-parse-vision';
        const visionData = extractJsonFromText(content);

        if (!visionData) {
          console.error(`❌ [${requestId}] Vision fallback: Failed to extract JSON`);
          console.error(`   - Model output: ${redactPreview(content.substring(0, 400))}`);
        } else {
          let visionSanitized = sanitizeExtractedData(visionData);
          visionSanitized = detectAndCorrectQuantityType(visionSanitized);
          const visionItemCount = visionSanitized.lineItems?.length || 0;

          console.log(`   - Vision fallback extracted ${visionItemCount} items`);

          if (visionItemCount > 0) {
            // Vision worked! Use this data
            Object.assign(sanitizedData, visionSanitized);
            console.log(`✅ [${requestId}] Vision fallback succeeded with ${visionItemCount} items`);
          } else {
            console.warn(`⚠️  [${requestId}] Vision fallback also returned 0 items`);
            console.warn(`   - Model output preview: ${redactPreview(content.substring(0, 400))}`);
          }
        }
      } catch (visionError) {
        console.error(`❌ [${requestId}] Vision fallback failed:`, visionError.message);
        console.error(`   - Stack:`, visionError.stack);
        // Continue with original (empty) results
      }

      // Re-validate after fallback
      step = 'validate-results';
      const finalItemCount = sanitizedData.lineItems?.length || 0;

      if (finalItemCount === 0) {
        console.error(`❌ [${requestId}] All extraction routes returned 0 items`);
        console.error(`   - Attempted routes: native-pdf, vision-fallback`);
        console.error(`   - Vision fallback approach: ${renderMetadata?.approach || 'unknown'}`);
        console.error(`   - Model output length: ${modelOutputChars} chars`);
        console.error(`   - Model output preview: ${redactPreview(content.substring(0, 400))}`);

        return sendError(
          res,
          `No data extracted from document after trying native PDF and vision routes. Model returned ${modelOutputChars} chars but extracted 0 items. The table format may not be recognized.`,
          500,
          'MODEL_RETURNED_NO_ITEMS',
          requestId,
          step
        );
      }
    } else if (itemCount === 0) {
      // Not a PDF or already tried fallback
      console.error(`❌ [${requestId}] Extraction returned 0 items`);
      console.error(`   - Route used: ${extractionRoute}`);
      console.error(`   - Model output length: ${modelOutputChars} chars`);
      console.error(`   - Model output preview: ${redactPreview(content.substring(0, 400))}`);
      console.error(`   - Raw data preview: ${JSON.stringify(sanitizedData).substring(0, 300)}`);

      return sendError(
        res,
        `No data extracted. Model returned ${modelOutputChars} chars but extracted 0 items. The document format may not be recognized.`,
        500,
        'MODEL_RETURNED_NO_ITEMS',
        requestId,
        step
      );
    }

    // Merge regex-based supplier info if available
    if (regexSupplierInfo) {
      // Override with regex-extracted values if LLM didn't find them
      if (!sanitizedData.supplierEmail && regexSupplierInfo.supplierEmail?.value) {
        sanitizedData.supplierEmail = regexSupplierInfo.supplierEmail;
        console.log('   ✓ Using regex-extracted email');
      }
      if (!sanitizedData.supplierPhone && regexSupplierInfo.supplierPhone?.value) {
        sanitizedData.supplierPhone = regexSupplierInfo.supplierPhone;
        console.log('   ✓ Using regex-extracted phone');
      }
      if (!sanitizedData.supplierName && regexSupplierInfo.supplierName?.value) {
        sanitizedData.supplierName = regexSupplierInfo.supplierName;
        console.log('   ✓ Using regex-extracted name');
      }
    }

    // ============================================
    // STEP: done
    // ============================================
    step = 'done';
    console.log(`✅ [${requestId}] Step: ${step}`);
    console.log(`   - Supplier name: ${sanitizedData.supplierName ? 'found' : 'not found'}`);
    console.log(`   - Supplier email: ${sanitizedData.supplierEmail ? 'found' : 'not found'}`);
    console.log(`   - Line items: ${sanitizedData.lineItems?.length || 0}`);

    // Add debug metadata (non-production only)
    const responseData = {
      ...sanitizedData,
      ...(process.env.NODE_ENV !== 'production' && {
        _debug: {
          requestId,
          routeUsed: extractionRoute,
          attemptedVisionFallback,
          pageCount: pdfTextData?.pageCount || (isPdf ? 'unknown' : 'N/A'),

          // Vision fallback metadata (if attempted)
          visionFallback: renderMetadata ? {
            bytes: renderMetadata.bytes,
            approach: renderMetadata.approach, // 'pdf-as-image' (serverless-safe)
            mime: renderMetadata.mime,
          } : null,

          // Model info
          model: {
            provider: 'Anthropic',
            modelName: MODEL,
            outputChars: modelOutputChars,
          },

          // Text extraction info
          pdfTextExtracted: !!pdfTextData,
          bodyTextLen: pdfTextData?.bodyText?.length || 0,
          headerTextLen: pdfTextData?.headerText?.length || 0,
          footerTextLen: pdfTextData?.footerText?.length || 0,
          ocrTextLen,

          // Previews (redact emails in header)
          previews: {
            headerTextPreview: pdfTextData?.headerText
              ? redactPreview(pdfTextData.headerText.substring(0, 150))
              : 'N/A',
            modelOutputPreview: redactPreview(content.substring(0, 400)),
          },

          // Regex extraction results
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
app.post('/api/extract-quote-from-text', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();
  console.log(`📝 [${requestId}] Starting text quote extraction`);

  try {
    const { text } = req.body || {};

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return sendError(res, 'Text content required', 400, 'MISSING_TEXT', requestId, 'validate');
    }

    if (text.length > 200000) {
      return sendError(res, 'Text is too long to extract in one request', 413, 'PAYLOAD_TOO_LARGE', requestId, 'validate');
    }

    const apiKey = await resolveApiKey(req.user.id);
    if (!apiKey) {
      return sendError(res, 'No Anthropic API key configured. Add one in Settings.', 400, 'MISSING_API_KEY', requestId, 'validate');
    }

    const MODEL = MODEL_ID;
    console.log(`[${requestId}] Using model: ${MODEL} for text extraction`);

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
      const error = await response.json().catch(() => ({}));
      console.error(`[ERROR ${requestId}] Anthropic status ${response.status}`);
      return sendError(
        res,
        `Model '${MODEL}' failed: ${error.error?.message || 'Unknown error'}`,
        response.status,
        'ANTHROPIC_API_ERROR',
        requestId,
        'llm-call'
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return sendError(res, 'No response from Claude', 502, 'EMPTY_RESPONSE', requestId, 'llm-call');
    }

    // Use the same tolerant extractor as the file route rather than a bare
    // regex + JSON.parse, which threw on fenced or trailing-comma output.
    const rawData = extractJsonFromText(content);
    if (!rawData) {
      return sendError(res, 'Could not parse extraction result', 502, 'PARSE_MODEL_OUTPUT', requestId, 'post-parse');
    }

    // Apply sanitizer + quantity post-processing, same as the file route
    let sanitizedData = sanitizeExtractedData(rawData);
    sanitizedData = detectAndCorrectQuantityType(sanitizedData);

    console.log(`✅ [${requestId}] Successfully extracted quote from text`);

    // Same { ok, data } envelope as every other endpoint
    return sendSuccess(res, sanitizedData);

  } catch (error) {
    return sendError(res, error, 500, 'EXTRACTION_FAILED', requestId, 'extract-from-text');
  }
});

// ============================================
// GENERIC AI COMPLETION PROXY
// ============================================
// The AI Helpers page used to call api.anthropic.com straight from the
// browser. Those requests are rejected by CORS, so every AI helper silently
// failed - and it would have exposed the API key if they had succeeded.
const AI_MAX_TOKENS_LIMIT = 4000;

app.post('/api/ai/complete', requireAuth, async (req, res) => {
  const requestId = req.requestId || generateRequestId();

  try {
    const { prompt, system, maxTokens } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return sendError(res, 'Prompt is required', 400, 'MISSING_PROMPT', requestId, 'validate');
    }

    if (prompt.length > 200000) {
      return sendError(res, 'Prompt is too long', 413, 'PAYLOAD_TOO_LARGE', requestId, 'validate');
    }

    const apiKey = await resolveApiKey(req.user.id);
    if (!apiKey) {
      return sendError(res, 'No Anthropic API key configured. Add one in Settings.', 400, 'MISSING_API_KEY', requestId, 'validate');
    }

    const requestedTokens = parseInt(maxTokens, 10);
    const max_tokens = Number.isFinite(requestedTokens)
      ? Math.min(Math.max(requestedTokens, 256), AI_MAX_TOKENS_LIMIT)
      : 2000;

    const response = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL_ID,
          max_tokens,
          ...(system ? { system: String(system) } : {}),
          messages: [{ role: 'user', content: prompt }],
        }),
      }),
      60000,
      'Anthropic API call'
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return sendError(
        res,
        error.error?.message || `Anthropic returned ${response.status}`,
        response.status,
        'ANTHROPIC_API_ERROR',
        requestId,
        'llm-call'
      );
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) {
      return sendError(res, 'No response from Claude', 502, 'EMPTY_RESPONSE', requestId, 'llm-call');
    }

    return sendSuccess(res, { text, usage: data.usage });

  } catch (error) {
    const code = error.message?.includes('timed out') ? 'TIMEOUT' : 'AI_REQUEST_FAILED';
    return sendError(res, error, 500, code, requestId, 'ai-complete');
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
