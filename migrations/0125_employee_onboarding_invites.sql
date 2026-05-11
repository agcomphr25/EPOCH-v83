-- Employee onboarding invite and verification foundation.
-- Keeps new-hire onboarding separate from employee/user activation.

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS approved_at timestamp,
  ADD COLUMN IF NOT EXISTS approved_by_user_id integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_by_display_name text;

CREATE TABLE IF NOT EXISTS onboarding_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  employee_id integer REFERENCES employees(id),
  token_hash text NOT NULL UNIQUE,
  public_token_hint text,
  delivery_mode text NOT NULL DEFAULT 'in_person',
  status text NOT NULL DEFAULT 'active',
  expires_at timestamp NOT NULL,
  email text,
  phone text,
  email_verified_at timestamp,
  phone_verified_at timestamp,
  no_cell_phone_available boolean NOT NULL DEFAULT false,
  no_cell_phone_reason text,
  no_cell_phone_marked_by_user_id integer REFERENCES users(id),
  no_cell_phone_marked_at timestamp,
  created_by_user_id integer REFERENCES users(id),
  created_by_display_name text,
  created_at timestamp NOT NULL DEFAULT now(),
  revoked_at timestamp,
  revoked_by_user_id integer REFERENCES users(id),
  revoked_reason text
);

CREATE INDEX IF NOT EXISTS onboarding_invitations_session_idx
  ON onboarding_invitations(session_id);

CREATE INDEX IF NOT EXISTS onboarding_invitations_employee_idx
  ON onboarding_invitations(employee_id);

CREATE INDEX IF NOT EXISTS onboarding_invitations_status_idx
  ON onboarding_invitations(status);

CREATE TABLE IF NOT EXISTS onboarding_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES onboarding_invitations(id) ON DELETE CASCADE,
  channel text NOT NULL,
  code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  sent_to text,
  sent_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_verification_codes_invitation_idx
  ON onboarding_verification_codes(invitation_id);

CREATE INDEX IF NOT EXISTS onboarding_verification_codes_channel_status_idx
  ON onboarding_verification_codes(channel, status);

INSERT INTO capabilities (name, display_name, category, description, is_active)
VALUES
  ('onboarding.invite.create', 'Create onboarding invites', 'ONBOARDING', 'Start onboarding sessions and create in-person or sent invite links.', true),
  ('onboarding.review.approve', 'Approve onboarding', 'ONBOARDING', 'Review and approve completed employee onboarding sessions.', true),
  ('onboarding.private_hr.view', 'View private HR onboarding data', 'ONBOARDING', 'View sensitive HR fields submitted during onboarding.', true),
  ('onboarding.private_payroll.view', 'View private payroll onboarding data', 'ONBOARDING', 'View sensitive payroll and banking fields submitted during onboarding.', true),
  ('onboarding.documents.manage', 'Manage onboarding documents', 'ONBOARDING', 'Configure onboarding document packets and requirements.', true)
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now();
