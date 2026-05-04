# Payroll Export Revision & Adjustment Model — Revised Design Document

## Revised Executive Summary

Today the Gusto CSV export is ephemeral — every time an admin clicks "Export," the system recalculates hours from live timesheet data and streams a fresh CSV. Nothing is stored, so there is no audit trail of what was actually sent to payroll, no ability to re-download the exact file, and no mechanism to detect whether underlying data changed between export and payroll processing.

The revised model introduces **payroll export batches** — immutable, versioned snapshots of every export. Each batch stores the exact CSV rows and a SHA-256 checksum at creation time, along with an **`export_type`** that distinguishes `regular_full_period` exports from `off_cycle_adjustment` exports. Multiple exports for the same pay period are allowed before payroll is processed; each new export automatically supersedes the previous active batch of the same type and increments a revision number scoped to that type. Database-level uniqueness is enforced via a **partial unique index** so that at most one active batch per period per export type can exist at any time — not just at the service level.

Employee identity fields on export rows use **explicit snapshot names** (`employee_first_name_snapshot`, `employee_last_name_snapshot`, `employee_number_snapshot`) to make clear these are point-in-time audit evidence, not live references. This also avoids false positives in the migration safety guard that scans for retired column names.

Once an admin marks a batch as "processed," it becomes permanent historical evidence that can never be altered, superseded, voided, recalculated, or deleted. If a time correction is needed after an active unprocessed export exists, the system blocks the edit until an admin explicitly supersedes or voids the active batch with a documented reason. If a correction is needed after payroll has already been processed, the system creates a **payroll adjustment** record that flows into a future payroll run — either bundled into the next regular export or issued as a standalone off-cycle correction export.

Every lifecycle transition (create, supersede, void, process) is audit-logged with actor, timestamp, reason, and IP address. Reasons are required for supersede, void, mark-processed, adjustment creation, and off-cycle exports. This design preserves full DCAA auditability: immutable export evidence, before/after correction snapshots, segregation of duties, and a clear chain of custody from timesheet certification through payroll submission.

---

## Revised Schema Proposal

All new tables live in the `timekeeping` PostgreSQL schema alongside existing tables. Drizzle definitions will be in `server/src/schema/timekeeping.ts`. SQL migration will be `migrations/0098_payroll_export_batches.sql`.

### `payroll_export_batches`

Stores one row per export action. Central record of "what was exported and when."

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | `serial` | PK | Auto-increment identifier |
| `period_start` | `text` | NOT NULL, CHECK (YYYY-MM-DD) | Pay period start date |
| `period_end` | `text` | NOT NULL, CHECK (YYYY-MM-DD) | Pay period end date |
| `export_type` | `text` | NOT NULL, default `'regular_full_period'` | `regular_full_period` or `off_cycle_adjustment` |
| `revision_number` | `integer` | NOT NULL, default 1 | Monotonically increasing per period per export_type |
| `status` | `text` | NOT NULL, default `'active'` | `active`, `superseded`, `voided`, `processed` |
| `export_format` | `text` | NOT NULL, default `'gusto_csv'` | Format identifier |
| `csv_content` | `text` | NOT NULL | Exact CSV string served to admin |
| `csv_checksum` | `text` | NOT NULL | SHA-256 hex digest of `csv_content` |
| `row_count` | `integer` | NOT NULL | Data rows (excluding header) |
| `employee_count` | `integer` | NOT NULL | Distinct employees in export |
| `total_regular_hours` | `double precision` | NOT NULL | Sum of regular hours |
| `total_overtime_hours` | `double precision` | NOT NULL | Sum of overtime hours |
| `total_sick_hours` | `double precision` | NOT NULL | Sum of sick hours |
| `total_vacation_hours` | `double precision` | NOT NULL | Sum of vacation hours |
| `includes_adjustments` | `boolean` | NOT NULL, default false | True if batch includes adjustments |
| `adjustment_ids` | `jsonb` | nullable | Denormalized snapshot of included adjustment IDs for display |
| `source_timesheet_ids` | `jsonb` | NOT NULL | Array of timesheet IDs that contributed to this batch |
| `source_leave_entry_ids` | `jsonb` | nullable | Array of leave entry IDs that contributed |
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

**Date type decision — `text` with CHECK constraint (recommended):**

