-- Insight answers — stores user responses to data-driven questions
-- that improve forecast accuracy (regime changes, income expectations, etc.)

create table if not exists public.insight_answers (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    question_id text not null,
    value text not null,
    answered_at timestamp with time zone default now() not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    unique(user_id, question_id)
);

alter table public.insight_answers enable row level security;

DO $$ BEGIN
    CREATE POLICY "Users can manage their own insight answers"
        ON public.insight_answers FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create index if not exists idx_insight_answers_user_id
    on public.insight_answers (user_id);

-- Auto-update updated_at
drop trigger if exists handle_updated_at_insight_answers on public.insight_answers;
create trigger handle_updated_at_insight_answers
    before update on public.insight_answers
    for each row execute procedure public.handle_updated_at();
