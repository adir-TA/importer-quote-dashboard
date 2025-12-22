#!/usr/bin/env node

// ============================================
// LOCAL EXTRACTION TEST SCRIPT
// ============================================
// Tests the /api/extract-quote endpoint locally with a PDF file

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'http://localhost:3001/api/extract-quote';

async function testExtraction(pdfPath) {
  console.log('============================================');
  console.log('LOCAL EXTRACTION TEST');
  console.log('============================================\n');

  // Check if PDF exists
  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ PDF not found: ${pdfPath}`);
    console.log(`\nUsage: node test-extraction-local.js <path-to-pdf>`);
    console.log(`Example: node test-extraction-local.js tests/fixtures/wanpu-cleaning-cloth.pdf`);
    process.exit(1);
  }

  // Check if API key is set
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`❌ ANTHROPIC_API_KEY not set in .env file`);
    process.exit(1);
  }

  console.log(`📄 PDF file: ${pdfPath}`);

  // Read PDF and convert to base64
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64 = pdfBuffer.toString('base64');
  const fileSize = (pdfBuffer.length / 1024).toFixed(2);

  console.log(`📏 File size: ${fileSize} KB`);
  console.log(`🔑 API key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log(`🌐 API endpoint: ${API_URL}\n`);

  console.log(`🚀 Sending request...\n`);

  const startTime = Date.now();

  try {
    const response = await fetch(API_URL, {
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

    const duration = Date.now() - startTime;
    console.log(`⏱️  Request completed in ${duration}ms`);
    console.log(`📊 Response status: ${response.status} ${response.statusText}\n`);

    // Read response as text first
    const responseText = await response.text();

    // Try to parse as JSON
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`❌ Response is not JSON:`);
      console.error(responseText.substring(0, 500));
      process.exit(1);
    }

    if (!result.ok) {
      console.error(`❌ Extraction failed:`);
      console.error(`   Error code: ${result.error?.code}`);
      console.error(`   Error message: ${result.error?.message}`);
      console.error(`   Request ID: ${result.error?.requestId}`);
      process.exit(1);
    }

    // Success!
    console.log(`✅ EXTRACTION SUCCESSFUL\n`);

    const data = result.data;

    console.log(`📋 Supplier Information:`);
    console.log(`   Name: ${data.supplierName?.value || '(not found)'} ${data.supplierName?.source ? `[${data.supplierName.source}]` : ''}`);
    console.log(`   Email: ${data.supplierEmail?.value || '(not found)'} ${data.supplierEmail?.source ? `[${data.supplierEmail.source}]` : ''}`);
    console.log(`   Phone: ${data.supplierPhone?.value || '(not found)'} ${data.supplierPhone?.source ? `[${data.supplierPhone.source}]` : ''}`);

    console.log(`\n📦 Line Items: ${data.lineItems?.length || 0}`);

    if (data.lineItems && data.lineItems.length > 0) {
      data.lineItems.forEach((item, index) => {
        console.log(`\n   Item ${index + 1}:`);
        console.log(`      Product: ${item.productName || 'N/A'}`);
        console.log(`      SKU: ${item.sku || 'N/A'}`);
        console.log(`      Price: ${item.unitPrice ? `$${item.unitPrice}` : 'N/A'}`);
        console.log(`      MOQ: ${item.moq || 'N/A'}`);
        console.log(`      Dimensions: ${item.dimensions || 'N/A'}`);
        console.log(`      Weight: ${item.weight_g ? `${item.weight_g}g` : 'N/A'}`);
        console.log(`      Packing: ${item.packing_pcs_per_ctn ? `${item.packing_pcs_per_ctn} pcs/ctn` : 'N/A'}`);
      });
    }

    console.log(`\n✅ TEST PASSED`);

  } catch (error) {
    console.error(`\n❌ TEST FAILED`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack:\n${error.stack}`);
    process.exit(1);
  }
}

// Run test
const pdfPath = process.argv[2] || path.join(__dirname, 'tests/fixtures/wanpu-cleaning-cloth.pdf');
testExtraction(pdfPath);