Both `timekeeping.timesheets` and `timekeeping.salaried_timesheets` use `text("period_start")` and `text("period_end")`. Using native `DATE` would be more correct in isolation, but would create an inconsistency requiring type casting in every join or comparison with existing period columns. Since the payroll export service must query timesheets by period range, matching the existing `text` type avoids implicit casting bugs and simplifies service code.

To enforce correctness despite using `text`, the migration adds CHECK constraints:

```sql
CONSTRAINT chk_period_start_format CHECK (period_start ~ '^\d{4}-\d{2}-\d{2}$')
CONSTRAINT chk_period_end_format CHECK (period_end ~ '^\d{4}-\d{2}-\d{2}$')
```

This follows precedent from `migrations/0009_schema_change_log.sql` which uses CHECK constraints for value validation. The regex enforces YYYY-MM-DD format at the database level. The service layer should additionally validate that the values parse to real dates (e.g., reject `2025-02-30`).

**`export_type` column effects:**

- **Revision numbering**: Revision numbers are scoped per `(period_start, period_end, export_type)`. A period can have `regular_full_period` revision 3 and `off_cycle_adjustment` revision 1 simultaneously.
- **Active batch uniqueness**: At most one active batch per `(period_start, period_end, export_type)`, enforced by partial unique index (see Indexes section).
- **Processed batch behavior**: Both types become immutable on processing. A processed `regular_full_period` batch and a processed `off_cycle_adjustment` batch for the same period are independent historical records.
- **Adjustment inclusion**: `regular_full_period` batches include `next_regular` adjustments merged with timesheet data. `off_cycle_adjustment` batches contain only selected approved adjustments — no fresh timesheet data.
- **UI display**: The dashboard groups batches by period and shows export type as a badge/label. Off-cycle batches appear in a distinct section or with a visual indicator.
- **CSV generation**: `regular_full_period` pulls from `exportFinalizedTimesheetsForGusto()` plus any approved `next_regular` adjustments. `off_cycle_adjustment` generates a CSV with only adjustment delta rows.

### `payroll_export_rows`

Individual row-level data per batch for structured queries without CSV parsing. Employee identity fields use explicit snapshot naming to indicate these are point-in-time values captured at export time.

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | `serial` | PK | Auto-increment identifier |
| `batch_id` | `integer` | NOT NULL, FK → batches, CASCADE | Parent batch |
| `employee_id` | `integer` | NOT NULL | timekeeping.employees.id |
| `epoch_employee_id` | `integer` | nullable | public.employees.id |
| `employee_first_name_snapshot` | `text` | NOT NULL | Employee first name at export time |
| `employee_last_name_snapshot` | `text` | NOT NULL | Employee last name at export time |
| `employee_number_snapshot` | `text` | nullable | Employee number at export time |
| `employee_email_snapshot` | `text` | nullable | Employee email at export time |
| `regular_hours` | `double precision` | NOT NULL | Regular hours |
| `overtime_hours` | `double precision` | NOT NULL | Overtime hours |
| `double_overtime_hours` | `double precision` | NOT NULL, default 0 | Double OT |
| `sick_hours` | `double precision` | NOT NULL | Sick leave hours |
| `vacation_hours` | `double precision` | NOT NULL | PTO/vacation hours |
| `source_timesheet_ids` | `jsonb` | NOT NULL | Timesheet IDs that contributed |
| `source_leave_entry_ids` | `jsonb` | nullable | Leave entry IDs that contributed |
| `adjustment_ids` | `jsonb` | nullable | Denormalized snapshot of adjustment IDs for this employee |

**Why snapshot naming matters:**

1. **Audit evidence clarity**: These columns capture the employee's name, number, and email as they appeared at the moment of export. If an employee's name later changes (e.g., legal name change), the export row retains the original value. The `_snapshot` suffix makes this semantics unambiguous to anyone reading the schema or querying the data.

