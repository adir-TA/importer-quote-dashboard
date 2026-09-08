-- HA Tools Database Schema (consolidated, current)
-- Run this in the Supabase SQL Editor on a fresh project.
--
-- This file is the single source of truth for a NEW install. It already
-- includes every change from the migration_*.sql / migrations/ files, so a
-- fresh project does NOT need to replay them.
--
-- For an EXISTING project, run the incremental files in migrations/ instead.

create extension if not exists "uuid-ossp";

-- =====================
-- TABLES
-- =====================

-- Products table (conceptually: BuyingIntents)
-- What the importer is trying to buy, independent of suppliers
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null, -- Human-readable target spec (e.g., "Aluminum container 225x175x42")
  category text,
  description text,
  status text default 'draft' check (status in ('draft', 'finalized')),
  specs jsonb default '[]'::jsonb,
  image_storage_path text,
  image_url text,
  created_at timestamp with time zone default now()
);
create index if not exists idx_products_status on products(status);

-- Suppliers table
create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  company text not null,
  contact text,
  email text,
  wechat text,
  website text,
  status text default 'pending',
  notes text,
  created_at timestamp with time zone default now()
);

-- Supplier Quotes table (document-level)
create table if not exists supplier_quotes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  supplier_name text not null,
  supplier_contact text,
  supplier_email text,
  currency text default 'USD',
  incoterm text,
  quote_date date,
  valid_until date,
  payment_terms text,
  lead_time text,
  notes text,
  original_file_url text,
  original_file_name text,
  file_type text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Quote Line Items table (raw supplier data - never auto-normalized)
-- NOTE: column names here must match src/context/AppContext.jsx addSupplierQuote().
create table if not exists quote_line_items (
  id uuid primary key default uuid_generate_v4(),
  supplier_quote_id uuid references supplier_quotes(id) on delete cascade not null,
  product_name text not null, -- Exact name from the supplier quote
  sku text,
  unit_price numeric not null,
  price_unit text default 'per pc',
  moq integer,
  weight_g integer,
  packing_pcs_per_ctn integer,
  carton_length_cm numeric,
  carton_width_cm numeric,
  carton_height_cm numeric,
  cbm_per_carton numeric,
  dimensions_text text, -- Raw dimensions string
  extracted_confidence text, -- 'high' | 'medium' | 'low'
  linked_buying_intent_id uuid references products(id) on delete set null,
  created_at timestamp with time zone default now()
);
create index if not exists idx_line_items_quote on quote_line_items(supplier_quote_id);
create index if not exists idx_line_items_intent on quote_line_items(linked_buying_intent_id);

-- Legacy single-item quotes.
-- Superseded by supplier_quotes + quote_line_items, but the app still reads
-- and writes this table so historical quotes stay visible. Do not drop it
-- while src/context/AppContext.jsx still references 'quotes_old'.
create table if not exists quotes_old (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text,
  fields jsonb default '{}'::jsonb,
  tags text[] default '{}',
  created_at timestamp with time zone default now()
);

-- Orders table
create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  supplier text,
  status text default 'pending',
  quantity text,
  total text,
  notes text,
  created_at timestamp with time zone default now()
);

-- Documents table (Supabase Storage backed)
create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  buying_intent_id uuid references products(id) on delete cascade not null,
  supplier_quote_id uuid references supplier_quotes(id) on delete cascade,
  quote_line_item_id uuid references quote_line_items(id) on delete set null,
  file_path text not null, -- Path in the private 'documents' storage bucket
  file_name text not null,
  file_type text not null, -- mime type
  file_size integer,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint documents_type_check check (upper(type) in ('PI', 'QUOTE', 'SPEC', 'OTHER'))
);
create index if not exists idx_documents_user_id on documents(user_id);
create index if not exists idx_documents_buying_intent_id on documents(buying_intent_id);
create index if not exists idx_documents_supplier_quote_id on documents(supplier_quote_id);
create index if not exists idx_documents_created_at on documents(created_at desc);

-- Settings table (per user)
create table if not exists user_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade unique,
  api_key text, -- Anthropic key. Never selected by the browser; see server.js.
  -- Lets the client know a key exists without ever receiving its value
  has_api_key boolean generated always as (api_key is not null and api_key <> '') stored,
  currency text default 'USD', -- Base currency used for cross-currency comparison
  fees jsonb, -- Landed-cost fee rows
  fx_rates jsonb, -- User-editable FX rates, relative to USD
  created_at timestamp with time zone default now()
);

-- =====================
-- ROW LEVEL SECURITY
-- =====================
-- This ensures users can ONLY see their own data

