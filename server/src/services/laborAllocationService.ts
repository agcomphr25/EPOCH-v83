/**
 * laborAllocationService — Phase C + D Service Layer
 *
 * Named operations over labor_allocations.  All writes delegate to the
 * existing dual-write helpers so that the underlying SQL logic lives in
 * one place (laborAllocationDualWrite.ts).
 *
 * This layer exists to:
 *   1. Give callers clean, intention-revealing function names.
 *   2. Own the getOpenAllocation DB query so punchLedger.ts doesn't reach
 *      into labor_allocations directly.
 *   3. Provide switchAllocation for mid-session segmentation (Phase D).
 *
 * All functions are meant to be called inside a try/catch — failures must
 * never propagate to the punch flow.
 */

import { db } from '../../db';
import { laborAllocations } from '../../schema';
import type { PunchLedgerEntry } from '../../schema';
import { eq, and, isNull } from 'drizzle-orm';
import {
  dualWriteOpenAllocation,
  dualWriteCloseAllocation,
} from '../lib/laborAllocationDualWrite';

export type LaborAllocationRow = typeof laborAllocations.$inferSelect;

/**
 * All fields that describe WHAT an operator is working on during a segment.
 * Passed to switchAllocation to populate the new OPEN row.
 */
export interface SwitchAssignment {
  chargeCodeId: number | null;
  travelerId: string | null;
  travelerStepId: string | null;
  productionWorkOrderId: string | null;
  projectId: string | null;
  department: string | null;
  operation: string | null;
}

/**
 * Open a labor_allocations row for a newly opened punch_ledger session.
 * Delegates to dualWriteOpenAllocation.
 */
export async function openAllocation(punchLedgerRow: PunchLedgerEntry): Promise<void> {
  await dualWriteOpenAllocation(punchLedgerRow);
}

/**
 * Close the matching OPEN labor_allocations row for the given punch_ledger session.
 * Delegates to dualWriteCloseAllocation using the closed punch_ledger row.
 */
export async function closeAllocation(punchLedgerRow: PunchLedgerEntry): Promise<void> {
  await dualWriteCloseAllocation(punchLedgerRow);
}

/**
 * Find the current OPEN labor_allocations row for a given punch_ledger session ID.
 * Returns null when no open allocation exists.
 */
export async function getOpenAllocation(punchLedgerId: number): Promise<LaborAllocationRow | null> {
  const [row] = await db
    .select()
    .from(laborAllocations)
    .where(
      and(
        eq(laborAllocations.punchLedgerId, punchLedgerId),
        eq(laborAllocations.status, 'OPEN'),
        isNull(laborAllocations.allocationEnd),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Phase D: Switch the labor allocation to a new assignment mid-session.
 *
 * Closes the current OPEN row and inserts a fresh OPEN row with the new
 * assignment data, preserving a complete ordered history for the session.
 *
 * Sequence:
 *   1. Query for the current OPEN row for this punch_ledger session.
 *   2. If none found: log a warning and call openAllocation to create the
 *      first segment (fall-through for sessions that somehow lost their row).
 *   3. If found: stamp allocationEnd = now(), status = 'CLOSED'.
 *   4. Insert a new row with allocationStart = now(), status = 'OPEN',
 *      source = 'TRAVELER', sequence_order = prior row's order + 1,
 *      and all fields from newAssignment.
 *
 * Wrapped in try/catch — never throws.
 */
export async function switchAllocation(
  punchLedgerRow: PunchLedgerEntry,
  newAssignment: SwitchAssignment,
): Promise<void> {
  try {
    const now = new Date();

    const openRow = await getOpenAllocation(punchLedgerRow.id);

    if (!openRow) {
      console.warn(
        '[laborAllocationService] [allocation_switch_started] No OPEN allocation found for punch_ledger_id=%d employee_id=%d traveler_id=%s — falling through to openAllocation',
        punchLedgerRow.id,
        punchLedgerRow.employeeId,
        newAssignment.travelerId ?? 'null',
      );
      await openAllocation({
        ...punchLedgerRow,
        chargeCodeId: newAssignment.chargeCodeId ?? punchLedgerRow.chargeCodeId,
        travelerId: newAssignment.travelerId ?? punchLedgerRow.travelerId,
        travelerStepId: newAssignment.travelerStepId ?? punchLedgerRow.travelerStepId,
        productionWorkOrderId: newAssignment.productionWorkOrderId ?? punchLedgerRow.productionWorkOrderId,
        projectId: newAssignment.projectId ?? punchLedgerRow.projectId,
        department: newAssignment.department ?? punchLedgerRow.department,
        operation: newAssignment.operation ?? punchLedgerRow.operation,
      });
      return;
    }

    console.log(
      '[laborAllocationService] [allocation_switch_started] punch_ledger_id=%d employee_id=%d sequence_order=%d traveler_id=%s',
      punchLedgerRow.id,
      punchLedgerRow.employeeId,
      openRow.sequenceOrder,
      newAssignment.travelerId ?? 'null',
    );

    // Close the current OPEN row
    await db
      .update(laborAllocations)
      .set({
        status: 'CLOSED',
        allocationEnd: now,
        updatedAt: now,
      })
      .where(eq(laborAllocations.id, openRow.id));

    console.log(
      '[laborAllocationService] [allocation_closed] punch_ledger_id=%d employee_id=%d sequence_order=%d traveler_id=%s',
      punchLedgerRow.id,
      punchLedgerRow.employeeId,
      openRow.sequenceOrder,
      openRow.travelerId ?? 'null',
    );

    // Next sequence order = current OPEN row's order + 1.
    // The OPEN row always has the highest sequence_order in the session.
    const nextSequenceOrder = openRow.sequenceOrder + 1;

    // Insert new OPEN row
    await db.insert(laborAllocations).values({
      punchLedgerId: punchLedgerRow.id,
      employeeId: punchLedgerRow.employeeId,
      allocationStart: now,
      allocationEnd: undefined,
      chargeCodeId: newAssignment.chargeCodeId ?? null,
      travelerId: newAssignment.travelerId ?? null,
      travelerStepId: newAssignment.travelerStepId ?? null,
      productionWorkOrderId: newAssignment.productionWorkOrderId ?? null,
      projectId: newAssignment.projectId ?? null,
      department: newAssignment.department ?? null,
      operation: newAssignment.operation ?? null,
      laborClass: punchLedgerRow.laborClass ?? 'REGULAR',
      status: 'OPEN',
      certificationStatus: punchLedgerRow.certificationStatus ?? null,
      isOverrun: punchLedgerRow.isOverrun ?? false,
      overrunReason: punchLedgerRow.overrunReason ?? null,
      laborApprovalId: punchLedgerRow.laborApprovalId ?? null,
      laborBudgetOverrideId: punchLedgerRow.laborBudgetOverrideId ?? null,
      source: 'TRAVELER',
      sequenceOrder: nextSequenceOrder,
      createdBy: punchLedgerRow.createdBy ?? null,
      createdByDisplayName: punchLedgerRow.createdByDisplayName ?? null,
    });

    console.log(
      '[laborAllocationService] [allocation_opened] punch_ledger_id=%d employee_id=%d sequence_order=%d traveler_id=%s',
      punchLedgerRow.id,
      punchLedgerRow.employeeId,
      nextSequenceOrder,
      newAssignment.travelerId ?? 'null',
    );
  } catch (err: unknown) {
    console.error(
      '[laborAllocationService] switchAllocation failed (non-fatal): punch_ledger_id=%d error=%s',
      punchLedgerRow.id,
      (err as Error)?.message ?? err,
    );
  }
}
