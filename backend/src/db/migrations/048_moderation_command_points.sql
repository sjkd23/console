-- 048_moderation_command_points.sql
-- Purpose: Add individual command-specific point columns for moderation actions
-- Allows configuring different point values for /warn, /suspend, /replymodmail, /editname, /addnote per quota role

BEGIN;

-- Add individual command point columns to quota_role_config
-- All default to 0, can be overridden per role configuration
ALTER TABLE quota_role_config
    ADD COLUMN IF NOT EXISTS verify_points DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (verify_points >= 0),
    ADD COLUMN IF NOT EXISTS warn_points DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (warn_points >= 0),
    ADD COLUMN IF NOT EXISTS suspend_points DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (suspend_points >= 0),
    ADD COLUMN IF NOT EXISTS modmail_reply_points DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (modmail_reply_points >= 0),
    ADD COLUMN IF NOT EXISTS editname_points DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (editname_points >= 0),
    ADD COLUMN IF NOT EXISTS addnote_points DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (addnote_points >= 0);

-- Migrate existing moderation_points to verify_points
-- This preserves the existing behavior where moderation_points applied to verification
UPDATE quota_role_config
SET verify_points = moderation_points
WHERE moderation_points > 0;

-- Add comments explaining the new columns
COMMENT ON COLUMN quota_role_config.verify_points IS 'Points awarded for running /verify command or approving manual verification tickets';
COMMENT ON COLUMN quota_role_config.warn_points IS 'Points awarded for running /warn command';
COMMENT ON COLUMN quota_role_config.suspend_points IS 'Points awarded for running /suspend command';
COMMENT ON COLUMN quota_role_config.modmail_reply_points IS 'Points awarded for replying to modmail tickets';
COMMENT ON COLUMN quota_role_config.editname_points IS 'Points awarded for running /editname command';
COMMENT ON COLUMN quota_role_config.addnote_points IS 'Points awarded for running /addnote command';

-- Keep moderation_points column for backward compatibility but it's now deprecated
-- New code should use the individual command point columns
COMMENT ON COLUMN quota_role_config.moderation_points IS 'DEPRECATED: Use individual command point columns (verify_points, warn_points, etc.) instead';

COMMIT;