2. **Migration safety**: The retired-column name guard in `migrationSafety.test.ts` (lines 565–613) scans post-0049 migrations for bare `first_name`/`last_name` column references and flags them as potential references to the deprecated `timekeeping.employees` columns. The current migration required an exemption entry in `EXEMPT_FROM_RETIRED_COLUMN_CHECK`. Using `employee_first_name_snapshot`/`employee_last_name_snapshot` avoids triggering this guard entirely, eliminating the need for the exemption and reducing future maintenance burden.

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
| `reason` | `text` | NOT NULL | Why adjustment is needed (required) |
| `status` | `text` | NOT NULL, default `'pending'` | `pending`, `approved`, `included`, `voided` |
| `approved_by` | `integer` | nullable | Approver user ID |
| `approved_at` | `timestamptz` | nullable | Approval timestamp |
| `included_in_batch_id` | `integer` | nullable, FK → batches | Future batch that carried this adjustment |
| `delivery_preference` | `text` | NOT NULL, default `'next_regular'` | `next_regular` or `off_cycle` |
| `created_by` | `integer` | NOT NULL | Creator user ID |
| `created_at` | `timestamptz` | NOT NULL, default now() | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, default now() | Last update |

**Adjustment relationship design — `included_in_batch_id` FK is sufficient (no join table needed):**

Each adjustment is included in exactly one batch (or none, if still pending/approved). This is a strict 1:N relationship from batches to adjustments. The `included_in_batch_id` FK on `payroll_adjustments` is the canonical relational link:

- To find all adjustments in a batch: `SELECT * FROM payroll_adjustments WHERE included_in_batch_id = ?`
- To find which batch carried an adjustment: read `included_in_batch_id` directly.

A join table (`payroll_export_batch_adjustments`) would be warranted if an adjustment could appear in multiple batches, but by design an adjustment is included exactly once and then transitions to `included` status. The `adjustment_ids` JSONB columns on `payroll_export_batches` and `payroll_export_rows` remain as **denormalized snapshot fields** for display convenience and audit evidence — they capture the set of adjustment IDs at the moment of export, frozen alongside the CSV content. The canonical source of truth for the relationship is always the FK.

### `payroll_export_events`

Dedicated audit trail for every lifecycle transition.

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | `serial` | PK | Auto-increment identifier |
| `batch_id` | `integer` | nullable, FK → batches | Related batch |
| `adjustment_id` | `integer` | nullable, FK → adjustments | Related adjustment |
| `event_type` | `text` | NOT NULL | See event types below |
| `actor_id` | `integer` | NOT NULL | User who acted |
| `actor_email` | `text` | nullable | Actor email at event time |
| `actor_role` | `text` | nullable | Actor role at event time |
| `reason` | `text` | nullable | Required for supersede/void/process events |
| `metadata` | `jsonb` | nullable | Additional context (e.g., batch reference for blocked corrections) |
| `ip_address` | `text` | nullable | Request IP |
| `created_at` | `timestamptz` | NOT NULL, default now() | Event timestamp |

**Event types:** `BATCH_CREATED`, `BATCH_SUPERSEDED`, `BATCH_VOIDED`, `BATCH_PROCESSED`, `BATCH_DOWNLOADED`, `ADJUSTMENT_CREATED`, `ADJUSTMENT_APPROVED`, `ADJUSTMENT_INCLUDED`, `ADJUSTMENT_VOIDED`, `CORRECTION_BLOCKED_BY_ACTIVE_EXPORT`

---

## Revised Indexes And Constraints

### `payroll_export_batches`

```sql
-- Revision uniqueness scoped to period + export type
CREATE UNIQUE INDEX idx_export_batches_period_type_revision
  ON timekeeping.payroll_export_batches (period_start, period_end, export_type, revision_number);

-- Database-level active batch uniqueness per period + type
-- Prevents multiple active batches for the same period and export type.
-- Uses a partial index (WHERE status = 'active') so only active rows participate.
CREATE UNIQUE INDEX idx_export_batches_active_unique
  ON timekeeping.payroll_export_batches (period_start, period_end, export_type)
  WHERE status = 'active';

-- Lookup by period and status
CREATE INDEX idx_export_batches_period_status
  ON timekeeping.payroll_export_batches (period_start, period_end, status);

-- Chronological listing
CREATE INDEX idx_export_batches_created_at
  ON timekeeping.payroll_export_batches (created_at);

-- Date format enforcement
ALTER TABLE timekeeping.payroll_export_batches
  ADD CONSTRAINT chk_period_start_format CHECK (period_start ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE timekeeping.payroll_export_batches
  ADD CONSTRAINT chk_period_end_format CHECK (period_end ~ '^\d{4}-\d{2}-\d{2}$');

-- Export type value enforcement
ALTER TABLE timekeeping.payroll_export_batches
  ADD CONSTRAINT chk_export_type CHECK (export_type IN ('regular_full_period', 'off_cycle_adjustment'));
```

