-- 029_manual_verification.sql
-- Purpose: Add manual verification system with screenshot upload and ticket-based approval

BEGIN;

-- Add guild config table for manual verification settings
CREATE TABLE IF NOT EXISTS guild_verification_config (
    guild_id BIGINT PRIMARY KEY,
    manual_verify_instructions TEXT,
    panel_custom_message TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE guild_verification_config IS 'Guild-specific verification configuration including custom messages';
COMMENT ON COLUMN guild_verification_config.manual_verify_instructions IS 'Custom message shown when user selects "Manual Verify Screenshot" with example picture and instructions';
COMMENT ON COLUMN guild_verification_config.panel_custom_message IS 'Optional custom message to include in the get-verified panel embed';

-- Extend verification_session to support manual verification
ALTER TABLE verification_session
  ADD COLUMN IF NOT EXISTS verification_method TEXT DEFAULT 'realmeye' CHECK (
      verification_method IN ('realmeye', 'manual')
  ),
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS ticket_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS denial_reason TEXT;

COMMENT ON COLUMN verification_session.verification_method IS 'Method of verification: realmeye (automatic) or manual (screenshot review)';
COMMENT ON COLUMN verification_session.screenshot_url IS 'URL to screenshot uploaded by user for manual verification';
COMMENT ON COLUMN verification_session.ticket_message_id IS 'Message ID of the verification ticket in manual-verification channel';
COMMENT ON COLUMN verification_session.reviewed_by_user_id IS 'User ID of security+ member who approved/denied manual verification';
COMMENT ON COLUMN verification_session.reviewed_at IS 'Timestamp when manual verification was reviewed';
COMMENT ON COLUMN verification_session.denial_reason IS 'Reason for denial if manual verification was rejected';

-- Update status constraint to include manual verification states
ALTER TABLE verification_session
  DROP CONSTRAINT IF EXISTS verification_session_status_check,
  ADD CONSTRAINT verification_session_status_check CHECK (
      status IN (
          'pending_ign',              -- Waiting for user to provide IGN
          'pending_realmeye',         -- Waiting for user to add code to RealmEye
          'pending_screenshot',       -- Waiting for user to upload screenshot
          'pending_review',           -- Screenshot submitted, waiting for security+ review
          'verified',                 -- Successfully verified
          'cancelled',                -- User cancelled the flow
          'denied',                   -- Manual verification denied by security+
          'expired'                   -- Session expired (timeout)
      )
  );

-- Index for finding pending review tickets
CREATE INDEX IF NOT EXISTS idx_verification_session_pending_review 
  ON verification_session(guild_id, status) 
  WHERE status = 'pending_review';

COMMIT;
