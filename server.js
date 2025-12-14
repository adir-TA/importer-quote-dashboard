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
        model: 'claude-3-5-sonnet-20241022',
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
                text: `You are a quote data extractor for importers. Extract supplier quote information from this image.

CRITICAL RULES - NEVER BREAK THESE:
1. ONLY extract data that is EXPLICITLY VISIBLE in the document
2. NEVER guess, infer, or invent ANY data
3. If a field is not clearly visible, use null
4. For tables with multiple rows, extract ALL rows as separate line items
5. Be extremely precise with numbers - no rounding, no estimates
6. Extract exact company names, SKUs, and values as written

Return ONLY valid JSON in this exact structure (no markdown, no explanation):
{
  "supplierName": "exact company name from document" or null,
  "supplierContact": "contact person name" or null,
  "supplierEmail": "email address" or null,
  "currency": "USD" or "EUR" or "CNY" etc. or null,
  "incoterm": "FOB Shanghai" or "CIF Los Angeles" etc. or null,
  "validUntil": "date quote expires" or null,
  "paymentTerms": "exact payment terms" or null,
  "leadTime": "exact lead time" or null,
  "notes": "any important notes/remarks" or null,
  "lineItems": [
    {
      "productName": "exact product name" or null,
      "sku": "model/item number" or null,
      "unitPrice": 1.23 (number only, no currency symbol) or null,
      "moq": 1000 (number only) or null,
      "quantity": 5000 (number from quote) or null,
      "dimensions": "exact dimensions text" or null,
      "weight": "exact weight" or null,
      "packing": "packing description" or null,
      "cartonSize": "carton dimensions" or null,
      "cbm": 0.123 (number only) or null
    }
  ]
}

If the document has a table with multiple rows, create a separate line item for EACH row.
Extract ALL columns from the table.
Use exact values - don't convert units or round numbers.
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
