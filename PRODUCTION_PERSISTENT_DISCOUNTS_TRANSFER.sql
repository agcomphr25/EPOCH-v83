-- =====================================================
-- EPOCH v8 - PERSISTENT DISCOUNTS PRODUCTION TRANSFER
-- =====================================================
-- Created: August 29, 2025
-- Purpose: Transfer Persistent Discounts data from Development to Production Database
-- Records: 7 discount records from EPOCH v8
--
-- INSTRUCTIONS:
-- 1. Run this script in your Production Database
-- 2. Execute via Replit Database Pane or external PostgreSQL client
-- 3. Script handles table creation and data conflicts safely
-- =====================================================

-- Step 1: Create persistent_discounts table if it doesn't exist (with full EPOCH v8 schema)
CREATE TABLE IF NOT EXISTS persistent_discounts (
    id SERIAL PRIMARY KEY,
    customer_type_id INTEGER NOT NULL,
    percent INTEGER,
    is_active INTEGER NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    fixed_amount INTEGER,
    applies_to TEXT NOT NULL DEFAULT 'stock_model'
);

-- Step 2: Add missing columns to existing table (safe for existing tables)
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE persistent_discounts ADD COLUMN applies_to TEXT NOT NULL DEFAULT 'stock_model';
        RAISE NOTICE 'Added applies_to column to persistent_discounts';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'applies_to column already exists in persistent_discounts';
    END;
END $$;

-- Step 3: Clear existing discount data (CAUTION: This deletes existing persistent discounts)
-- Comment out the next line if you want to preserve existing production discounts
DELETE FROM persistent_discounts;

-- Step 4: Reset the sequence to start from ID 1
SELECT setval('persistent_discounts_id_seq', 1, false);

-- Step 5: Insert all persistent discounts from Development Database
-- (7 discount records from EPOCH v8)

INSERT INTO persistent_discounts (id, customer_type_id, percent, is_active, created_at, updated_at, name, description, fixed_amount, applies_to) VALUES 
(1, 1, 10, 1, '2025-07-11T18:29:57.673Z', '2025-07-11T18:44:30.905Z', 'Industry 10', '10% off carbon fiber stock models for individuals who work in the firearms industry', NULL, 'stock_model'),
(2, 2, 20, 1, '2025-07-11T18:29:57.673Z', '2025-07-11T18:43:23.745Z', 'GB-20', '20% off carbon fiber stock models', 0, 'stock_model'),
(4, 4, 0, 0, '2025-07-11T18:29:57.673Z', '2025-07-11T18:58:59.009Z', 'DIST-0', '', NULL, 'stock_model'),
(5, 2, 25, 1, '2025-07-11T18:42:59.574Z', '2025-07-11T18:42:59.574Z', 'GB-25', '25% off carbon fiber stock models', NULL, 'stock_model'),
(6, 2, 30, 1, '2025-07-11T18:43:40.339Z', '2025-07-11T18:43:40.339Z', 'GB-30', '30% off carbon fiber stock models', NULL, 'stock_model'),
(8, 6, 0, 1, '2025-07-11T19:41:13.308Z', '2025-07-11T19:41:13.308Z', 'MIL/LEO', 'Military and Law Enforcement fixed discount', 5000, 'stock_model'),
(9, 2, 0, 1, '2025-07-19T21:02:54.996Z', '2025-07-19T21:02:54.996Z', 'Custom', '', 0, 'stock_model');

-- Step 6: Update the sequence to continue from the highest ID
SELECT setval('persistent_discounts_id_seq', (SELECT MAX(id) FROM persistent_discounts), true);

-- Step 7: Verify the data transfer
SELECT 
    COUNT(*) as total_discounts,
    COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_discounts,
    COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive_discounts,
    COUNT(CASE WHEN percent > 0 THEN 1 END) as percentage_discounts,
    COUNT(CASE WHEN fixed_amount > 0 THEN 1 END) as fixed_amount_discounts
FROM persistent_discounts;

-- Expected Results:
-- total_discounts: 7
-- active_discounts: 6
-- inactive_discounts: 1
-- percentage_discounts: 4
-- fixed_amount_discounts: 1

-- Step 8: Display all discount details for verification
SELECT 
    id,
    name,
    percent,
    fixed_amount,
    CASE WHEN is_active = 1 THEN 'ACTIVE' ELSE 'INACTIVE' END as status,
    customer_type_id,
    description,
    applies_to
FROM persistent_discounts 
ORDER BY id;

-- =====================================================
-- PERSISTENT DISCOUNTS SUMMARY:
-- =====================================================
-- ACTIVE DISCOUNTS (6):
--   - Industry 10: 10% off for firearms industry (Customer Type 1)
--   - GB-20: 20% off carbon fiber stock models (Customer Type 2)
--   - GB-25: 25% off carbon fiber stock models (Customer Type 2)
--   - GB-30: 30% off carbon fiber stock models (Customer Type 2)
--   - MIL/LEO: $50.00 fixed discount for Military/LEO (Customer Type 6)
--   - Custom: Custom discount option (Customer Type 2)
--
-- INACTIVE DISCOUNTS (1):
--   - DIST-0: Distributor discount (inactive)
-- =====================================================
-- TRANSFER COMPLETE
-- All 7 persistent discount records successfully transferred from Development to Production
-- =====================================================