// ============================================
// BACKEND SERVER FOR QUOTE EXTRACTION
// ============================================
// This server proxies API calls to Anthropic to avoid CORS issues
// and keep the API key secure (server-side only)

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large image uploads

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'quote-extraction-api' });
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

    // Use Sonnet 4.5 (most accurate model available)
    const MODEL = 'claude-sonnet-4-5-20250929';
    console.log(`[API] Using model: ${MODEL} (UPGRADED TO SONNET 4.5!)`);

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
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: image,
                },
              },
              {
                type: 'text',
                text: `You extract supplier quote data from images. Follow these steps EXACTLY.

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

app.listen(PORT, () => {
  console.log(`✅ Quote extraction API running on http://localhost:${PORT}`);
});
