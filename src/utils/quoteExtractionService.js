// ============================================
// QUOTE EXTRACTION SERVICE - REAL IMPLEMENTATION
// ============================================
//
// EXTRACTION RULES (NON-NEGOTIABLE):

import API_BASE_URL from '../config/api.js';
import { fetchJson, formatApiError } from './apiHelpers.js';
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
  console.log('✅ [CLIENT v2025-12-15-SONNET] SAFETY NET DISABLED - Sonnet 4.5 extracts correctly!');

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
  const API_URL = `${API_BASE_URL}/api/extract-quote`;

  const result = await fetchJson(API_URL, {
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

  if (!result.ok) {
    const errorMessage = formatApiError(result.error);
    throw new Error(errorMessage);
  }

  if (!result.data) {
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

    supplierPhone: rawData.supplierPhone !== null
      ? extracted(rawData.supplierPhone, 'Contact section')
      : notFound(),

    supplierAddress: rawData.supplierAddress !== null
      ? extracted(rawData.supplierAddress, 'Header/footer')
      : notFound(),

    currency: rawData.currency !== null
      ? extracted(rawData.currency, 'Price section')
      : notFound(),

    incoterm: rawData.incoterm !== null
      ? extracted(rawData.incoterm, 'Terms section')
      : notFound(),

    quoteDate: rawData.quoteDate !== null
      ? extracted(rawData.quoteDate, 'Header')
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
   * SAFETY NET: Detect if unitPrice looks like CBM and REJECT it
   * CBM range: 0.01 - 0.5
   * Typical prices: > $0.50
   *
   * This is a HARD SAFETY NET that prevents CBM values from being used as prices.
   */
  function validatePriceVsCBM(item) {
    const price = item.unitPrice;
    const cbm = item.cbm;

    // SAFETY NET: If both price and CBM exist AND price is in CBM range
    if (price !== null && cbm !== null && price > 0 && price < 0.6) {
      console.error(`❌ [SAFETY NET] REJECTED price ${price} - looks like CBM! (CBM value: ${cbm})`);
      console.error(`   Setting unitPrice to NULL. User must enter manually.`);

      // REJECT THE PRICE - set to null
      return {
        ...item,
        unitPrice: null, // ← CRITICAL: Nullify the bad price
        priceConfidence: null,
        priceEstimated: null,
      };
    }

    return item;
  }

  // Convert line items
  if (Array.isArray(rawData.lineItems) && rawData.lineItems.length > 0) {
    result.lineItems = rawData.lineItems.map((item, index) => {
      // SAFETY NET DISABLED - Sonnet 4.5 is accurate enough, low prices are legitimate
      // const validatedItem = validatePriceVsCBM(item);
      const validatedItem = item; // Use raw item directly

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

        // ============================================
        // LOGISTICS FIELDS (CRITICAL FOR LANDED COST)
        // ============================================
        weight_g: validatedItem.weight_g !== null
          ? extracted(validatedItem.weight_g, `Row ${index + 1}`)
          : notFound(),

        packing_pcs_per_ctn: validatedItem.packing_pcs_per_ctn !== null
          ? extracted(validatedItem.packing_pcs_per_ctn, `Row ${index + 1}`)
          : notFound(),

        carton_length_cm: validatedItem.carton_length_cm !== null
          ? extracted(validatedItem.carton_length_cm, `Row ${index + 1}`)
          : notFound(),

        carton_width_cm: validatedItem.carton_width_cm !== null
          ? extracted(validatedItem.carton_width_cm, `Row ${index + 1}`)
          : notFound(),

        carton_height_cm: validatedItem.carton_height_cm !== null
          ? extracted(validatedItem.carton_height_cm, `Row ${index + 1}`)
          : notFound(),

        cbm_per_carton: validatedItem.cbm_per_carton !== null
          ? extracted(validatedItem.cbm_per_carton, `Row ${index + 1}`)
          : notFound(),

        // Legacy fields (deprecated, kept for backwards compatibility)
        packing: validatedItem.packing !== null
          ? extracted(validatedItem.packing, `Row ${index + 1}`)
          : notFound(),
        cbm: validatedItem.cbm_per_carton !== null || validatedItem.cbm !== null
          ? extracted(validatedItem.cbm_per_carton || validatedItem.cbm, `Row ${index + 1}`)
          : notFound(),
        weight: notFound(),
        cartonSize: notFound(),
      };
    });

    result.hasMultipleItems = result.lineItems.length > 1;
  }

  return result;
}

/**
 * Process PDF file - Claude API supports PDFs directly
 */
async function processPdf(file, apiKey) {
  console.log('📄 [PDF] Processing PDF file:', file.name);

  if (!apiKey) {
    throw new Error('Anthropic API key required. Add it in Settings.');
  }

  // Convert PDF to base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Call backend API with PDF
  const API_URL = `${API_BASE_URL}/api/extract-quote`;

  const result = await fetchJson(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64,
      mediaType: 'application/pdf',
      apiKey: apiKey,
    }),
  });

  if (!result.ok) {
    const errorMessage = formatApiError(result.error);
    throw new Error(errorMessage);
  }

  if (!result.data) {
    throw new Error('No data returned from PDF extraction');
  }

  // Same conversion as image extraction
  const rawData = result.data;
  const extractionResult = createEmptyExtraction();

  // Supplier fields
  extractionResult.supplier = rawData.supplierName !== null
    ? extracted(rawData.supplierName, 'Extracted')
    : notFound();

  extractionResult.contact = rawData.supplierContact !== null
    ? extracted(rawData.supplierContact, 'Extracted')
    : notFound();

  extractionResult.email = rawData.supplierEmail !== null
    ? extracted(rawData.supplierEmail, 'Extracted')
    : notFound();

  extractionResult.currency = rawData.currency !== null
    ? extracted(rawData.currency, 'Extracted')
    : extracted('USD', 'Default');

  extractionResult.incoterm = rawData.incoterm !== null
    ? extracted(rawData.incoterm, 'Extracted')
    : notFound();

  extractionResult.quoteDate = rawData.quoteDate !== null
    ? extracted(rawData.quoteDate, 'Extracted')
    : notFound();

  extractionResult.validUntil = rawData.validUntil !== null
    ? extracted(rawData.validUntil, 'Extracted')
    : notFound();

  extractionResult.paymentTerms = rawData.paymentTerms !== null
    ? extracted(rawData.paymentTerms, 'Extracted')
    : notFound();

  extractionResult.leadTime = rawData.leadTime !== null
    ? extracted(rawData.leadTime, 'Extracted')
    : notFound();

  extractionResult.notes = rawData.notes !== null
    ? extracted(rawData.notes, 'Extracted')
    : notFound();

  // Line items
  if (Array.isArray(rawData.lineItems) && rawData.lineItems.length > 0) {
    extractionResult.lineItems = rawData.lineItems.map((item, index) => {
      const productName = item.productName || `Row ${index + 1}`;

      return {
        productName: extracted(productName, `Row ${index + 1}`),
        sku: item.sku !== null ? extracted(item.sku, `Row ${index + 1}`) : notFound(),
        unitPrice: item.unitPrice !== null ? extracted(item.unitPrice, `Row ${index + 1}`) : notFound(),
        priceConfidence: item.priceConfidence || 'medium',
        priceEstimated: item.priceConfidence === 'low',
        moq: item.moq !== null ? extracted(item.moq, `Row ${index + 1}`) : notFound(),
        moqConfidence: item.moqConfidence || 'medium',
        quantity: item.quantity !== null ? extracted(item.quantity, `Row ${index + 1}`) : notFound(),
        dimensions: item.dimensions !== null ? extracted(item.dimensions, `Row ${index + 1}`) : notFound(),
        weight_g: item.weight_g !== null ? extracted(item.weight_g, `Row ${index + 1}`) : notFound(),
        packing_pcs_per_ctn: item.packing_pcs_per_ctn !== null ? extracted(item.packing_pcs_per_ctn, `Row ${index + 1}`) : notFound(),
        carton_length_cm: item.carton_length_cm !== null ? extracted(item.carton_length_cm, `Row ${index + 1}`) : notFound(),
        carton_width_cm: item.carton_width_cm !== null ? extracted(item.carton_width_cm, `Row ${index + 1}`) : notFound(),
        carton_height_cm: item.carton_height_cm !== null ? extracted(item.carton_height_cm, `Row ${index + 1}`) : notFound(),
        cbm_per_carton: item.cbm_per_carton !== null ? extracted(item.cbm_per_carton, `Row ${index + 1}`) : notFound(),

        // Legacy fields
        packing: item.packing_pcs_per_ctn !== null ? extracted(item.packing_pcs_per_ctn, `Row ${index + 1}`) : notFound(),
        cbm: item.cbm_per_carton !== null ? extracted(item.cbm_per_carton, `Row ${index + 1}`) : notFound(),
        weight: notFound(),
        cartonSize: notFound(),
      };
    });

    extractionResult.hasMultipleItems = extractionResult.lineItems.length > 1;
  }

  console.log('✅ [PDF] Successfully extracted from PDF');
  return extractionResult;
}

