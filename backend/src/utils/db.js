require('dotenv').config();
const { Pool } = require('pg');

let poolConfig;

if (process.env.DATABASE_URL) {
  // Продакшн — Neon
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 10000,
  };
  console.log('[DB] Подключение через DATABASE_URL (Neon)');
} else {
  // Локальная разработка
  poolConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'intan_clinic',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
  console.log('[DB] Подключение локальное');
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});

const query = async (text, params) => {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
};

const getClient = () => pool.connect();

module.exports = { query, getClient, pool };