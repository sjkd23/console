-- 006_update_status_constraint.sql
-- Purpose: Update run status CHECK constraint to allow new status values (open, live, ended)
BEGIN;

-- Drop the old constraint
ALTER TABLE run DROP CONSTRAINT IF EXISTS run_status_check;

-- Add the new constraint with updated values
ALTER TABLE run ADD CONSTRAINT run_status_check 
    CHECK (status IN ('open', 'live', 'ended'));

COMMIT;
