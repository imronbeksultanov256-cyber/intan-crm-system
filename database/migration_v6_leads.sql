-- Migration: Create Leads table
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

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at);
