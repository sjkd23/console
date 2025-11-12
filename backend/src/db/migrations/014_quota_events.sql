-- 014_quota_events.sql
-- Purpose: Add minimal quota logging system for organizer runs and security verifications

BEGIN;

-- Quota events table (append-only log)
-- Tracks points earned by guild members for various actions
CREATE TABLE IF NOT EXISTS quota_event (
    id BIGSERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL REFERENCES guild(id) ON DELETE CASCADE,
    actor_user_id BIGINT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('run_completed', 'verify_member')),
    subject_id TEXT, -- For idempotency: 'run:123' or 'verify:456'
    dungeon_key TEXT, -- Dungeon identifier (e.g., 'fungal', 'osanc') for per-dungeon tracking
    points INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint for idempotency on run_completed actions
-- Each run can only be logged once per guild (prevents double-counting)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quota_event_run_idempotency 
    ON quota_event(guild_id, subject_id) 
    WHERE action_type = 'run_completed' AND subject_id IS NOT NULL;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_quota_event_guild ON quota_event(guild_id);
CREATE INDEX IF NOT EXISTS idx_quota_event_actor ON quota_event(guild_id, actor_user_id);
CREATE INDEX IF NOT EXISTS idx_quota_event_action_type ON quota_event(action_type);
CREATE INDEX IF NOT EXISTS idx_quota_event_dungeon ON quota_event(dungeon_key);
CREATE INDEX IF NOT EXISTS idx_quota_event_created_at ON quota_event(created_at);

COMMIT;
