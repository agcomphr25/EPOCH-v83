# PTO System Forensic Audit Report

**Date:** April 29, 2026
**Scope:** Read-only audit — no code was changed.
**Purpose:** Establish the current state of PTO capability in EPOCH as the foundation for a future PTO implementation task.

---

## 1. Executive Summary

EPOCH has **partial PTO infrastructure** in place. A single-stage `time_off_requests` table exists, employees can submit requests through the Employee Portal, and approved leave auto-injects into salaried timesheets and feeds into the Gusto payroll export. However, the system is **missing the three-stage approval chain** (Supervisor → HR → VP), has **no accrual/balance tracking**, does not support **half-day or hourly partial-day requests**, has no **manager-on-behalf-of submission**, does not auto-populate the **company calendar**, and the leave type enum is narrower than required. The gap between current capability and the target workflow is significant but well-bounded — the database, payroll wiring, and timesheet injection logic are already in place and can be extended.

---

## 2. Confirmed Existing Capability

| Capability | Status |
|---|---|
| Employee submits PTO via portal | ✅ Exists (`POST /api/timekeeping/time-off/portal/:portalId`) |
| Employee views own requests | ✅ Exists (`GET /api/timekeeping/time-off/portal/:portalId`) |
| Admin/Owner approves or denies a request | ✅ Exists (`POST /api/timekeeping/time-off/:id/review`) |
| Admin note on approval/denial | ✅ Exists (`admin_note` column) |
| Approved leave auto-injects into salaried timesheets | ✅ `injectApprovedPTO` in `salariedTimesheet.service.ts` |
| Leave hours appear in Gusto payroll export | ✅ `vacation_hours`, `sick_hours` in export CSV |
| Leave entered in timesheet lines as locked rows | ✅ `salaried_timesheet_lines.leave_entry_id`, `is_locked` |
| Audit trail on timesheet changes | ✅ `salaried_timesheet_audit` table |
| System-wide audit events table | ✅ `audit_events` in public schema |
| Role/capability permission framework | ✅ `perm_capabilities`, `perm_roles`, `perm_role_capabilities`, `perm_user_overrides` |
| Multi-stage timesheet approval (salaried) | ✅ Employee certify → Supervisor approve → Payroll approve |
| Leave check on clock-in | ✅ `GET /api/timekeeping/time-off/clock-in-check/:employeeId` |
| Calendar system exists | ✅ `Calendar.tsx`, `react-big-calendar`, Google Calendar integration |

---

## 3. Missing Capability

| Required Capability | Current State | Gap |
|---|---|---|
| Multi-stage PTO approval (Supervisor → HR → VP) | Single-stage, ADMIN/OWNER only | Requires new approval chain structure and new columns on `time_off_requests` |
| Supervisor role in PTO review | Not wired to SUPERVISOR role | Must add `SUPERVISOR` and `HR` to review permissions, add VP designation |
| HR approval stage | Does not exist | New approval stage needed |
| VP approval stage | Does not exist | New approval stage needed |
| Denial requires reason | `admin_note` is optional | Must enforce `admin_note` when `decision === "denied"` |
| Half-day requests | Not supported (date-range only) | No `hours` or `partial_day` field on `time_off_requests` |
| Hourly partial-day requests | Not supported | Same gap as half-day |
| Manager submits PTO on behalf of employee | Not wired | No `submitted_by` or `on_behalf_of` field; portal auth restricts to self |
| Single unified PTO category | Four types (`pto`, `sick`, `unpaid`, `other`) | Business requires collapsing all to one PTO category |
| Leave balance / accrual tracking | No table or logic exists | Entire accrual engine is missing |
| Approved PTO auto-populates company calendar | Not implemented | Calendar.tsx does not read from `time_off_requests` |
| Approved PTO visible in production scheduling | Not implemented | `EnhancedLayupScheduler` reads `employeeSettings`, not leave |
| Approved PTO reduces staffing capacity signals | Not implemented | No hook between leave approval and capacity planning |
| Employee receives notification on decision | Not implemented | No notification system wired to PTO review |
| Supervisor receives notification on new request | Not implemented | Same gap |

