import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import yauzl from 'yauzl';
import { parse } from 'csv-parse';

const ZIP_DIR = path.resolve(process.env.CNPJ_ZIP_DIR || './dados');
const UF = (process.env.FILTRO_UF || 'SP').trim().toUpperCase();
const SITUACAO = (process.env.FILTRO_SITUACAO || '04').trim().padStart(2, '0');
const SOMENTE_MATRIZ = (process.env.SOMENTE_MATRIZ || 'S').trim().toUpperCase() === 'S';
const MUNICIPIOS_FILTRO = new Set((process.env.FILTRO_MUNICIPIOS || '').split(',').map(normalizar).filter(Boolean));
const MOTIVOS_FILTRO = new Set((process.env.FILTRO_MOTIVOS || '').split(',').map(v => v.trim().padStart(2,'0')).filter(Boolean));
const CNAES_FILTRO = new Set((process.env.FILTRO_CNAES || '').split(',').map(v => v.trim()).filter(Boolean));
const PORTES_FILTRO = new Set((process.env.FILTRO_PORTE || '').split(',').map(v => v.trim()).filter(Boolean));
const BATCH_SIZE = Math.max(50, Number(process.env.BATCH_SIZE || 300));
const HEARTBEAT_MS = Math.max(15000, Number(process.env.HEARTBEAT_SECONDS || 45) * 1000);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 0,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: 'utf8mb4'
});

let lastHeartbeat = 0;

async function db(sql, params=[]) {
  for (let attempt=0; attempt<2; attempt++) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      const transient =
        ['PROTOCOL_CONNECTION_LOST','ECONNRESET','EPIPE'].includes(err.code) ||
        /closed state|connection.*closed/i.test(err.message || '');
      if (!transient || attempt === 1) throw err;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
}

async function heartbeat(force=false) {
  const now = Date.now();
  if (!force && now - lastHeartbeat < HEARTBEAT_MS) return;
  try {
    await db('SELECT 1');
    lastHeartbeat = now;
  } catch (err) {
    console.warn(`\nHeartbeat falhou: ${err.message}`);
  }
}

