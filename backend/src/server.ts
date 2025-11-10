import 'dotenv/config';
import Fastify from 'fastify';
import authPlugin from './plugins/auth.js';
import healthRoutes from './routes/health.js';
import runsRoutes from './routes/runs.js';

const app = Fastify({ logger: true });

await app.register(authPlugin);
await app.register(healthRoutes, { prefix: '/v1' });
await app.register(runsRoutes, { prefix: '/v1' }); // <-- this line is critical

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: '0.0.0.0' })
    .then(addr => app.log.info(`Backend listening on ${addr}`))
    .catch(err => { app.log.error(err); process.exit(1); });
