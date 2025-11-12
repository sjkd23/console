-- 008_guild_roles.sql
-- Purpose: Add guild-based role configuration system for internal permission roles

BEGIN;

-- Static catalog of internal role keys (extensible without schema changes)
CREATE TABLE IF NOT EXISTS role_catalog (
    role_key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);

-- Seed initial internal roles
INSERT INTO role_catalog (role_key, label, description) VALUES
    ('administrator', 'Administrator', 'Full admin for bot actions in this guild'),
    ('moderator', 'Moderator', 'Moderation actions'),
    ('head_organizer', 'Head Organizer', 'Leads raid organization'),
    ('officer', 'Officer', 'Senior staff'),
    ('security', 'Security', 'Verification and security checks'),
    ('organizer', 'Organizer', 'Runs and manages raids'),
    ('verified_raider', 'Verified Raider', 'Verified community raider')
ON CONFLICT (role_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description;

-- Mapping from guild + internal role -> Discord role ID
CREATE TABLE IF NOT EXISTS guild_role (
    guild_id BIGINT NOT NULL,
    role_key TEXT NOT NULL REFERENCES role_catalog(role_key) ON DELETE CASCADE,
    discord_role_id BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT guild_role_pk PRIMARY KEY (guild_id, role_key)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_guild_role_guild ON guild_role(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_role_guild_discord ON guild_role(guild_id, discord_role_id);

COMMIT;
