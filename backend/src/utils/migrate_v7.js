require('dotenv').config();
const { pool } = require('./db');

const SQL = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
`;

async function migrate() {
  const client = await pool.connect();
  console.log('🔧 Применяю migration v7 (сотрудники)...\n');
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    console.log('✅ Migration v7 применена успешно!\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Ошибка миграции:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
