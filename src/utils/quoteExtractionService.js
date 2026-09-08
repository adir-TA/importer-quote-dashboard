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

/**
 * True when the model actually returned a usable value for a field.
 *
 * The previous guard was `raw.field !== null`. When the model omitted a field
 * entirely the value was `undefined`, which passes that test - so missing
 * fields were recorded as "extracted" with a value of `undefined`, defeating
 * the whole not_found / confidence system.
 */
function hasValue(value) {
  if (value === null || value === undefined || value === '') return false;
  // The backend merges regex-derived supplier info as {value, confidence,
  // source} objects while the model returns plain strings for the same fields.
  if (typeof value === 'object' && 'value' in value) {
    return value.value !== null && value.value !== undefined && value.value !== '';
  }
  return true;
}

/**
 * Unwrap the {value, confidence, source} shape the backend uses for
 * regex-extracted supplier fields. Rendering one of those objects directly
 * crashes React with "Objects are not valid as a React child".
 */
function rawValue(value) {
  if (value && typeof value === 'object' && 'value' in value) return value.value;
  return value;
}

/**
 * Build an ExtractedField for a document-level supplier field, accepting
 * either shape the backend can return.
 */
function supplierField(raw, defaultSource) {
  if (!hasValue(raw)) return notFound();

  const wrapped = raw && typeof raw === 'object' && 'value' in raw;
  return extracted(
    rawValue(raw),
    wrapped && raw.source ? `${defaultSource} (${raw.source})` : defaultSource,
    wrapped ? raw.confidence || 'medium' : 'high'
  );
}

// ============================================
// REAL CLAUDE API EXTRACTION
// ============================================

/**
 * Extract data from image using backend API (which calls Claude)
 * NEVER returns fake data - only what's actually in the document
 */
