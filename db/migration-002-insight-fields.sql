-- Migration 002: Add columns to insight_answers for richer question metadata
-- Safe to re-run (uses IF NOT EXISTS patterns)

-- The insight_answers table stores question_id + value pairs.
-- No schema change needed — the new question types (birth_month, atypical_months,
-- upcoming_large_expenses, annual_events, large_income_amount, large_expense_amount,
-- life_situation, upcoming_large_income, recurring_high_income_months)
-- all use the existing question_id/value text columns.
--
-- This migration just adds an index for faster lookups and a metadata column
-- for storing question-specific data (like which months were flagged as atypical).

-- Add metadata column for storing question-specific context
ALTER TABLE public.insight_answers
    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.insight_answers.metadata IS 
    'Optional JSON metadata from the question (e.g., outlier months, spike amounts)';
