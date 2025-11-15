-- 040_muted_role.sql
-- Purpose: Add 'muted' role to the role catalog for member muting

BEGIN;

-- Add 'muted' role to the role catalog
INSERT INTO role_catalog (role_key, label, description) VALUES
    ('muted', 'Muted', 'Temporarily muted from sending messages')
ON CONFLICT (role_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description;

COMMIT;
