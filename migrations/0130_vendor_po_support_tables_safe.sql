-- Safe repair for Vendor PO support features used by the PO detail screen:
-- optional statements and PDF/reference attachments.

CREATE TABLE IF NOT EXISTS optional_settings (
  id serial PRIMARY KEY,
  name text NOT NULL,
  statement text NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

ALTER TABLE optional_settings
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS statement text,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS po_optional_settings (
  id serial PRIMARY KEY,
  vendor_po_id integer NOT NULL,
  optional_setting_id integer NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

ALTER TABLE po_optional_settings
  ADD COLUMN IF NOT EXISTS vendor_po_id integer,
  ADD COLUMN IF NOT EXISTS optional_setting_id integer,
  ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

CREATE INDEX IF NOT EXISTS po_optional_settings_vendor_po_id_idx
  ON po_optional_settings(vendor_po_id);

CREATE UNIQUE INDEX IF NOT EXISTS po_optional_settings_unique_idx
  ON po_optional_settings(vendor_po_id, optional_setting_id);

DO $$
BEGIN
  IF to_regclass('public.vendor_pos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'po_optional_settings_vendor_po_id_vendor_pos_id_fk'
         AND conrelid = 'po_optional_settings'::regclass
     ) THEN
    ALTER TABLE po_optional_settings
      ADD CONSTRAINT po_optional_settings_vendor_po_id_vendor_pos_id_fk
      FOREIGN KEY (vendor_po_id) REFERENCES vendor_pos(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.optional_settings') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'po_optional_settings_optional_setting_id_optional_settings_id_fk'
         AND conrelid = 'po_optional_settings'::regclass
     ) THEN
    ALTER TABLE po_optional_settings
      ADD CONSTRAINT po_optional_settings_optional_setting_id_optional_settings_id_fk
      FOREIGN KEY (optional_setting_id) REFERENCES optional_settings(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_po_attachments (
  id serial PRIMARY KEY,
  vendor_po_id integer NOT NULL,
  file_name text NOT NULL,
  original_file_name text NOT NULL,
  file_size integer NOT NULL,
  mime_type text NOT NULL,
  file_path text NOT NULL,
  uploaded_by text,
  notes text,
  created_at timestamp DEFAULT now() NOT NULL
);

ALTER TABLE vendor_po_attachments
  ADD COLUMN IF NOT EXISTS vendor_po_id integer,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS original_file_name text,
  ADD COLUMN IF NOT EXISTS file_size integer,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS uploaded_by text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

CREATE INDEX IF NOT EXISTS vendor_po_attachments_vendor_po_id_idx
  ON vendor_po_attachments(vendor_po_id);

DO $$
BEGIN
  IF to_regclass('public.vendor_pos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'vendor_po_attachments_vendor_po_id_vendor_pos_id_fk'
         AND conrelid = 'vendor_po_attachments'::regclass
     ) THEN
    ALTER TABLE vendor_po_attachments
      ADD CONSTRAINT vendor_po_attachments_vendor_po_id_vendor_pos_id_fk
      FOREIGN KEY (vendor_po_id) REFERENCES vendor_pos(id) ON DELETE CASCADE;
  END IF;
END $$;
