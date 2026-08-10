# Controlled Document Source Recovery rollout

Document File Recovery is an additive, preview-first control for attaching exact authoritative bytes to an existing Master Document Register record. It does not replace Phase 1B reconciliation or Phase 2 approval and release.

## Containment

- `CONTROLLED_DOCUMENT_RECOVERY_ENABLED` defaults to disabled. Only the exact lowercase value `true` enables import, execution, and duplicate disposition operations.
- `CONTROLLED_DOCUMENT_RECONCILIATION_ENABLED` and `CONTROLLED_DOCUMENT_PHASE2_APPROVE_RELEASE_ENABLED` remain independently default-disabled.
- Applying migration `0260_controlled_document_source_recovery.sql`, assigning permissions, or exposing the workspace does not activate execution.
- Inventory and preview are read-only with respect to controlled documents, revisions, lifecycle, pointers, approvals, and historical evidence.
- Mutable external URLs and Drive identifiers are sanitized provenance only. Controlled use is served from EPOCH-managed immutable storage.

## Permissions and step-up

Grant the minimum capability required to named Document Control or Quality roles:

- `documents.recovery_view`: view recovery status and inventory.
- `documents.recovery_preview`: create checksum-bound previews.
- `documents.recovery_import`: stage exact immutable bytes; current step-up is required.
- `documents.recovery_execute`: create the selected working or legacy-verified revision; current step-up is required.
- `documents.recovery_disposition`: append a Quality duplicate disposition; current step-up is required.

Do not assign execute or disposition authority broadly. Server middleware enforces every capability; UI visibility grants no authority.

## Pre-activation certification

1. Apply safe-boot migrations in a disposable PostgreSQL 16.4 environment twice.
2. Confirm schema readiness validates every recovery table, column, primary key, foreign key, unique index, check constraint, index, trigger, trigger function, and append-only behavior.
3. Confirm all three controlled-document feature flags are absent or not equal to lowercase `true`.
4. Configure and validate the private managed-storage provider. Confirm upload, exact-byte readback, checksum verification, and compensating delete behavior.
5. Assign the recovery capabilities to named test roles in a non-production environment.
6. Complete browser certification with Document Control, Quality, an independent approver, an ordinary authorized viewer, and an unauthorized user.
7. Obtain Quality and system-owner approval before enabling recovery execution in a prospective deployment.

## Production reconciliation procedure

1. Open Document File Recovery and import the approved source inventory for comparison. Review all filters and blockers; opening inventory changes no controlled record.
2. For a single exact code/title match, create a preview and inspect the document UUID, revision UUID, lifecycle, pointers, source identity, blockers, and exact proposed additions.
3. For duplicates or ambiguity, record an authenticated Quality disposition selecting the authoritative record and all related UUIDs. Preserve every historical record and attach supporting evidence.
4. Upload the exact authoritative PDF or immutable image. EPOCH calculates SHA-256, stages the object under a unique managed identity, reads it back, and compares the exact bytes before marking it staged.
5. Recheck the displayed observed and stored checksums. Stop on any mismatch, stale preview, changed source, missing object, pointer conflict, or cross-document association.
6. When adequate confirmed Phase 1B legacy approval evidence exists, execute the legacy path. EPOCH creates a new `LEGACY_MIGRATION_VERIFIED` revision without representing it as a new electronic approval and preserves the original revision and reference.
7. Otherwise execute the current-workflow path. EPOCH creates a new immutable working revision and leaves it unreleased until an independent authorized actor completes Phase 2 Approve and Release.
8. Verify an ordinary authorized user can View and Download the exact released revision. Confirm denied and missing-object access events are present in the audit ledger.

No spreadsheet label, mutable URL, legacy path, or recovered file by itself authorizes release.

## Staging and abandoned objects

Object storage cannot participate in the database transaction. Upload therefore reserves an import, writes a uniquely named staged object, reads the object back, verifies its checksum, and only then records `STAGED` plus immutable evidence in one database transaction. A failed finalization attempts compensating deletion. If deletion fails, the import is marked `CLEANUP_REQUIRED` with the private object identity retained for an authorized cleanup procedure. Never infer that a database rollback removed an object.

## Rollback and containment

The operational rollback is to remove or set `CONTROLLED_DOCUMENT_RECOVERY_ENABLED` to anything other than lowercase `true`. This immediately contains new imports, executions, and dispositions while preserving inventory visibility for authorized review.

Do not down-migrate by deleting tables or evidence. Migration 0260 is additive and does not update or delete historical rows. Staged imports and append-only recovery evidence must remain for audit. If code rollback is required, leave the migration applied and the feature disabled.

## Historical-data guarantee

Recovery never overwrites or deletes an existing document, revision, number, file reference, approval identity/date, lifecycle event, audit record, or operational reference. The current-workflow path adds a new draft revision. The legacy path adds a new verified revision only after confirmed Phase 1B evidence and records `electronicApproval: false`. Existing released pointers change only through an explicit, authorized legacy execution or the independent Phase 2 approval transaction.
