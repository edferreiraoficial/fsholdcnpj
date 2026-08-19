import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import mysql from 'mysql2/promise';
import yauzl from 'yauzl';
import { parse } from 'csv-parse';

const ZIP_DIR = path.resolve(process.env.CNPJ_ZIP_DIR || './dados');
const BATCH_SIZE = Math.max(100, Number(process.env.BATCH_SIZE || 1000));

const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 0,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: 'utf8mb4',
};

const SPECS = {
  empresas: {
    match: /empre/i,
    table: 'empresas',
    columns: ['cnpj_basico','razao_social','natureza_juridica','qualificacao_responsavel','capital_social','porte_empresa','ente_federativo_responsavel'],
    transform: r => [clean(r[0]), clean(r[1]), clean(r[2]), clean(r[3]), decimalBR(r[4]), clean(r[5]), clean(r[6])],
  },
  estabelecimentos: {
    match: /estabele/i,
    table: 'estabelecimentos',
    columns: ['cnpj_basico','cnpj_ordem','cnpj_dv','identificador_matriz_filial','nome_fantasia','situacao_cadastral','data_situacao_cadastral','motivo_situacao_cadastral','nome_cidade_exterior','pais','data_inicio_atividade','cnae_fiscal_principal','cnae_fiscal_secundaria','tipo_logradouro','logradouro','numero','complemento','bairro','cep','uf','municipio','ddd1','telefone1','ddd2','telefone2','ddd_fax','fax','correio_eletronico','situacao_especial','data_situacao_especial'],
    transform: r => [clean(r[0]),clean(r[1]),clean(r[2]),clean(r[3]),clean(r[4]),pad2(r[5]),date8(r[6]),pad2(r[7]),clean(r[8]),clean(r[9]),date8(r[10]),clean(r[11]),clean(r[12]),clean(r[13]),clean(r[14]),clean(r[15]),clean(r[16]),clean(r[17]),clean(r[18]),clean(r[19]),clean(r[20]),clean(r[21]),clean(r[22]),clean(r[23]),clean(r[24]),clean(r[25]),clean(r[26]),clean(r[27]),clean(r[28]),date8(r[29])],
  },
  socios: {
    match: /socio/i,
    table: 'socios',
    columns: ['cnpj_basico','identificador_socio','nome_socio_razao_social','cnpj_cpf_socio','qualificacao_socio','data_entrada_sociedade','pais','representante_legal','nome_representante','qualificacao_representante_legal','faixa_etaria'],
    transform: r => [clean(r[0]),clean(r[1]),clean(r[2]),clean(r[3]),clean(r[4]),date8(r[5]),clean(r[6]),clean(r[7]),clean(r[8]),clean(r[9]),clean(r[10])],
  },
  simples: {
    match: /simples/i,
    table: 'simples',
    columns: ['cnpj_basico','opcao_simples','data_opcao_simples','data_exclusao_simples','opcao_mei','data_opcao_mei','data_exclusao_mei'],
    transform: r => [clean(r[0]),clean(r[1]),date8(r[2]),date8(r[3]),clean(r[4]),date8(r[5]),date8(r[6])],
  },
  paises: { match: /pais/i, table: 'paises', columns: ['codigo','descricao'], transform: r => [clean(r[0]),clean(r[1])] },
  municipios: { match: /munic/i, table: 'municipios', columns: ['codigo','descricao'], transform: r => [clean(r[0]),clean(r[1])] },
  qualificacoes_socios: { match: /qualific/i, table: 'qualificacoes_socios', columns: ['codigo','descricao'], transform: r => [clean(r[0]),clean(r[1])] },
  naturezas_juridicas: { match: /nature/i, table: 'naturezas_juridicas', columns: ['codigo','descricao'], transform: r => [clean(r[0]),clean(r[1])] },
  cnaes: { match: /cnae/i, table: 'cnaes', columns: ['codigo','descricao'], transform: r => [clean(r[0]),clean(r[1])] },
  motivos: { match: /motivo/i, table: 'motivos', columns: ['codigo','descricao'], transform: r => [pad2(r[0]),clean(r[1])] },
};

