-- Migration: Add status field to products table for draft/finalized Buying Intents
-- Run this in Supabase SQL Editor

-- Step 1: Add status column with default 'draft'
ALTER TABLE products
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft' CHECK (status IN ('draft', 'finalized'));

-- Step 2: Set all existing products to 'finalized' (backward compatible)
-- This ensures existing Buying Intents continue to work as before
UPDATE products
SET status = 'finalized'
WHERE status IS NULL OR status = 'draft';

-- Step 3: Add index for performance when filtering by status
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- Step 4: Verify migration
-- SELECT name, status, created_at FROM products ORDER BY created_at DESC LIMIT 10;
