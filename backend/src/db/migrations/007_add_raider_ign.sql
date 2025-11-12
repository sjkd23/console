-- 007_add_raider_ign.sql
-- Purpose: Add ign (in-game name) column to raider table for manual verification

BEGIN;

-- Add ign column to store ROTMG in-game name
ALTER TABLE raider
  ADD COLUMN IF NOT EXISTS ign TEXT;

COMMIT;
