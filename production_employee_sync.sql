-- ========================================
-- PRODUCTION DATABASE EMPLOYEE SYNC
-- This script ensures production has the exact same employees as development
-- ========================================

-- Step 1: Clean up test employees and their related data
DELETE FROM employee_certifications WHERE employee_id IN (1, 2, 3, 4, 5, 10, 13, 16, 21);
DELETE FROM employee_audit_log WHERE employee_id IN (1, 2, 3, 4, 5, 10, 13, 16, 21);
DELETE FROM employee_capabilities WHERE employee_id IN (1, 2, 3, 4, 5, 10, 13, 16, 21);
DELETE FROM employee_documents WHERE employee_id IN (1, 2, 3, 4, 5, 10, 13, 16, 21);
DELETE FROM employee_quiz_attempts WHERE employee_id IN (1, 2, 3, 4, 5, 10, 13, 16, 21);
DELETE FROM employee_training_records WHERE employee_id IN (1, 2, 3, 4, 5, 10, 13, 16, 21);
DELETE FROM evaluations WHERE employee_id IN (1, 2, 3, 4, 5, 10, 13, 16, 21);
DELETE FROM training_matrix WHERE employee_id IN (1, 2, 3, 4, 5, 10, 13, 16, 21);
DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE username IN ('alice', 'jane', 'mike', 'testuser', 'john', 'angie', 'laurie', 'dave', 'matt'));
DELETE FROM users WHERE username IN ('alice', 'jane', 'mike', 'testuser', 'john', 'angie', 'laurie', 'dave', 'matt');
DELETE FROM employees WHERE id IN (1, 2, 3, 4, 5, 10, 13, 16, 21);

-- Step 2: Update/Insert the correct employees
-- These are the employees from development database

-- Employee ID 6: Tasha Mireles
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (6, 'Tasha Mireles', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Tasha Mireles',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 7: Faleesha Helton
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (7, 'Faleesha Helton', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Faleesha Helton',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 8: Brad Walling
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (8, 'Brad Walling', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Brad Walling',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 9: Jessica Pena
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (9, 'Jessica Pena', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Jessica Pena',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 11: Tim Steelman
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (11, 'Tim Steelman', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Tim Steelman',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 12: Blake Tandy
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (12, 'Blake Tandy', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Blake Tandy',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 14: Aloysius Grace
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (14, 'Aloysius Grace', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Aloysius Grace',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 15: Glenn Jones (updated from "Glenn")
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (15, 'Glenn Jones', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Glenn Jones',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 17: Tomas Montes
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (17, 'Tomas Montes', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Tomas Montes',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 18: Brian Ramirez
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (18, 'Brian Ramirez', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Brian Ramirez',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 19: John Langlois
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (19, 'John Langlois', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'John Langlois',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 20: Darlene Bearden
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (20, 'Darlene Bearden', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Darlene Bearden',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 22: Staci Wimberley
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (22, 'Staci Wimberley', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Staci Wimberley',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 23: Joey Benson
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (23, 'Joey Benson', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Joey Benson',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Employee ID 24: Jennifer Sanders
INSERT INTO employees (id, name, department, job_title, user_role, is_active)
VALUES (24, 'Jennifer Sanders', 'Production', 'Line Employee', 'EMPLOYEE', true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Jennifer Sanders',
  department = 'Production',
  job_title = 'Line Employee',
  user_role = 'EMPLOYEE',
  is_active = true;

-- Step 3: Update training matrix to reflect Glenn Jones
UPDATE training_matrix SET employee_name = 'Glenn Jones' WHERE employee_id = 15 AND employee_name != 'Glenn Jones';

-- Done! Production should now have the same 15 employees as development
