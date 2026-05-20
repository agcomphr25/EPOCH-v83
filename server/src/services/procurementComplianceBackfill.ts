import { pool } from '../../db';

export type BackfillPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type BackfillFilter = 'all' | 'enforced' | 'legacy' | 'audit-sensitive-legacy';

export interface BackfillRow {
  id: number;
  poNumber: string;
  vendorId: number;
  vendorName: string;
  status: string;
  issueDate: string | null;
  complianceStatus: string;
  reviewStatus: string | null;
  farRequired: boolean;
  governmentContract: boolean;
  dpasRequired: boolean;
  cocRequired: boolean;
  mtrRequired: boolean;
  sourceInspectionRequired: boolean;
  hasFarStatement: boolean;
  missingReview: boolean;
  missingFarStatement: boolean;
  missingSecondPartyApproval: boolean;
  missingVendorApproval: boolean;
  missingJustificationNotes: boolean;
  requiresAttention: boolean;
  isStale: boolean;
  reviewedAt: string | null;
  reviewedByDisplayName: string | null;
  historicalBackfill: boolean;
  secondPartyComplete: boolean;
  vendorApproved: boolean;
  reviewNotes: string;
  priority: BackfillPriority;
  failingReasons: string[];
  recommendedActions: string[];
  isLegacy: boolean;
  legacyExceptionFlagged: boolean;
  legacyExceptionReason: string | null;
  effectiveDate: string;
}

function assignPriority(row: Omit<BackfillRow, 'priority' | 'failingReasons' | 'recommendedActions'>): BackfillPriority {
  const isIssued = ['Sent', 'Partially Received', 'Fully Received'].includes(row.status);

  // No review at all is the most severe enforced-population failure — it drops
  // FAR_FLOWDOWN to 0 when the PO is in the current scoring population.
  // Legacy pre-policy rows remain isolated unless they are exception-flagged.
  // We don't know FAR/gov status without a review, so no-review issued POs are HIGH.
  if (isIssued && row.missingReview) {
    return 'HIGH';
  }

  // Review exists but is blocked on a FAR/gov-contract PO → CRITICAL
  if (isIssued && (row.farRequired || row.governmentContract) && (row.requiresAttention || row.reviewStatus === 'blocked')) {
    return 'CRITICAL';
  }

  if (row.requiresAttention) return 'HIGH';
  if (row.isStale) return 'HIGH';
  if (row.farRequired && row.missingFarStatement) return 'HIGH';

  if (row.missingJustificationNotes) return 'MEDIUM';
  if (row.missingSecondPartyApproval || row.missingVendorApproval) return 'MEDIUM';

  return 'LOW';
}

function buildFailingReasons(row: Omit<BackfillRow, 'priority' | 'failingReasons' | 'recommendedActions'>): string[] {
  const reasons: string[] = [];

  if (row.isLegacy && !row.legacyExceptionFlagged) {
    reasons.push('Legacy pre-policy transaction — issued before compliance enforcement effective date');
  }
  if (row.missingReview) {
    reasons.push('No compliance review record exists for this PO');
  }
  if (row.missingFarStatement) {
    reasons.push('FAR/DFARS is required but no FAR statement has been attached');
  }
  if (row.missingSecondPartyApproval) {
    reasons.push('Second-party approval has not been completed');
  }
  if (row.missingVendorApproval) {
    reasons.push('Vendor approval is not confirmed');
  }
  if (row.missingJustificationNotes) {
    reasons.push('Justification notes are empty — documentation gap');
  }
  if (row.requiresAttention) {
    reasons.push('Review status is "Requires Attention" — reviewer flagged an issue');
  }
  if (row.isStale) {
    reasons.push('Compliance review is older than 365 days (stale per annual audit cycle)');
  }
  if (row.reviewStatus === 'blocked') {
    reasons.push('Review is in "Blocked" status — compliance gate failed');
  }

  return reasons;
}

