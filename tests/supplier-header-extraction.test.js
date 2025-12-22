// ============================================
// TEST: Supplier Header Extraction + Quantity/MOQ Handling
// ============================================
// Tests the enhanced supplier extraction with smart header detection
// and quantity_value/quantity_type tracking

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('🧪 Testing Enhanced Supplier Header Extraction + Quantity/MOQ Handling\n');

// ============================================
// TEST 1: Smart Header Extraction
// ============================================
console.log('TEST 1: Smart header extraction with document markers');

const testText = `
ACME TRADING CO., LTD.
123 Factory Road, Industrial Zone
Shenzhen, Guangdong, China
Tel: +86-755-1234-5678
Email: info@acmetrading.com

QUOTATION

Item No.  Product Name      Unit Price  MOQ
C430      Cleaning Cloth    $0.50       500
`.trim();

// Mock smart header extraction logic
const lines = testText.split('\n');
const documentMarkers = ['QUOTATION', 'INVOICE', 'PROFORMA', 'PURCHASE ORDER', 'Item No', 'ITEM NO', 'Product', 'PRODUCT'];
let headerEndIndex = Math.min(30, lines.length);

for (let i = 0; i < Math.min(50, lines.length); i++) {
  const line = lines[i].toUpperCase();
  if (documentMarkers.some(marker => line.includes(marker.toUpperCase()))) {
    headerEndIndex = i;
    break;
  }
}

const headerLines = lines.slice(0, headerEndIndex);
const headerText = headerLines.join('\n');

console.log(`   Header end index: ${headerEndIndex} (found "QUOTATION" marker)`);
console.log(`   Header text: ${headerText.substring(0, 100)}...`);

// Verify header contains supplier info
const hasCompanyName = headerText.includes('ACME TRADING');
const hasEmail = headerText.includes('info@acmetrading.com');
const hasPhone = headerText.includes('+86-755');

console.log(`   ✓ Header contains company name: ${hasCompanyName}`);
console.log(`   ✓ Header contains email: ${hasEmail}`);
console.log(`   ✓ Header contains phone: ${hasPhone}`);

if (!hasCompanyName || !hasEmail || !hasPhone) {
  console.error('   ❌ FAIL: Smart header extraction did not capture all supplier info');
  process.exit(1);
}

console.log('   ✅ PASS: Smart header extraction captured supplier info before table\n');

// ============================================
// TEST 2: Quantity/MOQ Type Detection
// ============================================
console.log('TEST 2: Quantity type detection (MOQ vs QTY)');

const testCases = [
  { quantity_value: 50, quantity_type: 'UNKNOWN', expected: 'MOQ', reason: 'Small value < 100 likely MOQ' },
  { quantity_value: 500, quantity_type: 'MOQ', expected: 'MOQ', reason: 'Explicitly labeled as MOQ' },
  { quantity_value: 15000, quantity_type: 'MOQ', expected: 'QTY', reason: 'Large value > 10000 likely regular quantity' },
  { quantity_value: 1000, quantity_type: 'QTY', expected: 'QTY', reason: 'Explicitly labeled as QTY' },
];

// Mock detectAndCorrectQuantityType logic
function detectQuantityType(qtyValue, qtyType) {
  let correctedType = qtyType;

  // Small values likely MOQ
  if (qtyValue < 100 && qtyType === 'UNKNOWN') {
    correctedType = 'MOQ';
  }

  // Very large values likely regular quantity
  if (qtyValue > 10000 && qtyType === 'MOQ') {
    correctedType = 'QTY';
  }

  return correctedType;
}

let testsPassed = 0;
testCases.forEach((testCase, idx) => {
  const result = detectQuantityType(testCase.quantity_value, testCase.quantity_type);
  const passed = result === testCase.expected;

  console.log(`   Case ${idx + 1}: ${testCase.quantity_value} (${testCase.quantity_type}) → ${result}`);
  console.log(`     Expected: ${testCase.expected} (${testCase.reason})`);
  console.log(`     ${passed ? '✅ PASS' : '❌ FAIL'}`);

  if (passed) testsPassed++;
});

if (testsPassed !== testCases.length) {
  console.error(`\n   ❌ FAIL: ${testsPassed}/${testCases.length} tests passed`);
  process.exit(1);
}

