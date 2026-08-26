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