function buildRecommendedActions(row: Omit<BackfillRow, 'priority' | 'failingReasons' | 'recommendedActions'>): string[] {
  const actions: string[] = [];
  let step = 1;

  if (row.isLegacy && !row.legacyExceptionFlagged) {
    actions.push(`${step++}. Flag for Exception Review if this PO is subject to a government contract or audit scrutiny`);
  }

  if (row.missingReview) {
    actions.push(`${step++}. Open the PO and complete a new compliance review via the Compliance Review dialog`);
  } else {
    actions.push(`${step++}. Reopen the compliance review via the "Reopen Compliance Review" button on this row`);
  }

  if (row.missingFarStatement) {
    actions.push(`${step++}. Attach a FAR/DFARS optional statement to the PO via Optional Settings`);
  }
  if (row.missingSecondPartyApproval) {
    actions.push(`${step++}. Complete second-party sign-off in the compliance review`);
  }
  if (row.missingVendorApproval) {
    actions.push(`${step++}. Confirm vendor approval and check the "Vendor Approved" field`);
  }
  if (row.missingJustificationNotes) {
    actions.push(`${step++}. Add justification notes explaining the compliance disposition`);
  }
  if (row.isStale) {
    actions.push(`${step++}. Re-review compliance — the existing review is over 365 days old`);
  }

  return actions;
}

async function getEffectiveDate(): Promise<string> {
  try {
    const rows = await pool.query(
      `SELECT effective_date::text AS effective_date FROM procurement_compliance_effective_dates ORDER BY configured_at DESC LIMIT 1`
    ) as Array<{ effective_date: string }>;
    return rows[0]?.effective_date ?? '2026-06-01';
  } catch {
    return '2026-06-01';
  }
}

