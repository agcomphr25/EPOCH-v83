/**
 * auditReportingService — Task #85
 *
 * Unified, filterable view of the audit ledger plus CSV export with
 * a SHA-256 checksum manifest (matching payroll export conventions).
 */

import crypto from 'crypto';
import { db } from '../../db';
import { auditEvents } from '../../schema';
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';

export type ReportFilters = {
  eventTypes?: string[];
  subjectType?: string;
  subjectId?: string;
  actorId?: number;
  actorName?: string;
  sourceService?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
};

const MAX_PAGE = 5000;
const HARD_CAP = 100_000;

function buildWhere(f: ReportFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.eventTypes && f.eventTypes.length > 0) {
    conds.push(inArray(auditEvents.action, f.eventTypes));
  }
  if (f.subjectType) {
    conds.push(
      sql`(${auditEvents.subjectType} = ${f.subjectType} OR ${auditEvents.entityType} = ${f.subjectType})`,
    );
  }
  if (f.subjectId) {
    conds.push(
      sql`(${auditEvents.subjectId} = ${f.subjectId} OR ${auditEvents.entityId} = ${f.subjectId})`,
    );
  }
  if (f.actorId != null) conds.push(eq(auditEvents.actorId, f.actorId));
  if (f.actorName) conds.push(eq(auditEvents.actorName, f.actorName));
  if (f.sourceService) conds.push(eq(auditEvents.sourceService, f.sourceService));
  if (f.fromDate) {
    conds.push(
      sql`COALESCE(${auditEvents.occurredAt}, ${auditEvents.recordedAt}, ${auditEvents.createdAt}) >= ${f.fromDate}`,
    );
  }
  if (f.toDate) {
    conds.push(
      sql`COALESCE(${auditEvents.occurredAt}, ${auditEvents.recordedAt}, ${auditEvents.createdAt}) <= ${f.toDate}`,
    );
  }
  return conds.length > 0 ? and(...conds) : undefined;
}

export async function queryAuditEvents(f: ReportFilters) {
  const where = buildWhere(f);
  const limit = Math.min(Math.max(f.limit ?? 100, 1), MAX_PAGE);
  const offset = Math.max(f.offset ?? 0, 0);

  const rows = await db
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.id))
    .limit(limit)
    .offset(offset);

  const totalRow = await db
    .select({ c: sql<number>`count(*)::bigint` })
    .from(auditEvents)
    .where(where);

  return {
    rows,
    total: Number(totalRow[0]?.c ?? 0),
    limit,
    offset,
  };
}

type AuditRow = typeof auditEvents.$inferSelect;

const CSV_COLUMNS: Array<{ header: string; pick: (r: AuditRow) => unknown }> = [
  { header: 'sequence_number', pick: (r) => r.sequenceNumber },
  { header: 'id', pick: (r) => r.id },
  { header: 'occurred_at', pick: (r) => r.occurredAt },
  { header: 'recorded_at', pick: (r) => r.recordedAt },
  { header: 'event_type', pick: (r) => r.action },
  { header: 'subject_type', pick: (r) => r.subjectType },
  { header: 'subject_id', pick: (r) => r.subjectId },
  { header: 'entity_type', pick: (r) => r.entityType },
  { header: 'entity_id', pick: (r) => r.entityId },
  { header: 'source_service', pick: (r) => r.sourceService },
  { header: 'actor_id', pick: (r) => r.actorId },
  { header: 'actor_name', pick: (r) => r.actorName },
  { header: 'actor_role', pick: (r) => r.actorRole },
  { header: 'reason', pick: (r) => r.reason },
  { header: 'ip_address', pick: (r) => r.ipAddress },
  { header: 'payload_hash', pick: (r) => r.payloadHash },
  { header: 'prev_hash', pick: (r) => r.prevHash },
  { header: 'row_hash', pick: (r) => r.rowHash },
  { header: 'payload_json', pick: (r) => r.payloadJson },
];

