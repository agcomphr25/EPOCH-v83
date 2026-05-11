import { describe, expect, it } from 'vitest';
import {
  buildCertPackageExport,
  evaluateShippingCertPackageGate,
} from '../src/services/certPackageService';

type Rows = Record<string, unknown>[];

const completeLot = {
  id: '11111111-1111-1111-1111-111111111111',
  lot_number: '260511-01',
  po_number: 'PO-100',
  po_id: 10,
  part_number: 'PN-100',
  part_name: 'Bracket',
  customer_name: 'ACME',
  quantity: 1,
  serialized_item_ids: ['22222222-2222-2222-2222-222222222222'],
  status: 'OPEN',
  shipped_at: null,
  shipped_by: null,
  packing_slip_id: '33333333-3333-3333-3333-333333333333',
  certificate_id: '44444444-4444-4444-4444-444444444444',
  lot_validation_report_url: null,
  packing_slip_upload_url: null,
  certificate_upload_url: null,
  manufacturing_date: '2026-05-11T00:00:00.000Z',
  updated_at: '2026-05-11T12:00:00.000Z',
  created_at: '2026-05-11T11:00:00.000Z',
};

const completeSerial = {
  id: '22222222-2222-2222-2222-222222222222',
  serial_number: 'SN-100',
  barcode: 'BC-100',
  po_number: 'PO-100',
  po_id: 10,
  po_item_id: 20,
  part_number: 'PN-100',
  part_name: 'Bracket',
  status: 'COMPLETED',
  current_department: 'Final QC',
  traveler_barcode: 'TRV-100',
  finalized_at: '2026-05-11T12:00:00.000Z',
  finalized_by: 'qa',
  customer_serial_number: null,
  part_routing_revision: 4,
  updated_at: '2026-05-11T12:00:00.000Z',
};

function makeQuery(overrides: Partial<Record<string, Rows>> = {}) {
  const rows: Record<string, Rows> = {
    lot: [completeLot],
    serials: [completeSerial],
    travelers: [{
      id: 'trv-1',
      traveler_number: 'TRV-100',
      traveler_revision: 2,
      status: 'COMPLETED',
      work_order_id: 'WO-100',
      production_work_order_id: '55555555-5555-5555-5555-555555555555',
      project_id: '66666666-6666-6666-6666-666666666666',
      part_number: 'PN-100',
      serial_number: 'SN-100',
      lot_number: '260511-01',
      off_system_completion_link: null,
      updated_at: '2026-05-11T12:00:00.000Z',
    }],
    inspections: [{
      id: 'insp-1',
      serialized_item_id: completeSerial.id,
      barcode: 'BC-100',
      part_number: 'PN-100',
      inspection_date: '2026-05-11T12:00:00.000Z',
      inspection_type: 'FINAL',
      overall_result: 'PASS',
      accepted_as_is: false,
      qa_mgr_approval: null,
      qa_mgr_approval_date: null,
      non_conformance_ids: [],
      tolerance_deviation_required: false,
      tolerance_authorization_date: null,
      updated_at: '2026-05-11T12:00:00.000Z',
    }],
    ncrs: [],
    wad: [{
      id: '55555555-5555-5555-5555-555555555555',
      work_order_number: 'WAD-100',
      project_id: '66666666-6666-6666-6666-666666666666',
      status: 'COMPLETE',
      wad_status: 'APPROVED',
      wizard_data: { revision: 3 },
      updated_at: '2026-05-11T12:00:00.000Z',
    }],
    certificate: [{
      id: completeLot.certificate_id,
      certificate_number: 'COC-100',
      status: 'APPROVED',
      approved_by: 'qa',
      approved_at: '2026-05-11T12:00:00.000Z',
      issued_at: null,
      qa_mgr_name: 'QA Manager',
      qa_mgr_date: '2026-05-11T12:00:00.000Z',
      material_certifications: [{ material: 'Carbon prepreg', certNumber: 'MC-1' }],
      process_records: [{ process: 'Cure', recordId: 'CURE-1', result: 'PASS' }],
      inspection_summary: [{ type: 'FINAL', result: 'PASS' }],
      specifications: [{ clause: 'Customer clause A', result: 'met' }],
      traceability_data: [{ lot: 'MAT-1' }],
      updated_at: '2026-05-11T12:00:00.000Z',
      created_at: '2026-05-11T11:00:00.000Z',
    }],
    packingSlip: [{
      id: completeLot.packing_slip_id,
      packing_slip_number: 'PS-100',
      status: 'FINALIZED',
      ship_date: null,
      tracking_number: null,
      carrier: null,
      line_items: [{ partNumber: 'PN-100', quantity: 1 }],
      updated_at: '2026-05-11T12:00:00.000Z',
      created_at: '2026-05-11T11:00:00.000Z',
    }],
    ...overrides,
  };

  return async (sql: string): Promise<Rows> => {
    if (sql.includes('FROM p2_lot_numbers') && sql.includes('WHERE id = $1')) return rows.lot;
    if (sql.includes('FROM p2_serialized_items')) return rows.serials;
    if (sql.includes('FROM travelers')) return rows.travelers;
    if (sql.includes('FROM p2_final_inspection_results')) return rows.inspections;
    if (sql.includes('FROM nonconformance_records')) return rows.ncrs;
    if (sql.includes('FROM production_work_orders')) return rows.wad;
    if (sql.includes('FROM p2_certificates_of_conformance')) return rows.certificate;
    if (sql.includes('FROM p2_packing_slips')) return rows.packingSlip;
    return [];
  };
}

describe('cert package shipping gate', () => {
  it('allows shipment when traveler, inspection, NCR, WAD, and CoC evidence are complete', async () => {
    const gate = await evaluateShippingCertPackageGate(String(completeLot.id), makeQuery());

    expect(gate?.readyToShip).toBe(true);
    expect(gate?.blockers).toEqual([]);
    expect(gate?.evidence.some((e) => e.type === 'coc' && e.status === 'present')).toBe(true);
  });

  it('blocks shipment when the traveler is incomplete and the CoC is missing', async () => {
    const gate = await evaluateShippingCertPackageGate(String(completeLot.id), makeQuery({
      travelers: [{ status: 'IN_PROGRESS', traveler_number: 'TRV-100' }],
      certificate: [],
      lot: [{ ...completeLot, certificate_id: null, certificate_upload_url: null }],
    }));

    expect(gate?.readyToShip).toBe(false);
    expect(gate?.blockers.map((b) => b.code)).toContain('TRAVELER_INCOMPLETE');
    expect(gate?.blockers.map((b) => b.code)).toContain('COC_MISSING');
  });

  it('exports an audit manifest with a deterministic package hash field', async () => {
    const certPackage = await buildCertPackageExport(String(completeLot.id), makeQuery());

    expect(certPackage?.auditManifest.algorithm).toBe('sha256');
    expect(certPackage?.auditManifest.packageHash).toMatch(/^[a-f0-9]{64}$/);
    expect(certPackage?.revisionSnapshot).toBeDefined();
  });
});
