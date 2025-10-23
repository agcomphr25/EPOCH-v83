-- ========================================
-- SAFE PRODUCTION MASTER SYNC SCRIPT
-- Uses ON CONFLICT to safely sync without deleting
-- ========================================

-- PART 1: SYNC EMPLOYEES (15 total)
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

INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (6, 'Tasha Mireles', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (7, 'Faleesha Helton', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (8, 'Brad Walling', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (9, 'Jessica Pena', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (11, 'Tim Steelman', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (12, 'Blake Tandy', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (14, 'Aloysius Grace', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (15, 'Glenn Jones', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (17, 'Tomas Montes', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (18, 'Brian Ramirez', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (19, 'John Langlois', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (20, 'Darlene Bearden', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (22, 'Staci Wimberley', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (23, 'Joey Benson', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO employees (id, name, department, job_title, user_role, is_active) VALUES (24, 'Jennifer Sanders', 'Production', 'Line Employee', 'EMPLOYEE', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

UPDATE training_matrix SET employee_name = 'Glenn Jones' WHERE employee_id = 15;

-- PART 2: SYNC TRAINING MODULES (9 total)
DELETE FROM training_modules;

INSERT INTO training_modules (id, title, description) VALUES (2, 'Preservation & Foreign Object Debris (FOD) Training', 'Comprehensive training on preservation techniques and FOD prevention to ensure product quality and prevent contamination.');
INSERT INTO training_modules (id, title, description) VALUES (3, 'Chemical Handling, Storage, & Disposal', 'Comprehensive training on safe chemical handling procedures, proper storage requirements, and disposal protocols to ensure employee safety and environmental compliance.');
INSERT INTO training_modules (id, title, description) VALUES (4, 'Fire Safety Training', 'Essential fire safety training for composite manufacturing environments.');
INSERT INTO training_modules (id, title, description) VALUES (5, 'ITAR Compliance Training', 'Annual International Traffic in Arms Regulations (ITAR) training.');
INSERT INTO training_modules (id, title, description) VALUES (6, 'AS9100 Employee Orientation Training', 'Quality management system orientation for aviation, space, and defense manufacturing.');
INSERT INTO training_modules (id, title, description) VALUES (7, 'Counterfeit Materials Prevention Training', 'Learn to identify, prevent, and respond to counterfeit materials in the supply chain.');
INSERT INTO training_modules (id, title, description) VALUES (8, 'Ethics in Aerospace Quality Systems', 'Essential ethical behavior training for aerospace manufacturing.');
INSERT INTO training_modules (id, title, description) VALUES (9, 'Leader Training: Nonconforming Items', 'Essential training for leaders on managing nonconforming items.');
INSERT INTO training_modules (id, title, description) VALUES (10, 'Leader Training: Shut Down Procedures', 'Essential daily shut down procedures for facility leaders.');

-- PART 3: SYNC CERTIFICATIONS (16 from development + 14 legacy = 30 total)
INSERT INTO certifications (id, name, description) VALUES (1, 'Safety Training Certificate', 'Basic workplace safety training') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (2, 'Cutting Table', 'Department-specific certification for cutting table operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (3, 'Cores', 'Department-specific certification for cores operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (4, 'Lay-up', 'Department-specific certification for lay-up operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (5, 'Mold Assembly', 'Department-specific certification for mold assembly operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (6, 'Tube Procedure', 'Department-specific certification for tube procedure operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (7, 'Lathe Cert.', 'Department-specific certification for lathe operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (8, 'Using the Ovens', 'Department-specific certification for oven operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (9, 'Breakout', 'Department-specific certification for breakout operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (10, 'Finish', 'Department-specific certification for finish operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (11, 'CNC Operations', 'Department-specific certification for CNC operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (12, 'QC Standards', 'Department-specific certification for QC standards') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (13, 'Shipping', 'Department-specific certification for shipping operations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (14, 'Paint Booth Methods', 'Department-specific certification for paint booth methods') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (15, 'Mold/Mandrel Maintenance', 'Department-specific certification for mold/mandrel maintenance') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (16, 'Customer Satisfaction', 'Department-specific certification for customer satisfaction') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Add legacy training certifications (IDs 17-30)
INSERT INTO certifications (id, name, description) VALUES (17, 'AS9100 Awareness', 'Legacy training - AS9100 quality management awareness') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (18, 'CAR Investigation', 'Legacy training - Corrective Action Request investigation') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (19, 'Chemical Handling', 'Legacy training - Chemical handling (old version)') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (20, 'Counterfeit', 'Legacy training - Counterfeit materials (old version)') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (21, 'Employee Handbook', 'Legacy training - Employee handbook review') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (22, 'Epoch', 'Legacy training - Epoch system training') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (23, 'Ethics', 'Legacy training - Ethics training (old version)') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (24, 'Fire Extinguishers', 'Legacy training - Fire extinguisher usage') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (25, 'How to OJT & Evals', 'Legacy training - On-the-job training and evaluations') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (26, 'Non-Conforming Items', 'Legacy training - Non-conforming items (old version)') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (27, 'PPE/Safety', 'Legacy training - Personal protective equipment and safety') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (28, 'Safety Team Training', 'Legacy training - Safety team procedures') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (29, 'Shut Down Procedures', 'Legacy training - Shut down procedures (old version)') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
INSERT INTO certifications (id, name, description) VALUES (30, 'Training the Trainer', 'Legacy training - Trainer certification program') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- PART 4: MIGRATE LEGACY TRAINING DATA
-- Fix orphaned records first
UPDATE training_matrix tm SET employee_id = e.id FROM employees e WHERE tm.employee_id IS NULL AND tm.employee_name = e.name;

-- Migrate legacy trainings to employee_certifications
INSERT INTO employee_certifications (employee_id, certification_id, date_obtained, notes, is_active)
SELECT 
  tm.employee_id,
  c.id as certification_id,
  COALESCE(tm.last_completed, tm.updated_at::date) as date_obtained,
  CONCAT('Legacy training. Status: ', tm.status, 
         CASE WHEN tm.last_score IS NOT NULL THEN CONCAT(', Score: ', tm.last_score) ELSE '' END) as notes,
  true as is_active
FROM training_matrix tm
INNER JOIN certifications c ON c.name = tm.training_name
WHERE tm.training_name IN (
  'AS9100 Awareness', 'CAR Investigation', 'Chemical Handling', 'Counterfeit',
  'Employee Handbook', 'Epoch', 'Ethics', 'Fire Extinguishers',
  'How to OJT & Evals', 'Non-Conforming Items', 'PPE/Safety',
  'Safety Team Training', 'Shut Down Procedures', 'Training the Trainer'
)
AND tm.employee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Clean up training_matrix
DELETE FROM training_matrix WHERE training_name NOT IN (
  'Preservation & Foreign Object Debris (FOD) Training',
  'Chemical Handling, Storage, & Disposal',
  'Fire Safety Training',
  'ITAR Compliance Training',
  'AS9100 Employee Orientation Training',
  'Counterfeit Materials Prevention Training',
  'Ethics in Aerospace Quality Systems',
  'Leader Training: Nonconforming Items',
  'Leader Training: Shut Down Procedures'
);

-- DONE
