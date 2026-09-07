-- Finance Operations Stage 0: retain immutable decision evidence for seven years.
-- The existing hash-chained audit_events ledger remains the single evidence store.

INSERT INTO audit_retention_policies (
  event_type,
  min_retention_days,
  description,
  updated_at
)
VALUES
  ('FINANCE_DRAFT_PREPARED', 2555, 'Finance draft preparation evidence and source snapshot', NOW()),
  ('FINANCE_DRAFT_APPROVED', 2555, 'Authenticated finance draft approval evidence', NOW()),
  ('FINANCE_DRAFT_APPROVAL_REVOKED', 2555, 'Approval revocation after source evidence changed', NOW()),
  ('FINANCE_TRANSACTION_POSTED', 2555, 'Finance transaction posting evidence', NOW()),
  ('FINANCE_DOCUMENT_SENT', 2555, 'Customer-facing finance document transmission evidence', NOW()),
  ('FINANCE_EXCEPTION_OVERRIDDEN', 2555, 'Finance exception override and justification evidence', NOW()),
  ('FINANCE_AI_EXPLANATION_RECORDED', 2555, 'AI explanation provenance and minimized-input trace evidence', NOW())
ON CONFLICT (event_type) DO UPDATE
SET min_retention_days = GREATEST(audit_retention_policies.min_retention_days, EXCLUDED.min_retention_days),
    description = EXCLUDED.description,
    updated_at = NOW();
