-- =============================================================
-- Forecaster2 — Complete Database Schema (idempotent)
-- Safe to run on an existing database. All statements use
-- IF NOT EXISTS / IF EXISTS / CREATE OR REPLACE / DO blocks
-- so nothing breaks if objects already exist.
-- =============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- -------------------------------------------------
-- Utility: handle_updated_at trigger function
-- -------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================================================
-- 1. plaid_items — Plaid Link access tokens
-- =========================================================
create table if not exists public.plaid_items (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  access_token text not null,
  item_id text not null,
  last_synced_at timestamp with time zone,
  accounts_data jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, item_id)
);

alter table public.plaid_items enable row level security;

DO $$ BEGIN
  CREATE POLICY "Users can view their own plaid items"
    ON public.plaid_items FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own plaid items"
    ON public.plaid_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own plaid items"
    ON public.plaid_items FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================
-- 2. forecasts — Cached AI forecasts
-- =========================================================
create table if not exists public.forecasts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  forecast_data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.forecasts enable row level security;

DO $$ BEGIN
  CREATE POLICY "Users can view their own forecasts"
    ON public.forecasts FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own forecasts"
    ON public.forecasts FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own forecasts"
    ON public.forecasts FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================
-- 3. transactions — Plaid-synced transactions
-- =========================================================
create table if not exists public.transactions (
  transaction_id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  account_id text not null,
  amount numeric not null,
  date date not null,
  name text not null,
  category text[],
  pending boolean default false,
  logo_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.transactions enable row level security;

DO $$ BEGIN
  CREATE POLICY "Users can view their own transactions"
    ON public.transactions FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own transactions"
    ON public.transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own transactions"
    ON public.transactions FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own transactions"
    ON public.transactions FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================
-- 4. user_settings — Budget, display name, preferences, MFA
-- =========================================================
create table if not exists public.user_settings (
  user_id uuid references auth.users(id) on delete cascade primary key,
  monthly_budget numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Columns added via migrations
alter table public.user_settings add column if not exists display_name text;
alter table public.user_settings add column if not exists user_preferences jsonb default '{}'::jsonb;
alter table public.user_settings add column if not exists mfa_method text default null;

alter table public.user_settings enable row level security;

DO $$ BEGIN
  CREATE POLICY "Users can view their own settings"
    ON public.user_settings FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own settings"
    ON public.user_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own settings"
    ON public.user_settings FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Trigger: auto-update updated_at on user_settings
drop trigger if exists on_auth_user_settings_updated on public.user_settings;
create trigger on_auth_user_settings_updated
  before update on public.user_settings
  for each row execute procedure public.handle_updated_at();

-- =========================================================
-- 5. ai_suggestions — Cached AI financial suggestions
-- =========================================================
create table if not exists public.ai_suggestions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  suggestions jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.ai_suggestions enable row level security;

DO $$ BEGIN
  CREATE POLICY "Users can view their own suggestions"
    ON public.ai_suggestions FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can manage their own suggestions"
    ON public.ai_suggestions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Trigger: auto-update updated_at on ai_suggestions
drop trigger if exists handle_updated_at on public.ai_suggestions;
create trigger handle_updated_at
  before update on public.ai_suggestions
  for each row execute procedure public.handle_updated_at();

-- =========================================================
-- 6. mfa_email_codes — Email MFA verification codes
-- =========================================================
create table if not exists public.mfa_email_codes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  expires_at timestamptz not null,
  used boolean default false,
  created_at timestamptz default now()
);

-- Index for fast lookup during verification
create index if not exists idx_mfa_email_codes_user_id
  on public.mfa_email_codes (user_id, used, expires_at);

alter table public.mfa_email_codes enable row level security;

DO $$ BEGIN
  CREATE POLICY "Users can manage their own MFA codes"
    ON public.mfa_email_codes FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
