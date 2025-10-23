-- ========================================
-- PRODUCTION CERTIFICATION RECOVERY SCRIPT
-- Rebuilds employee_certifications from training_matrix data
-- ========================================

-- STEP 1: Ensure all 30 certifications exist (16 standard + 14 legacy training)
INSERT INTO certifications (id, name, description) VALUES (1, 'Safety Training Certificate', 'Basic workplace safety training') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (2, 'Cutting Table', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (3, 'Cores', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (4, 'Lay-up', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (5, 'Mold Assembly', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (6, 'Tube Procedure', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (7, 'Lathe Cert.', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (8, 'Using the Ovens', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (9, 'Breakout', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (10, 'Finish', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (11, 'CNC Operations', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (12, 'QC Standards', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (13, 'Shipping', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (14, 'Paint Booth Methods', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (15, 'Mold/Mandrel Maintenance', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (16, 'Customer Satisfaction', 'Department-specific certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Legacy training certifications (from training_matrix)
INSERT INTO certifications (id, name, description) VALUES (17, 'AS9100 Awareness', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (18, 'CAR Investigation', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (19, 'Chemical Handling', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (20, 'Counterfeit', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (21, 'Employee Handbook', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (22, 'Epoch', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (23, 'Ethics', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (24, 'Fire Extinguishers', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (25, 'How to OJT & Evals', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (26, 'Non-Conforming Items', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (27, 'PPE/Safety', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (28, 'Safety Team Training', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (29, 'Shut Down Procedures', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO certifications (id, name, description) VALUES (30, 'Training the Trainer', 'Legacy training certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Also add Preservation & FOD as a certification since it appears in the matrix
INSERT INTO certifications (id, name, description) VALUES (31, 'Preservation & Foreign Object Debris (FOD) Training', 'FOD prevention and preservation certification') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- STEP 2: Fix orphaned employee_id records in training_matrix
UPDATE training_matrix tm 
SET employee_id = e.id 
FROM employees e 
WHERE tm.employee_id IS NULL 
  AND tm.employee_name = e.name;

-- STEP 3: Migrate ALL completed trainings from training_matrix to employee_certifications
-- This will create the 87+ certification records
INSERT INTO employee_certifications (employee_id, certification_id, date_obtained, notes, is_active)
SELECT 
  tm.employee_id,
  c.id as certification_id,
  COALESCE(tm.last_completed::date, CURRENT_DATE) as date_obtained,
  CONCAT('Completed training. Status: ', COALESCE(tm.status, 'COMPLETED'), 
         CASE WHEN tm.last_score IS NOT NULL THEN CONCAT(', Score: ', tm.last_score, '%') ELSE '' END) as notes,
  true as is_active
FROM training_matrix tm
INNER JOIN certifications c ON c.name = tm.training_name
WHERE tm.employee_id IS NOT NULL
  AND tm.last_completed IS NOT NULL
  AND tm.status = 'COMPLETED'
ON CONFLICT DO NOTHING;

-- DONE! This should restore all your employee certification records
