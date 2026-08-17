# Roles, Permissions, Responsibilities, Certifications and Authorizations — Repository Audit

## Executive summary

Production employee results are **not established**. No production database was accessed. Active-employee, linkage, legacy-compatibility, evidence-gap, separation-of-duties, administrative-bypass and future-access-loss counts remain not established until `scripts/audit/production-access-audit.sql` is executed read-only against the authorized production database.

The repository has three overlapping access models:

1. Legacy `users.role` and role allowlists.
2. Capability resolution through `perm_roles`, `perm_role_capabilities`, `perm_user_overrides`, and optional `perm_user_capability_scopes`.
3. Workflow-specific competence/authority evidence, including Design Control assignments and approvals, WAD/project release records, legacy P2 certifications, and the Training-owned Certification & Authorization Matrix.

They are not yet a single authoritative policy. `requirePermission` and `userHasScopedCapability` allow ADMIN/OWNER bypasses. New authenticated Design Control approval code rejects ADMIN/OWNER as controlled approvers and requires an employee-linked assigned identity. The prospective certification enforcement service is server-side but disabled unless `CERTIFICATION_AUTHORIZATION_ENFORCEMENT` is exactly `true`; the database flag named `prospective_enforcement` is default-false but is not read by that service. This two-source flag model is a configuration-drift risk.

## Current permission resolution

- Role capabilities are loaded by matching `users.role` to `perm_roles.name`.
- `allow` overrides add capabilities; `deny` overrides remove them.
- Resolution errors return an empty permission set.
- Scoped grants support GLOBAL, DEPARTMENT and PROJECT. When no scope row exists, a role/override capability is treated as global.
- ADMIN/OWNER bypass capability and scope checks in central middleware/service code.
- UI route gating is supplementary and is not treated as enforcement evidence.

## Controlled-action server enforcement

| Workflow/action                           | Current server mechanism                                                     | Authority evidence                                                      | Finding                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Work/traveler start                       | Traveler gate plus optional `WORK` authorization                             | Active matrix record only when environment enforcement flag is on       | Disabled flag preserves legacy behavior; competence not globally enforced.                    |
| QC Inspection                             | Workflow-specific Quality routes and legacy permissions vary                 | `QC_INSPECTION` exists in matrix                                        | No demonstrated universal matrix call across every QC route.                                  |
| Routing Release                           | Capability/workflow checks; prospective service supports `ROUTING_RELEASE`   | Matrix type exists                                                      | Repository-wide adoption incomplete.                                                          |
| Final QC                                  | Existing Quality workflow records                                            | `FINAL_QC` exists in matrix                                             | Prospective service type exists but use action enum has no distinct FINAL_QC snapshot action. |
| Final Product Release                     | Project Quality Release service plus prospective authorization call          | Employee-linked active scoped `FINAL_PRODUCT_RELEASE` when enabled      | Strongest current matrix integration; production state unverified.                            |
| CoC approval                              | Capability/workflow routes vary; prospective service supports `COC_APPROVAL` | Active matrix record when caller invokes service                        | No proof of universal route coverage.                                                         |
| Design Review / Verification / Validation | Version-bound authenticated Design Control approvals                         | Assigned linked employee, required capability, current content checksum | Strong fail-closed path; legacy typed approval values explicitly do not satisfy it.           |
| Design Authority                          | Design assignment/approval services                                          | Employee-linked assignment and required capability                      | ADMIN/OWNER approval bypass explicitly forbidden in candidate validation.                     |
| Engineering Release                       | Engineering release service and authenticated actor snapshot                 | Capability and workflow evidence                                        | Must remain distinct from product release.                                                    |
| ECR / ECN                                 | Dedicated services/routes and approval functions                             | Capability snapshots and authenticated actors                           | Repository inventory records exact call sites.                                                |
| Technical/configuration review            | Project technical review route/service                                       | Project workflow approvals                                              | Capability and exact workflow state are server checked.                                       |
| WAD approval                              | Project WAD authorization route/service                                      | Released WAD revision and approval snapshot                             | Work authorization is not QC/product-release authority.                                       |
| Quality hold / release                    | Project Quality Release and Quality Action services                          | Workflow records and capabilities                                       | ADMIN bypass remains a concern wherever central middleware alone is used.                     |
| Supplier approval                         | Purchasing/vendor routes and capabilities                                    | Supplier workflow records                                               | Role-only and capability-only paths require production/configuration comparison.              |
| Controlled documents                      | Lifecycle/reconciliation/recovery services plus permissions                  | Authenticated lifecycle approvals and audit events                      | Central permission middleware still grants ADMIN/OWNER capability bypass.                     |
| Calibration / NCR / CAPA                  | Quality routes/services and seeded capabilities                              | Workflow-specific records                                               | Capability does not itself prove competence or formal authority.                              |
| Internal audit                            | Audit routes and role/capability controls                                    | Audit records                                                           | Sensitive employee-authority detail access needs explicit least-privilege verification.       |
| Shipping confirmation                     | Shipping/project closeout rules and allocation evidence                      | Released allocation and authenticated actor                             | Shipping must not be interpreted as product release or hold-release authority.                |

Exact static references are in `generated/server-enforcement-inventory.csv`; capability references are in `generated/capability-inventory.csv`.

## Feature-flag compatibility truth table

| DB `prospective_enforcement` | Environment `CERTIFICATION_AUTHORIZATION_ENFORCEMENT` | Observed service behavior                            | Compatibility conclusion                                                           |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| false                        | absent/false                                          | Authorization service returns without checking       | Current behavior preserved.                                                        |
| true                         | absent/false                                          | Authorization service still returns without checking | Database flag alone does not activate enforcement. Configuration disagreement.     |
| false                        | true                                                  | Authorization service enforces                       | Environment can activate despite DB flag false. Unsafe split-brain configuration.  |
| true                         | true                                                  | Authorization service enforces                       | Prospective enforcement active; prohibited in this task.                           |
| absent/unknown               | absent/false                                          | Service does not enforce                             | Runtime behavior preserved, governance state unknown.                              |
| absent/unknown               | true                                                  | Service enforces                                     | Fail-closed checks apply, but governance authorization for activation is unproven. |

