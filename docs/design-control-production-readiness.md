# Design Control Production-Readiness Assessment

## Conclusion

Final classification: **BLOCKED**.

The application-level Phase 2–12 Design Control implementation has substantial static and unit coverage, but production readiness cannot be certified without a provably isolated PostgreSQL replay and critical database-backed end-to-end, immutability, transaction, concurrency, and artifact tests. Passing source and mock tests is not an AS9100 compliance determination.

## Certification identity

- Tested main commit: `410815d2eab29759f71aff4da3e4f8e0b63bb65c`
- Phase 12 branch: `codex/design-control-production-readiness`
- Host category: local Windows development workstation
- Disposable PostgreSQL database: unavailable
- PostgreSQL certification: **BLOCKED**
- Destruction/reset method: not applicable because no database was created or contacted
- No production, shared development, shared staging, or unidentified database was contacted.

## Delivery inventory

| Area                                |           Main PR |
| ----------------------------------- | ----------------: |
| Design Control authority foundation |             #1520 |
| Authenticated approvals             |             #1521 |
| Controlled form templates           |             #1527 |
| Project Form Instances              |             #1530 |
| Engineering Change Requests         |             #1533 |
| Engineering Change Notices          |             #1534 |
| Controlled printed copies           |             #1544 |
| Design History Files                |             #1545 |
| Unified workspace and QMS oversight |             #1550 |
| Final hardening and assessment      | Phase 12 draft PR |

Post-release release-gating and Engineering Package work is also present on tested main; Git history remains the authoritative commit inventory.

## Authoritative architecture

The intended authoritative chain is:

`rd_projects` → one authoritative `design_control_records` row → revision-bound Design Control step generations → Project Form Instances and authenticated approvals → Engineering Release Revision A → ECR → ECN and targeted reopened steps/V&V → Engineering Release Revision B+ → controlled copies → immutable DHF versions → Engineering Package.

The database has a partial unique index enforcing at most one authoritative Design Control record per non-null R&D project. Historical and superseded records are retained. Current services reject Design Control ownership without an `rd_project_id`; P2 identifiers do not satisfy the R&D project foreign key. Browser-local projects require explicit reconciliation and are not authority.

P2 Projects remain customer-PO/manufacturing records. Design Control evaluates referenced manufacturing readiness evidence but does not own or rewrite P2 workflow state.

## Security and authorization

Phase 12 found and corrected these application-level defects:

1. QMS Design Control read routes were not consistently authenticated.
2. QMS detail, readiness, manufacturing-evidence, release-preview, and oversight reads lacked explicit server capability enforcement.
3. `design.control.create` and `design.control.admin` were referenced by routes but absent from the central capability catalogs.
4. The authorization policy was distributed and not centrally testable.

Corrections:

- authenticate the complete QMS Design Control router;
- require at least one approved read/auditor capability for every QMS read surface;
- fail closed on permission-resolution errors;
- register `design.control.view`, `design.control.create`, and `design.control.admin`;
- add a central action/role authorization matrix;
- preserve server-session actor derivation and existing mutation-specific capability checks.

The public controlled-copy verification response remains deliberately restricted to document identity, lifecycle state, issue time, and a truncated verification identifier. Protected PDFs, retained forms, ECR/ECN artifacts, and DHF downloads remain capability gated.

## Segregation of duties and approval integrity

Existing Phase 2–10 services bind current approvals to record, content revision, checksum, approval slot, signature meaning, authenticated actor snapshots, and timestamp. Material changes create new retained content and invalidate affected approvals. Legacy booleans remain legacy/unverified and cannot satisfy authenticated current release gates.

Source and focused tests cover creator/independent-review restrictions for Design Control steps and Project Form Instances, independent ECR impact review, ECN approval/V&V constraints, release authority, and DHF actor evidence. Database-backed proof of all incompatible-role combinations remains blocked.

## Migration inventory

Design Control migrations on tested main:

- `0207_design_control_authority_foundation.sql`
- `0208_design_control_authenticated_approvals.sql`
- `0211_design_control_form_templates.sql`
- `0213_design_control_project_form_instances.sql`
- `0214_engineering_change_requests.sql`
- `0215_engineering_change_notices.sql`
- `0216_post_release_design_change_gating.sql`
- `0219_controlled_printed_copies.sql`
- `0221_design_history_files.sql`

The repository also contains unrelated numeric filename collisions at 0210 and 0222. Filenames themselves are unique and the safe-boot runner registers migrations by full filename. Phase 12 adds no migration. `0220_p2_v2_production_execution.sql` remains separate and ordered before `0221_design_history_files.sql`.

Static inspection confirms additive/idempotent patterns and explicit safe/critical registration for the Design Control series. Empty-database replay, second-run idempotency, partial-schema recovery, constraints, triggers, privileges, and application boot are not certified without disposable PostgreSQL.

## Legacy reconciliation

Existing admin-gated workflows cover:

- explicit authoritative-record designation and browser-local project review;
- deterministic ECR legacy change reconciliation;
- deterministic ECN/ECO reconciliation;
- legacy controlled-copy distribution reconciliation.

These paths retain source provenance and audit administrative decisions. No Phase 12 code deletes legacy data, invents signatures/checksums, guesses project linkage, auto-releases templates, or auto-approves legacy evidence.

Remaining limitations include a consolidated exportable Quality review queue across all legacy categories, historical releases lacking immutable evidence/predecessors, and legacy DHF limitations. Ambiguous data must remain queued for human review.

## Test and certification results

Safe local certification includes:

- Phase 2–12 focused/static/unit suites: **222 passed, 0 failed** across 13 test files;
- route authorization and central matrix assertions;
- migration registration and P2 separation assertions;
- platform-independent Phase 5 audit assertion;
- scoped formatting, syntax/transpilation, and `git diff --check`;
- direct scoped TypeScript/TSX transpilation: passed;
- `git diff --check`: passed;
- full TypeScript checker: **tooling failure** — it produced no result within the 60-second bound and was stopped; this is not a pass.

PostgreSQL certification: **BLOCKED** because Docker and local PostgreSQL executables are unavailable. Consequently, these required gates are also blocked:

- empty-schema migration replay and second safe-boot run;
- partial-schema and legacy-row recovery;
- live schema-readiness/application boot;
- complete Revision A → ECR → ECN → Revision B lifecycle;
- negative database workflow testing;
- PostgreSQL concurrency and rollback testing;
- database privilege/trigger enforcement;
- retained artifact download/export and manifest verification;
- audit hash-chain recalculation against persisted events;
- browser E2E backed by disposable persisted data.

## Performance assessment

The Phase 11 oversight endpoint is server filtered, paginated, capped at 50 rows, and uses one grouped step-count query rather than a per-project N+1. Project detail queries remain record scoped. Existing ECR, ECN, controlled-copy, and DHF services use scoped identifiers. Live query plans and export peak memory remain uncertified without isolated PostgreSQL and representative disposable data.

## Deployment blockers and rollback

Deployment blockers:

1. successful empty and repeat migration replay on disposable PostgreSQL;
2. successful database-backed Revision A/Revision B lifecycle and negative tests;
3. demonstrated immutable-table privilege/trigger behavior for the application role;
4. artifact/export and audit-chain verification;
5. Quality review of unresolved legacy queues and authorization assignments.

Rollback of Phase 12 application changes is a normal code rollback because no migration or data rewrite is introduced. Do not roll back by deleting Design Control evidence. Any later database correction must be additive, audited, and preserve historical records.