---

## 4. Technical Constraints

- **`time_off_requests.status`** is a plain `text` column defaulting to `"pending"`. It only transitions to `"approved"` or `"rejected"`. A three-stage chain requires new status values and new columns for each approver stage.
- **`leaveType` enum** in `timeoff.ts` is `["pto", "sick", "unpaid", "other"]`. If the business wants a single PTO category, the enum must be narrowed and any existing rows with other types must be considered.
- **Portal auth** (`authenticatePortalToken`) is used for employee-facing submission. Manager-on-behalf-of submissions would require either a separate authenticated route or the ability to specify a target employee ID — the current portal token resolves only the token-holder's employee ID.
- **`leave_entries` table** (the actual ledger record) is in the `timekeeping` schema and references `timekeeping.employees.id`, not `public.employees.id`. `time_off_requests` references `public.employees.id`. These are two different employee tables; the bridge must be handled carefully to avoid foreign key mismatches.
- **Salaried vs. hourly divide**: `injectApprovedPTO` only runs for salaried timesheets. Hourly employees do not get leave injected; their leave must be manually punched or handled separately.
- **Permission system**: The existing `requireRole("ADMIN", "OWNER")` middleware is a legacy role-string check, not the newer `requirePermission(capability)` pattern. Adding SUPERVISOR and HR review will need to either extend the role list or introduce a new capability (`timekeeping.review_pto`) in the `perm_capabilities` system.
- **Schema migrations**: Any new columns on `time_off_requests` require a migration. The migration system (`drizzle.config.ts`) is in place; the constraint is that migrations must not break existing rows.

---

## 5. Hidden Risks

1. **Dual employee table confusion**: `timekeeping.employees` and `public.employees` are separate tables. `leave_entries` FK points to `timekeeping.employees.id`, while `time_off_requests` FK points to `public.employees.id`. Any new approval chain actors (supervisor, HR approver) will need their IDs resolved from the correct table.
2. **`injectApprovedPTO` runs at timesheet generation time**: If a leave request is approved *after* a timesheet is already generated, the approved PTO will not appear unless the timesheet is manually recalculated or regenerated.
3. **Calendar and production scheduling are completely decoupled from leave**: Approved PTO has zero automatic effect on `Calendar.tsx` event visibility, `EnhancedLayupScheduler` capacity, or the algorithmic scheduler — all of which make staffing assumptions.
4. **No accrual balance guard**: If a balance system is added later, existing approved requests have no associated balance deductions, creating retroactive reconciliation risk.
5. **`adminNote` is optional today**: Denials without a reason are silently allowed. If denial reason becomes mandatory, a UI and API validation change is needed simultaneously.
6. **No idempotency guard on `injectApprovedPTO`**: If called multiple times (e.g., recalculate), it may inject duplicate leave lines. This is a latent bug that a PTO system expansion could surface more frequently.
7. **Notification gap**: There is no notification infrastructure (email, in-app) tied to PTO events. Multi-stage approval chains are operationally useless without reviewer notifications.

---

## 6. Recommended Reuse Points

| Component | What to Reuse |
|---|---|
| `time_off_requests` table | Extend with new columns: `hours`, `partial_day_type`, `submitted_by`, `supervisor_id`, `supervisor_decision`, `supervisor_note`, `supervisor_reviewed_at`, `hr_id`, `hr_decision`, `hr_note`, `hr_reviewed_at`, `vp_id`, `vp_decision`, `vp_note`, `vp_reviewed_at` |
| `leave_entries` table | Unchanged; still the authoritative ledger record created upon final approval |
| `injectApprovedPTO` service | Unchanged; triggered after final VP approval rather than first approval |
| Gusto export endpoint | Already emits `vacation_hours` — no change needed for unified PTO |
| `salaried_timesheet_lines` | Already supports `leave_entry_id` and `isLocked` — fully reusable |
| `salariedTimesheet.service.ts` | Reuse `injectApprovedPTO` and `injectHolidayLines` patterns |
| `perm_capabilities` system | Add `timekeeping.approve_pto_supervisor`, `timekeeping.approve_pto_hr`, `timekeeping.approve_pto_vp` capabilities |
| `audit_log` (timekeeping schema) | Extend to log each approval stage decision |
| `TimeClockAdminPage.tsx` — Time-Off tab | Already renders pending requests and a review UI; can be extended with multi-stage view |
| `EmployeePortal.tsx` — Time-Off section | Already has submission form and request status list; can be enhanced for partial-day options |
| `Calendar.tsx` | Already supports custom event types; approved PTO can be pushed as a new event type |

