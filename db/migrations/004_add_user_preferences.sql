-- Add user_preferences JSONB column to user_settings
-- This migrates data previously stored in localStorage to the database
-- so it persists across devices and survives cache clears.

alter table public.user_settings 
add column if not exists user_preferences jsonb default '{}'::jsonb;

-- The user_preferences column stores a JSON object with these keys:
-- category_limits: array of { category, limit, rollover }
-- savings_goals: array of { id, name, target, saved, color, deadline? }
-- dashboard_layout: array of { id, label, visible, order }
-- saved_scenarios: array of { id, label, prompt }
-- debt_plans: array of { id, name, balance, apr, minPayment }
-- spending_challenges: array of challenge objects
-- spending_badges: object tracking earned badges
-- income_allocations: { needs, wants, savings }
-- paused_recurring: array of paused merchant keys