**Why processed batches do NOT need a uniqueness constraint:** Multiple processed revisions for the same period and export type are expected historical evidence. For example, a period may have revision 1 (processed), then a correction triggers a new regular export that becomes revision 2 (also eventually processed). Both are legitimate, immutable audit records. Constraining processed batches to one per period would break the revision history model.

### `payroll_export_rows`

```sql
CREATE INDEX idx_export_rows_batch
  ON timekeeping.payroll_export_rows (batch_id);

CREATE INDEX idx_export_rows_employee
  ON timekeeping.payroll_export_rows (employee_id);
```

### `payroll_adjustments`

```sql
CREATE INDEX idx_adjustments_batch
  ON timekeeping.payroll_adjustments (original_batch_id);

CREATE INDEX idx_adjustments_employee
  ON timekeeping.payroll_adjustments (employee_id);

CREATE INDEX idx_adjustments_status
  ON timekeeping.payroll_adjustments (status);

CREATE INDEX idx_adjustments_included_batch
  ON timekeeping.payroll_adjustments (included_in_batch_id)
  WHERE included_in_batch_id IS NOT NULL;
```

### `payroll_export_events`

```sql
CREATE INDEX idx_export_events_batch
  ON timekeeping.payroll_export_events (batch_id);

CREATE INDEX idx_export_events_adjustment
  ON timekeeping.payroll_export_events (adjustment_id);

CREATE INDEX idx_export_events_type
  ON timekeeping.payroll_export_events (event_type);
```

---

## Revised State Machine

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

All terminal states are immutable — no further transitions allowed. Only one active batch per `(period_start, period_end, export_type)` at any time, enforced at the database level via partial unique index.

No `draft` status: every export action produces a complete, checksummed batch that is immediately active.

The state machine applies identically to both `regular_full_period` and `off_cycle_adjustment` export types. They share the same lifecycle but maintain independent active-batch slots.

---

## Revised Business Rules

### 1. First export for a pay period

- Service computes rows from certified/locked timesheets + approved leave entries via `exportFinalizedTimesheetsForGusto()`.
- Captures employee snapshot data (`employee_first_name_snapshot`, `employee_last_name_snapshot`, `employee_number_snapshot`, `employee_email_snapshot`) at the moment of export.
- Builds CSV string, computes SHA-256, inserts batch with `revision_number = 1`, `status = 'active'`, `export_type = 'regular_full_period'`.
- Checks for approved `next_regular` adjustments from prior processed periods. If found, merges adjustment deltas into the export rows and sets `includes_adjustments = true`.
- Inserts per-employee `payroll_export_rows` with snapshot fields. Logs `BATCH_CREATED`.

### 2. Subsequent export (before processed)

- Marks existing active batch of the same `export_type` as `superseded` with auto-generated reason. Logs `BATCH_SUPERSEDED`.
- Creates new batch with incremented revision number (scoped to `export_type`) and `supersedes_batch_id`.
- The partial unique index guarantees no race condition can create two active batches.

### 3. Manual supersede

- Admin supplies reason (required, min 10 chars). Batch transitions to `superseded`. Period has no active batch of that type until next export.

### 4. Void

- Admin supplies reason (required, min 10 chars). Batch transitions to `voided`. Corrections unblocked if no other active batch covers the period.

### 5. Mark processed

- Admin confirms payroll submitted with a confirmation note (required). Batch becomes permanent immutable evidence. Logs `BATCH_PROCESSED`.

### 6. Re-download

- Returns stored `csv_content` directly — no recalculation. Available for any status. Logs `BATCH_DOWNLOADED`. No reason required.

### 7. Correction blocked by active export

- Pre-flight check in `requestCorrection()`: if any active batch (regardless of `export_type`) covers the correction's period, return 409 with batch reference.
- Admin must supersede or void the active batch first.
- The block event is logged automatically as `CORRECTION_BLOCKED_BY_ACTIVE_EXPORT` with batch reference in metadata.

