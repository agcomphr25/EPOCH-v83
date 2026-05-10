import { pgPool } from '../../db';
import {
  exportAuditEventsCsv,
  type ReportFilters,
} from './auditReportingService';
import {
  DCAA_RETENTION_FLOOR_DAYS,
  getRetentionPolicies,
  listAnchors,
  verifyRecentChain,
} from './auditLedgerService';

export interface AuditLedgerIntegrityReportFilters {
  startDate?: string;
  endDate?: string;
  windowSize?: string;
}

type Severity = 'info' | 'warning' | 'critical';

export interface AuditLedgerIntegrityReport {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    windowSize: number;
  };
  summary: {
    totalLedgerEvents: number;
    chainedEvents: number;
    chainCoveragePercent: number;
    chainOk: boolean;
    rowsVerified: number;
    latestSequence: number;
    latestAnchorSequence: number | null;
    latestAnchorAt: string | null;
    anchorLagEvents: number | null;
    retentionPolicyCount: number;
    belowFloorPolicies: number;
    tamperAttempts: number;
    unresolvedTamperAttempts: number;
    exportRowCount: number;
    exportSha256: string;
  };
  chainVerification: {
    ok: boolean;
    startSequence: number;
    endSequence: number;
    rowsChecked: number;
    firstMismatchSequence: number | null;
    firstMismatchEventId: number | null;
    headRowHash: string | null;
    message: string | null;
    verifiedAt: string;
    windowSize: number;
  };
  latestAnchors: Array<{
    id: number;
    anchoredAt: string;
    headEventId: number | null;
    headRowHash: string | null;
    headSequence: number | null;
    eventCount: number | null;
    notes: string | null;
    exportedTo: string | null;
    createdBy: string | null;
  }>;
  retentionPolicies: Array<{
    id: number;
    eventType: string;
    minRetentionDays: number;
    archiveAfterDays: number | null;
    description: string | null;
    updatedAt: string;
    belowDcaaFloor: boolean;
  }>;
  tamperAttempts: Array<{
    id: number;
    attemptedAt: string | null;
    op: string | null;
    dbRole: string | null;
    sessionUser: string | null;
    clientAddr: string | null;
    applicationName: string | null;
    targetId: string | null;
    targetSequence: number | null;
    drainedAt: string | null;
    drainedEventId: number | null;
  }>;
  exportManifest: {
    generatedAt: string;
    rowCount: number;
    sha256: string;
    columns: string[];
    filters: Record<string, unknown>;
  };
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
  }>;
}

function parseDateFilter(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }
  return value;
}

function parseWindowSize(value: string | undefined): number {
  if (!value) return 5000;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50000) {
    throw new Error('windowSize must be an integer between 1 and 50000');
  }
  return parsed;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