function clean(v) {
  if (v == null) return null;
  const s = String(v).replace(/\r/g,'').trim();
  return s === '' ? null : s;
}
function normalizar(v) {
  return (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
}
function date8(v) {
  const s = clean(v);
  if (!s || s === '0' || s === '00000000' || !/^\d{8}$/.test(s)) return null;
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}
function decimalBR(v) {
  const s = clean(v);
  if (!s) return null;
  const n = s.replace(/\./g,'').replace(',','.');
  return Number.isFinite(Number(n)) ? n : null;
}
function pad2(v) {
  const s = clean(v);
  return s ? s.padStart(2,'0') : null;
}
function zips(regex) {
  return fs.readdirSync(ZIP_DIR)
    .filter(f => f.toLowerCase().endsWith('.zip') && regex.test(f))
    .map(f => path.join(ZIP_DIR,f))
    .sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
}
function openZip(p) {
  return new Promise((resolve,reject)=>yauzl.open(p,{lazyEntries:true,autoClose:false},(e,z)=>e?reject(e):resolve(z)));
}
function nextEntry(zip) {
  return new Promise((resolve,reject)=>{
    const onEntry=e=>done(resolve,e), onEnd=()=>done(resolve,null), onError=e=>done(reject,e);
    function done(fn,v){zip.removeListener('entry',onEntry);zip.removeListener('end',onEnd);zip.removeListener('error',onError);fn(v);}
    zip.once('entry',onEntry); zip.once('end',onEnd); zip.once('error',onError); zip.readEntry();
  });
}
function entryStream(zip,entry) {
  return new Promise((resolve,reject)=>zip.openReadStream(entry,(e,s)=>e?reject(e):resolve(s)));
}
async function eachRecord(zipPath, handler) {
  const zip = await openZip(zipPath);
  try {
    while (true) {
      const entry = await nextEntry(zip);
      if (!entry) break;
      if (/\/$/.test(entry.fileName)) continue;
      const stream = await entryStream(zip,entry);
      const parser = stream.pipe(parse({
        delimiter:';', quote:'"', relax_quotes:true, relax_column_count:true,
        skip_empty_lines:true, encoding:'latin1', bom:true
      }));
      let n=0;
      for await (const row of parser) {
        await handler(row);
        n++;
        if (n % 100000 === 0) await heartbeat();
      }
    }
  } finally { zip.close(); }
}
async function lookup(regex) {
  const m = new Map();
  for (const z of zips(regex)) {
    console.log(`Lookup: ${path.basename(z)}`);
    await eachRecord(z, async r => {
      const k=clean(r[0]), v=clean(r[1]);
      if (k) m.set(k,v);
    });
  }
  return m;
}
async function bulkUpsert(table, cols, rows, updateCols=cols) {
  if (!rows.length) return;
  const one = `(${cols.map(()=>'?').join(',')})`;
  const sql = `INSERT INTO \`${table}\` (${cols.map(c=>`\`${c}\``).join(',')})
               VALUES ${rows.map(()=>one).join(',')}
               ON DUPLICATE KEY UPDATE ${updateCols.map(c=>`\`${c}\`=VALUES(\`${c}\`)`).join(',')}`;
  await db(sql, rows.flat());
}
async function criarImportacao() {
  const cidades = MUNICIPIOS_FILTRO.size ? [...MUNICIPIOS_FILTRO].join(',') : null;
  const [r] = await db(`INSERT INTO importacoes_cnpj
    (referencia,filtro_uf,filtro_municipios,filtro_situacao,somente_matriz,status)
    VALUES (?,?,?,?,?,'PROCESSANDO')`,
    [new Date().toISOString().slice(0,7),UF,cidades,SITUACAO,SOMENTE_MATRIZ?1:0]);
  return r.insertId;
}
async function registrarArquivo(importacaoId,nome,tipo) {
  const [r] = await db(`INSERT INTO importacao_arquivos
    (importacao_id,nome_arquivo,tipo_arquivo,status,iniciado_em)
    VALUES (?,?,?,'PROCESSANDO',NOW())`,[importacaoId,nome,tipo]);
  return r.insertId;
}
async function concluirArquivo(id,lidos,usados,erro=null) {
  await heartbeat(true);
  await db(`UPDATE importacao_arquivos SET registros_lidos=?,registros_utilizados=?,
    status=?,mensagem=?,finalizado_em=NOW() WHERE id=?`,
    [lidos,usados,erro?'ERRO':'CONCLUIDO',erro,id]);
}

async function main() {
  if (!fs.existsSync(ZIP_DIR)) throw new Error(`Pasta não encontrada: ${ZIP_DIR}`);
  let importacaoId=null;
  try {
    const [info] = await db('SELECT DATABASE() banco, VERSION() versao');
    console.log(`Banco: ${info[0].banco} | ${info[0].versao}`);
    console.log(`Filtro: UF=${UF} situação=${SITUACAO} matriz=${SOMENTE_MATRIZ?'S':'N'} cidades=${MUNICIPIOS_FILTRO.size?[...MUNICIPIOS_FILTRO].join(','):'TODAS'} motivos=${MOTIVOS_FILTRO.size?[...MOTIVOS_FILTRO].join(','):'TODOS'} CNAEs=${CNAES_FILTRO.size?[...CNAES_FILTRO].join(','):'TODOS'} portes=${PORTES_FILTRO.size?[...PORTES_FILTRO].join(','):'TODOS'}`);
    importacaoId = await criarImportacao();

    const municipios = await lookup(/munic/i);
    const cnaes = await lookup(/cnae/i);
    const motivos = await lookup(/motivo/i);
    const naturezas = await lookup(/nature/i);
    const qualificacoes = await lookup(/qualific/i);

    let rows=[...cnaes].map(([a,b])=>[a,b]);
    for(let i=0;i<rows.length;i+=BATCH_SIZE) await bulkUpsert('cnaes',['codigo','descricao'],rows.slice(i,i+BATCH_SIZE),['descricao']);
    rows=[...motivos].map(([a,b])=>[pad2(a),b]);
    for(let i=0;i<rows.length;i+=BATCH_SIZE) await bulkUpsert('motivos_situacao',['codigo','descricao'],rows.slice(i,i+BATCH_SIZE),['descricao']);
    rows=[...naturezas].map(([a,b])=>[a,b]);
    for(let i=0;i<rows.length;i+=BATCH_SIZE) await bulkUpsert('naturezas_juridicas',['codigo','descricao'],rows.slice(i,i+BATCH_SIZE),['descricao']);
    rows=[...qualificacoes].map(([a,b])=>[a,b]);
    for(let i=0;i<rows.length;i+=BATCH_SIZE) await bulkUpsert('qualificacoes_socios',['codigo','descricao'],rows.slice(i,i+BATCH_SIZE),['descricao']);

    const selecionados=new Map(), basicos=new Set(), municipiosUsados=new Map();

    for (const z of zips(/estabele/i)) {
      const arqId=await registrarArquivo(importacaoId,path.basename(z),'ESTABELECIMENTOS');
      let lidos=0,usados=0;
      console.log(`\nFiltrando ${path.basename(z)}`);
      try {
        await eachRecord(z, async r=>{
          lidos++;
          if(clean(r[19])!==UF) return;
          if(pad2(r[5])!==SITUACAO) return;
          if(SOMENTE_MATRIZ && clean(r[3])!=='1') return;
          const munCod=clean(r[20]);
          const munNome=municipios.get(munCod)||munCod||'';
          if(MUNICIPIOS_FILTRO.size && !MUNICIPIOS_FILTRO.has(normalizar(munNome))) return;
          if(MOTIVOS_FILTRO.size && !MOTIVOS_FILTRO.has(pad2(r[7]) || '')) return;
          if(CNAES_FILTRO.size && !CNAES_FILTRO.has(clean(r[11]) || '')) return;
          const basico=clean(r[0]), ordem=clean(r[1]), dv=clean(r[2]);
          const cnpj=`${basico||''}${ordem||''}${dv||''}`;
          selecionados.set(cnpj,{
            cnpj,basico,ordem,dv,matriz:clean(r[3]),fantasia:clean(r[4]),
            situacao:pad2(r[5]),dataSituacao:date8(r[6]),motivo:pad2(r[7]),
            dataInicio:date8(r[10]),cnae:clean(r[11]),cnaesSec:clean(r[12]),
            tipoLog:clean(r[13]),logradouro:clean(r[14]),numero:clean(r[15]),
            complemento:clean(r[16]),bairro:clean(r[17]),cep:clean(r[18]),
            munCod,uf:clean(r[19]),
            telefone1:[clean(r[21]),clean(r[22])].filter(Boolean).join('')||null,
            telefone2:[clean(r[23]),clean(r[24])].filter(Boolean).join('')||null,
            email:clean(r[27]),situacaoEspecial:clean(r[28]),dataSituacaoEspecial:date8(r[29])
          });
          basicos.add(basico); municipiosUsados.set(munCod,munNome); usados++;
          if(lidos%500000===0) process.stdout.write(`\r${lidos.toLocaleString('pt-BR')} lidos | ${selecionados.size.toLocaleString('pt-BR')} selecionados`);
        });
        console.log(`\r${lidos.toLocaleString('pt-BR')} lidos | ${selecionados.size.toLocaleString('pt-BR')} selecionados acumulados`);
        await concluirArquivo(arqId,lidos,usados);
      } catch(err) {
        try{await concluirArquivo(arqId,lidos,usados,err.message)}catch{}
        throw err;
      }
    }

    if(!selecionados.size) throw new Error('Nenhum estabelecimento encontrado.');

    rows=[...municipiosUsados].map(([codigo,nome])=>[codigo,nome,UF]);
    for(let i=0;i<rows.length;i+=BATCH_SIZE) await bulkUpsert('municipios',['codigo','nome','uf'],rows.slice(i,i+BATCH_SIZE),['nome','uf']);

    const empresasDados=new Map();
    for(const z of zips(/empre/i)){
      const arqId=await registrarArquivo(importacaoId,path.basename(z),'EMPRESAS');
      let lidos=0,usados=0;
      console.log(`\nEmpresas: ${path.basename(z)}`);
      try{
        await eachRecord(z,async r=>{
          lidos++;
          const b=clean(r[0]); if(!basicos.has(b)) return;
          if(PORTES_FILTRO.size && !PORTES_FILTRO.has(clean(r[5]) || '')) return;
          empresasDados.set(b,{b,razao:clean(r[1]),natureza:clean(r[2]),qualResp:clean(r[3]),capital:decimalBR(r[4]),porte:clean(r[5]),ente:clean(r[6])});
          usados++;
        });
        console.log(`${usados.toLocaleString('pt-BR')} empresas utilizadas`);
        await concluirArquivo(arqId,lidos,usados);
      }catch(err){try{await concluirArquivo(arqId,lidos,usados,err.message)}catch{} throw err;}
    }

    const erows=[...empresasDados.values()].map(e=>[e.b,e.razao,e.natureza,e.qualResp,e.capital,e.porte,e.ente,importacaoId]);
    for(let i=0;i<erows.length;i+=BATCH_SIZE) await bulkUpsert('empresas',
      ['cnpj_basico','razao_social','natureza_juridica_codigo','qualificacao_responsavel_codigo','capital_social','porte','ente_federativo_responsavel','importacao_id'],
      erows.slice(i,i+BATCH_SIZE),
      ['razao_social','natureza_juridica_codigo','qualificacao_responsavel_codigo','capital_social','porte','ente_federativo_responsavel','importacao_id']);

    const empresaId=new Map(), listaBasicos=[...basicos];
    for(let i=0;i<listaBasicos.length;i+=500){
      const bloco=listaBasicos.slice(i,i+500);
      const [rs]=await db(`SELECT id,cnpj_basico FROM empresas WHERE cnpj_basico IN (${bloco.map(()=>'?').join(',')})`,bloco);
      rs.forEach(r=>empresaId.set(r.cnpj_basico,r.id));
    }

    const estRows=[...selecionados.values()].filter(e=>empresaId.has(e.basico)).map(e=>[
      empresaId.get(e.basico),e.cnpj,e.ordem,e.dv,e.matriz,e.fantasia,e.situacao,e.dataSituacao,e.motivo,e.dataInicio,
      e.cnae,e.cnaesSec,e.tipoLog,e.logradouro,e.numero,e.complemento,e.bairro,e.cep,e.munCod,e.uf,e.telefone1,e.telefone2,
      e.email,e.situacaoEspecial,e.dataSituacaoEspecial,importacaoId
    ]);
    for(let i=0;i<estRows.length;i+=BATCH_SIZE) await bulkUpsert('estabelecimentos',
      ['empresa_id','cnpj','cnpj_ordem','cnpj_dv','matriz_filial','nome_fantasia','situacao_cadastral','data_situacao','motivo_situacao_codigo','data_inicio_atividade','cnae_principal','cnaes_secundarios','tipo_logradouro','logradouro','numero','complemento','bairro','cep','municipio_codigo','uf','telefone1','telefone2','email','situacao_especial','data_situacao_especial','importacao_id'],
      estRows.slice(i,i+BATCH_SIZE),
      ['empresa_id','cnpj_ordem','cnpj_dv','matriz_filial','nome_fantasia','situacao_cadastral','data_situacao','motivo_situacao_codigo','data_inicio_atividade','cnae_principal','cnaes_secundarios','tipo_logradouro','logradouro','numero','complemento','bairro','cep','municipio_codigo','uf','telefone1','telefone2','email','situacao_especial','data_situacao_especial','importacao_id']);

    const estabId=new Map(), listaCnpjs=[...selecionados.keys()];
    for(let i=0;i<listaCnpjs.length;i+=500){
      const bloco=listaCnpjs.slice(i,i+500);
      const [rs]=await db(`SELECT id,cnpj FROM estabelecimentos WHERE cnpj IN (${bloco.map(()=>'?').join(',')})`,bloco);
      rs.forEach(r=>estabId.set(r.cnpj,r.id));
    }
    const prows=[...estabId.values()].map(id=>[id,'RECEITA',1]);
    for(let i=0;i<prows.length;i+=BATCH_SIZE) await bulkUpsert('prospects',['estabelecimento_id','origem','ativo'],prows.slice(i,i+BATCH_SIZE),['origem','ativo']);

    for(const z of zips(/simples/i)){
      const arqId=await registrarArquivo(importacaoId,path.basename(z),'SIMPLES');
      let lidos=0,usados=0,lote=[];
      console.log(`\nSimples/MEI: ${path.basename(z)}`);
      try{
        await eachRecord(z,async r=>{
          lidos++;
          const id=empresaId.get(clean(r[0])); if(!id) return;
          lote.push([id,clean(r[1]),date8(r[2]),date8(r[3]),clean(r[4]),date8(r[5]),date8(r[6])]); usados++;
          if(lote.length>=BATCH_SIZE){
            await bulkUpsert('empresa_tributacao',['empresa_id','simples','data_opcao_simples','data_exclusao_simples','mei','data_opcao_mei','data_exclusao_mei'],lote,['simples','data_opcao_simples','data_exclusao_simples','mei','data_opcao_mei','data_exclusao_mei']);
            lote=[];
          }
        });
        if(lote.length) await bulkUpsert('empresa_tributacao',['empresa_id','simples','data_opcao_simples','data_exclusao_simples','mei','data_opcao_mei','data_exclusao_mei'],lote,['simples','data_opcao_simples','data_exclusao_simples','mei','data_opcao_mei','data_exclusao_mei']);
        await concluirArquivo(arqId,lidos,usados);
      }catch(err){try{await concluirArquivo(arqId,lidos,usados,err.message)}catch{} throw err;}
    }

    const ids=[...empresaId.values()];
    for(let i=0;i<ids.length;i+=500){
      const bloco=ids.slice(i,i+500);
      await db(`DELETE FROM socios WHERE empresa_id IN (${bloco.map(()=>'?').join(',')})`,bloco);
    }

    for(const z of zips(/socio/i)){
      const arqId=await registrarArquivo(importacaoId,path.basename(z),'SOCIOS');
      let lidos=0,usados=0,lote=[];
      console.log(`\nSócios: ${path.basename(z)}`);
      try{
        await eachRecord(z,async r=>{
          lidos++;
          const id=empresaId.get(clean(r[0])); if(!id) return;
          lote.push([id,clean(r[1]),clean(r[2]),clean(r[3]),clean(r[4]),date8(r[5]),clean(r[6]),clean(r[7]),clean(r[8]),clean(r[9]),clean(r[10])]); usados++;
          if(lote.length>=BATCH_SIZE){
            const cols=['empresa_id','identificador_socio','nome_socio_razao_social','cnpj_cpf_socio','qualificacao_codigo','data_entrada_sociedade','pais_codigo','representante_legal','nome_representante','qualificacao_representante_codigo','faixa_etaria'];
            const one=`(${cols.map(()=>'?').join(',')})`;
            await db(`INSERT INTO socios (${cols.map(c=>`\`${c}\``).join(',')}) VALUES ${lote.map(()=>one).join(',')}`,lote.flat());
            lote=[];
          }
        });
        if(lote.length){
          const cols=['empresa_id','identificador_socio','nome_socio_razao_social','cnpj_cpf_socio','qualificacao_codigo','data_entrada_sociedade','pais_codigo','representante_legal','nome_representante','qualificacao_representante_codigo','faixa_etaria'];
          const one=`(${cols.map(()=>'?').join(',')})`;
          await db(`INSERT INTO socios (${cols.map(c=>`\`${c}\``).join(',')}) VALUES ${lote.map(()=>one).join(',')}`,lote.flat());
        }
        await concluirArquivo(arqId,lidos,usados);
      }catch(err){try{await concluirArquivo(arqId,lidos,usados,err.message)}catch{} throw err;}
    }

    await db(`INSERT IGNORE INTO prospect_crm (prospect_id,status_id,prioridade)
      SELECT p.id,1,'NORMAL' FROM prospects p
      JOIN estabelecimentos e ON e.id=p.estabelecimento_id WHERE e.importacao_id=?`,[importacaoId]);

    const [cnt]=await db(`SELECT
      (SELECT COUNT(*) FROM empresas WHERE importacao_id=?) empresas,
      (SELECT COUNT(*) FROM estabelecimentos WHERE importacao_id=?) estabelecimentos,
      (SELECT COUNT(*) FROM prospects p JOIN estabelecimentos e ON e.id=p.estabelecimento_id WHERE e.importacao_id=?) prospects,
      (SELECT COUNT(*) FROM socios s JOIN empresas e ON e.id=s.empresa_id WHERE e.importacao_id=?) socios`,
      [importacaoId,importacaoId,importacaoId,importacaoId]);

    await db(`UPDATE importacoes_cnpj SET encontrados=?,inseridos=?,status='CONCLUIDO',finalizado_em=NOW() WHERE id=?`,
      [selecionados.size,cnt[0].estabelecimentos,importacaoId]);

    console.log('\nIMPORTAÇÃO CONCLUÍDA');
    console.table(cnt);
  } catch(err) {
    if(importacaoId) {
      try{await db(`UPDATE importacoes_cnpj SET status='ERRO',mensagem=?,finalizado_em=NOW() WHERE id=?`,[err.message,importacaoId]);}catch{}
    }
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch(err=>{
  console.error('\nERRO:',err.message);
  if(err.code) console.error('Código:',err.code);
  process.exit(1);
});