### 8. Correction after processed export

- Correction proceeds normally through DCAA workflow.
- System creates `payroll_adjustments` rows with deltas between processed values and corrected values.
- Reason is inherited from the correction reason (required).
- Admin chooses `delivery_preference`: `next_regular` or `off_cycle`.

### 9. Next-run adjustments

- After correction approval, service looks up employee's row in processed batch, computes deltas, creates pending adjustments.
- Admin reviews/approves. Approved adjustments wait for inclusion.
- `next_regular` adjustments are automatically merged into the next regular full-period export for that employee.

### 10. Off-cycle exports

- Admin selects approved `off_cycle` adjustments. Service creates batch with `export_type = 'off_cycle_adjustment'`, containing adjustment deltas as CSV rows.
- Adjustments transition to `included` with `included_in_batch_id` set. Logs `ADJUSTMENT_INCLUDED`.
- Off-cycle export creation requires a reason/note explaining the off-cycle need.

### 11. Regular export with bundled adjustments

- Export checks for approved `next_regular` adjustments from prior processed periods. Merges adjustment deltas into the employee's row totals.
- Sets `includes_adjustments = true` and populates `adjustment_ids` on both the batch and affected export rows.

---

## Correction Workflow Interaction

This matrix defines exact behavior when a timesheet correction is attempted, based on the export state for the affected pay period.

| Export State for Period | Correction Behavior | Details |
|---|---|---|
| **No export exists** | Correction allowed normally | Standard DCAA correction workflow proceeds without restriction. |
| **Active unprocessed export exists** | Correction blocked (409) | Service returns HTTP 409 with reference to the active batch. Admin must supersede or void the active batch before the correction can proceed. Event `CORRECTION_BLOCKED_BY_ACTIVE_EXPORT` is logged automatically with batch ID in metadata. |
| **Superseded export exists (no active)** | Correction allowed normally | Superseded batches are historical — they do not block corrections. A new export can be created after the correction. |
| **Processed export exists (no active)** | Correction allowed, creates adjustment | Correction proceeds through DCAA workflow. Upon approval, the system automatically creates `payroll_adjustments` rows with deltas (original value from processed export row vs. corrected value). Admin selects delivery preference. |
| **Voided export exists (no active)** | Correction allowed normally | Voided batches are discarded — they do not block corrections or trigger adjustments. |

**Combined states**: If both a processed batch and a superseded batch exist for the same period (with no active batch), correction is allowed and adjustments reference the most recently processed batch. If both an active batch and a processed batch exist (e.g., admin created a new export after processing an earlier one), the active batch blocks the correction.

**Lookup logic**: The pre-flight check queries for any batch with `status = 'active'` covering the correction's period range, regardless of `export_type`. If found, the correction is blocked. If no active batch exists but a processed batch does, the correction proceeds with automatic adjustment creation.

---

## Adjustment Handling

### Adjustment Lifecycle

1. **Creation**: When a correction is approved for a period with a processed export, the service computes deltas between the processed export row values and the corrected values. One `payroll_adjustments` row is created per hour type that changed (e.g., if regular and overtime both changed, two adjustment rows are created).

2. **Review**: Adjustments start in `pending` status. Admin reviews the delta values and reason.

3. **Approval**: Admin approves the adjustment. Status transitions to `approved`. `approved_by` and `approved_at` are set.

4. **Inclusion**: When the adjustment is included in a future export batch:
   - For `next_regular` adjustments: automatically included when the next regular full-period export is created.
   - For `off_cycle` adjustments: included when admin creates an off-cycle adjustment export.
   - Status transitions to `included`. `included_in_batch_id` is set to the carrying batch.

5. **Voiding**: Admin can void a pending or approved adjustment with a required reason. Status transitions to `voided`.

### Relationship to Batches

- **Canonical link**: `payroll_adjustments.included_in_batch_id` FK → `payroll_export_batches.id`
- **Denormalized snapshots**: `payroll_export_batches.adjustment_ids` and `payroll_export_rows.adjustment_ids` (JSONB arrays) capture which adjustments were included at the moment of export. These are frozen with the CSV content and never updated after batch creation.
- **Query patterns**: Use the FK for transactional queries (e.g., "find all un-included approved adjustments"). Use the JSONB snapshot for audit display (e.g., "which adjustments were in this historical batch").

