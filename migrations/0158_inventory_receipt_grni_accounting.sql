-- Seed the GRNI clearing account used by vendor PO receipt accruals.
-- Receipt posting: Dr Inventory - Raw Materials / Cr GRNI - Received Not Invoiced.
BEGIN;

DO $$
DECLARE
  target_id integer;
  duplicate_id integer;
BEGIN
  SELECT id
    INTO target_id
    FROM chart_of_accounts
   WHERE account_number = '21100'
      OR account_name = 'GRNI - Received Not Invoiced'
   ORDER BY CASE WHEN account_number = '21100' THEN 0 ELSE 1 END, id
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
      '21100',
      'GRNI - Received Not Invoiced',
      'LIABILITY',
      'CREDIT',
      'Current Liabilities',
      'NONE',
      'ALLOWABLE',
      'UNASSIGNED',
      'NOT_BILLABLE',
      TRUE,
      FALSE,
      TRUE,
      'Goods received not invoiced / received-not-vouchered clearing liability for inventory receipts awaiting vendor bill match',
      TRUE
    )
    RETURNING id INTO target_id;
  END IF;

  SELECT id
    INTO duplicate_id
    FROM chart_of_accounts
   WHERE account_name = 'GRNI - Received Not Invoiced'
     AND id <> target_id
   LIMIT 1;

  IF duplicate_id IS NOT NULL THEN
    UPDATE journal_lines
       SET account_id = target_id,
           updated_at = NOW()
     WHERE account_id = duplicate_id;

    UPDATE chart_of_accounts
       SET account_name = 'GRNI - Received Not Invoiced (Duplicate - inactive)',
           account_number = NULL,
           is_active = FALSE,
           updated_at = NOW()
     WHERE id = duplicate_id;
  END IF;

  UPDATE chart_of_accounts
     SET account_number = '21100',
         account_name = 'GRNI - Received Not Invoiced',
         account_type = 'LIABILITY',
         normal_balance = 'CREDIT',
         financial_statement_section = 'Current Liabilities',
         cost_pool = 'NONE',
         default_allowability = 'ALLOWABLE',
         default_direct_indirect = 'UNASSIGNED',
         billing_treatment = 'NOT_BILLABLE',
         requires_documentation = TRUE,
         requires_review = FALSE,
         system_controlled = TRUE,
         is_active = TRUE,
         description = 'Goods received not invoiced / received-not-vouchered clearing liability for inventory receipts awaiting vendor bill match',
         updated_at = NOW()
   WHERE id = target_id;
END $$;

COMMIT;
