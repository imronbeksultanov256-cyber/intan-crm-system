require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');

async function seed() {
  console.log('🌱 Seeding database...\n');

  // ── USERS ──────────────────────────────────────────────
  const password = await bcrypt.hash('demo123', 12);

  const users = [
    { role_id: 1, email: 'chief@intan.kg', first_name: 'Айгуль', last_name: 'Маматова', middle_name: 'Эрмековна', phone: '+996 700 111 222' },
    { role_id: 2, email: 'doctor@intan.kg', first_name: 'Бакыт', last_name: 'Асанов', middle_name: 'Турдубекович', phone: '+996 700 333 444' },
    { role_id: 2, email: 'doctor2@intan.kg', first_name: 'Нурзат', last_name: 'Кенжебаева', middle_name: 'Акматовна', phone: '+996 700 555 666' },
    { role_id: 3, email: 'admin@intan.kg', first_name: 'Зарина', last_name: 'Токтосунова', middle_name: 'Алмазовна', phone: '+996 700 777 888' },
  ];

  const userIds = [];
  for (const u of users) {
    const r = await query(
      `INSERT INTO users (role_id, email, password_hash, first_name, last_name, middle_name, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3
       RETURNING id`,
      [u.role_id, u.email, password, u.first_name, u.last_name, u.middle_name, u.phone]
    );
    userIds.push({ ...u, id: r.rows[0].id });
    console.log(`  ✓ User: ${u.email}`);
  }

  // ── DOCTORS ────────────────────────────────────────────
  const doctorUsers = userIds.filter(u => u.role_id === 2);
  const doctorData = [
    {
      specialization: 'Терапевт-стоматолог',
      experience_years: 8,
      education: 'Кыргызская Государственная Медицинская Академия, 2015',
      bio: 'Специализируется на современных методах лечения кариеса и эндодонтии. Работает с системой Pro Taper.',
    },
    {
      specialization: 'Ортодонт',
      experience_years: 5,
      education: 'КГМА, специальность «Ортодонтия», 2018. Стажировка в Алматы.',
      bio: 'Специалист по брекет-системам и элайнерам. Работает с детьми от 7 лет.',
    },
  ];

  for (let i = 0; i < doctorUsers.length; i++) {
    const u = doctorUsers[i];
    const d = doctorData[i];
    const r = await query(
      `INSERT INTO doctors (user_id, specialization, experience_years, education, bio)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO NOTHING RETURNING id`,
      [u.id, d.specialization, d.experience_years, d.education, d.bio]
    );
    if (r.rows[0]) {
      const docId = r.rows[0].id;
      // Add schedule Mon–Fri 09:00–18:00
      for (let day = 1; day <= 5; day++) {
        await query(
          `INSERT INTO doctor_schedule (doctor_id, day_of_week, start_time, end_time)
           VALUES ($1,$2,'09:00','18:00') ON CONFLICT DO NOTHING`,
          [docId, day]
        );
      }
      console.log(`  ✓ Doctor: ${u.last_name} ${u.first_name}`);
    }
  }

  // ── SERVICES ───────────────────────────────────────────
  const services = [
    // Therapy
    { cat: 1, name: 'Консультация стоматолога', price: 500, dur: 30 },
    { cat: 1, name: 'Лечение кариеса (1 поверхность)', price: 2500, dur: 60 },
    { cat: 1, name: 'Лечение кариеса (2 поверхности)', price: 3500, dur: 90 },
    { cat: 1, name: 'Лечение пульпита (1 канал)', price: 4500, dur: 90 },
    { cat: 1, name: 'Лечение пульпита (2 канала)', price: 6000, dur: 120 },
    { cat: 1, name: 'Лечение пульпита (3 канала)', price: 7500, dur: 120 },
    { cat: 1, name: 'Снятие зубных отложений (ультразвук)', price: 3000, dur: 60 },
    // Surgery
    { cat: 2, name: 'Удаление молочного зуба', price: 1200, dur: 30 },
    { cat: 2, name: 'Удаление постоянного зуба (простое)', price: 2500, dur: 45 },
    { cat: 2, name: 'Удаление зуба мудрости (простое)', price: 4000, dur: 60 },
    { cat: 2, name: 'Удаление зуба мудрости (сложное)', price: 7000, dur: 90 },
    // Implantation
    { cat: 3, name: 'Имплант MIS (Израиль)', price: 45000, dur: 120 },
    { cat: 3, name: 'Имплант Osstem (Корея)', price: 38000, dur: 120 },
    { cat: 3, name: 'Формирователь десны', price: 5000, dur: 45 },
    { cat: 3, name: 'Коронка на имплант (металлокерамика)', price: 12000, dur: 60 },
    // Orthodontics
    { cat: 4, name: 'Консультация ортодонта', price: 700, dur: 45 },
    { cat: 4, name: 'Установка металлических брекетов (1 челюсть)', price: 25000, dur: 120 },
    { cat: 4, name: 'Установка керамических брекетов (1 челюсть)', price: 35000, dur: 120 },
    { cat: 4, name: 'Ежемесячная коррекция', price: 1500, dur: 30 },
    // Pediatric
    { cat: 5, name: 'Осмотр ребёнка (до 14 лет)', price: 400, dur: 30 },
    { cat: 5, name: 'Лечение кариеса у детей', price: 2000, dur: 60 },
    { cat: 5, name: 'Герметизация фиссур', price: 1800, dur: 45 },
    // Whitening
    { cat: 6, name: 'Отбеливание Zoom 4', price: 18000, dur: 90 },
    { cat: 6, name: 'Домашнее отбеливание (капы)', price: 8000, dur: 30 },
    // Prosthetics
    { cat: 7, name: 'Металлокерамическая коронка', price: 9000, dur: 60 },
    { cat: 7, name: 'Безметалловая коронка (E.max)', price: 18000, dur: 60 },
    { cat: 7, name: 'Металлический бюгельный протез', price: 25000, dur: 90 },
  ];

  for (const s of services) {
    await query(
      `INSERT INTO services (category_id, name, price, duration_min)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [s.cat, s.name, s.price, s.dur]
    );
  }
  console.log(`  ✓ ${services.length} services added`);

  // ── SAMPLE PATIENTS ────────────────────────────────────
  const adminUser = userIds.find(u => u.role_id === 3);
  const patients = [
    { last_name: 'Исаков', first_name: 'Мирлан', middle_name: 'Бекович', phone: '+996 700 100 001', dob: '1985-03-15', gender: 'male' },
    { last_name: 'Алиева', first_name: 'Гульнара', middle_name: 'Токтосуновна', phone: '+996 700 100 002', dob: '1992-07-22', gender: 'female', allergies: 'Лидокаин — аллергия!' },
    { last_name: 'Омуров', first_name: 'Дастан', middle_name: 'Эрмекович', phone: '+996 700 100 003', dob: '1978-11-05', gender: 'male' },
    { last_name: 'Жумабекова', first_name: 'Айдана', middle_name: 'Нурбековна', phone: '+996 700 100 004', dob: '2001-04-30', gender: 'female' },
    { last_name: 'Кадыров', first_name: 'Тимур', middle_name: 'Алибекович', phone: '+996 700 100 005', dob: '1990-09-18', gender: 'male', chronic_diseases: 'Сахарный диабет 2 типа' },
  ];

  for (const p of patients) {
    await query(
      `INSERT INTO patients (last_name, first_name, middle_name, phone, date_of_birth, gender, allergies, chronic_diseases, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [p.last_name, p.first_name, p.middle_name, p.phone, p.dob, p.gender, p.allergies||null, p.chronic_diseases||null, adminUser?.id||null]
    );
  }
  console.log(`  ✓ ${patients.length} sample patients added`);

  console.log('\n✅ Seed completed!\n');
  console.log('Login credentials (password: demo123):');
  console.log('  chief@intan.kg  — Главный врач');
  console.log('  doctor@intan.kg — Врач');
  console.log('  admin@intan.kg  — Администратор\n');

  await pool.end();
}

seed().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
