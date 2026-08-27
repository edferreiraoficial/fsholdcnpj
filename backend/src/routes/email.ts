import type { FastifyInstance } from 'fastify';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../lib/db.js';

const filterSchema = z.object({
  q:z.string().optional(),
  email:z.string().optional(),
  uf:z.string().optional(),
  municipio:z.string().optional(),
  situacao:z.string().optional(),
  motivo:z.string().optional(),
  dataSituacaoDe:z.string().optional(),
  dataSituacaoAte:z.string().optional(),
  cnae:z.string().optional(),
  porte:z.string().optional(),
  simples:z.string().optional(),
  mei:z.string().optional(),
  status:z.coerce.number().optional(),
  prioridade:z.string().optional(),
  temTelefone:z.string().optional(),
  temEmail:z.string().optional(),
  capitalMin:z.coerce.number().optional(),
  capitalMax:z.coerce.number().optional()
});

type Filters = z.infer<typeof filterSchema>;

function buildWhere(f: Filters) {
  const where = [
    "COALESCE(v.email,'')<>''",
    'COALESCE(pc.nao_contatar,0)=0',
    'COALESCE(pc.status_tempo_real,pc.status_id,v.status_id,0)<>10',
    'eo.email IS NULL'
  ];
  const params:any[] = [];
  const add=(sql:string,val:any)=>{ where.push(sql); params.push(val); };

  if(f.q){
    const like=`%${f.q}%`;
    where.push(`(
      v.cnpj LIKE ?
      OR v.razao_social LIKE ?
      OR v.nome_fantasia LIKE ?
      OR EXISTS (
        SELECT 1
        FROM vw_socios_prospects s
        WHERE s.prospect_id=v.prospect_id
          AND s.nome_socio_razao_social LIKE ?
      )
    )`);
    params.push(like,like,like,like);
  }

  if(f.email?.trim()) add("LOWER(TRIM(COALESCE(v.email,''))) LIKE ?",`%${f.email.trim().toLowerCase()}%`);

  if(f.uf) add('v.uf=?',f.uf);
  if(f.municipio) add('UPPER(v.municipio)=UPPER(?)',f.municipio);
  if(f.situacao) add('v.situacao_cadastral=?',f.situacao);
  if(f.motivo) add('e.motivo_situacao_codigo=?',f.motivo);

  if(f.dataSituacaoDe){
    where.push('DATE(e.data_situacao) >= STR_TO_DATE(?, "%Y-%m-%d")');
    params.push(f.dataSituacaoDe);
  }

  if(f.dataSituacaoAte){
    where.push('DATE(e.data_situacao) <= STR_TO_DATE(?, "%Y-%m-%d")');
    params.push(f.dataSituacaoAte);
  }

  if(f.cnae) add('v.cnae_principal=?',f.cnae);
  if(f.porte) add('v.porte=?',f.porte);
  if(f.simples) add('v.simples=?',f.simples);
  if(f.mei) add('v.mei=?',f.mei);
  if(f.status) add('COALESCE(pc.status_tempo_real,pc.status_id,v.status_id)=?',f.status);
  if(f.prioridade) add('v.prioridade=?',f.prioridade);

  if(f.temTelefone==='S') where.push(`COALESCE(v.telefone1,'')<>''`);
  if(f.temTelefone==='N') where.push(`COALESCE(v.telefone1,'')=''`);

  // Esta página sempre trabalha com e-mail válido.
  if(f.temEmail==='N') where.push('1=0');

  if(f.capitalMin!==undefined) add('v.capital_social>=?',f.capitalMin);
  if(f.capitalMax!==undefined) add('v.capital_social<=?',f.capitalMax);

  return {where,params};
}

function recipientBase(
  f:Filters,
  includeProspectIds:number[] = [],
  excludeProspectIds:number[] = []
){
  const {where,params}=buildWhere(f);

  if(includeProspectIds.length){
    where.push(`v.prospect_id IN (${includeProspectIds.map(()=>'?').join(',')})`);
    params.push(...includeProspectIds);
  }

  if(excludeProspectIds.length){
    where.push(`v.prospect_id NOT IN (${excludeProspectIds.map(()=>'?').join(',')})`);
    params.push(...excludeProspectIds);
  }

  return {
    sql:`FROM vw_prospects_completos v
         JOIN prospects p ON p.id=v.prospect_id
         JOIN estabelecimentos e ON e.id=p.estabelecimento_id
         LEFT JOIN prospect_crm pc ON pc.prospect_id=p.id
         LEFT JOIN email_optout eo ON LOWER(eo.email)=LOWER(v.email)
         WHERE ${where.join(' AND ')}`,
    params
  };
}

