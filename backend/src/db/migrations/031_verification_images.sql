-- 031_verification_images.sql
-- Purpose: Add image URL support for verification panel and instructions

BEGIN;

-- Add image URL columns to guild_verification_config
ALTER TABLE guild_verification_config
  ADD COLUMN IF NOT EXISTS panel_custom_message_image TEXT,
  ADD COLUMN IF NOT EXISTS manual_verify_instructions_image TEXT,
  ADD COLUMN IF NOT EXISTS realmeye_instructions_image TEXT;

COMMENT ON COLUMN guild_verification_config.panel_custom_message_image IS 'Optional image URL to display in the get-verified panel embed';
COMMENT ON COLUMN guild_verification_config.manual_verify_instructions_image IS 'Optional image URL to display in manual verification instructions';
COMMENT ON COLUMN guild_verification_config.realmeye_instructions_image IS 'Optional image URL to display in RealmEye verification instructions';

COMMIT;
