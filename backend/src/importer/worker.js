import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import mysql from 'mysql2/promise';
import yauzl from 'yauzl';
import { parse } from 'csv-parse';

const ZIP_DIR = path.resolve(process.env.CNPJ_ZIP_DIR || './dados');
const CACHE_DIR = path.resolve(process.env.IMPORT_CACHE_DIR || './cache');
const UF = (process.env.FILTRO_UF || 'SP').trim().toUpperCase();
const SITUACAO_RAW = (process.env.FILTRO_SITUACAO || '').trim();
const SITUACAO = SITUACAO_RAW ? SITUACAO_RAW.padStart(2, '0') : '';
const SOMENTE_MATRIZ = (process.env.SOMENTE_MATRIZ || 'S').toUpperCase() === 'S';
const RESUME = (process.env.IMPORT_RESUME || 'N').toUpperCase() === 'S';
const BATCH_SIZE = Math.max(50, Number(process.env.BATCH_SIZE || 300));
const HEARTBEAT_MS = Math.max(15000, Number(process.env.HEARTBEAT_SECONDS || 30) * 1000);

const normalize = v => (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
const setFromEnv = name => new Set((process.env[name] || '').split(',').map(normalize).filter(Boolean));

const MUNICIPIOS = setFromEnv('FILTRO_MUNICIPIOS');
const MOTIVOS = setFromEnv('FILTRO_MOTIVOS');
const CNAES = setFromEnv('FILTRO_CNAES');
const PORTES = setFromEnv('FILTRO_PORTE');
const FILTRO_SIMPLES = (process.env.FILTRO_SIMPLES || '').toUpperCase();
const FILTRO_MEI = (process.env.FILTRO_MEI || '').toUpperCase();

fs.mkdirSync(CACHE_DIR, { recursive: true });

const filterKey = [
  UF,SITUACAO,SOMENTE_MATRIZ?'M':'T',
  [...MUNICIPIOS].sort().join('-') || 'TODAS',
  [...MOTIVOS].sort().join('-') || 'MOTODOS',
  [...CNAES].sort().join('-') || 'CNAETODOS',
  [...PORTES].sort().join('-') || 'PORTETODOS',
  FILTRO_SIMPLES || 'SIMPLES-TODOS',
  FILTRO_MEI || 'MEI-TODOS'
].join('_').replace(/[^A-Z0-9_-]/g, '');

const checkpointPath = path.join(CACHE_DIR, `checkpoint-${filterKey}.json`);
const selectedPath = path.join(CACHE_DIR, `selected-${filterKey}.jsonl`);

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 4,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: 'utf8mb4'
});

let lastHeartbeat = 0;

async function db(sql, params = []) {
  const maxTentativas = 20;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      return await pool.query(sql, params);
    } catch (e) {
      const transient =
        ['PROTOCOL_CONNECTION_LOST','ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT'].includes(e?.code) ||
        /closed state|connection.*closed/i.test(e?.message || '');
      if (!transient) throw e;
      if (tentativa === maxTentativas) throw e;
      const espera = Math.min(30000, 3000 + (tentativa - 1) * 2000);
      console.log(`Conexão com o banco indisponível (${e.code || e.message}). Tentativa ${tentativa}/${maxTentativas}. Nova tentativa em ${Math.round(espera/1000)}s...`);
      await new Promise(r => setTimeout(r, espera));
    }
  }
  throw new Error('Não foi possível restabelecer a conexão com o banco.');
}

async function heartbeat() {
  if (Date.now() - lastHeartbeat < HEARTBEAT_MS) return;
  try { await db('SELECT 1'); lastHeartbeat = Date.now(); } catch {}
}

const clean = v => {
  if (v == null) return null;
  const s = String(v).replace(/\r/g,'').trim();
  return s === '' ? null : s;
};
const pad2 = v => clean(v) ? clean(v).padStart(2,'0') : null;
const date8 = v => {
  const s = clean(v);
  if (!s || s === '0' || s === '00000000' || !/^\d{8}$/.test(s)) return null;
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
};
const decimalBR = v => {
  const s = clean(v);
  if (!s) return null;
  const n = s.replace(/\./g,'').replace(',','.');
  return Number.isFinite(Number(n)) ? n : null;
};

