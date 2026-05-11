# Phase 3 DCAA And Quality Maturity

Phase 3 ties the DCAA labor controls and quality management controls into one maturity matrix. It does not replace the operating routes. It declares the required controls, evidence locations, blockers, audit events, and exit criteria so dashboards and closeout checks have a single source of truth.

## Live coverage endpoint

`GET /api/governance/phase3-dcaa-quality-maturity`

The endpoint returns the Phase 3 domain matrix from `server/src/services/phase3DcaaQualityMaturity.ts`, including:

- daily employee time certification
- supervisor approval completeness dashboards
- period-close hard lock and reopen workflow coverage checks
- NCR/CAPA expansion
- calibration management and lockout

## Coverage matrix

| Domain | Primary control | Source of truth | Required blocker behavior |
| --- | --- | --- | --- |
| Daily time certification | Employee time certification | `timekeeping.timesheets`, `timekeeping.salaried_timesheets`, `audit_events` | Reject submission or payroll-ready state without certification or audited override |
| Supervisor approval dashboards | Approval completeness dashboard | `labor_approvals`, timesheet review fields | Treat unresolved critical approval exceptions as close blockers |
| Period close lock/reopen | Hard lock and reopen coverage checks | `accounting_periods`, `payroll_export_batches`, `audit_events` | Block locked-period writes unless the period is reopened through the approved workflow |
| NCR/CAPA expansion | Closed-loop nonconformance and CAPA | `nonconformance_records`, `capa_records`, traveler events | Block affected shipment, closeout, or traveler completion when critical quality issues are open |
| Calibration lockout | Calibration asset and event control | `calibration_assets`, `calibration_events` | Lock out expired or failed assets until a passing calibration event restores active status |

## Phase 3 control intent

Phase 1 established the controlled approval and audit foundation. Phase 2 carried material and contract evidence through the lifecycle. Phase 3 closes maturity gaps auditors and customers will test directly: employees certify their own time, supervisors approve it completely, periods lock hard, quality escapes turn into NCR/CAPA evidence, and expired or failed calibrated tools cannot keep being used.

## Required audit events

The Phase 3 coverage service declares the audit events each track needs before it can be considered implementation-complete:

- `TIME_CERTIFIED`
- `TIME_CERTIFIED_ADMIN`
- `DAILY_CERTIFIED`
- `LABOR_APPROVED`
- `DAILY_APPROVED`
- `TIMEKEEPING_SUPERVISOR_EXCEPTION_REVIEWED`
- `ACCOUNTING_PERIOD_STATUS_CHANGED`
- `PERIOD_CLOSE`
- `PERIOD_REOPEN`
- `PAYROLL_PERIOD_LOCKED`
- `NCR_CREATED`
- `NCR_DISPOSITION`
- `CAPA_CREATED`
- `CAPA_EFFECTIVENESS_VERIFIED`
- `CALIBRATION_ASSET_CREATED`
- `CALIBRATION_EVENT_RECORDED`
- `CALIBRATION_ASSET_LOCKED_OUT`

## Exit criteria

Phase 3 is ready to close when:

- uncertified hourly or salaried time cannot advance without a recorded certification statement and timestamp
- supervisor approval exceptions show missing, stale, self-approved, unsigned finalized, and exported-at-risk labor
- period close checks verify certification, supervisor approval, payroll export, and correction coverage before hard lock
- locked-period writes fail fast and route users to the reopen or correction workflow
- NCRs link to affected order, traveler, lot, supplier, or receipt scope
- CAPAs carry root cause, containment, corrective action, preventive action, owner, due date, and effectiveness verification
- expired or failed calibration assets are locked out from production, inspection, and shipment signoff until released
