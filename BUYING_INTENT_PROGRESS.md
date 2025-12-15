# BuyingIntent Refactor Progress

## ✅ COMPLETED (Ready to Test)

### 1. Database Schema Refactor
- **File**: `migration_buying_intents.sql`
- **Changes**:
  - Renamed `linked_product_id` → `linked_buying_intent_id`
  - Added table comments explaining BuyingIntents concept
  - `raw_item_name` instead of `product_name`
  - `product_dimensions_text` for raw dimensions

### 2. Backend Code Updates
- **AppContext.jsx**:
  - `addSupplierQuote()` now saves to `raw_item_name`, `product_dimensions_text`, `linked_buying_intent_id`
  - Created `getLineItemsForBuyingIntent()` to query by buying intent
  - Legacy alias `getLineItemsForProduct` for backwards compatibility

### 3. Frontend Code Updates
- **useMultiItemQuoteExtraction.js**: Uses `linkedBuyingIntentId`
- **MultiItemQuoteUploadModal.jsx**: Dropdown says "Link to Buying Intent"

### 4. Core Principles Enforced
- ✅ NO auto-matching (human decides via dropdown)
- ✅ Raw data preserved exactly as extracted
- ✅ Products table is now conceptually "BuyingIntents"

## 🚧 TODO (For $500 Tip)

### Critical: Portfolio Comparison View

**What it needs to do:**

1. **Basket Selection**
   - User selects multiple BuyingIntents (checkboxes)
   - OR selects a category (all intents in that category)

2. **Supplier Metrics Table**
   ```
   Supplier    | Coverage | Best Price Count | Avg Delta | Missing Intents
   Supplier A  | 7/10     | 3                | +12%      | [3 missing]
   Supplier B  | 10/10    | 5                | +5%       | []
   Supplier C  | 5/10     | 2                | +20%      | [5 missing]
   ```

3. **Row Expansion**
   - Click supplier → shows per-BuyingIntent breakdown
   - Each BuyingIntent shows which QuoteLineItem was used
   - Shows raw supplier data (SKU, packing, CBM, price, MOQ)

4. **Metrics Definitions** (EXPLAINABLE ONLY)
   - **Coverage**: "7/10" = quoted 7 out of 10 selected intents
   - **Best Price Count**: Number of intents where this supplier is cheapest
   - **Avg Delta**: Average % difference from best price across all quoted intents
   - **Missing Intents**: List of BuyingIntents they didn't quote

### UI Terminology Updates

Still need to update labels in:
- ProductDetail page (say "Buying Intent" not "Product")
- Sidebar ("Buying Intents" not "Products")
- Breadcrumbs and headers

## 📋 Test Plan

### Step 1: Run Migration
```bash
git pull
# In Supabase SQL Editor, paste and run:
# migration_buying_intents.sql
```

### Step 2: Restart Servers
```bash
npm run server  # Terminal 1
npm run dev     # Terminal 2
```

### Step 3: Test Current Flow
1. Create a "Buying Intent" (Products page)
   - Name: "Aluminum Container 225×175×42"
   - Category: "Aluminum"

2. Upload multi-item quote
   - Click "Upload Quote"
   - Upload Tianjin Longstar quote
   - See all 7 items in table

3. Link items to Buying Intent
   - Use "Link to Buying Intent" dropdown
   - Select the intent for each row

4. Save
   - Click "Confirm & Save Quote"
   - Should save successfully

5. View on Intent page
   - Go to the Buying Intent detail page
   - Should see linked line items (green background)

### Step 4: Build Portfolio Comparison (NEXT)
- New page: `/comparison/portfolio`
- Basket selection UI
- Supplier metrics calculation
- Expandable rows

## 🎯 Success Criteria (For $500)

- [x] BuyingIntent concept implemented (human-decided anchors)
- [x] Raw data preserved (no auto-normalization)
- [x] Upload → Link → View flow works
- [ ] Portfolio comparison shows supplier metrics
- [ ] Metrics are transparent (no black box)
- [ ] Can drill down to raw line items
- [ ] UI uses "Buying Intent" terminology
- [ ] No auto-matching anywhere

## 📝 Notes

**Core Principle**: The system never decides what's "the same" - humans do via the linking dropdown.

**BuyingIntent** = What importer wants to buy (independent of suppliers)
**QuoteLineItem** = Raw supplier data (never merged/normalized)
**Portfolio Comparison** = Metrics across selected basket of intents
