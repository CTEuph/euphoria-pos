-- PostgreSQL schema for Supabase cloud database
-- Essential tables for multi-lane POS sync and authoritative data storage

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Products table (master data - authoritative source)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('wine', 'liquor', 'beer', 'other')),
  size VARCHAR(20) NOT NULL CHECK (size IN ('750ml', '1L', '1.5L', '1.75L', 'other')),
  cost DECIMAL(10,2) NOT NULL,
  retail_price DECIMAL(10,2) NOT NULL,
  
  -- For linked products (e.g., single can linked to 4-pack)
  parent_product_id UUID REFERENCES products(id),
  units_in_parent INTEGER DEFAULT 1,
  
  -- Loyalty configuration
  loyalty_point_multiplier DECIMAL(3,1) DEFAULT 1.0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Sync tracking
  version_number INTEGER DEFAULT 1,
  last_modified_by UUID -- Reference to employee who made changes
);

-- Product barcodes (multiple per product)
CREATE TABLE product_barcodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  barcode VARCHAR(50) UNIQUE NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employees (master data - authoritative source)
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_code VARCHAR(20) UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  pin_hash VARCHAR(60) NOT NULL, -- Hashed PIN
  
  is_active BOOLEAN DEFAULT true,
  can_override_price BOOLEAN DEFAULT false,
  can_void_transaction BOOLEAN DEFAULT false,
  is_manager BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Sync tracking
  version_number INTEGER DEFAULT 1
);

-- Inventory levels (per product - real-time sync target)
CREATE TABLE inventory (
  product_id UUID PRIMARY KEY REFERENCES products(id),
  current_stock INTEGER NOT NULL DEFAULT 0,
  reserved_stock INTEGER NOT NULL DEFAULT 0, -- For held orders
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  
  -- Multi-lane sync tracking
  last_synced_from_terminal VARCHAR(20),
  version_number INTEGER DEFAULT 1
);

-- Transactions (uploaded from terminals)
CREATE TABLE transactions (
  id UUID PRIMARY KEY, -- ULID from terminal (preserves chronological ordering)
  transaction_number VARCHAR(20) UNIQUE NOT NULL, -- Human-readable
  terminal_id VARCHAR(20) NOT NULL,
  
  customer_id UUID, -- Will be NULL for most cash transactions
  employee_id UUID REFERENCES employees(id) NOT NULL,
  
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL,
  
  -- Loyalty tracking
  points_earned INTEGER DEFAULT 0,
  points_redeemed INTEGER DEFAULT 0,
  
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'voided', 'refunded')),
  sales_channel VARCHAR(20) NOT NULL DEFAULT 'pos' CHECK (sales_channel IN ('pos', 'doordash', 'grubhub', 'employee')),
  
  -- For returns/exchanges
  original_transaction_id UUID REFERENCES transactions(id),
  
  -- Timestamps (preserve from terminal)
  created_at TIMESTAMPTZ NOT NULL, -- From terminal
  completed_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(), -- When uploaded to cloud
  
  -- Metadata for third-party orders
  metadata JSONB
);

-- Transaction items
CREATE TABLE transaction_items (
  id UUID PRIMARY KEY, -- ULID from terminal
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) DEFAULT 0.00,
  total_price DECIMAL(10,2) NOT NULL,
  
  -- For tracking what discounts were applied
  discount_reason TEXT, -- 'case_discount', 'employee_price', etc.
  
  -- Loyalty points earned on this item
  points_earned INTEGER DEFAULT 0,
  
  is_returned BOOLEAN DEFAULT false,
  returned_at TIMESTAMPTZ
);

-- Sync status tracking (per terminal)
CREATE TABLE terminal_sync_status (
  terminal_id VARCHAR(20) PRIMARY KEY,
  last_transaction_sync TIMESTAMPTZ,
  last_inventory_sync TIMESTAMPTZ,
  last_master_data_sync TIMESTAMPTZ,
  pending_transaction_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'online' CHECK (status IN ('online', 'offline', 'error')),
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT
);

-- Inventory movements (audit trail for cloud)
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) NOT NULL,
  terminal_id VARCHAR(20) NOT NULL,
  
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('sale', 'return', 'adjustment', 'receive')),
  change_amount INTEGER NOT NULL, -- negative for sales, positive for returns/receives
  new_stock_level INTEGER NOT NULL,
  
  -- What caused this change
  transaction_id UUID REFERENCES transactions(id),
  transaction_item_id UUID REFERENCES transaction_items(id),
  employee_id UUID REFERENCES employees(id),
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(is_active) WHERE is_active = true;

CREATE INDEX idx_product_barcodes_barcode ON product_barcodes(barcode);
CREATE INDEX idx_product_barcodes_product ON product_barcodes(product_id);

CREATE INDEX idx_employees_code ON employees(employee_code);
CREATE INDEX idx_employees_active ON employees(is_active) WHERE is_active = true;

CREATE INDEX idx_transactions_terminal ON transactions(terminal_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_employee ON transactions(employee_id);
CREATE INDEX idx_transactions_synced_at ON transactions(synced_at);

CREATE INDEX idx_transaction_items_transaction ON transaction_items(transaction_id);
CREATE INDEX idx_transaction_items_product ON transaction_items(product_id);

CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_created_at ON inventory_movements(created_at);
CREATE INDEX idx_inventory_movements_terminal ON inventory_movements(terminal_id);

-- Triggers for automatic version incrementing
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version_number = OLD.version_number + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_version_trigger
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

CREATE TRIGGER employees_version_trigger
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

CREATE TRIGGER inventory_version_trigger
  BEFORE UPDATE ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

-- Row Level Security (RLS) policies for Supabase
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (can be refined based on authentication strategy)
-- These allow authenticated users to read/write data
-- In production, you'd want more granular terminal-based policies

CREATE POLICY "Allow authenticated read access" ON products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated write access" ON products
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access" ON product_barcodes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated write access" ON product_barcodes
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access" ON employees
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated write access" ON employees
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access" ON inventory
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated write access" ON inventory
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access" ON transactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated write access" ON transactions
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access" ON transaction_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated write access" ON transaction_items
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access" ON terminal_sync_status
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated write access" ON terminal_sync_status
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access" ON inventory_movements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated write access" ON inventory_movements
  FOR ALL TO authenticated USING (true);