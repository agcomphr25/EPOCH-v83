-- 0124_chart_of_accounts_foundation.sql
-- Authoritative 5-digit COA foundation, accounting-admin control, journal-line
-- reporting dimensions, and migration-aware period controls.

BEGIN;

ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS parent_account_id INTEGER REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS normal_balance TEXT NOT NULL DEFAULT 'DEBIT',
  ADD COLUMN IF NOT EXISTS financial_statement_section TEXT,
  ADD COLUMN IF NOT EXISTS cost_pool TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS default_allowability TEXT NOT NULL DEFAULT 'ALLOWABLE',
  ADD COLUMN IF NOT EXISTS default_direct_indirect TEXT NOT NULL DEFAULT 'UNASSIGNED',
  ADD COLUMN IF NOT EXISTS billing_treatment TEXT NOT NULL DEFAULT 'NOT_BILLABLE',
  ADD COLUMN IF NOT EXISTS requires_documentation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS system_controlled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS description TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_account_number_unique
  ON chart_of_accounts(account_number)
  WHERE account_number IS NOT NULL;

UPDATE chart_of_accounts
SET account_name = 'Product Revenue'
WHERE account_name = 'Revenue â€” P2 Products'
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_name = 'Product Revenue');

UPDATE chart_of_accounts
SET account_name = 'Accounts Receivable - Other'
WHERE account_name = 'Accounts Receivable â€“ Other'
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_name = 'Accounts Receivable - Other');

CREATE TABLE IF NOT EXISTS accounting_admin_users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by TEXT,
  granted_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO accounting_admin_users (username, active, granted_by)
VALUES ('glennj', TRUE, 'system_seed')
ON CONFLICT (username) DO UPDATE SET active = TRUE;

CREATE TABLE IF NOT EXISTS accounting_periods (
  id SERIAL PRIMARY KEY,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'MIGRATION',
  hard_lock_enforced_at TIMESTAMP,
  closed_by TEXT,
  closed_at TIMESTAMP,
  reopened_by TEXT,
  reopened_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT accounting_periods_status_chk
    CHECK (status IN ('OPEN', 'MIGRATION', 'SOFT_CLOSED', 'HARD_CLOSED', 'FINAL_LOCKED')),
  CONSTRAINT accounting_periods_month_chk CHECK (period_month BETWEEN 1 AND 12),
  CONSTRAINT accounting_periods_year_month_unique UNIQUE (period_year, period_month)
);

INSERT INTO accounting_periods (period_year, period_month, status, notes)
SELECT 2026, m,
       CASE WHEN m < 10 THEN 'MIGRATION' ELSE 'OPEN' END,
       CASE WHEN m < 10
            THEN 'QBO transition migration window. Historical/backdated entries require accounting_admin support notes.'
            ELSE 'Post-transition operating period. Strict close controls can be enabled after cutover.'
       END
FROM generate_series(1, 12) AS m
ON CONFLICT (period_year, period_month) DO NOTHING;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS reference_uuid UUID,
  ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'EPOCH',
  ADD COLUMN IF NOT EXISTS source_document_type TEXT,
  ADD COLUMN IF NOT EXISTS source_document_number TEXT,
  ADD COLUMN IF NOT EXISTS migration_batch_id TEXT,
  ADD COLUMN IF NOT EXISTS posting_mode TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS posted_by TEXT,
  ADD COLUMN IF NOT EXISTS reversal_of_journal_entry_id INTEGER REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS voided_by TEXT,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE INDEX IF NOT EXISTS journal_entries_reference_uuid_idx
  ON journal_entries(reference_uuid);
CREATE INDEX IF NOT EXISTS journal_entries_effective_status_idx
  ON journal_entries(effective_date, status);

ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS customer_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS customer_type TEXT,
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS project_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS contract_number TEXT,
  ADD COLUMN IF NOT EXISTS production_line TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS charge_code_id INTEGER REFERENCES charge_codes(id),
  ADD COLUMN IF NOT EXISTS inventory_item_id TEXT,
  ADD COLUMN IF NOT EXISTS part_number TEXT,
  ADD COLUMN IF NOT EXISTS salesperson_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS salesperson_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS csr_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS csr_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS allowability TEXT NOT NULL DEFAULT 'ALLOWABLE',
  ADD COLUMN IF NOT EXISTS direct_indirect TEXT NOT NULL DEFAULT 'UNASSIGNED',
  ADD COLUMN IF NOT EXISTS cost_pool TEXT,
  ADD COLUMN IF NOT EXISTS dimension_tags JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS journal_lines_customer_idx ON journal_lines(customer_id);
