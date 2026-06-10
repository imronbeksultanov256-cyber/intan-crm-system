-- Migration: Add Inventory (Склад)
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

CREATE INDEX idx_inventory_item_name ON inventory_items(name);
CREATE INDEX idx_inventory_item_category ON inventory_items(category);
