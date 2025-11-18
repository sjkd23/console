-- 047_base_dungeon_points.sql
-- Purpose: Add base points for exalt and non-exalt dungeons to quota_role_config
-- This allows guilds to set different default point values for exaltation dungeons vs other dungeons

BEGIN;

-- Add base_exalt_points column (default 1 point for exaltation dungeons)
ALTER TABLE quota_role_config
ADD COLUMN IF NOT EXISTS base_exalt_points DECIMAL(10,2) NOT NULL DEFAULT 1.0 CHECK (base_exalt_points >= 0);

-- Add base_non_exalt_points column (default 1 point for non-exaltation dungeons)
ALTER TABLE quota_role_config
ADD COLUMN IF NOT EXISTS base_non_exalt_points DECIMAL(10,2) NOT NULL DEFAULT 1.0 CHECK (base_non_exalt_points >= 0);

-- Add comment to explain the new columns
COMMENT ON COLUMN quota_role_config.base_exalt_points IS 
    'Default points for exaltation dungeons when no specific dungeon override exists';

COMMENT ON COLUMN quota_role_config.base_non_exalt_points IS 
    'Default points for non-exaltation dungeons when no specific dungeon override exists';

COMMIT;
