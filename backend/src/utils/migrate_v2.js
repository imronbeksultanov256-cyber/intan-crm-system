// ============================================================
// migrate_v2.js — запускать из папки backend:
//   node src/utils/migrate_v2.js
// ============================================================
require('dotenv').config();
const { pool } = require('./db');    // db.js находится в той же папке src/utils/

const SQL = `
-- ── 1. SOFT DELETE для пациентов ────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS delete_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_deleted    BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_patients_deleted ON patients(is_deleted);
CREATE INDEX IF NOT EXISTS idx_patients_is_deleted ON patients(is_deleted) WHERE is_deleted = FALSE;

-- ── 2. FIX: doctor_id разрешить NULL для онлайн-записей ─────
ALTER TABLE appointments ALTER COLUMN doctor_id DROP NOT NULL;

-- ── 3. РАСШИРЕННЫЙ АНАМНЕЗ ──────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_anamnesis (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  complaints          TEXT,
  life_anamnesis      TEXT,
  disease_anamnesis   TEXT,
  medications         TEXT,
  past_surgeries      TEXT,
  contraindications   TEXT,
  emergency_contact_name  VARCHAR(200),
  emergency_contact_phone VARCHAR(30),
  last_dental_visit   DATE,
  dental_anxiety      BOOLEAN DEFAULT FALSE,
  previous_treatments TEXT,
  updated_by          UUID REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_anamnesis_patient ON patient_anamnesis(patient_id);

-- ── 4. ЗУБНАЯ ФОРМУЛА ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS dental_chart (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_num   SMALLINT NOT NULL,
  status      VARCHAR(50) NOT NULL DEFAULT 'healthy'
                CHECK (status IN (
                  'healthy','caries','filling','root_canal','crown',
                  'implant','veneer','removed','needs_treatment','bridge','milk_tooth'
                )),
  surfaces    TEXT[],
  notes       TEXT,
  color       VARCHAR(7),
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(patient_id, tooth_num)
);
CREATE INDEX IF NOT EXISTS idx_dental_chart_patient ON dental_chart(patient_id);

-- ── 5. ИСТОРИЯ ЗУБОВ ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tooth_history (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_num           SMALLINT NOT NULL,
  treatment_record_id UUID REFERENCES treatment_records(id),
  appointment_id      UUID REFERENCES appointments(id),
  doctor_id           UUID REFERENCES doctors(id),
  procedure_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status_before       VARCHAR(50),
  status_after        VARCHAR(50),
  procedure_name      VARCHAR(300),
  materials_used      TEXT,
  notes               TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tooth_history_patient ON tooth_history(patient_id, tooth_num);

-- ── 6. ПЛАН ЛЕЧЕНИЯ ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treatment_plans (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   UUID REFERENCES doctors(id),
  title       VARCHAR(300) NOT NULL DEFAULT 'План лечения',
  status      VARCHAR(30) DEFAULT 'active'
                CHECK (status IN ('active','completed','cancelled')),
  notes       TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient ON treatment_plans(patient_id);

CREATE TABLE IF NOT EXISTS treatment_plan_items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id          UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  tooth_num        SMALLINT,
  service_id       UUID REFERENCES services(id),
  service_name     VARCHAR(300),
  price            DECIMAL(10,2),
  priority         SMALLINT DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  planned_date     DATE,
  completed_date   DATE,
  status           VARCHAR(30) DEFAULT 'planned'
                     CHECK (status IN ('planned','in_progress','completed','cancelled')),
  notes            TEXT,
  sort_order       INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON treatment_plan_items(plan_id);

-- ── 7. РАСШИРЕНИЕ DOCTORS ────────────────────────────────────
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS cabinet         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS phone           VARCHAR(30),
  ADD COLUMN IF NOT EXISTS rating          DECIMAL(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS patients_count  INTEGER DEFAULT 0;

-- ── 8. ACTIVITY LOG РАСШИРЕНИЕ ──────────────────────────────
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB;
`;

async function migrate() {
  const client = await pool.connect();
  console.log('🔧 Применяю migration v2...\n');
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    console.log('✅ Migration v2 применена успешно!\n');
    console.log('Созданы таблицы:');
    console.log('  ✓ patient_anamnesis');
    console.log('  ✓ dental_chart');
    console.log('  ✓ tooth_history');
    console.log('  ✓ treatment_plans');
    console.log('  ✓ treatment_plan_items');
    console.log('\nИзменены таблицы:');
    console.log('  ✓ patients (soft delete колонки)');
    console.log('  ✓ doctors  (cabinet, phone, rating)');
    console.log('  ✓ activity_log (old/new values)');
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