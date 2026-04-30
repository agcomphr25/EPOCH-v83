# Salaried Timesheet System — Full Audit & Phase Plan

**Date:** April 24, 2026  
**Status:** Ready for Owner Review  
**Scope:** Audit only — no code changes made

---

## A. Executive Summary

### What exists today

- A mature hourly punch system using `public.punch_ledger` as the unified ledger (kiosk, portal, traveler-scan). Entry points: `server/src/lib/punchLedger.ts`, `server/src/routes/timeClock.ts`, `client/src/pages/timekeeping/KioskPage.tsx`.
- An Employee Portal at `/employee-portal/:portalId` (`client/src/pages/EmployeePortal.tsx`, `client/src/components/EmployeePortal.tsx`) with time-off requests, punch status, training, and certifications.
- A `timekeeping.*` PostgreSQL schema (legacy standalone app absorbed) with `timesheets`, `leave_entries`, `time_off_requests`, `punches`, and `certifications` tables — defined in `server/src/schema/timekeeping.ts`.
- A Gusto payroll export pipeline at `GET /api/timekeeping/admin/export/gusto` (`server/src/routes/timekeeping/timesheets.ts`) that currently hardcodes `vacation_hours` and `sick_hours` to 0.
- Charge codes (`DIRECT`, `OVERHEAD`, `G_AND_A`), cost centers, departments, and projects fully modeled in `public` schema.
- A robust audit event system (`public.audit_events`, `server/src/services/auditService.ts`, `shared/auditConfig.ts`) with CMMC/NIST AU-2 compliance patterns.
- Employee pay type (`HOURLY` / `SALARY`) already present in `public.employees.payType` — the key gate for salaried-vs-hourly feature isolation.
- PTO request/approval flow with `timekeeping.time_off_requests` and `timekeeping.leave_entries`; no accrual balance engine yet. Routes: `server/src/routes/timekeeping/timeoff.ts`, service: `server/src/services/timekeeping/timeoff.service.ts`.
- Holiday calendar via Google Calendar integration (US Holidays calendar) plus a local event system.
- A secondary timekeeping audit table `timekeeping.labor_entry_audit` already exists alongside the main `timekeeping.audit_log` table.

### What is safe to reuse

| Item | File / Table |
|---|---|
| `payType = 'SALARY'` gate | `public.employees.payType` |
| Approved PTO entries (locked lines) | `timekeeping.leave_entries` |
| PTO approval state | `timekeeping.time_off_requests` |
| Charge code dropdown | `public.charge_codes` (types `DIRECT`/`OVERHEAD`/`G_AND_A`) |
| Projects / WADs | `public.projects` |
| Audit logging | `server/src/services/auditService.ts` → `logEvent()`, `logFieldChanges()` |
| Holiday calendar | Google Calendar US Holidays endpoint |
| Week/pay-period boundaries | `server/src/services/payPeriod.ts` |
| Role/permission gating | `server/src/services/permissionService.ts` |
| Portal token-auth pattern | `authenticatePortalToken` middleware |
| `timekeeping.timesheets` structure | Extend or mirror for salaried |

### What is risky

- **Gusto export:** currently hardcodes vacation/sick to 0. Adding salaried data without strict isolation could corrupt payroll output for hourly employees. The blocking check and column write must be completely separated.
- **`timekeeping.punches` dual-read:** `computeHoursForPeriod` in `server/src/services/timekeeping/timesheets.service.ts` reads both `timekeeping.punches` (legacy) and `punch_ledger` (current). Salaried timesheets must not touch this path.
- **`timekeeping.employees` bridge table:** Salaried employees need an anchor record to appear on the In/Out Board. Acceptable to skip for Phase 1.
- **`isInApprovedTimesheetPeriod`:** Logic in the leave service currently locks *hourly* timesheets; must not bleed into salaried timesheet locking.
- **`modules/timekeeping/` legacy directory:** Still present. Its routes return 410 but the directory could confuse future developers.

