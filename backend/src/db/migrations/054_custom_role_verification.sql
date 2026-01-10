-- 054_custom_role_verification.sql
-- Purpose: Add custom role verification system
-- Allows admins to create custom role verification panels with unique requirements

BEGIN;

-- Table to store custom role verification configurations
-- Each config defines a role that users can verify for with custom instructions
CREATE TABLE IF NOT EXISTS custom_role_verification (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL, -- The Discord role to grant upon successful verification
    role_channel_id BIGINT NOT NULL, -- Channel where the verification panel is posted
    verification_channel_id BIGINT NOT NULL, -- Channel where verification tickets appear
    instructions TEXT NOT NULL, -- Custom instructions for what users need to submit
    example_image_url TEXT, -- Optional example screenshot to show users
    panel_message_id BIGINT, -- Message ID of the verification panel
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id BIGINT NOT NULL,
    UNIQUE(guild_id, role_id) -- One config per role per guild
);

-- Index for looking up configs by guild
CREATE INDEX IF NOT EXISTS idx_custom_role_verification_guild ON custom_role_verification(guild_id);

-- Table to track custom role verification sessions (similar to verification_session)
-- Tracks the state of a user's attempt to verify for a specific custom role
CREATE TABLE IF NOT EXISTS custom_role_verification_session (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role_verification_id INTEGER NOT NULL REFERENCES custom_role_verification(id) ON DELETE CASCADE,
    screenshot_url TEXT, -- Screenshot submitted by user
    ticket_message_id BIGINT, -- Message ID of the verification ticket
    status TEXT NOT NULL DEFAULT 'pending_screenshot' CHECK (
        status IN (
            'pending_screenshot',       -- Waiting for user to submit screenshot
            'pending_review',           -- Screenshot submitted, awaiting staff review
            'approved',                 -- Approved by staff, role granted
            'denied',                   -- Denied by staff
            'cancelled',                -- User cancelled
            'expired'                   -- Session expired
        )
    ),
    reviewed_by_user_id BIGINT, -- Staff member who approved/denied
    reviewed_at TIMESTAMPTZ,
    denial_reason TEXT, -- Reason for denial if denied
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
    UNIQUE(guild_id, user_id, role_verification_id) -- One active session per user per role
);

-- Index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_custom_role_verification_session_expires ON custom_role_verification_session(expires_at);

-- Index for finding sessions by user (for DM lookups)
CREATE INDEX IF NOT EXISTS idx_custom_role_verification_session_user ON custom_role_verification_session(user_id);

COMMIT;
