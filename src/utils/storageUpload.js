// ============================================
// SUPABASE STORAGE UPLOAD HELPER
// ============================================
// One place for the "ask the backend for a signed URL, then PUT the file"
// dance. Previously this was copy-pasted into three components with no file
// validation and no auth header.

import API_BASE_URL from '../config/api.js';
import { fetchJson, formatApiError } from './apiHelpers.js';

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
export const DOCUMENT_MIME_TYPES = ['application/pdf', ...IMAGE_MIME_TYPES];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB - matches the bucket limit
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10MB - matches the bucket limit

/**
 * Extract a safe lowercase file extension.
 * A user-supplied filename can contain anything, including path separators.
 */
export function safeExtension(fileName, fallback = 'bin') {
  const raw = (fileName || '').split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,8}$/.test(raw) ? raw : fallback;
}

/**
 * Validate a file before uploading. Returns an error string, or null if OK.
 * The buckets enforce these limits too, but a clear client-side message beats
 * an opaque storage error after a long upload.
 */
export function validateFile(file, { allowedTypes, maxBytes, label = 'file' }) {
  if (!file) return `Please choose a ${label}.`;

  if (allowedTypes && !allowedTypes.includes(file.type)) {
    const readable = allowedTypes
      .map(t => t.split('/')[1].toUpperCase())
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', ');
    return `Unsupported ${label} type. Allowed: ${readable}.`;
  }

  if (maxBytes && file.size > maxBytes) {
    return `That ${label} is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${maxBytes / 1024 / 1024}MB.`;
  }

  if (file.size === 0) return `That ${label} is empty.`;

  return null;
}

/**
 * Upload a file to Supabase Storage via a backend-signed URL.
 *
 * The backend validates that `path` sits inside the caller's own folder, so
 * `path` must start with the user's id.
 *
 * @returns {Promise<{ path: string, publicUrl: string|null }>}
 */
export async function uploadToStorage({ bucket, path, file }) {
  const urlResult = await fetchJson(`${API_BASE_URL}/api/storage/create-upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, path }),
  });

  if (!urlResult.ok) {
    throw new Error(formatApiError(urlResult.error, urlResult.error?.httpStatus));
  }

  const { signedUrl, publicUrl } = urlResult.data || {};
  if (!signedUrl) {
    throw new Error('Storage did not return an upload URL');
  }

  // Direct to Supabase Storage - not through our API, so no size limit.
  const uploadResponse = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed (${uploadResponse.status})`);
  }

  return { path, publicUrl: publicUrl || null };
}

/**
 * Request a short-lived signed URL for reading a private document.
 */
export async function getDocumentSignedUrl(filePath) {
  const result = await fetchJson(`${API_BASE_URL}/api/documents/signed-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });

  if (!result.ok) {
    throw new Error(formatApiError(result.error, result.error?.httpStatus));
  }

  if (!result.data?.signedUrl) {
    throw new Error('No signed URL returned');
  }

  return result.data.signedUrl;
}

export default { uploadToStorage, getDocumentSignedUrl, validateFile, safeExtension };
