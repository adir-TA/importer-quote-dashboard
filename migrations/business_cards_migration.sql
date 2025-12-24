-- Business Cards CRM Migration
-- This migration creates all necessary tables for the Business Cards feature
-- All tables are user-scoped with RLS policies

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- 1. Card Categories Table
create table card_categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  color text default '#3b82f6',
  created_at timestamp with time zone default now(),
  unique(user_id, name)
);

-- RLS for card_categories
alter table card_categories enable row level security;

create policy "Users can view their own card categories"
  on card_categories for select
  using (auth.uid() = user_id);

create policy "Users can insert their own card categories"
  on card_categories for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own card categories"
  on card_categories for update
  using (auth.uid() = user_id);

create policy "Users can delete their own card categories"
  on card_categories for delete
  using (auth.uid() = user_id);

-- 2. Business Cards Table
create table business_cards (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  category_id uuid references card_categories(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  display_name text not null,
  company_name text,
  contact_person text,
  phone text,
  wechat text,
  email text,
  website text,
  notes text,
  status text default 'new' check (status in ('new', 'contacted', 'accepted', 'rejected', 'inactive')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- RLS for business_cards
alter table business_cards enable row level security;

create policy "Users can view their own business cards"
  on business_cards for select
  using (auth.uid() = user_id);

create policy "Users can insert their own business cards"
  on business_cards for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own business cards"
  on business_cards for update
  using (auth.uid() = user_id);

create policy "Users can delete their own business cards"
  on business_cards for delete
  using (auth.uid() = user_id);

-- 3. Business Card Images Table
create table business_card_images (
  id uuid primary key default uuid_generate_v4(),
  card_id uuid references business_cards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  storage_path text not null,
  file_name text not null,
  sort_order integer default 0,
  created_at timestamp with time zone default now()
);

-- RLS for business_card_images
alter table business_card_images enable row level security;

create policy "Users can view their own card images"
  on business_card_images for select
  using (auth.uid() = user_id);

create policy "Users can insert their own card images"
  on business_card_images for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own card images"
  on business_card_images for update
  using (auth.uid() = user_id);

create policy "Users can delete their own card images"
  on business_card_images for delete
  using (auth.uid() = user_id);

-- 4. Business Card Tags Table
create table business_card_tags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default now(),
  unique(user_id, name)
);

-- RLS for business_card_tags
alter table business_card_tags enable row level security;

create policy "Users can view their own card tags"
  on business_card_tags for select
  using (auth.uid() = user_id);

create policy "Users can insert their own card tags"
  on business_card_tags for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own card tags"
  on business_card_tags for update
  using (auth.uid() = user_id);

create policy "Users can delete their own card tags"
  on business_card_tags for delete
  using (auth.uid() = user_id);

-- 5. Business Card Tag Mapping Table (Many-to-Many)
create table business_card_tag_map (
  card_id uuid references business_cards(id) on delete cascade not null,
  tag_id uuid references business_card_tags(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default now(),
  primary key (card_id, tag_id)
);

-- RLS for business_card_tag_map
alter table business_card_tag_map enable row level security;

create policy "Users can view their own card tag mappings"
  on business_card_tag_map for select
  using (auth.uid() = user_id);

create policy "Users can insert their own card tag mappings"
  on business_card_tag_map for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own card tag mappings"
  on business_card_tag_map for delete
  using (auth.uid() = user_id);

-- Indexes for performance
create index idx_business_cards_user_id on business_cards(user_id);
create index idx_business_cards_category_id on business_cards(category_id);
create index idx_business_cards_status on business_cards(status);
create index idx_business_cards_email on business_cards(email);
create index idx_business_cards_wechat on business_cards(wechat);
create index idx_business_cards_phone on business_cards(phone);
create index idx_card_categories_user_id on card_categories(user_id);
create index idx_card_images_card_id on business_card_images(card_id);
create index idx_card_tags_user_id on business_card_tags(user_id);
create index idx_card_tag_map_card_id on business_card_tag_map(card_id);
create index idx_card_tag_map_tag_id on business_card_tag_map(tag_id);

-- STORAGE SETUP INSTRUCTIONS:
-- Run these commands in Supabase SQL Editor:
--
-- 1. Create storage bucket (if not exists):
-- insert into storage.buckets (id, name, public)
-- values ('business-cards', 'business-cards', false)
-- on conflict (id) do nothing;
--
-- 2. Set up storage policies:
-- create policy "Users can upload their own card images"
--   on storage.objects for insert
--   with check (
--     bucket_id = 'business-cards' and
--     (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- create policy "Users can view their own card images"
--   on storage.objects for select
--   using (
--     bucket_id = 'business-cards' and
--     (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- create policy "Users can delete their own card images"
--   on storage.objects for delete
--   using (
--     bucket_id = 'business-cards' and
--     (storage.foldername(name))[1] = auth.uid()::text
--   );
