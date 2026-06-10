require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const client = await pool.connect();
  console.log('🔧 Applying migration v2...\n');
  try {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../../database/migration_v2.sql'),
      'utf8'
    );
    await client.query(sql);
    console.log('✅ Migration v2 applied successfully\n');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
