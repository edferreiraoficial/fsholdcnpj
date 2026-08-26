import type { FastifyInstance } from 'fastify';
import { dbHealth } from '../lib/db.js';
import { job } from '../importer/job.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    const database = await dbHealth();
    return {
      ok: true,
      api: true,
      database,
      importer: {
        running: job.running,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        error: job.error
      }
    };
  });
}
