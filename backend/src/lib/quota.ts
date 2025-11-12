// backend/src/lib/quota.ts
import { query } from '../db/pool.js';

/**
 * Action types for quota events.
 * Defines what activities earn quota points.
 */
export type QuotaActionType = 'run_completed' | 'verify_member';

/**
 * Default point values for each action type.
 * These are hardcoded defaults that can later be overridden by guild configuration.
 */
function getDefaultPoints(actionType: QuotaActionType): number {
    switch (actionType) {
        case 'run_completed':
            return 1;
        case 'verify_member':
            return 1;
        default:
            return 1;
    }
}

/**
 * Quota role configuration including reset time and required points
 */
export interface QuotaRoleConfig {
    guild_id: string;
    discord_role_id: string;
    required_points: number;
    reset_at: string; // ISO timestamp
    panel_message_id: string | null;
    created_at: string; // ISO timestamp - when this config was created
}

/**
 * Per-dungeon point override
 */
export interface QuotaDungeonOverride {
    dungeon_key: string;
    points: number;
}

/**
 * Get quota configuration for a specific role in a guild
 */
export async function getQuotaRoleConfig(
    guildId: string,
    discordRoleId: string
): Promise<QuotaRoleConfig | null> {
    const res = await query<QuotaRoleConfig>(
        `SELECT guild_id, discord_role_id, required_points, reset_at, panel_message_id, created_at
         FROM quota_role_config
         WHERE guild_id = $1::bigint AND discord_role_id = $2::bigint`,
        [guildId, discordRoleId]
    );

    return (res.rowCount ?? 0) > 0 ? res.rows[0] : null;
}

/**
 * Get all quota role configs for a guild
 */
export async function getAllQuotaRoleConfigs(
    guildId: string
): Promise<QuotaRoleConfig[]> {
    const res = await query<QuotaRoleConfig>(
        `SELECT guild_id, discord_role_id, required_points, reset_at, panel_message_id, created_at
         FROM quota_role_config
         WHERE guild_id = $1::bigint
         ORDER BY discord_role_id`,
        [guildId]
    );

    return res.rows;
}

/**
 * Create or update quota role configuration
 */
export async function upsertQuotaRoleConfig(
    guildId: string,
    discordRoleId: string,
    config: {
        required_points?: number;
        reset_at?: string; // ISO timestamp
        panel_message_id?: string | null;
        created_at?: string; // ISO timestamp - for resetting quota periods
    }
): Promise<QuotaRoleConfig> {
    const fields: string[] = [];
    const values: any[] = [guildId, discordRoleId];
    let idx = 3;

    // For INSERT, we need default values
    const requiredPoints = config.required_points ?? 0;
    const resetAt = config.reset_at ?? null; // Will use COALESCE in query
    const createdAt = config.created_at ?? null; // Will use COALESCE in query
    
    values.push(requiredPoints); // $3
    values.push(resetAt); // $4
    values.push(createdAt); // $5

    // Build UPDATE fields
    if (config.required_points !== undefined) {
        fields.push(`required_points = $${idx}`);
    }
    idx++; // Move past $3
    
    if (config.reset_at !== undefined) {
        fields.push(`reset_at = $${idx}::timestamptz`);
    }
    idx++; // Move past $4
    
    if (config.created_at !== undefined) {
        fields.push(`created_at = $${idx}::timestamptz`);
    }
    idx++; // Move past $5
    
    if (config.panel_message_id !== undefined) {
        fields.push(`panel_message_id = $${idx++}::bigint`);
        values.push(config.panel_message_id);
    }

    const updateClause = fields.length > 0 ? `, ${fields.join(', ')}` : '';

    const res = await query<QuotaRoleConfig>(
        `INSERT INTO quota_role_config (guild_id, discord_role_id, required_points, reset_at, created_at, updated_at)
         VALUES ($1::bigint, $2::bigint, 
                 $3, 
                 COALESCE($4::timestamptz, NOW() + INTERVAL '7 days'),
                 COALESCE($5::timestamptz, NOW()),
                 NOW())
         ON CONFLICT (guild_id, discord_role_id)
         DO UPDATE SET updated_at = NOW() ${updateClause}
         RETURNING guild_id, discord_role_id, required_points, reset_at, panel_message_id, created_at`,
        values
    );

    return res.rows[0];
}

/**
 * Get dungeon point overrides for a specific role
 */
export async function getDungeonOverrides(
    guildId: string,
    discordRoleId: string
): Promise<Record<string, number>> {
    const res = await query<{ dungeon_key: string; points: string }>(
        `SELECT dungeon_key, points
         FROM quota_dungeon_override
         WHERE guild_id = $1::bigint AND discord_role_id = $2::bigint`,
        [guildId, discordRoleId]
    );

    const overrides: Record<string, number> = {};
    for (const row of res.rows) {
        overrides[row.dungeon_key] = Number(row.points);
    }
    return overrides;
}

/**
 * Set dungeon point override for a specific role
 */
