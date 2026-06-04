require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const client = await pool.connect();
  console.log('🔧 Running database migration...\n');
  try {
    const sql = fs.readFileSync(
  path.resolve(__dirname, '../../../database/schema.sql'),
  'utf8'
);
    await client.query(sql);
    console.log('✅ Schema applied successfully\n');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
