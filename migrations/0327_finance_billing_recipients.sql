-- Shared, auditable invoice-recipient configuration for P1 and P2 customers.
-- Forward-only: no legacy customer email fields are changed or removed.

CREATE TABLE IF NOT EXISTS finance_billing_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_scope text NOT NULL,
  p1_customer_id integer REFERENCES customers(id) ON DELETE RESTRICT,
  p2_customer_id integer REFERENCES p2_customers(id) ON DELETE RESTRICT,
  recipient_name text NOT NULL,
  email text NOT NULL,
  delivery_role text NOT NULL DEFAULT 'TO',
  receives_invoices boolean NOT NULL DEFAULT true,
  receives_statements boolean NOT NULL DEFAULT false,
  receives_credit_memos boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  change_reason text NOT NULL,
  created_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  created_by_display_name text NOT NULL,
  updated_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_billing_recipients_scope_check
    CHECK (customer_scope IN ('P1', 'P2')),
  CONSTRAINT finance_billing_recipients_role_check
    CHECK (delivery_role IN ('TO', 'CC')),
  CONSTRAINT finance_billing_recipients_customer_check
    CHECK (
      (customer_scope = 'P1' AND p1_customer_id IS NOT NULL AND p2_customer_id IS NULL)
      OR
      (customer_scope = 'P2' AND p2_customer_id IS NOT NULL AND p1_customer_id IS NULL)
    ),
  CONSTRAINT finance_billing_recipients_effective_dates_check
    CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE INDEX IF NOT EXISTS finance_billing_recipients_p1_idx
  ON finance_billing_recipients(p1_customer_id)
  WHERE p1_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_billing_recipients_p2_idx
  ON finance_billing_recipients(p2_customer_id)
  WHERE p2_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_billing_recipients_active_invoice_idx
  ON finance_billing_recipients(customer_scope, active, receives_invoices);

CREATE UNIQUE INDEX IF NOT EXISTS finance_billing_recipients_unique_address
  ON finance_billing_recipients(
    customer_scope,
    COALESCE(p1_customer_id, 0),
    COALESCE(p2_customer_id, 0),
    lower(email)
  );
