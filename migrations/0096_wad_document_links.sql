-- WAD Document Links — traceability records for work instructions, spec sheets, and other
-- document templates applied during provisioning (parallels part_routings.created_from_template_id
-- and travelers.created_from_template_id for non-artifact document template references)

CREATE TABLE IF NOT EXISTS wad_document_links (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id         UUID NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
  template_id           UUID NOT NULL,
  template_version      INTEGER NOT NULL DEFAULT 1,
  template_type         TEXT NOT NULL,
  template_name         TEXT NOT NULL,
  file_url              TEXT,
  linked_at             TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wad_document_links_wad_idx ON wad_document_links (work_order_id);
CREATE INDEX IF NOT EXISTS wad_document_links_template_idx ON wad_document_links (template_id);