### What must not be touched

- `public.punch_ledger` write paths (`openSession`, `closeSession`, `switchAssignment`) in `server/src/lib/punchLedger.ts`.
- All kiosk and traveler clock-in routes in `server/src/routes/timeClock.ts`.
- `server/src/services/timekeeping/dashboard.service.ts` (In/Out Board logic).
- Hourly timesheet approval and Gusto export paths.
- `timekeeping.punches` (legacy, still read by some queries).
- All gate enforcement in `evaluateTravelerClockInGates`.

---

## B. Current Architecture Map

### Frontend routes / components

| File | Purpose |
|---|---|
| `client/src/pages/EmployeePortal.tsx` | Main employee self-service page — add Timesheet tab here |
| `client/src/components/EmployeePortal.tsx` | Tabbed component — safe extension point |
| `client/src/pages/timekeeping/TimeClockAdminPage.tsx` | Admin review — add salaried tab here |
| `client/src/pages/timekeeping/KioskPage.tsx` | Hourly only — do not modify |
| `client/src/config/userPermissions.ts` | Route access gating |

### Backend routes / services

| File | Purpose |
|---|---|
| `server/src/routes/timekeeping/timeoff.ts` | PTO approval flow |
| `server/src/routes/timekeeping/timesheets.ts` | Hourly timesheet routes — salaried goes in a parallel file |
| `server/src/services/timekeeping/timesheets.service.ts` | `computeHoursForPeriod`, `exportApprovedTimesheetsForGusto` |
| `server/src/services/timekeeping/timeoff.service.ts` | PTO service |
| `server/src/services/timekeeping/leave.service.ts` | Leave entry CRUD — source of approved PTO to inject |
| `server/src/services/timekeeping/dashboard.service.ts` | In/Out Board — do not modify |
| `server/src/services/payPeriod.ts` | Pay period / week boundary logic |
| `server/src/services/auditService.ts` | Central audit logging |
| `server/src/services/laborCostingService.ts` | Hourly vs salaried rate resolution |
| `server/src/services/permissionService.ts` | Capability-scoped permissions |

### Database tables

| Table | Schema | Purpose |
|---|---|---|
| `employees` | `public` | `payType` (`HOURLY`/`SALARY`), `employmentType` |
| `punch_ledger` | `public` | Hourly/traveler sessions — read-only for salaried import |
| `charge_codes` | `public` | `DIRECT`, `OVERHEAD`, `G_AND_A` |
| `projects` | `public` | Direct labor attribution |
| `cost_centers`, `departments` | `public` | Indirect labor grouping |
| `audit_events` | `public` | Append-only event log |
| `timesheets` | `timekeeping` | Hourly timesheet periods |
| `leave_entries` | `timekeeping` | PTO/sick/holiday entries |
| `time_off_requests` | `timekeeping` | Request/approval records |
| `audit_log`, `labor_entry_audit` | `timekeeping` | Existing timekeeping audit tables |

### New tables needed (salaried-specific, all in `timekeeping` schema)

| Table | Purpose |
|---|---|
| `salaried_timesheets` | Weekly period header per employee |
| `salaried_timesheet_lines` | Daily line items |
| `salaried_timesheet_audit` | Before/after change records |
| `indirect_codes` | Company-controlled indirect labor code set |
| `comp_balances` | Comp time accrual ledger (Phase 5) |

### Permissions / roles needed

| Capability | Who |
|---|---|
| `salaried_timesheet.view_own` | All SALARY employees |
| `salaried_timesheet.submit` | All SALARY employees |
| `salaried_timesheet.review` | Supervisor, HR, Payroll, Upper Management |
| `salaried_timesheet.adjust` | HR, Payroll, Upper Management |
| `salaried_timesheet.approve` | HR, Payroll, Upper Management |
| `salaried_timesheet.block_payroll` | Payroll, Upper Management |

### Traveler / labor capture touchpoints

