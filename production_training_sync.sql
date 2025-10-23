-- ========================================
-- PRODUCTION TRAINING MODULES CLEANUP
-- Ensure only the correct 9 training modules exist
-- ========================================

-- Step 1: Delete all training modules (we'll re-add the correct ones)
DELETE FROM training_modules;

-- Step 2: Insert the correct 9 training modules from development

INSERT INTO training_modules (id, title, description) VALUES 
(2, 'Preservation & Foreign Object Debris (FOD) Training', 'Comprehensive training on preservation techniques and FOD prevention to ensure product quality and prevent contamination.');

INSERT INTO training_modules (id, title, description) VALUES 
(3, 'Chemical Handling, Storage, & Disposal', 'Comprehensive training on safe chemical handling procedures, proper storage requirements, and disposal protocols to ensure employee safety and environmental compliance.');

INSERT INTO training_modules (id, title, description) VALUES 
(4, 'Fire Safety Training', 'Essential fire safety training for composite manufacturing environments. Learn to recognize fire hazards, implement prevention measures, respond to emergencies, and follow proper evacuation procedures.');

INSERT INTO training_modules (id, title, description) VALUES 
(5, 'ITAR Compliance Training', 'Annual International Traffic in Arms Regulations (ITAR) training covering export control regulations, employee responsibilities, technical data safeguarding, and compliance requirements for defense-related products.');

INSERT INTO training_modules (id, title, description) VALUES 
(6, 'AS9100 Employee Orientation Training', 'Quality management system orientation for aviation, space, and defense manufacturing. Learn about AG Composites quality policy, objectives, document management, and your role in maintaining quality standards.');

INSERT INTO training_modules (id, title, description) VALUES 
(7, 'Counterfeit Materials Prevention Training', 'Learn to identify, prevent, and respond to counterfeit materials in the supply chain. Covers avoidance strategies, detection red flags, mitigation procedures, and AG Composites supplier requirements to protect product integrity and safety.');

INSERT INTO training_modules (id, title, description) VALUES 
(8, 'Ethics in Aerospace Quality Systems', 'Essential ethical behavior training for aerospace manufacturing. Learn about falsification consequences, handling non-conforming materials, counterfeit prevention, employee/supplier responsibilities, and whistleblower protections.');

INSERT INTO training_modules (id, title, description) VALUES 
(9, 'Leader Training: Nonconforming Items', 'Essential training for leaders on managing nonconforming items. Learn the three categories (scrap, returns, counterfeit), proper handling procedures, red tagging requirements, and disposition authorization protocols.');

INSERT INTO training_modules (id, title, description) VALUES 
(10, 'Leader Training: Shut Down Procedures', 'Essential daily shut down procedures for facility leaders. Covers proper closing procedures for CNC, Gunsmith, Plugging & Layup, Paint departments, and general facility tasks including security, lighting, equipment shutdown, and lock-up protocols.');

-- Done! Production should now have exactly 9 training modules
