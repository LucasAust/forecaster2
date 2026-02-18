-- Migration: Add merchant_name column to transactions table
-- Plaid provides a cleaned merchant_name field that is far more accurate
-- than the raw bank-feed name. We store it to improve forecast accuracy.

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS merchant_name text;