export async function getProcurementComplianceBackfillQueue(
  filter: BackfillFilter = 'all'
): Promise<BackfillRow[]> {
  const effectiveDate = await getEffectiveDate();

  // Build an additional WHERE clause based on filter.
  // The effective date is passed as $1 in parameterized form — never interpolated.
  let filterClause = '';
  if (filter === 'enforced') {
    filterClause = `AND (COALESCE(vp.order_date, vp.created_at::date) >= $1::date OR COALESCE(cr.legacy_exception_flagged, false) = true)`;
  } else if (filter === 'legacy') {
    filterClause = `AND COALESCE(vp.order_date, vp.created_at::date) < $1::date AND COALESCE(cr.legacy_exception_flagged, false) = false`;
  } else if (filter === 'audit-sensitive-legacy') {
    filterClause = `AND COALESCE(vp.order_date, vp.created_at::date) < $1::date AND COALESCE(cr.legacy_exception_flagged, false) = true`;
  }
  // 'all' — no additional population filter (but $1 still used in the is_legacy CASE below)

  const rows = await pool.query(`
    SELECT
      vp.id,
      COALESCE(vp.po_number, vp.id::text)   AS po_number,
      vp.vendor_id,
      v.name                                  AS vendor_name,
      vp.status,
      COALESCE(vp.order_date::timestamp, vp.created_at) AS issue_date,
      cr.id                                   AS review_id,
      cr.government_contract,
      cr.far_required,
      cr.dpas_required,
      cr.coc_required,
      cr.mtr_required,
      cr.source_inspection_required,
      cr.second_party_complete,
      cr.vendor_approved,
      cr.review_notes,
      cr.review_status,
      cr.reviewed_at,
      cr.reviewed_by_display_name,
      COALESCE(cr.historical_backfill, false) AS historical_backfill,
      COALESCE(cr.legacy_exception_flagged, false) AS legacy_exception_flagged,
      cr.legacy_exception_reason,
      CASE
        WHEN cr.review_status = 'requires_attention' THEN true
        ELSE false
      END AS requires_attention,
      CASE
        WHEN cr.reviewed_at IS NOT NULL
          AND cr.reviewed_at < NOW() - INTERVAL '365 days' THEN true
        ELSE false
      END AS is_stale,
      CASE WHEN has_far.found IS NOT NULL THEN true ELSE false END AS has_far_statement,
      CASE
        WHEN COALESCE(vp.order_date, vp.created_at::date) < $1::date
          AND COALESCE(cr.legacy_exception_flagged, false) = false THEN true
        ELSE false
      END AS is_legacy
    FROM vendor_pos vp
    JOIN vendors v ON v.id = vp.vendor_id
    LEFT JOIN vendor_po_compliance_reviews cr ON cr.vendor_po_id = vp.id
    LEFT JOIN LATERAL (
      SELECT 1 AS found
      FROM po_optional_settings pos2
      JOIN optional_settings os ON os.id = pos2.optional_setting_id
      WHERE pos2.vendor_po_id = vp.id
        AND (os.name ILIKE '%FAR%' OR os.name ILIKE '%DFAR%')
      LIMIT 1
    ) has_far ON true
    WHERE vp.status IN ('Sent', 'Partially Received', 'Fully Received')
      AND vp.archived = false
      ${filterClause}
      AND (
        -- 1. No review record (score drops to 0 — most critical)
        cr.id IS NULL
        -- 2. Review status is not 'reviewed' (pending / requires_attention / blocked)
        OR cr.review_status NOT IN ('reviewed')
        -- 3. FAR/DFARS required but no statement attached
        OR (cr.far_required = true AND has_far.found IS NULL)
        -- 4. Silent exemption: non-FAR PO has no justification notes
        OR (cr.far_required = false AND cr.review_status = 'reviewed' AND COALESCE(cr.review_notes, '') = '')
        -- 5. Stale review (older than 365 days — annual audit cycle)
        OR (
          cr.review_status = 'reviewed'
          AND cr.reviewed_at IS NOT NULL
          AND cr.reviewed_at < NOW() - INTERVAL '365 days'
        )
      )
    ORDER BY vp.id DESC
  `, [effectiveDate]);

  return rows.map((r: any) => {
    const missingReview = r.review_id == null;
    const missingFarStatement = !missingReview && !!r.far_required && !r.has_far_statement;
    // "Silent exemption" per FAR_FLOWDOWN scorer: non-FAR PO, reviewed, but notes empty
    const missingJustificationNotes = !missingReview && !r.far_required && r.review_status === 'reviewed' && !r.review_notes;
    // Informational flags (cause review_status = 'blocked', captured by predicate 2)
    const missingSecondPartyApproval = !missingReview && !(r.second_party_complete ?? false);
    const missingVendorApproval = !missingReview && !(r.vendor_approved ?? false);
    const requiresAttention = !!r.requires_attention;
    const isStale = !!r.is_stale;
    const isLegacy = !!r.is_legacy;
    const legacyExceptionFlagged = !!r.legacy_exception_flagged;

    const partial: Omit<BackfillRow, 'priority' | 'failingReasons' | 'recommendedActions'> = {
      id: Number(r.id),
      poNumber: String(r.po_number),
      vendorId: Number(r.vendor_id),
      vendorName: String(r.vendor_name ?? 'Unknown Vendor'),
      status: String(r.status),
      issueDate: r.issue_date ? String(r.issue_date) : null,
      complianceStatus: missingReview
        ? 'Pending Review'
        : r.review_status === 'reviewed'
          ? 'Reviewed'
          : r.review_status === 'blocked'
            ? 'Blocked'
            : r.review_status === 'requires_attention'
              ? 'Requires Attention'
              : 'Pending Review',
      reviewStatus: r.review_status ?? null,
      farRequired: !!r.far_required,
      governmentContract: !!r.government_contract,
      dpasRequired: !!r.dpas_required,
      cocRequired: !!r.coc_required,
      mtrRequired: !!r.mtr_required,
      sourceInspectionRequired: !!r.source_inspection_required,
      hasFarStatement: !!r.has_far_statement,
      missingReview,
      missingFarStatement,
      missingSecondPartyApproval,
      missingVendorApproval,
      missingJustificationNotes,
      requiresAttention,
      isStale,
      reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
      reviewedByDisplayName: r.reviewed_by_display_name ?? null,
      historicalBackfill: !!r.historical_backfill,
      secondPartyComplete: !!r.second_party_complete,
      vendorApproved: !!r.vendor_approved,
      reviewNotes: r.review_notes ?? '',
      isLegacy,
      legacyExceptionFlagged,
      legacyExceptionReason: r.legacy_exception_reason ?? null,
      effectiveDate,
    };

    const priority = assignPriority(partial);
    const failingReasons = buildFailingReasons(partial);
    const recommendedActions = buildRecommendedActions(partial);

    return { ...partial, priority, failingReasons, recommendedActions };
  });
}
