-- =====================================================
-- EPOCH v8 - ADD MISSING USER COLUMNS TO PRODUCTION
-- =====================================================
-- Created: August 29, 2025
-- Purpose: Add missing EPOCH v8 columns to existing Production users table
-- Run this BEFORE running the main user data transfer script
--
-- INSTRUCTIONS:
-- 1. Run this script FIRST in your Production Database
-- 2. Then run PRODUCTION_USERS_TRANSFER.sql
-- 3. This script is safe to run multiple times
-- =====================================================

-- Add missing columns to existing users table
-- Using IF NOT EXISTS equivalent for PostgreSQL (ignore errors if column exists)

-- Add password_hash column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN password_hash TEXT;
        RAISE NOTICE 'Added password_hash column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'password_hash column already exists';
    END;
END $$;

-- Add role column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN role TEXT;
        RAISE NOTICE 'Added role column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'role column already exists';
    END;
END $$;

-- Add employee_id column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN employee_id INTEGER;
        RAISE NOTICE 'Added employee_id column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'employee_id column already exists';
    END;
END $$;

-- Add can_override_prices column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN can_override_prices BOOLEAN;
        RAISE NOTICE 'Added can_override_prices column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'can_override_prices column already exists';
    END;
END $$;

-- Add is_active column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN;
        RAISE NOTICE 'Added is_active column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'is_active column already exists';
    END;
END $$;

-- Add created_at column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMP WITHOUT TIME ZONE;
        RAISE NOTICE 'Added created_at column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'created_at column already exists';
    END;
END $$;

-- Add updated_at column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITHOUT TIME ZONE;
        RAISE NOTICE 'Added updated_at column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'updated_at column already exists';
    END;
END $$;

-- Add last_login_at column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP WITHOUT TIME ZONE;
        RAISE NOTICE 'Added last_login_at column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'last_login_at column already exists';
    END;
END $$;

-- Add failed_login_attempts column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER;
        RAISE NOTICE 'Added failed_login_attempts column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'failed_login_attempts column already exists';
    END;
END $$;

-- Add account_locked_until column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN account_locked_until TIMESTAMP WITHOUT TIME ZONE;
        RAISE NOTICE 'Added account_locked_until column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'account_locked_until column already exists';
    END;
END $$;

-- Add password_changed_at column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP WITHOUT TIME ZONE;
        RAISE NOTICE 'Added password_changed_at column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'password_changed_at column already exists';
    END;
END $$;

-- Add locked_until column
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE users ADD COLUMN locked_until TIMESTAMP WITHOUT TIME ZONE;
        RAISE NOTICE 'Added locked_until column';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'locked_until column already exists';
    END;
END $$;

-- Verify the table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'EPOCH v8 USER COLUMNS SUCCESSFULLY ADDED';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Your users table now has all required EPOCH v8 columns.';
    RAISE NOTICE 'You can now run PRODUCTION_USERS_TRANSFER.sql safely.';
    RAISE NOTICE '=====================================================';
END $$;