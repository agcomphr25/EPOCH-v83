-- ========================================
-- COMPLETE PRODUCTION DATABASE SYNC
-- Sync certifications, migrate legacy trainings, clean up training matrix
-- ========================================

-- PART 1: Sync certifications to match development database (16 certifications)
DELETE FROM certifications;

INSERT INTO certifications (id, name, description) VALUES (1, 'Safety Training Certificate', 'Basic workplace safety training');
INSERT INTO certifications (id, name, description) VALUES (2, 'Cutting Table', 'Department-specific certification for cutting table operations');
INSERT INTO certifications (id, name, description) VALUES (3, 'Cores', 'Department-specific certification for cores operations');
INSERT INTO certifications (id, name, description) VALUES (4, 'Lay-up', 'Department-specific certification for lay-up operations');
INSERT INTO certifications (id, name, description) VALUES (5, 'Mold Assembly', 'Department-specific certification for mold assembly operations');
INSERT INTO certifications (id, name, description) VALUES (6, 'Tube Procedure', 'Department-specific certification for tube procedure operations');
INSERT INTO certifications (id, name, description) VALUES (7, 'Lathe Cert.', 'Department-specific certification for lathe operations');
INSERT INTO certifications (id, name, description) VALUES (8, 'Using the Ovens', 'Department-specific certification for oven operations');
INSERT INTO certifications (id, name, description) VALUES (9, 'Breakout', 'Department-specific certification for breakout operations');
INSERT INTO certifications (id, name, description) VALUES (10, 'Finish', 'Department-specific certification for finish operations');
INSERT INTO certifications (id, name, description) VALUES (11, 'CNC Operations', 'Department-specific certification for CNC operations');
INSERT INTO certifications (id, name, description) VALUES (12, 'QC Standards', 'Department-specific certification for QC standards');
INSERT INTO certifications (id, name, description) VALUES (13, 'Shipping', 'Department-specific certification for shipping operations');
INSERT INTO certifications (id, name, description) VALUES (14, 'Paint Booth Methods', 'Department-specific certification for paint booth methods');
INSERT INTO certifications (id, name, description) VALUES (15, 'Mold/Mandrel Maintenance', 'Department-specific certification for mold/mandrel maintenance');
INSERT INTO certifications (id, name, description) VALUES (16, 'Customer Satisfaction', 'Department-specific certification for customer satisfaction');

-- Add legacy training certifications (continuing from ID 17)
INSERT INTO certifications (id, name, description) VALUES (17, 'AS9100 Awareness', 'Legacy training - AS9100 quality management awareness');
INSERT INTO certifications (id, name, description) VALUES (18, 'CAR Investigation', 'Legacy training - Corrective Action Request investigation');
INSERT INTO certifications (id, name, description) VALUES (19, 'Chemical Handling', 'Legacy training - Chemical handling (old version)');
INSERT INTO certifications (id, name, description) VALUES (20, 'Counterfeit', 'Legacy training - Counterfeit materials (old version)');
INSERT INTO certifications (id, name, description) VALUES (21, 'Employee Handbook', 'Legacy training - Employee handbook review');
INSERT INTO certifications (id, name, description) VALUES (22, 'Epoch', 'Legacy training - Epoch system training');
INSERT INTO certifications (id, name, description) VALUES (23, 'Ethics', 'Legacy training - Ethics training (old version)');
INSERT INTO certifications (id, name, description) VALUES (24, 'Fire Extinguishers', 'Legacy training - Fire extinguisher usage');
INSERT INTO certifications (id, name, description) VALUES (25, 'How to OJT & Evals', 'Legacy training - On-the-job training and evaluations');
INSERT INTO certifications (id, name, description) VALUES (26, 'Non-Conforming Items', 'Legacy training - Non-conforming items (old version)');
INSERT INTO certifications (id, name, description) VALUES (27, 'PPE/Safety', 'Legacy training - Personal protective equipment and safety');
INSERT INTO certifications (id, name, description) VALUES (28, 'Safety Team Training', 'Legacy training - Safety team procedures');
INSERT INTO certifications (id, name, description) VALUES (29, 'Shut Down Procedures', 'Legacy training - Shut down procedures (old version)');
INSERT INTO certifications (id, name, description) VALUES (30, 'Training the Trainer', 'Legacy training - Trainer certification program');

-- PART 2: Fix orphaned training_matrix records
UPDATE training_matrix tm SET employee_id = e.id FROM employees e WHERE tm.employee_id IS NULL AND tm.employee_name = e.name;

-- PART 3: Migrate legacy trainings to employee_certifications
INSERT INTO employee_certifications (employee_id, certification_id, date_obtained, notes, is_active)
SELECT 
  tm.employee_id,
  c.id as certification_id,
  COALESCE(tm.last_completed, tm.updated_at::date) as date_obtained,
  CONCAT('Legacy training completed. Status: ', tm.status, 
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
AND tm.employee_id IS NOT NULL;

-- PART 4: Clean up training_matrix (keep only current 9 trainings)
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

-- Done! Production now has 30 total certifications and clean training matrix
