-- 055_add_role_description.sql
-- Purpose: Add optional role_description field to custom_role_verification
-- This allows admins to add a description of the role that appears in verification panels and DMs

BEGIN;

-- Add role_description column to custom_role_verification table
ALTER TABLE custom_role_verification
ADD COLUMN IF NOT EXISTS role_description TEXT;

COMMIT;
