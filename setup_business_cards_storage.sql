-- ============================================
-- SUPABASE STORAGE BUCKET SETUP FOR BUSINESS CARDS
-- ============================================
-- Creates private bucket for business card and buying intent images
-- Includes RLS policies for secure user-scoped access
-- ============================================

-- Create storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-cards',
  'business-cards',
  false, -- Private bucket
  10485760, -- 10MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STORAGE RLS POLICIES
-- ============================================
-- Path structure: business-cards/{user_id}/products/{filename}
-- Path structure: business-cards/{user_id}/cards/{filename}
-- Only authenticated users can access their own files
-- ============================================

-- Drop existing policies if they exist (for clean re-run)
DROP POLICY IF EXISTS "Users can upload their own card images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own card images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own card images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own card images" ON storage.objects;

-- Policy: Users can INSERT (upload) their own images
CREATE POLICY "Users can upload their own card images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'business-cards' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can SELECT (view) their own images
CREATE POLICY "Users can view their own card images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'business-cards' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can UPDATE (replace) their own images
CREATE POLICY "Users can update their own card images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'business-cards' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'business-cards' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can DELETE their own images
CREATE POLICY "Users can delete their own card images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'business-cards' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================
-- SETUP COMPLETE
-- ============================================
-- What this creates:
-- ✅ Private 'business-cards' bucket with 10MB limit
-- ✅ Only image files allowed (PNG, JPEG, WebP)
-- ✅ RLS policies - users can only access their own files
-- ✅ INSERT policy - users can upload images to their folder
-- ✅ SELECT policy - users can view their own images
-- ✅ UPDATE policy - users can replace their own images
-- ✅ DELETE policy - users can delete their own images
-- ✅ Folder structure: business-cards/{user_id}/products/...
-- ✅ RLS remains enabled - security maintained
-- ============================================
