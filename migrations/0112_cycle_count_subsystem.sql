-- ============================================================================
-- Task #142: Cycle Count Subsystem on EPOCH v8 immutable inventory ledger
--
-- Extends existing cycle_count_sessions / cycle_count_lines tables with:
--   - Blind count flag, count type, scheduled_for, dual-actor tracking
--   - Variance policy linkage, ledger entry linkage
--   - Segregation-of-duties columns (created_by, performed_by, approved_by, posted_by)
--
-- Adds new table cycle_count_variance_policies for tolerance configuration.
-- ============================================================================

-- ── Variance policies ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cycle_count_variance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  qty_tolerance NUMERIC(14,4) NOT NULL DEFAULT 0,
  percent_tolerance NUMERIC(6,3) NOT NULL DEFAULT 0,
  auto_approve_within_tolerance BOOLEAN NOT NULL DEFAULT TRUE,
  requires_dual_approval BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ccvp_default_idx
  ON cycle_count_variance_policies(is_default) WHERE is_default = TRUE;

-- Seed a default policy if none exists
INSERT INTO cycle_count_variance_policies (name, description, qty_tolerance, percent_tolerance, is_default)
SELECT 'Default', 'Default tolerance: 0 units / 0% — all variances require approval', 0, 0, TRUE
WHERE NOT EXISTS (SELECT 1 FROM cycle_count_variance_policies WHERE is_default = TRUE);

-- ── Extend cycle_count_sessions ──────────────────────────────────────────────
ALTER TABLE cycle_count_sessions
  ADD COLUMN IF NOT EXISTS session_number TEXT,
  ADD COLUMN IF NOT EXISTS count_type TEXT NOT NULL DEFAULT 'CYCLE',
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP,
  ADD COLUMN IF NOT EXISTS blind_count BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS variance_policy_id UUID REFERENCES cycle_count_variance_policies(id),
  ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS performed_by_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS performed_by_display_name TEXT,
  ADD COLUMN IF NOT EXISTS performed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS approved_by_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_by_display_name TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS posted_by_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS posted_by_display_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ccs_session_number_idx
  ON cycle_count_sessions(session_number) WHERE session_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS ccs_status_idx ON cycle_count_sessions(status);
CREATE INDEX IF NOT EXISTS ccs_scheduled_idx ON cycle_count_sessions(scheduled_for);

-- ── Extend cycle_count_lines ─────────────────────────────────────────────────
ALTER TABLE cycle_count_lines
  ADD COLUMN IF NOT EXISTS inventory_item_id INTEGER REFERENCES inventory_items(id),
  ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES material_lots(id),
  ADD COLUMN IF NOT EXISTS counted_by_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS counted_by_display_name TEXT,
  ADD COLUMN IF NOT EXISTS counted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS variance_within_tolerance BOOLEAN,
  ADD COLUMN IF NOT EXISTS recount_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS ledger_entry_id UUID REFERENCES inventory_transaction_ledger(id);

CREATE INDEX IF NOT EXISTS ccl_session_idx ON cycle_count_lines(session_id);
CREATE INDEX IF NOT EXISTS ccl_lot_idx ON cycle_count_lines(lot_id);
CREATE INDEX IF NOT EXISTS ccl_ledger_idx ON cycle_count_lines(ledger_entry_id);

-- ── Capability seeds (idempotent) ────────────────────────────────────────────
INSERT INTO perm_capabilities (key, description, category) VALUES
  ('inventory.cycleCount.view',            'View cycle count sessions, lines, and variance history',                  'inventory'),
  ('inventory.cycleCount.create',          'Create and schedule cycle count sessions',                                'inventory'),
  ('inventory.cycleCount.perform',         'Record blind physical counts on cycle count lines',                       'inventory'),
  ('inventory.cycleCount.approve',         'Approve a cycle count session''s variances after review',                  'inventory'),
  ('inventory.cycleCount.postAdjustments', 'Post approved cycle count variances to the immutable inventory ledger',   'inventory')
ON CONFLICT (key) DO NOTHING;

-- Grant all five to ADMIN and OWNER
INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id
FROM perm_roles pr, perm_capabilities pc
WHERE pr.name IN ('ADMIN','OWNER')
  AND pc.key IN (
    'inventory.cycleCount.view',
    'inventory.cycleCount.create',
    'inventory.cycleCount.perform',
    'inventory.cycleCount.approve',
    'inventory.cycleCount.postAdjustments'
  )
ON CONFLICT (role_id, capability_id) DO NOTHING;

-- MANAGER: view + create + approve + post
INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id
FROM perm_roles pr, perm_capabilities pc
WHERE pr.name = 'MANAGER'
  AND pc.key IN (
    'inventory.cycleCount.view',
    'inventory.cycleCount.create',
    'inventory.cycleCount.approve',
    'inventory.cycleCount.postAdjustments'
  )
ON CONFLICT (role_id, capability_id) DO NOTHING;

-- SUPERVISOR: view + perform + approve
INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id
FROM perm_roles pr, perm_capabilities pc
WHERE pr.name = 'SUPERVISOR'
  AND pc.key IN (
    'inventory.cycleCount.view',
    'inventory.cycleCount.perform',
    'inventory.cycleCount.approve'
  )
ON CONFLICT (role_id, capability_id) DO NOTHING;

-- FLOOR_OPERATOR: view + perform
INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id
FROM perm_roles pr, perm_capabilities pc
WHERE pr.name = 'FLOOR_OPERATOR'
  AND pc.key IN (
    'inventory.cycleCount.view',
    'inventory.cycleCount.perform'
  )
ON CONFLICT (role_id, capability_id) DO NOTHING;
