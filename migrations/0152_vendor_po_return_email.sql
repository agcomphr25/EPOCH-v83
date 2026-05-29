INSERT INTO vendor_po_settings (contact_email, created_at, updated_at)
SELECT 'glenn@agcomposites.com', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM vendor_po_settings);

UPDATE vendor_po_settings
SET contact_email = 'glenn@agcomposites.com',
    updated_at = NOW();