---

## 7. Files Reviewed

- `server/src/schema/timekeeping.ts`
- `server/src/routes/timekeeping/timeoff.ts`
- `server/src/routes/timekeeping/timesheets.ts`
- `server/src/routes/timekeeping/salariedTimesheets.ts`
- `server/src/routes/timekeeping/laborApprovals.ts`
- `server/src/routes/timekeeping/punches.ts`
- `server/src/services/timekeeping/timeoff.service.ts`
- `server/src/services/timekeeping/salariedTimesheet.service.ts`
- `server/src/services/timekeeping/timesheets.service.ts`
- `server/src/services/laborCostingService.ts`
- `server/src/services/laborPostingService.ts`
- `server/src/services/permissionService.ts`
- `server/src/permissions.ts`
- `server/middleware/requirePermission.ts`
- `server/middleware/auth.ts`
- `server/auth.ts`
- `server/schema.ts` (partial — leave, audit_events, employees, perm_* tables)
- `server/index.ts` (partial — role/capability seeding)
- `client/src/pages/EmployeePortal.tsx`
- `client/src/pages/EmployeePortalPage.tsx`
- `client/src/pages/timekeeping/TimeClockAdminPage.tsx`
- `client/src/pages/timekeeping/KioskPage.tsx`
- `client/src/pages/Calendar.tsx`
- `client/src/pages/UserManagement.tsx`
- `client/src/pages/admin/RolesPermissionsPage.tsx`
- `client/src/hooks/usePermissions.ts`
- `client/src/hooks/useActionAuth.ts`
- `client/src/components/EnhancedLayupScheduler.tsx`
- `client/src/components/p2/P2ProductionScheduler.tsx`
- `client/src/config/dashboardMapping.ts`

---

## 8. Exact Tables Found

### `timekeeping` schema (`server/src/schema/timekeeping.ts`)

**`timekeeping.time_off_requests`**
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `employee_id` | integer | FK → `public.employees.id` CASCADE DELETE |
| `start_date` | text NOT NULL | YYYY-MM-DD |
| `end_date` | text NOT NULL | YYYY-MM-DD |
| `leave_type` | text NOT NULL | Values enforced in service: `pto`, `sick`, `unpaid`, `other` |
| `status` | text DEFAULT `pending` | Values: `pending`, `approved`, `rejected` |
| `employee_note` | text | |
| `admin_note` | text | Optional even on denial — risk |
| `reviewed_at` | timestamp | Single-stage only |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**`timekeeping.leave_entries`**
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `employee_id` | integer | FK → `timekeeping.employees.id` CASCADE DELETE ⚠️ Different employee table |
| `date` | text NOT NULL | YYYY-MM-DD |
| `leave_type` | text NOT NULL | `pto`, `sick`, `holiday`, `bereavement`, `other` |
| `hours` | doublePrecision NOT NULL | |
| `note` | text | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**`timekeeping.salaried_timesheets`**
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `employee_id` | integer | FK → `public.employees.id` |
| `status` | text DEFAULT `OPEN` | `OPEN`, `SUBMITTED`, `SUPERVISOR_APPROVED`, `PAYROLL_APPROVED` |
| `certified_at`, `certified_by` | timestamp, integer | Stage 1 — employee |
| `supervisor_approved_at` | timestamp | Stage 2 — supervisor |
| `payroll_approved_at`, `payroll_approved_by` | timestamp, integer | Stage 3 — payroll/HR |
| `reopened_at`, `reopen_reason` | timestamp, text | Escalation support |

