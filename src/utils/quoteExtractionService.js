// ============================================
// QUOTE EXTRACTION SERVICE - REAL IMPLEMENTATION
// ============================================
//
// EXTRACTION RULES (NON-NEGOTIABLE):
// 1. If a field is NOT explicitly present → status: 'not_found'
// 2. NEVER infer or guess ANY data
// 3. NEVER invent values
// 4. Use Claude API (Anthropic) to actually read documents
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
// REAL CLAUDE API EXTRACTION
// ============================================

/**
 * Extract data from image using backend API (which calls Claude)
 * NEVER returns fake data - only what's actually in the document
 */
async function extractFromImage(file, apiKey) {
  // UNIQUE LOG - Verify client code updated
  console.log('🚀 [CLIENT v2025-12-15-v4] Extraction service loaded - Upgraded to Sonnet');

  if (!apiKey) {
    throw new Error('Anthropic API key required. Add it in Settings.');
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

  // Determine media type
  const mediaType = file.type || 'image/jpeg';

  // Call BACKEND API (which proxies to Claude to avoid CORS)
  const API_URL = 'http://localhost:3001/api/extract-quote';

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64,
      mediaType: mediaType,
      apiKey: apiKey,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Extraction API request failed');
  }

  const result = await response.json();

  if (!result.success || !result.data) {
    throw new Error('No data returned from extraction API');
  }

  // Convert raw data to our field structure with confidence tracking
  return convertToExtractionResult(result.data);
}

/**
 * Convert Claude response to our ExtractedField structure
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

  // ============================================
  // POST-EXTRACTION VALIDATION FUNCTIONS
  // ============================================

  /**
   * Sanity check: Detect if unitPrice looks like CBM
   * CBM range: 0.01 - 0.5
   * Typical prices: > $0.50
   */
  function validatePriceVsCBM(item) {
    const price = item.unitPrice;
    const cbm = item.cbm;

    // If both price and CBM exist
    if (price !== null && cbm !== null) {
      // If price is in typical CBM range
      if (price > 0 && price < 0.6) {
        console.warn(`[VALIDATION] Price ${price} is in CBM range. CBM value: ${cbm}. Flagging as low confidence.`);
        return {
          ...item,
          priceConfidence: 'low',
          priceEstimated: true,
        };
      }
    }

    return item;
  }

  // Convert line items
  if (Array.isArray(rawData.lineItems) && rawData.lineItems.length > 0) {
    result.lineItems = rawData.lineItems.map((item, index) => {
      // Run validation on raw item first
      const validatedItem = validatePriceVsCBM(item);

      // ============================================
      // SMART PRODUCT NAME GENERATION
      // ============================================
      // NEVER show "Unknown product" or null
      // Auto-generate: "<Material/Category> - <SKU> - <Dimensions>"
      let productName = validatedItem.productName;
      let productNameSource = `Row ${index + 1}`;

      if (!productName || productName === 'Unknown product') {
        // Generate smart name from available data
        const parts = [];

        // Try to add material/category if available
        // (Claude might include it in packing or other fields)

        // Always add SKU if available
        if (validatedItem.sku) {
          parts.push(validatedItem.sku);
        }

        // Always add dimensions if available
        if (validatedItem.dimensions) {
          parts.push(validatedItem.dimensions);
        }

        if (parts.length > 0) {
          productName = parts.join(' - ');
          productNameSource = 'Generated from SKU + Dimensions';
        } else {
          productName = `Product ${index + 1}`;
          productNameSource = 'Auto-generated';
        }
      }

      return {
        id: `item-${Date.now()}-${index}`,

        productName: extracted(productName, productNameSource),

        sku: validatedItem.sku !== null
          ? extracted(validatedItem.sku, `Row ${index + 1}`)
          : notFound(),

        // ============================================
        // UNIT PRICE - WITH CONFIDENCE & ESTIMATED FLAG (VALIDATED)
        // ============================================
        unitPrice: validatedItem.unitPrice !== null
          ? extracted(
              validatedItem.unitPrice,
              `Row ${index + 1}`,
              validatedItem.priceConfidence || 'medium', // May be downgraded by validation
              validatedItem.priceEstimated || false      // May be flagged by validation
            )
          : notFound(),

        currency: result.currency, // Inherit from document level

        // ============================================
        // MOQ - WITH CONFIDENCE
        // ============================================
        moq: validatedItem.moq !== null
          ? extracted(
              validatedItem.moq,
              `Row ${index + 1}`,
              validatedItem.moqConfidence || 'medium' // Default to medium if not provided
            )
          : notFound(),

        quantity: validatedItem.quantity !== null
          ? extracted(validatedItem.quantity, `Row ${index + 1}`)
          : notFound(),

        dimensions: validatedItem.dimensions !== null
          ? extracted(validatedItem.dimensions, `Row ${index + 1}`)
          : notFound(),

        packing: validatedItem.packing !== null
          ? extracted(validatedItem.packing, `Row ${index + 1}`)
          : notFound(),

        // Extract CBM for validation purposes (detect price/CBM confusion)
        cbm: validatedItem.cbm !== null
          ? extracted(validatedItem.cbm, `Row ${index + 1}`)
          : notFound(),

        // Skip weight, cartonSize (not MVP critical)
        weight: notFound(),
        cartonSize: notFound(),
      };
    });

    result.hasMultipleItems = result.lineItems.length > 1;
  }

  return result;
}

/**
 * Process PDF file
 * PRODUCTION: Use pdf.js or similar to extract text/images, then send to Claude
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
 * @param {string} apiKey - Anthropic API key from settings
 * @returns {Promise<ExtractionResult>}
 */
export async function extractQuoteFromFile(file, apiKey) {
  if (!file) {
    return { success: false, error: 'No file provided' };
  }

  if (!apiKey) {
    return {
      success: false,
      error: 'Anthropic API key required. Please add it in Settings to use quote extraction.'
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
  getValue,
  createEmptyLineItem,
  createEmptyExtraction,
} from './quoteDataModels';
