-- 0169_vendor_rfq_pdf_attachment.sql
-- Attach the generated Request for Quote PDF to vendor RFQ emails.

UPDATE email_templates
SET attachment_rules = jsonb_set(
      COALESCE(attachment_rules, '{}'::jsonb),
      '{attachVendorPOPDF}',
      'true'::jsonb,
      true
    ),
    updated_at = NOW(),
    updated_by = 'migration:0169_vendor_rfq_pdf_attachment'
WHERE key = 'vendor_rfq'
  AND (attachment_rules->>'attachVendorPOPDF') IS DISTINCT FROM 'true';
