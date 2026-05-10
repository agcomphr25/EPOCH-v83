import { pgPool } from '../../db';

export interface UnallowableCostReviewReportFilters {
  startDate?: string;
  endDate?: string;
  dcaaStatus?: string;
  allowabilityStatus?: string;
}

type Severity = 'info' | 'warning' | 'critical';

export interface UnallowableCostReviewReport {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    dcaaStatus: string | null;
    allowabilityStatus: string | null;
  };
  summary: {
    totalTransactions: number;
    needsReview: number;
    complete: number;
    exceptions: number;
    pendingReview: number;
    allowable: number;
    unallowable: number;
    allowabilityNeedsReview: number;
    missingGlAccount: number;
    missingReason: number;
    totalAmount: number;
    unallowableAmount: number;
    exceptionAmount: number;
  };
  transactions: Array<{
    id: string;
    transactionNumber: string;
    transactionType: string;
    transactionDate: string;
    status: string;
    paidByName: string;
    vendorName: string;
    amount: number;
    businessPurpose: string;
    projectId: string | null;
    contractNumber: string | null;
    directIndirect: string;
    costCategory: string;
    receiptStatus: string;
    attachmentCount: number;
    glAccountId: number | null;
    glAccountName: string | null;
    glAccountType: string | null;
    glPostingStatus: string;
    allowabilityStatus: string;
    dcaaReviewStatus: string;
    reviewer: string | null;
    reviewedAt: string | null;
    reason: string | null;
    submittedBy: string;
    submittedAt: string | null;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    transactionId: string | null;
    transactionNumber: string | null;
  }>;
}

const DCAA_STATUSES = new Set(['NEEDS_REVIEW', 'COMPLETE', 'EXCEPTION']);
const ALLOWABILITY_STATUSES = new Set(['PENDING_REVIEW', 'ALLOWABLE', 'UNALLOWABLE', 'NEEDS_REVIEW']);

function parseDateFilter(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }
  return value;
}

