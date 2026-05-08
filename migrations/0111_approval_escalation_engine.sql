-- Task #148 — Approval Escalation Engine (Phase 3)
--
-- Generalized cross-domain approval pipeline. Override approvals, NCR
-- dispositions, scrap-over-threshold, quarantine release, and high-severity
-- anomaly approvals all open an `approval_requests` row instead of (or in
-- addition to) their bespoke pending state. A scheduled job advances the
-- request through the configured escalation chain, notifying the new
-- approver at each level, and ultimately rejects the originating operation
-- if the backstop also fails to act.
--
-- Idempotent (IF NOT EXISTS everywhere) so it is safe to re-run.

-- ─────────────────────────────────────────────────────────────────────
-- escalation_policies — per request_type chain definition
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escalation_policies (
  id              serial PRIMARY KEY,
  request_type    text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  description     text,
  -- chain is a JSON array of level descriptors:
  --   [{ "role": "Production Supervisor", "slaSeconds": 14400 },
  --    { "role": "Production Manager",    "slaSeconds": 28800 },
  --    { "role": "Director of Operations","slaSeconds": 86400 },
  --    { "role": "VP Operations",         "slaSeconds": 86400, "isBackstop": true }]
  chain           jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_signature boolean NOT NULL DEFAULT false,
  reason_codes    jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamp NOT NULL DEFAULT NOW(),
  updated_at      timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS escalation_policies_request_type_idx
  ON escalation_policies(request_type);

-- ─────────────────────────────────────────────────────────────────────
-- approval_requests — generalized pending-approval row
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_requests (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type                text NOT NULL,
  request_payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The originating subject (e.g. a vendor PO, NCR id, scrap ticket id) so
  -- callers can look up the approval from the source side.
  subject_type                text,
  subject_id                  text,
  requested_by_user_id        integer,
  requested_by_display_name   text NOT NULL,
  -- Status enum (text for portability):
  --   PENDING | APPROVED | REJECTED | EXPIRED | ESCALATED | CANCELLED
  status                      text NOT NULL DEFAULT 'PENDING',
  -- Approver currently on the hook. Either by role (everyone in the role
  -- inbox sees it) or pinned to one specific user.
  current_approver_role       text,
  current_approver_user_id    integer,
  escalation_level            integer NOT NULL DEFAULT 0,
  -- Wall-clock deadline at which this level expires; the scheduled job
  -- advances any row with current_level_deadline <= NOW() and status = PENDING.
  current_level_deadline      timestamp,
  resolved_at                 timestamp,
  resolved_by_user_id         integer,
  resolved_by_display_name    text,
  resolution_notes            text,
  resolution_signature        text,
  resolution_reason_code      text,
  policy_id                   integer REFERENCES escalation_policies(id),
  created_at                  timestamp NOT NULL DEFAULT NOW(),
  updated_at                  timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT approval_requests_status_chk CHECK (
    status IN ('PENDING','APPROVED','REJECTED','EXPIRED','ESCALATED','CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS approval_requests_status_user_idx
  ON approval_requests(status, current_approver_user_id);
CREATE INDEX IF NOT EXISTS approval_requests_status_role_idx
  ON approval_requests(status, current_approver_role);
CREATE INDEX IF NOT EXISTS approval_requests_status_deadline_idx
  ON approval_requests(status, current_level_deadline);
CREATE INDEX IF NOT EXISTS approval_requests_request_type_idx
  ON approval_requests(request_type);
CREATE INDEX IF NOT EXISTS approval_requests_subject_idx
  ON approval_requests(subject_type, subject_id);

-- ─────────────────────────────────────────────────────────────────────
-- approval_request_history — append-only state-transition log
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_request_history (
  id                  bigserial PRIMARY KEY,
  approval_request_id uuid NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  -- event: OPENED | ESCALATED | APPROVED | REJECTED | EXPIRED | NOTIFIED | CANCELLED
  event               text NOT NULL,
  from_level          integer,
  to_level            integer,
  from_status         text,
  to_status           text,
  actor_user_id       integer,
  actor_display_name  text,
  notes               text,
  metadata            jsonb,
  occurred_at         timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_request_history_request_idx
  ON approval_request_history(approval_request_id, occurred_at);

-- ─────────────────────────────────────────────────────────────────────
-- Seed a few default escalation policies so the engine is usable on
-- day one without admin intervention. Idempotent via ON CONFLICT.
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO escalation_policies (request_type, display_name, description, chain, requires_signature, reason_codes)
VALUES
  ('OVERRIDE_APPROVAL', 'Override Approval',
   'Operator override on a gated material / process action.',
   '[{"role":"Production Supervisor","slaSeconds":14400},{"role":"Production Manager","slaSeconds":28800},{"role":"Director of Operations","slaSeconds":86400},{"role":"VP Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
   true,
   '["URGENT_PRODUCTION","SUPPLY_SHORTAGE","CUSTOMER_HOT","OTHER"]'::jsonb),
  ('NCR_DISPOSITION', 'NCR Disposition',
   'Disposition decision for a Nonconformance Record.',
   '[{"role":"Quality Manager","slaSeconds":14400},{"role":"Director of Operations","slaSeconds":86400},{"role":"VP Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
   true,
   '["USE_AS_IS","REWORK","SCRAP","RTV","OTHER"]'::jsonb),
  ('SCRAP_OVER_THRESHOLD', 'Scrap Over Threshold',
   'Scrap event whose unit cost exceeds the auto-approval threshold.',
   '[{"role":"Production Supervisor","slaSeconds":14400},{"role":"Production Manager","slaSeconds":28800},{"role":"Director of Operations","slaSeconds":86400},{"role":"VP Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
   false,
   '["DEFECT","DAMAGE","SETUP_LOSS","OTHER"]'::jsonb),
  ('QUARANTINE_RELEASE', 'Quarantine Release',
   'Release of quarantined material back into available inventory.',
   '[{"role":"Quality Manager","slaSeconds":14400},{"role":"Director of Operations","slaSeconds":86400},{"role":"VP Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
   true,
   '["RECEIVING_RESOLVED","DISPOSITION_COMPLETE","CONDITIONAL_USE","OTHER"]'::jsonb),
  ('ANOMALY_HIGH_SEVERITY', 'High-Severity Anomaly',
   'High-severity anomaly flagged by automated monitoring; needs human review.',
   '[{"role":"Production Manager","slaSeconds":7200},{"role":"Director of Operations","slaSeconds":28800},{"role":"VP Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
   false,
   '["FALSE_POSITIVE","ACKNOWLEDGED","ACTION_TAKEN","OTHER"]'::jsonb)
ON CONFLICT (request_type) DO NOTHING;
