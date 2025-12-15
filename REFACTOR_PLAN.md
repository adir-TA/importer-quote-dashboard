# Multi-Item Quote Refactor Plan

## ✅ COMPLETED (Ready to Use)

### 1. Database Schema ✅
- Created `supplier_quotes` table (document-level)
- Created `quote_line_items` table (line-level)
- All logistics fields included (weight, packing, carton dims, CBM)
- Migration file ready: `migration_multi_item_quotes.sql`
- Updated `schema.sql` with new tables

**To Apply Migration:**
```sql
-- Run in Supabase SQL Editor
-- See: migration_multi_item_quotes.sql
```

### 2. AI Extraction ✅
- Updated `server.js` prompt to extract:
  - Document-level fields (supplier, currency, incoterm, dates)
  - ALL line items from quote table
  - Logistics fields for each line item
- Using Sonnet 4.5 model for accuracy
- Returns structured JSON with supplier + lineItems array

### 3. Data Models ✅
- Updated `quoteDataModels.js` with:
  - New logistics fields (weight_g, packing_pcs_per_ctn, carton dimensions, cbm_per_carton)
  - quoteDate field
  - Proper TypeScript typedefs

### 4. Extraction Service ✅
- Updated `quoteExtractionService.js` to:
  - Extract and map all new logistics fields
  - Handle quoteDate
  - Support multi-item extraction
  - Backwards compatible with legacy fields

### 5. Backend Functions ✅
- Created `addSupplierQuote()` in AppContext
- Saves supplier quote + all line items in one transaction
- Properly maps extracted fields to database schema
- Exported in AppContext actions

---

## 🚧 IN PROGRESS

### 6. QuoteUploadModal UI Refactor
**Current State:** Shows "select one item" flow (WRONG)
**Target State:** Review all items at once (CORRECT)

**Required Changes:**
1. Remove item selection step
2. Show supplier-level fields at top (editable)
3. Show ALL line items in an editable table:
   - Columns: Product Name, SKU, Unit Price, MOQ, Weight, Packing, Carton Dims, CBM
   - Inline editing for each cell
   - Optional: Link to Product dropdown per row
4. One "Confirm & Save Quote" button
5. Call `addSupplierQuote()` with all line items

**Files to Modify:**
- `src/components/QuoteUploadModal.jsx` (major refactor ~1000 lines)
- `src/hooks/useQuoteExtraction.js` (update to return all items, remove selection logic)

---

## 📋 TODO

### 7. Quote Comparison View
**Current State:** Shows quotes per product (old schema)
**Target State:** Shows line items grouped by supplier

**Required Changes:**
1. Query `quote_line_items` where `linked_product_id = productId`
2. Join with `supplier_quotes` to get supplier info
3. Display:
   - Group by supplier
   - Show unit_price, moq, logistics fields
   - Sort by unit_price or landed cost
4. Each row = one supplier's price for this product

**Files to Modify:**
- Product detail page quote comparison section
- May need new AppContext function: `getLineItemsForProduct(productId)`

### 8. End-to-End Testing
1. Run migration in Supabase
2. Upload multi-item quote (e.g., Tianjin Longstar 12-item quote)
3. Review: See all 12 items in table
4. Edit: Change prices, link to products
5. Save: Confirm 1 supplier_quote + 12 line_items saved
6. Compare: See line items grouped by supplier on product page

---

## 🎯 MVP Success Criteria

- [x] Schema supports multi-item quotes
- [x] AI extracts all line items with logistics
- [x] Backend can save supplier quotes with line items
- [ ] UI shows all items for review (no "select one")
- [ ] One confirmation saves entire quote
- [ ] Comparison shows line items by supplier

---

## 📝 Notes

### Backwards Compatibility
- Old `quotes` table renamed to `quotes_old` (backup)
- Old AppContext functions (addQuote, etc.) still work for manual quotes
- New schema is opt-in via QuoteUploadModal

### Data Migration
- No automatic migration of old quotes
- Users will naturally transition as they upload new quotes
- Old quotes remain in `quotes_old` table (can be dropped later)

### MVP Scope
- Focus on correctness, not polish
- Inline editing can be simple text inputs
- Product linking can be optional
- Mobile responsive not critical for v1

---

## 🚀 Next Steps

1. **Immediate:** Refactor QuoteUploadModal UI
   - Remove selection step
   - Build line items table with inline editing
   - Wire up to `addSupplierQuote()`

2. **Then:** Update comparison view
   - Query line items by product
   - Group by supplier
   - Display with landed cost

3. **Finally:** Test with real quote
   - Upload Tianjin Longstar quote
   - Verify all 12 items extracted
   - Save and compare

**Estimated remaining work:** 2-4 hours for QuoteUploadModal + comparison view refactor.
