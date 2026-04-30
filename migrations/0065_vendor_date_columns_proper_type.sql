-- Task #1271: Fix vendor date columns to be proper date types
-- The vendors table has three date columns (evaluation_date, start_renewal_date,
-- approval_expiration) that may have been stored as text.
--
-- Strategy per column (only when column data_type is still 'text'):
--   1. Scan all non-null rows and attempt col::DATE inside a per-row exception
--      handler; any un-castable value (empty string, partial date, invalid
--      calendar date like 2024-13-40, etc.) is set to NULL to prevent the
--      ALTER TABLE USING clause from aborting.
--   2. ALTER TABLE ... TYPE DATE USING col::DATE — safe because step 1 has
--      already nulled out every un-castable value.
--
-- Idempotent: skips each column that is already DATE.
-- Uses EXECUTE for ALTER TABLE so PostgreSQL does not type-check the USING
-- expression against a column that is already DATE on repeated runs.
--
-- OPERATIONAL NOTE: Any vendor rows that contained malformed date strings
-- (e.g. empty strings, partial dates, invalid calendar dates) will have those
-- fields set to NULL, and a NOTICE message is emitted per affected row.
-- After first deploy you can verify how many rows were affected with:
--   SELECT COUNT(*) FROM vendors WHERE evaluation_date IS NULL;
--   SELECT COUNT(*) FROM vendors WHERE start_renewal_date IS NULL;
--   SELECT COUNT(*) FROM vendors WHERE approval_expiration IS NULL;

DO $$
DECLARE
  col_type  text;
  r         RECORD;
BEGIN

  -- ── evaluation_date ────────────────────────────────────────────────────────
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'vendors'
    AND column_name  = 'evaluation_date';

  IF col_type = 'text' THEN
    FOR r IN SELECT id, evaluation_date AS val FROM public.vendors
             WHERE evaluation_date IS NOT NULL LOOP
      BEGIN
        PERFORM r.val::date;
      EXCEPTION WHEN others THEN
        UPDATE public.vendors SET evaluation_date = NULL WHERE id = r.id;
        RAISE NOTICE 'Nulled un-castable evaluation_date "%" on vendor id %', r.val, r.id;
      END;
    END LOOP;
    EXECUTE $sql$
      ALTER TABLE public.vendors
        ALTER COLUMN evaluation_date TYPE DATE USING evaluation_date::DATE
    $sql$;
    RAISE NOTICE 'Converted evaluation_date from text to date';
  END IF;

  -- ── start_renewal_date ────────────────────────────────────────────────────
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'vendors'
    AND column_name  = 'start_renewal_date';

  IF col_type = 'text' THEN
    FOR r IN SELECT id, start_renewal_date AS val FROM public.vendors
             WHERE start_renewal_date IS NOT NULL LOOP
      BEGIN
        PERFORM r.val::date;
      EXCEPTION WHEN others THEN
        UPDATE public.vendors SET start_renewal_date = NULL WHERE id = r.id;
        RAISE NOTICE 'Nulled un-castable start_renewal_date "%" on vendor id %', r.val, r.id;
      END;
    END LOOP;
    EXECUTE $sql$
      ALTER TABLE public.vendors
        ALTER COLUMN start_renewal_date TYPE DATE USING start_renewal_date::DATE
    $sql$;
    RAISE NOTICE 'Converted start_renewal_date from text to date';
  END IF;

  -- ── approval_expiration ───────────────────────────────────────────────────
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'vendors'
    AND column_name  = 'approval_expiration';

  IF col_type = 'text' THEN
    FOR r IN SELECT id, approval_expiration AS val FROM public.vendors
             WHERE approval_expiration IS NOT NULL LOOP
      BEGIN
        PERFORM r.val::date;
      EXCEPTION WHEN others THEN
        UPDATE public.vendors SET approval_expiration = NULL WHERE id = r.id;
        RAISE NOTICE 'Nulled un-castable approval_expiration "%" on vendor id %', r.val, r.id;
      END;
    END LOOP;
    EXECUTE $sql$
      ALTER TABLE public.vendors
        ALTER COLUMN approval_expiration TYPE DATE USING approval_expiration::DATE
    $sql$;
    RAISE NOTICE 'Converted approval_expiration from text to date';
  END IF;

END $$;
