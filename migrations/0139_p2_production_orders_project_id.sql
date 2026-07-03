-- Task #242: Scope PM Production rows to this project's orders only.
--
-- A single P2 PO can be shared by multiple projects. Today the
-- /api/pm-dashboard/:projectId/production endpoint groups every
-- p2_production_order on the linked P2 PO, so a project sees rows
-- spanning the entire PO batch (e.g., FC1000–FC999 (980)) instead of
-- only its own slice. Add a nullable project_id pointer so rows that
-- can be attributed to a single project get scoped down, while rows
-- that genuinely cannot be attributed (PO shared by multiple projects
-- with no per-row signal) remain NULL and fall back to today's
-- PO-wide behavior so the view does not go blank.

ALTER TABLE public.p2_production_orders
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);

CREATE INDEX IF NOT EXISTS p2_production_orders_project_id_idx
  ON public.p2_production_orders(project_id);

-- Backfill: for any P2 PO that is linked to exactly one project (via
-- projects.po_id OR project_steps.linked_p2_order_id), tag every
-- production order on that PO with that project. POs linked to 0 or
-- 2+ projects stay NULL so the dashboard falls back to PO-wide.
WITH project_po AS (
  SELECT DISTINCT po_id, project_id
  FROM (
    SELECT p.po_id, p.id AS project_id
    FROM public.projects p
    WHERE p.po_id IS NOT NULL
    UNION
    SELECT ps.linked_p2_order_id AS po_id, ps.project_id
    FROM public.project_steps ps
    WHERE ps.linked_p2_order_id IS NOT NULL
  ) s
),
po_project_counts AS (
  SELECT po_id,
         COUNT(DISTINCT project_id) AS project_count,
         (array_agg(DISTINCT project_id))[1] AS sole_project_id
  FROM project_po
  GROUP BY po_id
),
attributable AS (
  SELECT po_id, sole_project_id
  FROM po_project_counts
  WHERE project_count = 1
)
UPDATE public.p2_production_orders p2po
SET project_id = a.sole_project_id
FROM attributable a
WHERE p2po.p2_po_id = a.po_id
  AND p2po.project_id IS NULL;
