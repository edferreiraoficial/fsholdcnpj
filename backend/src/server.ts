import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
<<<<<<< HEAD
import { pool } from './lib/db.js';
import { healthRoutes } from './routes/health.js';
import { prospectRoutes } from './routes/prospects.js';
import { importRoutes } from './routes/import.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(healthRoutes);
await app.register(prospectRoutes);
await app.register(importRoutes);

app.setErrorHandler((error, _req, reply) => {
  app.log.error(error);
  reply.code((error as any).statusCode || 500).send({
    message: error.message || 'Erro interno',
    code: (error as any).code
  });
});

const port = Number(process.env.PORT || 3333);

const shutdown = async () => {
  try { await pool.end(); } catch {}
  try { await app.close(); } catch {}
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host: '0.0.0.0' });
=======
import mysql from 'mysql2/promise';
import { z } from 'zod';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: 'utf8mb4'
});

type ImportJob = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
  logs: string[];
  filters: Record<string, unknown> | null;
  child?: ChildProcessWithoutNullStreams;
};

const job: ImportJob = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  error: null,
  logs: [],
  filters: null
};

function appendLog(text: string) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) continue;
    job.logs.push(line);
  }
  if (job.logs.length > 1500) job.logs.splice(0, job.logs.length - 1500);
}

app.get('/health', async () => {
  const [rows] = await pool.query('SELECT DATABASE() banco, VERSION() versao, CURRENT_USER() usuario');
  return { ok: true, db: (rows as any[])[0] };
});

