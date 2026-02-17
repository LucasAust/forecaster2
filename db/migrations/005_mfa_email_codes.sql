-- Table for storing email MFA verification codes
-- Codes expire after 10 minutes and are single-use

CREATE TABLE IF NOT EXISTS mfa_email_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup during verification
CREATE INDEX IF NOT EXISTS idx_mfa_email_codes_user_id ON mfa_email_codes (user_id, used, expires_at);

-- Enable Row Level Security
ALTER TABLE mfa_email_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only manage their own MFA codes
DO $$ BEGIN
    CREATE POLICY "Users can manage their own MFA codes"
        ON mfa_email_codes FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-cleanup expired codes (run periodically or via Supabase cron)
-- DELETE FROM mfa_email_codes WHERE expires_at < now() OR used = true;

-- Add mfa_method column to user_settings to track which MFA method the user chose
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mfa_method TEXT DEFAULT NULL;
-- Valid values: 'totp', 'email', NULL (not enrolled)
