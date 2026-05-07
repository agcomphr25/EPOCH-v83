-- 0103_accounting_control_center.sql
-- Shared accounting intake for employee reimbursements, petty cash, and owner-paid expenses.

CREATE TABLE IF NOT EXISTS accounting_expense_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  direction TEXT NOT NULL DEFAULT 'OUT',
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  paid_by_type TEXT NOT NULL,
  paid_by_name TEXT NOT NULL,
  employee_id INTEGER,
  employee_display_name TEXT,
  vendor_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT,
  business_purpose TEXT NOT NULL,
  project_id TEXT,
  project_name TEXT,
  contract_number TEXT,
  cost_objective TEXT,
  direct_indirect TEXT NOT NULL DEFAULT 'DIRECT',
  cost_category TEXT NOT NULL DEFAULT 'MATERIALS',
  reimbursement_required BOOLEAN NOT NULL DEFAULT FALSE,
  payroll_reimbursement BOOLEAN NOT NULL DEFAULT FALSE,
  payroll_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  receipt_status TEXT NOT NULL DEFAULT 'MISSING',
  receipt_url TEXT,
  gl_account_id INTEGER REFERENCES chart_of_accounts(id),
  gl_account_name_snapshot TEXT,
  gl_posting_status TEXT NOT NULL DEFAULT 'PENDING_COA',
  allowability_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  dcaa_review_status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  notes TEXT,
  submitted_by_user_id INTEGER,
  submitted_by_display_name TEXT NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT now(),
  approved_by_user_id INTEGER,
  approved_by_display_name TEXT,
  approved_at TIMESTAMP,
  reviewed_by_user_id INTEGER,
  reviewed_by_display_name TEXT,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT accounting_expense_transactions_type_chk
    CHECK (transaction_type IN ('EMPLOYEE_REIMBURSEMENT', 'PETTY_CASH', 'OWNER_EXPENSE')),
  CONSTRAINT accounting_expense_transactions_direction_chk
    CHECK (direction IN ('IN', 'OUT')),
  CONSTRAINT accounting_expense_transactions_status_chk
    CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'CLOSED')),
  CONSTRAINT accounting_expense_transactions_paid_by_type_chk
    CHECK (paid_by_type IN ('EMPLOYEE', 'OWNER', 'PETTY_CASH', 'COMPANY')),
  CONSTRAINT accounting_expense_transactions_direct_indirect_chk
    CHECK (direct_indirect IN ('DIRECT', 'INDIRECT', 'UNASSIGNED')),
  CONSTRAINT accounting_expense_transactions_payroll_status_chk
    CHECK (payroll_status IN ('NOT_APPLICABLE', 'READY', 'EXPORTED', 'PAID', 'BLOCKED')),
  CONSTRAINT accounting_expense_transactions_receipt_status_chk
    CHECK (receipt_status IN ('MISSING', 'ATTACHED', 'EXCEPTION_APPROVED')),
  CONSTRAINT accounting_expense_transactions_gl_status_chk
    CHECK (gl_posting_status IN ('PENDING_COA', 'READY', 'POSTED', 'HELD')),
  CONSTRAINT accounting_expense_transactions_allowability_chk
    CHECK (allowability_status IN ('PENDING_REVIEW', 'ALLOWABLE', 'UNALLOWABLE', 'NEEDS_REVIEW')),
  CONSTRAINT accounting_expense_transactions_dcaa_status_chk
    CHECK (dcaa_review_status IN ('NEEDS_REVIEW', 'COMPLETE', 'EXCEPTION')),
  CONSTRAINT accounting_expense_transactions_amount_chk
    CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS acct_expense_transactions_type_idx
  ON accounting_expense_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS acct_expense_transactions_date_idx
  ON accounting_expense_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS acct_expense_transactions_status_idx
  ON accounting_expense_transactions(status);
CREATE INDEX IF NOT EXISTS acct_expense_transactions_payroll_status_idx
  ON accounting_expense_transactions(payroll_status);
CREATE INDEX IF NOT EXISTS acct_expense_transactions_gl_status_idx
  ON accounting_expense_transactions(gl_posting_status);
CREATE INDEX IF NOT EXISTS acct_expense_transactions_dcaa_status_idx
  ON accounting_expense_transactions(dcaa_review_status);
