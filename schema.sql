-- HA Tools Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Products table
create table products (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
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

-- Quotes table
create table quotes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text,
  fields jsonb default '{}',
  tags text[] default '{}',
  notes text,
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
alter table quotes enable row level security;
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

-- Quotes policies
create policy "Users can view own quotes" on quotes for select using (auth.uid() = user_id);
create policy "Users can insert own quotes" on quotes for insert with check (auth.uid() = user_id);
create policy "Users can update own quotes" on quotes for update using (auth.uid() = user_id);
create policy "Users can delete own quotes" on quotes for delete using (auth.uid() = user_id);

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
