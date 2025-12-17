-- ============================================
-- DOCUMENTS STORAGE MIGRATION
-- ============================================
-- Migrate from base64 storage to Supabase Storage
-- ============================================

-- Drop the old file_url column and add file_path
ALTER TABLE documents DROP COLUMN IF EXISTS file_url;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path TEXT NOT NULL DEFAULT '';

-- Update column comments for clarity
COMMENT ON COLUMN documents.file_path IS 'Path to file in Supabase Storage (e.g., suppliers/{id}/document.pdf)';
COMMENT ON COLUMN documents.file_name IS 'Original filename';
COMMENT ON COLUMN documents.file_type IS 'MIME type (e.g., application/pdf, image/png)';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Changes:
-- ✅ Removed file_url (base64) column
-- ✅ Added file_path (storage path) column
-- ============================================
