// ============================================
// API HELPERS - AUTH + SAFE JSON PARSING
// ============================================
// Utilities for calling the backend API and handling responses that might not
// be valid JSON.

// The access-token source is injected rather than imported, so this module
// stays free of browser-only dependencies and remains unit-testable in Node.
let accessTokenProvider = async () => null;

/**
 * Register how to obtain the current Supabase access token.
 * Called once at startup (see src/main.jsx).
 */
export function setAccessTokenProvider(provider) {
  accessTokenProvider = typeof provider === 'function' ? provider : async () => null;
}

/** Current access token, or null when signed out / not wired up. */
export async function getAccessToken() {
  try {
    return (await accessTokenProvider()) || null;
  } catch (error) {
    console.error('[getAccessToken] Failed to read session:', error);
    return null;
  }
}

/**
 * fetch() with the Supabase bearer token attached.
 * Use this for every call to the backend API - every /api route now requires
 * it. The backend used to trust a `userId` field in the request body instead.
 */
export async function authFetch(url, options = {}) {
  const token = await getAccessToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, { ...options, headers });
}

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
    const response = await authFetch(url, options);

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

    // Log the actual parsed response for debugging
    console.log('[fetchJson] Parsed response:', {
      url: url.split('/').slice(-2).join('/'), // Last 2 segments
      status: response.status,
      hasOk: 'ok' in parsed,
      hasSuccess: 'success' in parsed,
      hasData: 'data' in parsed,
      hasError: 'error' in parsed,
      okValue: parsed.ok,
      successValue: parsed.success,
      keys: Object.keys(parsed).slice(0, 10), // First 10 keys
    });

    // NORMALIZE RESPONSE FORMAT - Handle both formats:
    // Format 1: { ok: true/false, data: {...}, error: {...} }
    // Format 2: { success: true/false, data: {...}, error: {...} }
    let normalizedResponse;

    if ('success' in parsed) {
      // Backend uses 'success' field - normalize to 'ok'
      console.log('[fetchJson] Normalizing response with "success" field to "ok" format');
      normalizedResponse = {
        ok: parsed.success === true,
        data: parsed.data || null,
        error: parsed.error || null,
      };
    } else if ('ok' in parsed) {
      // Already in expected format
      normalizedResponse = parsed;
    } else {
      // Unexpected format - treat entire response as data if HTTP 200, else error
      console.warn('[fetchJson] Response has no "ok" or "success" field, response:', parsed);

      if (response.status >= 200 && response.status < 300) {
        // Treat as successful response with data
        normalizedResponse = {
          ok: true,
          data: parsed,
          error: null,
        };
      } else {
        // Treat as error response
        normalizedResponse = {
          ok: false,
          data: null,
          error: {
            message: parsed.message || parsed.error || 'API returned error',
            code: parsed.code || 'UNKNOWN_ERROR',
            httpStatus: response.status,
          },
        };
      }
    }

    // Add HTTP status to error object if present
    if (!normalizedResponse.ok && normalizedResponse.error) {
      if (!normalizedResponse.error.httpStatus) {
        normalizedResponse.error.httpStatus = response.status;
      }
    }

    // Final validation - ensure we have the right structure
    if (normalizedResponse.ok === undefined) {
      console.error('[fetchJson] Failed to normalize response:', parsed);
      return {
        ok: false,
        error: {
          message: 'Invalid API response format',
          code: 'INVALID_RESPONSE_FORMAT',
          httpStatus: response.status,
        },
      };
    }

    return normalizedResponse;

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
 * @param {number} httpStatus - HTTP status code (if available)
 * @returns {string} - User-friendly error message
 */