- `public.punch_ledger` rows with `source = 'TRAVELER'` and a `traveler_id` / `charge_code_id`
- `server/src/routes/timeClock.ts` — traveler scan routes (read-only for import)
- `server/src/lib/resolveChargeCode.ts` — charge code resolution from traveler step

### Payroll / PTO / reporting touchpoints

- `exportApprovedTimesheetsForGusto` in `server/src/services/timekeeping/timesheets.service.ts`
- `timekeeping.leave_entries` → import approved PTO as locked lines
- Google Calendar US Holidays → auto-inject holiday lines on timesheet creation

---

## C. Data Flow Diagrams

### 1. Current hourly punch flow
```
Employee → Kiosk / Portal / Traveler scan
  → punchLedger.openSession() → punch_ledger INSERT (clockOut = NULL)
  → (traveler scan) → punchLedger.switchAssignment() → UPDATE in-place
  → punchLedger.closeSession() → UPDATE clockOut
  → computeHoursForPeriod() aggregates punch_ledger + legacy timekeeping.punches
  → Timesheet approved → Gusto export
```

### 2. Current traveler / labor capture flow
```
Barcode scan → resolveTravelerBarcode() → chargeContext {travelerId, WAD, dept, op}
  → evaluateTravelerClockInGates() → WAD release + material + training checks
  → evaluateWorkOrderLaborStatus() → budget check
  → punch_ledger row open / updated with travelerId + chargeCodeId
  → epoch_labor_facts append-only projection
  → labor_entry_audit DCAA log
```

### 3. Current PTO flow
```
Employee → POST /time-off/portal/:portalId → time_off_requests INSERT (pending)
  → Admin → POST /time-off/:id/review → status = approved
  → leave_entries INSERT for each approved date (hours = 8 hardcoded)
  → isInApprovedTimesheetPeriod() blocks edits if period locked
  → Gusto export: vacation_hours / sick_hours currently hardcoded 0
```

### 4. Proposed salaried timesheet flow
```
Week boundary (Mon–Sun) auto-creates salaried_timesheets record (status: OPEN)
  → holiday lines auto-injected from Google Calendar US Holidays
  → approved leave_entries auto-injected as locked PTO/sick lines
  → traveler punch_ledger rows (salaried employee, source=TRAVELER) surfaced as importable suggestions
  → Employee → Timesheet tab (Employee Portal)
      → adds / edits / splits lines (direct, indirect, PTO, holiday)
      → each edit → salaried_timesheet_audit INSERT (before/after, actor, reason)
  → System validates: sum of all line hours = total_actual_hours (100% rule)
  → Employee certifies → status: SUBMITTED, certification_timestamp
  → Supervisor (if applicable) → status: SUPERVISOR_APPROVED
  → HR/Payroll → status: PAYROLL_APPROVED
  → Payroll export blocked if any salaried_timesheets NOT IN (PAYROLL_APPROVED, WAIVED) for the pay period
```

### 5. Proposed payroll blocking / reporting flow
```
Payroll run initiated
  → Pre-flight: SELECT * FROM salaried_timesheets
      WHERE period_end <= payroll_cutoff
        AND status NOT IN ('payroll_approved', 'waived')
        AND employee.payType = 'SALARY'
  → Any rows → BLOCK export, return list of unresolved employees
  → After 3 days past deadline: notification escalation to HR/Payroll
  → HR/Payroll can: adjust lines (with audit), reopen, force-approve, or waive
  → Once all clear → Gusto export augmented with salaried PTO/leave hours
```

---

## D. Gap Analysis