alter table products enable row level security;
alter table suppliers enable row level security;
alter table supplier_quotes enable row level security;
alter table quote_line_items enable row level security;
alter table quotes_old enable row level security;
alter table orders enable row level security;
alter table documents enable row level security;
alter table user_settings enable row level security;

-- Products policies
drop policy if exists "Users can view own products" on products;
create policy "Users can view own products" on products for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own products" on products;
create policy "Users can insert own products" on products for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own products" on products;
create policy "Users can update own products" on products for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own products" on products;
create policy "Users can delete own products" on products for delete using (auth.uid() = user_id);

-- Suppliers policies
drop policy if exists "Users can view own suppliers" on suppliers;
create policy "Users can view own suppliers" on suppliers for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own suppliers" on suppliers;
create policy "Users can insert own suppliers" on suppliers for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own suppliers" on suppliers;
create policy "Users can update own suppliers" on suppliers for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own suppliers" on suppliers;
create policy "Users can delete own suppliers" on suppliers for delete using (auth.uid() = user_id);

-- Supplier Quotes policies
drop policy if exists "Users can view own supplier quotes" on supplier_quotes;
create policy "Users can view own supplier quotes" on supplier_quotes for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own supplier quotes" on supplier_quotes;
create policy "Users can insert own supplier quotes" on supplier_quotes for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own supplier quotes" on supplier_quotes;
create policy "Users can update own supplier quotes" on supplier_quotes for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own supplier quotes" on supplier_quotes;
create policy "Users can delete own supplier quotes" on supplier_quotes for delete using (auth.uid() = user_id);

-- Quote Line Items policies (inherit permissions from parent quote)
drop policy if exists "Users can view line items of own quotes" on quote_line_items;
create policy "Users can view line items of own quotes" on quote_line_items for select
  using (exists (select 1 from supplier_quotes where supplier_quotes.id = quote_line_items.supplier_quote_id and supplier_quotes.user_id = auth.uid()));
drop policy if exists "Users can insert line items to own quotes" on quote_line_items;
create policy "Users can insert line items to own quotes" on quote_line_items for insert
  with check (exists (select 1 from supplier_quotes where supplier_quotes.id = quote_line_items.supplier_quote_id and supplier_quotes.user_id = auth.uid()));
drop policy if exists "Users can update line items of own quotes" on quote_line_items;
create policy "Users can update line items of own quotes" on quote_line_items for update
  using (exists (select 1 from supplier_quotes where supplier_quotes.id = quote_line_items.supplier_quote_id and supplier_quotes.user_id = auth.uid()));
drop policy if exists "Users can delete line items of own quotes" on quote_line_items;
create policy "Users can delete line items of own quotes" on quote_line_items for delete
  using (exists (select 1 from supplier_quotes where supplier_quotes.id = quote_line_items.supplier_quote_id and supplier_quotes.user_id = auth.uid()));

-- Legacy quotes policies
drop policy if exists "Users can view own legacy quotes" on quotes_old;
create policy "Users can view own legacy quotes" on quotes_old for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own legacy quotes" on quotes_old;
create policy "Users can insert own legacy quotes" on quotes_old for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own legacy quotes" on quotes_old;
create policy "Users can update own legacy quotes" on quotes_old for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own legacy quotes" on quotes_old;
create policy "Users can delete own legacy quotes" on quotes_old for delete using (auth.uid() = user_id);

-- Orders policies
drop policy if exists "Users can view own orders" on orders;
create policy "Users can view own orders" on orders for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own orders" on orders;
create policy "Users can insert own orders" on orders for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own orders" on orders;
create policy "Users can update own orders" on orders for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own orders" on orders;
create policy "Users can delete own orders" on orders for delete using (auth.uid() = user_id);

-- Documents policies
drop policy if exists "Users can view own documents" on documents;
create policy "Users can view own documents" on documents for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own documents" on documents;
create policy "Users can insert own documents" on documents for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own documents" on documents;
create policy "Users can update own documents" on documents for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own documents" on documents;
create policy "Users can delete own documents" on documents for delete using (auth.uid() = user_id);

-- User settings policies
drop policy if exists "Users can view own settings" on user_settings;
create policy "Users can view own settings" on user_settings for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own settings" on user_settings;
create policy "Users can insert own settings" on user_settings for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own settings" on user_settings;
create policy "Users can update own settings" on user_settings for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own settings" on user_settings;
create policy "Users can delete own settings" on user_settings for delete using (auth.uid() = user_id);

-- =====================
-- NEXT STEP
-- =====================
-- Run setup_storage_bucket.sql to create the storage buckets and their policies.
