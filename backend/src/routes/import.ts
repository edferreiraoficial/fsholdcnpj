import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import yauzl from 'yauzl';
import { parse } from 'csv-parse';
import { pool } from '../lib/db.js';
import { job, addClient, emit, logLine } from '../importer/job.js';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);

async function readMunicipiosZip() {
  const zipDir=process.env.CNPJ_ZIP_DIR;
  if(!zipDir || !fs.existsSync(zipDir)) return [];
  const files=fs.readdirSync(zipDir)
    .filter(f=>f.toLowerCase().endsWith('.zip') && /munic/i.test(f))
    .map(f=>path.join(zipDir,f));
  const rows:any[]=[];

  const openZip=(p:string)=>new Promise<any>((resolve,reject)=>{
    yauzl.open(p,{lazyEntries:true,autoClose:false},(e,z)=>e?reject(e):resolve(z));
  });
  const nextEntry=(zip:any)=>new Promise<any>((resolve,reject)=>{
    const onEntry=(e:any)=>done(resolve,e),onEnd=()=>done(resolve,null),onError=(e:any)=>done(reject,e);
    function done(fn:any,v:any){zip.removeListener('entry',onEntry);zip.removeListener('end',onEnd);zip.removeListener('error',onError);fn(v);}
    zip.once('entry',onEntry);zip.once('end',onEnd);zip.once('error',onError);zip.readEntry();
  });
  const entryStream=(zip:any,entry:any)=>new Promise<any>((resolve,reject)=>{
    zip.openReadStream(entry,(e:any,s:any)=>e?reject(e):resolve(s));
  });

  for(const file of files){
    const zip=await openZip(file);
    try{
      while(true){
        const entry=await nextEntry(zip);
        if(!entry) break;
        if(/\/$/.test(entry.fileName)) continue;
        const stream=await entryStream(zip,entry);
        const parser=stream.pipe(parse({
          delimiter:';',quote:'"',relax_quotes:true,relax_column_count:true,
          skip_empty_lines:true,encoding:'latin1',bom:true
        }));
        for await(const r of parser){
          const codigo=String(r[0]??'').trim();
          const nome=String(r[1]??'').replace(/\r/g,'').trim();
          if(codigo && nome) rows.push({codigo,nome,uf:null});
        }
      }
    } finally { zip.close(); }
  }
  return rows;
}

