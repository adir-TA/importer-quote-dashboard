// ============================================
// SUPPLIER EXTRACTION TEST
// ============================================
// Tests that supplier information (name, email, phone) is correctly
// extracted from PDF headers/footers using regex patterns.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// EXTRACTION FUNCTIONS (copied from server.js)
// ============================================

function extractSupplierInfo({ headerText = '', footerText = '', bodyText = '' }) {
  const result = {
    supplierName: { value: null, confidence: 'not_found', source: null },
    supplierEmail: { value: null, confidence: 'not_found', source: null },
    supplierPhone: { value: null, confidence: 'not_found', source: null },
    supplierAddress: { value: null, confidence: 'not_found', source: null },
  };

  // EMAIL EXTRACTION
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let match = headerText.match(emailRegex);
  if (match && match.length > 0) {
    result.supplierEmail = {
      value: match[0],
      confidence: 'high',
      source: 'header',
    };
  } else {
    match = footerText.match(emailRegex);
    if (match && match.length > 0) {
      result.supplierEmail = {
        value: match[0],
        confidence: 'high',
        source: 'footer',
      };
    } else {
      match = bodyText.match(emailRegex);
      if (match && match.length > 0) {
        result.supplierEmail = {
          value: match[0],
          confidence: 'high',
          source: 'body',
        };
      }
    }
  }

  // PHONE EXTRACTION
  const phoneRegex = /(?:Tel|TEL|Phone|PHONE|Mob|Mobile|WhatsApp|WeChat)[:\s]*([+\d\s()-]{8,})|(?:\+86|0086)[- ]?[\d\s()-]{8,}|(?:\(\d{3,4}\))[- ]?[\d\s-]{6,}/gi;
  match = headerText.match(phoneRegex);
  if (match && match.length > 0) {
    result.supplierPhone = {
      value: match[0].trim(),
      confidence: 'high',
      source: 'header',
    };
  } else {
    match = footerText.match(phoneRegex);
    if (match && match.length > 0) {
      result.supplierPhone = {
        value: match[0].trim(),
        confidence: 'high',
        source: 'footer',
      };
    }
  }

  // SUPPLIER NAME EXTRACTION
  const lines = (headerText + '\n' + footerText).split('\n').filter(l => l.trim().length > 0);
  const companyPatterns = [
    /CO\.,?\s*LTD\.?/i,
    /COMPANY\s*LIMITED/i,
    /TRADING\s*CO/i,
    /IMPORT.*EXPORT|EXPORT.*IMPORT/i,
    /CORPORATION/i,
    /INDUSTRIAL/i,
    /FACTORY/i,
    /LTD\.?$/i,
    /INC\.?$/i,
  ];

  let bestMatch = null;
  let bestScore = 0;
  let bestSource = null;

  lines.forEach(line => {
    let score = 0;
    const cleanLine = line.trim();
    if (cleanLine.length < 5) return;

    companyPatterns.forEach(pattern => {
      if (pattern.test(cleanLine)) {
        score += 10;
      }
    });

    if (result.supplierEmail.value && cleanLine.toLowerCase().includes(result.supplierEmail.value.toLowerCase())) {
      score += 5;
    }

    if (cleanLine === cleanLine.toUpperCase() && cleanLine.length > 10) {
      score += 3;
    }

    const source = headerText.includes(line) ? 'header' : 'footer';

    if (score > bestScore) {
      bestScore = score;
      bestMatch = cleanLine;
      bestSource = source;
    }
  });

  if (bestMatch && bestScore > 0) {
    result.supplierName = {
      value: bestMatch,
      confidence: bestScore >= 10 ? 'high' : 'medium',
      source: bestSource,
    };
  }

  return result;
}

async function extractHeaderFooterFromPdf(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    const fullText = data.text;
    const lines = fullText.split('\n');

    const headerLineCount = Math.ceil(lines.length * 0.2);
    const footerLineCount = Math.ceil(lines.length * 0.2);

    const headerLines = lines.slice(0, headerLineCount);
    const footerLines = lines.slice(-footerLineCount);

    const headerText = headerLines.join('\n');
    const footerText = footerLines.join('\n');

    return {
      headerText,
      footerText,
      bodyText: fullText,
      pageCount: data.numpages,
    };
  } catch (error) {
    console.error('[PDF EXTRACTION] Error:', error);
    return {
      headerText: '',
      footerText: '',
      bodyText: '',
      pageCount: 0,
    };
  }
}

// ============================================
// TEST RUNNER
// ============================================

