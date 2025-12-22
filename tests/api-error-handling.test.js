// ============================================
// API ERROR HANDLING TEST
// ============================================
// Tests that frontend gracefully handles server errors (JSON and non-JSON)

import { parseJsonSafe, fetchJson, formatApiError } from '../src/utils/apiHelpers.js';

// ============================================
// TEST RUNNER
// ============================================

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

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

// ============================================
// TESTS
// ============================================

async function testParseJsonSafe_ValidJson() {
  const validJson = '{"ok": true, "data": {"test": 123}}';
  const result = parseJsonSafe(validJson);

  assert(result.isJson === true, 'Should recognize valid JSON');
  assert(result.parsed.ok === true, 'Should parse ok field correctly');
  assert(result.parsed.data.test === 123, 'Should parse nested data correctly');

  console.log('   ✓ Valid JSON parsed correctly');
}

async function testParseJsonSafe_InvalidJson() {
  const invalidJson = 'A server error occurred. Please try again.';
  const result = parseJsonSafe(invalidJson);

  assert(result.isJson === false, 'Should recognize invalid JSON');
  assert(result.parsed.ok === false, 'Should return error structure');
  assert(result.parsed.error !== undefined, 'Should have error field');
  assert(result.parsed.error.code === 'INVALID_JSON', 'Should have INVALID_JSON code');

  console.log('   ✓ Invalid JSON handled gracefully');
}

async function testParseJsonSafe_HtmlError() {
  const htmlError = '<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1></body></html>';
  const result = parseJsonSafe(htmlError);

  assert(result.isJson === false, 'Should recognize HTML as invalid JSON');
  assert(result.parsed.ok === false, 'Should return error structure');
  assert(result.parsed.error.message === htmlError, 'Should preserve original HTML in message');

  console.log('   ✓ HTML error page handled gracefully');
}

async function testFormatApiError_WithCode() {
  const error = {
    message: 'Image data required',
    code: 'MISSING_IMAGE',
    requestId: 'req_123456',
  };

  const formatted = formatApiError(error);

  assert(formatted.includes('Please select a file'), 'Should provide helpful context');
  assert(formatted.includes('Image data required'), 'Should include original message');
  assert(formatted.includes('req_123456'), 'Should include request ID');

  console.log('   ✓ Error formatted with helpful context');
}

async function testFormatApiError_UnknownCode() {
  const error = {
    message: 'Something went wrong',
    code: 'UNKNOWN_CODE_XYZ',
    requestId: 'req_789',
  };

  const formatted = formatApiError(error);

  assert(formatted.includes('Something went wrong'), 'Should show original message');
  assert(!formatted.includes('undefined'), 'Should not show undefined');

  console.log('   ✓ Unknown error code handled gracefully');
}

async function testFormatApiError_NetworkError() {
  const error = {
    message: 'Failed to fetch',
    code: 'NETWORK_ERROR',
    requestId: 'client_network_error',
  };

  const formatted = formatApiError(error);

  assert(formatted.includes('Network connection failed'), 'Should provide helpful context');
  assert(!formatted.includes('client_network_error'), 'Should not show client-side request IDs');

  console.log('   ✓ Network error formatted correctly');
}

async function testFetchJson_MockSuccess() {
  // Mock a successful JSON response
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => '{"ok": true, "data": {"value": 42}}',
  });

  const result = await fetchJson('http://example.com/api/test');

  assert(result.ok === true, 'Should parse ok field');
  assert(result.data.value === 42, 'Should parse data correctly');

  console.log('   ✓ Successful JSON response handled');
}

async function testFetchJson_MockHtmlError() {
  // Mock server returning HTML error page
  global.fetch = async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: async () => '<!DOCTYPE html><html><body>500 Error</body></html>',
  });

  const result = await fetchJson('http://example.com/api/test');

  assert(result.ok === false, 'Should recognize error');
  assert(result.error !== undefined, 'Should have error field');
  assert(result.error.code === 'INVALID_RESPONSE', 'Should have INVALID_RESPONSE code');
  assert(result.error.httpStatus === 500, 'Should include HTTP status');

  console.log('   ✓ HTML error page handled without crashing');
}

