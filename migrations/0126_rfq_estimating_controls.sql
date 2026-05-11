-- RFQ / estimating audit, approval, assumption, and risk-control foundation.

CREATE TABLE IF NOT EXISTS estimate_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES estimating_rfqs(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  superseded_by UUID REFERENCES estimate_versions(id),
  change_summary TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  margin_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT estimate_versions_rfq_version_unique UNIQUE (rfq_id, version_number)
);

CREATE INDEX IF NOT EXISTS estimate_versions_rfq_id_idx
  ON estimate_versions(rfq_id);

CREATE TABLE IF NOT EXISTS estimate_line_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id UUID NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
  rfq_part_id UUID REFERENCES estimating_rfq_parts(id) ON DELETE SET NULL,
  source_table TEXT NOT NULL,
  source_id UUID,
  line_number INTEGER,
  line_category TEXT NOT NULL,
  line_summary TEXT,
  quantity NUMERIC(12,4),
  unit_cost NUMERIC(12,4),
  total_cost NUMERIC(14,4),
  margin_percent NUMERIC(8,4),
  sell_price NUMERIC(14,4),
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estimate_line_versions_version_id_idx
  ON estimate_line_versions(estimate_version_id);

CREATE INDEX IF NOT EXISTS estimate_line_versions_rfq_part_id_idx
  ON estimate_line_versions(rfq_part_id);

CREATE TABLE IF NOT EXISTS estimate_assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES estimating_rfqs(id) ON DELETE CASCADE,
  rfq_part_id UUID REFERENCES estimating_rfq_parts(id) ON DELETE CASCADE,
  assumption_type TEXT NOT NULL CHECK (assumption_type IN ('LABOR', 'SCRAP', 'MATERIAL_YIELD', 'TOOLING_LIFE', 'SETUP_TIME')),
  assumption_text TEXT NOT NULL,
  numeric_value NUMERIC(14,4),
  uom TEXT,
  confidence_level TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (confidence_level IN ('LOW', 'MEDIUM', 'HIGH')),
  source_reference TEXT,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estimate_assumptions_rfq_id_idx
  ON estimate_assumptions(rfq_id);

CREATE INDEX IF NOT EXISTS estimate_assumptions_type_idx
  ON estimate_assumptions(assumption_type);

CREATE TABLE IF NOT EXISTS estimating_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES estimating_rfqs(id) ON DELETE CASCADE,
  estimate_version_id UUID REFERENCES estimate_versions(id) ON DELETE SET NULL,
  approval_role TEXT NOT NULL CHECK (approval_role IN ('ESTIMATOR', 'ENGINEERING', 'FINANCE', 'EXECUTIVE')),
  approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED')),
  approval_threshold NUMERIC(14,2),
  signer_user_id INTEGER,
  signer_display_name TEXT,
  digital_signature TEXT,
  approval_comments TEXT,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  signed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT estimating_approvals_rfq_role_unique UNIQUE (rfq_id, approval_role)
);

CREATE INDEX IF NOT EXISTS estimating_approvals_rfq_id_idx
  ON estimating_approvals(rfq_id);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES estimating_rfqs(id) ON DELETE CASCADE,
  estimate_version_id UUID REFERENCES estimate_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  overall_score INTEGER NOT NULL DEFAULT 0,
  overall_level TEXT NOT NULL DEFAULT 'LOW',
  approval_routing JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_assessments_rfq_id_idx
  ON risk_assessments(rfq_id);

CREATE TABLE IF NOT EXISTS risk_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id UUID NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('TECHNICAL', 'SUPPLY_CHAIN', 'FINANCIAL', 'SCHEDULE', 'COMPLIANCE', 'QUALITY')),
  description TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  probability INTEGER NOT NULL CHECK (probability BETWEEN 1 AND 5),
  score INTEGER NOT NULL,
  owner_user_id INTEGER,
  owner_display_name TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_items_assessment_id_idx
  ON risk_items(risk_assessment_id);

CREATE INDEX IF NOT EXISTS risk_items_category_idx
  ON risk_items(category);

CREATE TABLE IF NOT EXISTS mitigation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_item_id UUID NOT NULL REFERENCES risk_items(id) ON DELETE CASCADE,
  action_description TEXT NOT NULL,
  assigned_to_user_id INTEGER,
  assigned_to_display_name TEXT,
  due_date TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'OPEN',
  completed_at TIMESTAMP,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mitigation_actions_risk_item_id_idx
  ON mitigation_actions(risk_item_id);
