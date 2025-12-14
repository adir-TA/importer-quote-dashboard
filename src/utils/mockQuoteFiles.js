// ============================================
// MOCK QUOTE FILES FOR TESTING
// ============================================
// These provide test data for the quote upload feature.
// 
// In production, actual file parsing would happen via:
// - PDF: pdf.js or pdfjs-dist
// - Excel: xlsx or exceljs
// - Image: Tesseract.js or Claude Vision API
//
// REMOVE OR DISABLE FOR PRODUCTION
// ============================================

/**
 * Mock extracted data simulating different file types and quality levels.
 * Structure matches what quoteExtractionService returns.
 */
export const MOCK_QUOTE_FILES = {
  
  // ============================================
  // HIGH QUALITY: Professional PDF with price tiers
  // ============================================
  professional_pdf: {
    fileName: 'Shenzhen_Tech_Quote_2024.pdf',
    fileType: 'application/pdf',
    description: 'Professional quotation with price tiers and complete data',
    fields: {
      supplierName: { 
        value: 'Shenzhen Tech Electronics Co., Ltd', 
        confidence: 'high', 
        source: 'Document header' 
      },
      productName: { 
        value: 'USB-C Fast Charging Cable 1M - Braided Nylon', 
        confidence: 'high', 
        source: 'Product section' 
      },
      unitPrice: { 
        value: 0.85, 
        confidence: 'high', 
        source: 'Pricing table - base price' 
      },
      currency: { 
        value: 'USD', 
        confidence: 'high', 
        source: 'Multiple mentions' 
      },
      moq: { 
        value: 1000, 
        confidence: 'high', 
        source: 'Terms section' 
      },
      incoterm: { 
        value: 'FOB Shenzhen', 
        confidence: 'high', 
        source: 'Shipping terms' 
      },
      quantity: { 
        value: 5000, 
        confidence: 'medium', 
        source: 'Order details' 
      },
      leadTime: { 
        value: '15-20 working days', 
        confidence: 'high', 
        source: 'Delivery section' 
      },
      validUntil: { 
        value: '2024-02-15', 
        confidence: 'high', 
        source: 'Quote header' 
      },
      paymentTerms: { 
        value: '30% TT deposit, 70% before shipment', 
        confidence: 'high', 
        source: 'Payment terms' 
      },
      notes: { 
        value: 'Custom logo available (+$0.05/pc). Sample at $5.00/pc.', 
        confidence: 'medium', 
        source: 'Remarks section' 
      },
    },
    priceTiers: [
      { minQty: 1000, maxQty: 2999, unitPrice: 0.85, label: '1,000 - 2,999 pcs' },
      { minQty: 3000, maxQty: 4999, unitPrice: 0.78, label: '3,000 - 4,999 pcs' },
      { minQty: 5000, maxQty: Infinity, unitPrice: 0.72, label: '5,000+ pcs' },
    ],
    meta: {
      requiredFound: 3,
      optionalFound: 7,
      totalFields: 11,
      quality: 'good',
      hasPriceTiers: true,
    },
  },

  // ============================================
  // MEDIUM QUALITY: Simple Excel spreadsheet
  // ============================================
  simple_excel: {
    fileName: 'Guangzhou_Trading_Quote.xlsx',
    fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    description: 'Simple Excel quote with partial data',
    fields: {
      supplierName: { 
        value: 'Guangzhou Trading Ltd', 
        confidence: 'high', 
        source: 'Cell A2' 
      },
      productName: { 
        value: 'LED Desk Lamp Model A', 
        confidence: 'high', 
        source: 'Cell B5' 
      },
      unitPrice: { 
        value: 4.25, 
        confidence: 'high', 
        source: 'Cell C5' 
      },
      currency: { 
        value: 'USD', 
        confidence: 'high', 
        source: 'Header row' 
      },
      moq: { 
        value: 500, 
        confidence: 'high', 
        source: 'Cell D5' 
      },
      incoterm: { 
        value: 'EXW Guangzhou', 
        confidence: 'medium', 
        source: 'Footer note' 
      },
      quantity: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      leadTime: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      validUntil: { 
        value: '30 days', 
        confidence: 'low', 
        source: 'Footer - partial match' 
      },
      paymentTerms: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      notes: { 
        value: 'Bulk discount available for 2000+ units', 
        confidence: 'medium', 
        source: 'Notes column' 
      },
    },
    priceTiers: [],
    meta: {
      requiredFound: 3,
      optionalFound: 4,
      totalFields: 11,
      quality: 'partial',
      hasPriceTiers: false,
    },
  },

  // ============================================
  // MEDIUM QUALITY: Scanned image (OCR)
  // ============================================
  scanned_image: {
    fileName: 'ningbo_quote_scan.jpg',
    fileType: 'image/jpeg',
    description: 'Scanned document with OCR extraction',
    fields: {
      supplierName: { 
        value: 'Ningbo Import Export Co', 
        confidence: 'medium', 
        source: 'OCR - Header area' 
      },
      productName: { 
        value: 'Microfiber Cleaning Cloth 30x30cm', 
        confidence: 'high', 
        source: 'OCR - Product line' 
      },
      unitPrice: { 
        value: 0.35, 
        confidence: 'high', 
        source: 'OCR - Price line' 
      },
      currency: { 
        value: 'USD', 
        confidence: 'high', 
        source: 'OCR - Detected symbol' 
      },
      moq: { 
        value: 3000, 
        confidence: 'high', 
        source: 'OCR - MOQ line' 
      },
      incoterm: { 
        value: 'CIF Los Angeles', 
        confidence: 'medium', 
        source: 'OCR - Shipping line' 
      },
      quantity: { 
        value: 5000, 
        confidence: 'low', 
        source: 'OCR - Unclear text' 
      },
      leadTime: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      validUntil: { 
        value: '2024-02-28', 
        confidence: 'medium', 
        source: 'OCR - Footer' 
      },
      paymentTerms: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      notes: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
    },
    priceTiers: [],
    meta: {
      requiredFound: 3,
      optionalFound: 3,
      totalFields: 11,
      quality: 'partial',
      hasPriceTiers: false,
    },
  },

  // ============================================
  // LOW QUALITY: Poor scan or unclear document
  // ============================================
  poor_quality: {
    fileName: 'unclear_quote_photo.png',
    fileType: 'image/png',
    description: 'Poor quality image with minimal extraction',
    fields: {
      supplierName: { 
        value: 'Some Company', 
        confidence: 'low', 
        source: 'Partial text match' 
      },
      productName: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      unitPrice: { 
        value: 2.50, 
        confidence: 'medium', 
        source: 'Number pattern', 
        warning: 'Could not verify if this is unit price or total' 
      },
      currency: { 
        value: 'USD', 
        confidence: 'low', 
        source: 'Assumed default' 
      },
      moq: { 
        value: 1000, 
        confidence: 'low', 
        source: 'Partial match' 
      },
      incoterm: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      quantity: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      leadTime: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      validUntil: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      paymentTerms: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
      notes: { 
        value: null, 
        confidence: 'missing', 
        source: null 
      },
    },
    priceTiers: [],
    meta: {
      requiredFound: 2,
      optionalFound: 0,
      totalFields: 11,
      quality: 'poor',
      hasPriceTiers: false,
    },
  },
};

/**
 * Get a mock file by type for testing
 * @param {'pdf'|'excel'|'image'|'poor'} type 
 */
export function getMockByType(type) {
  switch (type) {
    case 'pdf': return MOCK_QUOTE_FILES.professional_pdf;
    case 'excel': return MOCK_QUOTE_FILES.simple_excel;
    case 'image': return MOCK_QUOTE_FILES.scanned_image;
    case 'poor': return MOCK_QUOTE_FILES.poor_quality;
    default: return MOCK_QUOTE_FILES.professional_pdf;
  }
}

/**
 * Get a random mock for testing variability
 */
export function getRandomMock() {
  const mocks = Object.values(MOCK_QUOTE_FILES);
  return mocks[Math.floor(Math.random() * mocks.length)];
}
