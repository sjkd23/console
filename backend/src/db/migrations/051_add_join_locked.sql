-- Add join_locked flag to runs table
-- This allows organizers to prevent new users from joining a run

ALTER TABLE run
ADD COLUMN IF NOT EXISTS join_locked BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN run.join_locked IS 'When true, prevents new raiders from joining via the Join button';
