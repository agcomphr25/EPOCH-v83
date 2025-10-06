-- Training Modules Data for Production Database
-- Run this SQL against your PRODUCTION database in the Replit Database workspace

-- Insert Training Modules
INSERT INTO training_modules (id, title, description, pdf_url, passing_score, is_active, created_at) VALUES 
(2, 'Preservation & Foreign Object Debris (FOD) Training', 'Comprehensive training on preservation techniques and FOD prevention to ensure product quality and prevent contamination.', '/attached_assets/Preservation Training-1_1759352156313.pdf', 80, true, NOW()),
(3, 'Chemical Handling, Storage, & Disposal', 'Essential training on safe chemical handling, proper storage procedures, and disposal requirements.', '/attached_assets/Employee Chemical Handling Training_1759351845055.pdf', 80, true, NOW()),
(4, 'Fire Safety Training', 'Critical fire safety procedures, emergency response, and prevention strategies.', '/attached_assets/Fire Safety Training_1759352218878.pdf', 80, true, NOW()),
(5, 'ITAR Compliance Training', 'International Traffic in Arms Regulations (ITAR) compliance and export control requirements.', '/attached_assets/Annual ITAR Training.docx - Google Docs_1759352442796.pdf', 80, true, NOW()),
(6, 'AS9100 Employee Orientation Training', 'Introduction to AS9100 quality management system requirements for aerospace manufacturing.', '/attached_assets/AS9100 Employee Training_1759352917898.pdf', 80, true, NOW()),
(7, 'Counterfeit Materials Prevention Training', 'Training on identifying and preventing counterfeit materials in aerospace supply chain.', '/attached_assets/Counterfeit Prevention Training_1759353475520.pdf', 80, true, NOW()),
(8, 'Ethics in Aerospace Quality Systems', 'Ethical standards and responsibilities in aerospace quality management.', '/attached_assets/Ethics - Google Docs_1759353564278.pdf', 80, true, NOW()),
(9, 'Leader Training: Nonconforming Items', 'Leadership training on managing and addressing nonconforming items in production.', '/attached_assets/Nonconforming Items - Google Docs_1759353680422.pdf', 80, true, NOW()),
(10, 'Leader Training: Shut Down Procedures', 'Leadership training on proper facility shut down procedures and safety protocols.', '/attached_assets/AG Shutdown Procedures - Google Docs_1759353753638.pdf', 80, true, NOW())
ON CONFLICT (id) DO NOTHING;

-- Note: Quiz questions and answers would need to be exported separately
-- This provides the basic training modules structure