function clean(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\r/g, '').trim();
  return s === '' ? null : s;
}
function pad2(v) { const s = clean(v); return s == null ? null : s.padStart(2, '0'); }
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
function detectSpec(filename) {
  const order = ['estabelecimentos','empresas','socios','simples','qualificacoes_socios','naturezas_juridicas','municipios','motivos','cnaes','paises'];
  for (const key of order) if (SPECS[key].match.test(filename.toLowerCase())) return SPECS[key];
  return null;
}
function openZip(zipPath) {
  return new Promise((resolve, reject) => yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zip) => err ? reject(err) : resolve(zip)));
}
function openEntryStream(zip, entry) {
  return new Promise((resolve, reject) => zip.openReadStream(entry, (err, stream) => err ? reject(err) : resolve(stream)));
}
function nextEntry(zip) {
  return new Promise((resolve, reject) => {
    const onEntry = entry => cleanup(resolve, entry);
    const onEnd = () => cleanup(resolve, null);
    const onError = err => cleanup(reject, err);
    function cleanup(done, value) {
      zip.removeListener('entry', onEntry); zip.removeListener('end', onEnd); zip.removeListener('error', onError); done(value);
    }
    zip.once('entry', onEntry); zip.once('end', onEnd); zip.once('error', onError); zip.readEntry();
  });
}
async function insertBatch(conn, spec, rows) {
  if (!rows.length) return;
  const cols = spec.columns.map(c => `\`${c}\``).join(',');
  const rowPlaceholders = `(${spec.columns.map(() => '?').join(',')})`;
  const placeholders = Array(rows.length).fill(rowPlaceholders).join(',');
  let sql = `INSERT INTO \`${spec.table}\` (${cols}) VALUES ${placeholders}`;
  if (spec.table !== 'socios') {
    const updateCols = spec.columns.map(c => `\`${c}\`=VALUES(\`${c}\`)`).join(',');
    sql += ` ON DUPLICATE KEY UPDATE ${updateCols}`;
  }
  await conn.query(sql, rows.flat());
}
async function processCsvStream(conn, stream, spec, label) {
  const parser = stream.pipe(parse({ delimiter: ';', quote: '"', relax_quotes: true, relax_column_count: true, skip_empty_lines: true, bom: true, encoding: 'latin1' }));
  let batch = []; let total = 0; let lastLog = Date.now();
  for await (const record of parser) {
    batch.push(spec.transform(record));
    if (batch.length >= BATCH_SIZE) {
      await insertBatch(conn, spec, batch); total += batch.length; batch = [];
      if (Date.now() - lastLog > 2000) { process.stdout.write(`\r${label}: ${total.toLocaleString('pt-BR')} registros`); lastLog = Date.now(); }
    }
  }
  if (batch.length) { await insertBatch(conn, spec, batch); total += batch.length; }
  console.log(`\r${label}: ${total.toLocaleString('pt-BR')} registros importados`);
}
async function processZip(pool, zipPath) {
  const zipName = path.basename(zipPath);
  const spec = detectSpec(zipName);
  if (!spec) { console.log(`Ignorado: ${zipName}`); return; }
  console.log(`\nAbrindo ${zipName} -> ${spec.table}`);
  const conn = await pool.getConnection();
  try {
    await conn.query(`SET SESSION sql_mode=''`);
    const zip = await openZip(zipPath);
    try {
      while (true) {
        const entry = await nextEntry(zip);
        if (!entry) break;
        if (/\/$/.test(entry.fileName)) continue;
        const stream = await openEntryStream(zip, entry);
        await processCsvStream(conn, stream, spec, `${zipName}/${entry.fileName}`);
      }
    } finally { zip.close(); }
  } finally { conn.release(); }
}
async function truncateForFullImport(pool) {
  const tables = ['socios','simples','estabelecimentos','empresas','motivos','cnaes','municipios','naturezas_juridicas','qualificacoes_socios','paises'];
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of tables) { await conn.query(`TRUNCATE TABLE \`${table}\``); console.log(`Tabela limpa: ${table}`); }
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally { conn.release(); }
}
function sortZipFiles(files) {
  const rank = name => /pais|munic|qualific|nature|cnae|motivo/i.test(name) ? 1 : /empre/i.test(name) ? 2 : /estabele/i.test(name) ? 3 : /simples/i.test(name) ? 4 : /socio/i.test(name) ? 5 : 99;
  return [...files].sort((a,b) => rank(a) - rank(b) || a.localeCompare(b));
}
async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => rl.question(question, resolve)); rl.close(); return answer.trim();
}
async function main() {
  for (const key of ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME']) if (!process.env[key]) throw new Error(`Configure ${key} no .env`);
  if (!fs.existsSync(ZIP_DIR)) throw new Error(`Pasta não encontrada: ${ZIP_DIR}`);
  const pool = mysql.createPool(dbConfig);
  try {
    const [info] = await pool.query('SELECT DATABASE() banco, VERSION() versao');
    console.log(`Banco: ${info[0].banco} | MySQL ${info[0].versao}`);
    const files = sortZipFiles(fs.readdirSync(ZIP_DIR).filter(f => f.toLowerCase().endsWith('.zip')).map(f => path.join(ZIP_DIR, f)));
    if (!files.length) throw new Error('Nenhum ZIP encontrado na pasta.');
    console.log(`ZIPs encontrados: ${files.length}`);
    if (process.argv.includes('--limpar')) {
      const confirm = await ask('ATENÇÃO: --limpar apaga os dados existentes. Digite SIM para continuar: ');
      if (confirm.toUpperCase() !== 'SIM') { console.log('Cancelado.'); return; }
      await truncateForFullImport(pool);
    }
    for (const file of files) await processZip(pool, file);
    const [counts] = await pool.query(`SELECT (SELECT COUNT(*) FROM empresas) empresas, (SELECT COUNT(*) FROM estabelecimentos) estabelecimentos, (SELECT COUNT(*) FROM socios) socios, (SELECT COUNT(*) FROM simples) simples`);
    console.log('\nIMPORTAÇÃO FINALIZADA'); console.table(counts);
  } finally { await pool.end(); }
}
main().catch(err => { console.error('\nERRO:', err.message); if (err.code) console.error('Código:', err.code); process.exit(1); });