---

## Exact CSV Evidence And Re-Download

Each batch stores complete evidence of what was exported:

| Field | Purpose |
|---|---|
| `csv_content` | Exact CSV string served to the admin at export time |
| `csv_checksum` | SHA-256 hex digest of `csv_content` |
| `row_count` | Number of data rows (excluding header) |
| `total_regular_hours` | Aggregate regular hours across all employees |
| `total_overtime_hours` | Aggregate overtime hours |
| `total_sick_hours` | Aggregate sick hours |
| `total_vacation_hours` | Aggregate vacation hours |
| `source_timesheet_ids` | JSONB array of timesheet IDs that contributed (batch level) |
| `source_leave_entry_ids` | JSONB array of leave entry IDs that contributed (batch level) |
| `adjustment_ids` | JSONB array of adjustment IDs included, if applicable |
| `created_by` | Admin user ID who created the export |
| `created_at` | Timestamp of export creation |

**Per-row evidence** in `payroll_export_rows`:
- `source_timesheet_ids`, `source_leave_entry_ids`, `adjustment_ids` per employee
- Employee snapshot fields capturing identity at export time

**Re-download behavior:**

1. Client requests `GET /api/timekeeping/admin/payroll/batches/:id/download`.
2. Service retrieves the stored `csv_content` directly from the database. No recalculation occurs.
3. Optionally, the service verifies `SHA-256(csv_content) === csv_checksum` before serving. If the checksum does not match (indicating data corruption), the service returns a 500 error rather than serving corrupted data.
4. The CSV is served with appropriate headers (`Content-Type: text/csv`, `Content-Disposition: attachment`).
5. A `BATCH_DOWNLOADED` event is logged with actor, timestamp, and IP. No reason is required for re-download.

Re-download is available for batches in any status (active, superseded, voided, processed). Every batch's CSV is preserved indefinitely as audit evidence.

---

## DCAA Audit Trail Considerations

| Requirement | How Addressed |
|---|---|
| Immutable export evidence | Stored CSV + SHA-256 checksum. Terminal statuses prevent modification. Processed batches cannot be edited, superseded, voided, recalculated, or deleted. |
| Employee attestation | Existing attestation fields chain through `source_timesheet_ids`. Export rows capture employee identity snapshots at export time. |
| Supervisor/admin approval | Only certified/locked timesheets included. `created_by` logged on every batch. |
| Correction reason tracking | Existing correction snapshots + adjustment `reason` (required) + superseded/voided reasons (required). |
| Before/after snapshots | `payroll_export_rows` = "before" (what was sent to payroll). Adjustment `original_value`/`corrected_value`/`delta` = explicit change record. |
| Segregation of duties | Only OWNER/ADMIN can export/supersede/void/process. Role captured in audit events. |
| Labor distribution reconciliation | `source_timesheet_ids` + `source_leave_entry_ids` at both batch and row level enable full traceability from export back to individual time entries. |
| Proof of export | `created_at` + `created_by` + `csv_checksum` = cryptographic proof of what was exported and when. |
| Proof of lifecycle changes | `payroll_export_events` with actor, timestamp, IP, role, reason, and metadata for every transition. |
| Export type segregation | `export_type` distinguishes regular payroll from off-cycle corrections, enabling auditors to trace adjustment-only exports separately. |

---

## Reason Requirements

Each lifecycle event has defined reason/note requirements:

| Lifecycle Event | Reason Required? | Details |
|---|---|---|
| Initial export creation | No | The action itself is the record. `created_by` and `created_at` provide attribution. |
| Supersede | Yes (required) | Admin must explain why the previous export is being replaced. Stored in `superseded_reason`. Min 10 characters. |
| Void | Yes (required) | Admin must explain why the export is being discarded. Stored in `voided_reason`. Min 10 characters. |
| Mark processed | Yes (required) | Admin provides a confirmation note (e.g., "Submitted to Gusto batch #1234"). Stored in `processed_confirmation_note`. |
| Post-processed correction adjustment creation | Yes (required) | Reason inherits from the DCAA correction reason. Stored in adjustment `reason`. |
| Off-cycle adjustment export creation | Yes (required) | Admin must explain the off-cycle need. Logged in the `BATCH_CREATED` event metadata. |
| Correction blocked by active export | Logged automatically | System logs `CORRECTION_BLOCKED_BY_ACTIVE_EXPORT` with batch reference in metadata. No human reason needed. |
| Re-download | No | Action is logged as `BATCH_DOWNLOADED` with actor and timestamp, but no reason is needed — re-downloading stored evidence is a routine audit activity. |

