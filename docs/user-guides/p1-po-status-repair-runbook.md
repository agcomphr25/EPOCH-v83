# P1 PO Status Repair Runbook

This runbook is for repairing existing P1 purchase order status drift after the P1 PO status rules are deployed.

## What This Repair Does

The repair uses the current P1 PO production status rules:

- `P1 Production Queue` means `PENDING`
- any active department before shipped or fulfilled means `LAID_UP`
- `Shipped` or `Fulfilled` means `SHIPPED`
- `CANCELLED` stays cancelled unless a user explicitly reactivates the item

When applied, the repair can update:

- `production_orders.production_status`
- `purchase_orders.status`, only from `CLOSED`, `COMPLETE`, or `COMPLETED` back to `OPEN` when active production rows still exist

It does not update departments, shipment dates, item descriptions, item stock fields, or shipment records.

## Before Applying

1. Confirm the production app includes these PRs:
   - P1 PO status rules
   - P1 PO existing status repair endpoint
   - P1 PO status repair admin page
   - P1 PO status regression tests
2. Open `/admin/p1-po-status-repair`.
3. Let the dry-run load.
4. Review both sections:
   - Production Status Drift
   - Closed POs With Active Items
5. Confirm the sample rows match the known P1 PO issues before applying.

## Apply Procedure

1. Set `Sample rows` to `25` unless you need more examples.
2. Set `Max apply` to a conservative batch size.
   - Start with `100` if there are many repairs.
   - Use `500` only when the dry-run samples look clean.
3. Click `Apply Repair`.
4. Read the confirmation dialog.
5. Confirm only if the counts and scope match the intended repair.
6. Wait for the applied summary.
7. Click `Refresh`.
8. Repeat in batches until the dry-run shows no remaining expected repairs.

## Verification

After applying repairs:

1. Re-open `/admin/p1-po-status-repair`.
2. Confirm both summary counts are `0`.
3. Open the P1 PO manager.
4. Check the Active and Completed tabs.
5. Confirm previously closed POs with active or reactivated items appear as active.
6. Open the affected PO's production items.
7. Confirm statuses match the department:
   - P1 Production Queue: Pending
   - departments before shipped or fulfilled: In Progress
   - shipped or fulfilled: Shipped
   - cancelled items remain Cancelled

## API Reference

Dry-run:

```http
POST /api/admin/p1-po-status-repair
Content-Type: application/json

{
  "sampleLimit": 25,
  "maxApply": 500
}
```

Apply:

```http
POST /api/admin/p1-po-status-repair
Content-Type: application/json

{
  "apply": true,
  "sampleLimit": 25,
  "maxApply": 100
}
```

## Stop Conditions

Stop and investigate before applying if:

- the dry-run shows shipped rows that should remain shipped
- the dry-run shows cancelled rows moving to an active status
- the PO reopen list includes POs that are truly complete with no active production work
- sample rows have missing or unexpected departments
- the applied count is lower than expected and the dry-run still shows the same rows afterward

## Rollback Notes

This repair is intentionally narrow, but it still changes live status fields. If a mistake is found:

1. Use the applied rows returned by the endpoint response to identify changed production orders and POs.
2. Use the audit ledger event `P1_PO_STATUS_REPAIR` to identify the repair batch.
3. Restore only the specific rows that were incorrectly changed.
4. Do not run a broad status rollback query unless the full batch has been reviewed.
