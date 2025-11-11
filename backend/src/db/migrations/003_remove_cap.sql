-- 003_remove_cap.sql
-- Purpose: Remove cap-related fields and constraints as runs no longer have capacity limits
BEGIN;

-- Drop the cap constraint if it exists
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'run_cap_nonnegative_check'
    ) THEN
        ALTER TABLE run DROP CONSTRAINT run_cap_nonnegative_check;
    END IF;
END $$;

-- Drop the cap column
ALTER TABLE run DROP COLUMN IF EXISTS cap;

COMMIT;
