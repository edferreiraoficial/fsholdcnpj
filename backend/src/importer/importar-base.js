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
const SITUACAO = (process.env.FILTRO_SITUACAO || '04').trim().padStart(2, '0');
const SOMENTE_MATRIZ = (process.env.SOMENTE_MATRIZ || 'S').toUpperCase() === 'S';
const BATCH_SIZE = Math.max(50, Number(process.env.BATCH_SIZE || 300));
const HEARTBEAT_MS = Math.max(15000, Number(process.env.HEARTBEAT_SECONDS || 30) * 1000);
const RESUME = (process.env.IMPORT_RESUME || 'N').toUpperCase() === 'S';

const setFromEnv = name =>
  new Set((process.env[name] || '').split(',').map(normalizar).filter(Boolean));

const MUNICIPIOS = setFromEnv('FILTRO_MUNICIPIOS');
const MOTIVOS = setFromEnv('FILTRO_MOTIVOS');
const CNAES = setFromEnv('FILTRO_CNAES');
const PORTES = setFromEnv('FILTRO_PORTE');
const FILTRO_SIMPLES = (process.env.FILTRO_SIMPLES || '').toUpperCase();
const FILTRO_MEI = (process.env.FILTRO_MEI || '').toUpperCase();

fs.mkdirSync(CACHE_DIR, { recursive: true });

const filterKey = [
  UF, SITUACAO, SOMENTE_MATRIZ ? 'M' : 'T',
  [...MUNICIPIOS].sort().join('-') || 'TODAS',
  [...MOTIVOS].sort().join('-') || 'MOTODOS',
  [...CNAES].sort().join('-') || 'CNAETODOS',
  [...PORTES].sort().join('-') || 'PORTETODOS'
].join('_').replace(/[^A-Z0-9_-]/g, '');

const checkpointPath = path.join(CACHE_DIR, `checkpoint-${filterKey}.json`);
const selectedPath = path.join(CACHE_DIR, `selecionados-${filterKey}.jsonl`);

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 4,
  queueLimit: 0,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: 'utf8mb4'
});

let lastHeartbeat = 0;

async function db(sql, params = []) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      const transient =
        ['PROTOCOL_CONNECTION_LOST','ECONNRESET','EPIPE','ETIMEDOUT'].includes(error?.code) ||
        /closed state|connection.*closed/i.test(error?.message || '');
      if (!transient || attempt === 1) throw error;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
}

async function heartbeat(force = false) {
  const now = Date.now();
  if (!force && now - lastHeartbeat < HEARTBEAT_MS) return;
  try {
    await db('SELECT 1');
    lastHeartbeat = now;
  } catch (error) {
    console.log(`AVISO heartbeat: ${error.message}`);
  }
}

function clean(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\r/g, '').trim();
  return s === '' ? null : s;
}

function normalizar(v) {
  return (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function pad2(v) {
  const s = clean(v);
  return s ? s.padStart(2, '0') : null;
}

function date8(v) {
  const s = clean(v);
  if (!s || s === '0' || s === '00000000' || !/^\d{8}$/.test(s)) return null;
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}

function decimalBR(v) {
  const s = clean(v);
  if (!s) return null;
  const n = s.replace(/\./g, '').replace(',', '.');
  return Number.isFinite(Number(n)) ? n : null;
}

function listZips(regex) {
  if (!fs.existsSync(ZIP_DIR)) throw new Error(`Pasta não encontrada: ${ZIP_DIR}`);
  return fs.readdirSync(ZIP_DIR)
    .filter(f => f.toLowerCase().endsWith('.zip') && regex.test(f))
    .map(f => path.join(ZIP_DIR, f))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zip) =>
      err ? reject(err) : resolve(zip)
    );
  });
}

function nextEntry(zip) {
  return new Promise((resolve, reject) => {
    const onEntry = e => done(resolve, e);
    const onEnd = () => done(resolve, null);
    const onError = e => done(reject, e);
    function done(fn, value) {
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
}

function entryStream(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => err ? reject(err) : resolve(stream));
  });
}

