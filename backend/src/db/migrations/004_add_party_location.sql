-- 004_add_party_location.sql
-- Purpose: Add party and location fields to run table
BEGIN;

-- Add party and location columns to run table
ALTER TABLE run ADD COLUMN IF NOT EXISTS party TEXT;
ALTER TABLE run ADD COLUMN IF NOT EXISTS location TEXT;

COMMIT;
