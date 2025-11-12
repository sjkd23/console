// backend/src/routes/runs.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { zSnowflake, zReactionState } from '../lib/constants';
import { Errors } from '../lib/errors';
import { hasInternalRole } from '../lib/authorization.js';
import { logQuotaEvent } from '../lib/quota.js';

/**
 * Body schema for creating a run.
 * Uses Snowflake guards for all Discord IDs.
 */
const CreateRun = z.object({
    guildId: zSnowflake,
    guildName: z.string().min(1),
    organizerId: zSnowflake,
    organizerUsername: z.string().min(1),
    organizerRoles: z.array(zSnowflake).optional(), // Discord role IDs of the organizer
    channelId: zSnowflake,
    dungeonKey: z.string().trim().min(1).max(64),
    dungeonLabel: z.string().trim().min(1).max(100),
    description: z.string().optional(),
    party: z.string().optional(),
    location: z.string().optional(),
    autoEndMinutes: z.number().int().positive().max(1440).default(120), // default 2 hours, max 24 hours
});

export default async function runsRoutes(app: FastifyInstance) {
    /**
     * POST /runs
     * Create a new run record (status=open) and upsert guild/member.
     */
    app.post('/runs', async (req, reply) => {
        const parsed = CreateRun.safeParse(req.body);
        if (!parsed.success) {
            const msg = parsed.error.issues.map(i => i.message).join('; ');
            return Errors.validation(reply, msg);
        }
        const {
            guildId,
            guildName,
            organizerId,
            organizerUsername,
            organizerRoles,
            channelId,
            dungeonKey,
            dungeonLabel,
            description,
            party,
            location,
            autoEndMinutes,
        } = parsed.data;

        // Authorization: Check if user has organizer role
        const hasOrganizerRole = await hasInternalRole(guildId, organizerId, 'organizer', organizerRoles);
        if (!hasOrganizerRole) {
            console.log(`[Run Creation] User ${organizerId} in guild ${guildId} denied - no organizer role. User roles: ${organizerRoles?.join(', ') || 'none'}`);
            return reply.code(403).send({
                error: {
                    code: 'NOT_ORGANIZER',
                    message: 'You must have the Organizer role to create runs. Ask a server admin to configure roles with /setroles.',
                },
            });
        }

        // Upsert guild & member snapshots
        await query(
            `INSERT INTO guild (id, name) VALUES ($1::bigint, $2)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
            [guildId, guildName]
        );
        await query(
            `INSERT INTO member (id, username) VALUES ($1::bigint, $2)
        ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
            [organizerId, organizerUsername]
        );

        // Insert run (status=open)
        const res = await query<{ id: number }>(
            `INSERT INTO run (guild_id, organizer_id, dungeon_key, dungeon_label, channel_id, status, description, party, location, auto_end_minutes)
        VALUES ($1::bigint, $2::bigint, $3, $4, $5::bigint, 'open', $6, $7, $8, $9)
        RETURNING id`,
            [guildId, organizerId, dungeonKey, dungeonLabel, channelId, description, party, location, autoEndMinutes]
        );

        return reply.code(201).send({ runId: res.rows[0].id });
    });

    /**
   * POST /runs/:id/reactions
   * Body: { userId: Snowflake, state: 'join' | 'bench' | 'leave' }
   * Behavior:
   *  - 'leave'  -> delete (run_id, user_id)
   *  - 'join'/'bench' -> upsert state
   * Blocks if run is ended/cancelled.
   * Returns { joinCount, benchCount }.
   */
    app.post('/runs/:id/reactions', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({
            userId: zSnowflake,
            state: zReactionState, // 'join' | 'bench' | 'leave'
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) {
            return Errors.validation(reply);
        }
        const runId = Number(p.data.id);
        const { userId, state } = b.data;

        // Block edits for closed runs
        const statusRes = await query<{ status: string }>(
            `SELECT status FROM run WHERE id = $1::bigint`,
            [runId]
        );
        if (statusRes.rowCount === 0) {
            return Errors.runNotFound(reply, runId);
        }
        const currentStatus = statusRes.rows[0].status;
        if (currentStatus === 'ended') {
            return Errors.runClosed(reply);
        }

        // Ensure member exists
        await query(
            `INSERT INTO member (id, username) VALUES ($1::bigint, NULL)
        ON CONFLICT (id) DO NOTHING`,
            [userId]
        );

        if (state === 'leave') {
            // Delete the user’s reaction row (idempotent)
            await query(
                `DELETE FROM reaction WHERE run_id = $1::bigint AND user_id = $2::bigint`,
                [runId, userId]
            );
        } else {
            // Upsert to the selected state
            await query(
                `INSERT INTO reaction (run_id, user_id, state)
        VALUES ($1::bigint, $2::bigint, $3)
        ON CONFLICT (run_id, user_id)
        DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
                [runId, userId, state]
            );
        }

        // Return counts for quick UI updates
        const [joinRes, benchRes] = await Promise.all([
            query<{ count: string }>(
                `SELECT COUNT(*)::text AS count
         FROM reaction
        WHERE run_id = $1::bigint AND state = 'join'`,
                [runId]
            ),
            query<{ count: string }>(
                `SELECT COUNT(*)::text AS count
         FROM reaction
        WHERE run_id = $1::bigint AND state = 'bench'`,
                [runId]
            ),
        ]);

        return reply.send({
            joinCount: Number(joinRes.rows[0].count),
            benchCount: Number(benchRes.rows[0].count),
        });
    });

    /**
     * PATCH /runs/:id/reactions
     * Body: { userId: Snowflake, class: string }
     * Updates the user's class selection for a run.
     * Auto-joins the user if they haven't already.
     * Returns { joinCount, classCounts: Record<string, number> }.
     */
    app.patch('/runs/:id/reactions', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({
            userId: zSnowflake,
            class: z.string().trim().min(1).max(50),
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) {
            return Errors.validation(reply);
        }
        const runId = Number(p.data.id);
        const { userId, class: selectedClass } = b.data;

        // Block edits for closed runs
        const statusRes = await query<{ status: string }>(
            `SELECT status FROM run WHERE id = $1::bigint`,
            [runId]
        );
        if (statusRes.rowCount === 0) {
            return Errors.runNotFound(reply, runId);
        }
        const currentStatus = statusRes.rows[0].status;
        if (currentStatus === 'ended') {
            return Errors.runClosed(reply);
        }

        // Ensure member exists
        await query(
            `INSERT INTO member (id, username) VALUES ($1::bigint, NULL)
        ON CONFLICT (id) DO NOTHING`,
            [userId]
        );

        // Upsert reaction with class (default to 'join' if new)
        await query(
            `INSERT INTO reaction (run_id, user_id, state, class)
        VALUES ($1::bigint, $2::bigint, 'join', $3)
        ON CONFLICT (run_id, user_id)
        DO UPDATE SET class = EXCLUDED.class, updated_at = now()`,
            [runId, userId, selectedClass]
        );

        // Get join count
        const joinRes = await query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
         FROM reaction
        WHERE run_id = $1::bigint AND state = 'join'`,
            [runId]
        );

        // Get class counts (only for joined users)
        const classRes = await query<{ class: string | null; count: string }>(
            `SELECT class, COUNT(*)::text AS count
         FROM reaction
        WHERE run_id = $1::bigint AND state = 'join' AND class IS NOT NULL
        GROUP BY class`,
            [runId]
        );

        const classCounts: Record<string, number> = {};
        for (const row of classRes.rows) {
            if (row.class) {
                classCounts[row.class] = Number(row.count);
            }
        }

        return reply.send({
            joinCount: Number(joinRes.rows[0].count),
            classCounts,
        });
    });

    /**
     * PATCH /runs/:id
     * Body: { actorId: Snowflake, actorRoles?: string[], status: 'live' | 'ended', isAutoEnd?: boolean }
     * Allowed transitions: open->live, live->ended (or any->ended for auto-end).
     * Authorization: actorId must match run.organizer_id OR have organizer role.
     * For auto-end: isAutoEnd flag bypasses authorization and allows any->ended transition.
     */
    app.patch('/runs/:id', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({
            actorId: zSnowflake,
            actorRoles: z.array(zSnowflake).optional(),
            status: z.enum(['live', 'ended']),
            isAutoEnd: z.boolean().optional(), // Flag for automatic ending
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) {
            return Errors.validation(reply);
        }
        const runId = Number(p.data.id);
        const { actorId, actorRoles, status, isAutoEnd } = b.data;

        // Read current status AND organizer_id AND guild_id AND dungeon_key
        const cur = await query<{ status: string; organizer_id: string; guild_id: string; dungeon_key: string }>(
            `SELECT status, organizer_id, guild_id, dungeon_key FROM run WHERE id = $1::bigint`,
            [runId]
        );
        if (cur.rowCount === 0) return Errors.runNotFound(reply, runId);
        const from = cur.rows[0].status;
        const organizerId = cur.rows[0].organizer_id;
        const guildId = cur.rows[0].guild_id;
        const dungeonKey = cur.rows[0].dungeon_key;

        // Authorization: actor must be the organizer OR have organizer role (skip for auto-end)
        if (!isAutoEnd) {
            const isOrganizer = actorId === organizerId;
            const hasOrganizerRole = await hasInternalRole(guildId, actorId, 'organizer', actorRoles);
            
            if (!isOrganizer && !hasOrganizerRole) {
                return Errors.notOrganizer(reply);
            }
        }

        if (status === 'live') {
            // allow only open -> live
            if (from !== 'open') {
                return Errors.invalidStatusTransition(reply, from, status);
            }
            await query(
                `UPDATE run
            SET status='live',
                started_at = COALESCE(started_at, now())
          WHERE id = $1::bigint`,
                [runId]
            );
        } else {
            // status === 'ended'
            // For auto-end, allow any status -> ended
            // Otherwise, allow only live -> ended
            if (!isAutoEnd && from !== 'live') {
                return Errors.invalidStatusTransition(reply, from, status);
            }
            await query(
                `UPDATE run
            SET status='ended',
                ended_at = COALESCE(ended_at, now())
          WHERE id = $1::bigint`,
                [runId]
            );

            // Log quota event for organizer when run ends
            try {
                await logQuotaEvent(
                    guildId,
                    organizerId,
                    'run_completed',
                    `run:${runId}`,
                    dungeonKey, // Track dungeon for per-dungeon stats
                    1 // Default: 1 point per run
                );
            } catch (err) {
                // Log error but don't fail the request
                console.error(`[Runs] Failed to log quota event for run ${runId}:`, err);
            }
        }

        return reply.send({ ok: true, status });
    });

    /**
     * POST /runs/:id/message
     * Attach the public Discord message id to the run.
     */
    app.post('/runs/:id/message', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({ postMessageId: zSnowflake });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) return Errors.validation(reply);

        const runId = Number(p.data.id);
        await query(
            `UPDATE run SET post_message_id = $2::bigint WHERE id = $1::bigint`,
            [runId, b.data.postMessageId]
        );

        return reply.send({ ok: true });
    });

    /**
     * GET /runs/:id
     * Minimal getter to locate message + surface basic fields.
     */
    app.get('/runs/:id', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const p = Params.safeParse(req.params);
        if (!p.success) return Errors.validation(reply);

        const runId = Number(p.data.id);
        const res = await query<{
            id: number;
            channel_id: string | null;
            post_message_id: string | null;
            dungeon_label: string;
            status: string;
            organizer_id: string;
            started_at: string | null;
            ended_at: string | null;
            key_window_ends_at: string | null;
            party: string | null;
            location: string | null;
            description: string | null;
        }>(
            `SELECT id, channel_id, post_message_id, dungeon_label, status, organizer_id,
                    started_at, ended_at, key_window_ends_at, party, location, description
         FROM run
        WHERE id = $1::bigint`,
            [runId]
        );

        if (res.rowCount === 0) return Errors.runNotFound(reply, runId);

        const r = res.rows[0];
        return reply.send({
            id: r.id,
            channelId: r.channel_id,
            postMessageId: r.post_message_id,
            dungeonLabel: r.dungeon_label,
            status: r.status,
            organizerId: r.organizer_id,
            startedAt: r.started_at,
            endedAt: r.ended_at,
            keyWindowEndsAt: r.key_window_ends_at,
            party: r.party,
            location: r.location,
            description: r.description,
        });
    });

    /**
     * GET /runs/:id/classes
     * Get class counts for a run.
     */
    app.get('/runs/:id/classes', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const p = Params.safeParse(req.params);
        if (!p.success) return Errors.validation(reply);

        const runId = Number(p.data.id);

        // Get class counts (only for joined users)
        const classRes = await query<{ class: string | null; count: string }>(
            `SELECT class, COUNT(*)::text AS count
         FROM reaction
        WHERE run_id = $1::bigint AND state = 'join' AND class IS NOT NULL
        GROUP BY class`,
            [runId]
        );

        const classCounts: Record<string, number> = {};
        for (const row of classRes.rows) {
            if (row.class) {
                classCounts[row.class] = Number(row.count);
            }
        }

        return reply.send({ classCounts });
    });

    /**
     * GET /runs/expired
     * Get all runs that have exceeded their auto_end_minutes and should be auto-ended
     * Returns runs that are not 'ended' and have existed longer than auto_end_minutes
     */
    app.get('/runs/expired', async (req, reply) => {
        const res = await query<{
            id: number;
            guild_id: string;
            channel_id: string | null;
            post_message_id: string | null;
            dungeon_label: string;
            organizer_id: string;
            created_at: string;
            auto_end_minutes: number;
        }>(
            `SELECT id, guild_id, channel_id, post_message_id, dungeon_label, organizer_id, created_at, auto_end_minutes
             FROM run
             WHERE status != 'ended'
               AND created_at + (auto_end_minutes || ' minutes')::interval < NOW()
             ORDER BY created_at ASC`
        );

        return reply.send({ expired: res.rows });
    });

    /**
     * DELETE /runs/:id
     * Body: { actorId: Snowflake, actorRoles?: string[] }
     * Cancels the run (sets status to 'ended' with immediate effect).
     * Authorization: actorId must match run.organizer_id OR have organizer role.
     */
    app.delete('/runs/:id', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({
            actorId: zSnowflake,
            actorRoles: z.array(zSnowflake).optional(),
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) {
            return Errors.validation(reply);
        }
        const runId = Number(p.data.id);
        const { actorId, actorRoles } = b.data;

        // Read current status AND organizer_id AND guild_id
        const cur = await query<{ status: string; organizer_id: string; guild_id: string }>(
            `SELECT status, organizer_id, guild_id FROM run WHERE id = $1::bigint`,
            [runId]
        );
        if (cur.rowCount === 0) return Errors.runNotFound(reply, runId);
        const currentStatus = cur.rows[0].status;
        const organizerId = cur.rows[0].organizer_id;
        const guildId = cur.rows[0].guild_id;

        // Authorization: actor must be the organizer OR have organizer role
        const isOrganizer = actorId === organizerId;
        const hasOrganizerRole = await hasInternalRole(guildId, actorId, 'organizer', actorRoles);
        
        if (!isOrganizer && !hasOrganizerRole) {
            return Errors.notOrganizer(reply);
        }

        // Don't allow canceling already ended runs
        if (currentStatus === 'ended') {
            return Errors.alreadyTerminal(reply);
        }

        // Set status to ended (cancel = immediate end)
        await query(
            `UPDATE run SET status = 'ended', ended_at = COALESCE(ended_at, now()) WHERE id = $1::bigint`,
            [runId]
        );

        return reply.send({ ok: true, status: 'ended' });
    });

    /**
     * PATCH /runs/:id/key-window
     * Body: { actor_user_id: Snowflake, seconds?: number }
     * Sets key_window_ends_at to now() + seconds (default 30).
     * Requires status='live' and actor must be organizer.
     * Returns { key_window_ends_at: ISO string }.
     */
    app.patch('/runs/:id/key-window', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({
            actor_user_id: zSnowflake,
            seconds: z.number().int().positive().max(300).default(30),
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) {
            return Errors.validation(reply);
        }
        const runId = Number(p.data.id);
        const { actor_user_id, seconds } = b.data;

        // Read current status AND organizer_id
        const cur = await query<{ status: string; organizer_id: string }>(
            `SELECT status, organizer_id FROM run WHERE id = $1::bigint`,
            [runId]
        );
        if (cur.rowCount === 0) return Errors.runNotFound(reply, runId);
        const { status, organizer_id } = cur.rows[0];

        // Authorization: actor must be the organizer
        if (actor_user_id !== organizer_id) {
            return Errors.notOrganizer(reply);
        }

        // Must be live
        if (status !== 'live') {
            return reply.code(409).send({
                error: {
                    code: 'RUN_NOT_LIVE',
                    message: 'Can only pop keys during a live run',
                },
            });
        }

        // Set key_window_ends_at = now() + seconds
        const res = await query<{ key_window_ends_at: string }>(
            `UPDATE run
             SET key_window_ends_at = now() + ($2 || ' seconds')::interval
             WHERE id = $1::bigint
             RETURNING key_window_ends_at`,
            [runId, seconds]
        );

        return reply.send({ key_window_ends_at: res.rows[0].key_window_ends_at });
    });

    /**
     * PATCH /runs/:id/party
     * Body: { actorId: Snowflake, actorRoles?: string[], party: string }
     * Updates the party name for a run.
     * Authorization: actorId must match run.organizer_id OR have organizer role.
     * Returns { ok: true, party: string }.
     */
    app.patch('/runs/:id/party', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({
            actorId: zSnowflake,
            actorRoles: z.array(zSnowflake).optional(),
            party: z.string().trim().max(100),
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) {
            return Errors.validation(reply);
        }
        const runId = Number(p.data.id);
        const { actorId, actorRoles, party } = b.data;

        // Read current status AND organizer_id AND guild_id
        const cur = await query<{ status: string; organizer_id: string; guild_id: string }>(
            `SELECT status, organizer_id, guild_id FROM run WHERE id = $1::bigint`,
            [runId]
        );
        if (cur.rowCount === 0) return Errors.runNotFound(reply, runId);
        const { status, organizer_id, guild_id } = cur.rows[0];

        // Authorization: actor must be the organizer OR have organizer role
        const isOrganizer = actorId === organizer_id;
        const hasOrganizerRole = await hasInternalRole(guild_id, actorId, 'organizer', actorRoles);
        
        if (!isOrganizer && !hasOrganizerRole) {
            return Errors.notOrganizer(reply);
        }

        // Don't allow updating ended runs
        if (status === 'ended') {
            return Errors.runClosed(reply);
        }

        // Update party
        await query(
            `UPDATE run SET party = $2 WHERE id = $1::bigint`,
            [runId, party || null]
        );

        return reply.send({ ok: true, party });
    });

    /**
     * PATCH /runs/:id/location
     * Body: { actorId: Snowflake, actorRoles?: string[], location: string }
     * Updates the location for a run.
     * Authorization: actorId must match run.organizer_id OR have organizer role.
     * Returns { ok: true, location: string }.
     */
    app.patch('/runs/:id/location', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({
            actorId: zSnowflake,
            actorRoles: z.array(zSnowflake).optional(),
            location: z.string().trim().max(100),
        });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) {
            return Errors.validation(reply);
        }
        const runId = Number(p.data.id);
        const { actorId, actorRoles, location } = b.data;

        // Read current status AND organizer_id AND guild_id
        const cur = await query<{ status: string; organizer_id: string; guild_id: string }>(
            `SELECT status, organizer_id, guild_id FROM run WHERE id = $1::bigint`,
            [runId]
        );
        if (cur.rowCount === 0) return Errors.runNotFound(reply, runId);
        const { status, organizer_id, guild_id } = cur.rows[0];

        // Authorization: actor must be the organizer OR have organizer role
        const isOrganizer = actorId === organizer_id;
        const hasOrganizerRole = await hasInternalRole(guild_id, actorId, 'organizer', actorRoles);
        
        if (!isOrganizer && !hasOrganizerRole) {
            return Errors.notOrganizer(reply);
        }

        // Don't allow updating ended runs
        if (status === 'ended') {
            return Errors.runClosed(reply);
        }

        // Update location
        await query(
            `UPDATE run SET location = $2 WHERE id = $1::bigint`,
            [runId, location || null]
        );

        return reply.send({ ok: true, location });
    });
}

