import { createHash } from 'crypto';
import { pool } from '../../db';
import { evaluateDocumentationRequirements } from '../lib/documentationRequirementsEngine';

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface CertPackageEvidence {
  type: string;
  label: string;
  status: 'present' | 'missing' | 'not_applicable';
  source: string;
  reference?: string | null;
  revision?: string | number | null;
  details?: Record<string, unknown>;
}

export interface CertPackageBlocker {
  code: string;
  message: string;
  references?: string[];
}

export interface CertPackageGateResult {
  lotId: string;
  lotNumber: string;
  readyToShip: boolean;
  blockers: CertPackageBlocker[];
  evidence: CertPackageEvidence[];
  revisionSnapshot: Record<string, unknown>;
}

interface ShippingCertPackageRows {
  lot: any;
  serials: any[];
  travelers: any[];
  inspections: any[];
  ncrs: any[];
  wad: any | null;
  certificate: any | null;
  packingSlip: any | null;
  flowedRequirements: any[];
}

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hasEntries(value: unknown): boolean {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).length > 0;
  }
  return jsonArray(value).length > 0;
}

function latestBy<T extends Record<string, unknown>>(rows: T[], dateKey: keyof T): T[] {
  const byKey = new Map<string, T>();
  rows.forEach((row) => {
    const itemId = String(row.serialized_item_id ?? row.serializedItemId ?? row.id ?? '');
    const existing = byKey.get(itemId);
    const currentTime = row[dateKey] ? new Date(String(row[dateKey])).getTime() : 0;
    const existingTime = existing?.[dateKey] ? new Date(String(existing[dateKey])).getTime() : 0;
    if (!existing || currentTime >= existingTime) byKey.set(itemId, row);
  });
  return Array.from(byKey.values());
}

