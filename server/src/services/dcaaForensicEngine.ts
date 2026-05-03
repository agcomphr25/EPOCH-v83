import { db } from '../../db';
import { dcaaAuditFindings, InsertDcaaAuditFinding } from '../../schema';
import { timekeepingForensicRules, ForensicRule, ForensicViolation } from './dcaaForensicRules';
import { eq, and, sql, inArray } from 'drizzle-orm';

export interface ScanSummary {
  rulesRun: number;
  rulesFailed: number;
  failedRuleIds: string[];
  violationsFound: number;
  violationsClosed: number;
  newFindings: number;
  scannedAt: string;
  skipped?: boolean;
  breakdown: Array<{
    ruleId: string;
    domain: string;
    severity: string;
    violationsFound: number;
    newFindings: number;
    closedFindings: number;
    error?: string;
  }>;
}

let _scanInProgress = false;

export async function runForensicScan(): Promise<ScanSummary> {
  if (_scanInProgress) {
    console.log('[DCAA Forensic] Scan already in progress — skipping concurrent request');
    return {
      rulesRun: 0,
      rulesFailed: 0,
      failedRuleIds: [],
      violationsFound: 0,
      violationsClosed: 0,
      newFindings: 0,
      scannedAt: new Date().toISOString(),
      skipped: true,
      breakdown: [],
    };
  }

  _scanInProgress = true;
  try {
    return await _runForensicScanInternal();
  } finally {
    _scanInProgress = false;
  }
}

async function _runForensicScanInternal(): Promise<ScanSummary> {
  const allRules: ForensicRule[] = [...timekeepingForensicRules];

  let totalViolationsFound = 0;
  let totalClosed = 0;
  let totalNew = 0;
  let totalFailed = 0;
  const failedRuleIds: string[] = [];
  const breakdown: ScanSummary['breakdown'] = [];

  for (const rule of allRules) {
    let violations: ForensicViolation[] = [];
    let ruleError: string | undefined;
    try {
      violations = await rule.execute();
    } catch (err) {
      ruleError = err instanceof Error ? err.message : String(err);
      console.error(`[DCAA Forensic] Rule ${rule.ruleId} failed: ${ruleError}`);
      totalFailed++;
      failedRuleIds.push(rule.ruleId);
      breakdown.push({
        ruleId: rule.ruleId,
        domain: rule.domain,
        severity: rule.severity,
        violationsFound: 0,
        newFindings: 0,
        closedFindings: 0,
        error: ruleError,
      });
      continue;
    }

    totalViolationsFound += violations.length;

    // Load existing open + acknowledged findings for this rule.
    // Both statuses are included so that acknowledged violations are also
    // auto-resolved when the underlying issue is corrected on re-scan.
    const existingFindings = await db
      .select()
      .from(dcaaAuditFindings)
      .where(
        and(
          eq(dcaaAuditFindings.ruleId, rule.ruleId),
          inArray(dcaaAuditFindings.status, ['open', 'acknowledged']),
        )
      );

    const existingEntityIds = new Set(existingFindings.map(f => f.entityId));
    const currentEntityIds = new Set(violations.map(v => v.entityId));

    // Auto-close findings whose entity now passes the rule
    const toClose = existingFindings.filter(f => !currentEntityIds.has(f.entityId));
    let closedCount = 0;
    for (const finding of toClose) {
      await db
        .update(dcaaAuditFindings)
        .set({
          status: 'resolved',
          resolutionNotes: 'Auto-resolved by re-scan: entity no longer violates this rule.',
        })
        .where(eq(dcaaAuditFindings.id, finding.id));
      closedCount++;
    }
    totalClosed += closedCount;

    // Insert new findings (skip already-open ones)
    const newViolations = violations.filter(v => !existingEntityIds.has(v.entityId));
    let newCount = 0;
    if (newViolations.length > 0) {
      const insertRows: InsertDcaaAuditFinding[] = newViolations.map(v => ({
        ruleId: rule.ruleId,
        domain: rule.domain,
        severity: rule.severity,
        entityType: rule.entityType,
        entityId: v.entityId,
        description: v.description,
        evidence: v.evidence ?? {},
        status: 'open',
        resolutionNotes: null,
      }));
      await db.insert(dcaaAuditFindings).values(insertRows);
      newCount = newViolations.length;
    }
    totalNew += newCount;

    breakdown.push({
      ruleId: rule.ruleId,
      domain: rule.domain,
      severity: rule.severity,
      violationsFound: violations.length,
      newFindings: newCount,
      closedFindings: closedCount,
    });
  }

  return {
    rulesRun: allRules.length,
    rulesFailed: totalFailed,
    failedRuleIds,
    violationsFound: totalViolationsFound,
    violationsClosed: totalClosed,
    newFindings: totalNew,
    scannedAt: new Date().toISOString(),
    breakdown,
  };
}

