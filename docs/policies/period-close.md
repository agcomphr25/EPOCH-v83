# Period Close Policy

**Effective date:** 2026-05-06
**Owner:** Controller
**Change summary (initial):** Initial draft establishing pay period and accounting period close procedures.

## Purpose

Ensure each pay period and accounting period is closed in a controlled, repeatable, and auditable way, with immutable evidence retained for DCAA review.

## Scope

All pay periods (typically bi-weekly) and all accounting periods (monthly, quarterly, annual).

## Policy

1. **Pre-close gates** — Before a period may be closed: (a) every employee in the period has certified all days, (b) every supervisor has approved their team, (c) all open corrections are resolved.
2. **Payroll export batch** — Closing a pay period generates an immutable payroll export batch with an SHA-256 checksum and is recorded in `payroll_export_batches`.
3. **Correction lockout** — Once a payroll export batch is `ACTIVE` for a period, corrections to that period are blocked until the batch is voided or the period is reopened with controller approval.
4. **Reopen procedure** — Reopening a closed period requires controller approval, a written reason, and produces an audit event. Any subsequent re-export creates a new batch (the original batch is retained).
5. **Accounting period close** — Monthly close runs the indirect cost allocation engine (see [indirect-cost-allocation.md](./indirect-cost-allocation.md)) and posts allocated costs to GL. The close is final once the trial balance is signed off by the controller.
6. **Evidence retention** — Export CSVs, checksums, approver IDs, and certification status snapshots are retained for the federal contract record retention period.

## References

- [approvals.md](./approvals.md), [corrections.md](./corrections.md), `docs/payroll-export-design.md`