function listZips(regex) {
  if (!fs.existsSync(ZIP_DIR)) throw new Error(`Pasta não encontrada: ${ZIP_DIR}`);
  return fs.readdirSync(ZIP_DIR)
    .filter(f => f.toLowerCase().endsWith('.zip') && regex.test(f))
    .map(f => path.join(ZIP_DIR, f))
    .sort((a,b) => a.localeCompare(b,'pt-BR',{numeric:true}));
}

function openZip(zipPath) {
  return new Promise((resolve,reject) => {
    yauzl.open(zipPath,{lazyEntries:true,autoClose:false},(err,zip)=>err?reject(err):resolve(zip));
  });
}
function nextEntry(zip) {
  return new Promise((resolve,reject) => {
    const onEntry=e=>done(resolve,e), onEnd=()=>done(resolve,null), onError=e=>done(reject,e);
    function done(fn,v){zip.removeListener('entry',onEntry);zip.removeListener('end',onEnd);zip.removeListener('error',onError);fn(v);}
    zip.once('entry',onEntry);zip.once('end',onEnd);zip.once('error',onError);zip.readEntry();
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
        delimiter:';',quote:'"',relax_quotes:true,relax_column_count:true,
        skip_empty_lines:true,encoding:'latin1',bom:true
      }));
      let n = 0;
      for await (const row of parser) {
        await handler(row);
        n++;
        if (n % 100000 === 0) await heartbeat();
      }
    }
  } finally { zip.close(); }
}

async function lookup(regex) {
  const map = new Map();
  for (const zip of listZips(regex)) {
    console.log(`Lookup: ${path.basename(zip)}`);
    await eachRecord(zip, async r => {
      const k = clean(r[0]), v = clean(r[1]);
      if (k) map.set(k,v);
    });
  }
  return map;
}

