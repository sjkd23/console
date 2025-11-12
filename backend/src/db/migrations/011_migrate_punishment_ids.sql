-- 011_migrate_punishment_ids.sql
-- Purpose: Migrate old numeric punishment IDs to new 24-character hex format
-- This ensures all existing punishments work with the new validation system

BEGIN;

-- First, check if the id column is INTEGER and change it to TEXT if needed
DO $$
BEGIN
    -- Check if id column is integer type
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'punishment' 
        AND column_name = 'id' 
        AND data_type = 'integer'
    ) THEN
        -- Convert id column from INTEGER to TEXT
        ALTER TABLE punishment ALTER COLUMN id TYPE TEXT USING id::TEXT;
        RAISE NOTICE 'Converted punishment.id from INTEGER to TEXT';
    END IF;
END $$;

-- Update all punishment IDs that are not already 24-character hex strings
-- We'll generate new random hex IDs for any existing records
DO $$
DECLARE
    old_record RECORD;
    new_id TEXT;
BEGIN
    -- Loop through all punishments that don't have 24-character hex IDs
    FOR old_record IN 
        SELECT id FROM punishment 
        WHERE LENGTH(id) != 24 OR id !~ '^[0-9a-f]{24}$'
    LOOP
        -- Generate a new random 24-character hex ID
        -- Using md5 hash of timestamp + old ID to ensure uniqueness
        new_id := substring(md5(random()::text || clock_timestamp()::text || old_record.id), 1, 24);
        
        -- Update the punishment record
        UPDATE punishment SET id = new_id WHERE id = old_record.id;
        
        RAISE NOTICE 'Migrated punishment ID: % -> %', old_record.id, new_id;
    END LOOP;
END $$;

COMMIT;
