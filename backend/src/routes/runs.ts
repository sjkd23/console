// backend/src/routes/runs.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { zSnowflake, zReactionState } from '../lib/constants';
import { Errors } from '../lib/errors';

/**
 * Body schema for creating a run.
 * Uses Snowflake guards for all Discord IDs.
 */
const CreateRun = z.object({
    guildId: zSnowflake,
    guildName: z.string().min(1),
    organizerId: zSnowflake,
    organizerUsername: z.string().min(1),
    channelId: zSnowflake,
    dungeonKey: z.string().trim().min(1).max(64),
    dungeonLabel: z.string().trim().min(1).max(100),
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
            channelId,
            dungeonKey,
            dungeonLabel,
        } = parsed.data;

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
            `INSERT INTO run (guild_id, organizer_id, dungeon_key, dungeon_label, channel_id, status)
        VALUES ($1::bigint, $2::bigint, $3, $4, $5::bigint, 'open')
        RETURNING id`,
            [guildId, organizerId, dungeonKey, dungeonLabel, channelId]
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
        if (currentStatus === 'ended' || currentStatus === 'cancelled') {
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
     * PATCH /runs/:id
     * Body: { status: 'started' | 'ended' }
     * Allowed transitions: open->started, started->ended.
     */
    app.patch('/runs/:id', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({ status: z.enum(['started', 'ended']) });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) {
            return Errors.validation(reply);
        }
        const runId = Number(p.data.id);
        const { status } = b.data;

        // Read current status
        const cur = await query<{ status: string }>(
            `SELECT status FROM run WHERE id = $1::bigint`,
            [runId]
        );
        if (cur.rowCount === 0) return Errors.runNotFound(reply, runId);
        const from = cur.rows[0].status;

        if (status === 'started') {
            // allow only open -> started
            if (from !== 'open') {
                return Errors.invalidStatusTransition(reply, from, status);
            }
            await query(
                `UPDATE run
            SET status='started',
                started_at = COALESCE(started_at, now())
          WHERE id = $1::bigint`,
                [runId]
            );
        } else {
            // status === 'ended' → allow only started -> ended
            if (from !== 'started') {
                return Errors.invalidStatusTransition(reply, from, status);
            }
            await query(
                `UPDATE run
            SET status='ended',
                ended_at = COALESCE(ended_at, now())
          WHERE id = $1::bigint`,
                [runId]
            );
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
        }>(
            `SELECT id, channel_id, post_message_id, dungeon_label, status
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
        });
    });
}
