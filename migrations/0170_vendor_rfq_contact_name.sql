-- 0170_vendor_rfq_contact_name.sql
-- Repair editable vendor PO/RFQ contact names that were seeded before the
-- purchasing contact changed from Laurie Tandy to Glenn Jones.

UPDATE vendor_po_settings
SET contact_name = 'Glenn Jones',
    updated_at = NOW()
WHERE contact_name IS NULL
   OR LOWER(TRIM(contact_name)) = 'laurie tandy'
   OR LOWER(TRIM(contact_name)) = 'laurie';
