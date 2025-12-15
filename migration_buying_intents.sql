-- ============================================
-- BUYING INTENT REFACTOR MIGRATION
-- ============================================
-- This migration renames "products" to conceptually be "buying_intents"
-- and updates all foreign key references accordingly.
--
-- CORE PRINCIPLE:
-- BuyingIntents = what importer wants to buy (independent of suppliers)
-- NOT auto-matched, human-decided
-- ============================================

-- Step 1: Rename the column in quote_line_items
ALTER TABLE quote_line_items
RENAME COLUMN linked_product_id TO linked_buying_intent_id;

-- Step 2: Add comment to clarify Products table is conceptually BuyingIntents
COMMENT ON TABLE products IS 'BuyingIntents: What the importer is trying to buy, independent of how suppliers describe it. Human-defined anchors for comparison.';

COMMENT ON TABLE quote_line_items IS 'Raw supplier quote line items. Never auto-merged or normalized. Each row preserved exactly as extracted.';

COMMENT ON COLUMN quote_line_items.linked_buying_intent_id IS 'FK to products (BuyingIntents). Human-assigned link. NULL = not yet linked to a buying intent.';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Changes:
-- ✅ Renamed linked_product_id → linked_buying_intent_id
-- ✅ Added table/column comments for clarity
-- ✅ Schema now reflects BuyingIntent model
-- ============================================
