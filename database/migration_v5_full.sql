-- INTAN DENTAL CLINIC — Consolidated Migration v5
-- Includes: Inventory, Advanced Finance, Treatment tracking

-- 1. Inventory / Склад
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

-- 2. Ensure treatment_records has price/cost info if missing
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='treatment_records' AND column_name='total_cost') THEN
    ALTER TABLE treatment_records ADD COLUMN total_cost DECIMAL(12,2) DEFAULT 0;
  END IF;
END $$;

-- 3. Ensure payments table has all needed fields
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='discount') THEN
    ALTER TABLE payments ADD COLUMN discount DECIMAL(12,2) DEFAULT 0;
    ALTER TABLE payments ADD COLUMN is_refunded BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 4. View for Patient Debt
CREATE OR REPLACE VIEW v_patient_debts AS
SELECT 
  p.id as patient_id,
  COALESCE((SELECT SUM(total_cost) FROM treatment_records tr WHERE tr.patient_id = p.id), 0) as total_accrued,
  COALESCE((SELECT SUM(amount) FROM payments pay WHERE pay.patient_id = p.id AND pay.status = 'paid' AND pay.is_refunded = FALSE), 0) as total_paid
FROM patients p;

-- 5. Doctors profile automation: Ensure existing doctors have records
INSERT INTO doctors (user_id, specialization)
SELECT u.id, 'Врач-стоматолог'
FROM users u
WHERE u.role_id = 2
AND NOT EXISTS (SELECT 1 FROM doctors d WHERE d.user_id = u.id);
