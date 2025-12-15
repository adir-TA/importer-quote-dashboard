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
  try {
    const { image, mediaType, apiKey } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image data required' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic API key required' });
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
        model: 'claude-3-haiku-20240307',
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
                text: `You are a PRODUCTION quote extractor for real importers. Correctness matters MORE than completeness.

═══════════════════════════════════════════════════════════════
CRITICAL RULES - NEVER BREAK THESE:
═══════════════════════════════════════════════════════════════

1. ONLY extract data that is EXPLICITLY VISIBLE
2. NEVER guess, calculate, or infer ANY data
3. If unclear → use null and set confidence to "low"
4. Extract ALL table rows as separate line items
5. NO rounding, NO unit conversions, NO calculations

═══════════════════════════════════════════════════════════════
PRICE EXTRACTION RULES (MOST CRITICAL):
═══════════════════════════════════════════════════════════════

DECISION TREE FOR PRICE EXTRACTION:

STEP 1: IDENTIFY PRICE COLUMNS (HIGHEST PRIORITY)

   Look for columns with headers containing ANY of these keywords:
   ✓ "Unit Price"
   ✓ "Price"
   ✓ "USD" (when paired with /PC or /piece)
   ✓ "/ PC" or "/PC"
   ✓ "Price/PC"
   ✓ "Unit Cost"
   ✓ "Cost"

   If ANY of these columns exist → Extract unitPrice ONLY from those columns.
   Ignore all other numeric columns.

STEP 2: HARD EXCLUSIONS (NEVER EXTRACT FROM THESE)

   NEVER extract unitPrice from columns containing:
   ✗ "CBM"
   ✗ "Meas" or "Measurement"
   ✗ "Volume"
   ✗ "Carton Size"
   ✗ "Cube"
   ✗ "M³" or "m3"
   ✗ "Dimension"

   Even if no price column exists, NEVER use these columns for unitPrice.
   These columns contain CBM/measurement data, not prices.

STEP 3: FALLBACK LOGIC (ONLY IF NO PRICE COLUMN EXISTS)

   If NO price column found in Step 1:
   → Look for numeric values that make sense as per-piece prices
   → Typical per-piece price range: $0.50 - $500
   → Extract those values as unitPrice
   → Set "priceConfidence": "medium" (not from labeled column)

   BUT: Still exclude Step 2 columns (CBM/Meas/Volume)

STEP 4: SANITY VALIDATION

   After extraction, validate:

   IF unitPrice < $0.60 AND a CBM/Meas column exists:
   → Set "priceConfidence": "low"
   → Set "priceEstimated": true
   → This triggers a warning for user to verify

STEP 5: PER-PIECE vs PER-CARTON

   - If doc says "USD 0.05 / PC" → unitPrice = 0.05
   - If doc says "USD 5.00 / CTN" → unitPrice = null (not per piece)
   - If BOTH exist → extract per-piece price ONLY

CRITICAL RULES:
- NEVER multiply or divide prices
- Use table ROW ALIGNMENT (match price to SKU by same row)
- Column header determines field type (header is law)
- If header says "CBM" or "Meas", that column is CBM data, period.

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
JSON STRUCTURE (return ONLY this, no markdown):
═══════════════════════════════════════════════════════════════

{
  "supplierName": "exact company name" or null,
  "supplierContact": "contact person" or null,
  "supplierEmail": "email" or null,
  "currency": "USD" or "EUR" or "CNY" etc. or null,
  "incoterm": "FOB Shanghai" or "CIF LA" etc. or null,
  "validUntil": "date" or null,
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
      "dimensions": "exact text" or null,
      "packing": "packing desc" or null
    }
  ]
}

PRIORITY ORDER: SKU → unitPrice → currency → incoterm → MOQ
Skip: weight, cartonSize, cbm (not MVP critical)

Return ONLY the JSON object, nothing else.`
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[API Error]', error);
      return res.status(response.status).json({
        error: error.error?.message || 'Claude API request failed'
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
