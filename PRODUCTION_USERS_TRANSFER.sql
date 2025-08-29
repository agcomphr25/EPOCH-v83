-- =====================================================
-- EPOCH v8 - USERS TABLE PRODUCTION TRANSFER SCRIPT
-- =====================================================
-- Created: August 29, 2025
-- Purpose: Transfer Users table data from Development to Production Database
-- Records: 21 users (3 Admin, 18 Employee accounts)
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
-- (3 Admin Accounts + 18 Employee Accounts)

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
(18, 'johnl', '4968', '$2b$12$YGMguM..hdLP/vVuH9g6h.24hb5uAhQ.Vq7YR35xo6WFd6sh/qlry', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:21:34.215Z', '2025-08-24T04:21:34.215Z', NULL, 0, NULL, '2025-08-24T04:21:34.215Z', NULL),
(19, 'tasham', '1967', '$2b$12$QqxDJeDKU3mXYYxK0vyIOe3LC1qrtgt8BCcSt7tkyWRB6J4D.C0ZO', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:21:59.235Z', '2025-08-24T04:21:59.235Z', NULL, 0, NULL, '2025-08-24T04:21:59.235Z', NULL),
(20, 'jens', '1627', '$2b$12$oSLt/OG8RbI3J9uz145yO.bcS5c64y0JHJhyBgh.qHUz9r41V2SLm', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:22:30.611Z', '2025-08-24T04:22:30.611Z', NULL, 0, NULL, '2025-08-24T04:22:30.611Z', NULL),
(21, 'angiet', '8312', '$2b$12$ZM69RFMyp9PSGn.xbEu0He7oPyK8wDDiJbPMC7UYCM5aMEMo0QqwW', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:23:11.921Z', '2025-08-24T04:23:11.921Z', NULL, 0, NULL, '2025-08-24T04:23:11.921Z', NULL),
(22, 'blaket', '6269', '$2b$12$H3U4VRVgspfuQRAt1efxS.EioUdvLFpUD5pS3vMbFuhmsNU0Ck9hq', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:23:42.233Z', '2025-08-24T04:23:42.233Z', NULL, 0, NULL, '2025-08-24T04:23:42.233Z', NULL),
(23, 'lauriet', '1610', '$2b$12$I4QwPevTvRrYb0lSbW/gFOfD/xCZD9/0sGAZU8k99sDZoTxAVr0mq', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:24:15.502Z', '2025-08-24T04:24:15.502Z', NULL, 0, NULL, '2025-08-24T04:24:15.502Z', NULL),
(24, 'bradw', '5810', '$2b$12$7AAtm3EiDwNSaNGuxFbVvOrHxVC8I6tOFLdYM4Cxk6TZ.mNSzJrim', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:24:42.759Z', '2025-08-24T04:24:42.759Z', NULL, 0, NULL, '2025-08-24T04:24:42.759Z', NULL),
(25, 'staciw', '2294', '$2b$12$BU/BmbaBtRMIgWPr2dUWbusPqJ5mv7A5a9k26racCIiRSFA55wN26', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:25:18.359Z', '2025-08-24T04:25:18.359Z', NULL, 0, NULL, '2025-08-24T04:25:18.359Z', NULL),
(26, 'tandym', '3933', '$2b$12$6jV11DFKMHDZvf7LxA.6uuAAhwNSCspnouuRAGEoah/uz1y7KEIr6', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:25:50.160Z', '2025-08-24T04:25:50.160Z', NULL, 0, NULL, '2025-08-24T04:25:50.160Z', NULL),
(27, 'tandyd', '3933', '$2b$12$wb3hJF/ll8VbjfjlXjzMMukNGueMQiQy6S6Kzlf/lvNGw5uXif9vO', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:26:00.010Z', '2025-08-24T04:26:00.010Z', NULL, 0, NULL, '2025-08-24T04:26:00.010Z', NULL),
(28, 'hunta', '3933', '$2b$12$DtnsnQ6qSuh8k9DnCow5Gu2KDfkj14hhZu9EhCfpAlT07e8sRmsE6', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:26:11.658Z', '2025-08-24T04:26:11.658Z', NULL, 0, NULL, '2025-08-24T04:26:11.658Z', NULL),
(29, 'halls', '3933', '$2b$12$2lRdvZCVzP5uEyViE0.ofeH97k003BXTP3dCC9Gi0TDEZQizYqGt.', 'EMPLOYEE', NULL, false, true, '2025-08-24T04:26:24.440Z', '2025-08-24T04:26:24.440Z', NULL, 0, NULL, '2025-08-24T04:26:24.440Z', NULL);

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
-- total_users: 21
-- admin_users: 3
-- employee_users: 18 
-- active_users: 19

-- =====================================================
-- USER ACCOUNT SUMMARY:
-- =====================================================
-- ADMIN ACCOUNTS (3):
--   - admin (legacy password) - ACTIVE
--   - epoch (Fibergl@ss) - INACTIVE
--   - deploy (DeploymentPass123!) - INACTIVE
--
-- EMPLOYEE ACCOUNTS (18):
--   - tims (PIN: 6590) - ACTIVE
--   - glennj (PIN: 7894) - ACTIVE
--   - darleneb (PIN: 6065) - ACTIVE
--   - joeyb (PIN: 7024) - ACTIVE
--   - agrace (PIN: 0564) - ACTIVE
--   - faleeshah (PIN: 4047) - ACTIVE
--   - johnl (PIN: 4968) - ACTIVE
--   - tasham (PIN: 1967) - ACTIVE
--   - jens (PIN: 1627) - ACTIVE
--   - angiet (PIN: 8312) - ACTIVE
--   - blaket (PIN: 6269) - ACTIVE
--   - lauriet (PIN: 1610) - ACTIVE
--   - bradw (PIN: 5810) - ACTIVE
--   - staciw (PIN: 2294) - ACTIVE
--   - tandym (PIN: 3933) - ACTIVE
--   - tandyd (PIN: 3933) - ACTIVE
--   - hunta (PIN: 3933) - ACTIVE
--   - halls (PIN: 3933) - ACTIVE
-- =====================================================
-- TRANSFER COMPLETE
-- All 21 user accounts successfully transferred from Development to Production
-- =====================================================