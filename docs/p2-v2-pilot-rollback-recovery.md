# P2 V2 controlled-pilot rollback and recovery

Version: 1.0
Control boundary: Phase 10B pilot framework
Activation boundary: Pilot activation awaiting authorization

This runbook governs a specifically authorized `p2_v2` pilot. It never authorizes deletion or rewriting of valid manufacturing, inspection, release, shipping, delivery, closing, or audit evidence. Every recovery action requires authenticated capability enforcement, explicit meaning, an idempotency key, and a pilot event.

| Point reached                            | Immediate containment                                                        | Controlled recovery                                                                                                              | Evidence retained                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Before Production Launch                 | Pause or cancel the pilot; keep global launch disabled                       | Correct readiness, training, authorization scope, or upstream revisions; create a new authorization revision if scope changed    | Pilot draft, approvals, readiness results, issues, audit history |
| After launch, before production activity | Pause pilot and place production hold                                        | Void or supersede unused production authorization through existing controlled services; never delete generated orders            | Launch, production orders, authorization, hold, audit            |
| After production activity                | Pause pilot; hold affected project, parts, orders, travelers, and quantities | Use NCR, disposition, controlled cancellation, or supersession. Reconcile WIP and material traceability before resuming          | Travelers, labor, material/lot, serialized units, holds, NCRs    |
| After Product Release                    | Place Product Release and shipping holds                                     | Use controlled release hold, approved disposition, supersession, or replacement release; do not alter immutable release identity | Inspection, approvals, Product Release, allocations, holds       |
| After shipment authorization             | Place shipping hold or void an unconfirmed authorization                     | Reconcile allocations and issue a new authorization after correction                                                             | Authorization, allocations, package and document manifest        |
| After physical shipment                  | Pause downstream actions and record delivery exception                       | Use return, containment, customer notification, NCR/deviation, and replacement-shipment controls                                 | Shipment confirmation, tracking, packing evidence, exception     |
| After delivery                           | Record delivery exception and corrective action                              | Reconcile POD, customer acceptance, returns, replacement, and quantity balance                                                   | Delivery/POD, exception, customer evidence, reconciliation       |
| After project closing                    | Use controlled reopening only                                                | Reopen with reason and owner, create a new closeout review, reconcile corrections, and reapprove                                 | Original closeout, reopening event, new review and approvals     |

## Required sequence

1. Record a pilot issue and classify severity/category.
2. Critical or major issues pause consequential pilot actions automatically.
3. Place the applicable existing P2 hold; never bypass a workflow gate to continue.
4. Identify authoritative affected records and exact revisions.
5. Document containment, root cause, corrective action, and retest evidence.
6. Obtain formal issue-closure approval.
7. Re-evaluate pilot readiness, training, scope hash, revisions, holds, and expiration.
8. Only the designated rollout owner may resume an authorized, unexpired pilot.

## Revision invalidation

Changes to environment, project, workflow instance/version, PO or PO line, part, quantity, configuration baseline, production plan, WAD, or required participants invalidate the authorization. Approved scope is immutable; the recovery path is a controlled revised authorization, not direct mutation.

## Prohibited recovery actions

- deleting production, quality, shipping, delivery, closing, or audit records;
- backfilling or rewriting `NULL` or `legacy_v1` workflow versions;
- modifying Design Control, Design Projects, ECR, or ECN records;
- enabling global `p2_v2` creation or Production Launch configuration;
- changing shared, staging, Neon, Replit, or production databases during certification;
- using client-submitted roles, display names, usernames, or boolean fields as approval authority.
