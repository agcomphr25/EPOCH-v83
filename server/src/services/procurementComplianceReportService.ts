import { pgPool } from '../../db';

export interface ProcurementComplianceReportFilters {
  startDate?: string;
  endDate?: string;
  reviewStatus?: string;
  issueStatus?: string;
  population?: string;
}

type Severity = 'info' | 'warning' | 'critical';

export interface ProcurementComplianceReport {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    reviewStatus: string | null;
    issueStatus: string | null;
    population: string;
  };
  effectiveDate: string;
  summary: {
    totalPurchaseOrders: number;
    totalPoValue: number;
    reviewed: number;
    pendingReview: number;
    blocked: number;
    requiresAttention: number;
    farRequired: number;
    farNotRequired: number;
    missingFarFlowdown: number;
    missingJustificationNotes: number;
    missingSecondPartyApproval: number;
    missingVendorApproval: number;
    vendorApprovalExpired: number;
    staleReviews: number;
    issuedBeforeReview: number;
    legacyPurchaseOrders: number;
  };
  purchaseOrders: Array<{
    id: number;
    poNumber: string;
    externalPoNumber: string | null;
    vendorId: number;
    vendorName: string;
    vendorApproved: boolean;
    vendorApprovalLevel: string | null;
    vendorApprovalExpiration: string | null;
    vendorApprovalExpired: boolean;
    productionLine: string | null;
    status: string;
    issueDate: string | null;
    expectedDeliveryDate: string | null;
    totalCost: number;
    complianceStatus: string;
    reviewStatus: string | null;
    governmentContract: boolean;
    farRequired: boolean;
    dpasRequired: boolean;
    cocRequired: boolean;
    mtrRequired: boolean;
    sourceInspectionRequired: boolean;
    secondPartyComplete: boolean;
    reviewVendorApproved: boolean;
    reviewNotes: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    historicalBackfill: boolean;
    legacyExceptionFlagged: boolean;
    legacyExceptionReason: string | null;
    isLegacy: boolean;
    isStale: boolean;
    applicableFlowdownCount: number;
    notApplicableFlowdownCount: number;
    flowdownClauseNumbers: string;
    requisitionNumber: string | null;
    requisitionStatus: string | null;
    requisitionJustification: string | null;
    competitionMethod: string | null;
    soleSourceJustification: string | null;
    approvalCount: number;
    approvedApprovalCount: number;
    lastApprovalBy: string | null;
    lastApprovalAt: string | null;
    directPoExceptionApprovedBy: string | null;
    directPoExceptionApprovedAt: string | null;
    directPoExceptionReason: string | null;
    vendorConfirmedAction: string | null;
    vendorConfirmedAt: string | null;
    debarmentResult: string | null;
    debarmentCheckedAt: string | null;
    flags: string[];
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    poId: number | null;
    poNumber: string | null;
  }>;
}

const REVIEW_STATUSES = new Set(['pending', 'reviewed', 'blocked', 'requires_attention', 'missing']);
const ISSUE_STATUSES = new Set(['Draft', 'RFQ Sent', 'Quote Received', 'Declined', 'Expired', 'Sent', 'Partially Received', 'Fully Received', 'Cancelled']);
const POPULATIONS = new Set(['all', 'enforced', 'legacy', 'requires-attention']);

function parseDateFilter(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }
  return value;
}

function parseReviewStatus(value: string | undefined): string | undefined {
  if (!value || value === 'all') return undefined;
  if (!REVIEW_STATUSES.has(value)) throw new Error('reviewStatus is invalid');
  return value;
}

function parseIssueStatus(value: string | undefined): string | undefined {
  if (!value || value === 'all') return undefined;
  if (!ISSUE_STATUSES.has(value)) throw new Error('issueStatus is invalid');
  return value;
}

