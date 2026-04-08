-- Task #213: Brian Ramirez production account fix
-- Apply employee_code and create user login account for Brian Ramirez (employee ID 18)

-- Step 1: Set employee_code for Brian Ramirez (deterministic — always sets EMP016)
UPDATE employees
SET employee_code = 'EMP016'
WHERE id = 18;

-- Step 2: Create user login account for Brian Ramirez
-- password_hash is a bcrypt hash of a random locked placeholder.
-- Admin must use the "Set Password" UI on employee-detail/18 to grant actual login access.
-- The INSERT is idempotent — no-op if a user already exists for this username or employee.
-- NOTE: The 'password' column is a legacy NOT NULL field present in both dev and production
-- databases (added out-of-band from the migration system). It is set to 'LOCKED' as a
-- placeholder; the password_hash field governs actual authentication.
INSERT INTO users (
  username,
  password,
  password_hash,
  role,
  employee_id,
  is_active,
  can_override_prices,
  failed_login_attempts,
  created_at,
  updated_at
)
SELECT
  'brianr',
  'LOCKED',
  '$2b$12$44nY83TEG/6rNhvrCqcNv.bt1oeZExYfvh5xI/avOjXK81MaDLkN.',
  'EMPLOYEE',
  18,
  true,
  false,
  0,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'brianr' OR employee_id = 18
);

-- Step 3: Post-migration verification
DO $$
DECLARE
  emp_code TEXT;
  user_count INT;
BEGIN
  SELECT employee_code INTO emp_code FROM employees WHERE id = 18;
  IF emp_code IS DISTINCT FROM 'EMP016' THEN
    RAISE EXCEPTION 'Verification failed: employee 18 employee_code is % (expected EMP016)', emp_code;
  END IF;

  SELECT COUNT(*) INTO user_count
  FROM users
  WHERE username = 'brianr'
    AND employee_id = 18
    AND role = 'EMPLOYEE'
    AND is_active = true;
  IF user_count = 0 THEN
    RAISE EXCEPTION 'Verification failed: no active EMPLOYEE user brianr linked to employee_id=18 found';
  END IF;
END $$;
