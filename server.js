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
  console.log('🔥 [EXTRACTION v2025-12-15-v4] Server code is ACTIVE - Using Claude 3.5 Sonnet');

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
        model: 'claude-3-5-sonnet-20240620',
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
                text: `CRITICAL: You are extracting supplier quotes. WRONG PRICES = BUSINESS FAILURE.

═══════════════════════════════════════════════════════════════
EXAMPLE OF CORRECT VS WRONG EXTRACTION:
═══════════════════════════════════════════════════════════════

TYPICAL QUOTE TABLE:
| Item No | Unit Price | Meas/CBM |
| LS-323  | USD0.0389/PC | 0.077   |
| LS-399  | USD0.0933/PC | 0.104   |

✓ CORRECT: unitPrice = 0.0389 (from "Unit Price" column)
✗ WRONG: unitPrice = 0.077 (this is CBM, NOT price!)

RULE: Extract price from the column labeled "Price" or "Unit Price" or "/PC"
NEVER extract from "CBM" or "Meas" columns (those are volume measurements)

═══════════════════════════════════════════════════════════════
EXTRACTION ALGORITHM:
═══════════════════════════════════════════════════════════════

FOR EACH ROW:

1. Find the column with header containing: "Unit Price", "Price", "USD/PC", "/PC"
2. Extract the numeric value from THAT column ONLY
3. Ignore all other numeric columns (especially CBM/Meas/Volume)

NEVER extract from columns with these headers:
- "CBM"
- "Meas"
- "Measurement"
- "Volume"
- "M³"
- "Carton Size"

These columns contain measurements, NOT prices.

IF you extract a value < 0.5:
→ STOP and verify it came from a "Price" column, not a "CBM" column
→ If from CBM column, set unitPrice = null instead

═══════════════════════════════════════════════════════════════
CRITICAL RULES:
═══════════════════════════════════════════════════════════════

1. ONLY extract data that is EXPLICITLY VISIBLE
2. NEVER guess or calculate
3. Extract ALL table rows as separate line items
4. NO rounding, NO unit conversions
5. Column header determines field type (header is law)

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