async function testFetchJson_MockPlainTextError() {
  // Mock server returning plain text error
  global.fetch = async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: async () => 'A server error occurred',
  });

  const result = await fetchJson('http://example.com/api/test');

  assert(result.ok === false, 'Should recognize error');
  assert(result.error.message.includes('A server error occurred'), 'Should include error text');

  console.log('   ✓ Plain text error handled without crashing');
}

async function testFetchJson_MockNetworkFailure() {
  // Mock network failure
  global.fetch = async () => {
    throw new Error('NetworkError: Failed to fetch');
  };

  const result = await fetchJson('http://example.com/api/test');

  assert(result.ok === false, 'Should recognize network error');
  assert(result.error.code === 'NETWORK_ERROR', 'Should have NETWORK_ERROR code');
  assert(result.error.message.includes('Failed to fetch'), 'Should include error message');

  console.log('   ✓ Network failure handled without crashing');
}

async function testFetchJson_MockStandardizedError() {
  // Mock server returning standardized error response
  global.fetch = async () => ({
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    text: async () => JSON.stringify({
      ok: false,
      error: {
        message: 'Image data required',
        code: 'MISSING_IMAGE',
        requestId: 'req_abc123',
      },
    }),
  });

  const result = await fetchJson('http://example.com/api/test');

  assert(result.ok === false, 'Should recognize error');
  assert(result.error.code === 'MISSING_IMAGE', 'Should have correct error code');
  assert(result.error.requestId === 'req_abc123', 'Should preserve request ID');

  console.log('   ✓ Standardized error response handled correctly');
}

// ============================================
// RUN ALL TESTS
// ============================================

async function main() {
  console.log('============================================');
  console.log('API ERROR HANDLING TESTS');
  console.log('============================================');

  const results = [];

  results.push(await runTest('parseJsonSafe - Valid JSON', testParseJsonSafe_ValidJson));
  results.push(await runTest('parseJsonSafe - Invalid JSON', testParseJsonSafe_InvalidJson));
  results.push(await runTest('parseJsonSafe - HTML Error', testParseJsonSafe_HtmlError));
  results.push(await runTest('formatApiError - With Code', testFormatApiError_WithCode));
  results.push(await runTest('formatApiError - Unknown Code', testFormatApiError_UnknownCode));
  results.push(await runTest('formatApiError - Network Error', testFormatApiError_NetworkError));
  results.push(await runTest('fetchJson - Success', testFetchJson_MockSuccess));
  results.push(await runTest('fetchJson - HTML Error', testFetchJson_MockHtmlError));
  results.push(await runTest('fetchJson - Plain Text Error', testFetchJson_MockPlainTextError));
  results.push(await runTest('fetchJson - Network Failure', testFetchJson_MockNetworkFailure));
  results.push(await runTest('fetchJson - Standardized Error', testFetchJson_MockStandardizedError));

  const passed = results.filter(r => r === true).length;
  const failed = results.filter(r => r === false).length;

  console.log('\n============================================');
  console.log(`✅ PASSED: ${passed}`);
  console.log(`❌ FAILED: ${failed}`);
  console.log('============================================');

  console.log('\n📝 KEY LEARNINGS:');
  console.log('   • parseJsonSafe handles both valid and invalid JSON');
  console.log('   • fetchJson converts non-JSON responses to error objects');
  console.log('   • formatApiError provides user-friendly error messages');
  console.log('   • All errors return { ok: false, error: {...} } structure');
  console.log('   • Frontend never crashes on unexpected server responses');

  process.exit(failed > 0 ? 1 : 0);
}

main();
