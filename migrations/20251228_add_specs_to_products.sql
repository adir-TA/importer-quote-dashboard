-- Migration: Add structured specifications to products table
-- Run this in Supabase SQL Editor

-- Add specs column as JSONB array
-- Format: [{ "key": "Weight", "value": "1.94kg" }, { "key": "Height", "value": "76cm" }, ...]
ALTER TABLE products
ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT '[]'::jsonb;

-- Keep description column for backwards compatibility
-- Existing records will continue to show description if specs is empty

-- Verify migration
-- SELECT id, name, specs, description FROM products LIMIT 5;
