-- Migration: 0080_link_users_to_employees.sql
-- Purpose: One-time data repair — link existing unlinked user accounts to employee records.
-- Strategy:
--   1. Exact email match (users.email = employees.email, case-insensitive).
--   2. Fuzzy name match: compare users.first_name + users.last_name to the
--      first/last components of employees.name. Only auto-link when there is
--      exactly ONE unambiguous match; skip ambiguous cases with a NOTICE.
--   3. Username pattern match: username = lower(first_name) + lower(last_initial),
--      e.g. "angiet" → Angie Tandy. Only links on exact, unambiguous matches.
-- Idempotent: only touches rows where users.employee_id IS NULL.
-- Safe: will never link a user to an employee that is already claimed by another active user.

DO $$
DECLARE
  rec             RECORD;
  match_count     INTEGER;
  matched_emp_id  INTEGER;
  linked_email    INTEGER := 0;
  linked_name     INTEGER := 0;
  linked_username INTEGER := 0;
BEGIN

  -- ── Step 1: Exact email match ──────────────────────────────────────────────
  UPDATE users u
  SET employee_id = e.id,
      updated_at  = NOW()
  FROM employees e
  WHERE u.employee_id IS NULL
    AND u.is_active   = true
    AND e.is_active   = true
    AND u.email IS NOT NULL AND u.email <> ''
    AND e.email IS NOT NULL AND e.email <> ''
    AND lower(trim(u.email)) = lower(trim(e.email))
    -- Guard: employee must not already be linked to a different active user
    AND NOT EXISTS (
      SELECT 1 FROM users u2
      WHERE u2.employee_id = e.id AND u2.is_active = true AND u2.id <> u.id
    );

  GET DIAGNOSTICS linked_email = ROW_COUNT;
  IF linked_email > 0 THEN
    RAISE NOTICE '[0080] Linked % user(s) to employees via email match.', linked_email;
  END IF;

  -- ── Step 2: First + last name match ───────────────────────────────────────
  -- Only consider users that are still unlinked after the email pass and have
  -- first_name + last_name populated.
  FOR rec IN
    SELECT id, username, first_name, last_name
    FROM users
    WHERE employee_id IS NULL
      AND is_active = true
      AND first_name IS NOT NULL AND first_name <> ''
      AND last_name  IS NOT NULL AND last_name  <> ''
  LOOP
    -- Count active employees whose first word matches first_name and last word
    -- matches last_name (case-insensitive), not already linked to another user.
    SELECT COUNT(*), MAX(e.id)
    INTO   match_count, matched_emp_id
    FROM   employees e
    WHERE  e.is_active = true
      AND  lower(trim(split_part(trim(e.name), ' ', 1))) = lower(trim(rec.first_name))
      AND  lower(trim(
             regexp_replace(trim(e.name), '^.*\s', '')
           )) = lower(trim(rec.last_name))
      AND NOT EXISTS (
        SELECT 1 FROM users u2
        WHERE u2.employee_id = e.id AND u2.is_active = true
      );

    IF match_count = 1 THEN
      UPDATE users
      SET employee_id = matched_emp_id,
          updated_at  = NOW()
      WHERE id = rec.id;

      linked_name := linked_name + 1;

    ELSIF match_count > 1 THEN
      RAISE NOTICE '[0080] Ambiguous name match for user "%" (id=%): % employees match — skipping.',
        rec.username, rec.id, match_count;
    END IF;
  END LOOP;

  IF linked_name > 0 THEN
    RAISE NOTICE '[0080] Linked % user(s) to employees via name match.', linked_name;
  END IF;

  -- ── Step 3: Username pattern match ────────────────────────────────────────
  -- Match username = lower(first word of employee name) + lower(first char of last word).
  -- Example: "angiet" → "angie" + "t" → Angie Tandy.
  -- Only links when there is exactly ONE unambiguous match.
  FOR rec IN
    SELECT id, username
    FROM users
    WHERE employee_id IS NULL
      AND is_active = true
      AND username IS NOT NULL AND username <> ''
  LOOP
    SELECT COUNT(*), MAX(e.id)
    INTO   match_count, matched_emp_id
    FROM   employees e
    WHERE  e.is_active = true
      AND  (
        lower(trim(split_part(trim(e.name), ' ', 1)))
        || lower(left(trim(regexp_replace(trim(e.name), '^.*\s', '')), 1))
      ) = lower(rec.username)
      AND NOT EXISTS (
        SELECT 1 FROM users u2
        WHERE u2.employee_id = e.id AND u2.is_active = true
      );

    IF match_count = 1 THEN
      UPDATE users
      SET employee_id = matched_emp_id,
          updated_at  = NOW()
      WHERE id = rec.id;

      linked_username := linked_username + 1;
      RAISE NOTICE '[0080] Linked user "%" (id=%) to employee_id=% via username pattern.',
        rec.username, rec.id, matched_emp_id;

    ELSIF match_count > 1 THEN
      RAISE NOTICE '[0080] Ambiguous username match for user "%" (id=%): % employees match — skipping.',
        rec.username, rec.id, match_count;
    END IF;
  END LOOP;

  IF linked_username > 0 THEN
    RAISE NOTICE '[0080] Linked % user(s) to employees via username pattern match.', linked_username;
  END IF;

  RAISE NOTICE '[0080] Migration complete. Email: %, Name: %, Username: %.', linked_email, linked_name, linked_username;

END $$;