export async function importRoutes(app:FastifyInstance){
  app.get('/import/municipios', async req=>{
    const q=String((req.query as any)?.q||'').trim();
    const uf=String((req.query as any)?.uf||'').trim().toUpperCase();

    const [rows]=await pool.query(
      `SELECT codigo,nome,uf FROM municipios
       WHERE (?='' OR uf=? OR uf IS NULL)
         AND (?='' OR nome LIKE ?)
       ORDER BY nome LIMIT 500`,
      [uf,uf,q,`%${q}%`]
    );
    if((rows as any[]).length) return rows;

    const zipRows=await readMunicipiosZip();
    return zipRows
      .filter(x=>!q || x.nome.toUpperCase().includes(q.toUpperCase()))
      .slice(0,500);
  });

  app.post('/import/municipios/carregar', async ()=>{
    const rows=await readMunicipiosZip();
    const batch=500;
    for(let i=0;i<rows.length;i+=batch){
      const block=rows.slice(i,i+batch);
      const one='(?,?,?)';
      await pool.query(
        `INSERT INTO municipios (codigo,nome,uf)
         VALUES ${block.map(()=>one).join(',')}
         ON DUPLICATE KEY UPDATE nome=VALUES(nome)`,
        block.flatMap(x=>[x.codigo,x.nome,null])
      );
    }
    const [count]=await pool.query('SELECT COUNT(*) total FROM municipios');
    return {ok:true,importados:rows.length,totalNoBanco:Number((count as any[])[0].total)};
  });

  app.get('/import/options', async ()=>{
    const [motivos]=await pool.query('SELECT codigo,descricao FROM motivos_situacao ORDER BY codigo');
    const [cnaes]=await pool.query('SELECT codigo,descricao FROM cnaes ORDER BY descricao LIMIT 5000');
    const [historico]=await pool.query(`
      SELECT id,referencia,filtro_uf,filtro_municipios,filtro_situacao,
             encontrados,inseridos,iniciado_em,finalizado_em,status,mensagem
      FROM importacoes_cnpj ORDER BY id DESC LIMIT 30
    `);
    return {motivos,cnaes,historico};
  });

  app.get('/import/status', async()=>({
    running:job.running,startedAt:job.startedAt,finishedAt:job.finishedAt,
    exitCode:job.exitCode,error:job.error,filters:job.filters,logs:job.logs.slice(-500)
  }));

  app.get('/import/events', async(_req,reply)=>{
    reply.hijack();
    reply.raw.writeHead(200,{
      'Content-Type':'text/event-stream',
      'Cache-Control':'no-cache',
      'Connection':'keep-alive',
      'Access-Control-Allow-Origin':'*'
    });
    reply.raw.write(`data: ${JSON.stringify({type:'snapshot',job})}\n\n`);
    addClient(reply);
  });

  app.post('/import/start', async(req,reply)=>{
    if(job.running) return reply.code(409).send({message:'Já existe uma importação em andamento.'});

    const f=z.object({
      uf:z.string().length(2).default('SP'),
      situacao:z.string().max(2).default(''),
      municipios:z.array(z.string()).default([]),
      somenteMatriz:z.boolean().default(true),
      motivos:z.array(z.string()).default([]),
      cnaes:z.array(z.string()).default([]),
      porte:z.array(z.string()).default([]),
      simples:z.enum(['','S','N']).default(''),
      mei:z.enum(['','S','N']).default(''),
      resume:z.boolean().default(false)
    }).parse(req.body);

    try{await pool.query('SELECT 1');}
    catch(error:any){
      return reply.code(503).send({
        message:'Banco indisponível. Verifique o túnel SSH.',
        error:error?.message
      });
    }

    const worker=path.resolve(__dirname,'..','importer','worker.js');
    job.running=true;
    job.startedAt=new Date().toISOString();
    job.finishedAt=null;
    job.exitCode=null;
    job.error=null;
    job.logs=[];
    job.filters=f;

    const child=spawn(process.execPath,[worker],{
      cwd:path.dirname(worker),
      env:{
        ...process.env,
        FILTRO_UF:f.uf,
        FILTRO_SITUACAO:f.situacao,
        FILTRO_MUNICIPIOS:f.municipios.join(','),
        SOMENTE_MATRIZ:f.somenteMatriz?'S':'N',
        FILTRO_MOTIVOS:f.motivos.join(','),
        FILTRO_CNAES:f.cnaes.join(','),
        FILTRO_PORTE:f.porte.join(','),
        FILTRO_SIMPLES:f.simples,
        FILTRO_MEI:f.mei,
        IMPORT_RESUME:f.resume?'S':'N'
      },
      windowsHide:true
    });
    job.child=child;

    logLine(`Importação iniciada: ${f.uf} | situação ${f.situacao} | cidades ${f.municipios.join(', ')||'TODAS'}`);
    child.stdout.on('data',d=>logLine(String(d)));
    child.stderr.on('data',d=>logLine(String(d)));
    child.on('error',e=>{
      job.running=false;job.error=e.message;job.finishedAt=new Date().toISOString();
      logLine(`ERRO DO PROCESSO: ${e.message}`);emit({type:'status',job});
    });
    child.on('close',code=>{
      job.running=false;job.exitCode=code;job.finishedAt=new Date().toISOString();
      if(code!==0 && !job.error) job.error=`Processo encerrado com código ${code}`;
      logLine(`Processo encerrado com código ${code}`);emit({type:'status',job});
    });

    return {ok:true,startedAt:job.startedAt};
  });

  app.post('/import/cancel', async(_req,reply)=>{
    if(!job.running || !job.child) return reply.code(409).send({message:'Nenhuma importação em andamento.'});
    job.child.kill();
    logLine('Cancelamento solicitado.');
    return {ok:true};
  });
}
