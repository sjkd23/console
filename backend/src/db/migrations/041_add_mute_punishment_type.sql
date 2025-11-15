-- 041_add_mute_punishment_type.sql
-- Purpose: Add 'mute' to the allowed punishment types

BEGIN;

-- Drop the old constraint
ALTER TABLE punishment DROP CONSTRAINT IF EXISTS punishment_type_check;

-- Add new constraint that includes 'mute'
ALTER TABLE punishment ADD CONSTRAINT punishment_type_check CHECK (type IN ('warn', 'suspend', 'mute'));

-- Update the deactivate_expired_suspensions function to also handle mutes
CREATE OR REPLACE FUNCTION deactivate_expired_suspensions()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE punishment
    SET active = FALSE
    WHERE type IN ('suspend', 'mute')
      AND active = TRUE
      AND expires_at IS NOT NULL
      AND expires_at <= NOW();
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
