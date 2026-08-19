import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 6,
  queueLimit: 0,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: 'utf8mb4'
});

export async function dbHealth() {
  try {
    const [rows] = await pool.query(
      'SELECT DATABASE() banco, VERSION() versao, CURRENT_USER() usuario, NOW() agora'
    );
    return { ok: true, ...(rows as any[])[0] };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Banco indisponível' };
  }
}

export async function queryWithRetry(sql: string, params: any[] = [], retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await pool.query(sql, params);
    } catch (error: any) {
      const transient =
        ['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(error?.code) ||
        /closed state|connection.*closed/i.test(error?.message || '');

      if (!transient || attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Falha inesperada de conexão');
}