| Requirement | Status |
|---|---|
| Employee `payType = SALARY` distinguisher | ✅ Exists (`public.employees.payType`) |
| Weekly period model | ✅ Partially (`server/src/services/payPeriod.ts`) |
| Salaried timesheet table | ❌ Missing |
| Daily line items (direct, indirect, PTO, holiday) | ❌ Missing |
| 100% weekly accounting enforcement | ❌ Missing |
| Indirect code controlled dropdown | ⚠️ Partially — `charge_codes` has OVERHEAD/G&A types but no company-controlled indirect code list |
| PTO import into timesheet | ⚠️ Partially — `leave_entries` exist but not linked to a salaried timesheet |
| Holiday auto-injection | ⚠️ Partially — Google Calendar integration exists but not wired to timesheet creation |
| Traveler import as direct labor suggestions | ⚠️ Partially — `punch_ledger` rows exist; no import bridge for salaried |
| Free splitting of time across codes | ❌ Missing |
| Manual direct labor against project (no traveler) | ❌ Missing |
| Weekly employee certification | ❌ Missing |
| Audit trail for every change | ⚠️ Partially — `AuditService` exists but no salaried-specific audit table |
| Supervisor review | ❌ Missing |
| HR/Payroll/Upper Management adjustment authority | ❌ Missing |
| Formal reopen/correction workflow | ❌ Missing |
| Payroll blocking if unresolved timesheets | ❌ Missing |
| In-app reminders after 3 days | ❌ Missing |
| Comp time accrual | ❌ Missing |
| Employee portal tab for salaried timesheet | ❌ Missing |
| Admin review dashboard for salaried | ❌ Missing |
| Gusto export augmented with salaried leave | ⚠️ Leave hours hardcoded to 0 |
| DCAA audit trail defensibility | ⚠️ Partially — framework exists, salaried-specific tables missing |
| Mobile-responsive Employee Portal | ✅ Portal uses Tailwind/shadcn (responsive capable) |

---

## E. Recommended Phase Plan

### Phase 1 — Schema, indirect codes, and safe UI placement
- Add `timekeeping.salaried_timesheets`, `timekeeping.salaried_timesheet_lines`, `timekeeping.salaried_timesheet_audit` tables via Drizzle migration.
- Seed `timekeeping.indirect_codes` with initial company-wide set in migration.
- Add salaried capabilities to `permissionService`.
- Add feature-flagged "Timesheet" tab to Employee Portal (visible only to `payType = SALARY`).
- Auto-create weekly timesheet records for salaried employees.
- Auto-inject holidays and approved PTO as locked lines.
- Stub admin review tab in `TimeClockAdminPage`.
- Add `salaried_timesheet_enabled` flag to `timekeeping.settings`.

### Phase 2 — Salaried timesheet core
- Full line-item CRUD (add, edit, delete, split) with audit trail on every change.
- Direct labor lines (charge code + project, or traveler import suggestion).
- Indirect labor lines using controlled dropdown from `indirect_codes`.
- 100% weekly accounting validation before certification is allowed.
- Weekly employee certification endpoint + UI.
- Total actual hours worked field (not fixed 8h assumption).

### Phase 3 — Traveler import and correction workflow
- Import bridge: pull salaried employee's `punch_ledger` rows (`source = 'TRAVELER'`) into timesheet as importable suggestions.
- Employee can accept, edit, split, or reject suggestions.
- Full before/after audit trail on imported line edits.
- Formal reopen/correction workflow with reason capture.
- Admin can adjust lines with mandatory reason and audit entry.

### Phase 4 — Approval flow, payroll blocking, reminders, and reporting
- Supervisor review step (where applicable).
- HR/Payroll/Upper Management review and force-approve paths.
- Payroll pre-flight blocking check integrated into Gusto export route.
- In-app reminder notifications at 3-day escalation threshold.
- Payroll blocking dashboard showing unresolved salaried timesheets.
- Salaried leave hours wired into Gusto export (replacing hardcoded 0).

### Phase 5 — Comp time accrual and executive exception path
- `timekeeping.comp_balances` accrual ledger.
- Overtime recorded on timesheet feeds comp accrual (no automatic pay impact).
- PTO-approval-gated comp borrowing only.
- Balance reporting and audit trail for comp time.
- Executive/owner lighter certification exception path.

---

