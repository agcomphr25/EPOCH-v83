-- ========================================
-- PRODUCTION DATABASE SYNC SCRIPT
-- Syncs employee data from development to production
-- ========================================

-- First, clean up test employees and old data
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

-- Update Glenn to Glenn Jones in both tables
UPDATE employees SET name = 'Glenn Jones' WHERE id = 15 AND name = 'Glenn';
UPDATE training_matrix SET employee_name = 'Glenn Jones' WHERE employee_id = 15 AND employee_name = 'Glenn';