async function getLedgerCounts(startDate?: string, endDate?: string) {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (startDate) {
    params.push(startDate);
    clauses.push(`COALESCE(occurred_at, recorded_at, created_at) >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    clauses.push(`COALESCE(occurred_at, recorded_at, created_at) < ($${params.length}::date + INTERVAL '1 day')`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pgPool.query(`
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(*) FILTER (
        WHERE sequence_number IS NOT NULL
          AND row_hash IS NOT NULL
          AND prev_hash IS NOT NULL
          AND payload_hash IS NOT NULL
      )::int AS chained_events,
      COALESCE(MAX(sequence_number), 0)::bigint AS latest_sequence
    FROM audit_events
    ${where}
  `, params);

  return {
    totalLedgerEvents: Number(result.rows[0]?.total_events ?? 0),
    chainedEvents: Number(result.rows[0]?.chained_events ?? 0),
    latestSequence: Number(result.rows[0]?.latest_sequence ?? 0),
  };
}

async function getTamperAttempts(limit = 25) {
  try {
    const result = await pgPool.query(`
      SELECT id, attempted_at, op, db_role, session_user_n, client_addr,
             application_nm, target_id, target_seq, drained_at, drained_event_id
      FROM public.audit_dml_attempts
      ORDER BY attempted_at DESC NULLS LAST, id DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map((row) => ({
      id: Number(row.id),
      attemptedAt: toIso(row.attempted_at),
      op: row.op ?? null,
      dbRole: row.db_role ?? null,
      sessionUser: row.session_user_n ?? null,
      clientAddr: row.client_addr == null ? null : String(row.client_addr),
      applicationName: row.application_nm ?? null,
      targetId: row.target_id == null ? null : String(row.target_id),
      targetSequence: row.target_seq == null ? null : Number(row.target_seq),
      drainedAt: toIso(row.drained_at),
      drainedEventId: row.drained_event_id == null ? null : Number(row.drained_event_id),
    }));
  } catch {
    return [];
  }
}

export async function getAuditLedgerIntegrityReport(
  filters: AuditLedgerIntegrityReportFilters = {},
): Promise<AuditLedgerIntegrityReport> {
  const startDate = parseDateFilter(filters.startDate, 'startDate');
  const endDate = parseDateFilter(filters.endDate, 'endDate');
  const windowSize = parseWindowSize(filters.windowSize);

  const [counts, chainVerification, anchorsRaw, retentionRaw, tamperAttempts] = await Promise.all([
    getLedgerCounts(startDate, endDate),
    verifyRecentChain(windowSize),
    listAnchors(10),
    getRetentionPolicies(),
    getTamperAttempts(25),
  ]);

  const reportFilters: ReportFilters = {
    fromDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : undefined,
    toDate: endDate ? new Date(`${endDate}T23:59:59.999Z`) : undefined,
  };
  const exportResult = await exportAuditEventsCsv(reportFilters);

  const latestAnchors = anchorsRaw.map((row) => ({
    id: Number(row.id),
    anchoredAt: toIso(row.anchoredAt) ?? '',
    headEventId: row.headEventId == null ? null : Number(row.headEventId),
    headRowHash: row.headRowHash ?? null,
    headSequence: row.headSequence == null ? null : Number(row.headSequence),
    eventCount: row.eventCount == null ? null : Number(row.eventCount),
    notes: row.notes ?? null,
    exportedTo: row.exportedTo ?? null,
    createdBy: row.createdBy ?? null,
  }));

  const latestAnchor = latestAnchors[0] ?? null;
  const retentionPolicies = retentionRaw.map((row) => ({
    id: Number(row.id),
    eventType: row.eventType,
    minRetentionDays: Number(row.minRetentionDays ?? 0),
    archiveAfterDays: row.archiveAfterDays == null ? null : Number(row.archiveAfterDays),
    description: row.description ?? null,
    updatedAt: toIso(row.updatedAt) ?? '',
    belowDcaaFloor: Number(row.minRetentionDays ?? 0) < DCAA_RETENTION_FLOOR_DAYS,
  }));

  const unresolvedTamperAttempts = tamperAttempts.filter((row) => !row.drainedAt).length;
  const belowFloorPolicies = retentionPolicies.filter((row) => row.belowDcaaFloor).length;
  const chainCoveragePercent = counts.totalLedgerEvents === 0
    ? 0
    : round2((counts.chainedEvents / counts.totalLedgerEvents) * 100);
  const anchorLagEvents = latestAnchor?.headSequence == null
    ? null
    : Math.max(0, counts.latestSequence - latestAnchor.headSequence);

  const exceptions: AuditLedgerIntegrityReport['exceptions'] = [];
  if (!chainVerification.ok) {
    exceptions.push({
      severity: 'critical',
      exceptionType: 'CHAIN_VERIFICATION_FAILED',
      message: chainVerification.message ?? 'Audit ledger chain verification failed.',
    });
  }
  if (chainCoveragePercent < 100 && counts.totalLedgerEvents > 0) {
    exceptions.push({
      severity: 'warning',
      exceptionType: 'UNCHAINED_LEDGER_EVENTS',
      message: `${counts.totalLedgerEvents - counts.chainedEvents} audit event(s) are missing chain hash fields.`,
    });
  }
  if (!latestAnchor) {
    exceptions.push({
      severity: 'warning',
      exceptionType: 'NO_AUDIT_ANCHOR',
      message: 'No audit ledger anchor has been recorded.',
    });
  } else if (anchorLagEvents != null && anchorLagEvents > 5000) {
    exceptions.push({
      severity: 'warning',
      exceptionType: 'ANCHOR_LAG',
      message: `Latest anchor trails the ledger head by ${anchorLagEvents} event(s).`,
    });
  }
  if (belowFloorPolicies > 0) {
    exceptions.push({
      severity: 'warning',
      exceptionType: 'RETENTION_BELOW_DCAA_FLOOR',
      message: `${belowFloorPolicies} retention policy setting(s) are below the ${DCAA_RETENTION_FLOOR_DAYS}-day DCAA floor.`,
    });
  }
  if (tamperAttempts.length > 0) {
    exceptions.push({
      severity: unresolvedTamperAttempts > 0 ? 'critical' : 'warning',
      exceptionType: 'TAMPER_ATTEMPTS_RECORDED',
      message: `${tamperAttempts.length} recent audit ledger tamper attempt(s) found; ${unresolvedTamperAttempts} undrained.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      windowSize,
    },
    summary: {
      totalLedgerEvents: counts.totalLedgerEvents,
      chainedEvents: counts.chainedEvents,
      chainCoveragePercent,
      chainOk: chainVerification.ok,
      rowsVerified: chainVerification.rowsChecked,
      latestSequence: counts.latestSequence,
      latestAnchorSequence: latestAnchor?.headSequence ?? null,
      latestAnchorAt: latestAnchor?.anchoredAt ?? null,
      anchorLagEvents,
      retentionPolicyCount: retentionPolicies.length,
      belowFloorPolicies,
      tamperAttempts: tamperAttempts.length,
      unresolvedTamperAttempts,
      exportRowCount: exportResult.manifest.rowCount,
      exportSha256: exportResult.manifest.sha256,
    },
    chainVerification: {
      ok: chainVerification.ok,
      startSequence: chainVerification.startSequence,
      endSequence: chainVerification.endSequence,
      rowsChecked: chainVerification.rowsChecked,
      firstMismatchSequence: chainVerification.firstMismatchSequence ?? null,
      firstMismatchEventId: chainVerification.firstMismatchEventId ?? null,
      headRowHash: chainVerification.headRowHash ?? null,
      message: chainVerification.message ?? null,
      verifiedAt: toIso(chainVerification.verifiedAt) ?? new Date().toISOString(),
      windowSize: chainVerification.windowSize,
    },
    latestAnchors,
    retentionPolicies,
    tamperAttempts,
    exportManifest: {
      generatedAt: exportResult.manifest.generatedAt,
      rowCount: exportResult.manifest.rowCount,
      sha256: exportResult.manifest.sha256,
      columns: exportResult.manifest.columns,
      filters: exportResult.manifest.filters as Record<string, unknown>,
    },
    exceptions,
  };
}
