-- 039_modmail.sql
-- Purpose: Add modmail system for DM-based server support tickets

BEGIN;

-- Add modmail channel to channel catalog
INSERT INTO channel_catalog (channel_key, label, description) VALUES
    ('modmail', 'Modmail', 'Channel for receiving and managing modmail support tickets')
ON CONFLICT (channel_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description;

-- Table to track modmail tickets
CREATE TABLE IF NOT EXISTS modmail_ticket (
    ticket_id TEXT PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    thread_id BIGINT, -- Discord thread ID created for this ticket
    message_id BIGINT, -- Initial message ID in modmail channel
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    closed_by BIGINT -- User ID who closed the ticket
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_modmail_ticket_guild ON modmail_ticket(guild_id);
CREATE INDEX IF NOT EXISTS idx_modmail_ticket_user ON modmail_ticket(user_id);
CREATE INDEX IF NOT EXISTS idx_modmail_ticket_status ON modmail_ticket(status);
CREATE INDEX IF NOT EXISTS idx_modmail_ticket_thread ON modmail_ticket(thread_id);

-- Table to track modmail messages
CREATE TABLE IF NOT EXISTS modmail_message (
    message_id BIGSERIAL PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES modmail_ticket(ticket_id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb, -- Array of attachment URLs
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_staff_reply BOOLEAN NOT NULL DEFAULT false
);

-- Indexes for message lookups
CREATE INDEX IF NOT EXISTS idx_modmail_message_ticket ON modmail_message(ticket_id);
CREATE INDEX IF NOT EXISTS idx_modmail_message_sent_at ON modmail_message(sent_at);

-- Comments for documentation
COMMENT ON TABLE modmail_ticket IS 'Tracks modmail support tickets submitted by users via DMs';
COMMENT ON TABLE modmail_message IS 'Stores all messages exchanged in a modmail ticket';
COMMENT ON COLUMN modmail_ticket.ticket_id IS 'Unique ticket identifier (e.g., MM-XXXXXX)';
COMMENT ON COLUMN modmail_ticket.thread_id IS 'Discord thread ID where staff discuss this ticket';
COMMENT ON COLUMN modmail_message.is_staff_reply IS 'True if message is from staff, false if from user';

COMMIT;
