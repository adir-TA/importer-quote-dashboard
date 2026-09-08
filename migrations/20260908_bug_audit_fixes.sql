-- ============================================
-- BUG AUDIT FIXES MIGRATION (2026-09-08)
-- ============================================
-- Run this once in the Supabase SQL editor.
-- Every statement is idempotent and safe to re-run.
-- ============================================

-- --------------------------------------------
-- 1. Persist landed-cost fees and FX rates
--    (previously read from user_settings but never written)
-- --------------------------------------------
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS fees JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS fx_rates JSONB;

-- --------------------------------------------
-- 2. Missing DELETE policy on user_settings
-- --------------------------------------------
DROP POLICY IF EXISTS "Users can delete own settings" ON user_settings;
CREATE POLICY "Users can delete own settings" ON user_settings
  FOR DELETE USING (auth.uid() = user_id);

-- --------------------------------------------
-- 3. Legacy quotes table compatibility
--    The app still reads/writes `quotes_old`. Fresh installs from
--    schema.sql only ever created `quotes`, so the app broke on a new
--    deployment. Create the table if neither name exists.
-- --------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.quotes_old') IS NULL THEN
    IF to_regclass('public.quotes') IS NOT NULL THEN
      ALTER TABLE quotes RENAME TO quotes_old;
    ELSE
      CREATE TABLE quotes_old (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
        product_id uuid REFERENCES products(id) ON DELETE CASCADE,
        supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
        supplier_name text,
        fields jsonb DEFAULT '{}'::jsonb,
        tags text[] DEFAULT '{}',
        created_at timestamp with time zone DEFAULT now()
      );
    END IF;
  END IF;
END $$;

ALTER TABLE quotes_old ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own legacy quotes" ON quotes_old;
CREATE POLICY "Users can view own legacy quotes" ON quotes_old
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own legacy quotes" ON quotes_old;
CREATE POLICY "Users can insert own legacy quotes" ON quotes_old
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own legacy quotes" ON quotes_old;
CREATE POLICY "Users can update own legacy quotes" ON quotes_old
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own legacy quotes" ON quotes_old;
CREATE POLICY "Users can delete own legacy quotes" ON quotes_old
  FOR DELETE USING (auth.uid() = user_id);

-- --------------------------------------------
-- 4. documents.type check constraint
--    The upload modal wrote lowercase 'quote', which violated the
--    original CHECK (type IN ('PI','QUOTE','SPEC','OTHER')) and made
--    every auto-attach fail. Normalise existing rows and accept both
--    cases going forward.
-- --------------------------------------------
UPDATE documents SET type = upper(type) WHERE type <> upper(type);

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_type_check
  CHECK (upper(type) IN ('PI', 'QUOTE', 'SPEC', 'OTHER'));

-- --------------------------------------------
-- 5. Storage bucket for Buying Intent images
--    ProductDetail uploads product photos to a `business-cards`
--    bucket that no setup script ever created.
-- --------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-cards',
  'business-cards',
  true, -- public: product images are referenced by public URL in the UI
  5242880, -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own intent images" ON storage.objects;
CREATE POLICY "Users can upload own intent images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'business-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can update own intent images" ON storage.objects;
CREATE POLICY "Users can update own intent images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'business-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete own intent images" ON storage.objects;
CREATE POLICY "Users can delete own intent images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'business-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
