-- 017_add_quota_channel.sql
-- Purpose: Add quota channel to channel catalog

BEGIN;

INSERT INTO channel_catalog (channel_key, label, description) VALUES
    ('quota', 'Quota', 'Channel for quota leaderboard panels and tracking')
ON CONFLICT (channel_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description;

COMMIT;
