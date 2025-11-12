// backend/src/routes/quota.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { zSnowflake } from '../lib/constants.js';
import { Errors } from '../lib/errors.js';
import { hasInternalRole, canManageGuildRoles } from '../lib/authorization.js';
import { 
    logQuotaEvent, 
    isRunAlreadyLogged, 
    getUserQuotaStats,
    getQuotaRoleConfig,
    getAllQuotaRoleConfigs,
    upsertQuotaRoleConfig,
    getDungeonOverrides,
    setDungeonOverride,
    deleteDungeonOverride,
    getQuotaLeaderboard,
    getQuotaPeriodStart,
    getQuotaPeriodEnd,
} from '../lib/quota.js';

/**
 * Body schema for manually logging run quota.
 */
const LogRunBody = z.object({
    actorId: zSnowflake,
    actorRoles: z.array(zSnowflake).optional(),
    guildId: zSnowflake,
    runId: z.number().int().positive().optional(), // Optional if dungeonKey is provided
    dungeonKey: z.string().optional(), // Optional dungeon key - will find most recent run
    amount: z.number().int().default(1), // Can be negative to remove quota
});

export default async function quotaRoutes(app: FastifyInstance) {
    /**
     * POST /quota/log-run
     * Manually log run completion quota for an organizer.
     * Authorization: actorId must have organizer role or higher.
     * No idempotency: Can be called multiple times for the same run.
     * Supports negative amounts to remove quota points.
     * 
     * Body: { actorId, actorRoles?, guildId, runId?, dungeonKey?, amount? }
     * Returns: { logged: number, already_logged: false, total_points: number, organizer_id: string }
     */
    app.post('/quota/log-run', async (req, reply) => {
        const parsed = LogRunBody.safeParse(req.body);
        if (!parsed.success) {
            const msg = parsed.error.issues.map(i => i.message).join('; ');
            return Errors.validation(reply, msg);
        }

        let { actorId, actorRoles, guildId, runId, dungeonKey, amount } = parsed.data;

        // Validate that either runId or dungeonKey is provided
        if (!runId && !dungeonKey) {
            return Errors.validation(reply, 'Either runId or dungeonKey must be provided');
        }

        // If dungeonKey is provided but not runId, find the most recent run
        if (dungeonKey && !runId) {
            const recentRunRes = await query<{ id: number }>(
                `SELECT id FROM run 
                 WHERE guild_id = $1::bigint 
                   AND organizer_id = $2::bigint 
                   AND dungeon_key = $3
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [guildId, actorId, dungeonKey]
            );

            if (recentRunRes.rowCount === 0) {
                return reply.code(404).send({
                    error: {
                        code: 'RUN_NOT_FOUND',
                        message: `No ${dungeonKey} runs found for organizer ${actorId}`,
                    },
                });
            }

            runId = recentRunRes.rows[0].id;
        }

        // Authorization: actor must have organizer role or higher
        const hasOrganizerRole = await hasInternalRole(guildId, actorId, 'organizer', actorRoles);
        if (!hasOrganizerRole) {
            console.log(`[Quota] User ${actorId} in guild ${guildId} denied - no organizer role`);
            return reply.code(403).send({
                error: {
                    code: 'NOT_ORGANIZER',
                    message: 'You must have the Organizer role to log runs',
                },
            });
        }

        // Verify run exists and get organizer and dungeon_key
        const runRes = await query<{ organizer_id: string; guild_id: string; status: string; dungeon_key: string }>(
            `SELECT organizer_id, guild_id, status, dungeon_key FROM run WHERE id = $1::bigint`,
            [runId]
        );

        if (runRes.rowCount === 0) {
            return Errors.runNotFound(reply, runId);
        }

        const run = runRes.rows[0];

        // Verify run is in the correct guild
        if (run.guild_id !== guildId) {
            return reply.code(400).send({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Run ${runId} does not belong to guild ${guildId}`,
                },
            });
        }

        // Log quota events for the organizer
        const organizerId = run.organizer_id;
        const runDungeonKey = run.dungeon_key;
        let totalPoints = 0;
        let loggedCount = 0;

        try {
            // Log events based on amount (can be positive or negative)
            const absoluteAmount = Math.abs(amount);
            
            for (let i = 0; i < absoluteAmount; i++) {
                const event = await logQuotaEvent(
                    guildId,
                    organizerId,
                    'run_completed',
                    undefined, // No subject_id - allow unlimited logging
                    runDungeonKey,
                    amount > 0 ? 1 : -1 // Positive adds points, negative removes
                );

                if (event) {
                    totalPoints += event.points;
                    loggedCount += 1;
                }
            }

            console.log(`[Quota] Manually logged ${loggedCount} run(s) for organizer ${organizerId} in guild ${guildId} (dungeon: ${runDungeonKey}, total points: ${totalPoints})`);

            return reply.code(200).send({
                logged: loggedCount,
                already_logged: false,
                total_points: totalPoints,
                organizer_id: organizerId,
            });
        } catch (err) {
            console.error(`[Quota] Failed to manually log run:`, err);
            return Errors.internal(reply, 'Failed to log quota event');
        }
    });

    /**
     * GET /quota/stats/:guild_id/:user_id
     * Get quota statistics for a user in a guild.
     * Returns total points, run counts, and per-dungeon breakdown.
     * 
     * Returns: { total_points, total_runs_organized, total_verifications, dungeons: [{ dungeon_key, count, points }] }
     */
    app.get('/quota/stats/:guild_id/:user_id', async (req, reply) => {
        const Params = z.object({
            guild_id: zSnowflake,
            user_id: zSnowflake,
        });

        const parsed = Params.safeParse(req.params);
        if (!parsed.success) {
            const msg = parsed.error.issues.map(i => i.message).join('; ');
            return Errors.validation(reply, msg);
        }

        const { guild_id, user_id } = parsed.data;

        try {
            const stats = await getUserQuotaStats(guild_id, user_id);
            return reply.code(200).send(stats);
        } catch (err) {
            console.error(`[Quota] Failed to get stats for user ${user_id} in guild ${guild_id}:`, err);
            return Errors.internal(reply, 'Failed to retrieve quota statistics');
        }
    });

    /**
     * GET /quota/config/:guild_id/:role_id
     * Get quota configuration for a specific role
     */
    app.get('/quota/config/:guild_id/:role_id', async (req, reply) => {
        const Params = z.object({
            guild_id: zSnowflake,
            role_id: zSnowflake,
        });

        const parsed = Params.safeParse(req.params);
        if (!parsed.success) {
            return Errors.validation(reply, 'Invalid parameters');
        }

        const { guild_id, role_id } = parsed.data;

        try {
            const config = await getQuotaRoleConfig(guild_id, role_id);
            const overrides = config ? await getDungeonOverrides(guild_id, role_id) : {};

            return reply.send({
                config: config || null,
                dungeon_overrides: overrides,
            });
        } catch (err) {
            console.error(`[Quota] Failed to get config:`, err);
            return Errors.internal(reply, 'Failed to retrieve quota configuration');
        }
    });

    /**
     * GET /quota/configs/:guild_id
     * Get all quota configurations for a guild
     */
    app.get('/quota/configs/:guild_id', async (req, reply) => {
        const Params = z.object({
            guild_id: zSnowflake,
        });

        const parsed = Params.safeParse(req.params);
        if (!parsed.success) {
            return Errors.validation(reply, 'Invalid guild_id');
        }

        const { guild_id } = parsed.data;

        try {
            const configs = await getAllQuotaRoleConfigs(guild_id);
            
            // Get overrides for each config
            const configsWithOverrides = await Promise.all(
                configs.map(async (config) => ({
                    ...config,
                    dungeon_overrides: await getDungeonOverrides(guild_id, config.discord_role_id),
                }))
            );

            return reply.send({ configs: configsWithOverrides });
        } catch (err) {
            console.error(`[Quota] Failed to get configs for guild ${guild_id}:`, err);
            return Errors.internal(reply, 'Failed to retrieve quota configurations');
        }
    });

    /**
     * PUT /quota/config/:guild_id/:role_id
     * Update quota configuration for a specific role
     * Body: { actor_user_id, actor_roles?, actor_has_admin_permission?, required_points?, reset_at? }
     */
    app.put('/quota/config/:guild_id/:role_id', async (req, reply) => {
        const Params = z.object({
            guild_id: zSnowflake,
            role_id: zSnowflake,
        });

        const Body = z.object({
            actor_user_id: zSnowflake,
            actor_roles: z.array(zSnowflake).optional(),
            actor_has_admin_permission: z.boolean().optional(),
            required_points: z.number().int().min(0).optional(),
            reset_at: z.string().optional(), // ISO timestamp YYYY-MM-DDTHH:MM:SSZ
            created_at: z.string().optional(), // ISO timestamp - for resetting quota periods
            panel_message_id: zSnowflake.nullable().optional(),
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);

        if (!p.success || !b.success) {
            return Errors.validation(reply, 'Invalid request');
        }

        const { guild_id, role_id } = p.data;
        const { actor_user_id, actor_roles, actor_has_admin_permission, ...config } = b.data;

        // Authorization: must have admin permission or administrator role
        let authorized = false;
        if (actor_has_admin_permission) {
            authorized = true;
        } else {
            authorized = await canManageGuildRoles(guild_id, actor_user_id, actor_roles);
        }

        if (!authorized) {
            return Errors.notAuthorized(reply);
        }

        try {
            const updated = await upsertQuotaRoleConfig(guild_id, role_id, config);
            const overrides = await getDungeonOverrides(guild_id, role_id);

            return reply.send({
                config: updated,
                dungeon_overrides: overrides,
            });
        } catch (err) {
            console.error(`[Quota] Failed to update config:`, err);
            return Errors.internal(reply, 'Failed to update quota configuration');
        }
    });

    /**
     * PUT /quota/config/:guild_id/:role_id/dungeon/:dungeon_key
     * Set dungeon point override
     * Body: { actor_user_id, actor_roles?, actor_has_admin_permission?, points }
     */
    app.put('/quota/config/:guild_id/:role_id/dungeon/:dungeon_key', async (req, reply) => {
        const Params = z.object({
            guild_id: zSnowflake,
            role_id: zSnowflake,
            dungeon_key: z.string(),
        });

        const Body = z.object({
            actor_user_id: zSnowflake,
            actor_roles: z.array(zSnowflake).optional(),
            actor_has_admin_permission: z.boolean().optional(),
            points: z.number().int().min(0),
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);

        if (!p.success || !b.success) {
            return Errors.validation(reply, 'Invalid request');
        }

        const { guild_id, role_id, dungeon_key } = p.data;
        const { actor_user_id, actor_roles, actor_has_admin_permission, points } = b.data;

        // Authorization
        let authorized = false;
        if (actor_has_admin_permission) {
            authorized = true;
        } else {
            authorized = await canManageGuildRoles(guild_id, actor_user_id, actor_roles);
        }

        if (!authorized) {
            return Errors.notAuthorized(reply);
        }

        try {
            // Ensure quota_role_config exists before setting dungeon override
            let config = await getQuotaRoleConfig(guild_id, role_id);
            if (!config) {
                // Create default config with reset 7 days from now
                const resetDate = new Date();
                resetDate.setDate(resetDate.getDate() + 7);
                config = await upsertQuotaRoleConfig(guild_id, role_id, {
                    required_points: 0,
                    reset_at: resetDate.toISOString(),
                });
            }

            await setDungeonOverride(guild_id, role_id, dungeon_key, points);
            const overrides = await getDungeonOverrides(guild_id, role_id);

            return reply.send({ dungeon_overrides: overrides });
        } catch (err) {
            console.error(`[Quota] Failed to set dungeon override:`, err);
            return Errors.internal(reply, 'Failed to update dungeon override');
        }
    });

    /**
     * DELETE /quota/config/:guild_id/:role_id/dungeon/:dungeon_key
     * Delete dungeon point override (revert to default)
     * Body: { actor_user_id, actor_roles?, actor_has_admin_permission? }
     */
    app.delete('/quota/config/:guild_id/:role_id/dungeon/:dungeon_key', async (req, reply) => {
        const Params = z.object({
            guild_id: zSnowflake,
            role_id: zSnowflake,
            dungeon_key: z.string(),
        });

        const Body = z.object({
            actor_user_id: zSnowflake,
            actor_roles: z.array(zSnowflake).optional(),
            actor_has_admin_permission: z.boolean().optional(),
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);

        if (!p.success || !b.success) {
            return Errors.validation(reply, 'Invalid request');
        }

        const { guild_id, role_id, dungeon_key } = p.data;
        const { actor_user_id, actor_roles, actor_has_admin_permission } = b.data;

        // Authorization
        let authorized = false;
        if (actor_has_admin_permission) {
            authorized = true;
        } else {
            authorized = await canManageGuildRoles(guild_id, actor_user_id, actor_roles);
        }

        if (!authorized) {
            return Errors.notAuthorized(reply);
        }

        try {
            await deleteDungeonOverride(guild_id, role_id, dungeon_key);
            const overrides = await getDungeonOverrides(guild_id, role_id);

            return reply.send({ dungeon_overrides: overrides });
        } catch (err) {
            console.error(`[Quota] Failed to delete dungeon override:`, err);
            return Errors.internal(reply, 'Failed to delete dungeon override');
        }
    });

    /**
     * POST /quota/leaderboard/:guild_id/:role_id
     * Get quota leaderboard for a specific role
     * Body: { member_user_ids: string[] }
     */
    app.post('/quota/leaderboard/:guild_id/:role_id', async (req, reply) => {
        const Params = z.object({
            guild_id: zSnowflake,
            role_id: zSnowflake,
        });

        const Body = z.object({
            member_user_ids: z.array(zSnowflake),
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);

        if (!p.success || !b.success) {
            return Errors.validation(reply, 'Invalid request');
        }

        const { guild_id, role_id } = p.data;
        const { member_user_ids } = b.data;

        try {
            const config = await getQuotaRoleConfig(guild_id, role_id);
            if (!config) {
                return reply.code(404).send({
                    error: {
                        code: 'CONFIG_NOT_FOUND',
                        message: 'No quota configuration found for this role',
                    },
                });
            }

            const periodStart = getQuotaPeriodStart(config);
            const periodEnd = getQuotaPeriodEnd(config);
            
            console.log(`[Quota Leaderboard] Config created_at: ${config.created_at}, reset_at: ${config.reset_at}`);
            console.log(`[Quota Leaderboard] Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);
            
            const leaderboard = await getQuotaLeaderboard(guild_id, role_id, member_user_ids, periodStart, periodEnd);
            
            console.log(`[Quota Leaderboard] Found ${leaderboard.length} entries for ${member_user_ids.length} members`);

            return reply.send({
                config,
                period_start: periodStart.toISOString(),
                period_end: periodEnd.toISOString(),
                leaderboard,
            });
        } catch (err) {
            console.error(`[Quota] Failed to get leaderboard:`, err);
            return Errors.internal(reply, 'Failed to retrieve leaderboard');
        }
    });
}
