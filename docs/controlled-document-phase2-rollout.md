# Master Document Register Phase 2 rollout

Phase 2 is prospective and default-disabled. Migration `0256_controlled_document_atomic_approval_release.sql` creates append-only approval/release evidence and permits the prospective `REJECTED` revision state; it does not update controlled documents or activate the workflow.

## Activation authorization

1. Apply and certify migration 0256 in a non-production PostgreSQL environment, including replay and rollback-on-failure checks.
2. Assign `documents.approve` only to authorized independent approvers. Approval also requires a current step-up session; UI visibility is not authorization.
3. Verify immutable managed-file storage, checksum validation, current-revision pointers, access grants, and allowed/denied access logging.
4. Obtain Quality and system-owner approval before setting `CONTROLLED_DOCUMENT_PHASE2_APPROVE_RELEASE_ENABLED=true` in a prospective deployment.
5. Confirm legacy reconciliation remains disabled (`CONTROLLED_DOCUMENT_RECONCILIATION_ENABLED` must not be `true`).

## Containment and rollback

Unset the Phase 2 flag to return to the pre-existing Submit/Approve/Release compatibility workflow. Do not delete evidence or reverse released records. The 0256 table and its append-only history remain in place. Database rollback is schema-only and is permitted only before Phase 2 evidence exists; after evidence exists, use a forward corrective migration.

## Historical preservation

No historical document, revision, lifecycle event, approval, identifier, link, timestamp, traveler, work order, or production reference is rewritten. Existing released revisions remain served through the hardened released-revision routes. Legacy ambiguity remains governed by the separately default-disabled Phase 1B reconciliation workflow.
