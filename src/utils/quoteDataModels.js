// ============================================
// QUOTE DATA MODELS
// ============================================
// 
// CORE PRINCIPLE:
// Manual quotes and uploaded quotes use the SAME data model.
// 
// - CoreQuote: Fields used for landed cost calculation (5 fields)
// - QuoteMetadata: Everything else extracted (stored, viewable, NOT for calc)
//
// This ensures:
// 1. Uploaded quotes don't force extra fields into core model
// 2. Landed cost calculations stay consistent
// 3. Rich data from files isn't lost
// ============================================

/**
 * Confidence levels - be honest about what we found
 * @typedef {'extracted' | 'not_found'} FieldStatus
 * @typedef {'high' | 'medium' | 'low'} ConfidenceLevel
 *
 * RULES:
 * - extracted: Field was clearly found in document
 * - not_found: Field was NOT found - DO NOT GUESS
 *
 * CONFIDENCE:
 * - high: Clearly labeled (e.g., column header "Price/PC")
 * - medium: Inferable from context but not labeled
 * - low: Ambiguous, unclear, or conflicting info
 */

/**
 * An extracted field with status and confidence
 * @template T
 * @typedef {Object} ExtractedField
 * @property {T | null} value - The value, or null if not found
 * @property {FieldStatus} status - Was it found or not?
 * @property {string} [source] - Where it came from (for debugging)
 * @property {ConfidenceLevel} [confidence] - How confident we are (for critical fields)
 * @property {boolean} [estimated] - True if value was calculated/inferred (for prices)
 */

/**
 * A single line item from a multi-SKU quote
 * @typedef {Object} ExtractedLineItem
 * @property {string} id - Unique ID
 * @property {ExtractedField<string>} productName
 * @property {ExtractedField<string>} sku
 * @property {ExtractedField<number>} unitPrice
 * @property {ExtractedField<string>} currency
 * @property {ExtractedField<number>} moq
 * @property {ExtractedField<number>} quantity
 * @property {ExtractedField<string>} dimensions
 *
 * Logistics fields (CRITICAL for landed cost)
 * @property {ExtractedField<number>} weight_g - Weight in grams
 * @property {ExtractedField<number>} packing_pcs_per_ctn - Pieces per carton
 * @property {ExtractedField<number>} carton_length_cm - Carton length in cm
 * @property {ExtractedField<number>} carton_width_cm - Carton width in cm
 * @property {ExtractedField<number>} carton_height_cm - Carton height in cm
 * @property {ExtractedField<number>} cbm_per_carton - CBM per carton
 *
 * Legacy fields (deprecated)
 * @property {ExtractedField<string>} weight
 * @property {ExtractedField<string>} packing
 * @property {ExtractedField<string>} cartonSize
 * @property {ExtractedField<number>} cbm
 */

/**
 * Full extraction result from a file
 * @typedef {Object} ExtractionResult
 * @property {boolean} success
 * @property {string} fileName
 * @property {string} fileType
 *
 * Document-level fields
 * @property {ExtractedField<string>} supplierName
 * @property {ExtractedField<string>} supplierContact
 * @property {ExtractedField<string>} supplierEmail
 * @property {ExtractedField<string>} supplierPhone
 * @property {ExtractedField<string>} supplierAddress
 * @property {ExtractedField<string>} currency
 * @property {ExtractedField<string>} incoterm
 * @property {ExtractedField<string>} quoteDate
 * @property {ExtractedField<string>} validUntil
 * @property {ExtractedField<string>} paymentTerms
 * @property {ExtractedField<string>} leadTime
 * @property {ExtractedField<string>} notes
 *
 * Line-level fields
 * @property {ExtractedLineItem[]} lineItems
 * @property {boolean} hasMultipleItems
 *
 * @property {Object} meta
 * @property {number} meta.fieldsFound
 * @property {number} meta.fieldsMissing
 */

/**
 * Core quote fields - ONLY these are used for landed cost
 * This matches the manual quote form exactly
 * @typedef {Object} CoreQuote
 * @property {string} supplierName - Required
 * @property {number} unitPrice - Required
 * @property {string} currency - Required, defaults to USD
 * @property {number} moq - Required for validation
 * @property {string} incoterm - Required for landed cost
 */

/**
 * Additional metadata stored with quote but NOT used in calculations
 * @typedef {Object} QuoteMetadata
 * @property {string} [sourceFile] - Original filename
 * @property {string} [productName] - Product name from extraction
 * @property {string} [sku] - SKU/model number
 * @property {string} [dimensions] - Product dimensions
 * @property {string} [weight] - Product weight
 * @property {string} [packing] - Packing details
 * @property {string} [cartonSize] - Carton dimensions
 * @property {number} [cbm] - Cubic meters
 * @property {string} [validUntil] - Quote validity
 * @property {string} [paymentTerms] - Payment terms
 * @property {string} [leadTime] - Lead time
 * @property {string} [supplierContact] - Contact name
 * @property {string} [supplierEmail] - Contact email
 * @property {string} [supplierPhone] - Contact phone
 * @property {string} [supplierAddress] - Supplier address
 * @property {string} [notes] - Additional notes
 */

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a field that was NOT found in the document
 * Use this instead of guessing or inventing values
 */
