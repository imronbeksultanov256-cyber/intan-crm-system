-- ============================================================
-- INTAN DENTAL CLINIC — Migration v2
-- Добавляет: зубная формула, анамнез, план лечения, soft delete
-- БЕЗОПАСНО: только ALTER TABLE и CREATE TABLE (не трогает существующее)
-- ============================================================

-- ── 1. SOFT DELETE для пациентов ──────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS delete_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_deleted    BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_patients_deleted ON patients(is_deleted);

-- ── 2. FIX: doctor_id разрешить NULL для онлайн-записей ───
ALTER TABLE appointments
  ALTER COLUMN doctor_id DROP NOT NULL;

-- ── 3. РАСШИРЕННЫЙ АНАМНЕЗ пациента ───────────────────────
CREATE TABLE IF NOT EXISTS patient_anamnesis (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  -- Жалобы и анамнез
  complaints          TEXT,           -- Жалобы пациента
  life_anamnesis      TEXT,           -- Анамнез жизни
  disease_anamnesis   TEXT,           -- Анамнез заболевания
  -- Медицинская история
  medications         TEXT,           -- Принимаемые препараты
  past_surgeries      TEXT,           -- Перенесённые операции
  contraindications   TEXT,           -- Противопоказания
  -- Контакт для экстренной связи
  emergency_contact_name  VARCHAR(200),
  emergency_contact_phone VARCHAR(30),
  -- Стоматологический анамнез
  last_dental_visit   DATE,
  dental_anxiety      BOOLEAN DEFAULT FALSE,  -- Боязнь стоматолога
  previous_treatments TEXT,                  -- Предыдущее лечение
  -- Мета
  updated_by          UUID REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_anamnesis_patient
  ON patient_anamnesis(patient_id);

-- ── 4. ЗУБНАЯ ФОРМУЛА ─────────────────────────────────────
-- Хранит состояние каждого зуба пациента
-- Зубы: 11-18, 21-28, 31-38, 41-48 (международная нумерация FDI)
CREATE TABLE IF NOT EXISTS dental_chart (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_num   SMALLINT NOT NULL,   -- Номер зуба по FDI (11-48)
  status      VARCHAR(50) NOT NULL DEFAULT 'healthy'
                CHECK (status IN (
                  'healthy',      -- Здоровый
                  'caries',       -- Кариес
                  'filling',      -- Пломба
                  'root_canal',   -- Лечение каналов
                  'crown',        -- Коронка
                  'implant',      -- Имплант
                  'veneer',       -- Винир
                  'removed',      -- Удалён
                  'needs_treatment', -- Требует лечения
                  'bridge',       -- Мост
                  'milk_tooth'    -- Молочный зуб
                )),
  surfaces    TEXT[],         -- Поражённые поверхности: ['M','O','D','B','L']
  notes       TEXT,           -- Заметка по зубу
  color       VARCHAR(7),     -- Hex цвет для отображения
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(patient_id, tooth_num)
);

CREATE INDEX IF NOT EXISTS idx_dental_chart_patient
  ON dental_chart(patient_id);

-- ── 5. ИСТОРИЯ ЛЕЧЕНИЯ КАЖДОГО ЗУБА ───────────────────────
CREATE TABLE IF NOT EXISTS tooth_history (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_num           SMALLINT NOT NULL,
  treatment_record_id UUID REFERENCES treatment_records(id),
  appointment_id      UUID REFERENCES appointments(id),
  doctor_id           UUID REFERENCES doctors(id),
  procedure_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status_before       VARCHAR(50),   -- Статус зуба ДО
  status_after        VARCHAR(50),   -- Статус зуба ПОСЛЕ
  procedure_name      VARCHAR(300),  -- Название процедуры
  materials_used      TEXT,          -- Использованные материалы
  notes               TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tooth_history_patient
  ON tooth_history(patient_id, tooth_num);

-- ── 6. ПЛАН ЛЕЧЕНИЯ ───────────────────────────────────────
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
  tooth_num         SMALLINT,        -- Конкретный зуб (необязательно)
  service_id        UUID REFERENCES services(id),
  service_name      VARCHAR(300),    -- Название процедуры (снапшот)
  price             DECIMAL(10,2),
  priority          SMALLINT DEFAULT 1 CHECK (priority BETWEEN 1 AND 3),
  planned_date      DATE,
  completed_date    DATE,
  status            VARCHAR(30) DEFAULT 'planned'
                      CHECK (status IN ('planned','in_progress','completed','cancelled')),
  notes             TEXT,
  sort_order        INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_plan_items_plan
  ON treatment_plan_items(plan_id);

-- ── 7. ОТПУСКА ВРАЧЕЙ ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctor_vacations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  starts_at   DATE NOT NULL,
  ends_at     DATE NOT NULL,
  reason      VARCHAR(200),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── 8. РАСШИРЕНИЕ таблицы doctors ─────────────────────────
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS cabinet      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS phone        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS rating       DECIMAL(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS patients_count INTEGER DEFAULT 0;

-- ── 9. ОБНОВЛЕНИЕ activity_log — добавляем old/new values ─
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB;

-- ── 10. ИНДЕКСЫ ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patients_is_deleted
  ON patients(is_deleted) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient
  ON treatment_plans(patient_id);

COMMENT ON TABLE dental_chart    IS 'Зубная формула пациента (FDI нумерация)';
COMMENT ON TABLE tooth_history   IS 'История лечения каждого зуба';
COMMENT ON TABLE treatment_plans IS 'Планы лечения пациентов';
COMMENT ON TABLE patient_anamnesis IS 'Расширенный медицинский анамнез';

