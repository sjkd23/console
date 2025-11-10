import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';

const CreateRun = z.object({
    guildId: z.string().min(1),
    guildName: z.string().min(1),
    organizerId: z.string().min(1),
    organizerUsername: z.string().min(1),
    channelId: z.string().min(1),
    dungeonKey: z.string().min(1).max(64),
    dungeonLabel: z.string().min(1).max(100),
});

export default async function runsRoutes(app: FastifyInstance) {
    // Create a run
    app.post('/runs', async (req, reply) => {
        const parsed = CreateRun.safeParse(req.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: 'Invalid body', issues: parsed.error.issues });
        }
        const {
            guildId, guildName, organizerId, organizerUsername,
            channelId, dungeonKey, dungeonLabel
        } = parsed.data;

        // upsert guild & member
        await query(
            `INSERT INTO guild (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
            [guildId, guildName]
        );
        await query(
            `INSERT INTO member (id, username) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
            [organizerId, organizerUsername]
        );

        const res = await query<{ id: number }>(
            `INSERT INTO run (guild_id, organizer_id, dungeon_key, dungeon_label, channel_id, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING id`,
            [guildId, organizerId, dungeonKey, dungeonLabel, channelId]
        );

        return reply.code(201).send({ runId: res.rows[0].id });
    });

    // Join reaction (upsert to 'join') and return current count
    app.post('/runs/:id/reactions', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({ userId: z.string().min(1) });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) {
            return reply.code(400).send({ error: 'Invalid input' });
        }
        const runId = Number(p.data.id);
        const { userId } = b.data;

        await query(
            `INSERT INTO member (id, username) VALUES ($1, NULL)
       ON CONFLICT (id) DO NOTHING`,
            [userId]
        );

        await query(
            `INSERT INTO reaction (run_id, user_id, state)
       VALUES ($1, $2, 'join')
       ON CONFLICT (run_id, user_id)
       DO UPDATE SET state = 'join', updated_at = now()`,
            [runId, userId]
        );

        const countRes = await query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
       FROM reaction
       WHERE run_id = $1 AND state = 'join'`,
            [runId]
        );

        return reply.send({ count: Number(countRes.rows[0].count) });
    });

    // PATCH /v1/runs/:id  { status: "started" | "ended" }
    app.patch('/runs/:id', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({ status: z.enum(['started', 'ended']) });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) {
            return reply.code(400).send({ error: 'Invalid input' });
        }
        const runId = Number(p.data.id);
        const { status } = b.data;

        if (status === 'started') {
            await query(`UPDATE run SET status='started', started_at=now() WHERE id=$1`, [runId]);
        } else {
            await query(`UPDATE run SET status='ended', ended_at=now() WHERE id=$1`, [runId]);
        }

        return reply.send({ ok: true, status });
    });


    // Save the Discord message id we posted to the channel
    app.post('/runs/:id/message', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const Body = z.object({ postMessageId: z.string().min(1) });

        const p = Params.safeParse(req.params);
        const b = Body.safeParse(req.body);
        if (!p.success || !b.success) return reply.code(400).send({ error: 'Invalid input' });

        const runId = Number(p.data.id);
        await query(
            `UPDATE run SET post_message_id = $2 WHERE id = $1`,
            [runId, b.data.postMessageId]
        );

        return reply.send({ ok: true });
    });

    // Minimal getter so the bot can locate the public message later
    app.get('/runs/:id', async (req, reply) => {
        const Params = z.object({ id: z.string().regex(/^\d+$/) });
        const p = Params.safeParse(req.params);
        if (!p.success) return reply.code(400).send({ error: 'Invalid input' });

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
     WHERE id = $1`,
            [runId]
        );

        if (res.rowCount === 0) return reply.code(404).send({ error: 'Not found' });

        const r = res.rows[0];
        return reply.send({
            id: r.id,
            channelId: r.channel_id,
            postMessageId: r.post_message_id,
            dungeonLabel: r.dungeon_label,
            status: r.status
        });
    });

}