async function loadShippingCertPackageRows(
  lotId: string,
  query: QueryFn = (sql, params) => pool.query(sql, params) as Promise<any[]>,
): Promise<ShippingCertPackageRows | null> {
  const lotRows = await query<any>(
    `SELECT id, lot_number, po_number, po_id, part_number, part_name, customer_name,
            quantity, serialized_item_ids, status, shipped_at, shipped_by,
            packing_slip_id, certificate_id, lot_validation_report_url,
            packing_slip_upload_url, certificate_upload_url, manufacturing_date,
            updated_at, created_at
       FROM p2_lot_numbers
       WHERE id = $1`,
    [lotId],
  );
  const lot = lotRows[0];
  if (!lot) return null;

  const serialIds = jsonArray(lot.serialized_item_ids).map(String);
  const serials = serialIds.length > 0
    ? await query<any>(
        `SELECT id, serial_number, barcode, po_number, po_id, po_item_id, part_number,
                part_name, status, current_department, traveler_barcode, finalized_at,
                finalized_by, customer_serial_number, part_routing_revision, updated_at
           FROM p2_serialized_items
           WHERE id = ANY($1::uuid[])`,
        [serialIds],
      )
    : [];

  const travelerRefs = Array.from(new Set(
    serials.flatMap((s) => [s.traveler_barcode, s.serial_number, s.barcode]).filter(Boolean).map(String),
  ));
  const travelers = travelerRefs.length > 0
    ? await query<any>(
        `SELECT id, traveler_number, traveler_revision, status, work_order_id,
                production_work_order_id, project_id, part_number, serial_number,
                lot_number, off_system_completion_link, updated_at
           FROM travelers
           WHERE traveler_number = ANY($1::text[])
              OR serial_number = ANY($1::text[])
              OR work_order_id = ANY($1::text[])`,
        [travelerRefs],
      )
    : [];

  const inspections = serialIds.length > 0
    ? await query<any>(
        `SELECT id, serialized_item_id, barcode, part_number, inspection_date,
                inspection_type, overall_result, accepted_as_is,
                qa_mgr_approval, qa_mgr_approval_date, non_conformance_ids,
                tolerance_deviation_required, tolerance_authorization_date,
                updated_at
           FROM p2_final_inspection_results
           WHERE serialized_item_id = ANY($1::uuid[])
           ORDER BY inspection_date DESC`,
        [serialIds],
      )
    : [];

  const serialNumbers = serials.map((s) => s.serial_number).filter(Boolean);
  const barcodes = serials.map((s) => s.barcode).filter(Boolean);
  const ncrIds = Array.from(new Set(inspections.flatMap((i) => jsonArray(i.non_conformance_ids)).map(String)));
  const ncrs = await query<any>(
    `SELECT id, rma_number, order_id, serial_number, po_number, status,
            disposition, resolved_at, updated_at
       FROM nonconformance_records
       WHERE ($1::text[] IS NOT NULL AND serial_number = ANY($1::text[]))
          OR ($2::text[] IS NOT NULL AND order_id = ANY($2::text[]))
          OR ($3::text[] IS NOT NULL AND id::text = ANY($3::text[]))
          OR (po_number = $4 AND status IS DISTINCT FROM 'Resolved')`,
    [serialNumbers.length ? serialNumbers : null, barcodes.length ? barcodes : null, ncrIds.length ? ncrIds : null, lot.po_number],
  );

  const wadId = travelers.find((t) => t.production_work_order_id)?.production_work_order_id;
  const wadRows = wadId
    ? await query<any>(
        `SELECT id, work_order_number, project_id, status, wad_status,
                wizard_data, updated_at
           FROM production_work_orders
           WHERE id = $1`,
        [wadId],
      )
    : [];

  const certRows = lot.certificate_id
    ? await query<any>(
        `SELECT id, certificate_number, status, approved_by, approved_at, issued_at,
                qa_mgr_name, qa_mgr_date, material_certifications,
                process_records, inspection_summary, specifications,
                traceability_data, updated_at, created_at
           FROM p2_certificates_of_conformance
           WHERE id = $1`,
        [lot.certificate_id],
      )
    : [];

  const packingSlipRows = lot.packing_slip_id
    ? await query<any>(
        `SELECT id, packing_slip_number, status, ship_date, tracking_number,
                carrier, line_items, updated_at, created_at
           FROM p2_packing_slips
           WHERE id = $1`,
        [lot.packing_slip_id],
      )
    : [];

  const flowedRequirements = lot.po_id
    ? await query<any>(
        `SELECT id, contract_review_instance_id, contract_clause_id, clause_template_id,
                target_type, target_id, requirement_text, required_artifacts,
                status, source, flowed_at, satisfied_at, satisfied_by_user_id,
                satisfied_by_display_name, evidence, updated_at
           FROM flowed_requirements
           WHERE target_type = 'cert_package'
             AND target_id = $1
           ORDER BY flowed_at DESC`,
        [String(lot.po_id)],
      )
    : [];

  return {
    lot,
    serials,
    travelers,
    inspections,
    ncrs,
    wad: wadRows[0] ?? null,
    certificate: certRows[0] ?? null,
    packingSlip: packingSlipRows[0] ?? null,
    flowedRequirements,
  };
}

