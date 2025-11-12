-- Migration: Make audit.actor_id nullable for system actions
-- When automated processes (like suspension expiry) perform actions,
-- there's no valid actor_id from the member table. This allows NULL
-- to represent system-initiated actions.

DO $$
BEGIN
    -- Make actor_id nullable if it isn't already
    ALTER TABLE audit ALTER COLUMN actor_id DROP NOT NULL;
    
    -- The foreign key constraint already exists with ON DELETE SET NULL
    -- from migration 002, so we don't need to recreate it
    
    RAISE NOTICE 'Migration 013: Made audit.actor_id nullable for system actions';
END $$;