async function bulkUpsert(table, cols, rows, updates=cols) {
  if (!rows.length) return;
  const one = `(${cols.map(()=>'?').join(',')})`;
  await db(
    `INSERT INTO \`${table}\` (${cols.map(c=>`\`${c}\``).join(',')})
     VALUES ${rows.map(()=>one).join(',')}
     ON DUPLICATE KEY UPDATE ${updates.map(c=>`\`${c}\`=VALUES(\`${c}\`)`).join(',')}`,
    rows.flat()
  );
}

function loadCheckpoint() {
  if (!RESUME || !fs.existsSync(checkpointPath)) return { doneEstab: [], importacaoId: null };
  return JSON.parse(fs.readFileSync(checkpointPath,'utf8'));
}
function saveCheckpoint(cp) { fs.writeFileSync(checkpointPath,JSON.stringify(cp,null,2),'utf8'); }

async function loadSelected() {
  const map = new Map();
  if (!fs.existsSync(selectedPath)) return map;
  const rl = readline.createInterface({ input: fs.createReadStream(selectedPath,{encoding:'utf8'}), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const obj = JSON.parse(line);
    map.set(obj.cnpj,obj);
  }
  return map;
}
function appendSelected(items) {
  if (!items.length) return;
  fs.appendFileSync(selectedPath, items.map(x=>JSON.stringify(x)).join('\n')+'\n','utf8');
}

async function main() {
  console.log(`Banco alvo: ${process.env.DB_NAME}`);
  console.log(`Filtro: UF=${UF} situação=${SITUACAO || 'TODAS'} matriz=${SOMENTE_MATRIZ?'S':'N'} cidades=${MUNICIPIOS.size?[...MUNICIPIOS].join(','):'TODAS'} motivos=${MOTIVOS.size?[...MOTIVOS].join(','):'TODOS'} CNAEs=${CNAES.size?[...CNAES].join(','):'TODOS'} portes=${PORTES.size?[...PORTES].join(','):'TODOS'}`);

  const [info] = await db('SELECT DATABASE() banco, VERSION() versao');
  console.log(`Banco: ${info[0].banco} | ${info[0].versao}`);

  const municipiosLookup = await lookup(/munic/i);
  const cnaesLookup = await lookup(/cnae/i);
  const motivosLookup = await lookup(/motivo/i);
  const naturezasLookup = await lookup(/nature/i);
  const qualificacoesLookup = await lookup(/qualific/i);

  const motivosValidos = new Set([...motivosLookup.keys()].map(x => pad2(x)).filter(Boolean));
  const cnaesValidos = new Set([...cnaesLookup.keys()].map(x => clean(x)).filter(Boolean));
  const municipiosValidos = new Set([...municipiosLookup.keys()].map(x => clean(x)).filter(Boolean));
  const naturezasValidas = new Set([...naturezasLookup.keys()].map(x => clean(x)).filter(Boolean));
  const qualificacoesValidas = new Set([...qualificacoesLookup.keys()].map(x => clean(x)).filter(Boolean));

  // Domínios completos
  for (const [table,map] of [
    ['cnaes',cnaesLookup],
    ['motivos_situacao',motivosLookup],
    ['naturezas_juridicas',naturezasLookup],
    ['qualificacoes_socios',qualificacoesLookup]
  ]) {
    const rows = [...map].map(([a,b]) => [table === 'motivos_situacao' ? pad2(a) : a,b]);
    for (let i=0;i<rows.length;i+=BATCH_SIZE) {
      await bulkUpsert(table,['codigo','descricao'],rows.slice(i,i+BATCH_SIZE),['descricao']);
    }
  }

  // Todos os municípios
  const allMunRows = [...municipiosLookup].map(([codigo,nome]) => [codigo,nome,null]);
  for (let i=0;i<allMunRows.length;i+=BATCH_SIZE) {
    await bulkUpsert('municipios',['codigo','nome','uf'],allMunRows.slice(i,i+BATCH_SIZE),['nome']);
  }
  console.log(`${allMunRows.length.toLocaleString('pt-BR')} municípios disponíveis no banco.`);

  const cp = loadCheckpoint();
  if (!RESUME) {
    try { fs.unlinkSync(selectedPath); } catch {}
  }
  const selected = await loadSelected();

  let cacheMotivosCorrigidos = 0;
  let cacheCnaesCorrigidos = 0;
  let cacheMunicipiosCorrigidos = 0;

  for (const item of selected.values()) {
    if (item.motivo) {
      const motivoNormalizado = pad2(item.motivo);
      if (!motivosValidos.has(motivoNormalizado)) {
        item.motivo = null;
        cacheMotivosCorrigidos++;
      } else {
        item.motivo = motivoNormalizado;
      }
    }
    if (item.cnae && !cnaesValidos.has(clean(item.cnae))) {
      item.cnae = null;
      cacheCnaesCorrigidos++;
    }
    if (item.munCod && !municipiosValidos.has(clean(item.munCod))) {
      item.munCod = null;
      item.munNome = '';
      cacheMunicipiosCorrigidos++;
    }
  }

  console.log(`Cache saneado: ${cacheMotivosCorrigidos.toLocaleString('pt-BR')} motivos, ${cacheCnaesCorrigidos.toLocaleString('pt-BR')} CNAEs e ${cacheMunicipiosCorrigidos.toLocaleString('pt-BR')} municípios inválidos convertidos para NULL.`);

  const basicos = new Set([...selected.values()].map(x=>x.basico));
  const ufPorMunicipio = new Map();

  let importacaoId = cp.importacaoId;
  if (!importacaoId) {
    const [r] = await db(
      `INSERT INTO importacoes_cnpj
       (referencia,filtro_uf,filtro_municipios,filtro_situacao,somente_matriz,status)
       VALUES (?,?,?,?,?,'PROCESSANDO')`,
      [new Date().toISOString().slice(0,7),UF,MUNICIPIOS.size?[...MUNICIPIOS].join(','):null,SITUACAO,SOMENTE_MATRIZ?1:0]
    );
    importacaoId = r.insertId;
    cp.importacaoId = importacaoId;
    saveCheckpoint(cp);
  }

  // Estabelecimentos
  for (const zip of listZips(/estabele/i)) {
    const name = path.basename(zip);
    if (cp.doneEstab.includes(name)) {
      console.log(`Retomada: pulando ${name}`);
      continue;
    }

    console.log(`Filtrando ${name}`);
    let lidos = 0;
    const newItems = [];
    await eachRecord(zip, async r => {
      lidos++;
      const ufReg = clean(r[19]), munCod = clean(r[20]);
      if (ufReg && munCod && !ufPorMunicipio.has(munCod)) ufPorMunicipio.set(munCod,ufReg);

      if (ufReg !== UF) return;
      if (SITUACAO && pad2(r[5]) !== SITUACAO) return;
      if (SOMENTE_MATRIZ && clean(r[3]) !== '1') return;

      const munNome = municipiosLookup.get(munCod) || '';
      if (MUNICIPIOS.size && !MUNICIPIOS.has(normalize(munNome))) return;

      const motivo = pad2(r[7]);
      if (MOTIVOS.size && !MOTIVOS.has(normalize(motivo))) return;

      const cnae = clean(r[11]);
      if (CNAES.size && !CNAES.has(normalize(cnae))) return;

      const basico=clean(r[0]), ordem=clean(r[1]), dv=clean(r[2]);
      const cnpj=`${basico||''}${ordem||''}${dv||''}`;
      const item={
        cnpj,basico,ordem,dv,munCod,munNome,
        matriz:clean(r[3]),fantasia:clean(r[4]),situacao:pad2(r[5]),
        dataSituacao:date8(r[6]),motivo,dataInicio:date8(r[10]),
        cnae,cnaesSec:clean(r[12]),tipoLog:clean(r[13]),logradouro:clean(r[14]),
        numero:clean(r[15]),complemento:clean(r[16]),bairro:clean(r[17]),cep:clean(r[18]),
        uf:ufReg,telefone1:[clean(r[21]),clean(r[22])].filter(Boolean).join('')||null,
        telefone2:[clean(r[23]),clean(r[24])].filter(Boolean).join('')||null,
        email:clean(r[27]),situacaoEspecial:clean(r[28]),dataSituacaoEspecial:date8(r[29])
      };
      selected.set(cnpj,item);
      basicos.add(basico);
      newItems.push(item);

      if (lidos % 500000 === 0) process.stdout.write(`\r${lidos.toLocaleString('pt-BR')} lidos | ${selected.size.toLocaleString('pt-BR')} selecionados`);
    });

    appendSelected(newItems);
    cp.doneEstab.push(name);
    saveCheckpoint(cp);
    console.log(`\r${lidos.toLocaleString('pt-BR')} lidos | ${selected.size.toLocaleString('pt-BR')} selecionados acumulados`);
  }

  // Atualiza UFs dos municípios aprendidos
  const munUfRows=[...ufPorMunicipio].map(([codigo,uf])=>[codigo,municipiosLookup.get(codigo)||codigo,uf]);
  for(let i=0;i<munUfRows.length;i+=BATCH_SIZE) {
    await bulkUpsert('municipios',['codigo','nome','uf'],munUfRows.slice(i,i+BATCH_SIZE),['nome','uf']);
  }

  // Empresas
  const empresasDados=new Map();
  for(const zip of listZips(/empre/i)) {
    console.log(`Empresas: ${path.basename(zip)}`);
    await eachRecord(zip,async r=>{
      const basico=clean(r[0]);
      if(!basicos.has(basico)) return;
      const porte=clean(r[5]);
      if(PORTES.size && !PORTES.has(normalize(porte))) return;
      const naturezaRaw = clean(r[2]);
      const qualRespRaw = clean(r[3]);

      // Somente grava a FK quando o código realmente existe
      // nas tabelas auxiliares da Receita.
      const natureza =
        naturezaRaw && naturezasValidas.has(naturezaRaw)
          ? naturezaRaw
          : null;

      const qualResp =
        qualRespRaw && qualificacoesValidas.has(qualRespRaw)
          ? qualRespRaw
          : null;

      empresasDados.set(basico,{
        basico,
        razao: clean(r[1]),
        natureza,
        qualResp,
        capital: decimalBR(r[4]),
        porte,
        ente: clean(r[6])
      });
    });
  }

  const allowedBasicos=new Set(empresasDados.keys());
  const eRows=[...empresasDados.values()].map(e=>[e.basico,e.razao,e.natureza,e.qualResp,e.capital,e.porte,e.ente,importacaoId]);
  for(let i=0;i<eRows.length;i+=BATCH_SIZE){
    await bulkUpsert('empresas',
      ['cnpj_basico','razao_social','natureza_juridica_codigo','qualificacao_responsavel_codigo','capital_social','porte','ente_federativo_responsavel','importacao_id'],
      eRows.slice(i,i+BATCH_SIZE),
      ['razao_social','natureza_juridica_codigo','qualificacao_responsavel_codigo','capital_social','porte','ente_federativo_responsavel','importacao_id']);
  }

  const empresaId=new Map(), listaBasicos=[...allowedBasicos];
  for(let i=0;i<listaBasicos.length;i+=500){
    const block=listaBasicos.slice(i,i+500);
    const [rows]=await db(`SELECT id,cnpj_basico FROM empresas WHERE cnpj_basico IN (${block.map(()=>'?').join(',')})`,block);
    rows.forEach(r=>empresaId.set(r.cnpj_basico,r.id));
  }

  // Estabelecimentos
  const estRows=[...selected.values()].filter(e=>empresaId.has(e.basico)).map(e=>[
    empresaId.get(e.basico),e.cnpj,e.ordem,e.dv,e.matriz,e.fantasia,e.situacao,e.dataSituacao,
    e.motivo,e.dataInicio,e.cnae,e.cnaesSec,e.tipoLog,e.logradouro,e.numero,e.complemento,
    e.bairro,e.cep,e.munCod,e.uf,e.telefone1,e.telefone2,e.email,e.situacaoEspecial,e.dataSituacaoEspecial,importacaoId
  ]);
  for(let i=0;i<estRows.length;i+=BATCH_SIZE){
    await bulkUpsert('estabelecimentos',
      ['empresa_id','cnpj','cnpj_ordem','cnpj_dv','matriz_filial','nome_fantasia','situacao_cadastral','data_situacao','motivo_situacao_codigo','data_inicio_atividade','cnae_principal','cnaes_secundarios','tipo_logradouro','logradouro','numero','complemento','bairro','cep','municipio_codigo','uf','telefone1','telefone2','email','situacao_especial','data_situacao_especial','importacao_id'],
      estRows.slice(i,i+BATCH_SIZE),
      ['empresa_id','nome_fantasia','situacao_cadastral','data_situacao','motivo_situacao_codigo','data_inicio_atividade','cnae_principal','cnaes_secundarios','tipo_logradouro','logradouro','numero','complemento','bairro','cep','municipio_codigo','uf','telefone1','telefone2','email','situacao_especial','data_situacao_especial','importacao_id']);
  }

  const cnpjs=[...selected.values()].filter(e=>empresaId.has(e.basico)).map(e=>e.cnpj);
  const estabIds=[];
  for(let i=0;i<cnpjs.length;i+=500){
    const block=cnpjs.slice(i,i+500);
    const [rows]=await db(`SELECT id FROM estabelecimentos WHERE cnpj IN (${block.map(()=>'?').join(',')})`,block);
    estabIds.push(...rows.map(r=>r.id));
  }
  for(let i=0;i<estabIds.length;i+=BATCH_SIZE){
    await bulkUpsert('prospects',['estabelecimento_id','origem','ativo'],
      estabIds.slice(i,i+BATCH_SIZE).map(id=>[id,'RECEITA',1]),['origem','ativo']);
  }

  // Simples / MEI
  for(const zip of listZips(/simples/i)){
    console.log(`Simples/MEI: ${path.basename(zip)}`);
    let batch=[];
    await eachRecord(zip,async r=>{
      const id=empresaId.get(clean(r[0]));
      if(!id) return;
      const simples=clean(r[1]), mei=clean(r[4]);
      if(FILTRO_SIMPLES && simples!==FILTRO_SIMPLES) return;
      if(FILTRO_MEI && mei!==FILTRO_MEI) return;
      batch.push([id,simples,date8(r[2]),date8(r[3]),mei,date8(r[5]),date8(r[6])]);
      if(batch.length>=BATCH_SIZE){
        await bulkUpsert('empresa_tributacao',
          ['empresa_id','simples','data_opcao_simples','data_exclusao_simples','mei','data_opcao_mei','data_exclusao_mei'],
          batch,['simples','data_opcao_simples','data_exclusao_simples','mei','data_opcao_mei','data_exclusao_mei']);
        batch=[];
      }
    });
    if(batch.length){
      await bulkUpsert('empresa_tributacao',
        ['empresa_id','simples','data_opcao_simples','data_exclusao_simples','mei','data_opcao_mei','data_exclusao_mei'],
        batch,['simples','data_opcao_simples','data_exclusao_simples','mei','data_opcao_mei','data_exclusao_mei']);
    }
  }

  // Sócios
  const ids=[...empresaId.values()];
  for(let i=0;i<ids.length;i+=500){
    const block=ids.slice(i,i+500);
    await db(`DELETE FROM socios WHERE empresa_id IN (${block.map(()=>'?').join(',')})`,block);
  }

  for(const zip of listZips(/socio/i)){
    console.log(`Sócios: ${path.basename(zip)}`);
    let batch=[];
    await eachRecord(zip,async r=>{
      const id=empresaId.get(clean(r[0]));
      if(!id) return;
      batch.push([id,clean(r[1]),clean(r[2]),clean(r[3]),clean(r[4]),date8(r[5]),clean(r[6]),clean(r[7]),clean(r[8]),clean(r[9]),clean(r[10])]);
      if(batch.length>=BATCH_SIZE){
        const cols=['empresa_id','identificador_socio','nome_socio_razao_social','cnpj_cpf_socio','qualificacao_codigo','data_entrada_sociedade','pais_codigo','representante_legal','nome_representante','qualificacao_representante_codigo','faixa_etaria'];
        const one=`(${cols.map(()=>'?').join(',')})`;
        await db(`INSERT INTO socios (${cols.map(c=>`\`${c}\``).join(',')}) VALUES ${batch.map(()=>one).join(',')}`,batch.flat());
        batch=[];
      }
    });
    if(batch.length){
      const cols=['empresa_id','identificador_socio','nome_socio_razao_social','cnpj_cpf_socio','qualificacao_codigo','data_entrada_sociedade','pais_codigo','representante_legal','nome_representante','qualificacao_representante_codigo','faixa_etaria'];
      const one=`(${cols.map(()=>'?').join(',')})`;
      await db(`INSERT INTO socios (${cols.map(c=>`\`${c}\``).join(',')}) VALUES ${batch.map(()=>one).join(',')}`,batch.flat());
    }
  }

  await db(`INSERT IGNORE INTO prospect_crm (prospect_id,status_id,prioridade)
            SELECT p.id,1,'NORMAL' FROM prospects p
            JOIN estabelecimentos e ON e.id=p.estabelecimento_id
            WHERE e.importacao_id=?`,[importacaoId]);

  const [counts]=await db(`SELECT
    (SELECT COUNT(*) FROM empresas WHERE importacao_id=?) empresas,
    (SELECT COUNT(*) FROM estabelecimentos WHERE importacao_id=?) estabelecimentos,
    (SELECT COUNT(*) FROM prospects p JOIN estabelecimentos e ON e.id=p.estabelecimento_id WHERE e.importacao_id=?) prospects,
    (SELECT COUNT(*) FROM socios s JOIN empresas e ON e.id=s.empresa_id WHERE e.importacao_id=?) socios`,
    [importacaoId,importacaoId,importacaoId,importacaoId]);

  await db(`UPDATE importacoes_cnpj
            SET encontrados=?,inseridos=?,status='CONCLUIDO',finalizado_em=NOW()
            WHERE id=?`,
            [selected.size,counts[0].estabelecimentos,importacaoId]);

  try { fs.unlinkSync(checkpointPath); } catch {}
  try { fs.unlinkSync(selectedPath); } catch {}

  console.log('IMPORTAÇÃO CONCLUÍDA');
  console.table(counts);
}

main().catch(e=>{
  console.error(`ERRO: ${e.message}`);
  if(e.code) console.error(`Código: ${e.code}`);
  process.exitCode=1;
}).finally(async()=>{try{await pool.end()}catch{}});
