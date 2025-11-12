-- 010_punishments.sql
-- Purpose: Add punishment system for warnings and suspensions with tracking

BEGIN;

-- Add 'suspended' role to the role catalog
INSERT INTO role_catalog (role_key, label, description) VALUES
    ('suspended', 'Suspended', 'Temporarily suspended from raid participation')
ON CONFLICT (role_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description;

-- Create punishments table
CREATE TABLE IF NOT EXISTS punishment (
    id TEXT PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    moderator_id BIGINT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('warn', 'suspend')),
    reason TEXT NOT NULL,
    expires_at TIMESTAMPTZ NULL, -- NULL for warns (permanent record), timestamp for suspensions
    active BOOLEAN NOT NULL DEFAULT TRUE, -- Can be deactivated by removing punishment
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMPTZ NULL,
    removed_by BIGINT NULL,
    removal_reason TEXT NULL
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_punishment_guild_user ON punishment(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_punishment_guild_active ON punishment(guild_id, active);
CREATE INDEX IF NOT EXISTS idx_punishment_user ON punishment(user_id);
CREATE INDEX IF NOT EXISTS idx_punishment_expires ON punishment(expires_at) WHERE expires_at IS NOT NULL AND active = TRUE;

-- Function to automatically deactivate expired suspensions
CREATE OR REPLACE FUNCTION deactivate_expired_suspensions()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE punishment
    SET active = FALSE
    WHERE type = 'suspend'
      AND active = TRUE
      AND expires_at IS NOT NULL
      AND expires_at <= NOW();
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
