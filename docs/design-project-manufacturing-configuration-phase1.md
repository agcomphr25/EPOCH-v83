# Design Project manufacturing-configuration Phase 1

## Authority and identifier audit

- `rd_projects.id` is `text` and remains the sole Design Project authority.
- P2/manufacturing `projects.id` is `uuid`. `part_routings.project_id` references that P2 table and is not used as an R&D relationship.
- `design_control_records.rd_project_id` is the existing Design Control-to-Design Project relationship. Project Form Instances and Design Control steps remain attached through the Design Control record.
- Inventory items use integer identity. Existing routing inventory linkage is stored as text, so Phase 1 adds an optional integer foreign key only on the new configuration item.

## Existing manufacturing evidence behavior

- Routing identity is a UUID, but routing revision content remains on mutable `part_routings` and `routing_operations` rows. A released routing does not presently freeze every operation row by itself.
- `routing_documents` contains mutable active/version fields and links by routing UUID or part-number text. Existing retrieval can choose active/current documents; it does not guarantee an exact controlled work-instruction revision.
- `engineering_controlled_revisions` is the existing cross-module controlled-revision authority and is reused by the new artifact and routing-operation links.
- Existing routing-document routes include permanent record deletion paths; Phase 1 does not change their legacy behavior. New controlled links use `ON DELETE RESTRICT` so referenced revisions cannot disappear through the new relationship.
- The Design Manufacturing Evidence service evaluates source modules and also contains legacy metadata/part-number matching fallbacks. Phase 1 does not convert those guesses into authority; uncertain candidates belong in the reconciliation queue.

## New relationship model

`rd_projects` owns configuration items. Configuration items form a guarded, same-project, acyclic assembly tree and retain multiple append-only part revisions. Part revisions link to exact `engineering_controlled_revisions` records with number, revision, checksum, state, and effectivity snapshots. Routing-operation work instructions likewise pin exact routing and work-instruction controlled revisions.

Engineering Release baseline items now have nullable relational columns for configuration item, part revision, artifact role, controlled revision, effectivity, applicability, and ECR/ECN lineage. Existing baseline rows remain valid and unchanged.

## Legacy and activation boundary

The migration performs no ownership inference or backfill. Existing Design Projects, P2 projects, routings, documents, travelers, and production records retain their behavior. New configuration enforcement is not activated in Phase 1. Future conversion must create reviewed reconciliation records and append audit events; it must not invent approvals, checksums, signatures, release dates, or ownership.
