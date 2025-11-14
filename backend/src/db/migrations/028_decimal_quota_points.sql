-- 028_decimal_quota_points.sql
-- Purpose: Change quota point columns from INTEGER to DECIMAL(10,2) to support fractional points
-- Allows point values like 0.5, 1.25, 12.55, etc. with up to 2 decimal places

BEGIN;

-- Update quota_role_config.required_points to DECIMAL(10,2)
ALTER TABLE quota_role_config
ALTER COLUMN required_points TYPE DECIMAL(10,2);

-- Update quota_dungeon_override.points to DECIMAL(10,2)
ALTER TABLE quota_dungeon_override
ALTER COLUMN points TYPE DECIMAL(10,2);

-- Update quota_event.points to DECIMAL(10,2)
ALTER TABLE quota_event
ALTER COLUMN points TYPE DECIMAL(10,2);

-- Update quota_event.quota_points to DECIMAL(10,2)
ALTER TABLE quota_event
ALTER COLUMN quota_points TYPE DECIMAL(10,2);

-- Update raider_points_config.points to DECIMAL(10,2)
ALTER TABLE raider_points_config
ALTER COLUMN points TYPE DECIMAL(10,2);

-- Update key_pop_points_config.points to DECIMAL(10,2)
ALTER TABLE key_pop_points_config
ALTER COLUMN points TYPE DECIMAL(10,2);

COMMIT;
