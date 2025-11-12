-- 009_guild_channels.sql
-- Purpose: Add guild-based channel configuration system for internal bot channels

BEGIN;

-- Static catalog of internal channel keys (extensible without schema changes)
CREATE TABLE IF NOT EXISTS channel_catalog (
    channel_key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);

-- Seed initial internal channels
INSERT INTO channel_catalog (channel_key, label, description) VALUES
    ('raid', 'Raid', 'Main channel for raid announcements and coordination'),
    ('veri_log', 'Verification Log', 'Log channel for verification events'),
    ('manual_verification', 'Manual Verification', 'Channel for manual verification requests'),
    ('getverified', 'Get Verified', 'Channel where users initiate verification'),
    ('punishment_log', 'Punishment Log', 'Log channel for moderation actions'),
    ('raid_log', 'Raid Log', 'Log channel for raid-related events')
ON CONFLICT (channel_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description;

-- Mapping from guild + internal channel -> Discord channel ID
CREATE TABLE IF NOT EXISTS guild_channel (
    guild_id BIGINT NOT NULL,
    channel_key TEXT NOT NULL REFERENCES channel_catalog(channel_key) ON DELETE CASCADE,
    discord_channel_id BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT guild_channel_pk PRIMARY KEY (guild_id, channel_key)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_guild_channel_guild ON guild_channel(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_channel_guild_discord ON guild_channel(guild_id, discord_channel_id);

COMMIT;