async function runTest(testName, testFn) {
  try {
    console.log(`\n🧪 Running: ${testName}`);
    await testFn();
    console.log(`✅ PASSED: ${testName}`);
    return true;
  } catch (error) {
    console.error(`❌ FAILED: ${testName}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// ============================================
// TESTS
// ============================================

async function testWanpuPdfExtraction() {
  const fixturePath = path.join(__dirname, 'fixtures', 'wanpu-cleaning-cloth.pdf');

  // Check if fixture exists
  if (!fs.existsSync(fixturePath)) {
    console.log(`⚠️  SKIPPED: WANPU PDF fixture not found at ${fixturePath}`);
    console.log(`   To run this test, add the WANPU Cleaning Cloth PDF to tests/fixtures/`);
    return;
  }

  // Read PDF
  const pdfBuffer = fs.readFileSync(fixturePath);
  console.log(`   📄 Loaded PDF: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

  // Extract header/footer
  const pdfData = await extractHeaderFooterFromPdf(pdfBuffer);
  console.log(`   📝 Extracted ${pdfData.pageCount} page(s)`);
  console.log(`   📋 Header lines: ${pdfData.headerText.split('\n').length}`);
  console.log(`   📋 Footer lines: ${pdfData.footerText.split('\n').length}`);

  // Run supplier extraction
  const supplierInfo = extractSupplierInfo({
    headerText: pdfData.headerText,
    footerText: pdfData.footerText,
    bodyText: pdfData.bodyText,
  });

  console.log('\n   📊 Extraction Results:');
  console.log(`      Name: ${supplierInfo.supplierName.value || '(not found)'}`);
  console.log(`      Email: ${supplierInfo.supplierEmail.value || '(not found)'}`);
  console.log(`      Phone: ${supplierInfo.supplierPhone.value || '(not found)'}`);

  // Assertions for WANPU PDF
  assert(
    supplierInfo.supplierName.value !== null,
    'Supplier name should be extracted'
  );

  assert(
    supplierInfo.supplierEmail.value !== null,
    'Supplier email should be extracted'
  );

  assert(
    supplierInfo.supplierEmail.value.toLowerCase() === 'alex.autoway@gmail.com',
    `Expected email to be alex.autoway@gmail.com, got ${supplierInfo.supplierEmail.value}`
  );

  assert(
    supplierInfo.supplierName.value.includes('WANPU') ||
    supplierInfo.supplierName.value.includes('TRADING'),
    `Expected company name to contain WANPU or TRADING, got ${supplierInfo.supplierName.value}`
  );

  assert(
    supplierInfo.supplierPhone.value !== null,
    'Supplier phone should be extracted'
  );

  assert(
    supplierInfo.supplierEmail.source === 'header' ||
    supplierInfo.supplierEmail.source === 'footer',
    `Expected email source to be header or footer, got ${supplierInfo.supplierEmail.source}`
  );
}

async function testEmailRegexPatterns() {
  const testCases = [
    { text: 'Email: alex.autoway@gmail.com', expected: 'alex.autoway@gmail.com' },
    { text: 'Contact us at sales@company.co.ltd', expected: 'sales@company.co.ltd' },
    { text: 'info@123-trading.com.cn', expected: 'info@123-trading.com.cn' },
  ];

  for (const testCase of testCases) {
    const result = extractSupplierInfo({
      headerText: testCase.text,
      footerText: '',
      bodyText: '',
    });

    assert(
      result.supplierEmail.value === testCase.expected,
      `Expected ${testCase.expected}, got ${result.supplierEmail.value}`
    );
  }

  console.log(`   ✓ Validated ${testCases.length} email patterns`);
}

async function testPhoneRegexPatterns() {
  const testCases = [
    'Tel: +86-29-88888888',
    'Phone: (0086) 138-1234-5678',
    'Mobile: 13812345678',
    'WhatsApp: +86 138 1234 5678',
  ];

  for (const text of testCases) {
    const result = extractSupplierInfo({
      headerText: text,
      footerText: '',
      bodyText: '',
    });

    assert(
      result.supplierPhone.value !== null,
      `Should extract phone from: ${text}`
    );
  }

  console.log(`   ✓ Validated ${testCases.length} phone patterns`);
}

async function testCompanyNamePatterns() {
  const testCases = [
    { text: "XI'AN WANPU IMPORT AND EXPORT TRADING CO., LTD.", shouldMatch: true },
    { text: 'SHENZHEN TRADING COMPANY LIMITED', shouldMatch: true },
    { text: 'ABC INDUSTRIAL CORPORATION', shouldMatch: true },
    { text: 'Random text without company pattern', shouldMatch: false },
  ];

  for (const testCase of testCases) {
    const result = extractSupplierInfo({
      headerText: testCase.text,
      footerText: '',
      bodyText: '',
    });

    if (testCase.shouldMatch) {
      assert(
        result.supplierName.value !== null,
        `Should extract company name from: ${testCase.text}`
      );
    } else {
      assert(
        result.supplierName.value === null,
        `Should NOT extract company name from: ${testCase.text}`
      );
    }
  }

  console.log(`   ✓ Validated ${testCases.length} company name patterns`);
}

// ============================================
// RUN ALL TESTS
// ============================================

async function main() {
  console.log('============================================');
  console.log('SUPPLIER EXTRACTION REGRESSION TESTS');
  console.log('============================================');

  const results = [];

  results.push(await runTest('WANPU PDF Extraction', testWanpuPdfExtraction));
  results.push(await runTest('Email Regex Patterns', testEmailRegexPatterns));
  results.push(await runTest('Phone Regex Patterns', testPhoneRegexPatterns));
  results.push(await runTest('Company Name Patterns', testCompanyNamePatterns));

  const passed = results.filter(r => r === true).length;
  const failed = results.filter(r => r === false).length;

  console.log('\n============================================');
  console.log(`✅ PASSED: ${passed}`);
  console.log(`❌ FAILED: ${failed}`);
  console.log('============================================');

  process.exit(failed > 0 ? 1 : 0);
}

main();
