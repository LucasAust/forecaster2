-- Create ai_suggestions table
create table if not exists public.ai_suggestions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  suggestions jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.ai_suggestions enable row level security;

-- Policies
drop policy if exists "Users can view their own suggestions" on public.ai_suggestions;
create policy "Users can view their own suggestions"
  on public.ai_suggestions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can check their own suggestions" on public.ai_suggestions;
create policy "Users can check their own suggestions"
  on public.ai_suggestions for all
  using (auth.uid() = user_id);

-- Trigger for updated_at
drop trigger if exists handle_updated_at on public.ai_suggestions;
create trigger handle_updated_at before update on public.ai_suggestions
  for each row execute procedure public.handle_updated_at();
