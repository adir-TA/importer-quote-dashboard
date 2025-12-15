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

A. ALWAYS distinguish "per piece" vs "per carton":
   - If doc says "USD 0.05 / PC" → unitPrice = 0.05
   - If doc says "USD 5.00 / CTN" → unitPrice = null (not per piece)
   - If doc shows BOTH → extract the per-piece price ONLY

B. NEVER multiply or divide prices unless document explicitly shows calculation

C. Use table ROW ALIGNMENT over visual proximity:
   - Match price to SKU by same table row, NOT by proximity
   - Trust column headers (Price/PC, Price/CTN, etc.)

D. Mark ambiguous prices:
   - If unit unclear → set "priceConfidence": "low" and "priceEstimated": true
   - If document shows conflicting prices → use the per-piece one

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
CONFIDENCE SCORING:
═══════════════════════════════════════════════════════════════

For unitPrice and moq, add confidence scores:

"high" = clearly labeled in document (e.g., column header "Price/PC: 0.05")
"medium" = inferable from context but not explicitly labeled
"low" = ambiguous, unclear, or conflicting information

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