async function eachRecord(zipPath, handler) {
  const zip = await openZip(zipPath);
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
      let count = 0;
      for await (const row of parser) {
        await handler(row);
        count++;
        if (count % 100000 === 0) await heartbeat();
      }
    }
  } finally {
    zip.close();
  }
}

async function lookup(regex) {
  const map = new Map();
  for (const zip of listZips(regex)) {
    console.log(`Lookup: ${path.basename(zip)}`);
    await eachRecord(zip, async row => {
      const key = clean(row[0]);
      const value = clean(row[1]);
      if (key) map.set(key, value);
    });
  }
  return map;
}

async function bulkUpsert(table, columns, rows, updateColumns = columns) {
  if (!rows.length) return;
  const one = `(${columns.map(() => '?').join(',')})`;
  const sql = `
    INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(',')})
    VALUES ${rows.map(() => one).join(',')}
    ON DUPLICATE KEY UPDATE
    ${updateColumns.map(c => `\`${c}\`=VALUES(\`${c}\`)`).join(',')}
  `;
  await db(sql, rows.flat());
}

function loadCheckpoint() {
  if (!RESUME || !fs.existsSync(checkpointPath)) {
    return { phase: 'estabelecimentos', completedEstab: [], completedEmpresas: [], importacaoId: null };
  }
  return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
}

function saveCheckpoint(cp) {
  fs.writeFileSync(checkpointPath, JSON.stringify(cp, null, 2), 'utf8');
}

async function loadSelectedJsonl() {
  const map = new Map();
  if (!fs.existsSync(selectedPath)) return map;

  const rl = readline.createInterface({
    input: fs.createReadStream(selectedPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const item = JSON.parse(line);
    map.set(item.cnpj, item);
  }
  return map;
}

function appendSelected(items) {
  if (!items.length) return;
  fs.appendFileSync(selectedPath, items.map(x => JSON.stringify(x)).join('\n') + '\n', 'utf8');
}

async function main() {
  console.log(`Banco alvo: ${process.env.DB_NAME}`);
  console.log(
    `Filtro: UF=${UF} situação=${SITUACAO} matriz=${SOMENTE_MATRIZ ? 'S' : 'N'} ` +
    `cidades=${MUNICIPIOS.size ? [...MUNICIPIOS].join(',') : 'TODAS'} ` +
    `motivos=${MOTIVOS.size ? [...MOTIVOS].join(',') : 'TODOS'} ` +
    `CNAEs=${CNAES.size ? [...CNAES].join(',') : 'TODOS'} ` +
    `portes=${PORTES.size ? [...PORTES].join(',') : 'TODOS'}`
  );

  const cp = loadCheckpoint();
  if (!RESUME) {
    try { fs.unlinkSync(selectedPath); } catch {}
  } else {
    console.log(`Retomada ativada. Fase atual: ${cp.phase}`);
  }

  const [dbInfo] = await db('SELECT DATABASE() banco, VERSION() versao');
  console.log(`Banco: ${dbInfo[0].banco} | ${dbInfo[0].versao}`);

  const municipiosLookup = await lookup(/munic/i);
  const cnaesLookup = await lookup(/cnae/i);
  const motivosLookup = await lookup(/motivo/i);
  const naturezasLookup = await lookup(/nature/i);
  const qualificacoesLookup = await lookup(/qualific/i);

  // ----------------------------------------------------------
  // MUNICÍPIOS COMPLETOS
  // O arquivo Municipios.zip contém código + nome.
  // Gravamos todos imediatamente; a UF será completada durante
  // a varredura dos Estabelecimentos.
  // ----------------------------------------------------------
  const todosMunicipiosRows = [...municipiosLookup].map(([codigo, nome]) => [
    codigo, nome, null
  ]);

  for (let i = 0; i < todosMunicipiosRows.length; i += BATCH_SIZE) {
    await bulkUpsert(
      'municipios',
      ['codigo','nome','uf'],
      todosMunicipiosRows.slice(i, i + BATCH_SIZE),
      ['nome']
    );
  }

  console.log(`${todosMunicipiosRows.length.toLocaleString('pt-BR')} municípios carregados do arquivo oficial.`);

  // Domínios
  for (const [table, lookupMap, cols] of [
    ['cnaes', cnaesLookup, ['codigo','descricao']],
    ['motivos_situacao', motivosLookup, ['codigo','descricao']],
    ['naturezas_juridicas', naturezasLookup, ['codigo','descricao']],
    ['qualificacoes_socios', qualificacoesLookup, ['codigo','descricao']]
  ]) {
    const rows = [...lookupMap].map(([a,b]) => [table === 'motivos_situacao' ? pad2(a) : a, b]);
    for (let i=0; i<rows.length; i+=BATCH_SIZE) {
      await bulkUpsert(table, cols, rows.slice(i, i+BATCH_SIZE), ['descricao']);
    }
  }

  let importacaoId = cp.importacaoId;
  if (!importacaoId) {
    const [res] = await db(`
      INSERT INTO importacoes_cnpj
      (referencia,filtro_uf,filtro_municipios,filtro_situacao,somente_matriz,status)
      VALUES (?,?,?,?,?,'PROCESSANDO')
    `, [
      new Date().toISOString().slice(0,7),
      UF,
      MUNICIPIOS.size ? [...MUNICIPIOS].join(',') : null,
      SITUACAO,
      SOMENTE_MATRIZ ? 1 : 0
    ]);
    importacaoId = res.insertId;
    cp.importacaoId = importacaoId;
    saveCheckpoint(cp);
  }

  const selected = await loadSelectedJsonl();
  const basicos = new Set([...selected.values()].map(x => x.basico));
  const municipiosUsados = new Map([...selected.values()].map(x => [x.munCod, x.munNome]));

  // Código município -> UF, coletado de TODOS os estabelecimentos lidos.
  // São poucos milhares de municípios, então o custo em memória é mínimo.
  const ufPorMunicipio = new Map();

  // Fase 1 - estabelecimentos
  if (cp.phase === 'estabelecimentos') {
    for (const zip of listZips(/estabele/i)) {
      const name = path.basename(zip);
      if (cp.completedEstab.includes(name)) {
        console.log(`Retomada: pulando ${name}`);
        continue;
      }

      console.log(`Filtrando ${name}`);
      let lidos = 0;
      const newItems = [];

      await eachRecord(zip, async r => {
        lidos++;

        // Aprende a UF do município independentemente do filtro atual.
        const ufRegistro = clean(r[19]);
        const munCodRegistro = clean(r[20]);
        if (ufRegistro && munCodRegistro && !ufPorMunicipio.has(munCodRegistro)) {
          ufPorMunicipio.set(munCodRegistro, ufRegistro);
        }

        if (ufRegistro !== UF) return;
        if (pad2(r[5]) !== SITUACAO) return;
        if (SOMENTE_MATRIZ && clean(r[3]) !== '1') return;

        const munCod = clean(r[20]);
        const munNome = municipiosLookup.get(munCod) || munCod || '';
        if (MUNICIPIOS.size && !MUNICIPIOS.has(normalizar(munNome))) return;

        const motivo = pad2(r[7]);
        if (MOTIVOS.size && !MOTIVOS.has(normalizar(motivo))) return;

        const cnae = clean(r[11]);
        if (CNAES.size && !CNAES.has(normalizar(cnae))) return;

        const basico = clean(r[0]), ordem = clean(r[1]), dv = clean(r[2]);
        const cnpj = `${basico || ''}${ordem || ''}${dv || ''}`;
        const item = {
          cnpj, basico, ordem, dv, munCod, munNome,
          matriz: clean(r[3]), fantasia: clean(r[4]),
          situacao: pad2(r[5]), dataSituacao: date8(r[6]), motivo,
          dataInicio: date8(r[10]), cnae, cnaesSec: clean(r[12]),
          tipoLog: clean(r[13]), logradouro: clean(r[14]), numero: clean(r[15]),
          complemento: clean(r[16]), bairro: clean(r[17]), cep: clean(r[18]),
          uf: clean(r[19]),
          telefone1: [clean(r[21]), clean(r[22])].filter(Boolean).join('') || null,
          telefone2: [clean(r[23]), clean(r[24])].filter(Boolean).join('') || null,
          email: clean(r[27]), situacaoEspecial: clean(r[28]),
          dataSituacaoEspecial: date8(r[29])
        };

        selected.set(cnpj, item);
        basicos.add(basico);
        municipiosUsados.set(munCod, munNome);
        newItems.push(item);

        if (lidos % 500000 === 0) {
          process.stdout.write(
            `\r${lidos.toLocaleString('pt-BR')} lidos | ${selected.size.toLocaleString('pt-BR')} selecionados`
          );
        }
      });

      appendSelected(newItems);
      cp.completedEstab.push(name);
      saveCheckpoint(cp);
      console.log(`\r${lidos.toLocaleString('pt-BR')} lidos | ${selected.size.toLocaleString('pt-BR')} selecionados acumulados`);
    }
    cp.phase = 'empresas';
    saveCheckpoint(cp);
  }

  // Completa a UF de todos os municípios identificados na base de Estabelecimentos.
  if (ufPorMunicipio.size) {
    const ufRows = [...ufPorMunicipio].map(([codigo, uf]) => [
      codigo,
      municipiosLookup.get(codigo) || codigo,
      uf
    ]);

    for (let i = 0; i < ufRows.length; i += BATCH_SIZE) {
      await bulkUpsert(
        'municipios',
        ['codigo','nome','uf'],
        ufRows.slice(i, i + BATCH_SIZE),
        ['nome','uf']
      );
    }

    console.log(`${ufRows.length.toLocaleString('pt-BR')} municípios tiveram a UF identificada/atualizada.`);
  }

  // Municípios usados
  const mrows = [...municipiosUsados].map(([codigo, nome]) => [codigo, nome, UF]);
  for (let i=0; i<mrows.length; i+=BATCH_SIZE) {
    await bulkUpsert('municipios', ['codigo','nome','uf'], mrows.slice(i,i+BATCH_SIZE), ['nome','uf']);
  }
  console.log(`${mrows.length.toLocaleString('pt-BR')} municípios gravados/atualizados no banco.`);

  // Fase 2 - empresas
  const empresasDados = new Map();
  for (const zip of listZips(/empre/i)) {
    const name = path.basename(zip);
    console.log(`Empresas: ${name}`);
    await eachRecord(zip, async r => {
      const basico = clean(r[0]);
      if (!basicos.has(basico)) return;
      const porte = clean(r[5]);
      if (PORTES.size && !PORTES.has(normalizar(porte))) return;
      empresasDados.set(basico, {
        basico,
        razao: clean(r[1]),
        natureza: clean(r[2]),
        qualResp: clean(r[3]),
        capital: decimalBR(r[4]),
        porte,
        ente: clean(r[6])
      });
    });
  }

  const allowedBasicos = new Set(empresasDados.keys());
  const eRows = [...empresasDados.values()].map(e => [
    e.basico,e.razao,e.natureza,e.qualResp,e.capital,e.porte,e.ente,importacaoId
  ]);
  for (let i=0; i<eRows.length; i+=BATCH_SIZE) {
    await bulkUpsert(
      'empresas',
      ['cnpj_basico','razao_social','natureza_juridica_codigo','qualificacao_responsavel_codigo',
       'capital_social','porte','ente_federativo_responsavel','importacao_id'],
      eRows.slice(i,i+BATCH_SIZE),
      ['razao_social','natureza_juridica_codigo','qualificacao_responsavel_codigo',
       'capital_social','porte','ente_federativo_responsavel','importacao_id']
    );
  }

  const empresaId = new Map();
  const allowedList = [...allowedBasicos];
  for (let i=0; i<allowedList.length; i+=500) {
    const block = allowedList.slice(i,i+500);
    const [rows] = await db(
      `SELECT id,cnpj_basico FROM empresas WHERE cnpj_basico IN (${block.map(()=>'?').join(',')})`,
      block
    );
    rows.forEach(r => empresaId.set(r.cnpj_basico, r.id));
  }

  // Estabelecimentos
  const estRows = [...selected.values()]
    .filter(e => empresaId.has(e.basico))
    .map(e => [
      empresaId.get(e.basico),e.cnpj,e.ordem,e.dv,e.matriz,e.fantasia,e.situacao,e.dataSituacao,
      e.motivo,e.dataInicio,e.cnae,e.cnaesSec,e.tipoLog,e.logradouro,e.numero,e.complemento,
      e.bairro,e.cep,e.munCod,e.uf,e.telefone1,e.telefone2,e.email,e.situacaoEspecial,
      e.dataSituacaoEspecial,importacaoId
    ]);

  for (let i=0; i<estRows.length; i+=BATCH_SIZE) {
    await bulkUpsert(
      'estabelecimentos',
      ['empresa_id','cnpj','cnpj_ordem','cnpj_dv','matriz_filial','nome_fantasia',
       'situacao_cadastral','data_situacao','motivo_situacao_codigo','data_inicio_atividade',
       'cnae_principal','cnaes_secundarios','tipo_logradouro','logradouro','numero','complemento',
       'bairro','cep','municipio_codigo','uf','telefone1','telefone2','email','situacao_especial',
       'data_situacao_especial','importacao_id'],
      estRows.slice(i,i+BATCH_SIZE),
      ['empresa_id','nome_fantasia','situacao_cadastral','data_situacao','motivo_situacao_codigo',
       'data_inicio_atividade','cnae_principal','cnaes_secundarios','tipo_logradouro','logradouro',
       'numero','complemento','bairro','cep','municipio_codigo','uf','telefone1','telefone2','email',
       'situacao_especial','data_situacao_especial','importacao_id']
    );
  }

  const cnpjs = [...selected.values()].filter(x => allowedBasicos.has(x.basico)).map(x => x.cnpj);
  const estabIds = [];
  for (let i=0; i<cnpjs.length; i+=500) {
    const block = cnpjs.slice(i,i+500);
    const [rows] = await db(
      `SELECT id FROM estabelecimentos WHERE cnpj IN (${block.map(()=>'?').join(',')})`, block
    );
    estabIds.push(...rows.map(r => r.id));
  }

  for (let i=0; i<estabIds.length; i+=BATCH_SIZE) {
    await bulkUpsert(
      'prospects',
      ['estabelecimento_id','origem','ativo'],
      estabIds.slice(i,i+BATCH_SIZE).map(id => [id,'RECEITA',1]),
      ['origem','ativo']
    );
  }

  // Simples / MEI
  for (const zip of listZips(/simples/i)) {
    console.log(`Simples/MEI: ${path.basename(zip)}`);
    let batch = [];
    await eachRecord(zip, async r => {
      const id = empresaId.get(clean(r[0]));
      if (!id) return;

      const simples = clean(r[1]);
      const mei = clean(r[4]);
      if (FILTRO_SIMPLES && simples !== FILTRO_SIMPLES) return;
      if (FILTRO_MEI && mei !== FILTRO_MEI) return;

      batch.push([id,simples,date8(r[2]),date8(r[3]),mei,date8(r[5]),date8(r[6])]);
      if (batch.length >= BATCH_SIZE) {
        await bulkUpsert(
          'empresa_tributacao',
          ['empresa_id','simples','data_opcao_simples','data_exclusao_simples','mei',
           'data_opcao_mei','data_exclusao_mei'],
          batch,
          ['simples','data_opcao_simples','data_exclusao_simples','mei',
           'data_opcao_mei','data_exclusao_mei']
        );
        batch = [];
      }
    });
    if (batch.length) {
      await bulkUpsert(
        'empresa_tributacao',
        ['empresa_id','simples','data_opcao_simples','data_exclusao_simples','mei',
         'data_opcao_mei','data_exclusao_mei'],
        batch,
        ['simples','data_opcao_simples','data_exclusao_simples','mei',
         'data_opcao_mei','data_exclusao_mei']
      );
    }
  }

  // Sócios: atualização segura apenas das empresas filtradas
  const ids = [...empresaId.values()];
  for (let i=0; i<ids.length; i+=500) {
    const block = ids.slice(i,i+500);
    await db(`DELETE FROM socios WHERE empresa_id IN (${block.map(()=>'?').join(',')})`, block);
  }

  for (const zip of listZips(/socio/i)) {
    console.log(`Sócios: ${path.basename(zip)}`);
    let batch = [];
    await eachRecord(zip, async r => {
      const id = empresaId.get(clean(r[0]));
      if (!id) return;
      batch.push([
        id,clean(r[1]),clean(r[2]),clean(r[3]),clean(r[4]),
        date8(r[5]),clean(r[6]),clean(r[7]),clean(r[8]),clean(r[9]),clean(r[10])
      ]);
      if (batch.length >= BATCH_SIZE) {
        const cols = ['empresa_id','identificador_socio','nome_socio_razao_social','cnpj_cpf_socio',
          'qualificacao_codigo','data_entrada_sociedade','pais_codigo','representante_legal',
          'nome_representante','qualificacao_representante_codigo','faixa_etaria'];
        const one = `(${cols.map(()=>'?').join(',')})`;
        await db(
          `INSERT INTO socios (${cols.map(c=>`\`${c}\``).join(',')})
           VALUES ${batch.map(()=>one).join(',')}`,
          batch.flat()
        );
        batch = [];
      }
    });
    if (batch.length) {
      const cols = ['empresa_id','identificador_socio','nome_socio_razao_social','cnpj_cpf_socio',
        'qualificacao_codigo','data_entrada_sociedade','pais_codigo','representante_legal',
        'nome_representante','qualificacao_representante_codigo','faixa_etaria'];
      const one = `(${cols.map(()=>'?').join(',')})`;
      await db(
        `INSERT INTO socios (${cols.map(c=>`\`${c}\``).join(',')})
         VALUES ${batch.map(()=>one).join(',')}`,
        batch.flat()
      );
    }
  }

  await db(`
    INSERT IGNORE INTO prospect_crm (prospect_id,status_id,prioridade)
    SELECT p.id,1,'NORMAL'
    FROM prospects p
    JOIN estabelecimentos e ON e.id=p.estabelecimento_id
    WHERE e.importacao_id=?
  `,[importacaoId]);

  const [counts] = await db(`
    SELECT
      (SELECT COUNT(*) FROM empresas WHERE importacao_id=?) empresas,
      (SELECT COUNT(*) FROM estabelecimentos WHERE importacao_id=?) estabelecimentos,
      (SELECT COUNT(*) FROM prospects p JOIN estabelecimentos e ON e.id=p.estabelecimento_id
       WHERE e.importacao_id=?) prospects,
      (SELECT COUNT(*) FROM socios s JOIN empresas e ON e.id=s.empresa_id
       WHERE e.importacao_id=?) socios
  `,[importacaoId,importacaoId,importacaoId,importacaoId]);

  await db(`
    UPDATE importacoes_cnpj
    SET encontrados=?, inseridos=?, status='CONCLUIDO', finalizado_em=NOW()
    WHERE id=?
  `,[selected.size,counts[0].estabelecimentos,importacaoId]);

  try { fs.unlinkSync(checkpointPath); } catch {}
  try { fs.unlinkSync(selectedPath); } catch {}

  console.log('IMPORTAÇÃO CONCLUÍDA');
  console.table(counts);
}

main()
  .catch(async error => {
    console.error(`ERRO: ${error.message}`);
    if (error.code) console.error(`Código: ${error.code}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await pool.end(); } catch {}
  });