function parsePopulation(value: string | undefined): string {
  if (!value || value === 'all') return 'all';
  if (!POPULATIONS.has(value)) throw new Error('population is invalid');
  return value;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateOnly(value: Date | string | null | undefined): string | null {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function deriveComplianceStatus(row: any): string {
  if (!row.review_id) return 'Pending Review';
  if (row.review_status === 'requires_attention') return 'Requires Attention';
  if (row.review_status === 'blocked' || !row.second_party_complete || !row.review_vendor_approved) return 'Blocked';
  if (row.review_status === 'reviewed') return 'Reviewed';
  return 'Pending Review';
}

function isIssued(status: string): boolean {
  return ['Sent', 'Partially Received', 'Fully Received'].includes(status);
}

async function getEffectiveDate(): Promise<string> {
  try {
    const result = await pgPool.query(`
      SELECT effective_date::text AS effective_date
      FROM procurement_compliance_effective_dates
      ORDER BY configured_at DESC, id DESC
      LIMIT 1
    `);
    return result.rows[0]?.effective_date ?? '2026-06-01';
  } catch {
    return '2026-06-01';
  }
}

export async function getProcurementComplianceReport(
  filters: ProcurementComplianceReportFilters = {},
): Promise<ProcurementComplianceReport> {
  const startDate = parseDateFilter(filters.startDate, 'startDate');
  const endDate = parseDateFilter(filters.endDate, 'endDate');
  const reviewStatus = parseReviewStatus(filters.reviewStatus);
  const issueStatus = parseIssueStatus(filters.issueStatus);
  const population = parsePopulation(filters.population);
  const effectiveDate = await getEffectiveDate();

  const params: unknown[] = [effectiveDate];
  const clauses: string[] = ['COALESCE(vp.archived, false) = false', 'COALESCE(vp.is_current_revision, true) = true'];

  if (startDate) {
    params.push(startDate);
    clauses.push(`COALESCE(vp.order_date, vp.created_at::date) >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    clauses.push(`COALESCE(vp.order_date, vp.created_at::date) <= $${params.length}::date`);
  }
  if (reviewStatus) {
    if (reviewStatus === 'missing') {
      clauses.push('cr.id IS NULL');
    } else {
      params.push(reviewStatus);
      clauses.push(`cr.review_status = $${params.length}::text`);
    }
  }
  if (issueStatus) {
    params.push(issueStatus);
    clauses.push(`vp.status = $${params.length}::text`);
  }
  if (population === 'enforced') {
    clauses.push(`(COALESCE(vp.order_date, vp.created_at::date) >= $1::date OR COALESCE(cr.legacy_exception_flagged, false) = true)`);
  } else if (population === 'legacy') {
    clauses.push(`COALESCE(vp.order_date, vp.created_at::date) < $1::date AND COALESCE(cr.legacy_exception_flagged, false) = false`);
  } else if (population === 'requires-attention') {
    clauses.push(`(
      cr.id IS NULL
      OR cr.review_status IN ('blocked', 'requires_attention', 'pending')
      OR COALESCE(cr.second_party_complete, false) = false
      OR COALESCE(cr.vendor_approved, false) = false
      OR COALESCE(v.approved, false) = false
      OR (cr.far_required = true AND COALESCE(fd.applicable_flowdown_count, 0) = 0)
      OR (COALESCE(cr.review_notes, '') = '')
      OR (v.approval_expiration IS NOT NULL AND v.approval_expiration < CURRENT_DATE)
    )`);
  }

  const rowsSql = `
    WITH flowdowns AS (
      SELECT
        vpf.vendor_po_id,
        COUNT(*)::int AS total_flowdown_count,
        COUNT(*) FILTER (WHERE vpf.applicable = true)::int AS applicable_flowdown_count,
        COUNT(*) FILTER (WHERE vpf.applicable = false)::int AS not_applicable_flowdown_count,
        COALESCE(
          STRING_AGG(ffc.clause_number, ', ' ORDER BY ffc.clause_number) FILTER (WHERE vpf.applicable = true),
          ''
        ) AS flowdown_clause_numbers
      FROM vendor_po_far_flowdowns vpf
      JOIN far_flowdown_clauses ffc ON ffc.id = vpf.clause_id
      GROUP BY vpf.vendor_po_id
    ),
    approvals AS (
      SELECT
        requisition_id,
        COUNT(*)::int AS approval_count,
        COUNT(*) FILTER (WHERE decision = 'approved')::int AS approved_approval_count,
        (ARRAY_AGG(decided_by_display_name ORDER BY decided_at DESC NULLS LAST))[1] AS last_approval_by,
        MAX(decided_at) AS last_approval_at
      FROM purchase_requisition_approvals
      GROUP BY requisition_id
    )
    SELECT
      vp.id,
      COALESCE(vp.po_number, vp.id::text) AS po_number,
      vp.external_po_number,
      vp.vendor_id,
      v.name AS vendor_name,
      COALESCE(v.approved, false) AS vendor_master_approved,
      v.approval_level,
      v.approval_expiration,
      vp.production_line,
      vp.status,
      COALESCE(vp.order_date::timestamp, vp.created_at) AS issue_date,
      vp.expected_delivery_date,
      vp.total_cost,
      vp.updated_at AS po_updated_at,
      vp.competition_method AS po_competition_method,
      vp.sole_source_justification AS po_sole_source_justification,
      vp.direct_po_exception_approved_by_name,
      vp.direct_po_exception_approved_at,
      vp.direct_po_exception_reason,
      vp.vendor_confirmed_action,
      vp.vendor_confirmed_at,
      cr.id AS review_id,
      cr.review_status,
      cr.government_contract,
      cr.far_required,
      cr.dpas_required,
      cr.coc_required,
      cr.mtr_required,
      cr.source_inspection_required,
      cr.second_party_complete,
      cr.vendor_approved AS review_vendor_approved,
      cr.review_notes,
      cr.reviewed_by_display_name,
      cr.reviewed_at,
      COALESCE(cr.historical_backfill, false) AS historical_backfill,
      COALESCE(cr.legacy_exception_flagged, false) AS legacy_exception_flagged,
      cr.legacy_exception_reason,
      COALESCE(fd.applicable_flowdown_count, 0) AS applicable_flowdown_count,
      COALESCE(fd.not_applicable_flowdown_count, 0) AS not_applicable_flowdown_count,
      COALESCE(fd.flowdown_clause_numbers, '') AS flowdown_clause_numbers,
      pr.req_number,
      pr.status AS requisition_status,
      pr.justification AS requisition_justification,
      COALESCE(pr.competition_method, vp.competition_method) AS competition_method,
      COALESCE(pr.sole_source_justification, vp.sole_source_justification) AS sole_source_justification,
      COALESCE(ap.approval_count, 0) AS approval_count,
      COALESCE(ap.approved_approval_count, 0) AS approved_approval_count,
      ap.last_approval_by,
      ap.last_approval_at,
      dc.result AS debarment_result,
      dc.checked_at AS debarment_checked_at,
      CASE
        WHEN COALESCE(vp.order_date, vp.created_at::date) < $1::date
          AND COALESCE(cr.legacy_exception_flagged, false) = false THEN true
        ELSE false
      END AS is_legacy
    FROM vendor_pos vp
    JOIN vendors v ON v.id = vp.vendor_id
    LEFT JOIN vendor_po_compliance_reviews cr ON cr.vendor_po_id = vp.id
    LEFT JOIN flowdowns fd ON fd.vendor_po_id = vp.id
    LEFT JOIN purchase_requisitions pr ON pr.id = vp.requisition_id
    LEFT JOIN approvals ap ON ap.requisition_id = pr.id
    LEFT JOIN LATERAL (
      SELECT result, checked_at
      FROM vendor_debarment_checks vdc
      WHERE vdc.vendor_id = vp.vendor_id
        AND (vdc.context_ref_id = vp.id OR vdc.context_ref_id IS NULL)
      ORDER BY
        CASE WHEN vdc.context_ref_id = vp.id THEN 0 ELSE 1 END,
        vdc.checked_at DESC
      LIMIT 1
    ) dc ON true
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      CASE
        WHEN cr.id IS NULL THEN 0
        WHEN cr.review_status = 'requires_attention' THEN 1
        WHEN cr.review_status = 'blocked' THEN 2
        ELSE 3
      END,
      COALESCE(vp.order_date, vp.created_at::date) DESC,
      vp.id DESC;
  `;

  const result = await pgPool.query(rowsSql, params);
  const exceptions: ProcurementComplianceReport['exceptions'] = [];

  const purchaseOrders = result.rows.map((row) => {
    const status = String(row.status ?? '');
    const reviewStatusValue = row.review_status ?? null;
    const complianceStatus = deriveComplianceStatus(row);
    const vendorApprovalExpired = row.approval_expiration ? new Date(row.approval_expiration) < new Date(new Date().toDateString()) : false;
    const isStale = !!row.reviewed_at && new Date(row.reviewed_at) < new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const missingFarFlowdown = !!row.far_required && Number(row.applicable_flowdown_count ?? 0) === 0;
    const missingReview = row.review_id == null;
    const flags: string[] = [];

    if (missingReview) flags.push('Missing compliance review');
    if (reviewStatusValue === 'requires_attention') flags.push('Requires attention');
    if (reviewStatusValue === 'blocked') flags.push('Blocked review');
    if (missingFarFlowdown) flags.push('FAR/DFARS flowdown missing');
    if (!row.second_party_complete) flags.push('Second-party approval missing');
    if (!row.review_vendor_approved || !row.vendor_master_approved) flags.push('Vendor approval missing');
    if (vendorApprovalExpired) flags.push('Vendor approval expired');
    if (!String(row.review_notes ?? '').trim()) flags.push('Justification notes missing');
    if (isStale) flags.push('Review older than 365 days');
    if (isIssued(status) && missingReview) flags.push('Issued before review');
    if (row.debarment_result && !['clear', 'not_found', 'passed'].includes(String(row.debarment_result).toLowerCase())) {
      flags.push(`Debarment check ${row.debarment_result}`);
    }

    const po = {
      id: Number(row.id),
      poNumber: String(row.po_number),
      externalPoNumber: row.external_po_number ?? null,
      vendorId: Number(row.vendor_id),
      vendorName: row.vendor_name ?? 'Unknown Vendor',
      vendorApproved: !!row.vendor_master_approved,
      vendorApprovalLevel: row.approval_level ?? null,
      vendorApprovalExpiration: toDateOnly(row.approval_expiration),
      vendorApprovalExpired,
      productionLine: row.production_line ?? null,
      status,
      issueDate: toDateOnly(row.issue_date),
      expectedDeliveryDate: toDateOnly(row.expected_delivery_date),
      totalCost: round2(toNumber(row.total_cost)),
      complianceStatus,
      reviewStatus: reviewStatusValue,
      governmentContract: !!row.government_contract,
      farRequired: !!row.far_required,
      dpasRequired: !!row.dpas_required,
      cocRequired: !!row.coc_required,
      mtrRequired: !!row.mtr_required,
      sourceInspectionRequired: !!row.source_inspection_required,
      secondPartyComplete: !!row.second_party_complete,
      reviewVendorApproved: !!row.review_vendor_approved,
      reviewNotes: row.review_notes ?? '',
      reviewedBy: row.reviewed_by_display_name ?? null,
      reviewedAt: toIso(row.reviewed_at),
      historicalBackfill: !!row.historical_backfill,
      legacyExceptionFlagged: !!row.legacy_exception_flagged,
      legacyExceptionReason: row.legacy_exception_reason ?? null,
      isLegacy: !!row.is_legacy,
      isStale,
      applicableFlowdownCount: Number(row.applicable_flowdown_count ?? 0),
      notApplicableFlowdownCount: Number(row.not_applicable_flowdown_count ?? 0),
      flowdownClauseNumbers: row.flowdown_clause_numbers ?? '',
      requisitionNumber: row.req_number ?? null,
      requisitionStatus: row.requisition_status ?? null,
      requisitionJustification: row.requisition_justification ?? null,
      competitionMethod: row.competition_method ?? null,
      soleSourceJustification: row.sole_source_justification ?? null,
      approvalCount: Number(row.approval_count ?? 0),
      approvedApprovalCount: Number(row.approved_approval_count ?? 0),
      lastApprovalBy: row.last_approval_by ?? null,
      lastApprovalAt: toIso(row.last_approval_at),
      directPoExceptionApprovedBy: row.direct_po_exception_approved_by_name ?? null,
      directPoExceptionApprovedAt: toIso(row.direct_po_exception_approved_at),
      directPoExceptionReason: row.direct_po_exception_reason ?? null,
      vendorConfirmedAction: row.vendor_confirmed_action ?? null,
      vendorConfirmedAt: toIso(row.vendor_confirmed_at),
      debarmentResult: row.debarment_result ?? null,
      debarmentCheckedAt: toIso(row.debarment_checked_at),
      flags,
    };

    for (const flag of flags) {
      exceptions.push({
        severity: flag.includes('missing') || flag.includes('expired') || flag.includes('Blocked') ? 'critical' : 'warning',
        exceptionType: flag.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        message: `${po.poNumber}: ${flag}.`,
        poId: po.id,
        poNumber: po.poNumber,
      });
    }

    return po;
  });

  const summary = purchaseOrders.reduce<ProcurementComplianceReport['summary']>((acc, po) => {
    acc.totalPurchaseOrders += 1;
    acc.totalPoValue = round2(acc.totalPoValue + po.totalCost);
    if (po.complianceStatus === 'Reviewed') acc.reviewed += 1;
    if (po.complianceStatus === 'Pending Review') acc.pendingReview += 1;
    if (po.complianceStatus === 'Blocked') acc.blocked += 1;
    if (po.complianceStatus === 'Requires Attention') acc.requiresAttention += 1;
    if (po.farRequired) acc.farRequired += 1;
    if (!po.farRequired) acc.farNotRequired += 1;
    if (po.farRequired && po.applicableFlowdownCount === 0) acc.missingFarFlowdown += 1;
    if (!po.reviewNotes.trim()) acc.missingJustificationNotes += 1;
    if (!po.secondPartyComplete) acc.missingSecondPartyApproval += 1;
    if (!po.reviewVendorApproved || !po.vendorApproved) acc.missingVendorApproval += 1;
    if (po.vendorApprovalExpired) acc.vendorApprovalExpired += 1;
    if (po.isStale) acc.staleReviews += 1;
    if (isIssued(po.status) && po.reviewStatus == null) acc.issuedBeforeReview += 1;
    if (po.isLegacy) acc.legacyPurchaseOrders += 1;
    return acc;
  }, {
    totalPurchaseOrders: 0,
    totalPoValue: 0,
    reviewed: 0,
    pendingReview: 0,
    blocked: 0,
    requiresAttention: 0,
    farRequired: 0,
    farNotRequired: 0,
    missingFarFlowdown: 0,
    missingJustificationNotes: 0,
    missingSecondPartyApproval: 0,
    missingVendorApproval: 0,
    vendorApprovalExpired: 0,
    staleReviews: 0,
    issuedBeforeReview: 0,
    legacyPurchaseOrders: 0,
  });

  summary.totalPoValue = round2(summary.totalPoValue);

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      reviewStatus: reviewStatus ?? null,
      issueStatus: issueStatus ?? null,
      population,
    },
    effectiveDate,
    summary,
    purchaseOrders,
    exceptions,
  };
}
