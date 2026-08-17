-- First-class P2 material deposit invoices and auditable clearing-account settlements.

ALTER TABLE ar_invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deposit_purpose text;

CREATE INDEX IF NOT EXISTS ar_invoices_project_id_idx
  ON ar_invoices (project_id);

CREATE INDEX IF NOT EXISTS ar_invoices_invoice_type_idx
  ON ar_invoices (invoice_type);

CREATE TABLE IF NOT EXISTS p2_deposit_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_invoice_id uuid NOT NULL REFERENCES ar_invoices(id) ON DELETE RESTRICT,
  final_invoice_id uuid NOT NULL REFERENCES ar_invoices(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  journal_entry_id integer REFERENCES journal_entries(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'REVERSED')),
  reason text NOT NULL,
  applied_by text,
  applied_at timestamp NOT NULL DEFAULT now(),
  reversed_by text,
  reversed_at timestamp,
  reversal_reason text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT p2_deposit_applications_distinct_invoices
    CHECK (deposit_invoice_id <> final_invoice_id)
);

CREATE INDEX IF NOT EXISTS p2_deposit_applications_deposit_idx
  ON p2_deposit_applications (deposit_invoice_id, status);

CREATE INDEX IF NOT EXISTS p2_deposit_applications_final_idx
  ON p2_deposit_applications (final_invoice_id, status);

CREATE TABLE IF NOT EXISTS ar_payment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_date date NOT NULL,
  processor text NOT NULL,
  bank_reference text NOT NULL,
  gross_amount numeric(14,2) NOT NULL CHECK (gross_amount > 0),
  fee_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount numeric(14,2) NOT NULL CHECK (net_amount >= 0),
  bank_account_number text NOT NULL DEFAULT '10100',
  fee_account_number text NOT NULL DEFAULT '77000',
  journal_entry_id integer REFERENCES journal_entries(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
  reason text NOT NULL,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  voided_by text,
  voided_at timestamp,
  void_reason text,
  CONSTRAINT ar_payment_settlements_net_check
    CHECK (net_amount = gross_amount - fee_amount)
);

CREATE UNIQUE INDEX IF NOT EXISTS ar_payment_settlements_reference_uniq
  ON ar_payment_settlements (processor, bank_reference)
  WHERE status = 'POSTED';

CREATE TABLE IF NOT EXISTS ar_payment_settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES ar_payment_settlements(id) ON DELETE RESTRICT,
  payment_source text NOT NULL CHECK (payment_source IN ('AR_PAYMENT', 'P1_PAYMENT')),
  payment_id text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ar_payment_settlement_items_payment_idx
  ON ar_payment_settlement_items (payment_source, payment_id);

CREATE INDEX IF NOT EXISTS ar_payment_settlement_items_settlement_idx
  ON ar_payment_settlement_items (settlement_id);
