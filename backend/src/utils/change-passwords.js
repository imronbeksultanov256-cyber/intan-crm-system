require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('./src/utils/db');

const newPasswords = [
  { email: 'qq@intan.kg',   password: 'Shmmiya2001' },
  { email: 'doctor@intan.kg',  password: 'IntanDoctor2026!' },
  { email: 'admin@intan.kg',   password: 'IntanAdmin2026!' },
];

async function changePasswords() {
  for (const u of newPasswords) {
    const hash = await bcrypt.hash(u.password, 12);
    await query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [hash, u.email]
    );
    console.log(`✓ Пароль изменён: ${u.email}`);
  }
  console.log('\nГотово!');
  await pool.end();
}

changePasswords().catch(console.error);