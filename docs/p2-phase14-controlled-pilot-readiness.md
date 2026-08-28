# P2 controlled activation and pilot readiness

Status: **NOT READY FOR CONTROLLED PILOT**

Production activation: prohibited
Certified starting tree: `e094936fe5692f32c7d4dfceaf7d19a9766b123e`

This Phase 14 control package connects the existing Phase 1-13 authorities. It creates no new production authority, database table, migration, backfill, or automatic activation path. All committed feature settings remain disabled by default.

## Feature dependency matrix

The executable matrix is `P2_ACTIVATION_FLAGS` in `server/src/services/p2ControlledActivationService.ts`. The server evaluates exact lowercase `true`; any other value is disabled. A paired client setting never grants authority. A mismatch or an enabled child with a disabled prerequisite blocks readiness.

| Workflow capability      | Prerequisite chain                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Departments and routings | Department reads -> controlled administration; Inventory Item routing identity -> routing Department identity |
| Traceability and BOM     | Traceability reads -> policy writes; controlled BOM reads -> BOM writes -> project BOM integration            |
| Project configuration    | Project BOM integration -> controlled configuration reads -> controlled writes                                |
| WAD decisions            | Released configuration -> WAD reads -> WAD writes                                                             |
| Frozen demand            | Configuration + WAD reads -> demand reads -> compile -> release                                               |
| Work orders and queues   | Released demand -> queue reads -> materialization -> execution                                                |
| Travelers                | Materialized work orders + WAD reads -> traveler provisioning                                                 |
| Receiving identities     | Traceability policy reads -> Receiving barcode identities                                                     |
| Material control         | Travelers + Receiving identities -> material reads -> issue/consumption writes                                |
| Manufactured output      | Material evidence -> output reads -> completion writes -> custody reads/writes                                |
| Parent component issue   | Custody reads -> genealogy reads; custody writes -> issue writes                                              |
| Quality and shipment     | Custody reads -> Quality/shipment reads; custody writes -> acceptance/release writes                          |
| Genealogy viewer         | Material + component + Quality reads -> genealogy search and exports                                          |

Phase 14 readiness itself is separately gated by `P2_CONTROLLED_ACTIVATION_READINESS_ENABLED` and `VITE_P2_CONTROLLED_ACTIVATION_READINESS_ENABLED`. Those settings expose only a read-only status view.

## End-to-end workflow map

1. Select the customer PO and project in P2 Control Center.
2. Review released configuration, assembly tree, controlled BOMs, routings, Departments, and WAD decisions.
3. Compile and independently release frozen demand; calculate controlled net demand.
4. Materialize work orders and verify each Department queue.
5. Provision individual or batch travelers from the released WAD decision.
6. Receive identified material, reserve and issue it to the correct work order, then scan and consume it.
7. Complete manufactured output and atomically post custody receipt.
8. Issue a manufactured subcomponent to its parent and retain multilevel genealogy.
9. Record independent Quality acceptance, establish shipment eligibility, then review/export genealogy evidence.

At each stage the UI must show ready/blocked state, the reason, and the correction location. A blocked stage must not be bypassed by navigation or client state.

## Synthetic pilot fixture

The disposable pilot must use generated identities only: one project and PO line; a multilevel BOM; purchased material; serialized and batch-controlled manufactured components; multiple Departments; individual and batch travelers; custody, reservation, issue, consumption, manufactured receipt, parent issue, Quality acceptance, shipment eligibility, and genealogy exports.

For every step the certification record must capture authenticated actor, capability, starting state, action, expected and actual result, evidence, ledger effect, genealogy effect, failure behavior, and retry behavior. Negative cases cover unauthenticated/unauthorized, incomplete, stale, duplicate, over-issued, over-consumed, mismatched, and out-of-sequence requests.

## Pilot-readiness checklist

- [x] Exact certified Phase 13 main is the Phase 14 base.
- [x] No migration, backfill, production data, or new authority is required.
- [x] All flags remain exact-opt-in and disabled by default.
- [x] Server authorization remains authoritative when the client is misconfigured.
- [x] Dependency and client/server mismatch evaluation fails closed.
- [x] Existing immutable ledgers remain quantity and genealogy authority.
- [ ] Authorized user acceptance test completed in an isolated pilot environment.
- [ ] Every operational role has current training and assigned capability evidence.
- [ ] Pilot owner, exact PO scope, quantities, expiration, and rollback owner are independently approved.
- [ ] Browser walkthrough confirms every correction link reaches the authoritative source screen.
- [ ] Final combined-tree Phase 14 and complete P2 V2 certifications are attached to the authorization.

## User acceptance checklist

For each of the 20 workflow actions, record actor ID (never typed name), required capability, selected PO/project, visible readiness, blocker text, correction destination, authoritative revision, expected and actual quantities, created immutable evidence, retry result, and reviewer signature. Verify keyboard navigation, empty/error states, narrow screens, CSV content, JSON content, and that audit details—not the normal workflow—contain technical identifiers and checksums.

## Rollback and flag-disable procedure

1. Stop the pilot and record the reason and affected identities.
2. Set all Phase 1-14 server and client pilot settings to disabled; restart/redeploy through the controlled configuration process.
3. Confirm write APIs return feature-disabled responses and hidden controls are absent.
4. Preserve all valid ledgers, approvals, genealogy, Quality, shipment, and audit evidence.
5. Reverse only through existing compensating services; never delete or rewrite historical records.
6. Reconcile quantities and evidence, close the issue, re-certify, and require a revised authorization before resuming.

## Remaining prioritized blockers

1. **Required:** complete the disposable end-to-end Phase 14 certification on the exact final tree.
2. **Required:** perform role-based browser UAT with synthetic identities and record actual results for all 20 actions.
3. **Required:** independently approve pilot scope, participants, training, expiration, and rollback owner.
4. **Required:** verify every plain-language blocker links to the correct authoritative editing surface.
5. **Before production consideration:** conduct a separate security/change-control review and explicit production activation authorization.

Until all required items are closed, the authoritative recommendation remains **NOT READY FOR CONTROLLED PILOT**.
