# Timekeeping Policy

**Effective date:** 2026-05-06
**Owner:** Director of Operations
**Change summary (initial):** Initial DCAA-aligned draft governing daily time entry, supervisor approval, and certification.

## Purpose

Establish the rules every employee, supervisor, and administrator must follow when recording, certifying, and approving time worked. This policy is the foundation for accurate labor cost, billing under government contracts, and DCAA compliance.

## Scope

Applies to all employees (hourly and salaried), contractors performing work on company premises or systems, and any user who enters or approves time in EPOCH.

## Policy

1. **Daily entry** — Time worked must be recorded the same day it is performed. Hourly employees punch in/out via the time clock; salaried employees use the salaried draft entry surface (when enabled by `SALARIED_DRAFT_ENTRY_ENABLED`) and certify daily.
2. **Total time accounting** — All hours worked, paid or unpaid, billable or non-billable, direct or indirect, must be recorded against an authorized charge code or work order.
3. **Daily certification** — Every employee certifies their own time daily. Certification asserts that the recorded hours are true, complete, and charged to the correct codes.
4. **Supervisor approval** — Supervisors approve their direct reports' time at least weekly and before any payroll export.
5. **No proxy entry** — Only the employee may enter or modify their own time, except through the controlled correction workflow (see [corrections.md](./corrections.md)).
6. **Audit trail** — Every entry, edit, certification, and approval is recorded in the `punch_ledger` and audit log with timestamp, actor, and reason.

## Roles & responsibilities

- **Employees:** Record time daily, certify accuracy, request corrections when needed.
- **Supervisors:** Review and approve weekly; investigate exceptions.
- **Payroll administrators:** Verify all certifications and approvals are in place before exporting payroll.

## References

- EPOCH Architecture Constitution — DCAA section
- Compliance task: written policies (this task)
- Pipeline: `punch_ledger` → `charge_codes` → `labor_approvals` → GL → payroll → DCAA
