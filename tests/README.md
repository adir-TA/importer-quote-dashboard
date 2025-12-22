# Supplier Extraction Tests

This directory contains regression tests for supplier information extraction from PDFs.

## Test Structure

- `supplier-extraction.test.js` - Main test file with regex pattern validation
- `fixtures/` - Directory for PDF test fixtures

## Running Tests

```bash
npm test
# or
npm run test:supplier
```

## Adding Test Fixtures

To test with the WANPU Cleaning Cloth PDF:

1. Place the PDF file in `tests/fixtures/` directory
2. Name it: `wanpu-cleaning-cloth.pdf`
3. Run the tests: `npm test`

## What Gets Tested

### 1. WANPU PDF Extraction Test
Tests that supplier info is correctly extracted from the WANPU quotation:
- ✓ Supplier name contains "WANPU" or "TRADING"
- ✓ Email is extracted as `alex.autoway@gmail.com`
- ✓ Phone number is extracted
- ✓ Source is identified as 'header' or 'footer'

### 2. Email Regex Pattern Tests
Validates email extraction with patterns like:
- `alex.autoway@gmail.com`
- `sales@company.co.ltd`
- `info@123-trading.com.cn`

### 3. Phone Regex Pattern Tests
Validates phone extraction with formats:
- `Tel: +86-29-88888888`
- `Phone: (0086) 138-1234-5678`
- `Mobile: 13812345678`
- `WhatsApp: +86 138 1234 5678`

### 4. Company Name Pattern Tests
Validates company name extraction for:
- CO., LTD / COMPANY LIMITED
- TRADING CO / IMPORT EXPORT
- INDUSTRIAL / CORPORATION / FACTORY

## Expected Output

```
============================================
SUPPLIER EXTRACTION REGRESSION TESTS
============================================

🧪 Running: WANPU PDF Extraction
   📄 Loaded PDF: 245.67 KB
   📝 Extracted 2 page(s)
   📋 Header lines: 12
   📋 Footer lines: 8

   📊 Extraction Results:
      Name: XI'AN WANPU IMPORT AND EXPORT TRADING CO., LTD.
      Email: alex.autoway@gmail.com
      Phone: Tel: +86-29-88888888
✅ PASSED: WANPU PDF Extraction

🧪 Running: Email Regex Patterns
   ✓ Validated 3 email patterns
✅ PASSED: Email Regex Patterns

🧪 Running: Phone Regex Patterns
   ✓ Validated 4 phone patterns
✅ PASSED: Phone Regex Patterns

🧪 Running: Company Name Patterns
   ✓ Validated 4 company name patterns
✅ PASSED: Company Name Patterns

============================================
✅ PASSED: 4
❌ FAILED: 0
============================================
```

## Test Coverage

The tests verify the following extraction logic from `server.js`:
- `extractSupplierInfo()` - Regex-based extraction (lines 178-350)
- `extractHeaderFooterFromPdf()` - PDF text parsing (lines 360-396)

## Adding New Tests

To add new test cases, add them to the respective test functions in `supplier-extraction.test.js`:

```javascript
async function testMyNewCase() {
  const result = extractSupplierInfo({
    headerText: 'My test header text',
    footerText: '',
    bodyText: '',
  });

  assert(
    result.supplierEmail.value === 'expected@email.com',
    'Should extract email correctly'
  );
}

// Then add to main():
results.push(await runTest('My New Case', testMyNewCase));
```

## Troubleshooting

**Test skipped with "WANPU PDF fixture not found":**
- Add the WANPU PDF to `tests/fixtures/wanpu-cleaning-cloth.pdf`

**Extraction returns null:**
- Check PDF text with: `npm test` (shows extracted text preview)
- Verify header/footer text contains expected patterns
- Update regex patterns in `server.js` if needed

**Phone/email not extracted:**
- Check console output for extracted header/footer text
- Verify patterns match the actual format in the PDF
- Common issues: different label formats (e.g., "E-mail:" vs "Email:")
