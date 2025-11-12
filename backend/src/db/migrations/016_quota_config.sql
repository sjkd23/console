-- 016_quota_config.sql
-- Purpose: Add quota configuration system for per-guild, per-role quota management

BEGIN;

-- Quota configuration per guild per role
-- Stores reset time (absolute datetime), required points, and panel message for leaderboard
CREATE TABLE IF NOT EXISTS quota_role_config (
    guild_id BIGINT NOT NULL,
    discord_role_id BIGINT NOT NULL,
    required_points INTEGER NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Absolute reset datetime in UTC
    panel_message_id BIGINT, -- Discord message ID for the leaderboard panel
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT quota_role_config_pk PRIMARY KEY (guild_id, discord_role_id)
);

-- Per-dungeon point overrides for specific roles
-- If no override exists, default to 1 point per dungeon
CREATE TABLE IF NOT EXISTS quota_dungeon_override (
    guild_id BIGINT NOT NULL,
    discord_role_id BIGINT NOT NULL,
    dungeon_key TEXT NOT NULL, -- e.g., 'FUNGAL_CAVERN', 'SHATTERS', etc.
    points INTEGER NOT NULL DEFAULT 1 CHECK (points >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT quota_dungeon_override_pk PRIMARY KEY (guild_id, discord_role_id, dungeon_key),
    CONSTRAINT quota_dungeon_override_fk FOREIGN KEY (guild_id, discord_role_id)
        REFERENCES quota_role_config(guild_id, discord_role_id) ON DELETE CASCADE
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_quota_role_config_guild ON quota_role_config(guild_id);
CREATE INDEX IF NOT EXISTS idx_quota_dungeon_override_guild_role ON quota_dungeon_override(guild_id, discord_role_id);

COMMIT;