## Gap report

- Documentation-only: legacy roles, general training and workflow authority are not documented as one explainable decision chain.
- Employee/user linkage: production result not established; schema permits nullable `users.employee_id`.
- Permission: production result not established; authority-without-permission must be computed later.
- Authorization evidence: matrix coverage is not universal and production records were not inspected.
- Scope: central scopes cover department/project only; the authorization matrix separately models program, part, family, department and operation. Project is absent from the matrix schema/service query.
- UI/usability: current pages are separate; unified workspace is intentionally not implemented.
- Runtime enforcement: mixed role allowlists, capabilities, scopes and workflow services; not all controlled actions call the matrix service.
- Separation of duties: Design Control has explicit independence controls; other workflows vary. Production conflicts not established.
- Administrative bypass: central permission and scope layers bypass ADMIN/OWNER; controlled Design approval correctly rejects that inference.
- Data migration: numeric-prefix duplication is deterministic, but safe-boot replay and actual production hash history need separate evidence.

## Proposed role templates (design only; never assigned)

Each template below is a capability bundle plus separately approved authority prerequisites. A template never supplies controlled authority.

| Template                               | Capability emphasis                             | Separate authority/evidence required                                   |
| -------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| President / Owner                      | Governance and administration                   | Controlled technical/Quality authority only by explicit authorization  |
| VP Operations                          | Operational readiness and production governance | Manufacturability/operations approval record                           |
| EVP / Design Governance                | Design program governance                       | Explicit Design Authority assignment                                   |
| QMS Management Representative          | QMS, audit, CAPA oversight                      | Quality approvals explicitly assigned                                  |
| Engineering Manager / Design Authority | Engineering release/change control              | Design Authority and Engineering Release evidence                      |
| Design Engineer                        | Design authoring and review participation       | Assigned project/approval slot; independence where required            |
| P2 Project Manager                     | Project coordination and requirements           | No inferred Engineering or Quality authority                           |
| Production Manager                     | Production planning/readiness                   | No inferred QC or product-release authority                            |
| Manufacturing / Process Engineer       | Routing/process definition                      | Explicit Routing Release when applicable                               |
| Quality Manager / Lead                 | Quality system and review                       | Separate QC, Final QC, release, CoC and hold authorities as applicable |
| Quality Inspector                      | Inspection execution                            | Current QC Inspection scope and competence                             |
| Authorized Product Releaser            | Product-release action only                     | Active scoped Final Product Release authorization                      |
| CoC Approver                           | CoC approval only                               | Active scoped CoC authorization                                        |
| Routing Releaser                       | Routing release only                            | Active scoped Routing Release authorization                            |
| Trainer                                | Training delivery/records                       | Trainer qualification; no operational authority inference              |
| HR / Training Administrator            | Employee/training administration                | No technical or Quality authority inference                            |
| Business Manager / Supply Chain        | Commercial/supply-chain administration          | Explicit supplier approval if assigned                                 |
| Buyer / Purchasing                     | Purchasing execution                            | Supplier approval remains separate                                     |
| Receiving Inspector                    | Receiving inspection                            | Receiving/QC scope and competence                                      |
| Inventory / Material Control           | Inventory transactions                          | Material disposition overrides separately approved                     |
| Production Technician                  | Assigned work execution                         | Current WORK authorization/competence where enforced                   |
| Shipping                               | Shipment preparation/confirmation               | Cannot product-release or clear holds                                  |
| Calibration Technician                 | Calibration execution                           | Calibration competence/approval scope                                  |
| Internal Auditor                       | Read audit evidence                             | Independence and audit qualification                                   |
| EPOCH Administrator                    | System administration                           | Must not satisfy technical or Quality authority                        |
| Read-Only Auditor                      | Least-privilege audit views                     | No mutation capability                                                 |

## Current behavior preservation

No roles, overrides, scopes, assignments, certifications or authorizations were changed. The synthetic generator models current capability resolution with enforcement disabled and labels missing authority as a finding, not an access change. Future enforcement cannot be proposed as safe until production linkage and current-action reconstruction are complete.

## Production follow-up

Execute `production-access-audit.sql` using a read-only database principal, capture each result set, transform it into the generator input contract, and run the generator with the explicit read-only audit opt-in. Reconcile every controlled action against actual route logs/configuration and obtain management decisions for Engineering, Quality, product release, CoC and formal hold authority. Until then every employee count and employee-by-employee conclusion is **not established**.

## Validation record

- Audit artifact tests: 7 passed. They prove the SQL contains an explicit read-only transaction and no data-changing statements, migration identity uses complete filename stems, safe boot registers migration 0270, the two flag sources remain default-compatible, and the synthetic generator is non-mutating with deny-override and unlinked-identity coverage.
- Safe-boot registration check: passed; 323 registered entries are current. The 324th SQL file is the explicitly excluded one-off 0267 data repair.
- Static inventory generation: passed; 2,856 capability-like references and 1,040 server enforcement references captured for review.
- Focused Vitest repository suite: not executed. The clean worktree has no dependencies installed. `pnpm` could not use a lockfile because the repository uses `package-lock.json`; the bundled runtime has no `npm`, and the earlier package resolution attempt was blocked. No unlocked dependency installation was used.
- Clean-schema PostgreSQL replay: not executed. No local `psql` or Docker runtime was available, and production access is prohibited.
