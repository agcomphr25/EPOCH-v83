# Payroll Export Revision & Adjustment Model — Design Document

## Executive Summary

Today the Gusto CSV export is ephemeral — every time an admin clicks "Export," the system recalculates hours from live timesheet data and streams a fresh CSV. Nothing is stored, so there is no audit trail of what was actually sent to payroll, no ability to re-download the exact file, and no mechanism to detect whether underlying data changed between export and payroll processing.

The proposed model introduces **payroll export batches** — immutable, versioned snapshots of every export. Each batch stores the exact CSV rows and a SHA-256 checksum at creation time. Multiple exports for the same pay period are allowed before payroll is processed; each new export automatically supersedes the previous active batch and increments a revision number. Once an admin marks a batch as "processed," it becomes permanent historical evidence that can never be altered.

If a time correction is needed after an active unprocessed export exists, the system blocks the edit until an admin explicitly supersedes or voids the active batch with a documented reason. If a correction is needed after payroll has already been processed, the system creates a **payroll adjustment** record that flows into a future payroll run — either bundled into the next regular export or issued as a standalone off-cycle correction export. Every lifecycle transition (create, supersede, void, process) is audit-logged with actor, timestamp, reason, and IP address.

This design preserves full DCAA auditability: immutable export evidence, before/after correction snapshots, segregation of duties, and a clear chain of custody from timesheet certification through payroll submission.

---

## Schema Overview

All new tables live in the `timekeeping` PostgreSQL schema alongside existing tables. Drizzle definitions are in `server/src/schema/timekeeping.ts`. SQL migration is `migrations/0098_payroll_export_batches.sql`.

### `payroll_export_batches`

Stores one row per export action. Central record of "what was exported and when."

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | `serial` | PK | Auto-increment identifier |
| `period_start` | `text` | NOT NULL | Pay period start (YYYY-MM-DD) |
| `period_end` | `text` | NOT NULL | Pay period end (YYYY-MM-DD) |
| `revision_number` | `integer` | NOT NULL, default 1 | Monotonically increasing per period |
| `status` | `text` | NOT NULL, default 'active' | `active`, `superseded`, `voided`, `processed` |
| `export_format` | `text` | NOT NULL, default 'gusto_csv' | Format identifier |
| `csv_content` | `text` | NOT NULL | Exact CSV string served to admin |
| `csv_checksum` | `text` | NOT NULL | SHA-256 hex digest of `csv_content` |
| `row_count` | `integer` | NOT NULL | Data rows (excluding header) |
| `employee_count` | `integer` | NOT NULL | Distinct employees in export |
| `total_regular_hours` | `double precision` | NOT NULL | Sum of regular hours |
| `total_overtime_hours` | `double precision` | NOT NULL | Sum of overtime hours |
| `total_sick_hours` | `double precision` | NOT NULL | Sum of sick hours |
| `total_vacation_hours` | `double precision` | NOT NULL | Sum of vacation hours |
| `includes_adjustments` | `boolean` | NOT NULL, default false | True if batch includes adjustments |
| `adjustment_ids` | `jsonb` | nullable | Array of included adjustment IDs |
| `supersedes_batch_id` | `integer` | nullable, FK → self | Batch this one replaced |
| `superseded_reason` | `text` | nullable | Why previous batch was superseded |
| `voided_reason` | `text` | nullable | Why batch was voided |
| `voided_at` | `timestamptz` | nullable | When voided |
| `voided_by` | `integer` | nullable | User who voided |
| `processed_at` | `timestamptz` | nullable | When processing confirmed |
| `processed_by` | `integer` | nullable | User who confirmed processing |
| `processed_confirmation_note` | `text` | nullable | Admin note at processing |
| `created_by` | `integer` | NOT NULL | Admin who created export |
| `created_at` | `timestamptz` | NOT NULL, default now() | Creation timestamp |

**Indexes:**
- `UNIQUE (period_start, period_end, revision_number)`
- `idx_export_batches_period_status (period_start, period_end, status)`
- `idx_export_batches_created_at (created_at)`

### `payroll_export_rows`