---

## Updated Implementation Phases

### Phase 1: Schema & Core Export

- Migration `0098_payroll_export_batches.sql`:
  - All four tables with revised column names (`employee_first_name_snapshot`, etc.)
  - `export_type` column with CHECK constraint
  - Partial unique index `idx_export_batches_active_unique`
  - Date format CHECK constraints on `period_start`/`period_end`
  - Revision uniqueness index scoped to `(period_start, period_end, export_type, revision_number)`
  - `source_timesheet_ids` and `source_leave_entry_ids` on batches table
- Drizzle schema definitions in `server/src/schema/timekeeping.ts` matching revised column names
- Remove `0098_payroll_export_batches.sql` exemption from `EXEMPT_FROM_RETIRED_COLUMN_CHECK` (no longer needed with snapshot-prefixed names)
- Service file `payrollExport.service.ts`
- Route file `payrollExport.ts`
- Update existing Gusto export route

### Phase 2: Correction Blocking

- Pre-flight check in `corrections.service.ts` (query for any active batch covering the period)
- 409 handling in correction UI with link to payroll export dashboard
- Automatic `CORRECTION_BLOCKED_BY_ACTIVE_EXPORT` event logging

### Phase 3: Post-Processed Adjustments

- Adjustment CRUD in service
- Post-approval adjustment creation in corrections flow (delta computation against processed export rows)
- Off-cycle export support with `export_type = 'off_cycle_adjustment'`
- `next_regular` adjustment auto-inclusion in regular exports

### Phase 4: Admin UI

- PayrollExportDashboard page with export type badges/filtering
- PayrollAdjustments page
- Navigation updates
- Supersede/Void modals with required reason (min 10 chars)
- Process modal with confirmation checkbox and note

### Phase 5: Tests

- Integration test scenarios covering all business rules including:
  - Export type scoping for revision numbers and active uniqueness
  - Partial unique index enforcement (concurrent active batch rejection)
  - Snapshot field values frozen at export time
  - Date format CHECK constraint enforcement
  - Correction workflow interaction matrix (all five states)
  - Adjustment lifecycle through inclusion
  - Reason requirement enforcement for each lifecycle event
  - CSV evidence integrity and re-download checksum verification

---

## Open Questions

1. **Off-cycle export period values**: Should an off-cycle adjustment export use the same `period_start`/`period_end` as the original processed batch it corrects, or should it use the current pay period dates? Using the original period makes audit tracing clearer; using the current period aligns with when the adjustment is actually paid. Recommendation: use the original period dates so the correction is co-located with the original export in queries and UI.

2. **Adjustment granularity**: The current design creates one adjustment row per hour type that changed. Should there be a single adjustment row per employee per correction with all hour deltas as columns instead? The per-type approach is more normalized and makes it easier to include partial adjustments, but requires grouping in the UI.

3. **CSV content storage limits**: For large workforces, `csv_content` as a `text` column could grow significantly. Should a file-based storage approach (e.g., object storage with a reference URL) be considered for future scalability, or is direct database storage acceptable for the expected employee count? For the current workforce size, database storage is simpler and keeps evidence self-contained.

4. **Batch-level source IDs**: The revised schema adds `source_timesheet_ids` and `source_leave_entry_ids` to the batch level. Should these be computed as the union of all row-level source IDs (redundant but convenient), or should they be stored only at the row level to avoid duplication?

5. **Auto-supersede reason text**: When a new export automatically supersedes the previous active batch, should the system use a standardized reason (e.g., "Automatically superseded by revision N") or should the admin be prompted to provide a custom reason for every re-export?

6. **Processed batch voiding**: The current design makes processed batches fully immutable (cannot be voided). Should there be an emergency "void processed" capability restricted to OWNER only, with additional safeguards (e.g., requiring a second admin confirmation)? This would handle edge cases like an export marked processed by mistake before actually submitting to Gusto.
