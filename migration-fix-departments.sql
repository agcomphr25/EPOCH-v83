-- Migration Script: Fix Department Names
-- Run this on the PRODUCTION database at agcompepoch.xyz

-- 1. Update "Shipping Management" to "Fulfilled"
UPDATE orders
SET current_department = 'Fulfilled'
WHERE current_department = 'Shipping Management'
   OR current_department = 'Shipping Manager'
   OR current_department = '"Shipping Management"'
   OR current_department = '"Shipping Manager"';

-- 2. Update "QC" to "Shipping QC" 
UPDATE orders
SET current_department = 'Shipping QC'
WHERE current_department = 'QC'
   OR current_department = '"QC"';

-- 3. Normalize Gunsmith variations
UPDATE orders
SET current_department = 'Gunsmith'
WHERE current_department IN ('Gun', 'Gunsmit', '"Gun"', '"Gunsmit"');

-- 4. Remove any quotes from department names
UPDATE orders
SET current_department = TRIM(BOTH '"' FROM current_department)
WHERE current_department LIKE '"%"';

-- 5. Verify the changes
SELECT current_department, COUNT(*) as order_count
FROM orders
WHERE current_department IS NOT NULL
GROUP BY current_department
ORDER BY current_department;
