-- Migration v8: Registrar Role, Assigned Doctor, and Financial Fixes

-- 1. ADD 'registrar' role
INSERT INTO roles (name, label) 
SELECT 'registrar', 'Регистратура'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'registrar');

-- 2. ADD assigned_doctor_id to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS assigned_doctor_id UUID REFERENCES doctors(id);

-- 3. CREATE patient_doctor_history table
CREATE TABLE IF NOT EXISTS patient_doctor_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id    UUID REFERENCES doctors(id),
  changed_by   UUID REFERENCES users(id),
  changed_at   TIMESTAMP DEFAULT NOW(),
  reason       TEXT
);

-- 4. FIX Finance views (ensure is_refunded is handled correctly)
-- We ensure the view matches the current schema and requirements
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

-- 5. Add index for assigned_doctor_id
CREATE INDEX IF NOT EXISTS idx_patients_assigned_doctor ON patients(assigned_doctor_id);
