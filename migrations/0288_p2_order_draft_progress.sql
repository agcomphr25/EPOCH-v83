-- Project-scoped, non-production drafts for the resumable P2 order wizard.
-- Drafts are deliberately separate from p2_purchase_orders so incomplete work
-- cannot enter scheduling, BOM, contract review, or production workflows.

CREATE TABLE IF NOT EXISTS p2_order_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  current_step integer NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 3),
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p2_order_drafts_project_unique UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS p2_order_drafts_project_idx
  ON p2_order_drafts (project_id);
