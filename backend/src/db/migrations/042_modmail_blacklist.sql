-- 042_modmail_blacklist.sql
-- Purpose: Add modmail blacklist system to prevent specific users from using modmail

BEGIN;

-- Add blacklist columns to raider table (guild-scoped)
ALTER TABLE raider
ADD COLUMN IF NOT EXISTS modmail_blacklisted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS modmail_blacklist_reason TEXT,
ADD COLUMN IF NOT EXISTS modmail_blacklisted_by BIGINT,
ADD COLUMN IF NOT EXISTS modmail_blacklisted_at TIMESTAMPTZ;

-- Index for efficient blacklist lookups
CREATE INDEX IF NOT EXISTS idx_raider_modmail_blacklisted ON raider(guild_id, user_id) WHERE modmail_blacklisted = true;

-- Comments for documentation
COMMENT ON COLUMN raider.modmail_blacklisted IS 'Whether this user is blacklisted from using modmail in this guild';
COMMENT ON COLUMN raider.modmail_blacklist_reason IS 'Reason for modmail blacklist';
COMMENT ON COLUMN raider.modmail_blacklisted_by IS 'User ID of staff member who blacklisted';
COMMENT ON COLUMN raider.modmail_blacklisted_at IS 'Timestamp when user was blacklisted';

COMMIT;
