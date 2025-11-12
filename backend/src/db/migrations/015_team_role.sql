-- 015_team_role.sql
-- Purpose: Add 'team' role to the role catalog for automatic team role assignment

BEGIN;

-- Add 'team' role to the role catalog
INSERT INTO role_catalog (role_key, label, description) VALUES
    ('team', 'Team', 'Automatically assigned to members with any staff role')
ON CONFLICT (role_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description;

COMMIT;
