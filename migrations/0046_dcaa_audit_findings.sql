CREATE TABLE IF NOT EXISTS dcaa_audit_findings (
  id               SERIAL PRIMARY KEY,
  rule_id          TEXT NOT NULL,
  domain           TEXT NOT NULL,
  severity         TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_id        TEXT NOT NULL,
  description      TEXT NOT NULL,
  evidence         JSONB NOT NULL DEFAULT '{}',
  detected_at      TIMESTAMP NOT NULL DEFAULT now(),
  status           TEXT NOT NULL DEFAULT 'open'
                     CONSTRAINT dcaa_audit_findings_status_check CHECK (status IN ('open', 'acknowledged', 'resolved')),
  resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS dcaa_findings_rule_entity_idx ON dcaa_audit_findings (rule_id, entity_id);
CREATE INDEX IF NOT EXISTS dcaa_findings_status_idx      ON dcaa_audit_findings (status);
CREATE INDEX IF NOT EXISTS dcaa_findings_severity_idx    ON dcaa_audit_findings (severity);
CREATE INDEX IF NOT EXISTS dcaa_findings_domain_idx      ON dcaa_audit_findings (domain);
