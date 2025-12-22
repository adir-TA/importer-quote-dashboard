// ============================================
// API HELPERS - SAFE JSON PARSING
// ============================================
// Utilities for handling API responses that might not be valid JSON

/**
 * Safely parse JSON text without throwing
 * @param {string} text - Text to parse as JSON
 * @returns {{ parsed: any, isJson: boolean }} - Parsed data and whether it was valid JSON
 */
export function parseJsonSafe(text) {
  try {
    const parsed = JSON.parse(text);
    return { parsed, isJson: true };
  } catch (error) {
    console.warn('[parseJsonSafe] Failed to parse as JSON:', text.substring(0, 200));
    return {
      parsed: {
        ok: false,
        error: {
          message: text,
          code: 'INVALID_JSON',
          requestId: 'client_parse_error'
        }
      },
      isJson: false
    };
  }
}

/**
 * Safely fetch and parse JSON from an API endpoint
 * Handles both JSON and non-JSON responses gracefully
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<{ ok: boolean, data?: any, error?: any }>} - Standardized response
 */
export async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, options);

    // Read as text first (safer than response.json())
    const text = await response.text();

    // Try to parse as JSON
    const { parsed, isJson } = parseJsonSafe(text);

    // If not JSON, create error response
    if (!isJson) {
      console.error('[fetchJson] Non-JSON response:', {
        url,
        status: response.status,
        statusText: response.statusText,
        preview: text.substring(0, 200),
      });

      return {
        ok: false,
        error: {
          message: `Server returned invalid response: ${text.substring(0, 100)}`,
          code: 'INVALID_RESPONSE',
          requestId: 'client_parse_error',
          httpStatus: response.status,
        },
      };
    }

    // Return parsed response (already has ok: true/false from backend)
    return parsed;

  } catch (error) {
    console.error('[fetchJson] Fetch failed:', error);

    return {
      ok: false,
      error: {
        message: error.message || 'Network request failed',
        code: 'NETWORK_ERROR',
        requestId: 'client_network_error',
      },
    };
  }
}

/**
 * Display user-friendly error message from API error object
 * @param {Object} error - Error object from API response
 * @returns {string} - User-friendly error message
 */
export function formatApiError(error) {
  if (!error) return 'An unknown error occurred';

  const { message, code, requestId } = error;

  // Provide helpful context based on error code
  const codeMessages = {
    'MISSING_IMAGE': 'Please select a file to upload',
    'MISSING_API_KEY': 'Please add your Anthropic API key in Settings',
    'ANTHROPIC_API_ERROR': 'Failed to connect to AI service',
    'EMPTY_RESPONSE': 'AI service returned empty response',
    'PARSE_ERROR': 'Failed to parse quote data',
    'EXTRACTION_FAILED': 'Quote extraction failed',
    'INVALID_JSON': 'Server returned invalid response',
    'INVALID_RESPONSE': 'Server returned invalid response',
    'NETWORK_ERROR': 'Network connection failed',
  };

  const contextMessage = codeMessages[code] || '';
  const baseMessage = message || 'An error occurred';

  // Build user-friendly message
  let fullMessage = contextMessage ? `${contextMessage}: ${baseMessage}` : baseMessage;

  // Add request ID for support
  if (requestId && requestId !== 'client_parse_error' && requestId !== 'client_network_error') {
    fullMessage += `\n\nReference ID: ${requestId}`;
  }

  return fullMessage;
}
