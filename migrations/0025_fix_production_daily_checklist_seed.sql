-- Migration: Fix production daily checklist seed
-- The original seeded template ("darlene") was a test stub with a single
-- meaningless item ("smile"). This migration replaces it with a proper
-- Production Daily Checklist and adds a department-level assignment so all
-- Production department employees see the checklist.
--
-- All DML below is guarded: if checklist_templates(id=1) is absent (e.g. on a
-- schema-only baseline database that has no seed data), every statement
-- silently skips via EXISTS / WHERE conditions and the migration succeeds
-- without error.

-- 1. Fix the template name/description/department
UPDATE checklist_templates
SET
  name        = 'Production Daily Checklist',
  description = 'Daily safety and quality checklist for Production department employees',
  department  = 'Production',
  is_active   = true,
  updated_at  = NOW()
WHERE id = 1
  AND name IN ('darlene', 'Production Daily Checklist');

-- 2. Fix the single stub item ("smile" → meaningful safety item)
UPDATE checklist_template_items
SET
  label      = 'Safety equipment check',
  type       = 'checkbox',
  required   = true,
  frequency  = 'DAILY',
  sort_order = 0
WHERE template_id = 1
  AND label IN ('smile', 'Safety equipment check');

-- 3. Add remaining meaningful DAILY items (skip if already present, or if parent template is absent)
INSERT INTO checklist_template_items (template_id, label, type, required, frequency, sort_order)
SELECT 1, 'Machine calibration verification', 'checkbox', true, 'DAILY', 1
WHERE EXISTS (
  SELECT 1 FROM checklist_templates WHERE id = 1
) AND NOT EXISTS (
  SELECT 1 FROM checklist_template_items
  WHERE template_id = 1 AND label = 'Machine calibration verification'
);

INSERT INTO checklist_template_items (template_id, label, type, required, frequency, sort_order)
SELECT 1, 'Quality control inspection', 'checkbox', true, 'DAILY', 2
WHERE EXISTS (
  SELECT 1 FROM checklist_templates WHERE id = 1
) AND NOT EXISTS (
  SELECT 1 FROM checklist_template_items
  WHERE template_id = 1 AND label = 'Quality control inspection'
);

INSERT INTO checklist_template_items (template_id, label, type, required, frequency, sort_order)
SELECT 1, 'Material inventory check', 'text', false, 'DAILY', 3
WHERE EXISTS (
  SELECT 1 FROM checklist_templates WHERE id = 1
) AND NOT EXISTS (
  SELECT 1 FROM checklist_template_items
  WHERE template_id = 1 AND label = 'Material inventory check'
);

INSERT INTO checklist_template_items (template_id, label, type, options, required, frequency, sort_order)
SELECT 1, 'Work area cleanliness', 'select', '["Excellent","Good","Needs Improvement"]'::jsonb, true, 'DAILY', 4
WHERE EXISTS (
  SELECT 1 FROM checklist_templates WHERE id = 1
) AND NOT EXISTS (
  SELECT 1 FROM checklist_template_items
  WHERE template_id = 1 AND label = 'Work area cleanliness'
);

-- 4. Ensure existing employee-level assignment for glennj (employee_id=15) is active
UPDATE checklist_assignments
SET is_active = true
WHERE template_id = 1
  AND assignment_type = 'employee'
  AND employee_id = 15;

-- 5. Add department-level assignment for Production (idempotent, skipped if parent template is absent)
INSERT INTO checklist_assignments (template_id, assignment_type, department_name, is_active)
SELECT 1, 'department', 'Production', true
WHERE EXISTS (
  SELECT 1 FROM checklist_templates WHERE id = 1
) AND NOT EXISTS (
  SELECT 1 FROM checklist_assignments
  WHERE template_id = 1
    AND assignment_type = 'department'
    AND department_name = 'Production'
);