export interface FindingsFilter {
  domain?: string;
  severity?: string;
  status?: string;
  entityType?: string;
  ruleId?: string;
  page?: number;
  pageSize?: number;
}

export async function getFindings(filter: FindingsFilter = {}) {
  const { page = 1, pageSize = 50 } = filter;
  const offset = (page - 1) * pageSize;

  const conditions: ReturnType<typeof eq>[] = [];
  if (filter.domain) conditions.push(eq(dcaaAuditFindings.domain, filter.domain));
  if (filter.severity) conditions.push(eq(dcaaAuditFindings.severity, filter.severity));
  if (filter.status) {
    const statuses = filter.status.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(eq(dcaaAuditFindings.status, statuses[0]));
    } else if (statuses.length > 1) {
      conditions.push(inArray(dcaaAuditFindings.status, statuses));
    }
  }
  if (filter.entityType) conditions.push(eq(dcaaAuditFindings.entityType, filter.entityType));
  if (filter.ruleId) conditions.push(eq(dcaaAuditFindings.ruleId, filter.ruleId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [findings, countResult] = await Promise.all([
    db
      .select()
      .from(dcaaAuditFindings)
      .where(whereClause)
      .orderBy(sql`
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        detected_at DESC
      `)
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(dcaaAuditFindings)
      .where(whereClause),
  ]);

  return {
    findings,
    total: countResult[0]?.count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((countResult[0]?.count ?? 0) / pageSize),
  };
}

export async function updateFindingStatus(
  id: number,
  status: 'open' | 'acknowledged' | 'resolved',
  resolutionNotes?: string,
) {
  const result = await db
    .update(dcaaAuditFindings)
    .set({ status, resolutionNotes: resolutionNotes ?? null })
    .where(eq(dcaaAuditFindings.id, id))
    .returning();

  if (result.length === 0) return null;
  return result[0];
}

export async function getFindingsSummary() {
  const severityCounts = await db
    .select({
      severity: dcaaAuditFindings.severity,
      status: dcaaAuditFindings.status,
      count: sql<number>`count(*)::int`,
    })
    .from(dcaaAuditFindings)
    .groupBy(dcaaAuditFindings.severity, dcaaAuditFindings.status);

  const ruleCounts = await db
    .select({
      ruleId: dcaaAuditFindings.ruleId,
      domain: dcaaAuditFindings.domain,
      severity: dcaaAuditFindings.severity,
      status: dcaaAuditFindings.status,
      count: sql<number>`count(*)::int`,
    })
    .from(dcaaAuditFindings)
    .groupBy(
      dcaaAuditFindings.ruleId,
      dcaaAuditFindings.domain,
      dcaaAuditFindings.severity,
      dcaaAuditFindings.status,
    );

  const bySeverity: Record<string, { open: number; resolved: number; acknowledged: number }> = {};
  for (const row of severityCounts) {
    if (!bySeverity[row.severity]) {
      bySeverity[row.severity] = { open: 0, resolved: 0, acknowledged: 0 };
    }
    const key = row.status as 'open' | 'resolved' | 'acknowledged';
    if (key in bySeverity[row.severity]) {
      bySeverity[row.severity][key] = row.count;
    }
  }

  const byRule: Record<string, { ruleId: string; domain: string; severity: string; open: number; acknowledged: number; resolved: number }> = {};
  for (const row of ruleCounts) {
    if (!byRule[row.ruleId]) {
      byRule[row.ruleId] = { ruleId: row.ruleId, domain: row.domain, severity: row.severity, open: 0, acknowledged: 0, resolved: 0 };
    }
    if (row.status === 'open') byRule[row.ruleId].open = row.count;
    if (row.status === 'acknowledged') byRule[row.ruleId].acknowledged = row.count;
    if (row.status === 'resolved') byRule[row.ruleId].resolved = row.count;
  }

  const totalOpen = severityCounts
    .filter(r => r.status === 'open')
    .reduce((sum, r) => sum + r.count, 0);

  const criticalOpen = bySeverity['critical']?.open ?? 0;
  const highOpen = bySeverity['high']?.open ?? 0;

  return {
    totalOpen,
    criticalOpen,
    highOpen,
    mediumOpen: bySeverity['medium']?.open ?? 0,
    lowOpen: bySeverity['low']?.open ?? 0,
    bySeverity,
    byRule: Object.values(byRule),
  };
}
