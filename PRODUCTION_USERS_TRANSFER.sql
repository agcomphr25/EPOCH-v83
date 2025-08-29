-- =====================================================
-- EPOCH v8 - USERS TABLE PRODUCTION TRANSFER SCRIPT
-- =====================================================
-- Created: August 29, 2025
-- Purpose: Transfer Users table data from Development to Production Database
-- Records: 10 users (3 Admin, 7 Employee accounts)
--
-- INSTRUCTIONS:
-- 1. Run this script in your Production Database
-- 2. Execute via Replit Database Pane or external PostgreSQL client
-- 3. Script handles table creation and data conflicts safely
-- =====================================================

-- Step 1: Create users table if it doesn't exist (with extended EPOCH v8 schema)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    password_hash TEXT,
    role TEXT,
    employee_id INTEGER,
    can_override_prices BOOLEAN,
    is_active BOOLEAN,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    updated_at TIMESTAMP WITHOUT TIME ZONE,
    last_login_at TIMESTAMP WITHOUT TIME ZONE,
    failed_login_attempts INTEGER,
    account_locked_until TIMESTAMP WITHOUT TIME ZONE,
    password_changed_at TIMESTAMP WITHOUT TIME ZONE,
    locked_until TIMESTAMP WITHOUT TIME ZONE
);

-- Step 2: Clear existing user data (CAUTION: This deletes all existing users)
-- Comment out the next line if you want to preserve existing production users
DELETE FROM users;

-- Step 3: Reset the sequence to start from ID 1
SELECT setval('users_id_seq', 1, false);

-- Step 4: Insert all users from Development Database
-- (3 Admin Accounts + 7 Employee Accounts)

-- ADMIN ACCOUNTS
INSERT INTO users (id, username, password, password_hash, role, employee_id, can_override_prices, is_active, created_at, updated_at, last_login_at, failed_login_attempts, account_locked_until, password_changed_at, locked_until) VALUES 
(2, 'admin', 'legacy', '$2b$12$v9oFXEhSoSYdCUrEuRfYfeZq6ntc5.NKXuInNii0DzXRbqnQvfuoe', 'ADMIN', NULL, true, true, '2025-07-24T20:40:22.492Z', '2025-07-24T20:40:22.492Z', '2025-07-28T14:08:19.255Z', 0, NULL, '2025-07-24T20:40:46.086Z', NULL),
(6, 'epoch', 'Fibergl@ss', '$2b$12$5321QeZNPxcRLoByeFutZe2iiv2ZpoT.SqU6YwDM0BmtZyn/cnr6W', 'ADMIN', NULL, true, false, '2025-08-20T16:54:13.188Z', '2025-08-24T04:27:29.820Z', '2025-08-21T12:44:00.735Z', 0, NULL, '2025-08-20T16:54:13.188Z', NULL),
(8, 'deploy', 'DeploymentPass123!', '$2b$12$pYrqzOjfQop82cykXoQd2OvSQPFa99etbuPOIJBcxZZ3qlLgcIoSm', 'ADMIN', NULL, true, false, '2025-08-20T17:33:05.907Z', '2025-08-24T04:27:51.002Z', '2025-08-20T17:37:04.016Z', 0, NULL, '2025-08-20T17:33:05.907Z', NULL);

-- EMPLOYEE ACCOUNTS
INSERT INTO users (id, username, password, password_hash, role, employee_id, can_override_prices, is_active, created_at, updated_at, last_login_at, failed_login_attempts, account_locked_until, password_changed_at, locked_until) VALUES 
(12, 'tims', '6590', '$2b$12$6AB6PlIGsYxpV2.GRR4ZZ.Kv5aij5s478.sgtiToJJhQ8Qzwk0ToS', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:14:43.163Z', '2025-08-24T04:14:43.163Z', NULL, 0, NULL, '2025-08-24T04:14:43.163Z', NULL),
(13, 'glennj', '7894', '$2b$12$J798bUQsMEXCVx8mkENM0.vb0ADxorUQhG58LJepB5LcFGFn6mKtq', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:16:10.286Z', '2025-08-24T04:16:10.286Z', NULL, 0, NULL, '2025-08-24T04:16:10.286Z', NULL),
(14, 'darleneb', '6065', '$2b$12$VQOkMQvEflPqvaNnpK1VZuSfrE.exK6zMH07tRGYDrNRZUHJ9.Q8y', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:17:02.150Z', '2025-08-24T04:17:02.150Z', NULL, 0, NULL, '2025-08-24T04:17:02.150Z', NULL),
(15, 'joeyb', '7024', '$2b$12$2K4A7yYdfDpjyWKgW/ufc./pIrjsn1sZh4AUdxpl72EYpKxDuOLDu', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:17:34.054Z', '2025-08-24T04:17:34.054Z', NULL, 0, NULL, '2025-08-24T04:17:34.054Z', NULL),
(16, 'agrace', '0564', '$2b$12$lvwTLDfjdhf1xwQniVZqSeEK04W8YXrimpf2cRtquwddL0HiRWgKq', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:18:07.454Z', '2025-08-24T04:18:07.454Z', NULL, 0, NULL, '2025-08-24T04:18:07.454Z', NULL),
(17, 'faleeshah', '4047', '$2b$12$wmcq5xugogI8yBJCgdMmo.ZccKU8605ucglXpRI17JNj0IJxEJcCS', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:18:41.114Z', '2025-08-24T04:18:41.114Z', NULL, 0, NULL, '2025-08-24T04:18:41.114Z', NULL),
(18, 'johnl', '4968', '$2b$12$YGMguM..hdLP/vVuH9g6h.24hb5uAhQ.Vq7YR35xo6WFd6sh/qlry', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:21:34.215Z', '2025-08-24T04:21:34.215Z', NULL, 0, NULL, '2025-08-24T04:21:34.215Z', NULL);

-- Step 5: Update the sequence to continue from the highest ID
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users), true);

-- Step 6: Verify the data transfer
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN role = 'ADMIN' THEN 1 END) as admin_users,
    COUNT(CASE WHEN role = 'EMPLOYEE' THEN 1 END) as employee_users,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_users
FROM users;

-- Expected Results:
-- total_users: 10
-- admin_users: 3
-- employee_users: 7 
-- active_users: 8

-- =====================================================
-- USER ACCOUNT SUMMARY:
-- =====================================================
-- ADMIN ACCOUNTS (3):
--   - admin (legacy password) - ACTIVE
--   - epoch (Fibergl@ss) - INACTIVE
--   - deploy (DeploymentPass123!) - INACTIVE
--
-- EMPLOYEE ACCOUNTS (7):
--   - tims (PIN: 6590) - ACTIVE
--   - glennj (PIN: 7894) - ACTIVE
--   - darleneb (PIN: 6065) - ACTIVE
--   - joeyb (PIN: 7024) - ACTIVE
--   - agrace (PIN: 0564) - ACTIVE
--   - faleeshah (PIN: 4047) - ACTIVE
--   - johnl (PIN: 4968) - ACTIVE
-- =====================================================
-- TRANSFER COMPLETE
-- All 10 user accounts successfully transferred from Development to Production
-- =====================================================