**`timekeeping.salaried_timesheet_lines`**
| Column | Type | Notes |
|---|---|---|
| `leave_entry_id` | integer | Links back to `leave_entries` |
| `is_locked` | boolean | Prevents editing injected PTO lines |
| `line_type` | text | `LEAVE`, `PROJECT`, `INDIRECT`, etc. |
| `hours` | doublePrecision | |

**`timekeeping.audit_log`** — full change trail per record (table_name, record_id, action, old/new values, actor)

**`timekeeping.salaried_timesheet_audit`** — timesheet-specific audit log with before/after state JSON

### `public` schema (`server/schema.ts`)

**`public.employees`** — relevant columns:
- `id`, `name`, `hire_date`, `employment_type` (`FULL_TIME`, `PART_TIME`, `CONTRACT`), `pay_type` (`HOURLY`, `SALARY`), `isActive`, `timezone`
- **No `supervisor_id` or `manager_id` column found** — supervisor relationships are not modeled

**`public.perm_capabilities`** — registry of all capability strings  
**`public.perm_roles`** — system roles: `ADMIN`, `OWNER`, `MANAGER`, `SUPERVISOR`, `FLOOR_OPERATOR`, `DOCUMENT_MANAGER`  
**`public.perm_role_capabilities`** — role → capability mapping  
**`public.perm_user_overrides`** — per-user allow/deny overrides  
**`public.perm_user_capability_scopes`** — department/project scoped access  
**`public.audit_events`** — system-wide audit log (entity_type, action, actor_id, reason, fields_changed)

---

## 9. Exact Routes Found

### Time-Off
| Method | Endpoint | Auth | Role |
|---|---|---|---|
| POST | `/api/timekeeping/time-off/portal/:portalId` | Portal token | Self only |
| GET | `/api/timekeeping/time-off/portal/:portalId` | Portal token | Self only |
| GET | `/api/timekeeping/time-off` | Session | ADMIN, OWNER |
| POST | `/api/timekeeping/time-off/:id/review` | Session | ADMIN, OWNER |
| GET | `/api/timekeeping/time-off/clock-in-check/:employeeId` | Session | ADMIN, OWNER |

### Timesheet Approvals (salaried)
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/timekeeping/salaried-timesheet/:id/certify` | Employee self-certification |
| POST | `/api/timekeeping/salaried-timesheet/:id/supervisor-approve` | Stage 2 |
| POST | `/api/timekeeping/salaried-timesheet/:id/payroll-approve` | Stage 3 (final) |
| POST | `/api/timekeeping/salaried-timesheet/:id/reopen` | Escalation / correction |

### Payroll Export
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/timekeeping/admin/export/gusto` | CSV: regular, OT, sick, vacation hours |

---

## 10. Exact UI Components Found

| Component | File | Route | Notes |
|---|---|---|---|
| Employee PTO submission + status view | `client/src/pages/EmployeePortal.tsx` line 236+ | `/employee-portal/:portalId` | Exists; limited to date-range requests |
| Salaried timesheet with leave lines | `client/src/pages/EmployeePortal.tsx` line 281+ | Same | Locked leave rows injected |
| Admin Time-Off review tab | `client/src/pages/timekeeping/TimeClockAdminPage.tsx` | `/time-clock-admin` | Shows pending requests; approve/deny |
| Company calendar | `client/src/pages/Calendar.tsx` | `/calendar` | Does NOT show approved PTO |
| User role management | `client/src/pages/UserManagement.tsx` | `/users` | ADMIN/OWNER only |
| Roles & permissions UI | `client/src/pages/admin/RolesPermissionsPage.tsx` | `/admin/roles-permissions` | Can assign capabilities to roles |
| Production capacity board | `client/src/components/EnhancedLayupScheduler.tsx` | Embedded in scheduling pages | NOT aware of leave |

