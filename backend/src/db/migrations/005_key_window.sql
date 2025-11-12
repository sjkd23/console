-- 005_key_window.sql
-- Purpose: Add key_window_ends_at column for party join window tracking
BEGIN;

-- Add key_window_ends_at column to run table
ALTER TABLE run ADD COLUMN IF NOT EXISTS key_window_ends_at TIMESTAMPTZ;

COMMIT;
