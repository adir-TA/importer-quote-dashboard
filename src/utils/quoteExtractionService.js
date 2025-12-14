// ============================================
// QUOTE EXTRACTION SERVICE
// ============================================
// 
// EXTRACTION RULES (NON-NEGOTIABLE):
// 1. If a field is NOT explicitly present → null, status: 'not_found'
// 2. NEVER infer MOQ from quantity
// 3. NEVER infer unit price if multiple SKUs exist without selection
// 4. NEVER invent values
//
// OUTPUT: ExtractionResult with all line items
// User must SELECT which line item to use for quote
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
// MOCK EXTRACTION DATA
// ============================================
// Simulates realistic extraction with multiple SKUs,
// missing fields, and logistics data

const MOCK_EXTRACTIONS = {
  // Multi-SKU aluminum foil quote (realistic messy data)
  multi_sku_table: {
    supplierName: extracted('Jiangsu Dingsheng New Material Co., Ltd', 'Header'),
    supplierContact: extracted('Ms. Wang Li', 'Contact section'),
    supplierEmail: extracted('sales@dingsheng-alu.com', 'Contact section'),
    currency: extracted('USD', 'Price column'),
    incoterm: extracted('FOB Shanghai', 'Terms section'),
    validUntil: extracted('2024-03-15', 'Header'),
    paymentTerms: extracted('30% TT deposit, 70% against B/L copy', 'Terms'),
    leadTime: extracted('25-30 days after deposit', 'Terms'),
    notes: extracted('Prices subject to LME aluminum fluctuation', 'Footer'),
    lineItems: [
      {
        id: 'item-1',
        productName: extracted('Aluminum Foil 8011-O', 'Row 1'),
        sku: extracted('AF-8011-O-9', 'Row 1'),
        unitPrice: extracted(2850, 'Row 1'), // USD/MT
        currency: extracted('USD', 'Header'),
        moq: notFound(), // NOT in document - don't guess!
        quantity: extracted(5, 'Row 1'), // 5 MT
        dimensions: extracted('0.009mm x 500mm', 'Row 1'),
        weight: notFound(),
        packing: extracted('Wooden pallet, export standard', 'Row 1'),
        cartonSize: notFound(),
        cbm: notFound(),
      },
      {
        id: 'item-2',
        productName: extracted('Aluminum Foil 8011-O', 'Row 2'),
        sku: extracted('AF-8011-O-12', 'Row 2'),
        unitPrice: extracted(2780, 'Row 2'),
        currency: extracted('USD', 'Header'),
        moq: notFound(),
        quantity: extracted(10, 'Row 2'),
        dimensions: extracted('0.012mm x 500mm', 'Row 2'),
        weight: notFound(),
        packing: extracted('Wooden pallet, export standard', 'Row 2'),
        cartonSize: notFound(),
        cbm: notFound(),
      },
      {
        id: 'item-3',
        productName: extracted('Aluminum Foil 8079-O', 'Row 3'),
        sku: extracted('AF-8079-O-7', 'Row 3'),
        unitPrice: extracted(2950, 'Row 3'),
        currency: extracted('USD', 'Header'),
        moq: notFound(),
        quantity: extracted(3, 'Row 3'),
        dimensions: extracted('0.007mm x 450mm', 'Row 3'),
        weight: notFound(),
        packing: extracted('Wooden pallet, export standard', 'Row 3'),
        cartonSize: notFound(),
        cbm: notFound(),
      },
    ],
    hasMultipleItems: true,
  },

  // Single item with full logistics
  single_item_full: {
    supplierName: extracted('Shenzhen Tech Electronics Co., Ltd', 'Header'),
    supplierContact: extracted('Mr. Zhang Wei', 'Contact'),
    supplierEmail: extracted('zhang@sztech.com', 'Contact'),
    currency: extracted('USD', 'Price line'),
    incoterm: extracted('FOB Shenzhen', 'Terms'),
    validUntil: extracted('2024-02-28', 'Header'),
    paymentTerms: extracted('30% deposit, 70% before shipment', 'Terms'),
    leadTime: extracted('15-20 working days', 'Terms'),
    notes: extracted('Custom logo available +$0.05/pc', 'Remarks'),
    lineItems: [
      {
        id: 'item-1',
        productName: extracted('USB-C Charging Cable 1M Braided', 'Product section'),
        sku: extracted('TC-USBC-1M-BR', 'Product section'),
        unitPrice: extracted(0.85, 'Price table'),
        currency: extracted('USD', 'Price table'),
        moq: extracted(1000, 'Terms section'), // Actually found!
        quantity: extracted(5000, 'Order details'),
        dimensions: extracted('100cm x Ø3mm', 'Specs'),
        weight: extracted('45g', 'Specs'),
        packing: extracted('100pcs/inner box, 1000pcs/carton', 'Packing'),
        cartonSize: extracted('52 x 42 x 38 cm', 'Packing'),
        cbm: extracted(0.083, 'Packing'),
      },
    ],
    hasMultipleItems: false,
  },

  // Excel with partial data (common scenario)
  excel_partial: {
    supplierName: extracted('Guangzhou Trading Ltd', 'Cell A2'),
    supplierContact: notFound(),
    supplierEmail: extracted('info@gztrading.com', 'Cell A4'),
    currency: extracted('USD', 'Header'),
    incoterm: notFound(), // NOT FOUND - don't invent "FOB"
    validUntil: notFound(),
    paymentTerms: notFound(),
    leadTime: notFound(),
    notes: extracted('Prices valid for 30 days', 'Footer'),
    lineItems: [
      {
        id: 'item-1',
        productName: extracted('LED Desk Lamp Model A', 'Cell B5'),
        sku: extracted('LED-DL-A01', 'Cell A5'),
        unitPrice: extracted(4.25, 'Cell C5'),
        currency: extracted('USD', 'Header'),
        moq: notFound(), // NOT in spreadsheet
        quantity: extracted(1000, 'Cell D5'),
        dimensions: extracted('45 x 12 x 40 cm', 'Cell E5'),
        weight: extracted('0.8 kg', 'Cell F5'),
        packing: extracted('1pc/color box, 10pcs/carton', 'Cell G5'),
        cartonSize: notFound(),
        cbm: notFound(),
      },
    ],
    hasMultipleItems: false,
  },

  // Poor quality scan - minimal extraction
  poor_scan: {
    supplierName: extracted('Ningbo Import Export', 'OCR - partial'),
    supplierContact: notFound(),
    supplierEmail: notFound(),
    currency: notFound(), // Can't determine
    incoterm: notFound(),
    validUntil: notFound(),
    paymentTerms: notFound(),
    leadTime: notFound(),
    notes: notFound(),
    lineItems: [
      {
        id: 'item-1',
        productName: notFound(), // Can't read product name
        sku: notFound(),
        unitPrice: extracted(0.35, 'OCR - number detected'),
        currency: notFound(),
        moq: notFound(),
        quantity: notFound(),
        dimensions: notFound(),
        weight: notFound(),
        packing: notFound(),
        cartonSize: notFound(),
        cbm: notFound(),
      },
    ],
    hasMultipleItems: false,
  },
};

