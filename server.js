// ============================================
// BACKEND SERVER FOR QUOTE EXTRACTION & DOCUMENT STORAGE
// ============================================
// This server proxies API calls to Anthropic and handles Supabase Storage uploads

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import crypto from 'crypto';

// pdf-parse is CommonJS, need to use require
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

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
  return res.status(statusCode).json({
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
 */
function sendError(res, error, statusCode = 500, code = 'INTERNAL_ERROR') {
  const requestId = generateRequestId();
  const message = typeof error === 'string' ? error : error.message;

  // Log full error server-side with requestId
  console.error(`[ERROR ${requestId}] ${code}:`, error);
  if (error.stack) {
    console.error(`[ERROR ${requestId}] Stack:`, error.stack);
  }

  // Send safe error to client (no stack traces)
  return res.status(statusCode).json({
    ok: false,
    error: {
      message,
      code,
      requestId,
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
 * Priority: headerText > footerText > bodyText
 * @param {Object} options - Extraction options
 * @param {string} options.headerText - Text from top 20% of page
 * @param {string} options.footerText - Text from bottom 20% of page
 * @param {string} options.bodyText - Full page text
 * @returns {Object} Extracted supplier info with confidence and source
 */
function extractSupplierInfo({ headerText = '', footerText = '', bodyText = '' }) {
  console.log('[SUPPLIER EXTRACTION] Starting...');
  console.log('[SUPPLIER EXTRACTION] Header length:', headerText.length);
  console.log('[SUPPLIER EXTRACTION] Footer length:', footerText.length);
  console.log('[SUPPLIER EXTRACTION] Body length:', bodyText.length);

  const result = {
    supplierName: { value: null, confidence: 'not_found', source: null },
    supplierEmail: { value: null, confidence: 'not_found', source: null },
    supplierPhone: { value: null, confidence: 'not_found', source: null },
    supplierAddress: { value: null, confidence: 'not_found', source: null },
  };

  // Combine texts with priority
  const allText = `${headerText}\n\n${footerText}\n\n${bodyText}`;

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
    console.log('[SUPPLIER EXTRACTION] Email found:', result.supplierEmail);
  }

  // ============================================
  // PHONE EXTRACTION
  // ============================================
  // Patterns: +86-xxx-xxxx, (0086)xxx-xxxx, Tel: xxx, etc.
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
    console.log('[SUPPLIER EXTRACTION] Phone found:', result.supplierPhone);
  }

  // ============================================
  // SUPPLIER NAME EXTRACTION
  // ============================================
  // Look for company names with patterns like "CO., LTD", "TRADING", "IMPORT", "EXPORT"
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

  // Score each line
  lines.forEach(line => {
    let score = 0;
    const cleanLine = line.trim();

    // Skip very short lines
    if (cleanLine.length < 5) return;

    // Check if line matches company patterns
    companyPatterns.forEach(pattern => {
      if (pattern.test(cleanLine)) {
        score += 10;
      }
    });

    // Prefer lines near email
    if (result.supplierEmail.value && cleanLine.toLowerCase().includes(result.supplierEmail.value.toLowerCase())) {
      score += 5;
    }

    // Prefer all caps company names (common in headers)
    if (cleanLine === cleanLine.toUpperCase() && cleanLine.length > 10) {
      score += 3;
    }

    // Check if in header or footer
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
    console.log('[SUPPLIER EXTRACTION] Company name found:', result.supplierName);
  }

  // ============================================
  // ADDRESS EXTRACTION (basic heuristic)
  // ============================================
  // Look for lines containing address keywords near company name
  const addressKeywords = ['address', 'addr', 'room', 'floor', 'building', 'street', 'road', 'city', 'province', 'district'];

  lines.forEach(line => {
    const lowerLine = line.toLowerCase();
    if (addressKeywords.some(keyword => lowerLine.includes(keyword))) {
      if (!result.supplierAddress.value || result.supplierAddress.confidence !== 'high') {
        const source = headerText.includes(line) ? 'header' : footerText.includes(line) ? 'footer' : 'body';
        result.supplierAddress = {
          value: line.trim(),
          confidence: 'medium',
          source,
        };
      }
    }
  });

  console.log('[SUPPLIER EXTRACTION] Final results:', JSON.stringify(result, null, 2));
  return result;
}

// ============================================
// PDF HEADER/FOOTER EXTRACTION
// ============================================
/**
 * Extracts text from PDF with separate header and footer regions
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} Object with headerText, footerText, and bodyText
 */
async function extractHeaderFooterFromPdf(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    const fullText = data.text;
    const lines = fullText.split('\n');

    // Simple heuristic: top 20% = header, bottom 20% = footer
    const headerLineCount = Math.ceil(lines.length * 0.2);
    const footerLineCount = Math.ceil(lines.length * 0.2);

    const headerLines = lines.slice(0, headerLineCount);
    const footerLines = lines.slice(-footerLineCount);

    const headerText = headerLines.join('\n');
    const footerText = footerLines.join('\n');

    console.log('[PDF EXTRACTION] Total lines:', lines.length);
    console.log('[PDF EXTRACTION] Header lines:', headerLineCount);
    console.log('[PDF EXTRACTION] Footer lines:', footerLineCount);
    console.log('[PDF EXTRACTION] Header text preview:', headerText.substring(0, 200));

    return {
      headerText,
      footerText,
      bodyText: fullText,
      pageCount: data.numpages,
    };
  } catch (error) {
    console.error('[PDF EXTRACTION] Error:', error);
    return {
      headerText: '',
      footerText: '',
      bodyText: '',
      pageCount: 0,
    };
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large image uploads

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'quote-extraction-api' });
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

// Extract quote from image
app.post('/api/extract-quote', async (req, res) => {
  const requestId = generateRequestId();
  console.log(`🚀 [EXTRACTION ${requestId}] Starting quote extraction`);

  try {
    const { image, mediaType, apiKey } = req.body;

    if (!image) {
      return sendError(res, 'Image data required', 400, 'MISSING_IMAGE');
    }

    if (!apiKey) {
      return sendError(res, 'Anthropic API key required', 400, 'MISSING_API_KEY');
    }

    const MODEL = 'claude-sonnet-4-5-20250929';
    console.log(`[API] Using model: ${MODEL} (UPGRADED TO SONNET 4.5!)`);

    // Determine content type based on media type
    const isPdf = mediaType === 'application/pdf';

    // ============================================
    // PDF TEXT EXTRACTION (for header/footer)
    // ============================================
    let pdfTextData = null;
    let regexSupplierInfo = null;

    if (isPdf) {
      console.log('[PDF] Extracting text from PDF for header/footer analysis...');
      const pdfBuffer = Buffer.from(image, 'base64');
      pdfTextData = await extractHeaderFooterFromPdf(pdfBuffer);

      console.log('[PDF] Running regex-based supplier extraction...');
      regexSupplierInfo = extractSupplierInfo({
        headerText: pdfTextData.headerText,
        footerText: pdfTextData.footerText,
        bodyText: pdfTextData.bodyText,
      });
      console.log('[PDF] Regex extraction complete:', regexSupplierInfo);
    }

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

    // Build prompt with header/footer context
    let supplierExtractionGuidance = '';
    if (pdfTextData && (pdfTextData.headerText || pdfTextData.footerText)) {
      supplierExtractionGuidance = `
CRITICAL - HEADER/FOOTER TEXT PROVIDED:
The following text was extracted from the document header and footer:

===== HEADER TEXT =====
${pdfTextData.headerText}
=======================

===== FOOTER TEXT =====
${pdfTextData.footerText}
=======================

MANDATORY: You MUST extract supplier information (name, email, phone, address) from the above header/footer text.
DO NOT return "not found" if the information exists in the header/footer above.
`;
    }

    // Call Anthropic API
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
            content: [
              contentItem,
              {
                type: 'text',
                text: `${EXTRACTION_SYSTEM_PROMPT}

You extract supplier quote data from ${isPdf ? 'PDF documents' : 'images'}. Follow these steps EXACTLY.
${supplierExtractionGuidance}

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
- If header/footer text is provided above, YOU MUST use it for extraction

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

═══════════════════════════════════════════════════════════════
PRODUCT NAME GENERATION:
═══════════════════════════════════════════════════════════════

NEVER use "Unknown product" or null for productName.

Auto-generate using this pattern:
"<Material/Category> - <SKU> - <Dimensions>"

Examples:
- "Aluminium Foil Container - LS-NC323 - 323×265×48mm"
- "Plastic Takeaway Box - TB-500 - 500ml"
- "Paper Cup - PC-16OZ - 16oz"

If no product name visible:
1. Try to extract material/category from context
2. ALWAYS include SKU if available
3. ALWAYS include dimensions if available
4. Minimum: "<SKU> - <Dimensions>"

═══════════════════════════════════════════════════════════════
MOQ EXTRACTION (FIRST-CLASS FIELD):
═══════════════════════════════════════════════════════════════

MOQ is a LINE-ITEM-LEVEL field, NOT a document-level field.

Extract MOQ from table rows:
✓ "600 pcs/ctn" → moq: 600
✓ "1000 pcs/ctn" → moq: 1000
✓ "MOQ: 5000" → moq: 5000
✓ "Min Order: 2000" → moq: 2000

MOQ may appear in columns labeled:
- "MOQ"
- "Min Order"
- "Minimum Qty"
- "Packing" (e.g., "600 pcs/ctn")

CRITICAL: MOQ must be attached to each line item.
If MOQ exists in the row → extract it and set high confidence.
If missing → set moq to null (NOT zero).

═══════════════════════════════════════════════════════════════
CONFIDENCE SCORING:
═══════════════════════════════════════════════════════════════

For unitPrice and moq, add confidence scores:

"high" = clearly labeled in document (exact header match + row alignment)
"medium" = inferable from context but not explicitly labeled
"low" = ambiguous, unclear, conflicting, or sanity-flagged

═══════════════════════════════════════════════════════════════
LOGISTICS FIELDS (CRITICAL FOR LANDED COST):
═══════════════════════════════════════════════════════════════

Extract these fields for EACH line item (required for landed cost calculation):

1. weight_g: Product weight in grams (number only)
   - "50g" → 50
   - "0.05kg" → 50
   - "Weight: 100g" → 100

2. packing_pcs_per_ctn: How many pieces per carton (number only)
   - "600 pcs/ctn" → 600
   - "Packing: 1000pcs/carton" → 1000

3. Carton dimensions (numbers only, in cm):
   - carton_length_cm: "45×35×30cm" → 45
   - carton_width_cm: "45×35×30cm" → 35
   - carton_height_cm: "45×35×30cm" → 30

4. cbm_per_carton: CBM value (number only)
   - "Meas: 0.077" → 0.077
   - "CBM: 0.104" → 0.104

If logistics fields are in separate columns, extract them all.
If not found → set to null (do NOT guess).

═══════════════════════════════════════════════════════════════
JSON STRUCTURE (return ONLY this, no markdown):
═══════════════════════════════════════════════════════════════

{
  "supplierName": "exact company name" or null,
  "supplierContact": "contact person" or null,
  "supplierEmail": "email" or null,
  "supplierPhone": "phone/whatsapp number" or null,
  "supplierAddress": "full address" or null,
  "currency": "USD" or "EUR" or "CNY" etc. or null,
  "incoterm": "FOB Shanghai" or "CIF LA" etc. or null,
  "quoteDate": "YYYY-MM-DD" or null,
  "validUntil": "YYYY-MM-DD" or null,
  "paymentTerms": "exact terms" or null,
  "leadTime": "exact lead time" or null,
  "notes": "important notes" or null,
  "lineItems": [
    {
      "productName": "clean product name ONLY (NO specs/dimensions/weight)",
      "sku": "model/item number" or null,
      "material": "material type (e.g. cotton, aluminum, paper)" or null,
      "unitPrice": 1.23 (per PIECE only, no symbol) or null,
      "priceConfidence": "high" or "medium" or "low",
      "priceEstimated": true or false,
      "moq": 1000 (number only) or null,
      "moqConfidence": "high" or "medium" or "low",
      "quantity": 5000 or null,
      "dimensions": "225×175×42mm" (exact text) or null,
      "weight_g": 50 (grams, number only) or null,
      "packing_pcs_per_ctn": 600 (number only) or null,
      "carton_length_cm": 45.5 (cm, number only) or null,
      "carton_width_cm": 35.0 (cm, number only) or null,
      "carton_height_cm": 30.0 (cm, number only) or null,
      "cbm_per_carton": 0.077 (number only) or null
    }
  ]
}

PRIORITY: Extract ALL line items. Extract ALL logistics fields for landed cost.

Return ONLY the JSON object, nothing else.`
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`[ERROR ${requestId}] Anthropic API Error:`, {
        status: response.status,
        type: error.error?.type,
        message: error.error?.message,
      });

      return sendError(
        res,
        `Model '${MODEL}' failed: ${error.error?.message || 'Unknown error'}`,
        response.status,
        'ANTHROPIC_API_ERROR'
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return sendError(res, 'No response from Claude', 500, 'EMPTY_RESPONSE');
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return sendError(res, 'Could not parse extraction result from model output', 500, 'PARSE_ERROR');
    }

    const rawData = JSON.parse(jsonMatch[0]);

    // Apply sanitizer to enforce clean product names
    const sanitizedData = sanitizeExtractedData(rawData);

    // ============================================
    // MERGE REGEX-EXTRACTED SUPPLIER INFO
    // ============================================
    // Priority: Use regex results when confidence is high
    if (regexSupplierInfo) {
      console.log('[MERGE] Merging regex supplier info with LLM results...');

      // Helper to create field object
      const createField = (regexField, llmValue) => {
        if (regexField.confidence === 'high' && regexField.value) {
          return {
            value: regexField.value,
            status: 'extracted',
            confidence: 'high',
            source: regexField.source, // 'header', 'footer', or 'body'
          };
        }
        // Fall back to LLM result
        return llmValue || { value: null, status: 'not_found' };
      };

      // Merge each field
      if (!sanitizedData.supplierName || sanitizedData.supplierName.status === 'not_found') {
        sanitizedData.supplierName = createField(regexSupplierInfo.supplierName, sanitizedData.supplierName);
      }

      if (!sanitizedData.supplierEmail || sanitizedData.supplierEmail.status === 'not_found') {
        sanitizedData.supplierEmail = createField(regexSupplierInfo.supplierEmail, sanitizedData.supplierEmail);
      }

      if (!sanitizedData.supplierPhone || sanitizedData.supplierPhone.status === 'not_found') {
        sanitizedData.supplierPhone = createField(regexSupplierInfo.supplierPhone, sanitizedData.supplierPhone);
      }

      if (!sanitizedData.supplierAddress || sanitizedData.supplierAddress.status === 'not_found') {
        sanitizedData.supplierAddress = createField(regexSupplierInfo.supplierAddress, sanitizedData.supplierAddress);
      }

      console.log('[MERGE] After merge - supplierName:', sanitizedData.supplierName);
      console.log('[MERGE] After merge - supplierEmail:', sanitizedData.supplierEmail);
      console.log('[MERGE] After merge - supplierPhone:', sanitizedData.supplierPhone);
    }

    console.log(`✅ [EXTRACTION ${requestId}] Completed successfully`);

    // Return the extracted data with standardized success response
    return sendSuccess(res, sanitizedData);

  } catch (error) {
    // Catch ANY unhandled errors and return proper JSON
    return sendError(res, error, 500, 'EXTRACTION_FAILED');
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
