-- 002_contract_safety.sql
-- Purpose: tighten data integrity + useful indexes without breaking existing code.
-- Notes:
-- - Keeps BIGINT Discord IDs to avoid app changes.
-- - Adds digit/length guards, partial indexes, useful FKs, and an auto-updated timestamp.
-- - Safe to run on existing data if IDs are valid snowflakes.
BEGIN;
-- 1) Sanity checks on Discord Snowflake-like IDs (17–19 digits typically).
--    We allow 15–22 to be future-proof. NULLs pass (for nullable columns).
-- guild.id (PK)
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guild_id_digits_check'
) THEN
ALTER TABLE guild
ADD CONSTRAINT guild_id_digits_check CHECK (id::text ~ '^[0-9]{15,22}$');
END IF;
END $$;
-- member.id (PK)
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_id_digits_check'
) THEN
ALTER TABLE member
ADD CONSTRAINT member_id_digits_check CHECK (id::text ~ '^[0-9]{15,22}$');
END IF;
END $$;
-- raider.guild_id / raider.user_id
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'raider_guild_id_digits_check'
) THEN
ALTER TABLE raider
ADD CONSTRAINT raider_guild_id_digits_check CHECK (guild_id::text ~ '^[0-9]{15,22}$');
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'raider_user_id_digits_check'
) THEN
ALTER TABLE raider
ADD CONSTRAINT raider_user_id_digits_check CHECK (user_id::text ~ '^[0-9]{15,22}$');
END IF;
END $$;
-- run.guild_id / run.organizer_id / run.channel_id / run.post_message_id
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_guild_id_digits_check'
) THEN
ALTER TABLE run
ADD CONSTRAINT run_guild_id_digits_check CHECK (guild_id::text ~ '^[0-9]{15,22}$');
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_organizer_id_digits_check'
) THEN
ALTER TABLE run
ADD CONSTRAINT run_organizer_id_digits_check CHECK (
        organizer_id IS NULL
        OR organizer_id::text ~ '^[0-9]{15,22}$'
    );
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_channel_id_digits_check'
) THEN
ALTER TABLE run
ADD CONSTRAINT run_channel_id_digits_check CHECK (
        channel_id IS NULL
        OR channel_id::text ~ '^[0-9]{15,22}$'
    );
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_post_message_id_digits_check'
) THEN
ALTER TABLE run
ADD CONSTRAINT run_post_message_id_digits_check CHECK (
        post_message_id IS NULL
        OR post_message_id::text ~ '^[0-9]{15,22}$'
    );
END IF;
END $$;
-- reaction.user_id
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reaction_user_id_digits_check'
) THEN
ALTER TABLE reaction
ADD CONSTRAINT reaction_user_id_digits_check CHECK (user_id::text ~ '^[0-9]{15,22}$');
END IF;
END $$;
-- audit.guild_id / audit.actor_id (nullable)
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_gid_digits_check'
) THEN
ALTER TABLE audit
ADD CONSTRAINT audit_gid_digits_check CHECK (
        guild_id IS NULL
        OR guild_id::text ~ '^[0-9]{15,22}$'
    );
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_actor_digits_check'
) THEN
ALTER TABLE audit
ADD CONSTRAINT audit_actor_digits_check CHECK (
        actor_id IS NULL
        OR actor_id::text ~ '^[0-9]{15,22}$'
    );
END IF;
END $$;
-- 2) Additional safety checks on run:
--    - If both timestamps exist, ended_at >= started_at
DO $$ BEGIN
IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_time_order_check'
) THEN
ALTER TABLE run
ADD CONSTRAINT run_time_order_check CHECK (
        ended_at IS NULL
        OR started_at IS NULL
        OR ended_at >= started_at
    );
END IF;
END $$;
-- 3) Helpful foreign keys on audit (nullable + non-destructive)
--    (If you already have data that violates these, add them later after cleanup.)
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_guild_fk'
) THEN
ALTER TABLE audit
ADD CONSTRAINT audit_guild_fk FOREIGN KEY (guild_id) REFERENCES guild(id) ON DELETE
SET NULL;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_actor_fk'
) THEN
ALTER TABLE audit
ADD CONSTRAINT audit_actor_fk FOREIGN KEY (actor_id) REFERENCES member(id) ON DELETE
SET NULL;
END IF;
END $$;
-- 4) Index improvements:
--    - Composite index to accelerate "active runs in a guild"
--    - Unique on post_message_id (only one run per Discord message)
--    - Partial index for fast counts of 'join' reactions per run
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_run_guild_status'
        AND n.nspname = 'public'
) THEN CREATE INDEX idx_run_guild_status ON run(guild_id, status);
END IF;
-- Unique message mapping (allows multiple NULLs)
IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'uq_run_post_message_id'
) THEN CREATE UNIQUE INDEX uq_run_post_message_id ON run(post_message_id)
WHERE post_message_id IS NOT NULL;
END IF;
-- Reaction counts used most often for 'join'
IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'idx_reaction_run_join'
) THEN CREATE INDEX idx_reaction_run_join ON reaction(run_id)
WHERE state = 'join';
END IF;
END $$;
-- 5) Auto-maintain reaction.updated_at on updates (lightweight trigger)
CREATE OR REPLACE FUNCTION set_reaction_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at := now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_reaction_set_updated_at'
) THEN CREATE TRIGGER trg_reaction_set_updated_at BEFORE
UPDATE ON reaction FOR EACH ROW EXECUTE FUNCTION set_reaction_updated_at();
END IF;
END $$;
COMMIT;