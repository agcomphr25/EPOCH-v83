-- ====================================================================
-- TRAINING MODULES PRODUCTION DATABASE MIGRATION SCRIPT
-- Generated: October 2, 2025
-- 
-- This script migrates all training module data to your production database.
-- Run this script in your production database using the Replit Database pane.
--
-- INSTRUCTIONS:
-- 1. Open your Replit Database pane
-- 2. Switch to your PRODUCTION database
-- 3. Copy and paste this entire script
-- 4. Execute the script
-- ====================================================================

-- Begin transaction for safety
BEGIN;

-- ====================================================================
-- STEP 1: Create Tables (if they don't already exist)
-- ====================================================================

-- Training Modules Table
CREATE TABLE IF NOT EXISTS training_modules (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    pdf_url VARCHAR(500),
    passing_score INTEGER DEFAULT 80,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Training Quiz Questions Table
CREATE TABLE IF NOT EXISTS training_quiz_questions (
    id SERIAL PRIMARY KEY,
    module_id INTEGER REFERENCES training_modules(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    question_type VARCHAR(50) DEFAULT 'multiple_choice',
    correct_answer TEXT,
    explanation TEXT,
    sort_order INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Training Quiz Answers Table
CREATE TABLE IF NOT EXISTS training_quiz_answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER REFERENCES training_quiz_questions(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    sort_order INTEGER,
    is_correct BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Training Completions Table
CREATE TABLE IF NOT EXISTS training_completions (
    id SERIAL PRIMARY KEY,
    module_id INTEGER REFERENCES training_modules(id) ON DELETE CASCADE,
    employee_id VARCHAR(100),
    employee_name VARCHAR(255),
    score INTEGER,
    passed BOOLEAN DEFAULT false,
    answers JSONB,
    certificate_issued BOOLEAN DEFAULT false,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Training Sessions Table
CREATE TABLE IF NOT EXISTS training_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    topic VARCHAR(255),
    description TEXT,
    instructor_id VARCHAR(100),
    instructor_name VARCHAR(255),
    session_date TIMESTAMP,
    start_time VARCHAR(20),
    end_time VARCHAR(20),
    location VARCHAR(255),
    max_attendees INTEGER,
    materials TEXT,
    quiz_questions TEXT,
    passing_score INTEGER DEFAULT 80,
    status VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Training Attendees Table
CREATE TABLE IF NOT EXISTS training_attendees (
    id SERIAL PRIMARY KEY,
    attendee_id VARCHAR(100) UNIQUE,
    session_id VARCHAR(100),
    employee_id VARCHAR(100),
    employee_name VARCHAR(255),
    employee_number VARCHAR(50),
    department VARCHAR(100),
    signed_in_at TIMESTAMP,
    signed_out_at TIMESTAMP,
    attendance_status VARCHAR(50),
    quiz_started_at TIMESTAMP,
    quiz_completed_at TIMESTAMP,
    quiz_score INTEGER,
    quiz_responses JSONB,
    passed BOOLEAN DEFAULT false,
    certificate_generated BOOLEAN DEFAULT false,
    certificate_generated_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- STEP 2: Clear existing training data (optional - comment out if you want to keep existing data)
-- ====================================================================

-- TRUNCATE TABLE training_attendees CASCADE;
-- TRUNCATE TABLE training_sessions CASCADE;
-- TRUNCATE TABLE training_completions CASCADE;
-- TRUNCATE TABLE training_quiz_answers CASCADE;
-- TRUNCATE TABLE training_quiz_questions CASCADE;
-- TRUNCATE TABLE training_modules CASCADE;

-- ====================================================================
-- STEP 3: Insert Training Modules (9 modules)
-- ====================================================================

INSERT INTO training_modules (id, title, description, pdf_url, passing_score, is_active, created_at, updated_at)
VALUES
(2, 'Preservation & Foreign Object Debris (FOD) Training', 'Comprehensive training on preservation techniques and FOD prevention to ensure product quality and prevent contamination.', '/attached_assets/preservation-training.pdf', 80, true, '2025-10-01 19:49:24.481213', '2025-10-01 19:49:24.481213'),
(3, 'Chemical Handling, Storage, & Disposal', 'Comprehensive training on safe chemical handling procedures, proper storage requirements, and disposal protocols to ensure employee safety and environmental compliance.', '/attached_assets/Leader Training Topic Chemical Handling_1759351634113.pdf', 80, true, '2025-10-01 20:51:17.989912', '2025-10-01 20:51:17.989912'),
(4, 'Fire Safety Training', 'Essential fire safety training for composite manufacturing environments. Learn to recognize fire hazards, implement prevention measures, respond to emergencies, and follow proper evacuation procedures.', '/attached_assets/Pasted--Fire-Safety-Training-AG-Composites-Training-Objective-To-ensure-all-AG-Composites-employees-un-1759351941754_1759351941754.txt', 80, true, '2025-10-01 20:52:36.10065', '2025-10-01 20:52:36.10065'),
(5, 'ITAR Compliance Training', 'Annual International Traffic in Arms Regulations (ITAR) training covering export control regulations, employee responsibilities, technical data safeguarding, and compliance requirements for defense-related products.', '/attached_assets/Annual ITAR Training.docx - Google Docs_1759352442796.pdf', 80, true, '2025-10-01 21:01:04.760619', '2025-10-01 21:01:04.760619'),
(6, 'AS9100 Employee Orientation Training', 'Quality management system orientation for aviation, space, and defense manufacturing. Learn about AG Composites quality policy, objectives, document management, and your role in maintaining quality standards.', '/attached_assets/AS9100 Employee Training_1759352917898.pdf', 80, true, '2025-10-01 21:09:00.326595', '2025-10-01 21:09:00.326595'),
(7, 'Counterfeit Materials Prevention Training', 'Learn to identify, prevent, and respond to counterfeit materials in the supply chain. Covers avoidance strategies, detection red flags, mitigation procedures, and AG Composites supplier requirements to protect product integrity and safety.', '/attached_assets/Counterfeit Prevention Training_1759353475520.pdf', 80, true, '2025-10-01 21:18:54.995002', '2025-10-01 21:18:54.995002'),
(8, 'Ethics in Aerospace Quality Systems', 'Essential ethical behavior training for aerospace manufacturing. Learn about falsification consequences, handling non-conforming materials, counterfeit prevention, employee/supplier responsibilities, and whistleblower protections.', '/attached_assets/Ethics - Google Docs_1759353564278.pdf', 80, true, '2025-10-01 21:21:16.083315', '2025-10-01 21:21:16.083315'),
(9, 'Leader Training: Nonconforming Items', 'Essential training for leaders on managing nonconforming items. Learn the three categories (scrap, returns, counterfeit), proper handling procedures, red tagging requirements, and disposition authorization protocols.', '/attached_assets/Leader Training Topic_ Nonconforming Items_1759353723875.pdf', 80, true, '2025-10-01 21:25:25.069186', '2025-10-01 21:25:25.069186'),
(10, 'Leader Training: Shut Down Procedures', 'Essential daily shut down procedures for facility leaders. Covers proper closing procedures for CNC, Gunsmith, Plugging & Layup, Paint departments, and general facility tasks including security, lighting, equipment shutdown, and lock-up protocols.', '/attached_assets/Leader Training Shut Down Procedures_1759353935946.pdf', 80, true, '2025-10-01 21:29:28.492739', '2025-10-01 21:29:28.492739')
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    pdf_url = EXCLUDED.pdf_url,
    passing_score = EXCLUDED.passing_score,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

-- Update the sequence to continue from the highest ID
SELECT setval('training_modules_id_seq', (SELECT MAX(id) FROM training_modules));

-- ====================================================================
-- NOTE: Due to size limitations, quiz questions and answers are included
-- in a separate section below. Continue reading...
-- ====================================================================

COMMIT;

-- Success message
SELECT 'Training modules successfully migrated to production database!' as status;
