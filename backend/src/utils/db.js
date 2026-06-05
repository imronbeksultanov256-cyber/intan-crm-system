const { Pool } = require('pg');

// Подстраховка для инициализации dotenv
require('dotenv').config();

let poolConfig = {};

// Если в панели управления (или в .env) есть единая строка DATABASE_URL (как на Render)
if (process.env.DATABASE_URL) {
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  };
} else {
  // Иначе собираем по отдельным параметрам (для локального компьютера)
  poolConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'intan_clinic',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '123',
    ssl: false
  };
}

// Добавляем общие лимиты для пула
poolConfig.max = 20;
poolConfig.idleTimeoutMillis = 30000;
poolConfig.connectionTimeoutMillis = 5000;

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development' && duration > 100) {
    console.warn(`Slow query (${duration}ms):`, text.slice(0, 80));
  }
  return res;
};

const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
