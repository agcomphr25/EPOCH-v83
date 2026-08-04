# Controlled Document Reconciliation Certification Hold

Phase 1B reconciliation remains unavailable by default. Do not grant reconciliation capabilities, set `CONTROLLED_DOCUMENT_RECONCILIATION_ENABLED=true`, or run inventory, preview, execution, evidence, upload, or resolution operations in production until the corrective change has been independently reviewed and PostgreSQL-certified.

## Forward recovery

1. Apply the already-merged `0245_controlled_document_legacy_reconciliation.sql`.
2. Apply additive `0251_controlled_document_reconciliation_certification_controls.sql`.
3. Verify every required table, column, index, and append-only trigger with the schema-readiness check.
4. Run path-security, authorization, stale-preview, idempotency, transaction, and disposable PostgreSQL concurrency tests.
5. Obtain explicit Quality and production-change authorization before granting capabilities or enabling the exact `true` flag.
6. Run inventory and preview first; retain the approved preview evidence before any separately authorized execution.

## Compensating rollback

Do not reverse migration `0245`, delete evidence, or remove historical fields. To contain Phase 1B, unset the feature flag (or set any value other than exact lowercase `true`) and revoke reconciliation capabilities. If `0249` cannot be certified, leave its additive columns and index in place; they are inert while the feature is disabled. Correct forward with a later additive migration. Never drop append-only evidence or rewrite controlled-document, traveler, work-order, production, routing, project, or form history.