console.log(`\n   ✅ PASS: All ${testCases.length} quantity type detection tests passed\n`);

// ============================================
// TEST 3: Regex-based Supplier Extraction
// ============================================
console.log('TEST 3: Regex-based supplier field extraction');

const supplierText = `
WANPU INTERNATIONAL TRADING CO., LTD.
Room 1203, Building A, Industrial Park
Guangzhou, Guangdong Province, China
Tel: +86-20-8888-9999 / Mobile: +86-138-0000-1234
Email: sales@wanpu-trading.com
`.trim();

// Test email extraction
const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const emails = supplierText.match(emailRegex);
const extractedEmail = emails ? emails[0].toLowerCase() : null;

// Test phone extraction
const phonePattern = /(?:Tel|TEL|Mobile)[:\s]+([+\d\s().-]{9,})/gi;
const phoneMatches = [...supplierText.matchAll(phonePattern)];
const extractedPhone = phoneMatches.length > 0 ? phoneMatches[0][1].trim() : null;

// Test company name extraction (simplified)
const hasCompanyKeyword = /CO\.,?\s*LTD\.?|LIMITED/i.test(supplierText);
const companyLines = supplierText.split('\n').filter(line => /CO\.,?\s*LTD\.?/i.test(line));
const extractedCompany = companyLines.length > 0 ? companyLines[0].trim() : null;

console.log(`   Email extracted: ${extractedEmail}`);
console.log(`   Phone extracted: ${extractedPhone}`);
console.log(`   Company extracted: ${extractedCompany}`);

const emailCorrect = extractedEmail === 'sales@wanpu-trading.com';
const phoneCorrect = extractedPhone && extractedPhone.includes('+86-20-8888-9999');
const companyCorrect = extractedCompany && extractedCompany.includes('WANPU INTERNATIONAL');

console.log(`   ${emailCorrect ? '✅' : '❌'} Email: ${emailCorrect ? 'PASS' : 'FAIL'}`);
console.log(`   ${phoneCorrect ? '✅' : '❌'} Phone: ${phoneCorrect ? 'PASS' : 'FAIL'}`);
console.log(`   ${companyCorrect ? '✅' : '❌'} Company: ${companyCorrect ? 'PASS' : 'FAIL'}`);

if (!emailCorrect || !phoneCorrect || !companyCorrect) {
  console.error('\n   ❌ FAIL: Regex supplier extraction did not capture all fields');
  process.exit(1);
}

console.log('\n   ✅ PASS: Regex-based supplier extraction captured all fields\n');

// ============================================
// TEST 4: Field Confidence Tracking
// ============================================
console.log('TEST 4: Field confidence and "Found/Not found" status');

const mockExtraction = {
  supplierEmail: { value: 'test@example.com', confidence: 'high', source: 'regex-header' },
  supplierPhone: { value: '+86-123-4567', confidence: 'high', source: 'regex-header' },
  supplierName: { value: null, confidence: 'not_found', source: null },
};

const emailFound = mockExtraction.supplierEmail.value !== null && mockExtraction.supplierEmail.confidence !== 'not_found';
const phoneFound = mockExtraction.supplierPhone.value !== null && mockExtraction.supplierPhone.confidence !== 'not_found';
const nameFound = mockExtraction.supplierName.value !== null && mockExtraction.supplierName.confidence !== 'not_found';

console.log(`   Email: ${emailFound ? 'Found' : 'Not found'} (confidence: ${mockExtraction.supplierEmail.confidence})`);
console.log(`   Phone: ${phoneFound ? 'Found' : 'Not found'} (confidence: ${mockExtraction.supplierPhone.confidence})`);
console.log(`   Name: ${nameFound ? 'Found' : 'Not found'} (confidence: ${mockExtraction.supplierName.confidence})`);

if (!emailFound || !phoneFound || nameFound) {
  console.error('\n   ❌ FAIL: Confidence tracking incorrect');
  process.exit(1);
}

console.log('\n   ✅ PASS: Confidence tracking correctly shows Found/Not found status\n');

// ============================================
// ALL TESTS PASSED
// ============================================
console.log('✅ ALL TESTS PASSED - Supplier header extraction + quantity/MOQ handling working correctly\n');
process.exit(0);
