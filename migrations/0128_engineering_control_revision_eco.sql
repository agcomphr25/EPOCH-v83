-- Section 5 Engineering Control: reusable revision, effectivity, and ECO framework.

DO $$ BEGIN
  CREATE TYPE engineering_controlled_artifact_type AS ENUM (
    'BOM',
    'ROUTING',
    'TRAVELER_TEMPLATE',
    'WORK_INSTRUCTION',
    'SPEC',
    'QC_FORM'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE engineering_release_state AS ENUM (
    'draft',
    'review',
    'approved',
    'released',
    'obsolete'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE engineering_eco_status AS ENUM (
    'draft',
    'impact_review',
    'approval',
    'approved',
    'rejected',
    'implemented',
    'released',
    'closed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS engineering_controlled_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type engineering_controlled_artifact_type NOT NULL,
  artifact_id TEXT NOT NULL,
  artifact_number TEXT,
  title TEXT NOT NULL,
  revision TEXT NOT NULL,
  release_state engineering_release_state NOT NULL DEFAULT 'draft',
  description TEXT,
  source_module TEXT,
  source_version_id TEXT,
  change_summary TEXT,
  effectivity_serial_start TEXT,
  effectivity_serial_end TEXT,
  effectivity_start_date DATE,
  effectivity_end_date DATE,
  effectivity_customer_id TEXT,
  effectivity_customer_name TEXT,
  effectivity_project_id UUID,
  effectivity_project_number TEXT,
  created_by TEXT NOT NULL DEFAULT 'system',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  released_by TEXT,
  released_at TIMESTAMPTZ,
  obsolete_by TEXT,
  obsolete_at TIMESTAMPTZ,
  release_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT ecr_artifact_revision_unique UNIQUE (artifact_type, artifact_id, revision)
);

CREATE INDEX IF NOT EXISTS ecr_artifact_idx
  ON engineering_controlled_revisions (artifact_type, artifact_id);
CREATE INDEX IF NOT EXISTS ecr_release_state_idx
  ON engineering_controlled_revisions (release_state);
CREATE INDEX IF NOT EXISTS ecr_effectivity_date_idx
  ON engineering_controlled_revisions (effectivity_start_date, effectivity_end_date);
CREATE INDEX IF NOT EXISTS ecr_effectivity_customer_idx
  ON engineering_controlled_revisions (effectivity_customer_id);
CREATE INDEX IF NOT EXISTS ecr_effectivity_project_idx
  ON engineering_controlled_revisions (effectivity_project_id);

CREATE TABLE IF NOT EXISTS engineering_change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eco_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  change_description TEXT NOT NULL,
  status engineering_eco_status NOT NULL DEFAULT 'draft',
  requested_by TEXT NOT NULL DEFAULT 'system',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  impact_review JSONB NOT NULL DEFAULT '{}'::jsonb,
  impact_reviewed_by TEXT,
  impact_reviewed_at TIMESTAMPTZ,
  approval_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  implementation_date DATE,
  implemented_by TEXT,
  implemented_at TIMESTAMPTZ,
  release_linkage JSONB NOT NULL DEFAULT '{}'::jsonb,
  released_by TEXT,
  released_at TIMESTAMPTZ,
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eco_status_idx
  ON engineering_change_orders (status);
CREATE INDEX IF NOT EXISTS eco_implementation_date_idx
  ON engineering_change_orders (implementation_date);

CREATE TABLE IF NOT EXISTS engineering_eco_revision_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eco_id UUID NOT NULL REFERENCES engineering_change_orders(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES engineering_controlled_revisions(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'release',
  notes TEXT,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT eco_revision_links_unique UNIQUE (eco_id, revision_id, link_type)
);

CREATE INDEX IF NOT EXISTS eco_revision_links_eco_idx
  ON engineering_eco_revision_links (eco_id);
CREATE INDEX IF NOT EXISTS eco_revision_links_revision_idx
  ON engineering_eco_revision_links (revision_id);