CREATE INDEX IF NOT EXISTS journal_lines_project_idx ON journal_lines(project_id);
CREATE INDEX IF NOT EXISTS journal_lines_production_line_idx ON journal_lines(production_line);
CREATE INDEX IF NOT EXISTS journal_lines_salesperson_idx ON journal_lines(salesperson_user_id);
CREATE INDEX IF NOT EXISTS journal_lines_csr_idx ON journal_lines(csr_user_id);
CREATE INDEX IF NOT EXISTS journal_lines_dimension_tags_idx ON journal_lines USING GIN(dimension_tags);

ALTER TABLE ar_invoice_lines
  ADD COLUMN IF NOT EXISTS production_line TEXT NOT NULL DEFAULT 'MIGRATION_REVIEW',
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS project_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS salesperson_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS salesperson_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS csr_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS csr_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS customer_type TEXT,
  ADD COLUMN IF NOT EXISTS dimension_tags JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS ar_invoice_lines_production_line_idx ON ar_invoice_lines(production_line);
CREATE INDEX IF NOT EXISTS ar_invoice_lines_project_idx ON ar_invoice_lines(project_id);
CREATE INDEX IF NOT EXISTS ar_invoice_lines_dimension_tags_idx ON ar_invoice_lines USING GIN(dimension_tags);

CREATE TEMP TABLE coa_seed (
  account_number TEXT PRIMARY KEY,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  normal_balance TEXT NOT NULL,
  financial_statement_section TEXT NOT NULL,
  cost_pool TEXT NOT NULL,
  default_allowability TEXT NOT NULL,
  default_direct_indirect TEXT NOT NULL,
  billing_treatment TEXT NOT NULL,
  requires_documentation BOOLEAN NOT NULL DEFAULT FALSE,
  requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  system_controlled BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT
) ON COMMIT DROP;