---

## 11. Approval Chain Feasibility

**Target chain: Employee → Supervisor → HR → VP**

| Stage | Current Support | Gap |
|---|---|---|
| Employee submits | ✅ Working | None |
| Supervisor reviews | ❌ Not supported | SUPERVISOR role not wired to review; no `supervisor_id` on employee record; no `supervisor_decision` column |
| HR reviews | ❌ Not supported | No HR stage; no `hr_decision` column; `HR` role exists in legacy role system but not wired to PTO |
| VP reviews | ❌ Not supported | No VP concept in any leave table or role; no `vp_decision` column |
| Denial requires reason | ⚠️ Partial | `admin_note` exists but is optional — not enforced on denial |
| Approval comments | ⚠️ Partial | `admin_note` covers current approver; each stage needs its own note field |
| Escalation | ❌ Not supported | No escalation timeout, delegation, or override path |
| Delegation | ❌ Not supported | No delegate/backup approver pattern |

**Verdict**: The approval chain requires structural additions to `time_off_requests` (new stage columns) and new capabilities in the permission system. The salaried timesheet three-stage pattern is a usable reference implementation for how to build it.

---

## 12. Payroll Integration Findings

- **Payroll export** (`GET /api/timekeeping/admin/export/gusto`) already emits leave hours as separate columns: `vacation_hours`, `sick_hours`, `holiday_hours`.
- **Indirect costing**: Approved PTO is classified as `OVERHEAD` or `G&A` via indirect codes in `salaried_timesheet_lines`. The `laborCostingService.ts` handles dollar costing at the employee's resolved rate.
- **GL posting**: `laborPostingService.ts` groups non-WAD labor (including PTO) by cost type for GL entries.
- **Fringe calculations**: The `FRINGE` cost center is validated in EDRI scoring but PTO burden rate application depends on how charge codes are mapped — this is not fully automated.
- **Gap**: Hourly employees get no automatic leave injection into their timesheets — their PTO would need to be manually added as a punch adjustment or a separate mechanism.
- **Gap**: No payable-hours guard — nothing prevents an employee from being paid for PTO and also clocking in on the same day (the clock-in check endpoint exists but is informational, not blocking at the payroll level).

---

## 13. Calendar Integration Findings

- `Calendar.tsx` uses `react-big-calendar` and supports multiple shared calendars plus Google Calendar sync.
- Event model has fields: `title`, `description`, `startDate`, `endDate`, `location`, `allDay`, `eventType` (`meeting`, `deadline`, `reminder`, `task`, `other`).
- **No connection exists** between `time_off_requests` or `leave_entries` and the calendar event store.
- `EnhancedLayupScheduler.tsx` computes daily capacity from `employeeSettings` but does not query leave data.
- The algorithmic scheduler (`algorithmicScheduler.ts`) does not factor in employee absence.
- **Implementation path**: A post-approval hook could create a calendar event of type `other` (or a new `leave` type) for the approved employee, visible on shared calendars. Production schedulers would need to subtract absent employees from daily capacity calculations.

---

## 14. Final Implementation Readiness Score

**6 / 10**

**Rationale:**
- The data plumbing (tables, payroll export, salaried timesheet injection, audit logging) is already in place and working — that is significant reuse value.
- The UI surfaces (employee portal submission, admin review tab, calendar) exist and can be extended rather than built from scratch.
- The permission framework is mature enough to absorb new PTO-specific capabilities cleanly.
- **However**, the core business requirement — a three-stage approval chain — requires new schema columns, new API stages, new permission capabilities, and new UI states. These are non-trivial additions.
- Accrual/balance tracking is entirely absent and would be a separate workstream.
- Calendar and production scheduling integration require new data pipelines.
- Supervisor relationships (who is whose supervisor) are not modeled anywhere in the current schema, which is a prerequisite for routing Stage 1 approvals correctly.
