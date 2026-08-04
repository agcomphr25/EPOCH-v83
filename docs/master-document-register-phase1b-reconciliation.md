# Master Document Register Phase 1B reconciliation

Phase 1B is preview-first. Inventory assessment reads exact available bytes but does not mutate controlled-document records. Only records classified `LEGACY_AUTO_RECONCILIATION_ELIGIBLE` can enter an execution preview. Execution requires the dedicated capability, the preview ID and hash, the exact selected IDs, a reason, and an acknowledgement that migrated evidence is not a new electronic approval.

## Proposed production procedure

1. Obtain change approval and assign named Quality users only the minimum reconciliation capabilities required for their task.
2. Confirm migration `0245_controlled_document_legacy_reconciliation.sql` has completed and preserve a database backup.
3. Run inventory and export/review every classification. Do not execute from the inventory operation.
4. Resolve number, revision, file, and approval-evidence blockers through Quality review. Immutable historical uploads are retained as append-only evidence and do not silently replace legacy references.
5. Select deterministic records, inspect every proposed field addition, create a preview, and obtain the required authorization.
6. Execute before preview expiry. Re-run inventory and reconcile the append-only event count to the approved selection.
7. Revoke temporary execute/resolve grants when the authorized window closes.

## Rollback

Before any production execution, rollback is simply to stop: previews do not change controlled documents. If an execution must be reversed, do not delete its event or historical evidence. Use a separately authorized compensating migration that restores fields from `original_snapshot`, appends a compensating audit event, and preserves the original `LEGACY_MIGRATION_VERIFIED` event. The schema migration itself is additive; dropping its tables would destroy audit evidence and is therefore not an operational rollback.
