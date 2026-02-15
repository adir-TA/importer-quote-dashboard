-- ============================================
-- Make supplier_quote_id optional on documents
-- ============================================
-- Documents should be linkable to a Buying Intent
-- without requiring a specific supplier.
-- The UI already treats supplier as optional.
-- ============================================

-- Drop NOT NULL constraint on supplier_quote_id
ALTER TABLE documents ALTER COLUMN supplier_quote_id DROP NOT NULL;
