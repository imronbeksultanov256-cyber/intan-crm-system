-- Migration: Add assigned_doctor_id to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS assigned_doctor_id UUID REFERENCES doctors(id);
CREATE INDEX IF NOT EXISTS idx_patients_assigned_doctor ON patients(assigned_doctor_id);
