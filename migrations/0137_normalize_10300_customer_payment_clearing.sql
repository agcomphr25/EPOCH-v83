-- Normalize legacy COA name for the customer payment clearing account.
-- Migration 0124 now seeds 10300 as Customer Payment Clearing, but production
-- may already have applied an earlier 0124 version where 10300 was named
-- Undeposited Funds. This forward migration updates existing databases.

BEGIN;

DO $$
DECLARE
  target_id integer;
  duplicate_id integer;
BEGIN
  SELECT id
    INTO target_id
    FROM chart_of_accounts
   WHERE account_number = '10300'
      OR account_name = 'Undeposited Funds'
   ORDER BY CASE WHEN account_number = '10300' THEN 0 ELSE 1 END, id
   LIMIT 1;

  IF target_id IS NULL THEN
    INSERT INTO chart_of_accounts (
      account_number,
      account_name,
      account_type,
      normal_balance,
      financial_statement_section,
      cost_pool,
      default_allowability,
      default_direct_indirect,
      billing_treatment,
      requires_documentation,
      requires_review,
      system_controlled,
      description,
      is_active
    )
    VALUES (
      '10300',
      'Customer Payment Clearing',
      'ASSET',
      'DEBIT',
      'Current Assets',
      'NONE',
      'ALLOWABLE',
      'UNASSIGNED',
      'NOT_BILLABLE',
      FALSE,
      FALSE,
      FALSE,
      'Individually traceable customer payments awaiting bank reconciliation or settlement matching',
      TRUE
    )
    RETURNING id INTO target_id;
  END IF;

  SELECT id
    INTO duplicate_id
    FROM chart_of_accounts
   WHERE account_name = 'Customer Payment Clearing'
     AND id <> target_id
   LIMIT 1;

  IF duplicate_id IS NOT NULL THEN
    UPDATE journal_lines
       SET account_id = target_id,
           updated_at = NOW()
     WHERE account_id = duplicate_id;

    UPDATE chart_of_accounts
       SET account_name = 'Customer Payment Clearing (Duplicate - inactive)',
           account_number = NULL,
           is_active = FALSE,
           updated_at = NOW()
     WHERE id = duplicate_id;
  END IF;

  UPDATE chart_of_accounts
     SET account_number = '10300',
         account_name = 'Customer Payment Clearing',
         account_type = 'ASSET',
         normal_balance = 'DEBIT',
         financial_statement_section = 'Current Assets',
         cost_pool = 'NONE',
         default_allowability = 'ALLOWABLE',
         default_direct_indirect = 'UNASSIGNED',
         billing_treatment = 'NOT_BILLABLE',
         requires_documentation = FALSE,
         requires_review = FALSE,
         system_controlled = FALSE,
         is_active = TRUE,
         description = 'Individually traceable customer payments awaiting bank reconciliation or settlement matching',
         updated_at = NOW()
   WHERE id = target_id;
END $$;

COMMIT;
