import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { pool } from '../lib/db.js';

const prospectFilterSchema = z.object({
  q: z.string().optional(),
  email: z.string().optional(),
  uf: z.string().optional(),
  municipio: z.string().optional(),
  situacao: z.string().optional(),
  motivo: z.string().optional(),
  dataSituacaoDe: z.string().optional(),
  dataSituacaoAte: z.string().optional(),
  cnae: z.string().optional(),
  porte: z.string().optional(),
  simples: z.string().optional(),
  mei: z.string().optional(),
  status: z.coerce.number().optional(),
  prioridade: z.string().optional(),
  temTelefone: z.string().optional(),
  temEmail: z.string().optional(),
  capitalMin: z.coerce.number().optional(),
  capitalMax: z.coerce.number().optional(),
  order: z.enum([
    'data_desc',
    'data_asc',
    'razao_asc',
    'razao_desc',
    'capital_desc',
    'capital_asc'
  ]).default('data_desc')
});

const listSchema = prospectFilterSchema.extend({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(10).max(100).default(25)
});

const exportSchema = prospectFilterSchema.extend({
  format: z.enum(['xlsx', 'pdf'])
});

type ProspectFilters = z.infer<typeof prospectFilterSchema>;

function buildFilteredBase(f: ProspectFilters) {
  const where = ['1=1'];
  const params: any[] = [];
  const add = (sql: string, value: any) => {
    where.push(sql);
    params.push(value);
  };

  if (f.q) {
    const like = `%${f.q}%`;
    where.push(`(
      v.cnpj LIKE ?
      OR v.razao_social LIKE ?
      OR v.nome_fantasia LIKE ?
      OR EXISTS (
        SELECT 1
        FROM vw_socios_prospects s
        WHERE s.prospect_id = v.prospect_id
          AND s.nome_socio_razao_social LIKE ?
      )
    )`);
    params.push(like, like, like, like);
  }

  if (f.email?.trim()) add("LOWER(TRIM(COALESCE(v.email,''))) LIKE ?", `%${f.email.trim().toLowerCase()}%`);

  if (f.uf) add('v.uf=?', f.uf);
  if (f.municipio) add('UPPER(v.municipio)=UPPER(?)', f.municipio);
  if (f.situacao) add('v.situacao_cadastral=?', f.situacao);

  // IMPORTANTE:
  // Data e motivo vêm diretamente de estabelecimentos.
  // Isso evita depender do tipo/formato desses campos na view.
  if (f.dataSituacaoDe) {
    where.push('e_base.data_situacao >= ?');
    params.push(f.dataSituacaoDe);
  }

  if (f.dataSituacaoAte) {
    where.push('e_base.data_situacao <= ?');
    params.push(f.dataSituacaoAte);
  }

  if (f.motivo) {
    add('e_base.motivo_situacao_codigo=?', f.motivo);
  }

  if (f.cnae) add('v.cnae_principal=?', f.cnae);
  if (f.porte) add('v.porte=?', f.porte);
  if (f.simples) add('v.simples=?', f.simples);
  if (f.mei) add('v.mei=?', f.mei);
  if (f.status) {
    add('COALESCE(pc_base.status_tempo_real,pc_base.status_id,v.status_id)=?', f.status);
  } else {
    where.push('COALESCE(pc_base.status_tempo_real,pc_base.status_id,v.status_id,0)<>10');
  }
  if (f.prioridade) add('v.prioridade=?', f.prioridade);

  if (f.temTelefone === 'S') {
    where.push(`COALESCE(v.telefone1,'')<>''`);
  } else if (f.temTelefone === 'N') {
    where.push(`COALESCE(v.telefone1,'')=''`);
  }

  if (f.temEmail === 'S') {
    where.push(`COALESCE(v.email,'')<>''`);
  } else if (f.temEmail === 'N') {
    where.push(`COALESCE(v.email,'')=''`);
  }

  if (f.capitalMin !== undefined) add('v.capital_social>=?', f.capitalMin);
  if (f.capitalMax !== undefined) add('v.capital_social<=?', f.capitalMax);

  const base = `
    FROM vw_prospects_completos v
    JOIN prospects p_base
      ON p_base.id = v.prospect_id
    JOIN estabelecimentos e_base
      ON e_base.id = p_base.estabelecimento_id
    LEFT JOIN prospect_crm pc_base
      ON pc_base.prospect_id = v.prospect_id
    WHERE ${where.join(' AND ')}
  `;

  const orderBy = {
    data_desc: 'e_base.data_situacao DESC, v.razao_social ASC',
    data_asc: 'e_base.data_situacao ASC, v.razao_social ASC',
    razao_asc: 'v.razao_social ASC',
    razao_desc: 'v.razao_social DESC',
    capital_desc: 'v.capital_social DESC, v.razao_social ASC',
    capital_asc: 'v.capital_social ASC, v.razao_social ASC'
  }[f.order];

  return { base, params, orderBy };
}