export function notFound() {
  return {
    value: null,
    status: 'not_found',
    source: null,
  };
}

/**
 * Create a field that WAS extracted
 * @template T
 * @param {T} value
 * @param {string} [source]
 * @param {ConfidenceLevel} [confidence]
 * @param {boolean} [estimated]
 * @returns {ExtractedField<T>}
 */
export function extracted(value, source = null, confidence = null, estimated = false) {
  const field = {
    value,
    status: 'extracted',
    source,
  };

  if (confidence) {
    field.confidence = confidence;
  }

  if (estimated) {
    field.estimated = true;
  }

  return field;
}

/**
 * Check if a field was found
 * @param {ExtractedField} field 
 * @returns {boolean}
 */
export function wasFound(field) {
  return field && field.status === 'extracted' && field.value !== null;
}

/**
 * Get value or null
 * @template T
 * @param {ExtractedField<T>} field 
 * @returns {T | null}
 */
export function getValue(field) {
  return wasFound(field) ? field.value : null;
}

/**
 * Create an empty line item
 * @returns {ExtractedLineItem}
 */
export function createEmptyLineItem() {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productName: notFound(),
    sku: notFound(),
    unitPrice: notFound(),
    currency: notFound(),
    moq: notFound(),
    quantity: notFound(),
    dimensions: notFound(),
    weight: notFound(),
    packing: notFound(),
    cartonSize: notFound(),
    cbm: notFound(),
  };
}

/**
 * Create empty extraction result
 * @param {string} fileName 
 * @param {string} fileType 
 * @returns {ExtractionResult}
 */
export function createEmptyExtraction(fileName, fileType) {
  return {
    success: true,
    fileName,
    fileType,
    supplierName: notFound(),
    supplierContact: notFound(),
    supplierEmail: notFound(),
    supplierPhone: notFound(),
    supplierAddress: notFound(),
    currency: notFound(),
    incoterm: notFound(),
    validUntil: notFound(),
    paymentTerms: notFound(),
    leadTime: notFound(),
    notes: notFound(),
    lineItems: [],
    hasMultipleItems: false,
    meta: {
      fieldsFound: 0,
      fieldsMissing: 0,
    },
  };
}

/**
 * Build CoreQuote from user-confirmed values
 * This is what gets saved and used for landed cost
 * 
 * @param {Object} confirmedValues - User-confirmed form values
 * @param {string} productId
 * @returns {CoreQuote}
 */
export function buildCoreQuote(confirmedValues, productId) {
  return {
    product_id: productId,
    supplierName: confirmedValues.supplierName,
    unitPrice: parseFloat(confirmedValues.unitPrice),
    currency: confirmedValues.currency || 'USD',
    moq: parseInt(confirmedValues.moq) || 0,
    incoterm: confirmedValues.incoterm || '',
  };
}

/**
 * Build QuoteMetadata from extraction + selected line item
 * This is stored alongside the quote but NOT used in calculations
 * 
 * @param {ExtractionResult} extraction 
 * @param {ExtractedLineItem} selectedItem 
 * @returns {QuoteMetadata}
 */
export function buildQuoteMetadata(extraction, selectedItem) {
  return {
    sourceFile: extraction.fileName,
    productName: getValue(selectedItem?.productName),
    sku: getValue(selectedItem?.sku),
    dimensions: getValue(selectedItem?.dimensions),
    weight: getValue(selectedItem?.weight),
    packing: getValue(selectedItem?.packing),
    cartonSize: getValue(selectedItem?.cartonSize),
    cbm: getValue(selectedItem?.cbm),
    validUntil: getValue(extraction.validUntil),
    paymentTerms: getValue(extraction.paymentTerms),
    leadTime: getValue(extraction.leadTime),
    supplierContact: getValue(extraction.supplierContact),
    supplierEmail: getValue(extraction.supplierEmail),
    notes: getValue(extraction.notes),
  };
}

/**
 * Count extraction statistics
 * @param {ExtractionResult} extraction 
 * @returns {{ found: number, missing: number, total: number }}
 */
export function countExtractionStats(extraction) {
  const coreFields = [
    extraction.supplierName,
    extraction.currency,
    extraction.incoterm,
  ];
  
  // Check first line item if exists
  if (extraction.lineItems?.[0]) {
    coreFields.push(
      extraction.lineItems[0].unitPrice,
      extraction.lineItems[0].moq
    );
  }
  
  const found = coreFields.filter(f => wasFound(f)).length;
  const total = coreFields.length;
  
  return {
    found,
    missing: total - found,
    total,
  };
}