function parseStatus(value: string | undefined, allowed: Set<string>, label: string): string | undefined {
  if (!value || value === 'all') return undefined;
  const normalized = value.toUpperCase();
  if (!allowed.has(normalized)) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getUnallowableCostReviewReport(
  filters: UnallowableCostReviewReportFilters = {},
): Promise<UnallowableCostReviewReport> {
  const startDate = parseDateFilter(filters.startDate, 'startDate');
  const endDate = parseDateFilter(filters.endDate, 'endDate');
  const dcaaStatus = parseStatus(filters.dcaaStatus, DCAA_STATUSES, 'dcaaStatus');
  const allowabilityStatus = parseStatus(filters.allowabilityStatus, ALLOWABILITY_STATUSES, 'allowabilityStatus');

  const params: unknown[] = [];
  const clauses: string[] = [];
  if (startDate) {
    params.push(startDate);
    clauses.push(`aet.transaction_date >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    clauses.push(`aet.transaction_date <= $${params.length}::date`);
  }
  if (dcaaStatus) {
    params.push(dcaaStatus);
    clauses.push(`aet.dcaa_review_status = $${params.length}::text`);
  }
  if (allowabilityStatus) {
    params.push(allowabilityStatus);
    clauses.push(`aet.allowability_status = $${params.length}::text`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rowsSql = `
    SELECT
      aet.id,
      aet.transaction_number,
      aet.transaction_type,
      aet.transaction_date,
      aet.status,
      aet.paid_by_name,
      aet.vendor_name,
      aet.amount,
      aet.business_purpose,
      aet.project_id,
      aet.contract_number,
      aet.direct_indirect,
      aet.cost_category,
      aet.receipt_status,
      COALESCE(att.count, 0)::int AS attachment_count,
      aet.gl_account_id,
      COALESCE(coa.account_name, aet.gl_account_name_snapshot) AS gl_account_name,
      coa.account_type AS gl_account_type,
      aet.gl_posting_status,
      aet.allowability_status,
      aet.dcaa_review_status,
      aet.reviewed_by_display_name,
      aet.reviewed_at,
      aet.notes,
      aet.submitted_by_display_name,
      aet.submitted_at
    FROM accounting_expense_transactions aet
    LEFT JOIN chart_of_accounts coa ON coa.id = aet.gl_account_id
    LEFT JOIN (
      SELECT transaction_id, COUNT(*) AS count
      FROM accounting_expense_transaction_attachments
      GROUP BY transaction_id
    ) att ON att.transaction_id = aet.id
    ${where}
    ORDER BY
      CASE aet.dcaa_review_status
        WHEN 'EXCEPTION' THEN 0
        WHEN 'NEEDS_REVIEW' THEN 1
        ELSE 2
      END,
      aet.transaction_date DESC,
      aet.created_at DESC;
  `;

  const result = await pgPool.query(rowsSql, params);
  const transactions = result.rows.map((row) => ({
    id: row.id,
    transactionNumber: row.transaction_number,
    transactionType: row.transaction_type,
    transactionDate: row.transaction_date instanceof Date ? row.transaction_date.toISOString().slice(0, 10) : String(row.transaction_date),
    status: row.status,
    paidByName: row.paid_by_name,
    vendorName: row.vendor_name,
    amount: round2(toNumber(row.amount)),
    businessPurpose: row.business_purpose,
    projectId: row.project_id ?? null,
    contractNumber: row.contract_number ?? null,
    directIndirect: row.direct_indirect,
    costCategory: row.cost_category,
    receiptStatus: row.receipt_status,
    attachmentCount: Number(row.attachment_count ?? 0),
    glAccountId: row.gl_account_id == null ? null : Number(row.gl_account_id),
    glAccountName: row.gl_account_name ?? null,
    glAccountType: row.gl_account_type ?? null,
    glPostingStatus: row.gl_posting_status,
    allowabilityStatus: row.allowability_status,
    dcaaReviewStatus: row.dcaa_review_status,
    reviewer: row.reviewed_by_display_name ?? null,
    reviewedAt: toIso(row.reviewed_at ?? null),
    reason: row.notes ?? null,
    submittedBy: row.submitted_by_display_name,
    submittedAt: toIso(row.submitted_at ?? null),
  }));

  const exceptions: UnallowableCostReviewReport['exceptions'] = [];
  for (const row of transactions) {
    if (row.dcaaReviewStatus === 'EXCEPTION') {
      exceptions.push({
        severity: 'critical',
        exceptionType: 'DCAA_REVIEW_EXCEPTION',
        message: `${row.transactionNumber} is marked as a DCAA review exception.`,
        transactionId: row.id,
        transactionNumber: row.transactionNumber,
      });
    }
    if ((row.allowabilityStatus === 'UNALLOWABLE' || row.dcaaReviewStatus === 'EXCEPTION') && !row.reason) {
      exceptions.push({
        severity: 'warning',
        exceptionType: 'MISSING_ALLOWABILITY_REASON',
        message: `${row.transactionNumber} needs documented allowability rationale.`,
        transactionId: row.id,
        transactionNumber: row.transactionNumber,
      });
    }
    if (!row.glAccountId) {
      exceptions.push({
        severity: 'warning',
        exceptionType: 'MISSING_GL_ACCOUNT',
        message: `${row.transactionNumber} is not assigned to a GL account.`,
        transactionId: row.id,
        transactionNumber: row.transactionNumber,
      });
    }
    if (row.dcaaReviewStatus === 'COMPLETE' && !row.reviewer) {
      exceptions.push({
        severity: 'warning',
        exceptionType: 'MISSING_REVIEWER',
        message: `${row.transactionNumber} is complete but has no reviewer snapshot.`,
        transactionId: row.id,
        transactionNumber: row.transactionNumber,
      });
    }
  }

  const summary = {
    totalTransactions: transactions.length,
    needsReview: transactions.filter((row) => row.dcaaReviewStatus === 'NEEDS_REVIEW').length,
    complete: transactions.filter((row) => row.dcaaReviewStatus === 'COMPLETE').length,
    exceptions: transactions.filter((row) => row.dcaaReviewStatus === 'EXCEPTION').length,
    pendingReview: transactions.filter((row) => row.allowabilityStatus === 'PENDING_REVIEW').length,
    allowable: transactions.filter((row) => row.allowabilityStatus === 'ALLOWABLE').length,
    unallowable: transactions.filter((row) => row.allowabilityStatus === 'UNALLOWABLE').length,
    allowabilityNeedsReview: transactions.filter((row) => row.allowabilityStatus === 'NEEDS_REVIEW').length,
    missingGlAccount: transactions.filter((row) => !row.glAccountId).length,
    missingReason: transactions.filter((row) => (row.allowabilityStatus === 'UNALLOWABLE' || row.dcaaReviewStatus === 'EXCEPTION') && !row.reason).length,
    totalAmount: round2(transactions.reduce((sum, row) => sum + row.amount, 0)),
    unallowableAmount: round2(transactions.filter((row) => row.allowabilityStatus === 'UNALLOWABLE').reduce((sum, row) => sum + row.amount, 0)),
    exceptionAmount: round2(transactions.filter((row) => row.dcaaReviewStatus === 'EXCEPTION').reduce((sum, row) => sum + row.amount, 0)),
  };

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      dcaaStatus: dcaaStatus ?? null,
      allowabilityStatus: allowabilityStatus ?? null,
    },
    summary,
    transactions,
    exceptions,
  };
}