Individual row-level data per batch for structured queries without CSV parsing.

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | `serial` | PK | Auto-increment identifier |
| `batch_id` | `integer` | NOT NULL, FK → batches, CASCADE | Parent batch |
| `employee_id` | `integer` | NOT NULL | timekeeping.employees.id |
| `epoch_employee_id` | `integer` | nullable | public.employees.id |
| `first_name` | `text` | NOT NULL | Employee first name as exported |
| `last_name` | `text` | NOT NULL | Employee last name as exported |
| `regular_hours` | `double precision` | NOT NULL | Regular hours |
| `overtime_hours` | `double precision` | NOT NULL | Overtime hours |
| `double_overtime_hours` | `double precision` | NOT NULL, default 0 | Double OT |
| `sick_hours` | `double precision` | NOT NULL | Sick leave hours |
| `vacation_hours` | `double precision` | NOT NULL | PTO/vacation hours |
| `source_timesheet_ids` | `jsonb` | NOT NULL | Timesheet IDs that contributed |
| `source_leave_entry_ids` | `jsonb` | nullable | Leave entry IDs that contributed |
| `adjustment_ids` | `jsonb` | nullable | Adjustment IDs for this employee |

### `payroll_adjustments`

Delta records for corrections after a processed export. Flow into a future payroll run.

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | `serial` | PK | Auto-increment identifier |
| `original_batch_id` | `integer` | NOT NULL, FK → batches | Processed batch being corrected |
| `employee_id` | `integer` | NOT NULL | Employee affected |
| `correction_id` | `integer` | nullable, FK → timesheet_corrections | DCAA correction record |
| `adjustment_type` | `text` | NOT NULL | `regular_hours`, `overtime_hours`, `sick_hours`, `vacation_hours` |
| `original_value` | `double precision` | NOT NULL | Value in processed batch |
| `corrected_value` | `double precision` | NOT NULL | Correct value |
| `delta` | `double precision` | NOT NULL | corrected − original |
| `reason` | `text` | NOT NULL | Why adjustment is needed |
| `status` | `text` | NOT NULL, default 'pending' | `pending`, `approved`, `included`, `voided` |
| `approved_by` | `integer` | nullable | Approver user ID |
| `approved_at` | `timestamptz` | nullable | Approval timestamp |
| `included_in_batch_id` | `integer` | nullable, FK → batches | Future batch that carried this |
| `delivery_preference` | `text` | NOT NULL, default 'next_regular' | `next_regular` or `off_cycle` |
| `created_by` | `integer` | NOT NULL | Creator user ID |
| `created_at` | `timestamptz` | NOT NULL, default now() | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, default now() | Last update |

### `payroll_export_events`

Dedicated audit trail for every lifecycle transition.

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | `serial` | PK | Auto-increment identifier |
| `batch_id` | `integer` | nullable, FK → batches | Related batch |
| `adjustment_id` | `integer` | nullable, FK → adjustments | Related adjustment |
| `event_type` | `text` | NOT NULL | See event types below |
| `actor_id` | `integer` | NOT NULL | User who acted |
| `actor_email` | `text` | nullable | Actor email |
| `actor_role` | `text` | nullable | Actor role at event time |
| `reason` | `text` | nullable | Required for supersede/void/process |
| `metadata` | `jsonb` | nullable | Additional context |
| `ip_address` | `text` | nullable | Request IP |
| `created_at` | `timestamptz` | NOT NULL, default now() | Event timestamp |

**Event types:** `BATCH_CREATED`, `BATCH_SUPERSEDED`, `BATCH_VOIDED`, `BATCH_PROCESSED`, `BATCH_DOWNLOADED`, `ADJUSTMENT_CREATED`, `ADJUSTMENT_APPROVED`, `ADJUSTMENT_INCLUDED`, `ADJUSTMENT_VOIDED`, `CORRECTION_BLOCKED_BY_ACTIVE_EXPORT`

---

## Export Batch Status State Machine

```
                    ┌──────────────┐
         create     │              │
        ────────►   │    active    │
                    │              │
                    └──────┬───┬───┘
                           │   │
              supersede    │   │   void
           ┌───────────────┘   └────────────────┐
           ▼                                    ▼
    ┌──────────────┐                    ┌──────────────┐
    │  superseded  │                    │    voided    │
    │  (terminal)  │                    │  (terminal)  │
    └──────────────┘                    └──────────────┘
                           │
              process      │  (only from active)
                           ▼
                    ┌──────────────┐
                    │  processed   │
                    │  (terminal)  │
                    └──────────────┘
```

