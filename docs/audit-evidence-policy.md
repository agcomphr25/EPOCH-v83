# Audit Evidence Policy (Task #85)

This document is the operational companion to **Section 8** of
`docs/EPOCH_ARCHITECTURE_CONSTITUTION.md`. The constitution governs *what
must be true*; this document explains *how to comply*.

## 1. The unified ledger

| Concern | Authoritative artifact |
|---|---|
| Where events live | `public.audit_events` |
| Sole writer (application) | `recordAuditEvent()` in `server/src/services/auditLedgerService.ts` |
| Append-only enforcement | DB trigger `audit_events_block_dml` (UPDATE/DELETE → exception + out-of-chain `AUDIT_DML_BLOCKED` quarantine row, see §7) |
| Chain-head checkpoints | `public.audit_anchors` (nightly cron + on-demand) |
| Retention windows | `public.audit_retention_policies` (default `*` = 2,555 days / 7 years) |
| Reporting & evidence export | `/api/audit-ledger/*` (UI: `/admin/audit-ledger`, ADMIN/OWNER only) |

Every row carries:

- `subject_type`, `subject_id` — what the event is about
- `payload_json` — full structured detail
- `payload_hash` = SHA-256 of canonical JSON of `payload_json`
- `prev_hash`, `row_hash`, `sequence_number` — hash chain (genesis = 64 zeros)
- `occurred_at`, `recorded_at`, `source_service`

`row_hash` is computed as
`SHA-256(prev_hash || payload_hash || occurred_at.toISOString() || event_type || subject_type || subject_id || sequence_number)`.

## 2. Emitting an event from a service

```ts
import { recordAuditEvent } from "server/src/services/auditLedgerService";

await recordAuditEvent({
  eventType: "PAYROLL_EXPORT_CREATED",
  subjectType: "payroll_export_batch",
  subjectId: String(batch.id),
  sourceService: "payrollExport.service",
  actor: { id: user.id, username: user.email, role: user.role },
  occurredAt: new Date(),
  payload: { batchId: batch.id, periodStart, periodEnd, csvChecksum, rowCount },
  reason: supersedeReason ?? null,
});
```

Rules:

1. `eventType`, `subjectType`, `subjectId`, `sourceService` are required.
2. `payload` MUST contain everything needed to reconstruct the business
   meaning of the event without consulting other tables. Treat it as the
   evidence body.
3. Do **not** put secrets, raw tokens, or passwords in `payload`.
4. Hash chaining is automatic; never set `prev_hash` / `row_hash` / `sequence_number`.

## 3. Migrating an existing per-service event table

Per-domain tables (e.g. `payroll_export_events`, `labor_entry_audit`) keep
their existing operational shape. In addition, every write site MUST also
call `recordAuditEvent()` with an equivalent payload so the unified ledger
is the single integrity-verifiable timeline.

The legacy `auditService.logEvent()` already delegates to `recordAuditEvent()`,
so callers of `auditService` automatically participate in the chain.

## 4. Reporting & evidence export

| Endpoint | Purpose |
|---|---|
| `GET /api/audit-ledger/report` | Free-form filtered query |
| `GET /api/audit-ledger/templates` | Saved DCAA / CMMC templates |
| `GET /api/audit-ledger/report/:templateKey` | Run a saved template |
| `GET /api/audit-ledger/export.csv` | CSV with `X-Audit-Sha256` + base64 manifest header |
| `POST /api/audit-ledger/verify` | Re-walks the chain and reports first mismatch |
| `GET /api/audit-ledger/anchors` | List recent anchors |
| `POST /api/audit-ledger/anchors` | Write a new anchor (ADMIN/OWNER) |
| `GET /api/audit-ledger/retention` | Retention policies |

Saved templates currently include: labor approval trail, period close /
reopen history, payroll export history, procurement approvals, policy
acknowledgments, and audit-ledger tamper attempts.

## 5. Retention & purge

- The default policy `*` is 7 years (2,555 days) and aligns with DCAA.
- Specific event types may extend retention but never shorten it.
- Any future archive job must:
  1. Resolve the floor via `getRetentionFloorDays(eventType)` and skip
     rows younger than that floor.
  2. Run inside a transaction that explicitly opts in via
     `SET LOCAL audit.allow_archive = 'true'`. The trigger refuses
     UPDATE/DELETE otherwise.
  3. Anchor the chain head (`writeAnchor()`) before and after the run.

## 6. Verification cadence

- A nightly cron at 02:15 writes a chain-head anchor.
- The verifier (`POST /api/audit-ledger/verify`) is exposed in the admin
  UI and can be invoked on demand. Run it:
  - Before any DCAA / CMMC evidence package export.
  - After any database restore.
  - After any maintenance window that touched the `public.audit_events`
    table.

A failed verification is a sev-1 compliance incident.

## 7. Tamper-attempt quarantine (out-of-chain by design)

When the `audit_events_block_dml` trigger refuses an UPDATE/DELETE, it inserts an
`AUDIT_DML_BLOCKED` row into `audit_events` with `sequence_number = NULL` and no
`prev_hash`/`row_hash`. **This is intentional**: emitting the row in-chain from
inside the trigger would require taking the same transactional advisory lock the
application holds for `recordAuditEvent()`, which would deadlock under
concurrency or silently corrupt the chain if the trigger ran before the lock was
released.

Out-of-chain quarantine is the compensating control. The chain itself remains
intact and verifiable, while the quarantine record preserves the forensic
evidence (actor, timestamp, statement context, source service). The verifier and
all chain-walking utilities skip rows where `sequence_number IS NULL`. The unified
reporting UI surfaces these rows distinctly via the "Audit ledger tamper attempts"
saved template so they can never be overlooked during evidence review.

## 8. Access control

`/api/audit-ledger/*` (read, export, verify, anchors, retention) is restricted to
ADMIN/OWNER at the route layer (`requireAdminOrOwner`) and at the UI layer
(`/admin/audit-ledger` in `userPermissions.ts`). No non-admin role may query,
export, or verify the ledger.
