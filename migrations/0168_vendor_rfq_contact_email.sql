-- 0168_vendor_rfq_contact_email.sql
-- Repair editable vendor email templates that were seeded before the RFQ
-- contact changed from Laurie to Glenn.

UPDATE email_templates
SET body_html = REPLACE(body_html, 'laurie.tandy@agadvanced.com', 'glenn@agadvanced.com'),
    body_text = REPLACE(body_text, 'laurie.tandy@agadvanced.com', 'glenn@agadvanced.com'),
    updated_at = NOW(),
    updated_by = 'migration:0168_vendor_rfq_contact_email'
WHERE key IN ('vendor_rfq', 'vendor_po_issue', 'vendor_po_resend')
  AND (
    body_html LIKE '%laurie.tandy@agadvanced.com%'
    OR body_text LIKE '%laurie.tandy@agadvanced.com%'
  );

UPDATE vendor_po_settings
SET contact_email = 'glenn@agadvanced.com',
    updated_at = NOW()
WHERE contact_email IS NULL
   OR LOWER(contact_email) = 'laurie.tandy@agadvanced.com';
