/**
 * laborAllocationDualWrite — Phase C Live Dual-Write
 *
 * Every new punch_ledger operation also writes to labor_allocations in real
 * time so the two tables stay in sync going forward.  punch_ledger remains
 * the single source of truth; labor_allocations is a derived mirror.
 *
 * All functions are fire-and-forget from the caller's perspective:
 *   - Failures are logged as warnings
 *   - They never propagate an exception back to the punch flow
 */

import { db } from '../../db';
import { laborAllocations } from '../../schema';
import type { PunchLedgerEntry } from '../../schema';
import { eq, and, isNull } from 'drizzle-orm';

/**
 * Create an OPEN labor_allocations row for a newly opened punch_ledger session.
 * Called immediately after openSession() inserts into punch_ledger.
 */
export async function dualWriteOpenAllocation(entry: PunchLedgerEntry): Promise<void> {
  await db.insert(laborAllocations).values({
    punchLedgerId: entry.id,
    employeeId: entry.employeeId,
    allocationStart: entry.clockIn,
    allocationEnd: undefined,
    chargeCodeId: entry.chargeCodeId ?? null,
    travelerId: entry.travelerId ?? null,
    travelerStepId: entry.travelerStepId ?? null,
    productionWorkOrderId: entry.productionWorkOrderId ?? null,
    projectId: entry.projectId ?? null,
    department: entry.department ?? null,
    operation: entry.operation ?? null,
    laborClass: entry.laborClass ?? 'REGULAR',
    status: 'OPEN',
    certificationStatus: entry.certificationStatus ?? null,
    isOverrun: entry.isOverrun ?? false,
    overrunReason: entry.overrunReason ?? null,
    laborApprovalId: entry.laborApprovalId ?? null,
    laborBudgetOverrideId: entry.laborBudgetOverrideId ?? null,
    source: 'LIVE',
    sequenceOrder: 1,
    createdBy: entry.createdBy ?? null,
    createdByDisplayName: entry.createdByDisplayName ?? null,
  });
}

/**
 * Close the matching labor_allocations row when a punch_ledger session is closed.
 * Sets status = 'CLOSED' and allocationEnd = clockOut on the OPEN row for this session.
 */
export async function dualWriteCloseAllocation(entry: PunchLedgerEntry): Promise<void> {
  if (!entry.clockOut) return;

  await db
    .update(laborAllocations)
    .set({
      status: 'CLOSED',
      allocationEnd: entry.clockOut,
      updatedAt: entry.clockOut,
    })
    .where(
      and(
        eq(laborAllocations.punchLedgerId, entry.id),
        isNull(laborAllocations.allocationEnd),
      ),
    );
}

/**
 * Reflect admin edits to a punch_ledger row in the matching labor_allocations row.
 * Called after PATCH/PUT on /api/timekeeping/punches/:id.
 * Updates timestamps and attribution fields on the row keyed by punchLedgerId.
 * Failures are warn-only and do not propagate to the caller.
 */
export async function dualWriteUpdateAllocation(entry: PunchLedgerEntry): Promise<void> {
  const now = new Date();
  await db
    .update(laborAllocations)
    .set({
      allocationStart: entry.clockIn ?? undefined,
      allocationEnd: entry.clockOut ?? null,
      chargeCodeId: entry.chargeCodeId ?? null,
      travelerId: entry.travelerId ?? null,
      travelerStepId: entry.travelerStepId ?? null,
      productionWorkOrderId: entry.productionWorkOrderId ?? null,
      department: entry.department ?? null,
      operation: entry.operation ?? null,
      updatedAt: now,
    })
    .where(eq(laborAllocations.punchLedgerId, entry.id));
}

/**
 * Propagate attribution changes (chargeCodeId, travelerId, etc.) to the
 * matching OPEN labor_allocations row when switchAssignment is called.
 */
export async function dualWriteSwitchAllocation(entry: PunchLedgerEntry): Promise<void> {
  const now = new Date();
  await db
    .update(laborAllocations)
    .set({
      chargeCodeId: entry.chargeCodeId ?? null,
      travelerId: entry.travelerId ?? null,
      travelerStepId: entry.travelerStepId ?? null,
      productionWorkOrderId: entry.productionWorkOrderId ?? null,
      department: entry.department ?? null,
      operation: entry.operation ?? null,
      laborApprovalId: entry.laborApprovalId ?? null,
      laborBudgetOverrideId: entry.laborBudgetOverrideId ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(laborAllocations.punchLedgerId, entry.id),
        isNull(laborAllocations.allocationEnd),
      ),
    );
}