export async function setDungeonOverride(
    guildId: string,
    discordRoleId: string,
    dungeonKey: string,
    points: number
): Promise<void> {
    await query(
        `INSERT INTO quota_dungeon_override (guild_id, discord_role_id, dungeon_key, points, updated_at)
         VALUES ($1::bigint, $2::bigint, $3, $4, NOW())
         ON CONFLICT (guild_id, discord_role_id, dungeon_key)
         DO UPDATE SET points = EXCLUDED.points, updated_at = NOW()`,
        [guildId, discordRoleId, dungeonKey, points]
    );
}

/**
 * Delete dungeon point override (reverts to default 1 point)
 */
export async function deleteDungeonOverride(
    guildId: string,
    discordRoleId: string,
    dungeonKey: string
): Promise<void> {
    await query(
        `DELETE FROM quota_dungeon_override
         WHERE guild_id = $1::bigint AND discord_role_id = $2::bigint AND dungeon_key = $3`,
        [guildId, discordRoleId, dungeonKey]
    );
}

/**
 * Calculate the start of the current quota period for a given config
 * For absolute datetime: if reset hasn't happened yet, start from when config was created
 * If reset already happened, it marks the start of the last reset (previous period)
 */
export function getQuotaPeriodStart(config: QuotaRoleConfig): Date {
    const resetAt = new Date(config.reset_at);
    const createdAt = new Date(config.created_at);
    const now = new Date();

    // If reset_at is in the future, the current period started when the config was created
    if (resetAt > now) {
        return createdAt;
    }

    // If reset_at has passed, the period started at the last reset time
    return resetAt;
}

/**
 * Calculate the end of the current quota period (next reset)
 * For absolute datetime:
 * - If reset_at is in the future, return reset_at (configured end time)
 * - If reset_at has passed, return NOW (the period is ongoing until a new reset is configured)
 */
export function getQuotaPeriodEnd(config: QuotaRoleConfig): Date {
    const resetAt = new Date(config.reset_at);
    const now = new Date();

    // If reset_at is in the future, that's the end of the current period
    if (resetAt > now) {
        return resetAt;
    }

    // If reset_at has passed, the period is ongoing - return NOW as the end
    // This shows accumulated stats since the last reset
    return now;
}

/**
 * Log a quota event for a guild member.
 * This is an append-only operation that tracks points earned for actions.
 * 
 * Idempotency:
 * - For 'run_completed': Uses unique constraint on (guild_id, subject_id) to prevent double-counting
 * - For 'verify_member': No constraint, each verification is unique
 * 
 * @param guildId - Discord guild ID
 * @param actorUserId - Discord user ID who earned the points
 * @param actionType - Type of action that earned points
 * @param subjectId - Optional subject identifier for idempotency (e.g., 'run:123')
 * @param dungeonKey - Optional dungeon identifier for per-dungeon tracking (e.g., 'fungal', 'osanc')
 * @param points - Optional point override (defaults to action type default)
 * @returns The created quota event or null if it was a duplicate (idempotent no-op)
 */
export async function logQuotaEvent(
    guildId: string,
    actorUserId: string,
    actionType: QuotaActionType,
    subjectId?: string,
    dungeonKey?: string,
    points?: number
): Promise<{ id: number; points: number } | null> {
    const effectivePoints = points ?? getDefaultPoints(actionType);

    try {
        const res = await query<{ id: number; points: number }>(
            `INSERT INTO quota_event (guild_id, actor_user_id, action_type, subject_id, dungeon_key, points)
             VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6)
             ON CONFLICT (guild_id, subject_id) WHERE action_type = 'run_completed' AND subject_id IS NOT NULL
             DO NOTHING
             RETURNING id, points`,
            [guildId, actorUserId, actionType, subjectId || null, dungeonKey || null, effectivePoints]
        );

        if (res.rowCount === 0) {
            // Duplicate event (idempotent no-op)
            console.log(`[Quota] Skipped duplicate quota event: guild=${guildId}, actor=${actorUserId}, action=${actionType}, subject=${subjectId}, dungeon=${dungeonKey}`);
            return null;
        }

        console.log(`[Quota] Logged quota event: guild=${guildId}, actor=${actorUserId}, action=${actionType}, subject=${subjectId}, dungeon=${dungeonKey}, points=${effectivePoints}`);
        return res.rows[0];
    } catch (err) {
        console.error(`[Quota] Failed to log quota event:`, err);
        throw err;
    }
}

/**
 * Check if a run has already been logged for quota.
 * This is used by manual logging endpoints to prevent double-counting.
 * 
 * @param guildId - Discord guild ID
 * @param runId - Run ID to check
 * @returns true if the run has already been logged, false otherwise
 */