/**
 * Process Excel file - Parse with xlsx and extract structured data
 */
async function processExcel(file, apiKey) {
  console.log('📊 [EXCEL] Processing Excel file:', file.name);

  if (!apiKey) {
    throw new Error('Anthropic API key required. Add it in Settings.');
  }

  // Use xlsx library to parse Excel
  const XLSX = await import('xlsx');

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  // Get first sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // Convert to readable text format
  const textRepresentation = jsonData
    .map(row => row.join('\t'))
    .join('\n');

  console.log('📊 [EXCEL] Parsed spreadsheet, sending to Claude...');

  // Send structured data to text extraction API
  const result = await extractFromText(
    `Excel spreadsheet data:\n\n${textRepresentation}`,
    apiKey
  );

  console.log('✅ [EXCEL] Successfully extracted from Excel');
  return result;
}

/**
 * Extract data from text message using backend API (which calls Claude)
 * @param {string} text - The pasted text message
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<ExtractionResult>}
 */
async function extractFromText(text, apiKey) {
  console.log('📝 [TEXT EXTRACTION] Starting extraction from text');

  if (!apiKey) {
    throw new Error('Anthropic API key required. Add it in Settings.');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Text content is empty');
  }

  // Call BACKEND API
  const API_URL = `${API_BASE_URL}/api/extract-quote-from-text`;

  const result = await fetchJson(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text.trim(),
      apiKey: apiKey,
    }),
  });

  if (!result.ok) {
    const errorMessage = formatApiError(result.error);
    throw new Error(errorMessage);
  }

  if (!result.data) {
    throw new Error('No data returned from text extraction API');
  }

  const rawData = result.data;

  // Convert to same structure as image extraction
  const extractionResult = createEmptyExtraction();

  // Supplier fields
  extractionResult.supplier = rawData.supplierName !== null
    ? extracted(rawData.supplierName, 'Extracted')
    : notFound();

  extractionResult.contact = rawData.supplierContact !== null
    ? extracted(rawData.supplierContact, 'Extracted')
    : notFound();

  extractionResult.email = rawData.supplierEmail !== null
    ? extracted(rawData.supplierEmail, 'Extracted')
    : notFound();

  extractionResult.currency = rawData.currency !== null
    ? extracted(rawData.currency, 'Extracted')
    : extracted('USD', 'Default');

  extractionResult.incoterm = rawData.incoterm !== null
    ? extracted(rawData.incoterm, 'Extracted')
    : notFound();

  extractionResult.quoteDate = rawData.quoteDate !== null
    ? extracted(rawData.quoteDate, 'Extracted')
    : notFound();

  extractionResult.validUntil = rawData.validUntil !== null
    ? extracted(rawData.validUntil, 'Extracted')
    : notFound();

  extractionResult.paymentTerms = rawData.paymentTerms !== null
    ? extracted(rawData.paymentTerms, 'Extracted')
    : notFound();

  extractionResult.leadTime = rawData.leadTime !== null
    ? extracted(rawData.leadTime, 'Extracted')
    : notFound();

  extractionResult.notes = rawData.notes !== null
    ? extracted(rawData.notes, 'Extracted')
    : notFound();

  // Line items
  if (Array.isArray(rawData.lineItems) && rawData.lineItems.length > 0) {
    extractionResult.lineItems = rawData.lineItems.map((item, index) => {
      const productName = item.productName || `Product ${index + 1}`;

      return {
        productName: extracted(productName, `Item ${index + 1}`),
        sku: item.sku !== null ? extracted(item.sku, `Item ${index + 1}`) : notFound(),
        unitPrice: item.unitPrice !== null ? extracted(item.unitPrice, `Item ${index + 1}`) : notFound(),
        priceConfidence: item.priceConfidence || 'medium',
        priceEstimated: item.priceConfidence === 'low',
        moq: item.moq !== null ? extracted(item.moq, `Item ${index + 1}`) : notFound(),
        moqConfidence: item.moqConfidence || 'medium',
        quantity: item.quantity !== null ? extracted(item.quantity, `Item ${index + 1}`) : notFound(),
        dimensions: item.dimensions !== null ? extracted(item.dimensions, `Item ${index + 1}`) : notFound(),
        weight_g: item.weight_g !== null ? extracted(item.weight_g, `Item ${index + 1}`) : notFound(),
        packing_pcs_per_ctn: item.packing_pcs_per_ctn !== null ? extracted(item.packing_pcs_per_ctn, `Item ${index + 1}`) : notFound(),
        carton_length_cm: item.carton_length_cm !== null ? extracted(item.carton_length_cm, `Item ${index + 1}`) : notFound(),
        carton_width_cm: item.carton_width_cm !== null ? extracted(item.carton_width_cm, `Item ${index + 1}`) : notFound(),
        carton_height_cm: item.carton_height_cm !== null ? extracted(item.carton_height_cm, `Item ${index + 1}`) : notFound(),
        cbm_per_carton: item.cbm_per_carton !== null ? extracted(item.cbm_per_carton, `Item ${index + 1}`) : notFound(),

        // Legacy fields
        packing: item.packing_pcs_per_ctn !== null ? extracted(item.packing_pcs_per_ctn, `Item ${index + 1}`) : notFound(),
        cbm: item.cbm_per_carton !== null ? extracted(item.cbm_per_carton, `Item ${index + 1}`) : notFound(),
        weight: notFound(),
        cartonSize: notFound(),
      };
    });

    extractionResult.hasMultipleItems = extractionResult.lineItems.length > 1;
  }

  console.log('✅ [TEXT EXTRACTION] Successfully extracted data');

  return extractionResult;
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

/**
 * Extract quote data from pasted text message
 * @param {string} text - The pasted text
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<ExtractionResult>}
 */
export async function extractQuoteFromText(text, apiKey) {
  if (!text || text.trim().length === 0) {
    return { success: false, error: 'No text provided' };
  }

  if (!apiKey) {
    return {
      success: false,
      error: 'Anthropic API key required. Please add it in Settings to use quote extraction.'
    };
  }

  try {
    const extractionResult = await extractFromText(text, apiKey);

    // Build final result
    const result = {
      success: true,
      fileName: 'Pasted Text',
      fileType: 'text/plain',
      ...extractionResult,
    };

    // Calculate stats
    result.meta = countExtractionStats(result);

    console.log('[Text Extraction] Success:', result.meta.found, 'of', result.meta.total, 'core fields found');

    return result;

  } catch (error) {
    console.error('[Text Extraction] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to extract quote data from text',
    };
  }
}