function formatDateBR(value:any){
  if(!value) return '';

  if(value instanceof Date){
    return Number.isNaN(value.getTime())
      ? ''
      : value.toLocaleDateString('pt-BR');
  }

  const raw=String(value).trim();
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if(m){
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  const d=new Date(raw);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('pt-BR');
}

function renderTemplate(tpl:string,row:any){
  const values:Record<string,string>={
    razao_social:row.razao_social||'',
    nome_fantasia:row.nome_fantasia||'',
    cnpj:row.cnpj||'',
    municipio:row.municipio||'',
    uf:row.uf||'',
    email:row.email||'',
    situacao_cadastral:row.situacao_cadastral||'',
    data_situacao:formatDateBR(row.data_situacao),
    whatsapp:process.env.CRM_WHATSAPP||''
  };

  return tpl.replace(
    /{{\s*([a-z_]+)\s*}}/gi,
    (_,k)=>values[String(k).toLowerCase()] ?? ''
  );
}

function mensagemHash(assunto:string,corpoHtml:string){
  return crypto
    .createHash('sha256')
    .update(`${assunto.trim()}\n---FSHOLD---\n${corpoHtml.trim()}`,'utf8')
    .digest('hex');
}

type RemetenteConfig = {
  id:number|null;
  nome:string;
  email:string;
  smtp_host:string;
  smtp_port:number;
  smtp_secure:boolean;
  smtp_user:string;
  smtp_password:string;
  from_name:string;
};

async function remetenteConfig(id?:number|null):Promise<RemetenteConfig>{
  let rows:any[]=[];

  if(id){
    const [result]=await pool.query(`
      SELECT * FROM email_remetentes WHERE id=? AND ativo=1 LIMIT 1
    `,[id]);
    rows=result as any[];
  }else{
    const [result]=await pool.query(`
      SELECT * FROM email_remetentes
      WHERE ativo=1
      ORDER BY padrao DESC,id
      LIMIT 1
    `);
    rows=result as any[];
  }

  const r=rows[0];
  if(r){
    return {
      id:Number(r.id),
      nome:String(r.nome||''),
      email:String(r.email||r.smtp_user||''),
      smtp_host:String(r.smtp_host||'smtp.gmail.com'),
      smtp_port:Number(r.smtp_port||587),
      smtp_secure:Boolean(r.smtp_secure),
      smtp_user:String(r.smtp_user||''),
      smtp_password:String(r.smtp_password||''),
      from_name:String(r.from_name||r.nome||'FSHold')
    };
  }

  return {
    id:null,
    nome:process.env.SMTP_FROM_NAME||'FSHold',
    email:process.env.SMTP_FROM_EMAIL||process.env.SMTP_USER||'',
    smtp_host:process.env.SMTP_HOST||'smtp.gmail.com',
    smtp_port:Number(process.env.SMTP_PORT||587),
    smtp_secure:(process.env.SMTP_SECURE||'N').toUpperCase()==='S',
    smtp_user:process.env.SMTP_USER||'',
    smtp_password:process.env.SMTP_PASSWORD||'',
    from_name:process.env.SMTP_FROM_NAME||'FSHold'
  };
}

function transporter(r:RemetenteConfig){
  return nodemailer.createTransport({
    host:r.smtp_host,
    port:r.smtp_port,
    secure:r.smtp_secure,
    requireTLS:!r.smtp_secure,
    auth:{user:r.smtp_user,pass:r.smtp_password}
  });
}

function fromAddress(r:RemetenteConfig){
  return {name:r.from_name,address:r.email||r.smtp_user};
}

function erroLimiteDiario(e:any){
  const text=[
    e?.message,
    e?.response,
    e?.responseCode,
    e?.code,
    e?.command,
    e?.stack,
    typeof e === 'string' ? e : ''
  ].filter(Boolean).join(' ').toLowerCase();

  return text.includes('daily user sending limit exceeded') ||
    text.includes('daily sending limit exceeded') ||
    text.includes('user sending limit exceeded') ||
    text.includes('5.4.5') ||
    text.includes('550-5.4.5') ||
    text.includes('550 5.4.5');
}

function mensagemErroEmail(e:any, remetente?:RemetenteConfig){
  if(erroLimiteDiario(e)){
    const conta=remetente?.email ? ` ${remetente.email}` : '';
    return `O Gmail atingiu o limite diário da conta${conta}. O envio foi interrompido. Troque o remetente e continue apenas os pendentes.`;
  }
  return String(e?.message||e||'Falha ao enviar e-mail.');
}

async function registrarUsoRemetente(r:RemetenteConfig,erro?:string|null){
  if(!r.id) return;
  await pool.query(`
    UPDATE email_remetentes
    SET ultimo_envio_em=IF(? IS NULL,NOW(),ultimo_envio_em),
        ultimo_erro=?
    WHERE id=?
  `,[erro??null,erro??null,r.id]);
}

export async function emailRoutes(app:FastifyInstance){

  // ---------------- Remetentes SMTP ----------------

  app.get('/email-senders', async()=>{
    const [rows]=await pool.query(`
      SELECT id,nome,email,smtp_host,smtp_port,smtp_secure,smtp_user,from_name,ativo,padrao,rodizio,ultimo_erro,ultimo_envio_em,criado_em,atualizado_em
      FROM email_remetentes
      ORDER BY ativo DESC,padrao DESC,nome,email
    `);
    return rows;
  });

  app.post('/email-senders', async req=>{
    const body=z.object({
      nome:z.string().min(1).max(150), email:z.string().email(),
      smtpHost:z.string().min(1).max(255).default('smtp.gmail.com'),
      smtpPort:z.coerce.number().int().min(1).max(65535).default(587),
      smtpSecure:z.boolean().default(false), smtpUser:z.string().min(1).max(255),
      smtpPassword:z.string().min(1).max(500), fromName:z.string().min(1).max(150),
      ativo:z.boolean().default(true), padrao:z.boolean().default(false), rodizio:z.boolean().default(true)
    }).parse(req.body);
    const conn=await pool.getConnection();
    try{
      await conn.beginTransaction();
      if(body.padrao) await conn.query('UPDATE email_remetentes SET padrao=0');
      const [res]:any=await conn.query(`
        INSERT INTO email_remetentes
          (nome,email,smtp_host,smtp_port,smtp_secure,smtp_user,smtp_password,from_name,ativo,padrao,rodizio)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `,[body.nome,body.email,body.smtpHost,body.smtpPort,body.smtpSecure?1:0,body.smtpUser,body.smtpPassword,body.fromName,body.ativo?1:0,body.padrao?1:0,body.rodizio?1:0]);
      await conn.commit();
      return {ok:true,id:res.insertId};
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  });

  app.put('/email-senders/:id', async req=>{
    const id=Number((req.params as any).id);
    const body=z.object({
      nome:z.string().min(1).max(150), email:z.string().email(),
      smtpHost:z.string().min(1).max(255), smtpPort:z.coerce.number().int().min(1).max(65535),
      smtpSecure:z.boolean(), smtpUser:z.string().min(1).max(255),
      smtpPassword:z.string().max(500).optional().default(''), fromName:z.string().min(1).max(150),
      ativo:z.boolean(), padrao:z.boolean(), rodizio:z.boolean()
    }).parse(req.body);
    const conn=await pool.getConnection();
    try{
      await conn.beginTransaction();
      if(body.padrao) await conn.query('UPDATE email_remetentes SET padrao=0 WHERE id<>?',[id]);
      await conn.query(`
        UPDATE email_remetentes SET nome=?,email=?,smtp_host=?,smtp_port=?,smtp_secure=?,smtp_user=?,
          smtp_password=IF(?='',smtp_password,?),from_name=?,ativo=?,padrao=?,rodizio=?,atualizado_em=NOW() WHERE id=?
      `,[body.nome,body.email,body.smtpHost,body.smtpPort,body.smtpSecure?1:0,body.smtpUser,body.smtpPassword,body.smtpPassword,body.fromName,body.ativo?1:0,body.padrao?1:0,body.rodizio?1:0,id]);
      await conn.commit(); return {ok:true};
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  });

  app.delete('/email-senders/:id', async req=>{
    const id=Number((req.params as any).id);
    await pool.query('UPDATE email_remetentes SET ativo=0,padrao=0,atualizado_em=NOW() WHERE id=?',[id]);
    return {ok:true};
  });

  app.post('/email-senders/:id/test', async req=>{
    const id=Number((req.params as any).id);
    const body=z.object({to:z.string().email()}).parse(req.body);
    const r=await remetenteConfig(id);
    try{
      await transporter(r).sendMail({from:fromAddress(r),to:body.to,subject:'Teste de remetente - FSHold',html:'<p>Configuração SMTP validada com sucesso.</p>'});
      await registrarUsoRemetente(r,null);
      return {ok:true};
    }catch(e:any){
      const erro=String(e?.message||e).slice(0,2000);
      await registrarUsoRemetente(r,erro);
      return {
        ok:false,
        limiteAtingido:erroLimiteDiario(e),
        message:mensagemErroEmail(e,r)
      };
    }
  });


  // ---------------- Grupos de remetentes ----------------
  app.get('/email-sender-groups', async()=>{
    const [rows]=await pool.query(`
      SELECT g.id,g.nome,g.descricao,g.ativo,g.criado_em,g.atualizado_em,
             COUNT(gi.remetente_id) quantidade
      FROM email_remetente_grupos g
      LEFT JOIN email_remetente_grupo_itens gi ON gi.grupo_id=g.id
      GROUP BY g.id
      ORDER BY g.ativo DESC,g.nome
    `);
    return rows;
  });

  app.get('/email-sender-groups/:id', async req=>{
    const id=Number((req.params as any).id);
    const [g]=await pool.query('SELECT * FROM email_remetente_grupos WHERE id=?',[id]);
    const [itens]=await pool.query(`SELECT r.id,r.nome,r.email,r.ativo,gi.ordem FROM email_remetente_grupo_itens gi JOIN email_remetentes r ON r.id=gi.remetente_id WHERE gi.grupo_id=? ORDER BY gi.ordem,r.id`,[id]);
    return {grupo:(g as any[])[0]||null,itens};
  });

  app.post('/email-sender-groups', async req=>{
    const body=z.object({nome:z.string().min(1).max(150),descricao:z.string().max(255).optional().default(''),remetenteIds:z.array(z.coerce.number().int().positive()).min(1)}).parse(req.body);
    const conn=await pool.getConnection();
    try{await conn.beginTransaction();
      const [res]:any=await conn.query('INSERT INTO email_remetente_grupos (nome,descricao) VALUES (?,?)',[body.nome,body.descricao||null]);
      for(let i=0;i<body.remetenteIds.length;i++) await conn.query('INSERT INTO email_remetente_grupo_itens (grupo_id,remetente_id,ordem) VALUES (?,?,?)',[res.insertId,body.remetenteIds[i],i]);
      await conn.commit(); return {ok:true,id:res.insertId};
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  });

  app.put('/email-sender-groups/:id', async req=>{
    const id=Number((req.params as any).id);
    const body=z.object({nome:z.string().min(1).max(150),descricao:z.string().max(255).optional().default(''),ativo:z.boolean().default(true),remetenteIds:z.array(z.coerce.number().int().positive()).min(1)}).parse(req.body);
    const conn=await pool.getConnection();
    try{await conn.beginTransaction();
      await conn.query('UPDATE email_remetente_grupos SET nome=?,descricao=?,ativo=? WHERE id=?',[body.nome,body.descricao||null,body.ativo?1:0,id]);
      await conn.query('DELETE FROM email_remetente_grupo_itens WHERE grupo_id=?',[id]);
      for(let i=0;i<body.remetenteIds.length;i++) await conn.query('INSERT INTO email_remetente_grupo_itens (grupo_id,remetente_id,ordem) VALUES (?,?,?)',[id,body.remetenteIds[i],i]);
      await conn.commit(); return {ok:true};
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  });

  app.delete('/email-sender-groups/:id', async req=>{const id=Number((req.params as any).id);await pool.query('UPDATE email_remetente_grupos SET ativo=0 WHERE id=?',[id]);return {ok:true};});

  // ---------------- Modelos ----------------

  app.get('/email-models', async()=>{
    const [rows]=await pool.query(`
      SELECT id,nome,assunto,corpo_html,ativo,criado_em,atualizado_em
      FROM email_modelos
      WHERE ativo=1
      ORDER BY nome
    `);
    return rows;
  });

  app.post('/email-models', async req=>{
    const body=z.object({
      nome:z.string().min(1).max(150),
      assunto:z.string().min(1).max(255),
      corpoHtml:z.string().min(1)
    }).parse(req.body);

    const [res]:any=await pool.query(`
      INSERT INTO email_modelos (nome,assunto,corpo_html)
      VALUES (?,?,?)
    `,[body.nome,body.assunto,body.corpoHtml]);

    return {ok:true,id:res.insertId};
  });

  app.put('/email-models/:id', async req=>{
    const id=Number((req.params as any).id);
    const body=z.object({
      nome:z.string().min(1).max(150),
      assunto:z.string().min(1).max(255),
      corpoHtml:z.string().min(1)
    }).parse(req.body);

    await pool.query(`
      UPDATE email_modelos
      SET nome=?,assunto=?,corpo_html=?,atualizado_em=NOW()
      WHERE id=? AND ativo=1
    `,[body.nome,body.assunto,body.corpoHtml,id]);

    return {ok:true};
  });

  app.delete('/email-models/:id', async req=>{
    const id=Number((req.params as any).id);
    await pool.query(`
      UPDATE email_modelos
      SET ativo=0,atualizado_em=NOW()
      WHERE id=?
    `,[id]);
    return {ok:true};
  });

  // ---------------- Prévia / Teste ----------------

  app.post('/email-campaigns/preview', async req=>{
    const body=z.object({
      filters:filterSchema.default({}),
      includeProspectIds:z.array(z.number()).default([]),
      excludeProspectIds:z.array(z.number()).default([]),
      assunto:z.string().optional().default(''),
      corpoHtml:z.string().optional().default(''),
      ignorarJaEnviados:z.boolean().default(true),
      limit:z.number().min(10).max(200).default(100)
    }).parse(req.body);

    const {sql,params}=recipientBase(
      body.filters,
      body.includeProspectIds,
      body.excludeProspectIds
    );

    const hash =
      body.ignorarJaEnviados && body.assunto && body.corpoHtml
        ? mensagemHash(body.assunto,body.corpoHtml)
        : '';

    const dedupeSql = hash
      ? ` AND NOT EXISTS (
            SELECT 1
            FROM prospect_contatos pc_email
            WHERE pc_email.prospect_id=v.prospect_id
              AND pc_email.tipo='EMAIL'
              AND pc_email.resultado='ENVIADO'
              AND pc_email.observacoes=?
          )`
      : '';

    const previewParams = hash
      ? [...params, `HASH:${hash}`]
      : params;

    const [countRows]=await pool.query(`
      SELECT COUNT(DISTINCT LOWER(TRIM(v.email))) total
      ${sql}
      ${dedupeSql}
    `,previewParams);

    const [sampleRows]=await pool.query(`
      SELECT
        MIN(v.prospect_id) prospect_id,
        LOWER(TRIM(v.email)) email_chave,
        MAX(v.email) email,
        MAX(v.razao_social) razao_social,
        MAX(v.nome_fantasia) nome_fantasia,
        MAX(v.cnpj) cnpj,
        MAX(v.municipio) municipio,
        MAX(v.uf) uf,
        MAX(v.situacao_cadastral) situacao_cadastral,
        MAX(e.data_situacao) data_situacao
      ${sql}
      ${dedupeSql}
      GROUP BY LOWER(TRIM(v.email))
      ORDER BY MAX(v.razao_social)
      LIMIT ?
    `,[...previewParams,body.limit]);

    return {
      total:Number((countRows as any[])[0].total),
      sample:sampleRows
    };
  });

  app.post('/email-campaigns/test', async req=>{
    const body=z.object({
      to:z.string().email(),
      assunto:z.string().min(1),
      corpoHtml:z.string().min(1),
      remetenteId:z.coerce.number().int().positive().optional(),
      grupoRemetenteId:z.coerce.number().int().positive().optional()
    }).parse(req.body);

    const remetente=await remetenteConfig(body.remetenteId);
    try{
      await transporter(remetente).sendMail({
        from:fromAddress(remetente),
        to:body.to,
        subject:body.assunto,
        html:body.corpoHtml
      });
      await registrarUsoRemetente(remetente,null);
      return {ok:true};
    }catch(e:any){
      const erro=String(e?.message||e).slice(0,2000);
      await registrarUsoRemetente(remetente,erro);
      return {
        ok:false,
        limiteAtingido:erroLimiteDiario(e),
        message:mensagemErroEmail(e,remetente)
      };
    }
  });

  // ---------------- Envio direto sem criar campanha ----------------

  app.post('/email-campaigns/send-direct', async req=>{
    const body=z.object({
      assunto:z.string().min(1),
      corpoHtml:z.string().min(1),
      filters:filterSchema.default({}),
      includeProspectIds:z.array(z.number()).default([]),
      excludeProspectIds:z.array(z.number()).default([]),
      ignorarJaEnviados:z.boolean().default(true),
      remetenteId:z.coerce.number().int().positive().optional(),
      grupoRemetenteId:z.coerce.number().int().positive().optional()
    }).parse(req.body);

    const {sql,params}=recipientBase(
      body.filters,
      body.includeProspectIds,
      body.excludeProspectIds
    );

    const hash=mensagemHash(body.assunto,body.corpoHtml);

    const dedupeSql = body.ignorarJaEnviados
      ? ` AND NOT EXISTS (
            SELECT 1
            FROM prospect_contatos pc_email
            WHERE pc_email.prospect_id=v.prospect_id
              AND pc_email.tipo='EMAIL'
              AND pc_email.resultado='ENVIADO'
              AND pc_email.observacoes=?
          )`
      : '';

    const sendParams = body.ignorarJaEnviados
      ? [...params, `HASH:${hash}`]
      : params;

    const [rows]=await pool.query(`
      SELECT
        v.prospect_id,
        v.email,
        v.razao_social,
        v.nome_fantasia,
        v.cnpj,
        v.municipio,
        v.uf,
        v.situacao_cadastral,
        e.data_situacao
      ${sql}
      ${dedupeSql}
      ORDER BY v.prospect_id
    `,sendParams);

    const unique=new Map<string,any>();

    for(const r of rows as any[]){
      const key=String(r.email||'').trim().toLowerCase();
      if(key && !unique.has(key)) unique.set(key,r);
    }

    if(unique.size===0){
      return {
        ok:false,
        message:'Nenhum destinatário elegível para envio.'
      };
    }

    const remetente=await remetenteConfig(body.remetenteId);
    const tx=transporter(remetente);
    let enviados=0;
    let falhas=0;

    for(const r of unique.values()){
      try{
        await tx.sendMail({
          from:fromAddress(remetente),
          to:r.email,
          subject:renderTemplate(body.assunto,r),
          html:renderTemplate(body.corpoHtml,r)
        });

        await pool.query(`
          INSERT INTO prospect_contatos
            (prospect_id,tipo,telefone_email,resultado,observacoes)
          VALUES (?,'EMAIL',?,'ENVIADO',?)
        `,[r.prospect_id,r.email,`HASH:${hash}`]);

        enviados++;
      }catch(e:any){
        const erro=String(e?.message||e).slice(0,2000);
        if(erroLimiteDiario(e)){
          await registrarUsoRemetente(remetente,erro);
          return {
            ok:true,total:unique.size,enviados,falhas,
            interrompido:true,limiteAtingido:true,
            pendentes:unique.size-enviados-falhas,
            message:`Limite diário atingido pelo remetente ${remetente.email}. O envio foi interrompido sem marcar os destinatários restantes como enviados.`
          };
        }
        falhas++;

        try{
          await pool.query(`
            INSERT INTO prospect_contatos
              (prospect_id,tipo,telefone_email,resultado,observacoes)
            VALUES (?,'EMAIL',?,'FALHOU',?)
          `,[r.prospect_id,r.email,`Falha no envio sem campanha: ${erro}`]);
        }catch{}
      }
    }

    await registrarUsoRemetente(remetente,null);
    return {ok:true,total:unique.size,enviados,falhas};
  });


  // ---------------- Marcar envios antigos como já enviados ----------------

  app.post('/email-campaigns/mark-previous-sent', async req=>{
    const body=z.object({
      assunto:z.string().min(1),
      corpoHtml:z.string().min(1),
      filters:filterSchema.default({}),
      includeProspectIds:z.array(z.number()).default([]),
      excludeProspectIds:z.array(z.number()).default([]),
      remetenteId:z.coerce.number().int().positive().optional(),
      grupoRemetenteId:z.coerce.number().int().positive().optional()
    }).parse(req.body);

    const hash=mensagemHash(body.assunto,body.corpoHtml);

    const {sql,params}=recipientBase(
      body.filters,
      body.includeProspectIds,
      body.excludeProspectIds
    );

    // Primeiro obtemos os prospect_ids elegíveis usando exatamente a mesma
    // consulta dos filtros da tela.
    const [eligibleRows]=await pool.query(`
      SELECT DISTINCT v.prospect_id
      ${sql}
    `,params);

    const prospectIds=(eligibleRows as any[])
      .map(r=>Number(r.prospect_id))
      .filter(Number.isFinite);

    if(!prospectIds.length){
      return {
        ok:true,
        marcados:0,
        message:'Nenhum prospect elegível foi encontrado com os filtros atuais.'
      };
    }

    // Trabalha em blocos para evitar SQL gigantes.
    const contactIds:number[]=[];

    for(let i=0;i<prospectIds.length && contactIds.length<100;i+=500){
      const block=prospectIds.slice(i,i+500);
      const placeholders=block.map(()=>'?').join(',');

      const [rows]=await pool.query(`
        SELECT
          id,
          prospect_id
        FROM prospect_contatos
        WHERE prospect_id IN (${placeholders})
          AND tipo='EMAIL'
          AND resultado='ENVIADO'
          AND (
            observacoes='E-mail enviado sem campanha'
            OR observacoes IS NULL
            OR observacoes=''
          )
          AND (
            observacoes IS NULL
            OR observacoes NOT LIKE 'HASH:%'
          )
        ORDER BY id DESC
        LIMIT ?
      `,[...block,100-contactIds.length]);

      for(const r of rows as any[]){
        contactIds.push(Number(r.id));
        if(contactIds.length>=100) break;
      }
    }

    if(!contactIds.length){
      return {
        ok:true,
        marcados:0,
        message:'Nenhum envio antigo elegível foi encontrado.'
      };
    }

    const placeholders=contactIds.map(()=>'?').join(',');

    await pool.query(`
      UPDATE prospect_contatos
      SET observacoes=?
      WHERE id IN (${placeholders})
    `,[`HASH:${hash}`,...contactIds]);

    return {
      ok:true,
      marcados:contactIds.length,
      hash
    };
  });


  // ---------------- Campanhas ----------------

  app.post('/email-campaigns', async req=>{
    const body=z.object({
      nome:z.string().min(1),
      assunto:z.string().min(1),
      corpoHtml:z.string().min(1),
      filters:filterSchema.default({}),
      includeProspectIds:z.array(z.number()).default([]),
      excludeProspectIds:z.array(z.number()).default([]),
      remetenteId:z.coerce.number().int().positive().optional(),
      grupoRemetenteId:z.coerce.number().int().positive().optional()
    }).parse(req.body);

    const {sql,params}=recipientBase(
      body.filters,
      body.includeProspectIds,
      body.excludeProspectIds
    );

    const [recipients]=await pool.query(`
      SELECT
        v.prospect_id,
        v.email,
        v.razao_social
      ${sql}
      ORDER BY v.prospect_id
    `,params);

    const unique=new Map<string,any>();

    for(const r of recipients as any[]){
      const key=String(r.email||'').trim().toLowerCase();
      if(key && !unique.has(key)) unique.set(key,r);
    }

    if(unique.size===0){
      return {
        ok:false,
        message:'Nenhum destinatário elegível para a campanha.'
      };
    }

    const conn=await pool.getConnection();

    try{
      await conn.beginTransaction();

      const [res]:any=await conn.query(`
        INSERT INTO email_campanhas
          (nome,remetente_id,grupo_remetente_id,assunto,corpo_html,filtros_json,total_destinatarios,status)
        VALUES (?,?,?,?,?,?,?,'PRONTA')
      `,[
        body.nome,
        body.remetenteId||null,
        body.grupoRemetenteId||null,
        body.assunto,
        body.corpoHtml,
        JSON.stringify({
          filters:body.filters,
          includeProspectIds:body.includeProspectIds,
          excludeProspectIds:body.excludeProspectIds
        }),
        unique.size
      ]);

      const id=res.insertId;
      const arr=[...unique.values()];

      for(let i=0;i<arr.length;i+=500){
        const batch=arr.slice(i,i+500);
        const one='(?,?,?)';

        await conn.query(`
          INSERT INTO email_campanha_destinatarios
            (campanha_id,prospect_id,email)
          VALUES ${batch.map(()=>one).join(',')}
        `,batch.flatMap(x=>[id,x.prospect_id,x.email]));
      }

      await conn.commit();

      return {
        ok:true,
        id,
        total:unique.size
      };

    }catch(e){
      await conn.rollback();
      throw e;
    }finally{
      conn.release();
    }
  });

  app.post('/email-campaigns/:id/add-recipients', async req=>{
    const id=Number((req.params as any).id);

    const body=z.object({
      filters:filterSchema.default({}),
      includeProspectIds:z.array(z.number()).default([]),
      excludeProspectIds:z.array(z.number()).default([])
    }).parse(req.body);

    const [campRows]=await pool.query(`
      SELECT *
      FROM email_campanhas
      WHERE id=?
      LIMIT 1
    `,[id]);

    const camp=(campRows as any[])[0];

    if(!camp){
      return {
        ok:false,
        message:'Campanha não encontrada.'
      };
    }

    if(camp.status==='CANCELADA'){
      return {
        ok:false,
        message:'Não é possível adicionar destinatários a uma campanha cancelada.'
      };
    }

    const {sql,params}=recipientBase(
      body.filters,
      body.includeProspectIds,
      body.excludeProspectIds
    );

    const [recipientRows]=await pool.query(`
      SELECT
        v.prospect_id,
        v.email,
        v.razao_social
      ${sql}
      ORDER BY v.prospect_id
    `,params);

    // Deduplica o novo conjunto pelo endereço de e-mail.
    const candidatos=new Map<string,any>();

    for(const r of recipientRows as any[]){
      const key=String(r.email||'').trim().toLowerCase();
      if(key && !candidatos.has(key)){
        candidatos.set(key,r);
      }
    }

    if(candidatos.size===0){
      return {
        ok:true,
        campanhaId:id,
        adicionados:0,
        ignoradosDuplicados:0,
        message:'Nenhum destinatário elegível foi encontrado com os filtros atuais.'
      };
    }

    // Lê tudo que já pertence à campanha para impedir duplicidade tanto
    // por prospect_id quanto por endereço de e-mail.
    const [existingRows]=await pool.query(`
      SELECT prospect_id, LOWER(TRIM(email)) email_chave
      FROM email_campanha_destinatarios
      WHERE campanha_id=?
    `,[id]);

    const prospectIdsExistentes=new Set<number>();
    const emailsExistentes=new Set<string>();

    for(const r of existingRows as any[]){
      prospectIdsExistentes.add(Number(r.prospect_id));
      const email=String(r.email_chave||'').trim().toLowerCase();
      if(email) emailsExistentes.add(email);
    }

    const novos:any[]=[];
    let ignoradosDuplicados=0;

    for(const [emailKey,r] of candidatos){
      const prospectId=Number(r.prospect_id);

      if(
        prospectIdsExistentes.has(prospectId) ||
        emailsExistentes.has(emailKey)
      ){
        ignoradosDuplicados++;
        continue;
      }

      novos.push({
        prospect_id:prospectId,
        email:String(r.email||'').trim()
      });

      // Evita duplicidade também dentro do próprio lote.
      prospectIdsExistentes.add(prospectId);
      emailsExistentes.add(emailKey);
    }

    if(!novos.length){
      return {
        ok:true,
        campanhaId:id,
        adicionados:0,
        ignoradosDuplicados,
        message:'Todos os destinatários elegíveis já pertencem a esta campanha.'
      };
    }

    const conn=await pool.getConnection();

    try{
      await conn.beginTransaction();

      for(let i=0;i<novos.length;i+=500){
        const batch=novos.slice(i,i+500);
        const one='(?,?,?)';

        await conn.query(`
          INSERT IGNORE INTO email_campanha_destinatarios
            (campanha_id,prospect_id,email)
          VALUES ${batch.map(()=>one).join(',')}
        `,batch.flatMap(x=>[id,x.prospect_id,x.email]));
      }

      // Reabre a campanha se ela já estava concluída.
      await conn.query(`
        UPDATE email_campanhas
        SET
          total_destinatarios=(
            SELECT COUNT(*)
            FROM email_campanha_destinatarios d
            WHERE d.campanha_id=email_campanhas.id
          ),
          status='PRONTA',
          finalizado_em=NULL
        WHERE id=?
      `,[id]);

      await conn.commit();

    }catch(e){
      await conn.rollback();
      throw e;
    }finally{
      conn.release();
    }

    const [statsRows]=await pool.query(`
      SELECT
        COUNT(*) total,
        SUM(status='PENDENTE') pendentes,
        SUM(status='ENVIADO') enviados,
        SUM(status='FALHOU') falhas
      FROM email_campanha_destinatarios
      WHERE campanha_id=?
    `,[id]);

    const stats=(statsRows as any[])[0];

    return {
      ok:true,
      campanhaId:id,
      adicionados:novos.length,
      ignoradosDuplicados,
      total:Number(stats.total||0),
      pendentes:Number(stats.pendentes||0),
      enviados:Number(stats.enviados||0),
      falhas:Number(stats.falhas||0)
    };
  });

  app.put('/email-campaigns/:id/sender', async req=>{
    const id=Number((req.params as any).id);
    const body=z.object({remetenteId:z.coerce.number().int().positive()}).parse(req.body);
    const [senderRows]=await pool.query('SELECT id FROM email_remetentes WHERE id=? AND ativo=1 LIMIT 1',[body.remetenteId]);
    if(!(senderRows as any[]).length) return {ok:false,message:'Remetente não encontrado ou inativo.'};
    await pool.query('UPDATE email_campanhas SET remetente_id=? WHERE id=?',[body.remetenteId,id]);
    return {ok:true};
  });

  app.put('/email-campaigns/:id/sender-group', async req=>{
    const id=Number((req.params as any).id);
    const body=z.object({grupoRemetenteId:z.coerce.number().int().positive()}).parse(req.body);
    const [rows]=await pool.query(`SELECT g.id,COUNT(gi.remetente_id) qtd FROM email_remetente_grupos g LEFT JOIN email_remetente_grupo_itens gi ON gi.grupo_id=g.id LEFT JOIN email_remetentes r ON r.id=gi.remetente_id AND r.ativo=1 WHERE g.id=? AND g.ativo=1 GROUP BY g.id`,[body.grupoRemetenteId]);
    if(!(rows as any[]).length || Number((rows as any[])[0].qtd||0)<1) return {ok:false,message:'Grupo não encontrado ou sem remetentes ativos.'};
    await pool.query('UPDATE email_campanhas SET grupo_remetente_id=? WHERE id=?',[body.grupoRemetenteId,id]);
    return {ok:true};
  });

  const campaignJobs=new Set<number>();

  async function processCampaignInBackground(id:number, body:any){
    const limit=Math.min(5000,Math.max(1,Number(body.limit||process.env.EMAIL_BATCH_SIZE||500)));
    const rodizio=body.rodizio!==false;
    const intervaloGlobalSegundos=Math.min(300,Math.max(0,Number(body.intervaloGlobalSegundos??2)));
    const intervaloRemetenteSegundos=Math.min(3600,Math.max(1,Number(body.intervaloRemetenteSegundos??10)));
    const aguardar=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

    let ok=0,fail=0;
    const usados:Record<string,number>={};
    try{
      const [campRows]=await pool.query('SELECT * FROM email_campanhas WHERE id=?',[id]);
      const camp=(campRows as any[])[0];
      if(!camp || camp.status==='CANCELADA') return;

      await pool.query(`UPDATE email_campanhas SET status='ENVIANDO',lote_status='PROCESSANDO',lote_total=?,lote_processados=0,lote_enviados=0,lote_falhas=0,lote_mensagem='Lote iniciado',lote_atualizado_em=NOW(),iniciado_em=COALESCE(iniciado_em,NOW()) WHERE id=?`,[limit,id]);
      const [rows]=await pool.query(`
        SELECT d.id,d.prospect_id,d.email,v.razao_social,v.nome_fantasia,v.cnpj,v.municipio,v.uf,
               v.situacao_cadastral,e.data_situacao
        FROM email_campanha_destinatarios d
        JOIN vw_prospects_completos v ON v.prospect_id=d.prospect_id
        JOIN prospects p ON p.id=d.prospect_id
        JOIN estabelecimentos e ON e.id=p.estabelecimento_id
        LEFT JOIN prospect_crm pc ON pc.prospect_id=d.prospect_id
        LEFT JOIN email_optout eo ON LOWER(eo.email)=LOWER(d.email)
        WHERE d.campanha_id=? AND d.status='PENDENTE'
          AND COALESCE(pc.nao_contatar,0)=0
          AND COALESCE(pc.status_tempo_real,pc.status_id,v.status_id,0)<>10
          AND eo.email IS NULL
        ORDER BY d.id LIMIT ?
      `,[id,limit]);

      await pool.query(`UPDATE email_campanhas SET lote_total=? WHERE id=?`,[(rows as any[]).length,id]);

      let remetentes:RemetenteConfig[]=[];
      if(rodizio){
        let senderRows:any[]=[];
        const grupoId=Number(body.grupoRemetenteId||camp.grupo_remetente_id||0);
        if(grupoId){
          await pool.query('UPDATE email_campanhas SET grupo_remetente_id=? WHERE id=?',[grupoId,id]);
          const [result]=await pool.query(`SELECT r.* FROM email_remetente_grupo_itens gi JOIN email_remetentes r ON r.id=gi.remetente_id WHERE gi.grupo_id=? AND r.ativo=1 ORDER BY gi.ordem,r.id`,[grupoId]);
          senderRows=result as any[];
        }else{
          const [result]=await pool.query(`SELECT * FROM email_remetentes WHERE ativo=1 AND rodizio=1 ORDER BY padrao DESC,id`);
          senderRows=result as any[];
        }
        for(const r of senderRows){
          remetentes.push({id:Number(r.id),nome:String(r.nome||''),email:String(r.email||r.smtp_user||''),smtp_host:String(r.smtp_host||'smtp.gmail.com'),smtp_port:Number(r.smtp_port||587),smtp_secure:Boolean(r.smtp_secure),smtp_user:String(r.smtp_user||''),smtp_password:String(r.smtp_password||''),from_name:String(r.from_name||r.nome||'FSHold')});
        }
        if(!remetentes.length) throw new Error('O grupo selecionado não possui remetentes ativos.');
      }else{
        remetentes=[await remetenteConfig(camp.remetente_id ? Number(camp.remetente_id) : null)];
      }

      const transportes=new Map<number|string,any>();
      const ultimoUso=new Map<number|string,number>();
      const bloqueados=new Set<number|string>();
      const chave=(r:RemetenteConfig)=>r.id??r.email;
      const tx=(r:RemetenteConfig)=>{const k=chave(r);if(!transportes.has(k)) transportes.set(k,transporter(r));return transportes.get(k);};
      let cursor=0;

      const encerrarPorComando=async(tipo:'PAUSADO'|'PARADO',mensagem:string)=>{
        await pool.query(`UPDATE email_campanhas
          SET status='PRONTA',lote_status=?,lote_mensagem=?,lote_atualizado_em=NOW(),
              enviados=enviados+?,falhas=falhas+?
          WHERE id=?`,[tipo,mensagem,ok,fail,id]);
      };

      const verificarComando=async()=>{
        const [controlRows]=await pool.query(`SELECT lote_status FROM email_campanhas WHERE id=?`,[id]);
        const status=String((controlRows as any[])[0]?.lote_status||'');
        if(status==='PAUSA_SOLICITADA'){
          await encerrarPorComando('PAUSADO','Envio pausado pelo usuário. Os destinatários restantes continuam pendentes. Você pode ajustar o grupo de remetentes e continuar depois.');
          return true;
        }
        if(status==='PARADA_SOLICITADA'){
          await encerrarPorComando('PARADO','Envio interrompido pelo usuário. Os destinatários restantes continuam pendentes.');
          return true;
        }
        return false;
      };

      for(let i=0;i<(rows as any[]).length;i++){
        if(await verificarComando()) return;
        const r=(rows as any[])[i];
        let finalizado=false;
        while(!finalizado){
          if(await verificarComando()) return;
          const disponiveis=remetentes.filter(x=>!bloqueados.has(chave(x)));
          if(!disponiveis.length){
            await pool.query(`UPDATE email_campanhas SET status='PRONTA',lote_status='PAUSADO',lote_mensagem=?,lote_atualizado_em=NOW(),enviados=enviados+?,falhas=falhas+? WHERE id=?`,['Todos os remetentes do grupo ficaram indisponíveis. Os restantes continuam pendentes.',ok,fail,id]);
            return;
          }
          let escolhido:RemetenteConfig|null=null;
          let menorEspera=Infinity;
          for(let n=0;n<disponiveis.length;n++){
            const cand=disponiveis[(cursor+n)%disponiveis.length];
            const espera=Math.max(0,(ultimoUso.get(chave(cand))||0)+intervaloRemetenteSegundos*1000-Date.now());
            if(espera<=0){escolhido=cand;cursor=(cursor+n+1)%Math.max(1,disponiveis.length);break;}
            menorEspera=Math.min(menorEspera,espera);
          }
          if(!escolhido){
            await aguardar(Math.max(50,Math.min(menorEspera,1000)));
            continue;
          }
          if(await verificarComando()) return;
          try{
            await tx(escolhido).sendMail({from:fromAddress(escolhido),to:r.email,subject:renderTemplate(camp.assunto,r),html:renderTemplate(camp.corpo_html,r)});
            ultimoUso.set(chave(escolhido),Date.now());
            usados[escolhido.email]=(usados[escolhido.email]||0)+1;
            await pool.query(`UPDATE email_campanha_destinatarios SET status='ENVIADO',tentativas=tentativas+1,enviado_em=NOW(),erro=NULL,remetente_id=? WHERE id=?`,[escolhido.id,r.id]);
            await pool.query(`INSERT INTO prospect_contatos (prospect_id,tipo,telefone_email,resultado,observacoes) VALUES (?,'EMAIL',?,'ENVIADO',?)`,[r.prospect_id,r.email,`Campanha #${id}: ${camp.nome} | Remetente: ${escolhido.email}`]);
            await registrarUsoRemetente(escolhido,null);
            ok++;finalizado=true;
          }catch(e:any){
            const erro=String(e?.message||e).slice(0,2000);
            if(erroLimiteDiario(e)){
              bloqueados.add(chave(escolhido));
              await registrarUsoRemetente(escolhido,erro);
              await pool.query(`UPDATE email_campanha_destinatarios SET tentativas=tentativas+1,erro=? WHERE id=?`,[`LIMITE_DIARIO_REMETENTE ${escolhido.email}: ${erro}`,r.id]);
              continue;
            }
            await pool.query(`UPDATE email_campanha_destinatarios SET status='FALHOU',tentativas=tentativas+1,erro=?,remetente_id=? WHERE id=?`,[erro,escolhido.id,r.id]);
            fail++;finalizado=true;
          }
          await pool.query(`UPDATE email_campanhas SET lote_processados=?,lote_enviados=?,lote_falhas=?,lote_mensagem=?,lote_atualizado_em=NOW() WHERE id=?`,[ok+fail,ok,fail,`Processados ${ok+fail} de ${(rows as any[]).length}`,id]);
          if(i<(rows as any[]).length-1 && intervaloGlobalSegundos>0) await aguardar(intervaloGlobalSegundos*1000);
        }
      }

      await pool.query(`UPDATE email_campanhas SET enviados=enviados+?,falhas=falhas+? WHERE id=?`,[ok,fail,id]);
      const [leftRows]=await pool.query(`SELECT COUNT(*) pendentes FROM email_campanha_destinatarios WHERE campanha_id=? AND status='PENDENTE'`,[id]);
      const pending=Number((leftRows as any[])[0].pendentes);
      if(pending===0) await pool.query(`UPDATE email_campanhas SET status='CONCLUIDA',lote_status='CONCLUIDO',lote_mensagem='Lote concluído',lote_atualizado_em=NOW(),finalizado_em=NOW() WHERE id=?`,[id]);
      else await pool.query(`UPDATE email_campanhas SET status='PRONTA',lote_status='CONCLUIDO',lote_mensagem=?,lote_atualizado_em=NOW() WHERE id=?`,[`Lote concluído. ${pending} destinatário(s) continuam pendentes.`,id]);
    }catch(e:any){
      await pool.query(`UPDATE email_campanhas SET status='PRONTA',lote_status='ERRO',lote_mensagem=?,lote_atualizado_em=NOW() WHERE id=?`,[String(e?.message||e).slice(0,500),id]).catch(()=>{});
    }finally{
      campaignJobs.delete(id);
    }
  }

  app.post('/email-campaigns/:id/process', async (req,reply)=>{
    const id=Number((req.params as any).id);
    const body=(req.body as any)||{};
    const [campRows]=await pool.query('SELECT id,status,lote_status FROM email_campanhas WHERE id=?',[id]);
    const camp=(campRows as any[])[0];
    if(!camp) return reply.code(404).send({ok:false,message:'Campanha não encontrada'});
    if(camp.status==='CANCELADA') return reply.code(400).send({ok:false,message:'Campanha cancelada.'});
    if(campaignJobs.has(id)) return {ok:true,accepted:true,alreadyRunning:true,message:'A campanha já está sendo processada.'};
    campaignJobs.add(id);
    void processCampaignInBackground(id,body);
    return reply.code(202).send({ok:true,accepted:true,message:'Lote iniciado em segundo plano. Acompanhe o progresso na tela.'});
  });

  app.post('/email-campaigns/:id/pause', async (req,reply)=>{
    const id=Number((req.params as any).id);
    const [rows]=await pool.query(`SELECT id,status,lote_status FROM email_campanhas WHERE id=?`,[id]);
    const camp=(rows as any[])[0];
    if(!camp) return reply.code(404).send({ok:false,message:'Campanha não encontrada'});
    if(camp.status==='CONCLUIDA') return reply.code(400).send({ok:false,message:'A campanha já foi concluída.'});
    if(campaignJobs.has(id)){
      await pool.query(`UPDATE email_campanhas SET lote_status='PAUSA_SOLICITADA',lote_mensagem='Pausa solicitada. Aguardando o envio em andamento terminar...',lote_atualizado_em=NOW() WHERE id=?`,[id]);
      return {ok:true,message:'Pausa solicitada. O processamento será interrompido com segurança após o envio que já estiver em andamento.'};
    }
    await pool.query(`UPDATE email_campanhas SET status='PRONTA',lote_status='PAUSADO',lote_mensagem='Envio pausado pelo usuário.',lote_atualizado_em=NOW() WHERE id=?`,[id]);
    return {ok:true,message:'Campanha pausada.'};
  });

  app.post('/email-campaigns/:id/stop', async (req,reply)=>{
    const id=Number((req.params as any).id);
    const [rows]=await pool.query(`SELECT id,status,lote_status FROM email_campanhas WHERE id=?`,[id]);
    const camp=(rows as any[])[0];
    if(!camp) return reply.code(404).send({ok:false,message:'Campanha não encontrada'});
    if(camp.status==='CONCLUIDA') return reply.code(400).send({ok:false,message:'A campanha já foi concluída.'});
    if(campaignJobs.has(id)){
      await pool.query(`UPDATE email_campanhas SET lote_status='PARADA_SOLICITADA',lote_mensagem='Parada solicitada. Aguardando o envio em andamento terminar...',lote_atualizado_em=NOW() WHERE id=?`,[id]);
      return {ok:true,message:'Parada solicitada. Os destinatários ainda não processados permanecerão pendentes.'};
    }
    await pool.query(`UPDATE email_campanhas SET status='PRONTA',lote_status='PARADO',lote_mensagem='Envio interrompido pelo usuário.',lote_atualizado_em=NOW() WHERE id=?`,[id]);
    return {ok:true,message:'Envio interrompido.'};
  });

  app.get('/email-campaigns/:id/progress', async req=>{
    const id=Number((req.params as any).id);
    const [rows]=await pool.query(`SELECT id,status,lote_status,lote_total,lote_processados,lote_enviados,lote_falhas,lote_mensagem,lote_atualizado_em FROM email_campanhas WHERE id=?`,[id]);
    const c=(rows as any[])[0];
    if(!c) return {ok:false,message:'Campanha não encontrada'};
    const [statsRows]=await pool.query(`SELECT COUNT(*) total,SUM(status='PENDENTE') pendentes,SUM(status='ENVIADO') enviados,SUM(status='FALHOU') falhas FROM email_campanha_destinatarios WHERE campanha_id=?`,[id]);
    return {ok:true,...c,stats:(statsRows as any[])[0],running:campaignJobs.has(id)};
  });

  app.post('/email-campaigns/:id/cancel', async req=>{
    const id=Number((req.params as any).id);

    await pool.query(`
      UPDATE email_campanhas
      SET status='CANCELADA',
          finalizado_em=NOW()
      WHERE id=?
        AND status<>'CONCLUIDA'
    `,[id]);

    return {ok:true};
  });

  app.get('/email-campaigns', async()=>{
    const [rows]=await pool.query(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM email_campanha_destinatarios d
          WHERE d.campanha_id=c.id AND d.status='PENDENTE') pendentes,
        (SELECT COUNT(*) FROM email_campanha_destinatarios d
          WHERE d.campanha_id=c.id AND d.status='ENVIADO') enviados_reais,
        (SELECT COUNT(*) FROM email_campanha_destinatarios d
          WHERE d.campanha_id=c.id AND d.status='FALHOU') falhas_reais
      FROM email_campanhas c
      ORDER BY c.id DESC
      LIMIT 100
    `);

    return rows;
  });

  app.get('/email-campaigns/:id', async req=>{
    const id=Number((req.params as any).id);

    const [campRows]=await pool.query(`
      SELECT *
      FROM email_campanhas
      WHERE id=?
    `,[id]);

    const campanha=(campRows as any[])[0];

    if(!campanha){
      return {
        ok:false,
        message:'Campanha não encontrada'
      };
    }

    const [statsRows]=await pool.query(`
      SELECT
        COUNT(*) total,
        SUM(status='PENDENTE') pendentes,
        SUM(status='ENVIADO') enviados,
        SUM(status='FALHOU') falhas,
        SUM(status='REMOVIDO') removidos
      FROM email_campanha_destinatarios
      WHERE campanha_id=?
    `,[id]);

    return {
      campanha,
      stats:(statsRows as any[])[0]
    };
  });

  app.get('/email-campaigns/:id/recipients', async req=>{
    const id=Number((req.params as any).id);

    const q=z.object({
      status:z.enum(['','PENDENTE','ENVIADO','FALHOU','REMOVIDO']).default(''),
      page:z.coerce.number().min(1).default(1),
      pageSize:z.coerce.number().min(10).max(500).default(50)
    }).parse(req.query);

    const where=['d.campanha_id=?'];
    const params:any[]=[id];

    if(q.status){
      where.push('d.status=?');
      params.push(q.status);
    }

    const [countRows]=await pool.query(`
      SELECT COUNT(*) total
      FROM email_campanha_destinatarios d
      WHERE ${where.join(' AND ')}
    `,params);

    const offset=(q.page-1)*q.pageSize;

    const [rows]=await pool.query(`
      SELECT
        d.id,
        d.prospect_id,
        d.email,
        d.status,
        d.tentativas,
        d.erro,
        d.enviado_em,
        d.criado_em,
        v.cnpj,
        v.razao_social,
        v.nome_fantasia
      FROM email_campanha_destinatarios d
      JOIN vw_prospects_completos v
        ON v.prospect_id=d.prospect_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.id
      LIMIT ? OFFSET ?
    `,[...params,q.pageSize,offset]);

    return {
      items:rows,
      total:Number((countRows as any[])[0].total),
      page:q.page,
      pageSize:q.pageSize
    };
  });
}