## F. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Hourly punch logic corrupted | HIGH | All salaried timesheet tables in `timekeeping` schema; no writes to `punch_ledger` |
| In/Out Board broken for salaried | MEDIUM | Salaried employees not shown on board (Phase 1 acceptable); document explicitly |
| Gusto export corrupted with salaried data | HIGH | Add salaried blocking check as pre-flight gate; do not modify hourly export columns |
| PTO balance double-counted | MEDIUM | Salaried timesheet lines reference `leave_entry_id` FK to prevent duplication |
| Traveler labor costing misattributed | MEDIUM | Import bridge is read-only from `punch_ledger`; no writes back to hourly tables |
| Legacy `timekeeping.*` tables confusing salaried dev | MEDIUM | Add schema comments; document in AGENT_RULES.md that salaried tables are distinct |
| DCAA audit gap on salaried | HIGH | `salaried_timesheet_audit` required for every line change; certification timestamp mandatory |
| User confusion hourly vs. salaried UI | MEDIUM | `payType` gate ensures only salaried employees see Timesheet tab; no shared UI |
| `modules/timekeeping/` legacy code reawakened | LOW | Legacy routes return 410; standalone module not imported |
| Payroll run before 3-day escalation | MEDIUM | Blocking check does not wait for escalation; unresolved timesheets block regardless of day count |

---

## G. Implementation Recommendations

### Tables needed

**`timekeeping.salaried_timesheets`**
```
id, employee_id, period_start, period_end, status, total_actual_hours,
certified_at, certified_by, supervisor_approved_at, payroll_approved_at,
payroll_approved_by, reopened_at, reopen_reason, created_at
```

**`timekeeping.salaried_timesheet_lines`**
```
id, timesheet_id, date, line_type [DIRECT|INDIRECT|PTO|HOLIDAY|COMP],
charge_code_id, indirect_code_id, project_id, traveler_id, leave_entry_id,
hours, source [MANUAL|TRAVELER_IMPORT|PTO_IMPORT|HOLIDAY_AUTO|HR_ADJUSTMENT],
note, created_by, updated_by, created_at, updated_at, is_locked
```

**`timekeeping.salaried_timesheet_audit`**
```
id, timesheet_id, line_id, action, actor_id, actor_name, actor_role,
before_state jsonb, after_state jsonb, reason, source, ip_address, timestamp
```

**`timekeeping.indirect_codes`**
```
id, code, label, description, is_active, sort_order
```
Seeded with: G&A/Admin, Supervision/Management, Machine Maintenance, Safety Meeting, Training, Quality Review, Proposal/Estimating Support, Internal Engineering, Facility/Shop Support, PTO, Holiday

**`timekeeping.comp_balances`** (Phase 5)
```
id, employee_id, period, hours_accrued, hours_used, balance, notes
```

