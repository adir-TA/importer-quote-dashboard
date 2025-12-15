-- HA Tools Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Products table (Conceptually: BuyingIntents)
-- What the importer is trying to buy, independent of suppliers
create table products (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null, -- Human-readable target spec (e.g., "Aluminum container 225×175×42")
  category text,
  description text,
  created_at timestamp with time zone default now()
);

-- Suppliers table
create table suppliers (
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
create table supplier_quotes (
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
create table quote_line_items (
  id uuid primary key default uuid_generate_v4(),
  supplier_quote_id uuid references supplier_quotes(id) on delete cascade not null,
  raw_item_name text not null, -- Exact name from supplier quote
  sku text,
  product_dimensions_text text, -- Raw dimensions string
  unit_price numeric not null,
  price_unit text default 'per pc',
  moq integer,
  weight_g integer,
  packing_pcs_per_ctn integer,
  carton_length_cm numeric,
  carton_width_cm numeric,
  carton_height_cm numeric,
  cbm_per_carton numeric,
  extracted_confidence text,
  linked_buying_intent_id uuid references products(id) on delete set null, -- Human-assigned link
  created_at timestamp with time zone default now()
);

-- Orders table
create table orders (
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

-- Documents table
create table documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text,
  notes text,
  file_url text,
  file_size bigint,
  file_type text,
  created_at timestamp with time zone default now()
);

-- Settings table (per user)
create table user_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade unique,
  api_key text,
  currency text default 'USD',
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
alter table orders enable row level security;
alter table documents enable row level security;
alter table user_settings enable row level security;

-- Products policies
create policy "Users can view own products" on products for select using (auth.uid() = user_id);
create policy "Users can insert own products" on products for insert with check (auth.uid() = user_id);
create policy "Users can update own products" on products for update using (auth.uid() = user_id);
create policy "Users can delete own products" on products for delete using (auth.uid() = user_id);

-- Suppliers policies
create policy "Users can view own suppliers" on suppliers for select using (auth.uid() = user_id);
create policy "Users can insert own suppliers" on suppliers for insert with check (auth.uid() = user_id);
create policy "Users can update own suppliers" on suppliers for update using (auth.uid() = user_id);
create policy "Users can delete own suppliers" on suppliers for delete using (auth.uid() = user_id);

-- Supplier Quotes policies
create policy "Users can view own supplier quotes" on supplier_quotes for select using (auth.uid() = user_id);
create policy "Users can insert own supplier quotes" on supplier_quotes for insert with check (auth.uid() = user_id);
create policy "Users can update own supplier quotes" on supplier_quotes for update using (auth.uid() = user_id);
create policy "Users can delete own supplier quotes" on supplier_quotes for delete using (auth.uid() = user_id);

-- Quote Line Items policies (inherit permissions from parent quote)
create policy "Users can view line items of own quotes" on quote_line_items for select
  using (exists (select 1 from supplier_quotes where supplier_quotes.id = quote_line_items.supplier_quote_id and supplier_quotes.user_id = auth.uid()));
create policy "Users can insert line items to own quotes" on quote_line_items for insert
  with check (exists (select 1 from supplier_quotes where supplier_quotes.id = quote_line_items.supplier_quote_id and supplier_quotes.user_id = auth.uid()));
create policy "Users can update line items of own quotes" on quote_line_items for update
  using (exists (select 1 from supplier_quotes where supplier_quotes.id = quote_line_items.supplier_quote_id and supplier_quotes.user_id = auth.uid()));
create policy "Users can delete line items of own quotes" on quote_line_items for delete
  using (exists (select 1 from supplier_quotes where supplier_quotes.id = quote_line_items.supplier_quote_id and supplier_quotes.user_id = auth.uid()));

-- Orders policies
create policy "Users can view own orders" on orders for select using (auth.uid() = user_id);
create policy "Users can insert own orders" on orders for insert with check (auth.uid() = user_id);
create policy "Users can update own orders" on orders for update using (auth.uid() = user_id);
create policy "Users can delete own orders" on orders for delete using (auth.uid() = user_id);

-- Documents policies
create policy "Users can view own documents" on documents for select using (auth.uid() = user_id);
create policy "Users can insert own documents" on documents for insert with check (auth.uid() = user_id);
create policy "Users can update own documents" on documents for update using (auth.uid() = user_id);
create policy "Users can delete own documents" on documents for delete using (auth.uid() = user_id);

-- User settings policies
create policy "Users can view own settings" on user_settings for select using (auth.uid() = user_id);
create policy "Users can insert own settings" on user_settings for insert with check (auth.uid() = user_id);
create policy "Users can update own settings" on user_settings for update using (auth.uid() = user_id);
