-- Rebuild P2 ledger metadata indexes without redundant partial predicates.
-- PostgreSQL unique indexes permit multiple NULL expression values, so these
-- retain idempotency enforcement while remaining safe for schema provisioning.

DROP INDEX IF EXISTS inventory_ledger_p2_output_receipt_uidx;
DROP INDEX IF EXISTS inventory_ledger_p2_output_reversal_uidx;
DROP INDEX IF EXISTS inventory_ledger_p2_component_issue_uidx;
DROP INDEX IF EXISTS inventory_ledger_p2_component_issue_reversal_uidx;
DROP INDEX IF EXISTS inventory_ledger_p2_cmp_issue_rev_uidx;

CREATE UNIQUE INDEX inventory_ledger_p2_output_receipt_uidx
  ON inventory_transaction_ledger ((metadata->>'p2ManufacturedOutputReceiptKey'));
CREATE UNIQUE INDEX inventory_ledger_p2_output_reversal_uidx
  ON inventory_transaction_ledger ((metadata->>'p2ManufacturedOutputReversalKey'));
CREATE UNIQUE INDEX inventory_ledger_p2_component_issue_uidx
  ON inventory_transaction_ledger ((metadata->>'p2ManufacturedComponentIssueKey'));
CREATE UNIQUE INDEX inventory_ledger_p2_cmp_issue_rev_uidx
  ON inventory_transaction_ledger ((metadata->>'p2ComponentIssueReversalKey'));