app.get('/dashboard', async () => {
  const [rows] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM prospects WHERE ativo=1) total_prospects,
      (SELECT COUNT(*) FROM prospect_crm WHERE status_id=1) nao_contatados,
      (SELECT COUNT(*) FROM prospect_crm WHERE status_id IN (4,5,6)) oportunidades,
      (SELECT COUNT(*) FROM prospect_crm WHERE status_id=7) clientes,
      (SELECT COUNT(*) FROM prospect_crm WHERE proximo_contato IS NOT NULL AND proximo_contato < NOW() AND status_id <> 7) retornos_atrasados
  `);
  return (rows as any[])[0];
});

app.get('/prospects', async (req) => {
  const schema = z.object({
    q: z.string().optional(),
    uf: z.string().optional(),
    municipio: z.string().optional(),
    situacao: z.string().optional(),
    cnae: z.string().optional(),
    porte: z.string().optional(),
    simples: z.string().optional(),
    mei: z.string().optional(),
    status: z.coerce.number().optional(),
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(10).max(100).default(25)
  });
  const f = schema.parse(req.query);
  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (f.q) {
    where.push('(v.cnpj LIKE ? OR v.razao_social LIKE ? OR v.nome_fantasia LIKE ? OR EXISTS (SELECT 1 FROM vw_socios_prospects s WHERE s.prospect_id=v.prospect_id AND s.nome_socio_razao_social LIKE ?))');
    const like = `%${f.q}%`; params.push(like, like, like, like);
  }
  if (f.uf) { where.push('v.uf=?'); params.push(f.uf); }
  if (f.municipio) { where.push('v.municipio=?'); params.push(f.municipio); }
  if (f.situacao) { where.push('v.situacao_cadastral=?'); params.push(f.situacao); }
  if (f.cnae) { where.push('v.cnae_principal=?'); params.push(f.cnae); }
  if (f.porte) { where.push('v.porte=?'); params.push(f.porte); }
  if (f.simples) { where.push('v.simples=?'); params.push(f.simples); }
  if (f.mei) { where.push('v.mei=?'); params.push(f.mei); }
  if (f.status) { where.push('v.status_id=?'); params.push(f.status); }

  const offset = (f.page - 1) * f.pageSize;
  const base = `FROM vw_prospects_completos v WHERE ${where.join(' AND ')}`;
  const [countRows] = await pool.query(`SELECT COUNT(*) total ${base}`, params);
  const [rows] = await pool.query(`
    SELECT v.prospect_id, v.cnpj, v.razao_social, v.nome_fantasia, v.situacao_cadastral,
           v.municipio, v.uf, v.cnae_principal, v.cnae_descricao, v.porte,
           v.telefone1, v.telefone2, v.email, v.status_crm, v.status_id,
           v.prioridade, v.proximo_contato, v.simples, v.mei
    ${base}
    ORDER BY v.razao_social
    LIMIT ? OFFSET ?
  `, [...params, f.pageSize, offset]);

  return { items: rows, total: (countRows as any[])[0].total, page: f.page, pageSize: f.pageSize };
});

app.get('/prospects/:id', async (req, reply) => {
  const id = Number((req.params as any).id);
  const [rows] = await pool.query('SELECT * FROM vw_prospects_completos WHERE prospect_id=?', [id]);
  const item = (rows as any[])[0];
  if (!item) return reply.code(404).send({ message: 'Prospect não encontrado' });

  const [socios] = await pool.query('SELECT * FROM vw_socios_prospects WHERE prospect_id=? ORDER BY nome_socio_razao_social', [id]);
  const [contatos] = await pool.query('SELECT * FROM prospect_contatos WHERE prospect_id=? ORDER BY data_contato DESC LIMIT 100', [id]);
  const [propostas] = await pool.query('SELECT * FROM prospect_propostas WHERE prospect_id=? ORDER BY criado_em DESC', [id]);
  return { ...item, socios, contatos, propostas };
});

app.get('/filters', async () => {
  const [municipios] = await pool.query('SELECT DISTINCT municipio FROM vw_prospects_completos WHERE municipio IS NOT NULL ORDER BY municipio');
  const [cnaes] = await pool.query('SELECT DISTINCT cnae_principal codigo, cnae_descricao descricao FROM vw_prospects_completos WHERE cnae_principal IS NOT NULL ORDER BY cnae_descricao LIMIT 1000');
  const [status] = await pool.query('SELECT id, nome FROM prospect_status WHERE ativo=1 ORDER BY ordem');
  return { municipios, cnaes, status };
});

app.get('/import/options', async () => {
  const [motivos] = await pool.query('SELECT codigo, descricao FROM motivos_situacao ORDER BY codigo');
  const [cnaes] = await pool.query('SELECT codigo, descricao FROM cnaes ORDER BY descricao LIMIT 5000');
  const [historico] = await pool.query(`
    SELECT id, referencia, filtro_uf, filtro_municipios, filtro_situacao,
           encontrados, inseridos, atualizados, ignorados, iniciado_em, finalizado_em, status, mensagem
      FROM importacoes_cnpj
     ORDER BY id DESC
     LIMIT 20
  `);
  return { motivos, cnaes, historico };
});

app.get('/import/status', async () => ({
  running: job.running,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  exitCode: job.exitCode,
  error: job.error,
  filters: job.filters,
  logs: job.logs.slice(-250)
}));

app.post('/import/start', async (req, reply) => {
  if (job.running) return reply.code(409).send({ message: 'Já existe uma importação em andamento.' });

  const schema = z.object({
    uf: z.string().length(2).default('SP'),
    situacao: z.string().min(1).max(2).default('04'),
    municipios: z.array(z.string()).default([]),
    somenteMatriz: z.boolean().default(true),
    motivos: z.array(z.string()).default([]),
    cnaes: z.array(z.string()).default([]),
    porte: z.array(z.string()).default([]),
    simples: z.enum(['', 'S', 'N']).default(''),
    mei: z.enum(['', 'S', 'N']).default('')
  });
  const f = schema.parse(req.body);

  const importer = path.join(__dirname, 'importer', 'importar-base.js');
  if (!fs.existsSync(importer)) return reply.code(500).send({ message: 'Arquivo do importador não encontrado.' });

  job.running = true;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.exitCode = null;
  job.error = null;
  job.logs = [];
  job.filters = f;

  const env = {
    ...process.env,
    FILTRO_UF: f.uf,
    FILTRO_SITUACAO: f.situacao,
    FILTRO_MUNICIPIOS: f.municipios.join(','),
    SOMENTE_MATRIZ: f.somenteMatriz ? 'S' : 'N',
    FILTRO_MOTIVOS: f.motivos.join(','),
    FILTRO_CNAES: f.cnaes.join(','),
    FILTRO_PORTE: f.porte.join(','),
    FILTRO_SIMPLES: f.simples,
    FILTRO_MEI: f.mei
  };

  const child = spawn(process.execPath, [importer], { cwd: path.dirname(importer), env, windowsHide: true });
  job.child = child;
  appendLog(`Importação iniciada: ${f.uf} | situação ${f.situacao} | cidades ${f.municipios.join(', ') || 'TODAS'}`);

  child.stdout.on('data', d => appendLog(String(d)));
  child.stderr.on('data', d => appendLog(String(d)));
  child.on('error', err => {
    job.running = false;
    job.error = err.message;
    job.finishedAt = new Date().toISOString();
    appendLog(`ERRO: ${err.message}`);
  });
  child.on('close', code => {
    job.running = false;
    job.exitCode = code;
    job.finishedAt = new Date().toISOString();
    if (code !== 0 && !job.error) job.error = `Importador encerrado com código ${code}`;
    appendLog(code === 0 ? 'Processo encerrado com sucesso.' : `Processo encerrado com código ${code}.`);
  });

  return { ok: true, startedAt: job.startedAt };
});

app.post('/import/cancel', async (_req, reply) => {
  if (!job.running || !job.child) return reply.code(409).send({ message: 'Não há importação em andamento.' });
  job.child.kill('SIGTERM');
  appendLog('Cancelamento solicitado pelo usuário.');
  return { ok: true };
});

app.listen({ port: Number(process.env.PORT || 3333), host: '0.0.0.0' });
>>>>>>> 3e7226b891f18b3e217e275d808991e33931895b
