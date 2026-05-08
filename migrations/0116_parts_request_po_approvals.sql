ALTER TABLE parts_requests
  ADD COLUMN IF NOT EXISTS approval_required_role text DEFAULT 'INVENTORY_MANAGER',
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS owner_approved_by text,
  ADD COLUMN IF NOT EXISTS owner_approved_at timestamp,
  ADD COLUMN IF NOT EXISTS digital_approval_signature text,
  ADD COLUMN IF NOT EXISTS approval_history jsonb DEFAULT '[]'::jsonb;

UPDATE parts_requests
SET
  approval_required_role = COALESCE(approval_required_role, 'INVENTORY_MANAGER'),
  approval_status = COALESCE(
    approval_status,
    CASE
      WHEN status = 'APPROVED' THEN 'APPROVED'
      WHEN status = 'REJECTED' THEN 'REJECTED'
      ELSE 'PENDING'
    END
  ),
  approval_history = COALESCE(approval_history, '[]'::jsonb)
WHERE
  approval_required_role IS NULL
  OR approval_status IS NULL
  OR approval_history IS NULL;
