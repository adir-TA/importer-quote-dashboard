-- ============================================
-- COMPLETE STORAGE FIX FOR BUSINESS-CARDS BUCKET
-- ============================================
-- This script fixes the "new row violates row-level security policy" error
-- when uploading images to buying intents during edit operations.
--
-- ROOT CAUSE: Missing or incorrect INSERT policy on storage.objects
--
-- EXECUTE THIS ENTIRE SCRIPT IN SUPABASE SQL EDITOR
-- ============================================

-- STEP 1: Verify bucket exists (create if missing)
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-cards',
  'business-cards',
  false, -- PRIVATE bucket (not public)
  10485760, -- 10MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

-- STEP 2: Drop ALL existing policies to ensure clean state
-- ============================================
-- This prevents conflicts and ensures we start fresh

DROP POLICY IF EXISTS "Users can upload their own card images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own card images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own card images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own card images" ON storage.objects;

-- Also drop any variations that might exist
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;

-- Drop any policies for business-cards bucket (catch-all)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname LIKE '%business-cards%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- STEP 3: Create correct INSERT policy (THIS IS THE CRITICAL ONE)
-- ============================================
-- This policy allows authenticated users to upload (INSERT) images
-- to their own folder in the business-cards bucket

CREATE POLICY "business-cards: authenticated users can insert"
  ON storage.objects
  FOR INSERT
  TO authenticated  -- EXPLICIT: only authenticated users
  WITH CHECK (
    -- Must be business-cards bucket
    bucket_id = 'business-cards'
    AND
    -- First folder in path must be user's ID
    -- Path format: {user_id}/products/{filename} or {user_id}/cards/{filename}
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- STEP 4: Create SELECT policy (view/download images)
-- ============================================
CREATE POLICY "business-cards: authenticated users can select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'business-cards'
    AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- STEP 5: Create UPDATE policy (replace existing images)
-- ============================================
CREATE POLICY "business-cards: authenticated users can update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'business-cards'
    AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'business-cards'
    AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- STEP 6: Create DELETE policy (remove images)
-- ============================================
CREATE POLICY "business-cards: authenticated users can delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business-cards'
    AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- STEP 7: Verification queries
-- ============================================
-- Run these to verify policies were created correctly

-- Check bucket exists
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'business-cards';

-- Check all policies for storage.objects related to business-cards
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    policyname LIKE '%business-cards%'
    OR policyname LIKE '%card%'
  )
ORDER BY policyname;

-- EXPECTED OUTPUT:
-- You should see 4 policies:
-- 1. business-cards: authenticated users can insert (FOR INSERT)
-- 2. business-cards: authenticated users can select (FOR SELECT)
-- 3. business-cards: authenticated users can update (FOR UPDATE)
-- 4. business-cards: authenticated users can delete (FOR DELETE)

-- ============================================
-- CRITICAL VERIFICATION CHECKLIST
-- ============================================
-- After running this script, verify:
-- ✅ Bucket 'business-cards' exists and is PRIVATE (public = false)
-- ✅ 4 policies exist on storage.objects
-- ✅ INSERT policy applies to role 'authenticated'
-- ✅ INSERT policy checks: bucket_id = 'business-cards'
-- ✅ INSERT policy checks: first folder = auth.uid()
-- ✅ No policies are overly restrictive (e.g., checking owner_id that doesn't exist)
--
-- PATH STRUCTURE USED IN APP:
-- {user_id}/products/{uuid}.{ext}  (buying intents)
-- {user_id}/cards/{uuid}.{ext}     (business cards)
--
-- POLICY LOGIC:
-- (storage.foldername(name))[1] extracts first folder from path
-- This must equal auth.uid()::text (authenticated user's ID)
-- ============================================
