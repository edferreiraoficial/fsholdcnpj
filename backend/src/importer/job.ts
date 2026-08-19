import type { FastifyReply } from 'fastify';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export type ImportFilters = {
  uf: string;
  situacao: string;
  municipios: string[];
  somenteMatriz: boolean;
  motivos: string[];
  cnaes: string[];
  porte: string[];
  simples: '' | 'S' | 'N';
  mei: '' | 'S' | 'N';
  resume?: boolean;
};

export type ImportJob = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
  logs: string[];
  filters: ImportFilters | null;
  child?: ChildProcessWithoutNullStreams;
};

export const job: ImportJob = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  error: null,
  logs: [],
  filters: null
};

const clients = new Set<FastifyReply>();

export function appendLog(text: string) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) continue;
    job.logs.push(line);
    broadcast({ type: 'log', line });
  }
  if (job.logs.length > 2500) job.logs.splice(0, job.logs.length - 2500);
}

export function broadcast(payload: unknown) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const reply of clients) {
    try {
      reply.raw.write(data);
    } catch {
      clients.delete(reply);
    }
  }
}

export function addSseClient(reply: FastifyReply) {
  clients.add(reply);
  reply.raw.on('close', () => clients.delete(reply));
}