INSERT INTO coa_seed VALUES
  ('10000','Assets','ASSET','DEBIT','Balance Sheet','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,TRUE,'Rollup account'),
  ('10100','Bank Checking','ASSET','DEBIT','Current Assets','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,TRUE,'Primary operating bank account'),
  ('10200','Savings and Reserve Cash','ASSET','DEBIT','Current Assets','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,FALSE,'Cash reserves'),
  ('10300','Undeposited Funds','ASSET','DEBIT','Current Assets','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,FALSE,'Payments received but not deposited'),
  ('11000','Accounts Receivable','ASSET','DEBIT','Current Assets','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,TRUE,'Customer receivables'),
  ('11100','Accounts Receivable - Other','ASSET','DEBIT','Current Assets','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,TRUE,'Legacy/other receivables'),
  ('11200','Retainage Receivable','ASSET','DEBIT','Current Assets','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',TRUE,FALSE,FALSE,'Contract retainage receivable'),
  ('12000','Inventory - Raw Materials','ASSET','DEBIT','Current Assets','DIRECT','ALLOWABLE','DIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Raw material inventory'),
  ('12100','Inventory - Work in Process','ASSET','DEBIT','Current Assets','DIRECT','ALLOWABLE','DIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'WIP inventory'),
  ('12200','Inventory - Finished Goods','ASSET','DEBIT','Current Assets','DIRECT','ALLOWABLE','DIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Finished goods inventory'),
  ('12300','Inventory - Supplies','ASSET','DEBIT','Current Assets','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Shop and production supplies'),
  ('13000','Prepaid Expenses','ASSET','DEBIT','Current Assets','NONE','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Prepaids'),
  ('14000','Deposits and Advances','ASSET','DEBIT','Current Assets','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',TRUE,FALSE,FALSE,'Vendor/customer deposits'),
  ('15000','Fixed Assets','ASSET','DEBIT','Fixed Assets','NONE','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Fixed asset rollup'),
  ('15100','Machinery and Equipment','ASSET','DEBIT','Fixed Assets','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Production equipment'),
  ('15200','Vehicles','ASSET','DEBIT','Fixed Assets','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Vehicles'),
  ('15900','Accumulated Depreciation','ASSET','CREDIT','Fixed Assets','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',FALSE,FALSE,FALSE,'Contra asset'),
  ('20000','Liabilities','LIABILITY','CREDIT','Balance Sheet','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,TRUE,'Rollup account'),
  ('20100','Accounts Payable','LIABILITY','CREDIT','Current Liabilities','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',TRUE,FALSE,FALSE,'Vendor payables'),
  ('20200','Credit Cards Payable','LIABILITY','CREDIT','Current Liabilities','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',TRUE,FALSE,FALSE,'Credit card liability'),
  ('20300','Accrued Payroll','LIABILITY','CREDIT','Current Liabilities','FRINGE','ALLOWABLE','INDIRECT','NOT_BILLABLE',FALSE,FALSE,TRUE,'Payroll accrual'),
  ('20400','Payroll Taxes Payable','LIABILITY','CREDIT','Current Liabilities','FRINGE','ALLOWABLE','INDIRECT','NOT_BILLABLE',FALSE,FALSE,FALSE,'Payroll tax liability'),
  ('20500','Sales Tax Payable','LIABILITY','CREDIT','Current Liabilities','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,TRUE,'Sales tax liability'),
  ('20600','Customer Deposits','LIABILITY','CREDIT','Current Liabilities','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,FALSE,'Customer deposits/deferred revenue'),
  ('21000','Accrued Expenses','LIABILITY','CREDIT','Current Liabilities','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',TRUE,FALSE,FALSE,'Accrued liabilities'),
  ('25000','Notes Payable','LIABILITY','CREDIT','Long-Term Liabilities','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',TRUE,FALSE,FALSE,'Debt'),
  ('30000','Equity','EQUITY','CREDIT','Equity','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,TRUE,'Rollup account'),
  ('30100','Owner Capital','EQUITY','CREDIT','Equity','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,FALSE,'Owner capital'),
  ('30200','Owner Draws','EQUITY','DEBIT','Equity','UNALLOWABLE','UNALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,TRUE,FALSE,'Owner draws/distributions'),
  ('31000','Retained Earnings','EQUITY','CREDIT','Equity','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,FALSE,'Retained earnings'),
  ('39000','Opening Balance Equity','EQUITY','CREDIT','Equity','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',TRUE,TRUE,TRUE,'Controlled migration/opening balance account'),
  ('40000','Revenue','REVENUE','CREDIT','Income Statement','NONE','ALLOWABLE','UNASSIGNED','BILLABLE',FALSE,FALSE,TRUE,'Rollup account'),
  ('41000','Product Revenue','REVENUE','CREDIT','Revenue','DIRECT','ALLOWABLE','DIRECT','BILLABLE',FALSE,FALSE,TRUE,'Product revenue, sliced by dimensions'),
  ('42000','Service Revenue','REVENUE','CREDIT','Revenue','DIRECT','ALLOWABLE','DIRECT','BILLABLE',FALSE,FALSE,FALSE,'Service revenue'),
  ('43000','Shipping Income','REVENUE','CREDIT','Revenue','DIRECT','ALLOWABLE','DIRECT','BILLABLE',FALSE,FALSE,FALSE,'Shipping billed to customers'),
  ('44000','Tooling and Engineering Revenue','REVENUE','CREDIT','Revenue','DIRECT','ALLOWABLE','DIRECT','BILLABLE',FALSE,FALSE,FALSE,'Tooling and engineering billings'),
  ('49000','Discounts and Allowances','REVENUE','DEBIT','Contra Revenue','DIRECT','ALLOWABLE','DIRECT','BILLABLE',FALSE,FALSE,FALSE,'Contra revenue for discounts/allowances'),
  ('50000','Direct Costs and COGS','EXPENSE','DEBIT','Cost of Goods Sold','DIRECT','ALLOWABLE','DIRECT','BILLABLE',TRUE,FALSE,TRUE,'Rollup account'),
  ('51000','Direct Labor Expense','EXPENSE','DEBIT','Cost of Goods Sold','DIRECT','ALLOWABLE','DIRECT','BILLABLE',TRUE,FALSE,TRUE,'Direct labor'),
  ('52000','Direct Materials','EXPENSE','DEBIT','Cost of Goods Sold','DIRECT','ALLOWABLE','DIRECT','BILLABLE',TRUE,FALSE,FALSE,'Direct materials'),
  ('53000','Direct Outside Processing','EXPENSE','DEBIT','Cost of Goods Sold','DIRECT','ALLOWABLE','DIRECT','BILLABLE',TRUE,FALSE,FALSE,'Outside processing tied to jobs'),
  ('54000','Freight-In Direct','EXPENSE','DEBIT','Cost of Goods Sold','DIRECT','ALLOWABLE','DIRECT','BILLABLE',TRUE,FALSE,FALSE,'Inbound freight attributable to direct materials'),
  ('55000','Inventory Adjustments','EXPENSE','DEBIT','Cost of Goods Sold','DIRECT','NEEDS_REVIEW','DIRECT','NOT_BILLABLE',TRUE,TRUE,FALSE,'Cycle count/scrap/inventory valuation adjustments'),
  ('56000','Warranty and Rework Direct','EXPENSE','DEBIT','Cost of Goods Sold','DIRECT','NEEDS_REVIEW','DIRECT','NOT_BILLABLE',TRUE,TRUE,FALSE,'Warranty/rework direct costs'),
  ('60000','Manufacturing Overhead','EXPENSE','DEBIT','Income Statement','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,TRUE,'Rollup account'),
  ('61000','Overhead Labor','EXPENSE','DEBIT','Manufacturing Overhead','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,TRUE,'Indirect shop labor'),
  ('61100','Fringe Benefits Expense','EXPENSE','DEBIT','Manufacturing Overhead','FRINGE','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Fringe benefit costs'),
  ('61200','Payroll Taxes Expense','EXPENSE','DEBIT','Manufacturing Overhead','FRINGE','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Employer payroll taxes'),
  ('62000','Shop Supplies','EXPENSE','DEBIT','Manufacturing Overhead','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Shop supplies'),
  ('63000','Equipment Repairs and Maintenance','EXPENSE','DEBIT','Manufacturing Overhead','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Equipment R&M'),
  ('64000','Utilities - Production','EXPENSE','DEBIT','Manufacturing Overhead','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Production utilities'),
  ('65000','Rent and Facility - Production','EXPENSE','DEBIT','Manufacturing Overhead','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Production facility cost'),
  ('66000','Depreciation - Production','EXPENSE','DEBIT','Manufacturing Overhead','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',FALSE,FALSE,FALSE,'Production depreciation'),
  ('67000','Quality and Inspection Supplies','EXPENSE','DEBIT','Manufacturing Overhead','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'QA/inspection supplies'),
  ('68000','Production Training','EXPENSE','DEBIT','Manufacturing Overhead','OVERHEAD','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Production training'),
  ('70000','G&A Expenses','EXPENSE','DEBIT','Income Statement','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,TRUE,'Rollup account'),
  ('71000','G&A Labor','EXPENSE','DEBIT','G&A','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,TRUE,'Administrative labor'),
  ('72000','Office Supplies','EXPENSE','DEBIT','G&A','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Office supplies'),
  ('73000','Professional Fees','EXPENSE','DEBIT','G&A','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Legal/accounting/professional fees'),
  ('74000','Insurance','EXPENSE','DEBIT','G&A','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Insurance'),
  ('75000','Software and Subscriptions','EXPENSE','DEBIT','G&A','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Software/SaaS'),
  ('76000','Travel - Allowable','EXPENSE','DEBIT','G&A','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,TRUE,FALSE,'Allowable business travel'),
  ('77000','Bank Service Charges','EXPENSE','DEBIT','G&A','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,TRUE,'Bank and merchant fees'),
  ('78000','Postage and Delivery','EXPENSE','DEBIT','G&A','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Postage and delivery'),
  ('79000','Dues and Licenses','EXPENSE','DEBIT','G&A','G_AND_A','NEEDS_REVIEW','INDIRECT','NOT_BILLABLE',TRUE,TRUE,FALSE,'Dues, subscriptions, licenses'),
  ('80000','Other Income and Expense','EXPENSE','DEBIT','Income Statement','OTHER','NEEDS_REVIEW','UNASSIGNED','NOT_BILLABLE',TRUE,TRUE,TRUE,'Rollup account'),
  ('81000','Interest Expense','EXPENSE','DEBIT','Other Expense','G_AND_A','ALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,FALSE,FALSE,'Interest expense'),
  ('82000','Other Income','REVENUE','CREDIT','Other Income','NONE','ALLOWABLE','UNASSIGNED','NOT_BILLABLE',FALSE,FALSE,FALSE,'Other income'),
  ('83000','Gain or Loss on Asset Disposal','EXPENSE','DEBIT','Other Income/Expense','NONE','NEEDS_REVIEW','UNASSIGNED','NOT_BILLABLE',TRUE,TRUE,FALSE,'Asset disposal gain/loss'),
  ('90000','Unallowable and Suspense','EXPENSE','DEBIT','Income Statement','UNALLOWABLE','UNALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,TRUE,TRUE,'Rollup account'),
  ('91000','Unallowable Meals and Entertainment','EXPENSE','DEBIT','Unallowable Costs','UNALLOWABLE','UNALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,TRUE,FALSE,'Unallowable meals/entertainment'),
  ('92000','Unallowable Fines and Penalties','EXPENSE','DEBIT','Unallowable Costs','UNALLOWABLE','UNALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,TRUE,FALSE,'Fines and penalties'),
  ('93000','Unallowable Bad Debt','EXPENSE','DEBIT','Unallowable Costs','UNALLOWABLE','UNALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,TRUE,FALSE,'Bad debt'),
  ('94000','Political and Lobbying Costs','EXPENSE','DEBIT','Unallowable Costs','UNALLOWABLE','UNALLOWABLE','INDIRECT','NOT_BILLABLE',TRUE,TRUE,FALSE,'Political/lobbying costs'),
  ('95000','Suspense - Pending Classification','EXPENSE','DEBIT','Suspense','OTHER','NEEDS_REVIEW','UNASSIGNED','NOT_BILLABLE',TRUE,TRUE,TRUE,'Temporary classification account');

INSERT INTO chart_of_accounts (
  account_number,
  account_name,
  account_type,
  normal_balance,
  financial_statement_section,
  cost_pool,
  default_allowability,
  default_direct_indirect,
  billing_treatment,
  requires_documentation,
  requires_review,
  system_controlled,
  description
)
SELECT
  s.account_number,
  s.account_name,
  s.account_type,
  s.normal_balance,
  s.financial_statement_section,
  s.cost_pool,
  s.default_allowability,
  s.default_direct_indirect,
  s.billing_treatment,
  s.requires_documentation,
  s.requires_review,
  s.system_controlled,
  s.description
FROM coa_seed s
ON CONFLICT (account_name) DO UPDATE SET
  account_number = COALESCE(chart_of_accounts.account_number, EXCLUDED.account_number),
  account_type = EXCLUDED.account_type,
  normal_balance = EXCLUDED.normal_balance,
  financial_statement_section = EXCLUDED.financial_statement_section,
  cost_pool = EXCLUDED.cost_pool,
  default_allowability = EXCLUDED.default_allowability,
  default_direct_indirect = EXCLUDED.default_direct_indirect,
  billing_treatment = EXCLUDED.billing_treatment,
  requires_documentation = EXCLUDED.requires_documentation,
  requires_review = EXCLUDED.requires_review,
  system_controlled = EXCLUDED.system_controlled,
  is_active = TRUE,
  description = COALESCE(chart_of_accounts.description, EXCLUDED.description),
  updated_at = NOW();

-- Normalize older seed names into the 5-digit structure where names differ only by punctuation.
UPDATE chart_of_accounts
SET account_number = '11100',
    financial_statement_section = 'Current Assets',
    normal_balance = 'DEBIT',
    is_active = TRUE
WHERE account_name IN ('Accounts Receivable â€“ Other', 'Accounts Receivable - Other');

COMMIT;
