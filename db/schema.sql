-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Table to store Plaid Link items (access tokens)
create table public.plaid_items (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  access_token text not null,
  item_id text not null,
  last_synced_at timestamp with time zone,
  accounts_data jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, item_id)
);

-- Enable RLS for plaid_items
alter table public.plaid_items enable row level security;

-- Policy: Users can only see their own items
create policy "Users can view their own plaid items"
  on public.plaid_items for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own items
create policy "Users can insert their own plaid items"
  on public.plaid_items for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own items
create policy "Users can update their own plaid items"
  on public.plaid_items for update
  using (auth.uid() = user_id);

-- Table to store generated forecasts (for caching)
create table public.forecasts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  forecast_data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for forecasts
alter table public.forecasts enable row level security;

-- Policy: Users can view their own forecasts
create policy "Users can view their own forecasts"
  on public.forecasts for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own forecasts
create policy "Users can insert their own forecasts"
  with check (auth.uid() = user_id);

-- Add last_synced_at to plaid_items (if not exists logic handled by user running script, but here we define the ideal state)
-- Note: If table already exists, you might need: alter table public.plaid_items add column if not exists last_synced_at timestamp with time zone;
-- For this script, we'll assume we can just add it to the create definition or the user will handle migration. 
-- Let's append the transactions table definition.

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

-- Enable RLS for transactions
alter table public.transactions enable row level security;

-- Policy: Users can view their own transactions
create policy "Users can view their own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own transactions
create policy "Users can insert their own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own transactions
create policy "Users can update their own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

-- Table to store user settings (e.g. monthly budget)
create table public.user_settings (
  user_id uuid references auth.users(id) on delete cascade primary key,
  monthly_budget numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for user_settings
alter table public.user_settings enable row level security;

-- Policy: Users can view their own settings
create policy "Users can view their own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own settings
create policy "Users can insert their own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own settings
create policy "Users can update their own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);