async function extractFromImage(file) {
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

  console.log('[IMAGE] Calling extraction API...');

  const result = await fetchJson(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64,
      mediaType: mediaType,
    }),
  });

  console.log('[IMAGE] API response:', { ok: result.ok, hasData: !!result.data, hasError: !!result.error });

  if (!result.ok) {
    console.error('[IMAGE:ERROR] Extraction API failed. Full response details:');
    console.error('Error object:', result.error);
    console.error('Full result:', result);
    console.error('Error breakdown:', {
      httpStatus: result.error?.httpStatus,
      code: result.error?.code,
      message: result.error?.message,
      hasData: !!result.data,
    });
    const errorMessage = formatApiError(result.error, result.error?.httpStatus);
    throw new Error(errorMessage);
  }

  if (!result.data) {
    console.error('[IMAGE] No data in successful response');
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
    supplierName: supplierField(rawData.supplierName, 'Document header'),

    supplierContact: supplierField(rawData.supplierContact, 'Contact section'),

    supplierEmail: supplierField(rawData.supplierEmail, 'Contact section'),

    supplierPhone: supplierField(rawData.supplierPhone, 'Contact section'),

    supplierAddress: supplierField(rawData.supplierAddress, 'Header/footer'),

    currency: hasValue(rawData.currency)
      ? extracted(rawData.currency, 'Price section')
      : notFound(),

    incoterm: hasValue(rawData.incoterm)
      ? extracted(rawData.incoterm, 'Terms section')
      : notFound(),

    quoteDate: hasValue(rawData.quoteDate)
      ? extracted(rawData.quoteDate, 'Header')
      : notFound(),

    validUntil: hasValue(rawData.validUntil)
      ? extracted(rawData.validUntil, 'Header')
      : notFound(),

    paymentTerms: hasValue(rawData.paymentTerms)
      ? extracted(rawData.paymentTerms, 'Terms section')
      : notFound(),

    leadTime: hasValue(rawData.leadTime)
      ? extracted(rawData.leadTime, 'Terms section')
      : notFound(),

    notes: hasValue(rawData.notes)
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

        sku: hasValue(validatedItem.sku)
          ? extracted(validatedItem.sku, `Row ${index + 1}`)
          : notFound(),

        // ============================================
        // UNIT PRICE - WITH CONFIDENCE & ESTIMATED FLAG (VALIDATED)
        // ============================================
        unitPrice: hasValue(validatedItem.unitPrice)
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
        moq: hasValue(validatedItem.moq)
          ? extracted(
              validatedItem.moq,
              `Row ${index + 1}`,
              validatedItem.moqConfidence || 'medium' // Default to medium if not provided
            )
          : notFound(),

        quantity: hasValue(validatedItem.quantity)
          ? extracted(validatedItem.quantity, `Row ${index + 1}`)
          : notFound(),

        dimensions: hasValue(validatedItem.dimensions)
          ? extracted(validatedItem.dimensions, `Row ${index + 1}`)
          : notFound(),

        // ============================================
        // LOGISTICS FIELDS (CRITICAL FOR LANDED COST)
        // ============================================
        weight_g: hasValue(validatedItem.weight_g)
          ? extracted(validatedItem.weight_g, `Row ${index + 1}`)
          : notFound(),

        packing_pcs_per_ctn: hasValue(validatedItem.packing_pcs_per_ctn)
          ? extracted(validatedItem.packing_pcs_per_ctn, `Row ${index + 1}`)
          : notFound(),

        carton_length_cm: hasValue(validatedItem.carton_length_cm)
          ? extracted(validatedItem.carton_length_cm, `Row ${index + 1}`)
          : notFound(),

        carton_width_cm: hasValue(validatedItem.carton_width_cm)
          ? extracted(validatedItem.carton_width_cm, `Row ${index + 1}`)
          : notFound(),

        carton_height_cm: hasValue(validatedItem.carton_height_cm)
          ? extracted(validatedItem.carton_height_cm, `Row ${index + 1}`)
          : notFound(),

        cbm_per_carton: hasValue(validatedItem.cbm_per_carton)
          ? extracted(validatedItem.cbm_per_carton, `Row ${index + 1}`)
          : notFound(),

        // Legacy fields (deprecated, kept for backwards compatibility)
        packing: hasValue(validatedItem.packing)
          ? extracted(validatedItem.packing, `Row ${index + 1}`)
          : notFound(),
        cbm: hasValue(validatedItem.cbm_per_carton) || hasValue(validatedItem.cbm)
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
async function processPdf(file) {
  console.log('📄 [PDF] Processing PDF file:', file.name);

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

  console.log('[PDF] Calling extraction API...');

  const result = await fetchJson(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64,
      mediaType: 'application/pdf',
    }),
  });

  console.log('[PDF] API response:', { ok: result.ok, hasData: !!result.data, hasError: !!result.error });

  if (!result.ok) {
    console.error('[PDF:ERROR] Extraction API failed. Full response details:');
    console.error('Error object:', result.error);
    console.error('Full result:', result);
    console.error('Error breakdown:', {
      httpStatus: result.error?.httpStatus,
      code: result.error?.code,
      message: result.error?.message,
      hasData: !!result.data,
    });
    const errorMessage = formatApiError(result.error, result.error?.httpStatus);
    throw new Error(errorMessage);
  }

  if (!result.data) {
    console.error('[PDF] No data in successful response');
    throw new Error('No data returned from PDF extraction');
  }

  // Same conversion as image extraction
  const rawData = result.data;
  const extractionResult = createEmptyExtraction();

  // Supplier fields
  extractionResult.supplier = supplierField(rawData.supplierName, 'Extracted');

  extractionResult.contact = supplierField(rawData.supplierContact, 'Extracted');

  extractionResult.email = supplierField(rawData.supplierEmail, 'Extracted');

  extractionResult.currency = hasValue(rawData.currency)
    ? extracted(rawData.currency, 'Extracted')
    : extracted('USD', 'Default');

  extractionResult.incoterm = hasValue(rawData.incoterm)
    ? extracted(rawData.incoterm, 'Extracted')
    : notFound();

  extractionResult.quoteDate = hasValue(rawData.quoteDate)
    ? extracted(rawData.quoteDate, 'Extracted')
    : notFound();

  extractionResult.validUntil = hasValue(rawData.validUntil)
    ? extracted(rawData.validUntil, 'Extracted')
    : notFound();

  extractionResult.paymentTerms = hasValue(rawData.paymentTerms)
    ? extracted(rawData.paymentTerms, 'Extracted')
    : notFound();

  extractionResult.leadTime = hasValue(rawData.leadTime)
    ? extracted(rawData.leadTime, 'Extracted')
    : notFound();

  extractionResult.notes = hasValue(rawData.notes)
    ? extracted(rawData.notes, 'Extracted')
    : notFound();

  // Line items
  if (Array.isArray(rawData.lineItems) && rawData.lineItems.length > 0) {
    extractionResult.lineItems = rawData.lineItems.map((item, index) => {
      const productName = item.productName || `Row ${index + 1}`;

      return {
        productName: extracted(productName, `Row ${index + 1}`),
        sku: hasValue(item.sku) ? extracted(item.sku, `Row ${index + 1}`) : notFound(),
        unitPrice: hasValue(item.unitPrice) ? extracted(item.unitPrice, `Row ${index + 1}`) : notFound(),
        priceConfidence: item.priceConfidence || 'medium',
        priceEstimated: item.priceConfidence === 'low',
        moq: hasValue(item.moq) ? extracted(item.moq, `Row ${index + 1}`) : notFound(),
        moqConfidence: item.moqConfidence || 'medium',
        quantity: hasValue(item.quantity) ? extracted(item.quantity, `Row ${index + 1}`) : notFound(),
        dimensions: hasValue(item.dimensions) ? extracted(item.dimensions, `Row ${index + 1}`) : notFound(),
        weight_g: hasValue(item.weight_g) ? extracted(item.weight_g, `Row ${index + 1}`) : notFound(),
        packing_pcs_per_ctn: hasValue(item.packing_pcs_per_ctn) ? extracted(item.packing_pcs_per_ctn, `Row ${index + 1}`) : notFound(),
        carton_length_cm: hasValue(item.carton_length_cm) ? extracted(item.carton_length_cm, `Row ${index + 1}`) : notFound(),
        carton_width_cm: hasValue(item.carton_width_cm) ? extracted(item.carton_width_cm, `Row ${index + 1}`) : notFound(),
        carton_height_cm: hasValue(item.carton_height_cm) ? extracted(item.carton_height_cm, `Row ${index + 1}`) : notFound(),
        cbm_per_carton: hasValue(item.cbm_per_carton) ? extracted(item.cbm_per_carton, `Row ${index + 1}`) : notFound(),

        // Legacy fields
        packing: hasValue(item.packing_pcs_per_ctn) ? extracted(item.packing_pcs_per_ctn, `Row ${index + 1}`) : notFound(),
        cbm: hasValue(item.cbm_per_carton) ? extracted(item.cbm_per_carton, `Row ${index + 1}`) : notFound(),
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
 * Process a spreadsheet (.xlsx / .csv) and extract structured data
 */
async function processExcel(file) {
  console.log('📊 [EXCEL] Processing spreadsheet:', file.name);

  // exceljs rather than the `xlsx` package: xlsx@0.18.5 (the newest version
  // published to npm) carries unpatched prototype-pollution and ReDoS
  // advisories that are reachable exactly here, when parsing an untrusted
  // supplier file. exceljs is already a dependency for the export path.
  const { default: ExcelJS } = await import('exceljs');

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();

  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';

  if (isCsv) {
    // Outside the try below: extraction errors (session expired, no API key,
    // rate limited) must reach the user, not be rewritten as "could not read
    // that spreadsheet".
    const text = new TextDecoder().decode(arrayBuffer);
    return extractFromText(`CSV spreadsheet data:\n\n${text.slice(0, 100000)}`);
  }

  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch (error) {
    if (/\.xls$/i.test(file.name)) {
      throw new Error(
        'Legacy .xls files are not supported. Please re-save the quote as .xlsx or CSV and try again.'
      );
    }
    throw new Error(`Could not read that spreadsheet: ${error.message}`);
  }

  if (workbook.worksheets.length === 0) {
    throw new Error('That spreadsheet has no sheets to read');
  }

  // Read EVERY sheet. Only the first was parsed before, so quotes split across
  // tabs silently lost everything after sheet one.
  let totalRows = 0;
  const sheetTexts = [];

  workbook.eachSheet((worksheet) => {
    const rows = [];

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      // row.values is 1-indexed with a leading hole
      row.eachCell({ includeEmpty: true }, (cell) => {
        cells.push(formatCellValue(cell.value));
      });

      if (cells.some(v => v !== '')) {
        rows.push(cells.join('\t'));
        totalRows += 1;
      }
    });

    if (rows.length > 0) {
      sheetTexts.push(
        workbook.worksheets.length > 1
          ? `--- Sheet: ${worksheet.name} ---\n${rows.join('\n')}`
          : rows.join('\n')
      );
    }
  });

  if (sheetTexts.length === 0) {
    throw new Error('That spreadsheet appears to be empty');
  }

  console.log(`📊 [EXCEL] Parsed ${sheetTexts.length} sheet(s), ${totalRows} rows`);

  return extractFromText(`Excel spreadsheet data:\n\n${sheetTexts.join('\n\n')}`);
}

/** Flatten an exceljs cell value (which may be a rich-text or formula object). */
function formatCellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().split('T')[0];

  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
    if ('result' in value) return formatCellValue(value.result); // formula cell
    if ('text' in value) return String(value.text); // hyperlink cell
    return '';
  }

  return String(value);
}

