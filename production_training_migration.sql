-- ========================================
-- PRODUCTION TRAINING TO CERTIFICATION MIGRATION
-- Move legacy trainings from training_matrix to employee_certifications
-- ========================================

-- Step 1: Create certification entries for the legacy trainings
INSERT INTO certifications (name, description) VALUES 
  ('AS9100 Awareness', 'Legacy training - AS9100 quality management awareness')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('CAR Investigation', 'Legacy training - Corrective Action Request investigation')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('Chemical Handling', 'Legacy training - Chemical handling (old version)')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('Counterfeit', 'Legacy training - Counterfeit materials (old version)')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('Employee Handbook', 'Legacy training - Employee handbook review')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('Epoch', 'Legacy training - Epoch system training')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('Ethics', 'Legacy training - Ethics training (old version)')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('Fire Extinguishers', 'Legacy training - Fire extinguisher usage')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('How to OJT & Evals', 'Legacy training - On-the-job training and evaluations')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('Non-Conforming Items', 'Legacy training - Non-conforming items (old version)')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('PPE/Safety', 'Legacy training - Personal protective equipment and safety')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('Safety Team Training', 'Legacy training - Safety team procedures')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('Shut Down Procedures', 'Legacy training - Shut down procedures (old version)')
ON CONFLICT DO NOTHING;

INSERT INTO certifications (name, description) VALUES 
  ('Training the Trainer', 'Legacy training - Trainer certification program')
ON CONFLICT DO NOTHING;

-- Step 2: Migrate completed legacy trainings to employee_certifications
INSERT INTO employee_certifications (employee_id, certification_id, date_obtained, notes, is_active)
SELECT 
  tm.employee_id,
  c.id as certification_id,
  COALESCE(tm.last_completed, tm.updated_at::date) as date_obtained,
  CONCAT('Migrated from training matrix. Status: ', tm.status, 
         CASE WHEN tm.last_score IS NOT NULL THEN CONCAT(', Score: ', tm.last_score) ELSE '' END) as notes,
  true as is_active
FROM training_matrix tm
INNER JOIN certifications c ON c.name = tm.training_name
WHERE tm.training_name IN (
  'AS9100 Awareness',
  'CAR Investigation',
  'Chemical Handling',
  'Counterfeit',
  'Employee Handbook',
  'Epoch',
  'Ethics',
  'Fire Extinguishers',
  'How to OJT & Evals',
  'Non-Conforming Items',
  'PPE/Safety',
  'Safety Team Training',
  'Shut Down Procedures',
  'Training the Trainer'
)
AND tm.employee_id IS NOT NULL;

-- Step 3: Remove legacy trainings from training_matrix
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

-- Done! Legacy trainings now preserved as certifications
