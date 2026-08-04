-- Phase 1 guided EPOCH validation workflow.
-- Additive only: existing packages and intended-use revisions are not rewritten.

CREATE TABLE IF NOT EXISTS qms_epoch_validation_intended_use_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  intended_use_revision_id uuid NOT NULL REFERENCES qms_epoch_validation_intended_use_revisions(id) ON DELETE RESTRICT,
  function_key text NOT NULL,
  usage_status text NOT NULL CHECK (usage_status IN ('USED_FOR_QMS','NOT_USED_FOR_QMS')),
  use_description text,
  failure_effect text,
  critical_to_qms boolean NOT NULL DEFAULT false,
  not_used_explanation text,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qms_esv_intended_function_complete CHECK (
    (usage_status='USED_FOR_QMS' AND nullif(trim(use_description),'') IS NOT NULL AND nullif(trim(failure_effect),'') IS NOT NULL)
    OR
    (usage_status='NOT_USED_FOR_QMS' AND nullif(trim(not_used_explanation),'') IS NOT NULL)
  ),
  CONSTRAINT qms_esv_intended_function_revision_unique UNIQUE(intended_use_revision_id,function_key)
);

CREATE INDEX IF NOT EXISTS qms_esv_intended_function_package_idx
  ON qms_epoch_validation_intended_use_functions(package_id,intended_use_revision_id);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_responsibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  responsibility_role text NOT NULL CHECK (responsibility_role IN
    ('SOFTWARE_OWNER','QUALITY_REVIEWER','VALIDATION_COORDINATOR','ADDITIONAL_TESTER','FINAL_APPROVING_AUTHORITY')),
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  assignment_status text NOT NULL DEFAULT 'AWAITING_ACCEPTANCE' CHECK (assignment_status IN
    ('AWAITING_ACCEPTANCE','ACCEPTED','DECLINED','SUPERSEDED')),
  assigned_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by_display_name text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  accepted_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  accepted_by_display_name text,
  accepted_at timestamptz,
  superseded_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT qms_esv_responsibility_acceptance_consistent CHECK (
    (assignment_status='ACCEPTED' AND accepted_by_user_id IS NOT NULL AND accepted_at IS NOT NULL)
    OR assignment_status<>'ACCEPTED'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS qms_esv_responsibility_active_employee_unique
  ON qms_epoch_validation_responsibilities(package_id,responsibility_role,employee_id)
  WHERE active;

CREATE UNIQUE INDEX IF NOT EXISTS qms_esv_responsibility_active_single_role
  ON qms_epoch_validation_responsibilities(package_id,responsibility_role)
  WHERE active AND responsibility_role<>'ADDITIONAL_TESTER';

CREATE INDEX IF NOT EXISTS qms_esv_responsibility_package_idx
  ON qms_epoch_validation_responsibilities(package_id,active,responsibility_role);
