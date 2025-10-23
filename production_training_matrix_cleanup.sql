-- ========================================
-- PRODUCTION TRAINING MATRIX CLEANUP
-- Remove legacy training records that don't match current modules
-- ========================================

-- Delete all training_matrix records that don't match the current 9 training modules
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

-- Done! Training matrix should now only show the current 9 trainings
