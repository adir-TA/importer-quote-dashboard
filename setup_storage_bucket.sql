-- ============================================
-- SUPABASE STORAGE BUCKET SETUP
-- ============================================
-- Creates private bucket for document storage
-- ============================================

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false, -- Private bucket
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the bucket
-- Users can only access their own files

-- Policy: Users can upload their own documents
CREATE POLICY "Users can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can view their own documents
CREATE POLICY "Users can view own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own documents
CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);


-- ============================================
-- BUYING INTENT IMAGE BUCKET
-- ============================================
-- Buying Intent photos are uploaded here by ProductDetail.jsx and referenced
-- in the UI by public URL. Historically this bucket had no setup script, so
-- image upload failed on every fresh deployment.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-cards',
  'business-cards',
  true, -- Public: images are rendered from a public URL
  5242880, -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Only the owning user may write into their own folder
CREATE POLICY "Users can upload own intent images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'business-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own intent images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'business-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own intent images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'business-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- SETUP COMPLETE
-- ============================================
-- What this creates:
-- ✅ Private 'documents' bucket with 10MB limit
-- ✅ Only PDF and image files allowed
-- ✅ RLS policies - users can only access their own files
-- ✅ Folder structure: documents/{user_id}/...
-- ✅ Public 'business-cards' bucket for Buying Intent images (5MB, images only)
-- ============================================
