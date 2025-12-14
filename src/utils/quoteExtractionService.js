// ============================================
// QUOTE EXTRACTION SERVICE - REAL IMPLEMENTATION
// ============================================
//
// EXTRACTION RULES (NON-NEGOTIABLE):
// 1. If a field is NOT explicitly present → status: 'not_found'
// 2. NEVER infer or guess ANY data
// 3. NEVER invent values
// 4. Use OpenAI Vision API to actually read documents
//
// ============================================

import {
  extracted,
  notFound,
  createEmptyLineItem,
  createEmptyExtraction,
  wasFound,
  countExtractionStats,
} from './quoteDataModels';

// ============================================
// REAL OpenAI Vision API EXTRACTION
// ============================================

/**
 * Extract data from image using OpenAI Vision API
 * NEVER returns fake data - only what's actually in the document
 */
async function extractFromImage(file, apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key required. Add it in Settings.');
  }

  // Convert image to base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Call OpenAI Vision API with STRICT extraction rules
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a quote data extractor for importers. Your job is to extract supplier quote information from images.

CRITICAL RULES - NEVER BREAK THESE:
1. ONLY extract data that is EXPLICITLY VISIBLE in the document
2. NEVER guess, infer, or invent ANY data
3. If a field is not clearly visible, mark it as null
4. For tables with multiple rows, extract ALL rows as separate line items
5. Be extremely precise with numbers - no rounding, no estimates

Return ONLY valid JSON in this exact structure:
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
Use exact values - don't convert units or round numbers.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all quote data from this document. Return ONLY the JSON, no explanation.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0, // Zero temperature = most deterministic
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API request failed');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No response from OpenAI');
  }

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse extraction result');
  }

  const rawData = JSON.parse(jsonMatch[0]);

  // Convert raw data to our field structure with confidence tracking
  return convertToExtractionResult(rawData);
}

/**
 * Convert OpenAI response to our ExtractedField structure
 * Marks each field as 'extracted' or 'not_found' based on whether it was found
 */
function convertToExtractionResult(rawData) {
  const result = {
    supplierName: rawData.supplierName !== null
      ? extracted(rawData.supplierName, 'Document header')
      : notFound(),

    supplierContact: rawData.supplierContact !== null
      ? extracted(rawData.supplierContact, 'Contact section')
      : notFound(),

    supplierEmail: rawData.supplierEmail !== null
      ? extracted(rawData.supplierEmail, 'Contact section')
      : notFound(),

    currency: rawData.currency !== null
      ? extracted(rawData.currency, 'Price section')
      : notFound(),

    incoterm: rawData.incoterm !== null
      ? extracted(rawData.incoterm, 'Terms section')
      : notFound(),

    validUntil: rawData.validUntil !== null
      ? extracted(rawData.validUntil, 'Header')
      : notFound(),

    paymentTerms: rawData.paymentTerms !== null
      ? extracted(rawData.paymentTerms, 'Terms section')
      : notFound(),

    leadTime: rawData.leadTime !== null
      ? extracted(rawData.leadTime, 'Terms section')
      : notFound(),

    notes: rawData.notes !== null
      ? extracted(rawData.notes, 'Remarks/Notes')
      : notFound(),

    lineItems: [],
    hasMultipleItems: false,
  };

  // Convert line items
  if (Array.isArray(rawData.lineItems) && rawData.lineItems.length > 0) {
    result.lineItems = rawData.lineItems.map((item, index) => ({
      id: `item-${Date.now()}-${index}`,

      productName: item.productName !== null
        ? extracted(item.productName, `Row ${index + 1}`)
        : notFound(),

      sku: item.sku !== null
        ? extracted(item.sku, `Row ${index + 1}`)
        : notFound(),

      unitPrice: item.unitPrice !== null
        ? extracted(item.unitPrice, `Row ${index + 1}`)
        : notFound(),

      currency: result.currency, // Inherit from document level

      moq: item.moq !== null
        ? extracted(item.moq, `Row ${index + 1}`)
        : notFound(),

      quantity: item.quantity !== null
        ? extracted(item.quantity, `Row ${index + 1}`)
        : notFound(),

      dimensions: item.dimensions !== null
        ? extracted(item.dimensions, `Row ${index + 1}`)
        : notFound(),

      weight: item.weight !== null
        ? extracted(item.weight, `Row ${index + 1}`)
        : notFound(),

      packing: item.packing !== null
        ? extracted(item.packing, `Row ${index + 1}`)
        : notFound(),

      cartonSize: item.cartonSize !== null
        ? extracted(item.cartonSize, `Row ${index + 1}`)
        : notFound(),

      cbm: item.cbm !== null
        ? extracted(item.cbm, `Row ${index + 1}`)
        : notFound(),
    }));

    result.hasMultipleItems = result.lineItems.length > 1;
  }

  return result;
}

/**
 * Process PDF file
 * PRODUCTION: Use pdf.js or similar to extract text/images, then send to Vision API
 */
async function processPdf(file, apiKey) {
  // For now, PDFs need to be converted to images first
  // Most PDF libraries can render to canvas/image
  throw new Error('PDF support coming soon. Please convert to image or use screenshot (Ctrl+V)');
}

/**
 * Process Excel file
 * PRODUCTION: Use xlsx library to parse spreadsheet
 */
async function processExcel(file, apiKey) {
  // Excel parsing would use SheetJS (xlsx) library
  throw new Error('Excel support coming soon. Please convert to image or use screenshot (Ctrl+V)');
}

/**
 * Main extraction function
 * @param {File} file - The uploaded file
 * @param {string} apiKey - OpenAI API key from settings
 * @returns {Promise<ExtractionResult>}
 */
export async function extractQuoteFromFile(file, apiKey) {
  if (!file) {
    return { success: false, error: 'No file provided' };
  }

  if (!apiKey) {
    return {
      success: false,
      error: 'OpenAI API key required. Please add it in Settings to use quote extraction.'
    };
  }

  const fileName = file.name.toLowerCase();
  const fileType = file.type;

  try {
    let extractionResult;

    if (fileName.endsWith('.pdf') || fileType === 'application/pdf') {
      extractionResult = await processPdf(file, apiKey);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ||
               fileType.includes('spreadsheet') || fileType.includes('excel')) {
      extractionResult = await processExcel(file, apiKey);
    } else if (fileType.startsWith('image/') ||
               fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/)) {
      extractionResult = await extractFromImage(file, apiKey);
    } else {
      return {
        success: false,
        error: 'Unsupported file type. Please upload image files (PNG, JPG) or paste screenshots (Ctrl+V).',
      };
    }

    // Build final result
    const result = {
      success: true,
      fileName: file.name,
      fileType: fileType,
      ...extractionResult,
    };

    // Calculate stats
    result.meta = countExtractionStats(result);

    console.log('[Extraction] Success:', result.meta.found, 'of', result.meta.total, 'core fields found');

    return result;

  } catch (error) {
    console.error('[Extraction] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to extract quote data from file',
    };
  }
}

// ============================================
// EXPORTS
// ============================================

export {
  extracted,
  notFound,
  wasFound,
  createEmptyLineItem,
  createEmptyExtraction,
} from './quoteDataModels';
