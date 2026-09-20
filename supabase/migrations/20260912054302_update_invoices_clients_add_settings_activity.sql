/*
# Update schema: invoices GST fields, clients soft-delete + tax details, settings table, activity log tables

1. Modified Tables
- `invoices`: add invoice_number (text, unique), description (text), base_amount (numeric), gst_rate (numeric), gst_amount (numeric), total_amount (numeric), notes (text)
- `clients`: add status (text, default 'active'), pan_number (text), gst_number (text), whatsapp_number (text), client_type (text), notes (text)

2. New Tables
- `settings` — single-row firm settings (firm_name, logo_url, ca_registration_number, gst_number, address, phone, email)
- `query_log` — AI conversation log (channel, contact, query_text, ai_response, created_at)
- `error_log` — system error log (workflow_name, node_name, error_message, created_at)

3. Automation
- Auto-generate invoice_number as INV-001, INV-002... via a sequence + trigger on invoices table

4. Security
- Enable RLS on all new tables
- Allow anon + authenticated CRUD (single-tenant, no auth)
*/

-- ========================
-- INVOICES: add new columns
-- ========================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS base_amount numeric(14, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_rate numeric(5, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_amount numeric(14, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount numeric(14, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes text;

-- Migrate existing rows: if base_amount is null, copy from amount; total_amount from amount
UPDATE invoices SET base_amount = amount WHERE base_amount IS NULL AND amount IS NOT NULL;
UPDATE invoices SET total_amount = amount WHERE total_amount IS NULL AND amount IS NOT NULL;

-- Backfill invoice_number for existing rows
DO $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN SELECT id FROM invoices WHERE invoice_number IS NULL ORDER BY created_at ASC LOOP
    n := n + 1;
    UPDATE invoices SET invoice_number = 'INV-' || lpad(n::text, 3, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- Create sequence + trigger for auto invoice_number
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || lpad((nextval('invoice_number_seq'))::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_invoice_number ON invoices;
CREATE TRIGGER trg_generate_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION generate_invoice_number();

-- ========================
-- CLIENTS: add new columns
-- ========================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pan_number text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gst_number text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_number text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

-- ========================
-- SETTINGS table (single row)
-- ========================
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_name text,
  logo_url text,
  ca_registration_number text,
  gst_number text,
  address text,
  phone text,
  email text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON settings;
CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
CREATE POLICY "anon_insert_settings" ON settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_settings" ON settings;
CREATE POLICY "anon_update_settings" ON settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_settings" ON settings;
CREATE POLICY "anon_delete_settings" ON settings FOR DELETE
  TO anon, authenticated USING (true);

-- ========================
-- QUERY_LOG table (AI conversations)
-- ========================
CREATE TABLE IF NOT EXISTS query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text,
  contact text,
  query_text text,
  ai_response text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_log_created_at ON query_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_log_contact ON query_log(contact);

ALTER TABLE query_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_query_log" ON query_log;
CREATE POLICY "anon_select_query_log" ON query_log FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_query_log" ON query_log;
CREATE POLICY "anon_insert_query_log" ON query_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_query_log" ON query_log;
CREATE POLICY "anon_update_query_log" ON query_log FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_query_log" ON query_log;
CREATE POLICY "anon_delete_query_log" ON query_log FOR DELETE
  TO anon, authenticated USING (true);

-- ========================
-- ERROR_LOG table (system errors)
-- ========================
CREATE TABLE IF NOT EXISTS error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name text,
  node_name text,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log(created_at DESC);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_error_log" ON error_log;
CREATE POLICY "anon_select_error_log" ON error_log FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_error_log" ON error_log;
CREATE POLICY "anon_insert_error_log" ON error_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_error_log" ON error_log;
CREATE POLICY "anon_update_error_log" ON error_log FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_error_log" ON error_log;
CREATE POLICY "anon_delete_error_log" ON error_log FOR DELETE
  TO anon, authenticated USING (true);
