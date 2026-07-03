-- Normalize account 10300 naming now that customer receipts use it as a
-- payment clearing account ahead of bank reconciliation/settlement matching.
UPDATE chart_of_accounts
   SET account_name = 'Customer Payment Clearing',
       account_type = 'ASSET',
       normal_balance = 'DEBIT',
       financial_statement_section = 'Current Assets',
       cost_pool = 'NONE',
       default_allowability = 'ALLOWABLE',
       default_direct_indirect = 'UNASSIGNED',
       billing_treatment = 'NOT_BILLABLE',
       description = 'Individually traceable customer payments awaiting bank reconciliation or settlement matching',
       is_active = TRUE,
       updated_at = NOW()
 WHERE account_number = '10300';

