import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../lib/db.js';
import { job, appendLog, broadcast, addSseClient } from '../importer/job.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


function normalizarTexto(v: string) {
  return (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

async function carregarMunicipiosDosZips(): Promise<Array<{ codigo: string; nome: string; uf: string }>> {
  const zipDir = process.env.CNPJ_ZIP_DIR;
  if (!zipDir || !fs.existsSync(zipDir)) return [];

  const yauzl = (await import('yauzl')).default;
  const { parse } = await import('csv-parse');

  const files = fs.readdirSync(zipDir)
    .filter(f => f.toLowerCase().endsWith('.zip') && /munic/i.test(f))
    .map(f => path.join(zipDir, f));

  const result: Array<{ codigo: string; nome: string; uf: string }> = [];

  const openZip = (zipPath: string) => new Promise<any>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err: any, zip: any) =>
      err ? reject(err) : resolve(zip)
    );
  });

  const nextEntry = (zip: any) => new Promise<any>((resolve, reject) => {
    const onEntry = (e: any) => done(resolve, e);
    const onEnd = () => done(resolve, null);
    const onError = (e: any) => done(reject, e);
    function done(fn: any, value: any) {
      zip.removeListener('entry', onEntry);
      zip.removeListener('end', onEnd);
      zip.removeListener('error', onError);
      fn(value);
    }
    zip.once('entry', onEntry);
    zip.once('end', onEnd);
    zip.once('error', onError);
    zip.readEntry();
  });

  const entryStream = (zip: any, entry: any) => new Promise<any>((resolve, reject) => {
    zip.openReadStream(entry, (err: any, stream: any) => err ? reject(err) : resolve(stream));
  });

  for (const file of files) {
    const zip = await openZip(file);
    try {
      while (true) {
        const entry = await nextEntry(zip);
        if (!entry) break;
        if (/\/$/.test(entry.fileName)) continue;

        const stream = await entryStream(zip, entry);
        const parser = stream.pipe(parse({
          delimiter: ';',
          quote: '"',
          relax_quotes: true,
          relax_column_count: true,
          skip_empty_lines: true,
          encoding: 'latin1',
          bom: true
        }));

        for await (const row of parser) {
          const codigo = String(row[0] ?? '').trim();
          const nome = String(row[1] ?? '').replace(/\r/g, '').trim();
          if (codigo && nome) result.push({ codigo, nome, uf: '' });
        }
      }
    } finally {
      zip.close();
    }
  }

  return result;
}

