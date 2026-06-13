-- Migration v7: Advanced Employee Statuses, Treatment Plan Enhancements, and Performance
-- This migration adds support for detailed employee states and audit tracking.

-- 1. EXTEND User Statuses
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='status') THEN
    ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;
END $$;

-- Update existing users based on is_active
UPDATE users SET status = 'active' WHERE is_active = TRUE AND status = 'active';
UPDATE users SET status = 'terminated' WHERE is_active = FALSE AND status = 'active';

-- 2. UPDATE Treatment Plan Statuses
-- We need to change the CHECK constraint for treatment_plans and treatment_plan_items
-- treatment_plans
ALTER TABLE treatment_plans DROP CONSTRAINT IF EXISTS treatment_plans_status_check;
ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_status_check 
  CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled', 'active')); -- keep active for compatibility

-- treatment_plan_items
ALTER TABLE treatment_plan_items DROP CONSTRAINT IF EXISTS treatment_plan_items_status_check;
ALTER TABLE treatment_plan_items ADD CONSTRAINT treatment_plan_items_status_check 
  CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled'));

-- 3. AUDIT LOG Enhancements (ensuring indices)
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user   ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);

-- 4. PERFORMANCE: Missing indices for common JOINS
CREATE INDEX IF NOT EXISTS idx_payments_treatment_record ON payments(treatment_record_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient          ON payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_records_patient  ON treatment_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_records_doctor   ON treatment_records(doctor_id);
CREATE INDEX IF NOT EXISTS idx_treatment_services_record  ON treatment_services(treatment_record_id);

-- 5. FINANCE: Partial payment tracking support (calculated fields)
CREATE OR REPLACE VIEW v_patient_debt_details AS
SELECT 
  p.id as patient_id,
  p.last_name || ' ' || p.first_name as patient_name,
  p.phone,
  COALESCE((SELECT SUM(total_cost) FROM treatment_records tr WHERE tr.patient_id = p.id), 0) as total_accrued,
  COALESCE((SELECT SUM(amount) FROM payments pay WHERE pay.patient_id = p.id AND pay.status = 'paid' AND pay.is_refunded = FALSE), 0) as total_paid,
  (COALESCE((SELECT SUM(total_cost) FROM treatment_records tr WHERE tr.patient_id = p.id), 0) - 
   COALESCE((SELECT SUM(amount) FROM payments pay WHERE pay.patient_id = p.id AND pay.status = 'paid' AND pay.is_refunded = FALSE), 0)) as current_debt,
  (SELECT MAX(paid_at) FROM payments pay WHERE pay.patient_id = p.id AND pay.status = 'paid') as last_payment_date,
  (SELECT MIN(visit_date) FROM treatment_records tr WHERE tr.patient_id = p.id AND tr.total_cost > 0) as first_debt_date
FROM patients p
WHERE p.is_deleted = FALSE;

-- 6. VIEW for Treatment Record Debts
CREATE OR REPLACE VIEW v_treatment_debts AS
SELECT 
  tr.id as treatment_record_id,
  tr.patient_id,
  tr.doctor_id,
  tr.visit_date,
  tr.total_cost,
  COALESCE((SELECT SUM(amount) FROM payments pay WHERE pay.treatment_record_id = tr.id AND pay.status = 'paid' AND pay.is_refunded = FALSE), 0) as paid_amount,
  (tr.total_cost - COALESCE((SELECT SUM(amount) FROM payments pay WHERE pay.treatment_record_id = tr.id AND pay.status = 'paid' AND pay.is_refunded = FALSE), 0)) as balance
FROM treatment_records tr;

-- 7. ENHANCE treatment_services
ALTER TABLE treatment_services ADD COLUMN IF NOT EXISTS tooth_num SMALLINT;
ALTER TABLE treatment_services ADD COLUMN IF NOT EXISTS notes TEXT;


