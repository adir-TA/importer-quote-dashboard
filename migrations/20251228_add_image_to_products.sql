-- Migration: Add image fields to products table for Buying Intent images
-- Run this in Supabase SQL Editor

-- Add image_storage_path and image_url columns
ALTER TABLE products
ADD COLUMN IF NOT EXISTS image_storage_path text,
ADD COLUMN IF NOT EXISTS image_url text;

-- Note: Both fields are nullable (images are optional)
-- image_storage_path: internal Supabase storage path
-- image_url: public URL for the image

-- Verify migration
-- SELECT id, name, image_storage_path, image_url FROM products LIMIT 5;
