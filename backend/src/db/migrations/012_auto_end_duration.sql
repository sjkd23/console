-- 012_auto_end_duration.sql
-- Add auto_end_minutes column to run table
-- This defines how long a run can exist before being automatically ended
-- Default is 120 minutes (2 hours)

ALTER TABLE run 
ADD COLUMN auto_end_minutes INTEGER NOT NULL DEFAULT 120 
CHECK (auto_end_minutes > 0 AND auto_end_minutes <= 1440); -- max 24 hours

-- Add comment for documentation
COMMENT ON COLUMN run.auto_end_minutes IS 'Duration in minutes after creation when run will be automatically ended. Max 1440 (24 hours).';
