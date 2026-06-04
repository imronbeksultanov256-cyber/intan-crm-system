-- ============================================================
-- INTAN DENTAL CLINIC — PostgreSQL Database Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ROLES & USERS ──────────────────────────────────────────
CREATE TABLE roles (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(50) UNIQUE NOT NULL,  -- 'chief_doctor', 'doctor', 'admin'
  label     VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO roles (name, label) VALUES
  ('chief_doctor', 'Главный врач'),
  ('doctor',       'Врач'),
  ('admin',        'Администратор');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id       INTEGER NOT NULL REFERENCES roles(id),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  middle_name   VARCHAR(100),
  phone         VARCHAR(30),
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ── DOCTORS ────────────────────────────────────────────────
CREATE TABLE doctors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  specialization  VARCHAR(200) NOT NULL,
  experience_years INTEGER DEFAULT 0,
  education       TEXT,
  bio             TEXT,
  photo_url       VARCHAR(500),
  certificates    TEXT[],
  achievements    TEXT[],
  is_visible      BOOLEAN DEFAULT TRUE,  -- show on public site
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE doctor_schedule (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  is_working  BOOLEAN DEFAULT TRUE
);

-- ── PATIENTS ───────────────────────────────────────────────
CREATE TABLE patients (
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
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_name ON patients(last_name, first_name);

-- ── PATIENT FILES / X-RAYS ─────────────────────────────────
CREATE TABLE patient_files (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  file_name   VARCHAR(255) NOT NULL,
  file_path   VARCHAR(500) NOT NULL,
  file_type   VARCHAR(50),   -- 'xray', 'photo', 'document', 'analysis'
  file_size   INTEGER,
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── SERVICES / PRICE LIST ──────────────────────────────────
CREATE TABLE service_categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0
);

INSERT INTO service_categories (name, slug, sort_order) VALUES
  ('Терапия',             'therapy',       1),
  ('Хирургия',            'surgery',       2),
  ('Имплантация',         'implantation',  3),
  ('Ортодонтия',          'orthodontics',  4),
  ('Детская стоматология','pediatric',     5),
  ('Отбеливание',         'whitening',     6),
  ('Протезирование',      'prosthetics',   7);

CREATE TABLE services (
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
CREATE TABLE appointments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES patients(id),
  doctor_id     UUID NOT NULL REFERENCES doctors(id),
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

CREATE INDEX idx_appointments_dt     ON appointments(appointment_dt);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);

-- ── TREATMENT RECORDS ──────────────────────────────────────
CREATE TABLE treatment_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id UUID REFERENCES appointments(id),
  patient_id    UUID NOT NULL REFERENCES patients(id),
  doctor_id     UUID NOT NULL REFERENCES doctors(id),
  visit_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  diagnosis     TEXT,
  treatment     TEXT,
  prescription  TEXT,
  next_visit    DATE,
  total_cost    DECIMAL(10, 2),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE treatment_services (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  treatment_record_id UUID NOT NULL REFERENCES treatment_records(id) ON DELETE CASCADE,
  service_id          UUID REFERENCES services(id),
  service_name        VARCHAR(300),  -- snapshot name in case service deleted
  price               DECIMAL(10, 2),
  quantity            INTEGER DEFAULT 1,
  discount            DECIMAL(5, 2) DEFAULT 0
);

-- ── PAYMENTS ───────────────────────────────────────────────
CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  treatment_record_id UUID REFERENCES treatment_records(id),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  amount              DECIMAL(10, 2) NOT NULL,
  payment_method      VARCHAR(30) DEFAULT 'cash'
                        CHECK (payment_method IN ('cash','card','transfer')),
  status              VARCHAR(20) DEFAULT 'paid'
                        CHECK (status IN ('paid','pending','refunded')),
  notes               TEXT,
  received_by         UUID REFERENCES users(id),
  paid_at             TIMESTAMP DEFAULT NOW(),
  created_at          TIMESTAMP DEFAULT NOW()
);

-- ── ACTIVITY LOG ───────────────────────────────────────────
CREATE TABLE activity_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   UUID,
  details     JSONB,
  ip_address  INET,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── NOTIFICATIONS ──────────────────────────────────────────
CREATE TABLE notifications (
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

-- ── REMINDERS ──────────────────────────────────────────────
CREATE TABLE reminders (
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

-- ── VIEWS FOR DASHBOARD ────────────────────────────────────
CREATE VIEW v_today_stats AS
SELECT
  (SELECT COUNT(*) FROM appointments
   WHERE appointment_dt::date = CURRENT_DATE) AS today_appointments,
  (SELECT COUNT(*) FROM appointments
   WHERE appointment_dt::date = CURRENT_DATE
   AND status = 'completed') AS today_completed,
  (SELECT COALESCE(SUM(amount),0) FROM payments
   WHERE paid_at::date = CURRENT_DATE) AS today_revenue,
  (SELECT COUNT(*) FROM patients
   WHERE created_at::date = CURRENT_DATE) AS new_patients_today;

CREATE VIEW v_monthly_revenue AS
SELECT
  DATE_TRUNC('day', paid_at) AS day,
  SUM(amount) AS revenue,
  COUNT(*) AS payment_count
FROM payments
WHERE paid_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY 1 ORDER BY 1;