// ============================================
// FILE PROCESSING
// ============================================

/**
 * Process PDF file
 * PRODUCTION: Replace with pdf.js or Claude Vision API
 */
async function processPdf(file) {
  console.log('[Extraction] Processing PDF:', file.name);
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Return multi-SKU mock (common for PDFs)
  return MOCK_EXTRACTIONS.multi_sku_table;
}

/**
 * Process Excel file
 * PRODUCTION: Replace with xlsx library
 */
async function processExcel(file) {
  console.log('[Extraction] Processing Excel:', file.name);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return MOCK_EXTRACTIONS.excel_partial;
}

/**
 * Process image via OCR
 * PRODUCTION: Replace with Tesseract.js or Claude Vision
 */
async function processImage(file) {
  console.log('[Extraction] Processing Image:', file.name);
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Randomly return different quality
  return Math.random() > 0.5 
    ? MOCK_EXTRACTIONS.single_item_full 
    : MOCK_EXTRACTIONS.poor_scan;
}

/**
 * Main extraction function
 * @param {File} file 
 * @returns {Promise<ExtractionResult>}
 */
export async function extractQuoteFromFile(file) {
  if (!file) {
    return { success: false, error: 'No file provided' };
  }

  const fileName = file.name.toLowerCase();
  const fileType = file.type;

  try {
    let mockData;

    if (fileName.endsWith('.pdf') || fileType === 'application/pdf') {
      mockData = await processPdf(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ||
               fileType.includes('spreadsheet') || fileType.includes('excel')) {
      mockData = await processExcel(file);
    } else if (fileType.startsWith('image/') ||
               fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/)) {
      mockData = await processImage(file);
    } else {
      return {
        success: false,
        error: 'Unsupported file type. Please upload PDF, Excel, or image files.',
      };
    }

    // Build result
    const result = {
      success: true,
      fileName: file.name,
      fileType: fileType,
      ...mockData,
    };

    // Calculate stats
    result.meta = countExtractionStats(result);

    return result;

  } catch (error) {
    console.error('[Extraction] Error:', error);
    return {
      success: false,
      error: `Failed to process file: ${error.message}`,
    };
  }
}

// ============================================
// EXPORTS
// ============================================

export { MOCK_EXTRACTIONS };
export {
  extracted,
  notFound,
  wasFound,
  getValue,
  createEmptyLineItem,
  createEmptyExtraction,
  buildCoreQuote,
  buildQuoteMetadata,
  countExtractionStats,
} from './quoteDataModels';