export function formatApiError(error, httpStatus = null) {
  // Handle case where error object is missing entirely
  if (!error) {
    if (httpStatus) {
      // Map HTTP status to user-friendly message
      const statusMessages = {
        400: 'Invalid request - please check your input',
        401: 'Missing or invalid API key - add your Anthropic API key in Settings',
        403: 'Not authorized - check your API key permissions',
        404: 'API endpoint not found - check server configuration',
        413: 'File too large - reduce file size or number of rows',
        429: 'Rate limited - please wait a moment and try again',
        500: 'Server error - please try again',
        502: 'Server unavailable - please try again',
        503: 'Service temporarily unavailable - please try again',
        504: 'Request timed out - please try again',
      };

      const statusMessage = statusMessages[httpStatus] || `Server error (HTTP ${httpStatus})`;
      console.error(`[formatApiError] No error object but HTTP ${httpStatus}`);
      return statusMessage;
    }

    console.error('[formatApiError] No error object and no HTTP status - check browser console for API response details');
    return 'Quote extraction failed - check browser console (F12) for details';
  }

  // Handle case where error is a string instead of object
  if (typeof error === 'string') {
    return error;
  }

  const { message, code, requestId, step, httpStatus: errorHttpStatus } = error;
  const status = httpStatus || errorHttpStatus;

  // Provide helpful context based on error code
  const codeMessages = {
    'MISSING_IMAGE': 'Please select a file to upload',
    'MISSING_API_KEY': 'Please add your Anthropic API key in Settings',
    'MISSING_BODY': 'Request error - please try again',
    'MISSING_ENV': 'Server configuration error',
    'PAYLOAD_TOO_LARGE': 'File is too large - reduce file size or number of rows',
    'ANTHROPIC_API_ERROR': 'AI service error',
    'EMPTY_RESPONSE': 'No response from AI',
    'EMPTY_EXTRACTION': 'No data extracted from document',
    'MODEL_RETURNED_NO_ITEMS': 'Model processed document but found no items',
    'PARSE_MODEL_OUTPUT': 'Could not parse model response',
    'PARSE_ERROR': 'Could not parse extracted data',
    'EXTRACTION_FAILED': 'Extraction failed',
    'TIMEOUT': 'Request timed out - please try again',
    'INVALID_JSON': 'Invalid server response format',
    'INVALID_RESPONSE': 'Invalid server response format',
    'NETWORK_ERROR': 'Network connection failed - check your connection',
    'UNAUTHENTICATED': 'Your session has expired - please sign in again',
    'FORBIDDEN_PATH': 'You do not have access to that file',
    'INVALID_BUCKET': 'Unknown storage location',
    'MISSING_FIELDS': 'Request is missing required information',
    'MISSING_TEXT': 'Paste some quote text first',
    'MISSING_PROMPT': 'Nothing to send to the AI',
    'STORAGE_ERROR': 'File storage error - please try again',
    'AI_REQUEST_FAILED': 'AI request failed - please try again',
    'NOT_FOUND': 'The requested item no longer exists',
    'DB_ERROR': 'Database error - please try again',
    'INVALID_FILE': 'That file type is not supported',
  };

  let contextMessage = codeMessages[code] || 'An error occurred';

  // Add HTTP status context if available
  if (status) {
    if (status === 401 && code === 'UNAUTHENTICATED') {
      contextMessage = 'Your session has expired - please sign in again';
    } else if (status === 401 || status === 403) {
      contextMessage = 'Missing or invalid API key - add your Anthropic API key in Settings';
    } else if (status === 429) {
      contextMessage = 'Rate limited by API - please wait a moment and try again';
    } else if (status === 413) {
      contextMessage = 'Request too large - reduce file size or number of rows';
    } else if (status >= 500) {
      contextMessage = 'Server error - please try again';
    }
  }

  // Build concise user-friendly message
  let fullMessage = `${contextMessage}`;

  // Add step information if available (helps with debugging)
  if (step && step !== 'unknown' && step !== 'start') {
    fullMessage += ` (step: ${step})`;
  }

  // Only add details if they provide value
  if (message && message !== contextMessage) {
    fullMessage += `\n\nDetails: ${message}`;
  }

  // Add HTTP status for debugging
  if (status && status !== 200) {
    fullMessage += `\n\nHTTP Status: ${status}`;
  }

  // Add request ID for support (if from server)
  if (requestId && requestId.startsWith('req_')) {
    fullMessage += `\nRequest ID: ${requestId}`;
  }

  return fullMessage;
}
