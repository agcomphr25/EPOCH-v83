import { describe, expect, it } from 'vitest';
import { deriveProjectMaterialProcurement } from '../src/services/projectMaterialProcurement';

describe('deriveProjectMaterialProcurement', () => {
  it('reports Not Requested when no project procurement records match', () => {
    expect(deriveProjectMaterialProcurement('AG-1', [], [])).toMatchObject({
      status: 'Not Requested',
      quantity_ordered: 0,
      quantity_received: 0,
      quantity_available: 0,
      quantity_pending_acceptance: 0,
    });
  });

  it('uses a parts request before a vendor PO exists', () => {
    expect(
      deriveProjectMaterialProcurement(
        'AG-1',
        [
          {
            part_number: 'ag-1',
            status: 'APPROVED',
            qty_ordered: 0,
            qty_received: 0,
          },
        ],
        []
      )
    ).toMatchObject({
      status: 'Approved',
      vendor_po_ids: [],
    });
  });

  it('reports On PO and exposes the PO number for a sent direct PO line', () => {
    expect(
      deriveProjectMaterialProcurement(
        'AG-1',
        [],
        [
          {
            ag_part_number: 'AG-1',
            quantity: 10,
            received_quantity: 0,
            vendor_po_id: 12,
            po_number: 'VPO-12',
            po_status: 'Sent',
          },
        ]
      )
    ).toEqual({
      status: 'On PO',
      quantity_ordered: 10,
      quantity_received: 0,
      quantity_available: 0,
      quantity_pending_acceptance: 0,
      vendor_po_ids: [12],
      po_numbers: ['VPO-12'],
    });
  });

  it('distinguishes partially received and fully received quantities', () => {
    const line = {
      ag_part_number: 'AG-1',
      quantity: 10,
      vendor_po_id: 12,
      po_number: 'VPO-12',
      po_status: 'Sent',
    };
    expect(
      deriveProjectMaterialProcurement(
        'AG-1',
        [],
        [line],
        [
          {
            ag_part_number: 'AG-1',
            quantity: 4,
            quantity_available: 3,
            status: 'accepted',
            disposition: 'accepted',
          },
        ]
      )
    ).toMatchObject({
      status: 'Partially Received',
      quantity_received: 4,
      quantity_available: 3,
    });
    expect(
      deriveProjectMaterialProcurement(
        'AG-1',
        [],
        [line],
        [
          {
            ag_part_number: 'AG-1',
            quantity: 10,
            quantity_available: 8,
            status: 'accepted',
            disposition: 'accepted',
          },
        ]
      ).status
    ).toBe('Received');
  });

  it('does not count pending project acceptance as available', () => {
    expect(
      deriveProjectMaterialProcurement(
        'AG-1',
        [],
        [],
        [
          {
            ag_part_number: 'AG-1',
            quantity: 5,
            quantity_available: 5,
            status: 'pending_pm_acceptance',
            disposition: 'accepted',
          },
        ]
      )
    ).toMatchObject({
      status: 'Pending Acceptance',
      quantity_received: 0,
      quantity_available: 0,
      quantity_pending_acceptance: 5,
    });
  });

  it('does not treat a PO receipt status as project acceptance', () => {
    expect(
      deriveProjectMaterialProcurement(
        'AG-1',
        [],
        [
          {
            ag_part_number: 'AG-1',
            quantity: 5,
            received_quantity: 5,
            po_status: 'Fully Received',
          },
        ],
        []
      )
    ).toMatchObject({
      status: 'On PO',
      quantity_received: 0,
      quantity_available: 0,
    });
  });
});