### APIs needed

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/salaried-timesheet/my/:weekStart` | Fetch or auto-create timesheet for week |
| GET | `/api/salaried-timesheet/my/list` | List employee's timesheet history |
| POST | `/api/salaried-timesheet/:id/lines` | Add a line |
| PATCH | `/api/salaried-timesheet/:id/lines/:lineId` | Edit a line (triggers audit) |
| DELETE | `/api/salaried-timesheet/:id/lines/:lineId` | Remove a line |
| POST | `/api/salaried-timesheet/:id/certify` | Employee weekly certification |
| POST | `/api/salaried-timesheet/:id/reopen` | Reopen with reason |
| GET | `/api/salaried-timesheet/admin/review` | HR/Payroll review queue |
| POST | `/api/salaried-timesheet/:id/admin/adjust` | HR/Payroll line adjustment |
| POST | `/api/salaried-timesheet/:id/approve` | Supervisor / payroll approval |
| GET | `/api/salaried-timesheet/payroll/blocking-check` | Pre-flight for Gusto export |
| GET | `/api/indirect-codes` | Dropdown data |
| GET | `/api/salaried-timesheet/:id/import-suggestions` | Phase 3: traveler punch_ledger rows |

### UI screens needed

- **Employee Portal — "Timesheet" tab** (`payType = SALARY` only): weekly grid, line editor, PTO/holiday locked rows, certification button, 100% progress indicator.
- **Admin — "Salaried Timesheets" tab** in `TimeClockAdminPage`: review queue, line adjustment, reopen, force-approve.
- **Payroll blocking dashboard**: list of unresolved timesheets with escalation status.

### Audit logging approach

- Every line add/edit/delete writes to `timekeeping.salaried_timesheet_audit` with before/after JSON, actor, role, reason, source, and IP.
- Use existing `AuditService.logEvent()` in parallel for critical events (certification, reopen, payroll approval) to `public.audit_events`.
- Certification timestamp is immutable once set; reopen creates a new audit entry with reason.

### Feature flags needed

- `salaried_timesheet_enabled` — gates the entire feature; off by default; enable per-environment.
- `salaried_traveler_import_enabled` — Phase 3 gate for traveler import bridge.

### Migration strategy

- All new tables in `timekeeping` schema via numbered Drizzle migrations.
- Seed `indirect_codes` in the migration (not a separate script).
- No modifications to existing hourly tables.
- Add `salaried_timesheet_enabled` to `timekeeping.settings`.

### Rollback strategy

- All new tables can be dropped without affecting the hourly system.
- Feature flag disables all salaried UI and API routes immediately.
- No foreign keys from existing hourly tables to new salaried tables.

### Test cases needed

| Test | Assertion |
|---|---|
| 100% accounting rule | Certification blocked when sum of hours < `total_actual_hours` |
| PTO injection | Approved `leave_entry` auto-creates a locked line; cannot be edited by employee |
| Holiday injection | Holiday calendar event auto-creates a locked line for that day |
| Audit trail | Every line edit creates a `salaried_timesheet_audit` row with correct before/after |
| Payroll blocking | Gusto export returns 409 if any salaried timesheet is unresolved for the period |
| Role gate | Hourly employee cannot access salaried timesheet tab or API endpoints |
| Traveler import | `punch_ledger` rows (TRAVELER source) appear as suggestions; accepting one creates a line with `source = TRAVELER_IMPORT` |
| Reopen | Reopened timesheet resets to OPEN; records reason; prior certification timestamp preserved in audit |

---

## H. Questions for Owner (Block Implementors)

1. **Week boundary**: Is the salaried week Mon–Sun (matching bi-weekly pay period anchor), or does it follow a different boundary?

2. **Total actual hours**: Should the employee manually enter the total hours they worked (which all lines must sum to), or is it derived automatically from the sum of all lines?

3. **Supervisor approval**: Is supervisor approval mandatory for all salaried employees, or only certain departments/employees? Is the supervisor always the department manager?

4. **Executive exception path**: What specific rules govern the executive/owner lighter path — do they certify but skip supervisor review, or do they have a different 100% rule?

5. **Indirect codes**: Is the initial list of 11 indirect codes (G&A, Supervision, Maintenance, Safety, Training, Quality, Proposal, Internal Engineering, Facility, PTO, Holiday) the complete Phase 1 list, or are there additions/changes?

6. **PTO hours per day**: Approved PTO currently defaults to 8 hours. For salaried, should this be configurable per employee (e.g., standard day = actual hours they typically work), or remain 8?

7. **Payroll blocking cutoff**: What is the exact cutoff day/time after which unresolved salaried timesheets trigger the blocking check (i.e., when does "the pay period has closed" for salaried)?

8. **Comp time policy**: Does the company want to track comp time starting in Phase 1, or is Phase 5 acceptable? If Phase 5, should overtime lines on Phase 2 timesheets be retroactively processable?

9. **In/Out Board for salaried**: Confirm that salaried employees appearing on the In/Out Board is explicitly not required in Phase 1.

10. **Gusto export fields**: When salaried timesheets are payroll-approved, what specific Gusto fields should be populated (e.g., `regular_hours`, `vacation_hours`, `sick_hours`, `overtime_hours`)?