**Permitted transitions:**

| From | To | Who | Requires |
|---|---|---|---|
| *(new)* | `active` | OWNER, ADMIN | Export action creates batch |
| `active` | `superseded` | OWNER, ADMIN | Reason required |
| `active` | `voided` | OWNER, ADMIN | Reason required |
| `active` | `processed` | OWNER, ADMIN | Confirmation note required |

All terminal states are immutable. Only one active batch per period at any time (enforced at service level).

No `draft` status: every export action produces a complete, checksummed batch that is immediately active.

---

## Business Rules

### 1. First export for a pay period
- Service computes rows from certified/locked timesheets + approved leave entries via `exportFinalizedTimesheetsForGusto()`.
- Builds CSV string, computes SHA-256, inserts batch with `revision_number = 1`, `status = 'active'`.
- Inserts per-employee `payroll_export_rows`. Logs `BATCH_CREATED`.

### 2. Subsequent export (before processed)
- Marks existing active batch as `superseded` with reason. Logs `BATCH_SUPERSEDED`.
- Creates new batch with incremented revision number and `supersedes_batch_id`.

### 3. Manual supersede
- Admin supplies reason. Batch transitions to `superseded`. Period has no active batch until next export.

### 4. Void
- Admin supplies reason. Batch transitions to `voided`. Corrections unblocked.

### 5. Mark processed
- Admin confirms payroll submitted. Batch becomes permanent immutable evidence. Logs `BATCH_PROCESSED`.

### 6. Re-download
- Returns stored `csv_content` directly — no recalculation. Available for any status. Logs `BATCH_DOWNLOADED`.

### 7. Correction blocked by active export
- Pre-flight check in `requestCorrection()`: if an active batch covers the period, return 409.
- Admin must supersede or void the batch first.

### 8. Correction after processed export
- Correction proceeds normally through DCAA workflow.
- System creates `payroll_adjustments` rows with deltas between processed values and corrected values.
- Admin chooses `delivery_preference`: `next_regular` or `off_cycle`.

### 9. Next-run adjustments
- After correction approval, service looks up employee's row in processed batch, computes deltas, creates pending adjustments.
- Admin reviews/approves. Approved adjustments wait for inclusion.

### 10. Off-cycle exports
- Admin selects approved adjustments. Service creates batch with adjustment deltas as CSV. Adjustments transition to `included`.

### 11. Regular export with bundled adjustments
- Export checks for approved `next_regular` adjustments from prior periods. Merges into export.

---

## Backend Route Plan

### Existing routes modified

| Route | Change |
|---|---|
| `GET /api/timekeeping/admin/export/gusto` | Kept as deprecated alias, redirects to batch flow |
| `POST /api/timekeeping/corrections` | Adds pre-flight active-export check (409 if blocked) |

