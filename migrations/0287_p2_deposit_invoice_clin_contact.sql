-- Add customer-visible AG point-of-contact snapshots to AR invoices.
-- Deposit CLIN allocation details are stored on the existing invoice lines so
-- every amount remains independently auditable and compatible with posting.

ALTER TABLE ar_invoices
  ADD COLUMN IF NOT EXISTS point_of_contact_name text,
  ADD COLUMN IF NOT EXISTS point_of_contact_phone text,
  ADD COLUMN IF NOT EXISTS point_of_contact_email text;
