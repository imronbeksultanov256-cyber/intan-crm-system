-- ============================================================
-- INTAN DENTAL CLINIC — PostgreSQL Database Schema (v8 consolidated)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ROLES & USERS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(50) UNIQUE NOT NULL,
  label     VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO roles (name, label) 
VALUES
  ('chief_doctor', 'Главный врач'),
  ('doctor',       'Врач'),
  ('admin',        'Администратор'),
  ('registrar',    'Регистратура')
ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id       INTEGER NOT NULL REFERENCES roles(id),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  middle_name   VARCHAR(100),
  phone         VARCHAR(30),
  is_active     BOOLEAN DEFAULT TRUE,
  status        VARCHAR(50) DEFAULT 'active',
  last_login    TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  deleted_at    TIMESTAMP,
  deleted_by    UUID REFERENCES users(id)
);

-- ── DOCTORS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  specialization  VARCHAR(200) NOT NULL,
  experience_years INTEGER DEFAULT 0,
  education       TEXT,
  bio             TEXT,
  photo_url       VARCHAR(500),
  certificates    TEXT[],
  achievements    TEXT[],
  cabinet         VARCHAR(50),
  phone           VARCHAR(30),
  rating          DECIMAL(3,2) DEFAULT 0,
  patients_count  INTEGER DEFAULT 0,
  is_visible      BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor_schedule (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  is_working  BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS doctor_vacations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  starts_at   DATE NOT NULL,
  ends_at     DATE NOT NULL,
  reason      VARCHAR(200),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── PATIENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100) NOT NULL,
  middle_name      VARCHAR(100),
  date_of_birth    DATE,
  phone            VARCHAR(30) NOT NULL,
  email            VARCHAR(255),
  address          TEXT,
  gender           VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
  allergies        TEXT,
  chronic_diseases TEXT,
  notes            TEXT,
  assigned_doctor_id UUID REFERENCES doctors(id),
  is_deleted       BOOLEAN DEFAULT FALSE,
  deleted_at       TIMESTAMP,
  deleted_by       UUID REFERENCES users(id),
  delete_reason    TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_patients_deleted ON patients(is_deleted);
CREATE INDEX IF NOT EXISTS idx_patients_assigned_doctor ON patients(assigned_doctor_id);

CREATE TABLE IF NOT EXISTS patient_doctor_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id    UUID REFERENCES doctors(id),
  changed_by   UUID REFERENCES users(id),
  changed_at   TIMESTAMP DEFAULT NOW(),
  reason       TEXT
);

-- ── PATIENT ANAMNESIS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_anamnesis (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE UNIQUE,
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

-- ── DENTAL CHART ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dental_chart (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_num   SMALLINT NOT NULL,
  status      VARCHAR(50) NOT NULL DEFAULT 'healthy',
  surfaces    TEXT[],
  notes       TEXT,
  color       VARCHAR(7),
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(patient_id, tooth_num)
);

-- ── SERVICES / PRICE LIST ──────────────────────────────────
CREATE TABLE IF NOT EXISTS service_categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0
);

INSERT INTO service_categories (name, slug, sort_order) 
VALUES
  ('Терапия',             'therapy',       1),
  ('Хирургия',            'surgery',       2),
  ('Имплантация',         'implantation',  3),
  ('Ортодонтия',          'orthodontics',  4),
  ('Детская стоматология','pediatric',     5),
  ('Отбеливание',         'whitening',     6),
  ('Протезирование',      'prosthetics',   7)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS services (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id INTEGER NOT NULL REFERENCES service_categories(id),
  name        VARCHAR(300) NOT NULL,
  description TEXT,
  price       DECIMAL(10, 2) NOT NULL,
  duration_min INTEGER DEFAULT 60,
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,
  updated_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ── APPOINTMENTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES patients(id),
  doctor_id     UUID REFERENCES doctors(id),
  service_id    UUID REFERENCES services(id),
  appointment_dt TIMESTAMP NOT NULL,
  duration_min  INTEGER DEFAULT 60,
  status        VARCHAR(30) DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','no_show')),
  comment       TEXT,
  source        VARCHAR(30) DEFAULT 'admin'
                  CHECK (source IN ('online','admin','phone')),
  created_by    UUID REFERENCES users(id),
  confirmed_by  UUID REFERENCES users(id),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_dt     ON appointments(appointment_dt);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);

-- ── TREATMENT RECORDS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS treatment_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id UUID REFERENCES appointments(id),
  patient_id    UUID NOT NULL REFERENCES patients(id),
  doctor_id     UUID NOT NULL REFERENCES doctors(id),
  visit_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  diagnosis     TEXT,
  treatment     TEXT,
  prescription  TEXT,
  next_visit    DATE,
  total_cost    DECIMAL(10, 2) DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS treatment_services (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  treatment_record_id UUID NOT NULL REFERENCES treatment_records(id) ON DELETE CASCADE,
  service_id          UUID REFERENCES services(id),
  service_name        VARCHAR(300),
  price               DECIMAL(10, 2),
  quantity            INTEGER DEFAULT 1,
  discount            DECIMAL(5, 2) DEFAULT 0,
  tooth_num           SMALLINT,
  notes               TEXT
);

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

-- ── PAYMENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  treatment_record_id UUID REFERENCES treatment_records(id),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  amount              DECIMAL(10, 2) NOT NULL,
  payment_method      VARCHAR(30) DEFAULT 'cash'
                        CHECK (payment_method IN ('cash','card','transfer')),
  status              VARCHAR(20) DEFAULT 'paid'
                        CHECK (status IN ('paid','pending','refunded')),
  discount            DECIMAL(12, 2) DEFAULT 0,
  is_refunded         BOOLEAN DEFAULT FALSE,
  notes               TEXT,
  received_by         UUID REFERENCES users(id),
  paid_at             TIMESTAMP DEFAULT NOW(),
  created_at          TIMESTAMP DEFAULT NOW()
);

-- ── LEADS / ЗАЯВКИ ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  phone       VARCHAR(30) NOT NULL,
  email       VARCHAR(255),
  service_id  UUID REFERENCES services(id),
  doctor_id   UUID REFERENCES doctors(id),
  preferred_dt TIMESTAMP,
  comment     TEXT,
  status      VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new', 'processed', 'cancelled')),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- ── INVENTORY / СКЛАД ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  unit VARCHAR(20) DEFAULT 'шт',
  quantity DECIMAL(12,2) DEFAULT 0,
  min_quantity DECIMAL(12,2) DEFAULT 0,
  price_per_unit DECIMAL(12,2) DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES inventory_items(id),
  type VARCHAR(10) CHECK (type IN ('in', 'out')),
  quantity DECIMAL(12,2) NOT NULL,
  reason VARCHAR(255),
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── ACTIVITY LOG ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   UUID,
  details     JSONB,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  INET,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── NOTIFICATIONS & REMINDERS ──────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  title       VARCHAR(255),
  message     TEXT,
  type        VARCHAR(30) DEFAULT 'info'
                CHECK (type IN ('info','success','warning','error')),
  is_read     BOOLEAN DEFAULT FALSE,
  related_id  UUID,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id  UUID NOT NULL REFERENCES patients(id),
  created_by  UUID REFERENCES users(id),
  remind_at   TIMESTAMP NOT NULL,
  message     TEXT NOT NULL,
  channel     VARCHAR(20) DEFAULT 'system'
                CHECK (channel IN ('system','sms','whatsapp','telegram')),
  is_sent     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── TREATMENT PLANS ───────────────────────────────────────
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

CREATE TABLE IF NOT EXISTS treatment_plan_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id           UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  tooth_num         SMALLINT,
  service_id        UUID REFERENCES services(id),
  service_name      VARCHAR(300),
  price             DECIMAL(10,2),
  priority          SMALLINT DEFAULT 1 CHECK (priority BETWEEN 1 AND 3),
  planned_date      DATE,
  completed_date    DATE,
  status            VARCHAR(30) DEFAULT 'planned'
                      CHECK (status IN ('planned','in_progress','completed','cancelled')),
  notes             TEXT,
  sort_order        INTEGER DEFAULT 0
);

-- ── VIEWS ──────────────────────────────────────────────────
DROP VIEW IF EXISTS v_today_stats CASCADE;
CREATE OR REPLACE VIEW v_today_stats AS
SELECT
  (SELECT COUNT(*) FROM appointments
   WHERE appointment_dt::date = CURRENT_DATE) AS today_appointments,
  (SELECT COUNT(*) FROM appointments
   WHERE appointment_dt::date = CURRENT_DATE
   AND status = 'completed') AS today_completed,
  (SELECT COALESCE(SUM(amount),0) FROM payments
   WHERE paid_at::date = CURRENT_DATE AND status = 'paid' AND is_refunded = FALSE) AS today_revenue,
  (SELECT COUNT(*) FROM patients
   WHERE created_at::date = CURRENT_DATE) AS new_patients_today;

DROP VIEW IF EXISTS v_patient_debt_details CASCADE;
CREATE OR REPLACE VIEW v_patient_debt_details AS
SELECT 
  p.id as patient_id,
  p.last_name || ' ' || p.first_name as patient_name,
  p.phone,
  p.assigned_doctor_id,
  COALESCE(u.last_name || ' ' || u.first_name, '—') as assigned_doctor_name,
  COALESCE((SELECT SUM(total_cost) FROM treatment_records tr WHERE tr.patient_id = p.id), 0) as total_accrued,
  COALESCE((SELECT SUM(amount) FROM payments pay WHERE pay.patient_id = p.id AND pay.status = 'paid' AND pay.is_refunded = FALSE), 0) as total_paid,
  (COALESCE((SELECT SUM(total_cost) FROM treatment_records tr WHERE tr.patient_id = p.id), 0) - 
   COALESCE((SELECT SUM(amount) FROM payments pay WHERE pay.patient_id = p.id AND pay.status = 'paid' AND pay.is_refunded = FALSE), 0)) as current_debt,
  (SELECT MAX(paid_at) FROM payments pay WHERE pay.patient_id = p.id AND pay.status = 'paid') as last_payment_date
FROM patients p
LEFT JOIN doctors d ON d.id = p.assigned_doctor_id
LEFT JOIN users u ON u.id = d.user_id
WHERE p.is_deleted = FALSE;

DROP VIEW IF EXISTS v_treatment_debts CASCADE;
CREATE OR REPLACE VIEW v_treatment_debts AS
SELECT 
  tr.id as treatment_record_id,
  tr.total_cost,
  COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid' AND p.is_refunded = FALSE), 0) as paid_amount,
  tr.total_cost - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid' AND p.is_refunded = FALSE), 0) as balance
FROM treatment_records tr
LEFT JOIN payments p ON p.treatment_record_id = tr.id
GROUP BY tr.id;