export async function evaluateShippingCertPackageGate(
  lotId: string,
  query?: QueryFn,
): Promise<CertPackageGateResult | null> {
  const rows = await loadShippingCertPackageRows(lotId, query);
  if (!rows) return null;

  const blockers: CertPackageBlocker[] = [];
  const evidence: CertPackageEvidence[] = [];
  const latestInspections = latestBy(rows.inspections, 'inspection_date');
  const serialIds = rows.serials.map((s) => String(s.id));
  const travelerByRef = new Map<string, any>();
  rows.travelers.forEach((t) => {
    [t.traveler_number, t.serial_number, t.work_order_id].filter(Boolean).forEach((key) => {
      travelerByRef.set(String(key), t);
    });
  });

  const incompleteTravelers = rows.serials.filter((serial) => {
    const traveler = [serial.traveler_barcode, serial.serial_number, serial.barcode]
      .map((ref) => ref ? travelerByRef.get(String(ref)) : null)
      .find(Boolean);
    return !traveler || (normalizeStatus(traveler.status) !== 'COMPLETED' && !traveler.off_system_completion_link);
  });
  if (incompleteTravelers.length > 0) {
    blockers.push({
      code: 'TRAVELER_INCOMPLETE',
      message: 'Every serialized item must have a completed traveler or controlled off-system completion link before shipment.',
      references: incompleteTravelers.map((s) => s.serial_number || s.barcode),
    });
  }
  evidence.push({
    type: 'traveler_completion',
    label: 'Traveler completion',
    status: incompleteTravelers.length === 0 && rows.serials.length > 0 ? 'present' : 'missing',
    source: 'travelers',
    details: { travelerCount: rows.travelers.length, serializedItemCount: rows.serials.length },
  });

  const missingInspections = serialIds.filter((id) => !latestInspections.some((i) => String(i.serialized_item_id) === id));
  const failedInspections = latestInspections.filter((i) => {
    const result = normalizeStatus(i.overall_result);
    const accepted = result === 'PASS' || (result === 'CONDITIONAL' && (i.accepted_as_is || i.qa_mgr_approval));
    const toleranceClear = !i.tolerance_deviation_required || !!i.tolerance_authorization_date;
    return !accepted || !toleranceClear;
  });
  if (missingInspections.length > 0 || failedInspections.length > 0) {
    blockers.push({
      code: 'INSPECTION_INCOMPLETE',
      message: 'Final inspection must be recorded and cleared for every serialized item before shipment.',
      references: [
        ...missingInspections,
        ...failedInspections.map((i) => i.barcode || i.serialized_item_id),
      ],
    });
  }
  evidence.push({
    type: 'inspection_report',
    label: 'Final inspection report',
    status: missingInspections.length === 0 && failedInspections.length === 0 && serialIds.length > 0 ? 'present' : 'missing',
    source: 'p2_final_inspection_results',
    details: { inspectionCount: latestInspections.length },
  });

  const openNcrs = rows.ncrs.filter((ncr) => !['RESOLVED', 'CLOSED', 'COMPLETE', 'COMPLETED'].includes(normalizeStatus(ncr.status)));
  if (openNcrs.length > 0) {
    blockers.push({
      code: 'NCR_OPEN',
      message: 'Open nonconformance records tied to the lot, PO, serials, or inspection evidence must be closed before shipment.',
      references: openNcrs.map((n) => n.rma_number || String(n.id)),
    });
  }
  evidence.push({
    type: 'ncr_closure',
    label: 'NCR closure',
    status: openNcrs.length === 0 ? 'present' : 'missing',
    source: 'nonconformance_records',
    details: { linkedNcrCount: rows.ncrs.length },
  });

  const wadStatus = normalizeStatus(rows.wad?.status);
  const wadDocStatus = normalizeStatus(rows.wad?.wad_status);
  const wadCleared = rows.wad
    ? ['COMPLETE', 'CLOSED', 'IN_PROGRESS', 'RELEASED'].includes(wadStatus) && wadDocStatus === 'APPROVED'
    : false;
  if (!wadCleared) {
    blockers.push({
      code: 'WAD_PROJECT_STATE',
      message: 'The linked WAD/project state must be approved and released through production before shipment.',
      references: rows.wad ? [rows.wad.work_order_number || rows.wad.id] : ['No linked WAD found'],
    });
  }
  evidence.push({
    type: 'wad_project_state',
    label: 'WAD/project release state',
    status: wadCleared ? 'present' : 'missing',
    source: 'production_work_orders',
    reference: rows.wad?.work_order_number ?? null,
    revision: rows.wad?.updated_at ?? null,
  });

  const documentationPackage = rows.wad ? evaluateDocumentationRequirements(rows.wad) : null;
  const qcFinalReleaseRequirements = documentationPackage?.gates.qcFinalRelease ?? null;
  if (documentationPackage?.gates.qcFinalRelease.samplingPlanRequired && !documentationPackage.samplingPlanId) {
    blockers.push({
      code: 'SAMPLING_PLAN_REQUIRED',
      message: 'The WAD documentation package requires a sampling plan before QC final release.',
      references: [rows.wad.work_order_number || rows.wad.id],
    });
  }
  evidence.push({
    type: 'wad_documentation_package',
    label: 'WAD documentation package',
    status: documentationPackage ? 'present' : 'not_applicable',
    source: 'documentation_requirements_engine',
    reference: rows.wad?.work_order_number ?? null,
    revision: rows.wad?.updated_at ?? null,
    details: documentationPackage
      ? {
          package: documentationPackage.package,
          requiredDocuments: documentationPackage.requiredDocuments,
          inspectionStrategy: documentationPackage.inspectionStrategy,
          qcFinalRelease: documentationPackage.gates.qcFinalRelease,
        }
      : undefined,
  });

  const cert = rows.certificate;
  const cocPresent = !!cert || !!rows.lot.certificate_upload_url;
  const cocApproved = cert ? ['APPROVED', 'ISSUED'].includes(normalizeStatus(cert.status)) || !!cert.approved_at : cocPresent;
  const certificatePackageRequired = qcFinalReleaseRequirements?.certificatePackageRequired ?? true;
  if (certificatePackageRequired && !cocApproved) {
    blockers.push({
      code: 'COC_MISSING',
      message: 'A certificate of conformance must be attached and approved before shipment.',
      references: [rows.lot.lot_number],
    });
  }
  evidence.push({
    type: 'coc',
    label: 'Certificate of Conformance',
    status: cocApproved ? 'present' : certificatePackageRequired ? 'missing' : 'not_applicable',
    source: cert ? 'p2_certificates_of_conformance' : 'p2_lot_numbers.certificate_upload_url',
    reference: cert?.certificate_number ?? rows.lot.certificate_upload_url ?? null,
    revision: cert?.updated_at ?? null,
  });

  evidence.push({
    type: 'material_cert',
    label: 'Material certifications',
    status: hasEntries(cert?.material_certifications) || !!rows.lot.certificate_upload_url ? 'present' : 'missing',
    source: 'p2_certificates_of_conformance.material_certifications',
    details: { count: jsonArray(cert?.material_certifications).length },
  });
  evidence.push({
    type: 'special_process_cert',
    label: 'Special process certifications',
    status: hasEntries(cert?.process_records) ? 'present' : 'not_applicable',
    source: 'p2_certificates_of_conformance.process_records',
    details: { count: jsonArray(cert?.process_records).length },
  });
  const faiRequired = qcFinalReleaseRequirements?.faiRequired ?? false;
  const fairPresent = hasEntries(cert?.specifications) || hasEntries(cert?.inspection_summary);
  if (faiRequired && !fairPresent) {
    blockers.push({
      code: 'FAI_REQUIRED',
      message: 'The WAD documentation package requires FAI evidence before QC final release.',
      references: [rows.wad?.work_order_number ?? rows.lot.lot_number],
    });
  }
  evidence.push({
    type: 'fair',
    label: 'FAIR / first article evidence',
    status: fairPresent ? 'present' : faiRequired ? 'missing' : 'not_applicable',
    source: 'p2_certificates_of_conformance.specifications',
  });
  evidence.push({
    type: 'customer_clause_evidence',
    label: 'Customer clause evidence',
    status: hasEntries(cert?.specifications) || hasEntries(cert?.traceability_data) ? 'present' : 'not_applicable',
    source: 'p2_certificates_of_conformance',
  });

  const openFlowdownRequirements = rows.flowedRequirements.filter((requirement) => {
    const status = normalizeStatus(requirement.status);
    return !['SATISFIED', 'WAIVED', 'NOT_APPLICABLE'].includes(status);
  });
  if (openFlowdownRequirements.length > 0) {
    blockers.push({
      code: 'FLOWDOWN_REQUIREMENT_OPEN',
      message: 'Contract flowed requirements for this cert package must be satisfied, waived, or marked not applicable before shipment.',
      references: openFlowdownRequirements.map((requirement) => String(requirement.id)),
    });
  }
  evidence.push({
    type: 'contract_flowdown',
    label: 'Contract flowed requirements',
    status: rows.flowedRequirements.length === 0
      ? 'not_applicable'
      : openFlowdownRequirements.length === 0 ? 'present' : 'missing',
    source: 'flowed_requirements',
    reference: rows.lot.po_id ? String(rows.lot.po_id) : null,
    details: {
      targetType: 'cert_package',
      targetId: rows.lot.po_id ? String(rows.lot.po_id) : null,
      requirementCount: rows.flowedRequirements.length,
      openCount: openFlowdownRequirements.length,
      requirements: rows.flowedRequirements.map((requirement) => ({
        id: requirement.id,
        contractReviewInstanceId: requirement.contract_review_instance_id,
        contractClauseId: requirement.contract_clause_id,
        clauseTemplateId: requirement.clause_template_id,
        targetType: requirement.target_type,
        targetId: requirement.target_id,
        status: requirement.status,
        requiredArtifacts: jsonArray(requirement.required_artifacts),
        satisfiedAt: requirement.satisfied_at ?? null,
        satisfiedBy: requirement.satisfied_by_display_name ?? null,
      })),
    },
  });

  const revisionSnapshot = {
    generatedAt: new Date().toISOString(),
    lot: {
      id: rows.lot.id,
      lotNumber: rows.lot.lot_number,
      status: rows.lot.status,
      updatedAt: rows.lot.updated_at,
    },
    packingSlip: rows.packingSlip ? {
      id: rows.packingSlip.id,
      number: rows.packingSlip.packing_slip_number,
      status: rows.packingSlip.status,
      updatedAt: rows.packingSlip.updated_at,
    } : null,
    certificate: cert ? {
      id: cert.id,
      number: cert.certificate_number,
      status: cert.status,
      approvedAt: cert.approved_at,
      issuedAt: cert.issued_at,
      updatedAt: cert.updated_at,
    } : null,
    travelers: rows.travelers.map((t) => ({
      id: t.id,
      travelerNumber: t.traveler_number,
      revision: t.traveler_revision,
      status: t.status,
      updatedAt: t.updated_at,
    })),
    inspections: latestInspections.map((i) => ({
      id: i.id,
      serializedItemId: i.serialized_item_id,
      result: i.overall_result,
      inspectionDate: i.inspection_date,
      updatedAt: i.updated_at,
    })),
    wad: rows.wad ? {
      id: rows.wad.id,
      workOrderNumber: rows.wad.work_order_number,
      status: rows.wad.status,
      wadStatus: rows.wad.wad_status,
      updatedAt: rows.wad.updated_at,
    } : null,
    flowedRequirements: rows.flowedRequirements.map((requirement) => ({
      id: requirement.id,
      contractReviewInstanceId: requirement.contract_review_instance_id,
      targetType: requirement.target_type,
      targetId: requirement.target_id,
      status: requirement.status,
      flowedAt: requirement.flowed_at,
      satisfiedAt: requirement.satisfied_at ?? null,
      updatedAt: requirement.updated_at,
    })),
  };

  return {
    lotId: rows.lot.id,
    lotNumber: rows.lot.lot_number,
    readyToShip: blockers.length === 0,
    blockers,
    evidence,
    revisionSnapshot,
  };
}

export async function buildCertPackageExport(lotId: string, query?: QueryFn) {
  const gate = await evaluateShippingCertPackageGate(lotId, query);
  if (!gate) return null;

  const manifest = {
    packageType: 'shipping_cert_package',
    packageVersion: 1,
    lotId: gate.lotId,
    lotNumber: gate.lotNumber,
    readyToShip: gate.readyToShip,
    generatedAt: new Date().toISOString(),
    blockers: gate.blockers,
    evidence: gate.evidence,
    revisionSnapshot: gate.revisionSnapshot,
  };
  const hash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

  return {
    ...manifest,
    auditManifest: {
      algorithm: 'sha256',
      packageHash: hash,
      evidenceCount: gate.evidence.length,
      blockerCount: gate.blockers.length,
    },
  };
}