export async function importRoutes(app: FastifyInstance) {

  app.get('/import/municipios', async (req) => {
    const uf = String((req.query as any)?.uf || '').trim().toUpperCase();
    const q = normalizarTexto(String((req.query as any)?.q || ''));

    // Primeiro tenta o banco
    const [dbRows] = await pool.query(
      `SELECT codigo, nome, uf
       FROM municipios
       WHERE (?='' OR uf=? OR uf IS NULL)
         AND (?='' OR UPPER(nome) LIKE ?)
       ORDER BY nome
       LIMIT 500`,
      [uf, uf, q, `%${q}%`]
    );

    if ((dbRows as any[]).length) return dbRows;

    // Se ainda não houver municípios gravados, lê o ZIP auxiliar localmente.
    const zipRows = await carregarMunicipiosDosZips();
    const filtered = zipRows
      .filter(x => !q || normalizarTexto(x.nome).includes(q))
      .slice(0, 500);

    return filtered;
  });


  app.post('/import/municipios/carregar', async (_req, reply) => {
    try {
      const rows = await carregarMunicipiosDosZips();
      if (!rows.length) {
        return reply.code(404).send({
          message: 'Municipios.zip não encontrado ou sem registros.'
        });
      }

      // Insere todos os municípios. UF fica nula até ser aprendida
      // na leitura dos arquivos Estabelecimentos.
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const bloco = rows.slice(i, i + batchSize);
        const one = '(?,?,?)';
        await pool.query(`
          INSERT INTO municipios (codigo,nome,uf)
          VALUES ${bloco.map(() => one).join(',')}
          ON DUPLICATE KEY UPDATE
            nome=VALUES(nome)
        `, bloco.flatMap(x => [x.codigo, x.nome, null]));
      }

      const [countRows] = await pool.query('SELECT COUNT(*) total FROM municipios');

      return {
        ok: true,
        importados: rows.length,
        totalNoBanco: Number((countRows as any[])[0].total)
      };
    } catch (error: any) {
      return reply.code(500).send({
        message: error.message || 'Falha ao carregar municípios'
      });
    }
  });

  app.get('/import/options', async () => {
    const [motivos] = await pool.query('SELECT codigo,descricao FROM motivos_situacao ORDER BY codigo');
    const [cnaes] = await pool.query('SELECT codigo,descricao FROM cnaes ORDER BY descricao LIMIT 5000');
    const [historico] = await pool.query(`
      SELECT id,referencia,filtro_uf,filtro_municipios,filtro_situacao,
             encontrados,inseridos,atualizados,ignorados,iniciado_em,finalizado_em,status,mensagem
      FROM importacoes_cnpj
      ORDER BY id DESC LIMIT 30
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
    logs: job.logs.slice(-350)
  }));

  app.get('/import/events', async (_req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    reply.raw.write(`data: ${JSON.stringify({ type: 'snapshot', job })}\n\n`);
    addSseClient(reply);
  });

  app.post('/import/start', async (req, reply) => {
    if (job.running) {
      return reply.code(409).send({ message: 'Já existe uma importação em andamento.' });
    }

    const f = z.object({
      uf: z.string().length(2).default('SP'),
      situacao: z.string().min(1).max(2).default('04'),
      municipios: z.array(z.string()).default([]),
      somenteMatriz: z.boolean().default(true),
      motivos: z.array(z.string()).default([]),
      cnaes: z.array(z.string()).default([]),
      porte: z.array(z.string()).default([]),
      simples: z.enum(['','S','N']).default(''),
      mei: z.enum(['','S','N']).default(''),
      resume: z.boolean().default(false)
    }).parse(req.body);

    // Falha cedo se banco/túnel não estiverem disponíveis.
    try {
      await pool.query('SELECT 1');
    } catch (error: any) {
      return reply.code(503).send({
        message: 'Banco Hostinger indisponível. Verifique o túnel SSH na porta 3307.',
        error: error?.message
      });
    }

    const importer = path.resolve(__dirname, '..', 'importer', 'importar-base.js');
    if (!fs.existsSync(importer)) {
      return reply.code(500).send({ message: 'Arquivo do importador não encontrado.' });
    }

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
      FILTRO_MEI: f.mei,
      IMPORT_RESUME: f.resume ? 'S' : 'N'
    };

    const child = spawn(process.execPath, [importer], {
      cwd: path.dirname(importer),
      env,
      windowsHide: true
    });
    job.child = child;

    appendLog(
      `Importação iniciada: ${f.uf} | situação ${f.situacao} | ` +
      `cidades ${f.municipios.join(', ') || 'TODAS'} | retomada ${f.resume ? 'SIM' : 'NÃO'}`
    );

    child.stdout.on('data', d => appendLog(String(d)));
    child.stderr.on('data', d => appendLog(String(d)));

    child.on('error', error => {
      job.running = false;
      job.error = error.message;
      job.finishedAt = new Date().toISOString();
      appendLog(`ERRO DO PROCESSO: ${error.message}`);
      broadcast({ type: 'status', job });
    });

    child.on('close', code => {
      job.running = false;
      job.exitCode = code;
      job.finishedAt = new Date().toISOString();
      if (code !== 0 && !job.error) job.error = `Processo encerrado com código ${code}`;
      appendLog(`Processo encerrado com código ${code}`);
      broadcast({ type: 'status', job });
    });

    return { ok: true, startedAt: job.startedAt };
  });

  app.post('/import/cancel', async (_req, reply) => {
    if (!job.running || !job.child) {
      return reply.code(409).send({ message: 'Nenhuma importação em andamento.' });
    }
    job.child.kill();
    appendLog('Cancelamento solicitado pelo usuário.');
    return { ok: true };
  });
}
