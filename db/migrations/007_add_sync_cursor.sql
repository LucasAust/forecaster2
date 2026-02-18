-- Add sync_cursor column to plaid_items for incremental Plaid transactionsSync
ALTER TABLE public.plaid_items ADD COLUMN IF NOT EXISTS sync_cursor text;