### New routes

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/api/timekeeping/admin/payroll/export` | OWNER, ADMIN | Create batch, supersede prior, return CSV |
| `GET` | `/api/timekeeping/admin/payroll/batches` | OWNER, ADMIN | List batches with filters |
| `GET` | `/api/timekeeping/admin/payroll/batches/:id` | OWNER, ADMIN | Get batch with rows |
| `GET` | `/api/timekeeping/admin/payroll/batches/:id/download` | OWNER, ADMIN | Download stored CSV |
| `POST` | `/api/timekeeping/admin/payroll/batches/:id/supersede` | OWNER, ADMIN | Supersede with reason |
| `POST` | `/api/timekeeping/admin/payroll/batches/:id/void` | OWNER, ADMIN | Void with reason |
| `POST` | `/api/timekeeping/admin/payroll/batches/:id/process` | OWNER, ADMIN | Mark as processed |
| `GET` | `/api/timekeeping/admin/payroll/adjustments` | OWNER, ADMIN | List adjustments |
| `POST` | `/api/timekeeping/admin/payroll/adjustments` | OWNER, ADMIN | Create adjustments |
| `POST` | `/api/timekeeping/admin/payroll/adjustments/:id/approve` | OWNER, ADMIN | Approve adjustment |
| `POST` | `/api/timekeeping/admin/payroll/adjustments/:id/void` | OWNER, ADMIN | Void adjustment |
| `POST` | `/api/timekeeping/admin/payroll/export-offcycle` | OWNER, ADMIN | Off-cycle adjustment export |
| `GET` | `/api/timekeeping/admin/payroll/batches/:id/events` | OWNER, ADMIN | Batch audit events |

### Service file: `server/src/services/timekeeping/payrollExport.service.ts`

Key functions:
- `createExportBatch(periodStart, periodEnd, actor)` — core export with batch creation, CSV storage, checksum, auto-supersede in a transaction.
- `getBatch(id)`, `listBatches(filters)`, `downloadBatch(id)`
- `supersedeBatch(id, reason, actor)`, `voidBatch(id, reason, actor)`, `processBatch(id, confirmationNote, actor)`
- `createAdjustments(originalBatchId, employeeId, correctionId, deltas, deliveryPreference, actor)`
- `approveAdjustment(id, note, actor)`, `voidAdjustment(id, reason, actor)`
- `createOffCycleExport(adjustmentIds, actor)`
- `logExportEvent(...)` — internal helper

### Changes to corrections.service.ts

- `requestCorrection()` gains pre-flight check before `assertTransition()`.
- `approveCorrection()` gains post-approval check for processed batches, creating adjustments if needed.

---

## DCAA Audit Trail Considerations

| Requirement | How addressed |
|---|---|
| Immutable export evidence | Stored CSV + SHA-256 checksum. Terminal statuses prevent modification. |
| Employee attestation | Existing attestation fields chain through source_timesheet_ids. |
| Supervisor/admin approval | Only certified/locked timesheets included. created_by logged. |
| Correction reason tracking | Existing correction snapshots + adjustment reason + superseded/voided reasons. |
| Before/after snapshots | payroll_export_rows = "before". Adjustment original/corrected/delta = explicit change. |
| Segregation of duties | Only OWNER/ADMIN can export/supersede/void/process. |
| Labor distribution reconciliation | source_timesheet_ids + source_leave_entry_ids enable full traceability. |
| Proof of export | created_at + created_by + csv_checksum = cryptographic proof. |
| Proof of lifecycle changes | payroll_export_events with actor, timestamp, IP, metadata. |

---

## UI/UX Requirements (Phase 4)

### Payroll Export Dashboard
- Batch list grouped by pay period, sorted most recent first.
- Active batch card with Download/Supersede/Void/Process buttons.
- Historical revisions expandable section.
- Re-download available for any status.
- Supersede/Void modals with required reason (min 10 chars).
- Process modal with confirmation checkbox and note.
- Correction-blocked banner with link to export dashboard.

### Adjustments Panel
- Pending/approved/included adjustment list with filters.
- Bulk approve for pending adjustments.
- Off-cycle export creation flow.

---

## Implementation Phases

### Phase 1: Schema & Core Export
- Migration `0098_payroll_export_batches.sql` (batches, rows, events, adjustments tables)
- Drizzle schema definitions in `server/src/schema/timekeeping.ts`
- Service file `payrollExport.service.ts`
- Route file `payrollExport.ts`
- Update existing Gusto export route

### Phase 2: Correction Blocking
- Pre-flight check in `corrections.service.ts`
- 409 handling in correction UI

### Phase 3: Post-Processed Adjustments
- Adjustment CRUD in service
- Post-approval adjustment creation in corrections flow
- Off-cycle export support

### Phase 4: Admin UI
- PayrollExportDashboard page
- PayrollAdjustments page
- Navigation updates

### Phase 5: Tests
- 17 integration test scenarios covering all business rules

---

## Tests Needed

1. First export creates active revision 1
2. Second export supersedes revision 1, creates revision 2
3. Re-download uses stored CSV, not recalculated data
4. Correction blocked while active unprocessed export exists
5. Correction allowed after explicit supersede
6. Correction allowed after void
7. Processed export cannot be changed (409 for supersede/void/process)
8. Correction after processed export creates adjustment with correct deltas
9. Next regular export includes approved adjustments
10. Off-cycle export includes only selected adjustments
11. Only OWNER/ADMIN can export/supersede/void/process (403 for others)
12. Audit logs for every lifecycle transition
13. Checksum integrity verification
14. Revision number is monotonic (even after void)
15. Only one active batch per period
16. Supersede requires reason (400 without)
17. Process requires confirmation note (400 without)
