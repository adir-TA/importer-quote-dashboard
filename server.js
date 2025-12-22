// ============================================
// BACKEND SERVER FOR QUOTE EXTRACTION & DOCUMENT STORAGE
// ============================================
// This server proxies API calls to Anthropic and handles Supabase Storage uploads

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Supabase client with service role key (for backend only)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials. Add VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
  // UNIQUE LOG - Verify server code updated
  console.log('🚀🚀🚀 [EXTRACTION v2025-12-15-FIX929] SONNET 4.5 MODEL FIX 🚀🚀🚀');

  try {
    const { image, mediaType, apiKey } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image data required' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic API key required' });
    }

    const MODEL = 'claude-sonnet-4-5-20250929';
    console.log(`[API] Using model: ${MODEL} (UPGRADED TO SONNET 4.5!)`);

    // Determine content type based on media type
    const isPdf = mediaType === 'application/pdf';
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
                text: `You extract supplier quote data from ${isPdf ? 'PDF documents' : 'images'}. Follow these steps EXACTLY.

SUPPLIER INFO EXTRACTION (PRIORITY):
Before extracting line items, find supplier/factory information in the document header/footer:
- supplierName: Company name (look for "From:", letterhead, company seal)
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
      "productName": "auto-generated or extracted name (NEVER null)",
      "sku": "model/item number" or null,
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
      console.error('[API Error] Status:', response.status);
      console.error('[API Error] Full error:', JSON.stringify(error, null, 2));
      console.error('[API Error] Model attempted:', MODEL);
      console.error('[API Error] Error type:', error.error?.type);
      console.error('[API Error] Error message:', error.error?.message);

      // Return detailed error to help diagnose
      return res.status(response.status).json({
        error: `Model '${MODEL}' failed: ${error.error?.message || 'Unknown error'}. Check server logs for details.`
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

    // Return the extracted data
    res.json({ success: true, data: rawData });

  } catch (error) {
    console.error('[Extraction Error]', error);
    res.status(500).json({
      error: error.message || 'Failed to extract quote data'
    });
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
            content: `Extract supplier quote information from this message. Parse all pricing, quantities, and terms.

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
      "productName": "auto-generated name (NEVER null, use description from text)",
      "sku": "model/item number" or null,
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

    console.log('✅ [TEXT EXTRACTION] Successfully extracted quote from text');

    // Return the extracted data
    res.json({ success: true, data: rawData });

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