function csvEscape(v: unknown): string {
  if (v == null) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export type ExportResult = {
  csv: string;
  manifest: {
    generatedAt: string;
    rowCount: number;
    sha256: string;
    filters: ReportFilters;
    columns: string[];
  };
};

/**
 * Stream the full filtered set into a CSV string and return a manifest
 * containing a SHA-256 checksum (same convention as payroll exports).
 */
export async function exportAuditEventsCsv(f: ReportFilters): Promise<ExportResult> {
  const where = buildWhere(f);

  const rows = await db
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(asc(auditEvents.id))
    .limit(HARD_CAP);

  const lines: string[] = [];
  lines.push(CSV_COLUMNS.map((c) => c.header).join(','));
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvEscape(c.pick(r))).join(','));
  }
  const csv = lines.join('\n') + '\n';
  const sha = crypto.createHash('sha256').update(csv, 'utf8').digest('hex');

  // Normalize filter dates to ISO so the manifest is reproducible.
  const filtersOut: ReportFilters = {
    ...f,
    fromDate: f.fromDate ? new Date(f.fromDate) : undefined,
    toDate: f.toDate ? new Date(f.toDate) : undefined,
  };

  return {
    csv,
    manifest: {
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      sha256: sha,
      filters: filtersOut,
      columns: CSV_COLUMNS.map((c) => c.header),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Saved DCAA / CMMC report templates
// ─────────────────────────────────────────────────────────────────────

export type SavedTemplate = {
  key: string;
  title: string;
  description: string;
  framework: 'DCAA' | 'CMMC' | 'INTERNAL';
  /** A function that fills in dynamic fields (e.g. period dates). */
  build: (params: { fromDate?: Date; toDate?: Date; subjectId?: string }) => ReportFilters;
};

export const SAVED_TEMPLATES: SavedTemplate[] = [
  {
    key: 'labor-approval-trail',
    title: 'Labor approval trail (period)',
    description: 'All labor approval, certification, and correction events for a date range.',
    framework: 'DCAA',
    build: ({ fromDate, toDate }) => ({
      eventTypes: [
        'LABOR_APPROVAL',
        'LABOR_APPROVAL_CREATED',
        'LABOR_APPROVAL_REVOKED',
        'LABOR_CORRECTION',
        'TIMESHEET_CERTIFIED',
        'TIMESHEET_CORRECTION',
      ],
      fromDate,
      toDate,
    }),
  },
  {
    key: 'period-close-history',
    title: 'Period close + reopen history',
    description: 'Pay-period close, reopen, and lock events.',
    framework: 'DCAA',
    build: ({ fromDate, toDate }) => ({
      eventTypes: ['PERIOD_CLOSE', 'PERIOD_REOPEN', 'PAYROLL_PERIOD_LOCKED'],
      fromDate,
      toDate,
    }),
  },
  {
    key: 'payroll-export-history',
    title: 'Payroll export history (immutable batches)',
    description: 'All payroll export batch creation, supersede, void, and download events.',
    framework: 'DCAA',
    build: ({ fromDate, toDate }) => ({
      eventTypes: [
        'PAYROLL_EXPORT_CREATED',
        'PAYROLL_EXPORT_SUPERSEDED',
        'PAYROLL_EXPORT_VOIDED',
        'PAYROLL_EXPORT_DOWNLOADED',
        'PAYROLL_EXPORT_PROCESSED',
      ],
      fromDate,
      toDate,
    }),
  },
  {
    key: 'procurement-approvals',
    title: 'Procurement approvals',
    description: 'PO release, approval, and lock events.',
    framework: 'DCAA',
    build: ({ fromDate, toDate }) => ({
      eventTypes: [
        'PO_APPROVED',
        'PO_RELEASED',
        'PO_LOCKED',
        'PO_UNLOCKED',
        'VENDOR_APPROVED',
      ],
      fromDate,
      toDate,
    }),
  },
  {
    key: 'policy-acknowledgments',
    title: 'Policy acknowledgments',
    description: 'All employee acknowledgments of written policies & training.',
    framework: 'CMMC',
    build: ({ fromDate, toDate }) => ({
      eventTypes: [
        'POLICY_ACKNOWLEDGMENT',
        'TRAINING_COMPLETED',
        'ONBOARDING_COMPLETED',
      ],
      fromDate,
      toDate,
    }),
  },
  {
    key: 'tamper-attempts',
    title: 'Audit ledger tamper attempts',
    description: 'High-severity events recorded when UPDATE/DELETE was blocked on audit_events.',
    framework: 'CMMC',
    build: ({ fromDate, toDate }) => ({
      eventTypes: ['AUDIT_DML_BLOCKED'],
      fromDate,
      toDate,
    }),
  },
];
