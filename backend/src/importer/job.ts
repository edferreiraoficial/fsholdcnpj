import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { FastifyReply } from 'fastify';

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
  resume: boolean;
};

export const job: {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
  logs: string[];
  filters: ImportFilters | null;
  child?: ChildProcessWithoutNullStreams;
} = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  error: null,
  logs: [],
  filters: null
};

const clients = new Set<FastifyReply>();

export function addClient(reply: FastifyReply) {
  clients.add(reply);
  reply.raw.on('close', () => clients.delete(reply));
}

export function emit(payload: unknown) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try { client.raw.write(msg); } catch { clients.delete(client); }
  }
}

export function logLine(text: string) {
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    job.logs.push(line);
    emit({ type: 'log', line });
  }
  if (job.logs.length > 3000) job.logs.splice(0, job.logs.length - 3000);
}
