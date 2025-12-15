-- ============================================
-- MULTI-ITEM QUOTE REFACTOR MIGRATION
-- ============================================
-- This migration creates the proper schema for multi-item supplier quotes
--
-- BEFORE: One quote = one product (WRONG)
-- AFTER:  One supplier_quote = many line_items (CORRECT)
--
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Rename old quotes table to quotes_old (backup)
alter table if exists quotes rename to quotes_old;

-- Step 2: Create supplier_quotes table (document-level)
create table supplier_quotes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,

  -- Supplier info
  supplier_name text not null,
  supplier_contact text,
  supplier_email text,

  -- Quote-level details
  currency text default 'USD',
  incoterm text,
  quote_date date,
  valid_until date,
  payment_terms text,
  lead_time text,
  notes text,

  -- Document metadata
  original_file_url text,
  original_file_name text,
  file_type text,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Step 3: Create quote_line_items table (line-level)
create table quote_line_items (
  id uuid primary key default uuid_generate_v4(),
  supplier_quote_id uuid references supplier_quotes(id) on delete cascade not null,

  -- Product identification
  product_name text not null,
  sku text,

  -- Pricing (CRITICAL for comparison)
  unit_price numeric not null,
  price_unit text default 'per pc',
  moq integer,

  -- Logistics (CRITICAL for landed cost)
  weight_g integer,
  packing_pcs_per_ctn integer,
  carton_length_cm numeric,
  carton_width_cm numeric,
  carton_height_cm numeric,
  cbm_per_carton numeric,

  -- Raw extraction data (for reference)
  dimensions_text text,
  extracted_confidence text, -- 'high' | 'medium' | 'low'

  -- Product linking (for comparison)
  linked_product_id uuid references products(id) on delete set null,

  created_at timestamp with time zone default now()
);

-- Step 4: Create indexes for performance
create index idx_supplier_quotes_user_id on supplier_quotes(user_id);
create index idx_supplier_quotes_created_at on supplier_quotes(created_at desc);
create index idx_quote_line_items_supplier_quote_id on quote_line_items(supplier_quote_id);
create index idx_quote_line_items_linked_product_id on quote_line_items(linked_product_id);

-- Step 5: Enable Row Level Security
alter table supplier_quotes enable row level security;
alter table quote_line_items enable row level security;

-- Step 6: Create RLS policies for supplier_quotes
create policy "Users can view own supplier quotes"
  on supplier_quotes for select
  using (auth.uid() = user_id);

create policy "Users can insert own supplier quotes"
  on supplier_quotes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own supplier quotes"
  on supplier_quotes for update
  using (auth.uid() = user_id);

create policy "Users can delete own supplier quotes"
  on supplier_quotes for delete
  using (auth.uid() = user_id);

-- Step 7: Create RLS policies for quote_line_items
-- Line items inherit permissions from their parent supplier_quote
create policy "Users can view line items of own quotes"
  on quote_line_items for select
  using (
    exists (
      select 1 from supplier_quotes
      where supplier_quotes.id = quote_line_items.supplier_quote_id
      and supplier_quotes.user_id = auth.uid()
    )
  );

create policy "Users can insert line items to own quotes"
  on quote_line_items for insert
  with check (
    exists (
      select 1 from supplier_quotes
      where supplier_quotes.id = quote_line_items.supplier_quote_id
      and supplier_quotes.user_id = auth.uid()
    )
  );

create policy "Users can update line items of own quotes"
  on quote_line_items for update
  using (
    exists (
      select 1 from supplier_quotes
      where supplier_quotes.id = quote_line_items.supplier_quote_id
      and supplier_quotes.user_id = auth.uid()
    )
  );

create policy "Users can delete line items of own quotes"
  on quote_line_items for delete
  using (
    exists (
      select 1 from supplier_quotes
      where supplier_quotes.id = quote_line_items.supplier_quote_id
      and supplier_quotes.user_id = auth.uid()
    )
  );

-- Step 8: Create updated_at trigger for supplier_quotes
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_supplier_quotes_updated_at
  before update on supplier_quotes
  for each row
  execute function update_updated_at_column();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
--
-- What happened:
-- ✅ Old quotes table renamed to quotes_old (backup)
-- ✅ Created supplier_quotes (document-level)
-- ✅ Created quote_line_items (line-level)
-- ✅ Added proper indexes for performance
-- ✅ Enabled RLS with proper policies
--
-- Next steps:
-- 1. Update frontend to use new schema
-- 2. Test quote upload flow
-- 3. Once confirmed working, drop quotes_old table:
--    DROP TABLE quotes_old;
-- ============================================