export async function isRunAlreadyLogged(
    guildId: string,
    runId: number
): Promise<boolean> {
    const res = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM quota_event
         WHERE guild_id = $1::bigint 
           AND action_type = 'run_completed' 
           AND subject_id = $2`,
        [guildId, `run:${runId}`]
    );

    return Number(res.rows[0].count) > 0;
}

/**
 * Get quota statistics for a user in a guild.
 * Returns total points and per-action/per-dungeon breakdowns.
 * 
 * @param guildId - Discord guild ID
 * @param userId - Discord user ID
 * @returns Quota statistics including total points and breakdowns
 */
export async function getUserQuotaStats(
    guildId: string,
    userId: string
): Promise<{
    total_points: number;
    total_runs_organized: number;
    total_verifications: number;
    dungeons: Array<{ dungeon_key: string; count: number; points: number }>;
}> {
    // Get total points
    const totalRes = await query<{ total: string }>(
        `SELECT COALESCE(SUM(points), 0)::text AS total
         FROM quota_event
         WHERE guild_id = $1::bigint AND actor_user_id = $2::bigint`,
        [guildId, userId]
    );

    // Get run count
    const runsRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM quota_event
         WHERE guild_id = $1::bigint 
           AND actor_user_id = $2::bigint
           AND action_type = 'run_completed'`,
        [guildId, userId]
    );

    // Get verification count
    const verifRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM quota_event
         WHERE guild_id = $1::bigint 
           AND actor_user_id = $2::bigint
           AND action_type = 'verify_member'`,
        [guildId, userId]
    );

    // Get per-dungeon breakdown
    const dungeonsRes = await query<{ dungeon_key: string; count: string; total_points: string }>(
        `SELECT dungeon_key, COUNT(*)::text AS count, SUM(points)::text AS total_points
         FROM quota_event
         WHERE guild_id = $1::bigint 
           AND actor_user_id = $2::bigint
           AND action_type = 'run_completed'
           AND dungeon_key IS NOT NULL
         GROUP BY dungeon_key
         ORDER BY total_points DESC, count DESC`,
        [guildId, userId]
    );

    return {
        total_points: Number(totalRes.rows[0].total),
        total_runs_organized: Number(runsRes.rows[0].count),
        total_verifications: Number(verifRes.rows[0].count),
        dungeons: dungeonsRes.rows.map(row => ({
            dungeon_key: row.dungeon_key,
            count: Number(row.count),
            points: Number(row.total_points),
        })),
    };
}

/**
 * Get quota leaderboard for a specific role and time period
 */
export async function getQuotaLeaderboard(
    guildId: string,
    discordRoleId: string,
    memberUserIds: string[],
    periodStart: Date,
    periodEnd: Date
): Promise<Array<{ user_id: string; points: number; runs: number }>> {
    if (memberUserIds.length === 0) {
        return [];
    }

    console.log(`[Quota Leaderboard Query] guild=${guildId}, role=${discordRoleId}, members=${memberUserIds.length}, period=${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

    const res = await query<{ actor_user_id: string; total_points: string; run_count: string }>(
        `SELECT actor_user_id, 
                COALESCE(SUM(points), 0)::text AS total_points,
                COUNT(CASE WHEN action_type = 'run_completed' THEN 1 END)::text AS run_count
         FROM quota_event
         WHERE guild_id = $1::bigint 
           AND actor_user_id = ANY($2::bigint[])
           AND created_at >= $3
           AND created_at < $4
         GROUP BY actor_user_id
         ORDER BY total_points DESC, run_count DESC
         LIMIT 50`,
        [guildId, memberUserIds, periodStart.toISOString(), periodEnd.toISOString()]
    );

    console.log(`[Quota Leaderboard Query] Found ${res.rowCount} rows`);
    if (res.rowCount === 0) {
        console.log(`[Quota Leaderboard Query] No events found - checking if events exist for these users...`);
        const checkRes = await query(
            `SELECT COUNT(*) as count FROM quota_event WHERE guild_id = $1::bigint AND actor_user_id = ANY($2::bigint[])`,
            [guildId, memberUserIds]
        );
        console.log(`[Quota Leaderboard Query] Total events for these users (any time): ${checkRes.rows[0].count}`);
    }

    return res.rows.map(row => ({
        user_id: row.actor_user_id,
        points: Number(row.total_points),
        runs: Number(row.run_count),
    }));
}

/**
 * Get quota stats for all members with a specific role in the current period
 */
export async function getQuotaStatsForRole(
    guildId: string,
    memberUserIds: string[],
    periodStart: Date,
    periodEnd: Date
): Promise<Map<string, { points: number; runs: number }>> {
    if (memberUserIds.length === 0) {
        return new Map();
    }

    const res = await query<{ actor_user_id: string; total_points: string; run_count: string }>(
        `SELECT actor_user_id, 
                COALESCE(SUM(points), 0)::text AS total_points,
                COUNT(CASE WHEN action_type = 'run_completed' THEN 1 END)::text AS run_count
         FROM quota_event
         WHERE guild_id = $1::bigint 
           AND actor_user_id = ANY($2::bigint[])
           AND created_at >= $3
           AND created_at < $4
         GROUP BY actor_user_id`,
        [guildId, memberUserIds, periodStart.toISOString(), periodEnd.toISOString()]
    );

    const statsMap = new Map<string, { points: number; runs: number }>();
    for (const row of res.rows) {
        statsMap.set(row.actor_user_id, {
            points: Number(row.total_points),
            runs: Number(row.run_count),
        });
    }

    return statsMap;
}