/**
 * Extract data from text message using backend API (which calls Claude)
 * @param {string} text - The pasted text message
 * @returns {Promise<ExtractionResult>}
 */
async function extractFromText(text) {
  console.log('📝 [TEXT:STEP-1] Starting extraction from text, length:', text.length);

  if (!text || text.trim().length === 0) {
    console.error('[TEXT:ERROR] Empty text');
    throw new Error('Text content is empty');
  }

  // Call BACKEND API
  const API_URL = `${API_BASE_URL}/api/extract-quote-from-text`;

  console.log('[TEXT:STEP-2] Calling extraction API:', API_URL);

  const result = await fetchJson(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text.trim(),
    }),
  });

  console.log('[TEXT:STEP-3] API response received:', { ok: result.ok, hasData: !!result.data, hasError: !!result.error });

  if (!result.ok) {
    console.error('[TEXT:ERROR] Extraction API failed. Full response details:');
    console.error('Error object:', result.error);
    console.error('Full result:', result);
    console.error('Error breakdown:', {
      httpStatus: result.error?.httpStatus,
      code: result.error?.code,
      message: result.error?.message,
      hasData: !!result.data,
    });
    const errorMessage = formatApiError(result.error, result.error?.httpStatus);
    throw new Error(errorMessage);
  }

  if (!result.data) {
    console.error('[TEXT:ERROR] No data in successful response');
    throw new Error('No data returned from text extraction API');
  }

  console.log('[TEXT:STEP-4] Converting raw data to extraction result');
  const rawData = result.data;

  // Convert to same structure as image extraction
  const extractionResult = createEmptyExtraction();

  // Supplier fields
  extractionResult.supplier = supplierField(rawData.supplierName, 'Extracted');

  extractionResult.contact = supplierField(rawData.supplierContact, 'Extracted');

  extractionResult.email = supplierField(rawData.supplierEmail, 'Extracted');

  extractionResult.currency = hasValue(rawData.currency)
    ? extracted(rawData.currency, 'Extracted')
    : extracted('USD', 'Default');

  extractionResult.incoterm = hasValue(rawData.incoterm)
    ? extracted(rawData.incoterm, 'Extracted')
    : notFound();

  extractionResult.quoteDate = hasValue(rawData.quoteDate)
    ? extracted(rawData.quoteDate, 'Extracted')
    : notFound();

  extractionResult.validUntil = hasValue(rawData.validUntil)
    ? extracted(rawData.validUntil, 'Extracted')
    : notFound();

  extractionResult.paymentTerms = hasValue(rawData.paymentTerms)
    ? extracted(rawData.paymentTerms, 'Extracted')
    : notFound();

  extractionResult.leadTime = hasValue(rawData.leadTime)
    ? extracted(rawData.leadTime, 'Extracted')
    : notFound();

  extractionResult.notes = hasValue(rawData.notes)
    ? extracted(rawData.notes, 'Extracted')
    : notFound();

  // Line items
  if (Array.isArray(rawData.lineItems) && rawData.lineItems.length > 0) {
    extractionResult.lineItems = rawData.lineItems.map((item, index) => {
      const productName = item.productName || `Product ${index + 1}`;

      return {
        productName: extracted(productName, `Item ${index + 1}`),
        sku: hasValue(item.sku) ? extracted(item.sku, `Item ${index + 1}`) : notFound(),
        unitPrice: hasValue(item.unitPrice) ? extracted(item.unitPrice, `Item ${index + 1}`) : notFound(),
        priceConfidence: item.priceConfidence || 'medium',
        priceEstimated: item.priceConfidence === 'low',
        moq: hasValue(item.moq) ? extracted(item.moq, `Item ${index + 1}`) : notFound(),
        moqConfidence: item.moqConfidence || 'medium',
        quantity: hasValue(item.quantity) ? extracted(item.quantity, `Item ${index + 1}`) : notFound(),
        dimensions: hasValue(item.dimensions) ? extracted(item.dimensions, `Item ${index + 1}`) : notFound(),
        weight_g: hasValue(item.weight_g) ? extracted(item.weight_g, `Item ${index + 1}`) : notFound(),
        packing_pcs_per_ctn: hasValue(item.packing_pcs_per_ctn) ? extracted(item.packing_pcs_per_ctn, `Item ${index + 1}`) : notFound(),
        carton_length_cm: hasValue(item.carton_length_cm) ? extracted(item.carton_length_cm, `Item ${index + 1}`) : notFound(),
        carton_width_cm: hasValue(item.carton_width_cm) ? extracted(item.carton_width_cm, `Item ${index + 1}`) : notFound(),
        carton_height_cm: hasValue(item.carton_height_cm) ? extracted(item.carton_height_cm, `Item ${index + 1}`) : notFound(),
        cbm_per_carton: hasValue(item.cbm_per_carton) ? extracted(item.cbm_per_carton, `Item ${index + 1}`) : notFound(),

        // Legacy fields
        packing: hasValue(item.packing_pcs_per_ctn) ? extracted(item.packing_pcs_per_ctn, `Item ${index + 1}`) : notFound(),
        cbm: hasValue(item.cbm_per_carton) ? extracted(item.cbm_per_carton, `Item ${index + 1}`) : notFound(),
        weight: notFound(),
        cartonSize: notFound(),
      };
    });

    extractionResult.hasMultipleItems = extractionResult.lineItems.length > 1;
  }

  console.log('✅ [TEXT:STEP-5] Successfully extracted data, line items:', extractionResult.lineItems?.length || 0);

  return extractionResult;
}

