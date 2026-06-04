const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'intan_clinic',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '123',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

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