function exportSelect(base: string) {
  return `
    SELECT
      v.prospect_id,
      v.cnpj,
      v.razao_social,
      v.nome_fantasia,
      v.municipio,
      v.uf,
      v.situacao_cadastral,
      e_base.data_situacao AS data_situacao,
      e_base.motivo_situacao_codigo,
      (SELECT ms.descricao FROM motivos_situacao ms WHERE ms.codigo=e_base.motivo_situacao_codigo LIMIT 1) AS motivo_situacao_descricao,
      v.cnae_principal,
      v.cnae_descricao,
      v.porte,
      v.capital_social,
      v.telefone1,
      v.telefone2,
      v.email,
      v.simples,
      v.mei,
      v.status_crm,
      v.prioridade
    ${base}
  `;
}

function toDateBR(value: any) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }
  return d.toLocaleDateString('pt-BR');
}

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

  app.get('/filters', async () => {
    const [municipios] = await pool.query(`
      SELECT codigo, UPPER(nome) nome, uf
      FROM municipios
      ORDER BY nome
    `);
    const [status] = await pool.query(`
      SELECT id,nome
      FROM prospect_status
      WHERE ativo=1
      ORDER BY ordem
    `);
    const [cnaes] = await pool.query(`
      SELECT codigo,descricao
      FROM cnaes
      ORDER BY descricao
      LIMIT 5000
    `);
    const [motivos] = await pool.query(`
      SELECT codigo,descricao
      FROM motivos_situacao
      ORDER BY codigo
    `);
    return { municipios, status, cnaes, motivos };
  });

  app.get('/prospects', async req => {
    const f = listSchema.parse(req.query);
    const { base, params, orderBy } = buildFilteredBase(f);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) total ${base}`,
      params
    );

    const offset = (f.page - 1) * f.pageSize;

    const [rows] = await pool.query(`
      SELECT
        v.*,
        COALESCE(pc_base.status_tempo_real,pc_base.status_id,v.status_id) AS status_tempo_real,
        e_base.data_situacao AS data_situacao,
        e_base.motivo_situacao_codigo AS motivo_situacao_codigo
      ${base}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, [...params, f.pageSize, offset]);

    return {
      items: rows,
      total: Number((countRows as any[])[0].total),
      page: f.page,
      pageSize: f.pageSize
    };
  });

  app.get('/prospects/export', async (req, reply) => {
    const f = exportSchema.parse(req.query);
    const { base, params, orderBy } = buildFilteredBase(f);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) total ${base}`,
      params
    );
    const total = Number((countRows as any[])[0].total);

    if (total === 0) {
      return reply.code(404).send({
        message: 'Nenhum registro encontrado para exportação.'
      });
    }

    // PDF com centenas de milhares de linhas gera arquivos impraticáveis.
    if (f.format === 'pdf' && total > 10000) {
      return reply.code(400).send({
        message:
          `O filtro possui ${total.toLocaleString('pt-BR')} registros. ` +
          'Para PDF, refine o filtro para no máximo 10.000 registros. ' +
          'Para bases maiores, use Excel.'
      });
    }

    const [rows] = await pool.query(`
      ${exportSelect(base)}
      ORDER BY ${orderBy}
    `, params);

    const data = rows as any[];

    if (f.format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'FSHold CNPJ';
      workbook.created = new Date();

      const ws = workbook.addWorksheet('Prospects');

      ws.columns = [
        { header: 'CNPJ', key: 'cnpj', width: 18 },
        { header: 'Razão Social', key: 'razao_social', width: 42 },
        { header: 'Nome Fantasia', key: 'nome_fantasia', width: 32 },
        { header: 'Município', key: 'municipio', width: 24 },
        { header: 'UF', key: 'uf', width: 6 },
        { header: 'Situação', key: 'situacao_cadastral', width: 12 },
        { header: 'Data Situação', key: 'data_situacao_excel', width: 15 },
        { header: 'Motivo', key: 'motivo', width: 38 },
        { header: 'CNAE', key: 'cnae_principal', width: 12 },
        { header: 'Descrição CNAE', key: 'cnae_descricao', width: 42 },
        { header: 'Porte', key: 'porte', width: 10 },
        { header: 'Capital Social', key: 'capital_social', width: 18 },
        { header: 'Telefone 1', key: 'telefone1', width: 18 },
        { header: 'Telefone 2', key: 'telefone2', width: 18 },
        { header: 'E-mail', key: 'email', width: 36 },
        { header: 'Simples', key: 'simples', width: 10 },
        { header: 'MEI', key: 'mei', width: 8 },
        { header: 'Status CRM', key: 'status_crm', width: 18 },
        { header: 'Prioridade', key: 'prioridade', width: 12 }
      ];

      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = { from: 'A1', to: 'S1' };

      for (const r of data) {
        const d = r.data_situacao
          ? (r.data_situacao instanceof Date
              ? r.data_situacao
              : new Date(r.data_situacao))
          : null;

        ws.addRow({
          ...r,
          data_situacao_excel:
            d && !Number.isNaN(d.getTime()) ? d : null,
          motivo: [
            r.motivo_situacao_codigo,
            r.motivo_situacao_descricao
          ].filter(Boolean).join(' - ')
        });
      }

      ws.getColumn('data_situacao_excel').numFmt = 'dd/mm/yyyy';
      ws.getColumn('capital_social').numFmt = '#,##0.00';

      const buffer = await workbook.xlsx.writeBuffer();

      reply
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        .header(
          'Content-Disposition',
          `attachment; filename="prospects-filtrados-${Date.now()}.xlsx"`
        );

      return reply.send(Buffer.from(buffer));
    }

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 24,
      bufferPages: true
    });

    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(16).text('FSHold CNPJ - Lista de Prospects Filtrados');
    doc.moveDown(0.3);
    doc.fontSize(9).text(
      `Registros: ${total.toLocaleString('pt-BR')} | Gerado em: ${new Date().toLocaleString('pt-BR')}`
    );
    doc.moveDown(0.6);

    const headers = ['CNPJ', 'Empresa', 'Município', 'Situação', 'Data', 'Telefone'];
    const widths = [88, 220, 120, 60, 64, 90];
    let y = doc.y;

    const drawRow = (values: string[], bold = false) => {
      if (y > 535) {
        doc.addPage();
        y = 28;
      }

      let x = 24;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.fontSize(7.5);

      values.forEach((value, i) => {
        doc.text(value || '', x, y, {
          width: widths[i],
          height: 24,
          ellipsis: true
        });
        x += widths[i] + 6;
      });

      y += 26;
    };

    drawRow(headers, true);

    for (const r of data) {
      drawRow([
        r.cnpj || '',
        r.razao_social || r.nome_fantasia || '',
        `${r.municipio || ''}/${r.uf || ''}`,
        r.situacao_cadastral || '',
        toDateBR(r.data_situacao),
        r.telefone1 || r.telefone2 || ''
      ]);
    }

    doc.end();
    const pdf = await done;

    reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `attachment; filename="prospects-filtrados-${Date.now()}.pdf"`
      );

    return reply.send(pdf);
  });

  app.get('/prospects/:id', async (req, reply) => {
    const id = Number((req.params as any).id);

    const [rows] = await pool.query(`
      SELECT
        v.*,
        COALESCE(pc.status_tempo_real,pc.status_id,v.status_id) AS status_tempo_real,
        e.data_situacao AS data_situacao,
        e.motivo_situacao_codigo
      FROM vw_prospects_completos v
      JOIN prospects p ON p.id=v.prospect_id
      JOIN estabelecimentos e ON e.id=p.estabelecimento_id
      LEFT JOIN prospect_crm pc ON pc.prospect_id=v.prospect_id
      WHERE v.prospect_id=?
    `, [id]);

    const item = (rows as any[])[0];
    if (!item) {
      return reply.code(404).send({
        message: 'Prospect não encontrado'
      });
    }

    const [socios] = await pool.query(`
      SELECT *
      FROM vw_socios_prospects
      WHERE prospect_id=?
      ORDER BY nome_socio_razao_social
    `, [id]);

    const [contatos] = await pool.query(`
      SELECT *
      FROM prospect_contatos
      WHERE prospect_id=?
      ORDER BY data_contato DESC
      LIMIT 100
    `, [id]);

    const [propostas] = await pool.query(`
      SELECT *
      FROM prospect_propostas
      WHERE prospect_id=?
      ORDER BY criado_em DESC
    `, [id]);

    const [tarefas] = await pool.query(`
      SELECT *
      FROM tarefas
      WHERE prospect_id=?
      ORDER BY status,vencimento
    `, [id]);

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

    const sets:string[] = [];
    const params:any[] = [];

    if (body.statusId !== undefined) {
      sets.push('status_id=?');
      params.push(body.statusId);
      sets.push('status_tempo_real=?');
      params.push(body.statusId);
      sets.push('status_atualizado_em=NOW()');
    }
    if (body.prioridade !== undefined) {
      sets.push('prioridade=?');
      params.push(body.prioridade);
    }
    if (body.proximoContato !== undefined) {
      sets.push('proximo_contato=?');
      params.push(body.proximoContato);
    }
    if (body.observacoes !== undefined) {
      sets.push('observacoes=?');
      params.push(body.observacoes);
    }
    if (body.naoContatar !== undefined) {
      sets.push('nao_contatar=?');
      params.push(body.naoContatar ? 1 : 0);
    }

    if (sets.length) {
      params.push(id);
      await pool.query(
        `UPDATE prospect_crm SET ${sets.join(',')} WHERE prospect_id=?`,
        params
      );
    }

    if (body.statusId !== undefined) {
      if (body.statusId === 10) {
        await pool.query(`UPDATE email_campanha_destinatarios SET status='REMOVIDO',erro='Status 10 - Não contatar' WHERE prospect_id=? AND status='PENDENTE'`,[id]);
      } else {
        await pool.query(`UPDATE email_campanha_destinatarios SET status='PENDENTE',erro=NULL WHERE prospect_id=? AND status='REMOVIDO' AND erro='Status 10 - Não contatar'`,[id]);
      }
    }

    return { ok: true };
  });
}
