import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../lib/db.js';

export async function prospectRoutes(app: FastifyInstance) {
  app.get('/dashboard', async () => {
    const [rows] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM prospects WHERE ativo=1) total_prospects,
        (SELECT COUNT(*) FROM prospect_crm WHERE status_id=1) nao_contatados,
        (SELECT COUNT(*) FROM prospect_crm WHERE status_id IN (4,5,6)) oportunidades,
        (SELECT COUNT(*) FROM prospect_crm WHERE status_id=7) clientes,
        (SELECT COUNT(*) FROM prospect_crm
          WHERE proximo_contato IS NOT NULL
            AND proximo_contato < NOW()
            AND status_id <> 7) retornos_atrasados
    `);
    return (rows as any[])[0];
  });

  app.get('/prospects', async req => {
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
    const where = ['1=1'];
    const params: any[] = [];

    if (f.q) {
      where.push(`(
        v.cnpj LIKE ? OR v.razao_social LIKE ? OR v.nome_fantasia LIKE ?
        OR EXISTS (
          SELECT 1 FROM vw_socios_prospects s
          WHERE s.prospect_id=v.prospect_id
            AND s.nome_socio_razao_social LIKE ?
        )
      )`);
      const like = `%${f.q}%`;
      params.push(like, like, like, like);
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
      SELECT v.*
      ${base}
      ORDER BY v.razao_social
      LIMIT ? OFFSET ?
    `, [...params, f.pageSize, offset]);

    return {
      items: rows,
      total: Number((countRows as any[])[0].total),
      page: f.page,
      pageSize: f.pageSize
    };
  });

  app.get('/prospects/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const [rows] = await pool.query(
      'SELECT * FROM vw_prospects_completos WHERE prospect_id=?', [id]
    );
    const item = (rows as any[])[0];
    if (!item) return reply.code(404).send({ message: 'Prospect não encontrado' });

    const [socios] = await pool.query(
      'SELECT * FROM vw_socios_prospects WHERE prospect_id=? ORDER BY nome_socio_razao_social', [id]
    );
    const [contatos] = await pool.query(
      'SELECT * FROM prospect_contatos WHERE prospect_id=? ORDER BY data_contato DESC LIMIT 100', [id]
    );
    const [propostas] = await pool.query(
      'SELECT * FROM prospect_propostas WHERE prospect_id=? ORDER BY criado_em DESC', [id]
    );
    const [tarefas] = await pool.query(
      'SELECT * FROM tarefas WHERE prospect_id=? ORDER BY status, vencimento', [id]
    );
    return { ...item, socios, contatos, propostas, tarefas };
  });

  app.patch('/prospects/:id/crm', async req => {
    const id = Number((req.params as any).id);
    const body = z.object({
      statusId: z.number().optional(),
      prioridade: z.enum(['BAIXA','NORMAL','ALTA','URGENTE']).optional(),
      proximoContato: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      naoContatar: z.boolean().optional()
    }).parse(req.body);

    const sets: string[] = [];
    const params: any[] = [];
    if (body.statusId !== undefined) { sets.push('status_id=?'); params.push(body.statusId); }
    if (body.prioridade !== undefined) { sets.push('prioridade=?'); params.push(body.prioridade); }
    if (body.proximoContato !== undefined) { sets.push('proximo_contato=?'); params.push(body.proximoContato); }
    if (body.observacoes !== undefined) { sets.push('observacoes=?'); params.push(body.observacoes); }
    if (body.naoContatar !== undefined) { sets.push('nao_contatar=?'); params.push(body.naoContatar ? 1 : 0); }

    if (sets.length) {
      params.push(id);
      await pool.query(`UPDATE prospect_crm SET ${sets.join(', ')} WHERE prospect_id=?`, params);
    }
    return { ok: true };
  });

  app.post('/prospects/:id/contatos', async req => {
    const id = Number((req.params as any).id);
    const body = z.object({
      tipo: z.enum(['TELEFONE','WHATSAPP','EMAIL','VISITA','REUNIAO','OUTRO']),
      contatoCom: z.string().optional(),
      telefoneEmail: z.string().optional(),
      resultado: z.string().optional(),
      observacoes: z.string().optional(),
      proximoContato: z.string().nullable().optional()
    }).parse(req.body);

    await pool.query(`
      INSERT INTO prospect_contatos
      (prospect_id,tipo,contato_com,telefone_email,resultado,observacoes,proximo_contato)
      VALUES (?,?,?,?,?,?,?)
    `, [
      id,body.tipo,body.contatoCom||null,body.telefoneEmail||null,
      body.resultado||null,body.observacoes||null,body.proximoContato||null
    ]);

    await pool.query(`
      UPDATE prospect_crm
      SET data_primeiro_contato=COALESCE(data_primeiro_contato,NOW()),
          data_ultimo_contato=NOW(),
          proximo_contato=?
      WHERE prospect_id=?
    `,[body.proximoContato||null,id]);

    return { ok: true };
  });

  app.post('/prospects/:id/tarefas', async req => {
    const id = Number((req.params as any).id);
    const body = z.object({
      titulo: z.string().min(1),
      descricao: z.string().optional(),
      prioridade: z.enum(['BAIXA','NORMAL','ALTA','URGENTE']).default('NORMAL'),
      vencimento: z.string().nullable().optional()
    }).parse(req.body);
    await pool.query(`
      INSERT INTO tarefas (prospect_id,titulo,descricao,prioridade,vencimento)
      VALUES (?,?,?,?,?)
    `,[id,body.titulo,body.descricao||null,body.prioridade,body.vencimento||null]);
    return { ok: true };
  });

  app.get('/filters', async () => {
    const [municipios] = await pool.query(`
      SELECT DISTINCT municipio FROM vw_prospects_completos
      WHERE municipio IS NOT NULL ORDER BY municipio
    `);
    const [cnaes] = await pool.query(`
      SELECT DISTINCT cnae_principal codigo, cnae_descricao descricao
      FROM vw_prospects_completos
      WHERE cnae_principal IS NOT NULL
      ORDER BY cnae_descricao LIMIT 3000
    `);
    const [status] = await pool.query(
      'SELECT id,nome FROM prospect_status WHERE ativo=1 ORDER BY ordem'
    );
    return { municipios, cnaes, status };
  });
}
