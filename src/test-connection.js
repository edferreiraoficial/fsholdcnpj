import 'dotenv/config';
import mysql from 'mysql2/promise';

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 20000,
};

try {
  const conn = await mysql.createConnection(config);
  const [rows] = await conn.query('SELECT DATABASE() AS banco, VERSION() AS versao, NOW() AS agora');
  console.log('Conexão OK:', rows[0]);
  await conn.end();
} catch (err) {
  console.error('Falha na conexão MySQL:', err.message);
  process.exit(1);
}
