import { query } from '../../db/pool.js';

/**
 * Check if actor has moderator permission (administrator or moderator role).
 * Used for moderation commands like punishments and notes.
 * 
 * @param guildId - Discord guild ID
 * @param actorRoles - Array of Discord role IDs the actor has
 * @param actorHasAdmin - Whether the actor has Discord's Administrator permission
 * @returns true if actor has moderator permission
 */
export async function hasModerator(guildId: string, actorRoles?: string[], actorHasAdmin?: boolean): Promise<boolean> {
    // Discord Administrator permission grants all permissions
    if (actorHasAdmin) return true;
    
    if (!actorRoles || actorRoles.length === 0) return false;

    const res = await query<{ role_key: string }>(
        `SELECT role_key FROM guild_role 
         WHERE guild_id = $1::bigint 
         AND discord_role_id = ANY($2::bigint[])
         AND role_key IN ('administrator', 'moderator')`,
        [guildId, actorRoles]
    );

    return res.rows.length > 0;
}

/**
 * Check if actor has security permission (administrator, moderator, or security role).
 * Used for verification and IGN management commands.
 * 
 * @param guildId - Discord guild ID
 * @param actorRoles - Array of Discord role IDs the actor has
 * @param actorHasAdmin - Whether the actor has Discord's Administrator permission
 * @returns true if actor has security permission
 */
export async function hasSecurity(guildId: string, actorRoles?: string[], actorHasAdmin?: boolean): Promise<boolean> {
    // Discord Administrator permission grants all permissions
    if (actorHasAdmin) return true;
    
    if (!actorRoles || actorRoles.length === 0) return false;

    const res = await query<{ role_key: string }>(
        `SELECT role_key FROM guild_role 
         WHERE guild_id = $1::bigint 
         AND discord_role_id = ANY($2::bigint[])
         AND role_key IN ('administrator', 'moderator', 'security')`,
        [guildId, actorRoles]
    );

    return res.rows.length > 0;
}

/**
 * Check if actor has officer permission (administrator, moderator, head_organizer, or officer role).
 * Used for moderation commands like mute, kick, ban.
 * 
 * @param guildId - Discord guild ID
 * @param actorRoles - Array of Discord role IDs the actor has
 * @param actorHasAdmin - Whether the actor has Discord's Administrator permission
 * @returns true if actor has officer permission
 */
export async function hasOfficer(guildId: string, actorRoles?: string[], actorHasAdmin?: boolean): Promise<boolean> {
    // Discord Administrator permission grants all permissions
    if (actorHasAdmin) return true;
    
    if (!actorRoles || actorRoles.length === 0) return false;

    const res = await query<{ role_key: string }>(
        `SELECT role_key FROM guild_role 
         WHERE guild_id = $1::bigint 
         AND discord_role_id = ANY($2::bigint[])
         AND role_key IN ('administrator', 'moderator', 'head_organizer', 'officer')`,
        [guildId, actorRoles]
    );

    return res.rows.length > 0;
}