/**
 * Main extraction function
 * @param {File} file - The uploaded file
 * @param {boolean} hasApiKey - Whether a key is configured (checked server-side too)
 * @returns {Promise<ExtractionResult>}
 */
export async function extractQuoteFromFile(file, hasApiKey = true) {
  if (!file) {
    return { success: false, error: 'No file provided' };
  }

  // Advisory only - the backend is the real gate and resolves the key itself.
  if (!hasApiKey) {
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
      extractionResult = await processPdf(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ||
               fileName.endsWith('.csv') ||
               fileType.includes('spreadsheet') || fileType.includes('excel') ||
               fileType === 'text/csv') {
      extractionResult = await processExcel(file);
    } else if (fileType.startsWith('image/') ||
               fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/)) {
      extractionResult = await extractFromImage(file);
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
 * @param {boolean} hasApiKey - Whether a key is configured (checked server-side too)
 * @returns {Promise<ExtractionResult>}
 */
export async function extractQuoteFromText(text, hasApiKey = true) {
  if (!text || text.trim().length === 0) {
    return { success: false, error: 'No text provided' };
  }

  if (!hasApiKey) {
    return {
      success: false,
      error: 'Anthropic API key required. Please add it in Settings to use quote extraction.'
    };
  }

  try {
    const extractionResult = await extractFromText(text);

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
