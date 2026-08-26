import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool } from './lib/db.js';
import { healthRoutes } from './routes/health.js';
import { prospectRoutes } from './routes/prospects.js';
import { importRoutes } from './routes/import.js';
import { emailRoutes } from './routes/email.js';

const app=Fastify({logger:true});
await app.register(cors,{origin:true});
await app.register(healthRoutes);
await app.register(prospectRoutes);
await app.register(importRoutes);
await app.register(emailRoutes);

app.setErrorHandler((error: any, _req, reply) => {
  app.log.error(error);

  reply.code(error.statusCode || 500).send({
    message: error.message || 'Erro interno',
    code: error.code
  });
});

const port=Number(process.env.PORT||3333);
const shutdown=async()=>{
  try{await pool.end();}catch{}
  try{await app.close();}catch{}
  process.exit(0);
};
process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);

await app.listen({port,host:'0.0.0.0'});
