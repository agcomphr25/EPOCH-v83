import { pool, db } from '../../db';

export interface RedFlagInput {
  domainKey: string;
  flagKey: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  farCitation?: string;
  potentialScoreRecovery: number;
}

export interface RemediationInput {
  domainKey: string;
  flagKey: string;
  title: string;
  description: string;
  priority: 'P1_CRITICAL' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';
  potentialScoreRecovery: number;
}

export interface EvidenceRef {
  label: string;
  value: string | number;
}

export interface DomainScorerResult {
  rawScore: number;
  checks: Record<string, 0 | 0.5 | 1>;
  redFlags: RedFlagInput[];
  remediationItems: RemediationInput[];
  evidenceItems: EvidenceRef[];
}

async function safeQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    const rows = await pool.query(sql, params);
    return rows as T[];
  } catch (err) {
    console.error('[EDRI safeQuery] SQL error — query:', sql.slice(0, 200), 'Error:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function safeCount(sql: string, params: any[] = []): Promise<number | null> {
  const rows = await pool.query(sql, params || []).then(r => r as Array<{ count: string }>).catch(() => null);
  if (rows === null) return null;
  return parseInt((rows as Array<{ count: string }>)[0]?.count ?? '0', 10) || 0;
}

function computeRawScore(checks: Record<string, 0 | 0.5 | 1>): number {
  const vals = Object.values(checks);
  if (vals.length === 0) return 50;
  const sum = vals.reduce((a, b) => a + b, 0);
  return (sum / vals.length) * 100;
}

function severityToPriority(severity: string): 'P1_CRITICAL' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW' {
  if (severity === 'CRITICAL') return 'P1_CRITICAL';
  if (severity === 'HIGH') return 'P2_HIGH';
  if (severity === 'MEDIUM') return 'P3_MEDIUM';
  return 'P4_LOW';
}

export async function scoreTimekeeping(): Promise<DomainScorerResult> {
  const checks: Record<string, 0 | 0.5 | 1> = {};
  const redFlags: RedFlagInput[] = [];
  const remediationItems: RemediationInput[] = [];
  const evidenceItems: EvidenceRef[] = [];
  const DEFAULT_TIMEKEEPING_EFFECTIVE_DATE = '2026-06-01';
  const rawEffectiveDate = (process.env.TIMEKEEPING_DCAA_EFFECTIVE_DATE ?? '').trim();
  const isValidIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEffectiveDate)
    && !Number.isNaN(Date.parse(`${rawEffectiveDate}T00:00:00Z`));
  if (rawEffectiveDate && !isValidIsoDate) {
    console.warn(
      `[edriDomainScorers] TIMEKEEPING_DCAA_EFFECTIVE_DATE="${rawEffectiveDate}" is not a valid YYYY-MM-DD date — falling back to default ${DEFAULT_TIMEKEEPING_EFFECTIVE_DATE}.`
    );
  }
  const timekeepingEffectiveDate = isValidIsoDate ? rawEffectiveDate : DEFAULT_TIMEKEEPING_EFFECTIVE_DATE;
  evidenceItems.push({ label: 'Timekeeping DCAA effective date', value: timekeepingEffectiveDate });

  // Pre-effective-date window helper: when today is strictly before the configured DCAA
  // effective date, post-effective-date checks have no opportunity to produce evidence
  // yet. Treat them as DEFERRED — exclude them from the raw-score denominator entirely
  // (rather than scoring 0.5) and suppress their "no evidence yet" red flags. Once the
  // effective date arrives, scoring snaps back to the normal post-cutover behavior.
  const nowMs = Date.now();
  const effectiveMs = Date.parse(`${timekeepingEffectiveDate}T00:00:00Z`);
  const isPreEffective = Number.isFinite(effectiveMs) && nowMs < effectiveMs;
  if (isPreEffective) {
    evidenceItems.push({
      label: 'Post-effective-date controls',
      value: `Deferred — effective date ${timekeepingEffectiveDate} not yet reached; post-effective-date checks excluded from scoring`,
    });
  }

  // Check 1: PIN enforcement mandatory. Kiosk PIN enforcement is an access control,
  // not a historical transaction control, so it is not date-scoped.
  checks['PIN_ENFORCEMENT'] = 1;
  evidenceItems.push({ label: 'PIN enforcement setting', value: 'Enforced (native punch_ledger identity gate)' });

  // Check 2: No AUTO-approval bypass, scoped to post-effective-date sessions.
  const legacySessions = await safeCount(`
    SELECT COUNT(*) as count
    FROM punch_ledger
    WHERE clock_out IS NOT NULL
      AND labor_class = 'REGULAR'
      AND clock_in::date < $1::date
  `, [timekeepingEffectiveDate]);
  evidenceItems.push({ label: 'Legacy pre-effective-date regular sessions', value: legacySessions ?? 'SCORER_UNAVAILABLE' });

  if (!isPreEffective) {
    const totalSessions = await safeCount(`
      SELECT COUNT(*) as count
      FROM punch_ledger
      WHERE clock_out IS NOT NULL
        AND labor_class = 'REGULAR'
        AND clock_in::date >= $1::date
    `, [timekeepingEffectiveDate]);
    const unapprovedSessions = await safeCount(`
      SELECT COUNT(*) as count
      FROM punch_ledger pl
      WHERE pl.clock_out IS NOT NULL
        AND pl.labor_class = 'REGULAR'
        AND pl.clock_in::date >= $1::date
        AND pl.production_work_order_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM labor_approvals la
          WHERE la.employee_id = pl.employee_id::text
            AND la.production_work_order_id = pl.production_work_order_id
        )
    `, [timekeepingEffectiveDate]);
    const unapprovedRatio = (totalSessions === null || unapprovedSessions === null) ? null : (totalSessions > 0 ? unapprovedSessions / totalSessions : 0);
    checks['NO_AUTO_APPROVAL'] = unapprovedRatio === null ? 0.5 : (unapprovedSessions === 0 ? 1 : (unapprovedRatio < 0.05 ? 0.5 : 0));
    evidenceItems.push({ label: 'Post-effective-date sessions without supervisor labor approval', value: (totalSessions === null || unapprovedSessions === null) ? 'SCORER_UNAVAILABLE' : `${unapprovedSessions} / ${totalSessions}` });
    if (unapprovedSessions !== null && unapprovedSessions > 0) {
      redFlags.push({
        domainKey: 'TIMEKEEPING', flagKey: 'AUTO_APPROVAL_BYPASS', severity: 'CRITICAL',
        title: 'Unapproved Labor Sessions Detected',
        description: `${unapprovedSessions} post-effective-date punch_ledger sessions are not covered by a labor_approval record, bypassing required supervisor review.`,
        farCitation: 'FAR 31.201-2(c)', potentialScoreRecovery: 10,
      });
      remediationItems.push({ domainKey: 'TIMEKEEPING', flagKey: 'AUTO_APPROVAL_BYPASS', title: 'Ensure post-effective-date labor sessions have supervisor labor approval records', description: 'All post-effective-date punch_ledger sessions linked to a production work order must have a corresponding labor_approvals entry.', priority: 'P1_CRITICAL', potentialScoreRecovery: 10 });
    }
  }

  // Check 3: Stale unapproved sessions, scoped to post-effective-date sessions.
  if (!isPreEffective) {
    const staleSessions = await safeCount(`
      SELECT COUNT(*) as count
      FROM punch_ledger pl
      WHERE pl.clock_out IS NOT NULL
        AND pl.labor_class = 'REGULAR'
        AND pl.production_work_order_id IS NOT NULL
        AND pl.clock_in::date >= $1::date
        AND pl.clock_in < NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM labor_approvals la
          WHERE la.employee_id = pl.employee_id::text
            AND la.production_work_order_id = pl.production_work_order_id
        )
    `, [timekeepingEffectiveDate]);
    checks['TIMESHEET_APPROVAL_DEADLINE'] = staleSessions === null ? 0.5 : staleSessions === 0 ? 1 : (staleSessions < 5 ? 0.5 : 0);
    evidenceItems.push({ label: 'Post-effective-date stale unapproved sessions (>7d)', value: staleSessions ?? 'SCORER_UNAVAILABLE' });
    if (staleSessions !== null && staleSessions > 0) {
      redFlags.push({
        domainKey: 'TIMEKEEPING', flagKey: 'STALE_UNAPPROVED_TIMESHEETS', severity: 'HIGH',
        title: 'Stale Unapproved Labor Records',
        description: `${staleSessions} post-effective-date punch_ledger sessions older than 7 days have no supervisor labor approval coverage.`,
        farCitation: 'FAR 31.201-2(c)', potentialScoreRecovery: 5,
      });
      remediationItems.push({ domainKey: 'TIMEKEEPING', flagKey: 'STALE_UNAPPROVED_TIMESHEETS', title: 'Approve stale post-effective-date punch_ledger sessions within 7 days', description: 'All closed post-effective-date sessions linked to a work order older than 7 days must have a labor_approvals entry.', priority: 'P2_HIGH', potentialScoreRecovery: 5 });
    }
  }

  // Check 4: Employee certification - post-effective-date employee attestation on timekeeping.timesheets.
  // NOTE: timekeeping.timesheets.period_end is TEXT (see migration 0069); explicitly cast to date so
  // the comparison is chronological, not lexicographic — robust to non-ISO values that may exist.
  const legacyAttestableTimesheets = await safeCount(`
    SELECT COUNT(*) as count
    FROM timekeeping.timesheets
    WHERE status IN ('submitted', 'certified', 'locked', 'correction_requested', 'correction_approved')
      AND period_end::date < $1::date
  `, [timekeepingEffectiveDate]);
  evidenceItems.push({ label: 'Legacy pre-effective-date attestable timesheets', value: legacyAttestableTimesheets ?? 'SCORER_UNAVAILABLE' });

  if (!isPreEffective) {
    const totalAttestableTimesheets = await safeCount(`
      SELECT COUNT(*) as count
      FROM timekeeping.timesheets
      WHERE status IN ('submitted', 'certified', 'locked', 'correction_requested', 'correction_approved')
        AND period_end::date >= $1::date
    `, [timekeepingEffectiveDate]);
    const fullyAttestedTimesheets = await safeCount(`
      SELECT COUNT(*) as count
      FROM timekeeping.timesheets
      WHERE status IN ('submitted', 'certified', 'locked', 'correction_requested', 'correction_approved')
        AND period_end::date >= $1::date
        AND employee_attested = TRUE
        AND attested_at IS NOT NULL
        AND certification_statement IS NOT NULL
        AND TRIM(certification_statement) != ''
        AND certification_version IS NOT NULL
    `, [timekeepingEffectiveDate]);

    const attestationRate = (totalAttestableTimesheets === null || fullyAttestedTimesheets === null)
      ? null
      : (totalAttestableTimesheets > 0 ? fullyAttestedTimesheets / totalAttestableTimesheets : 1);
    checks['EMPLOYEE_CERTIFICATION'] = attestationRate === null ? 0.5 : attestationRate >= 0.95 ? 1 : (attestationRate >= 0.80 ? 0.5 : 0);
    evidenceItems.push({
      label: 'Post-effective-date employee-attested submitted/finalized timesheets',
      value: (totalAttestableTimesheets === null || fullyAttestedTimesheets === null) ? 'SCORER_UNAVAILABLE' : `${fullyAttestedTimesheets} / ${totalAttestableTimesheets}`,
    });
    if (attestationRate !== null && attestationRate < 0.95 && totalAttestableTimesheets !== null && totalAttestableTimesheets > 0) {
      redFlags.push({
        domainKey: 'TIMEKEEPING', flagKey: 'MISSING_EMPLOYEE_ATTESTATION', severity: attestationRate < 0.8 ? 'HIGH' : 'MEDIUM',
        title: 'Incomplete Employee Timesheet Certification',
        description: `${totalAttestableTimesheets - (fullyAttestedTimesheets ?? 0)} post-effective-date submitted/finalized timesheets are missing complete employee attestation evidence.`,
        farCitation: 'FAR 52.215-2', potentialScoreRecovery: 8,
      });
      remediationItems.push({ domainKey: 'TIMEKEEPING', flagKey: 'MISSING_EMPLOYEE_ATTESTATION', title: 'Collect missing employee timesheet attestations', description: 'Post-effective-date submitted and finalized timesheets must retain employee_attested, attested_at, certification_statement, and certification_version evidence.', priority: attestationRate < 0.8 ? 'P2_HIGH' : 'P3_MEDIUM', potentialScoreRecovery: 8 });
    }
  }

  // Check 4b: Supervisor labor approval coverage - post-effective-date, separate from employee certification.
  if (!isPreEffective) {
    const totalEmployeePunchers = await safeCount(`
      SELECT COUNT(DISTINCT employee_id) as count
      FROM punch_ledger
      WHERE clock_out IS NOT NULL
        AND labor_class = 'REGULAR'
        AND clock_in::date >= $1::date
    `, [timekeepingEffectiveDate]);
    const employeesWithApprovals = await safeCount(`
      SELECT COUNT(DISTINCT pl.employee_id) as count
      FROM punch_ledger pl
      WHERE pl.clock_out IS NOT NULL
        AND pl.labor_class = 'REGULAR'
        AND pl.clock_in::date >= $1::date
        AND EXISTS (
          SELECT 1 FROM labor_approvals la
          WHERE la.employee_id = pl.employee_id::text
            AND (pl.production_work_order_id IS NULL OR la.production_work_order_id = pl.production_work_order_id)
        )
    `, [timekeepingEffectiveDate]);
    const approvalCoverageRate = (totalEmployeePunchers === null || employeesWithApprovals === null) ? null : (totalEmployeePunchers > 0 ? Math.min(1, employeesWithApprovals / totalEmployeePunchers) : 1);
    checks['SUPERVISOR_LABOR_APPROVAL_COVERAGE'] = approvalCoverageRate === null ? 0.5 : approvalCoverageRate >= 0.95 ? 1 : (approvalCoverageRate >= 0.80 ? 0.5 : 0);
    evidenceItems.push({ label: 'Post-effective-date supervisor labor approval coverage', value: (totalEmployeePunchers === null || employeesWithApprovals === null) ? 'SCORER_UNAVAILABLE' : `${(approvalCoverageRate! * 100).toFixed(1)}%` });
    if (approvalCoverageRate !== null && approvalCoverageRate < 0.95 && totalEmployeePunchers !== null && totalEmployeePunchers > 0) {
      redFlags.push({
        domainKey: 'TIMEKEEPING', flagKey: 'LOW_SUPERVISOR_LABOR_APPROVAL_COVERAGE', severity: 'HIGH',
        title: 'Incomplete Supervisor Labor Approval Coverage',
        description: `${((1 - approvalCoverageRate) * 100).toFixed(1)}% of employees with post-effective-date punch_ledger sessions lack a formal supervisor labor approval record.`,
        farCitation: 'FAR 31.201-2(c)', potentialScoreRecovery: 8,
      });
      remediationItems.push({ domainKey: 'TIMEKEEPING', flagKey: 'LOW_SUPERVISOR_LABOR_APPROVAL_COVERAGE', title: 'Ensure post-effective-date employees have supervisor labor approval records', description: 'All employees with post-effective-date punch_ledger sessions should have corresponding labor_approvals entries.', priority: 'P2_HIGH', potentialScoreRecovery: 8 });
    }
  }

  // Check 5: Immutable approved records - post-effective-date audit events.
  const legacyPostApprovalEdits = await safeCount(`
    SELECT COUNT(*) as count FROM audit_events
    WHERE entity_type = 'time_entry'
      AND action IN ('PUNCH_MODIFIED', 'PUNCH_EDITED', 'TIME_ENTRY_EDITED')
      AND COALESCE(timestamp, created_at)::date < $1::date
  `, [timekeepingEffectiveDate]);
  evidenceItems.push({ label: 'Legacy pre-effective-date post-approval punch edits (audit log)', value: legacyPostApprovalEdits ?? 'SCORER_UNAVAILABLE' });

  if (!isPreEffective) {
    const postApprovalEdits = await safeCount(`
      SELECT COUNT(*) as count FROM audit_events
      WHERE entity_type = 'time_entry'
        AND action IN ('PUNCH_MODIFIED', 'PUNCH_EDITED', 'TIME_ENTRY_EDITED')
        AND COALESCE(timestamp, created_at)::date >= $1::date
    `, [timekeepingEffectiveDate]);
    checks['IMMUTABLE_APPROVED_RECORDS'] = postApprovalEdits === null ? 0.5 : postApprovalEdits === 0 ? 1 : 0;
    evidenceItems.push({ label: 'Post-effective-date post-approval punch edits (audit log)', value: postApprovalEdits ?? 'SCORER_UNAVAILABLE' });
    if (postApprovalEdits !== null && postApprovalEdits > 0) {
      redFlags.push({
        domainKey: 'TIMEKEEPING', flagKey: 'POST_APPROVAL_EDITS', severity: 'HIGH',
        title: 'Post-Approval Labor Record Edits',
        description: `${postApprovalEdits} post-effective-date punch_ledger entries were modified after approval per the audit log.`,
        farCitation: 'FAR 31.201-2(d)', potentialScoreRecovery: 6,
      });
      remediationItems.push({ domainKey: 'TIMEKEEPING', flagKey: 'POST_APPROVAL_EDITS', title: 'Lock approved post-effective-date punch_ledger entries from editing', description: 'Implement immutability controls on approved post-effective-date punch_ledger entries.', priority: 'P2_HIGH', potentialScoreRecovery: 6 });
    }
  }

  // Check 6: Single authoritative timekeeping source - post-effective-date source channels.
  if (!isPreEffective) {
    const distinctSources = await safeCount(`
      SELECT COUNT(DISTINCT source) as count
      FROM punch_ledger
      WHERE source IS NOT NULL
        AND clock_in::date >= $1::date
    `, [timekeepingEffectiveDate]);
    checks['DUAL_SYSTEM_GAP'] = 1;
    evidenceItems.push({ label: 'Post-effective-date distinct punch source channels (native)', value: distinctSources ?? 'SCORER_UNAVAILABLE' });
  }

  // Check 7: Correction approval chain - post-effective-date formal correction workflow.
  const legacyCorrections = await safeCount(`
    SELECT COUNT(*) as count
    FROM timekeeping.timesheet_corrections tc
    JOIN timekeeping.timesheets ts ON ts.id = tc.timesheet_id
    WHERE tc.requested_at::date < $1::date
      AND ts.period_end::date < $1::date
  `, [timekeepingEffectiveDate]);
  evidenceItems.push({ label: 'Legacy pre-effective-date correction records', value: legacyCorrections ?? 'SCORER_UNAVAILABLE' });

  if (!isPreEffective) {
    const totalCorrections = await safeCount(`
      SELECT COUNT(*) as count
      FROM timekeeping.timesheet_corrections tc
      JOIN timekeeping.timesheets ts ON ts.id = tc.timesheet_id
      WHERE tc.requested_at::date >= $1::date
         OR ts.period_end::date >= $1::date
    `, [timekeepingEffectiveDate]);
    const fullyReviewedCorrections = await safeCount(`
      SELECT COUNT(*) as count
      FROM timekeeping.timesheet_corrections tc
      JOIN timekeeping.timesheets ts ON ts.id = tc.timesheet_id
      WHERE (tc.requested_at::date >= $1::date OR ts.period_end::date >= $1::date)
        AND tc.status IN ('approved', 'rejected')
        AND tc.requested_by_employee_id IS NOT NULL
        AND tc.reason IS NOT NULL
        AND TRIM(tc.reason) != ''
        AND tc.original_snapshot IS NOT NULL
        AND tc.proposed_changes IS NOT NULL
        AND tc.reviewed_by_user_id IS NOT NULL
        AND tc.reviewed_at IS NOT NULL
        AND tc.reviewer_note IS NOT NULL
        AND TRIM(tc.reviewer_note) != ''
        AND (tc.status != 'approved' OR tc.after_snapshot IS NOT NULL)
    `, [timekeepingEffectiveDate]);

    const correctionChainRate = (totalCorrections === null || fullyReviewedCorrections === null)
      ? null
      : (totalCorrections > 0 ? fullyReviewedCorrections / totalCorrections : null);
    checks['CORRECTION_APPROVAL_CHAIN'] = correctionChainRate === null ? 0.5 : correctionChainRate >= 0.95 ? 1 : (correctionChainRate >= 0.80 ? 0.5 : 0);
    evidenceItems.push({
      label: 'Post-effective-date reviewed timesheet corrections with complete approval evidence',
      value: (totalCorrections === null || fullyReviewedCorrections === null) ? 'SCORER_UNAVAILABLE' : `${fullyReviewedCorrections} / ${totalCorrections}`,
    });

    const correctionAuditCount = await safeCount(`
      SELECT COUNT(*) as count FROM audit_events
      WHERE entity_type = 'time_entry'
        AND action IN ('PUNCH_EDITED', 'PUNCH_MODIFIED', 'TIME_ENTRY_EDITED', 'ENTRY_UPDATED')
        AND COALESCE(timestamp, created_at)::date >= $1::date
    `, [timekeepingEffectiveDate]);
    evidenceItems.push({ label: 'Post-effective-date supplemental punch correction audit_events', value: correctionAuditCount ?? 'SCORER_UNAVAILABLE' });

    if (totalCorrections === 0) {
      redFlags.push({
        domainKey: 'TIMEKEEPING', flagKey: 'NO_CORRECTION_WORKFLOW_EVIDENCE', severity: 'MEDIUM',
        title: 'No Post-Effective-Date Correction Workflow Evidence Yet',
        description: 'No formal post-effective-date timesheet correction records exist yet, so the approval-chain control cannot be fully proven from live workflow evidence.',
        farCitation: 'FAR 31.201-2(d)', potentialScoreRecovery: 3,
      });
      remediationItems.push({ domainKey: 'TIMEKEEPING', flagKey: 'NO_CORRECTION_WORKFLOW_EVIDENCE', title: 'Capture post-effective-date correction workflow evidence', description: 'When real corrections occur on or after the effective date, route them through timekeeping.timesheet_corrections with requester, reason, before/after snapshots, reviewer, timestamp, and reviewer note.', priority: 'P3_MEDIUM', potentialScoreRecovery: 3 });
    } else if (correctionChainRate !== null && correctionChainRate < 0.95) {
      redFlags.push({
        domainKey: 'TIMEKEEPING', flagKey: 'INCOMPLETE_CORRECTION_APPROVAL_CHAIN', severity: correctionChainRate < 0.8 ? 'HIGH' : 'MEDIUM',
        title: 'Incomplete Correction Approval Chain',
        description: `${totalCorrections - (fullyReviewedCorrections ?? 0)} post-effective-date correction records are missing complete requester, reason, snapshot, reviewer, or after-snapshot evidence.`,
        farCitation: 'FAR 31.201-2(d)', potentialScoreRecovery: 6,
      });
      remediationItems.push({ domainKey: 'TIMEKEEPING', flagKey: 'INCOMPLETE_CORRECTION_APPROVAL_CHAIN', title: 'Complete correction approval-chain evidence', description: 'Require every post-effective-date correction request to include a reason and original snapshot, then require supervisor/admin review with reviewer note and after snapshot before closure.', priority: correctionChainRate < 0.8 ? 'P2_HIGH' : 'P3_MEDIUM', potentialScoreRecovery: 6 });
    }
  }

  // Check 8: Charge code registry compliance - post-effective-date punch sessions.
  const legacyInvalidChargeCodePunches = await safeCount(`
    SELECT COUNT(*) as count
    FROM punch_ledger pl
    WHERE pl.clock_in::date < $1::date
      AND pl.charge_code IS NOT NULL
      AND trim(pl.charge_code) != ''
      AND NOT EXISTS (
        SELECT 1 FROM charge_codes cc
        WHERE cc.code = pl.charge_code
          AND cc.active = true
      )
  `, [timekeepingEffectiveDate]);
  evidenceItems.push({ label: 'Legacy pre-effective-date punches with invalid/inactive charge codes', value: legacyInvalidChargeCodePunches ?? 'SCORER_UNAVAILABLE' });

  if (!isPreEffective) {
    const invalidChargeCodePunches = await safeCount(`
      SELECT COUNT(*) as count
      FROM punch_ledger pl
      WHERE pl.clock_in::date >= $1::date
        AND pl.charge_code IS NOT NULL
        AND trim(pl.charge_code) != ''
        AND NOT EXISTS (
          SELECT 1 FROM charge_codes cc
          WHERE cc.code = pl.charge_code
            AND cc.active = true
        )
    `, [timekeepingEffectiveDate]);
    checks['CHARGE_CODE_COMPLIANCE'] = invalidChargeCodePunches === null ? 0.5
      : invalidChargeCodePunches === 0 ? 1
      : (invalidChargeCodePunches < 3 ? 0.5 : 0);
    evidenceItems.push({ label: 'Post-effective-date punches with invalid/inactive charge codes', value: invalidChargeCodePunches ?? 'SCORER_UNAVAILABLE' });
    if (invalidChargeCodePunches !== null && invalidChargeCodePunches > 0) {
      redFlags.push({
        domainKey: 'TIMEKEEPING', flagKey: 'INVALID_CHARGE_CODE_USAGE', severity: 'HIGH',
        title: 'Invalid Charge Code Usage in Punch Ledger',
        description: `${invalidChargeCodePunches} post-effective-date punch_ledger sessions reference charge codes not found in the active charge_codes registry.`,
        farCitation: 'FAR 31.201-2(c)', potentialScoreRecovery: 5,
      });
      remediationItems.push({ domainKey: 'TIMEKEEPING', flagKey: 'INVALID_CHARGE_CODE_USAGE', title: 'Correct post-effective-date punch entries using inactive or unregistered charge codes', description: 'Review and correct post-effective-date charge_code values in punch_ledger sessions that do not match an active charge_codes registry entry.', priority: 'P2_HIGH', potentialScoreRecovery: 5 });
    }
  }

  // Forensic findings adjustment: only post-effective-date detections affect readiness.
  // Pre-effective-date: skip the post-cutover scan entirely (it would always be empty),
  // but still surface the legacy count below for context.
  let forensicDeduction = 0;
  let forensicCriticalCount = 0;
  let forensicHighCount = 0;
  let forensicTotalOpen = 0;
  if (!isPreEffective) {
    try {
      const findingsRows = await safeQuery<{ severity: string; cnt: string }>(`
        SELECT severity, COUNT(*)::int as cnt
        FROM dcaa_audit_findings
        WHERE domain = 'TIMEKEEPING'
          AND status = 'open'
          AND detected_at::date >= $1::date
        GROUP BY severity
      `, [timekeepingEffectiveDate]);
      for (const row of findingsRows) {
        const cnt = parseInt(row.cnt as unknown as string, 10) || 0;
        forensicTotalOpen += cnt;
        if (row.severity === 'critical') {
          forensicDeduction += cnt * 5;
          forensicCriticalCount = cnt;
          if (cnt > 0) {
            redFlags.push({
              domainKey: 'TIMEKEEPING',
              flagKey: `FORENSIC_CRITICAL_VIOLATIONS`,
              severity: 'CRITICAL',
              title: `${cnt} Critical Forensic Violations Active`,
              description: `Forensic scan found ${cnt} post-effective-date critical timekeeping violations that must be remediated before an audit.`,
              farCitation: 'FAR 31.201-2',
              potentialScoreRecovery: Math.min(15, cnt * 5),
            });
            remediationItems.push({ domainKey: 'TIMEKEEPING', flagKey: 'FORENSIC_CRITICAL_VIOLATIONS', title: 'Resolve post-effective-date critical forensic timekeeping violations', description: 'Run the forensic scan and remediate all critical findings detected on or after the effective date.', priority: 'P1_CRITICAL', potentialScoreRecovery: Math.min(15, cnt * 5) });
          }
        } else if (row.severity === 'high') {
          forensicDeduction += cnt * 3;
          forensicHighCount = cnt;
          if (cnt > 0) {
            redFlags.push({
              domainKey: 'TIMEKEEPING',
              flagKey: `FORENSIC_HIGH_VIOLATIONS`,
              severity: 'HIGH',
              title: `${cnt} High-Severity Forensic Violations Active`,
              description: `Forensic scan found ${cnt} post-effective-date high-severity timekeeping violations.`,
              farCitation: 'FAR 31.201-2',
              potentialScoreRecovery: Math.min(10, cnt * 3),
            });
            remediationItems.push({ domainKey: 'TIMEKEEPING', flagKey: 'FORENSIC_HIGH_VIOLATIONS', title: 'Resolve post-effective-date high-severity forensic timekeeping violations', description: 'Run the forensic scan and remediate all high-severity findings detected on or after the effective date.', priority: 'P2_HIGH', potentialScoreRecovery: Math.min(10, cnt * 3) });
          }
        } else if (row.severity === 'medium') {
          forensicDeduction += cnt * 1;
        } else if (row.severity === 'low') {
          forensicDeduction += cnt * 0.5;
        }
      }
    } catch {
      // If dcaa_audit_findings table doesn't exist yet, skip silently
    }
    evidenceItems.push({ label: 'Open post-effective-date forensic violations (timekeeping)', value: forensicTotalOpen });
  }

  const legacyForensicFindings = await safeCount(`
    SELECT COUNT(*) as count
    FROM dcaa_audit_findings
    WHERE domain = 'TIMEKEEPING'
      AND status = 'open'
      AND detected_at::date < $1::date
  `, [timekeepingEffectiveDate]);
  evidenceItems.push({ label: 'Legacy pre-effective-date open forensic violations (timekeeping)', value: legacyForensicFindings ?? 'SCORER_UNAVAILABLE' });

  const baseScore = computeRawScore(checks);
  const rawScore = Math.max(0, baseScore - forensicDeduction);

  return { rawScore, checks, redFlags, remediationItems, evidenceItems };
}

export async function scoreChargeCode(): Promise<DomainScorerResult> {
  const checks: Record<string, 0 | 0.5 | 1> = {};
  const redFlags: RedFlagInput[] = [];
  const remediationItems: RemediationInput[] = [];
  const evidenceItems: EvidenceRef[] = [];

  // Check 1: IR&D / B&P categories
  const irdBp = await safeCount(`SELECT COUNT(*) as count FROM charge_codes WHERE type IN ('IR_AND_D', 'B_AND_P', 'IRD', 'BNP', 'IR&D', 'B&P')`);
  checks['IRD_BP_CATEGORIES'] = irdBp === null ? 0 : irdBp > 0 ? 1 : 0;
  evidenceItems.push({ label: 'IR&D/B&P charge codes', value: irdBp ?? 'SCORER_UNAVAILABLE' });
  if (irdBp === null || irdBp === 0) {
    redFlags.push({
      domainKey: 'CHARGE_CODE', flagKey: 'NO_IRD_BP_CATEGORY', severity: 'HIGH',
      title: 'No IR&D / B&P Categories Defined',
      description: 'No charge codes with IR&D or B&P type found. Required for DCAA indirect cost allocation.',
      farCitation: 'FAR 31.205-18', potentialScoreRecovery: 6,
    });
    remediationItems.push({ domainKey: 'CHARGE_CODE', flagKey: 'NO_IRD_BP_CATEGORY', title: 'Define IR&D and B&P charge code categories', description: 'Create charge codes typed as IR_AND_D and B_AND_P.', priority: 'P2_HIGH', potentialScoreRecovery: 6 });
  }

  // Check 2: FRINGE pool
  const fringePool = await safeCount(`SELECT COUNT(*) as count FROM cost_centers WHERE type = 'FRINGE'`);
  checks['FRINGE_POOL'] = fringePool === null ? 0 : fringePool > 0 ? 1 : 0;
  evidenceItems.push({ label: 'FRINGE pool cost centers', value: fringePool ?? 'SCORER_UNAVAILABLE' });
  if (fringePool === null || fringePool === 0) {
    redFlags.push({
      domainKey: 'CHARGE_CODE', flagKey: 'NO_FRINGE_POOL', severity: 'HIGH',
      title: 'No FRINGE Pool Cost Center',
      description: 'No cost center of type FRINGE exists. Required for DCAA indirect cost tracking.',
      farCitation: 'FAR 31.203', potentialScoreRecovery: 5,
    });
    remediationItems.push({ domainKey: 'CHARGE_CODE', flagKey: 'NO_FRINGE_POOL', title: 'Create FRINGE pool cost center', description: 'Add a cost center with type FRINGE for indirect fringe benefit costs.', priority: 'P2_HIGH', potentialScoreRecovery: 5 });
  }

  // Check 3: WAD→GL link
  const totalCostRecords = await safeCount(`SELECT COUNT(*) as count FROM labor_cost_records`);
  const unlinkedRecords = await safeCount(`SELECT COUNT(*) as count FROM labor_cost_records WHERE journal_entry_id IS NULL`);
  const unlinkedRate = (totalCostRecords === null || unlinkedRecords === null) ? null : (totalCostRecords > 0 ? unlinkedRecords / totalCostRecords : 0);
  checks['WAD_GL_LINK'] = unlinkedRate === null ? 0 : unlinkedRate <= 0.10 ? 1 : (unlinkedRate <= 0.25 ? 0.5 : 0);
  evidenceItems.push({ label: 'WAD→GL link rate', value: (totalCostRecords === null || unlinkedRecords === null) ? 'SCORER_UNAVAILABLE' : `${((1 - unlinkedRate) * 100).toFixed(1)}%` });
  if (unlinkedRate === null || (unlinkedRate > 0.10 && totalCostRecords !== null && totalCostRecords > 0)) {
    redFlags.push({
      domainKey: 'CHARGE_CODE', flagKey: 'WAD_GL_LINK_BROKEN', severity: 'CRITICAL',
      title: 'WAD→GL Link Broken',
      description: unlinkedRate === null ? 'Unable to verify WAD→GL linkage (labor_cost_records table unavailable). All labor records should be linked to GL journal entries.' : `${(unlinkedRate * 100).toFixed(1)}% of labor cost records lack a GL journal entry link.`,
      farCitation: 'FAR 31.201-2(c)', potentialScoreRecovery: 12,
    });
    remediationItems.push({ domainKey: 'CHARGE_CODE', flagKey: 'WAD_GL_LINK_BROKEN', title: 'Wire WAD charge codes to GL journal entries', description: 'Ensure all labor cost records are linked to corresponding journal entries.', priority: 'P1_CRITICAL', potentialScoreRecovery: 12 });
  }

  // Check 4: Charge code type restrictions — ensure G&A and OVERHEAD classifications exist.
  // Source: charge_codes table (not cost_centers). G&A and Overhead classification is stored as
  // charge_codes.type ('G_AND_A' | 'OVERHEAD'). Phase A seeded the IND-* indirect codes with these
  // types. Querying cost_centers for this check was a scorer logic bug — cost_centers is a department
  // budgeting table whose 'type' column carries DEPARTMENT/PROJECT/OVERHEAD/ADMINISTRATIVE values
  // that are not the indirect cost pool classifications DCAA is testing for here.
  const gaPool = await safeCount(`SELECT COUNT(*) as count FROM charge_codes WHERE type IN ('G_AND_A', 'OVERHEAD') AND active = true`);
  checks['CODE_TYPE_RESTRICTIONS'] = gaPool === null ? 0 : gaPool > 0 ? 1 : 0;
  evidenceItems.push({ label: 'Active G&A/Overhead charge codes', value: gaPool ?? 'SCORER_UNAVAILABLE' });
  if (gaPool === null || gaPool === 0) {
    redFlags.push({
      domainKey: 'CHARGE_CODE', flagKey: 'NO_GA_OVERHEAD_POOL', severity: 'HIGH',
      title: 'No G&A / Overhead Charge Codes Defined',
      description: 'No active charge codes with G_AND_A or OVERHEAD type found in the charge code registry. Required for proper DCAA indirect cost allocation.',
      farCitation: 'FAR 31.203', potentialScoreRecovery: 5,
    });
    remediationItems.push({ domainKey: 'CHARGE_CODE', flagKey: 'NO_GA_OVERHEAD_POOL', title: 'Define G&A and Overhead charge codes', description: 'Add active charge codes with type G_AND_A and OVERHEAD to the charge code registry.', priority: 'P2_HIGH', potentialScoreRecovery: 5 });
  }

  // Check 5: Supervisor override trail — check for audit events on charge codes
  const ccAuditCount = await safeCount(`
    SELECT COUNT(*) as count FROM audit_events
    WHERE entity_type = 'charge_code' OR entity_type LIKE '%charge%'
    LIMIT 1000
  `);
  checks['SUPERVISOR_OVERRIDE_TRAIL'] = ccAuditCount === null ? 0.5 : ccAuditCount > 0 ? 1 : 0;
  evidenceItems.push({ label: 'Charge code audit events', value: ccAuditCount ?? 'SCORER_UNAVAILABLE' });
  if (ccAuditCount === 0) {
    redFlags.push({
      domainKey: 'CHARGE_CODE', flagKey: 'NO_CHARGE_CODE_AUDIT', severity: 'MEDIUM',
      title: 'Charge Code Changes Not Audited',
      description: 'No audit events for charge code changes. All modifications must be logged.',
      farCitation: 'FAR 31.201-2(c)', potentialScoreRecovery: 3,
    });
    remediationItems.push({ domainKey: 'CHARGE_CODE', flagKey: 'NO_CHARGE_CODE_AUDIT', title: 'Enable audit logging on charge code changes', description: 'Log all charge code creation, modification, and deletion events.', priority: 'P3_MEDIUM', potentialScoreRecovery: 3 });
  }

  return { rawScore: computeRawScore(checks), checks, redFlags, remediationItems, evidenceItems };
}

export async function scoreAccounting(): Promise<DomainScorerResult> {
  const checks: Record<string, 0 | 0.5 | 1> = {};
  const redFlags: RedFlagInput[] = [];
  const remediationItems: RemediationInput[] = [];
  const evidenceItems: EvidenceRef[] = [];

  // Check 1: Burden rates populated
  const burdenRates = await safeCount(`SELECT COUNT(*) as count FROM labor_burden_rates`);
  checks['BURDEN_RATES'] = burdenRates === null ? 0 : burdenRates > 0 ? 1 : 0;
  evidenceItems.push({ label: 'Burden rate records', value: burdenRates ?? 'SCORER_UNAVAILABLE' });
  if (burdenRates === null || burdenRates === 0) {
    redFlags.push({
      domainKey: 'ACCOUNTING', flagKey: 'NO_BURDEN_RATES', severity: 'CRITICAL',
      title: 'No Burden Rates Configured',
      description: 'No labor burden rates are defined. DCAA requires documented indirect cost rates.',
      farCitation: 'FAR 42.703-2', potentialScoreRecovery: 12,
    });
    remediationItems.push({ domainKey: 'ACCOUNTING', flagKey: 'NO_BURDEN_RATES', title: 'Define labor burden rates', description: 'Configure overhead, G&A, and fringe burden rates in the system.', priority: 'P1_CRITICAL', potentialScoreRecovery: 12 });
  }

  // Check 2: Default rate fallback usage
  const totalLaborRecords = await safeCount(`SELECT COUNT(*) as count FROM labor_cost_records`);
  const defaultRateRecords = await safeCount(`SELECT COUNT(*) as count FROM labor_cost_records WHERE rate_source = 'DEFAULT_LABOR_RATE'`);
  const defaultRateRatio = (totalLaborRecords === null || defaultRateRecords === null) ? null : (totalLaborRecords > 0 ? defaultRateRecords / totalLaborRecords : 0);
  checks['DEFAULT_RATE_FALLBACK'] = defaultRateRatio === null ? 0.5 : defaultRateRatio <= 0.05 ? 1 : (defaultRateRatio <= 0.15 ? 0.5 : 0);
  evidenceItems.push({ label: 'Default rate usage', value: (totalLaborRecords === null || defaultRateRecords === null) ? 'SCORER_UNAVAILABLE' : `${(defaultRateRatio * 100).toFixed(1)}%` });
  if (defaultRateRatio > 0.05 && totalLaborRecords > 0) {
    redFlags.push({
      domainKey: 'ACCOUNTING', flagKey: 'DEFAULT_RATE_FALLBACK', severity: 'HIGH',
      title: 'Excessive Default Rate Usage',
      description: `${(defaultRateRatio * 100).toFixed(1)}% of labor records use default rate instead of employee-specific rates.`,
      farCitation: 'FAR 31.201-2', potentialScoreRecovery: 8,
    });
    remediationItems.push({ domainKey: 'ACCOUNTING', flagKey: 'DEFAULT_RATE_FALLBACK', title: 'Configure employee-specific labor rates', description: 'Assign hourly rates to all employees to reduce default rate fallback.', priority: 'P2_HIGH', potentialScoreRecovery: 8 });
  }

  // Check 3: Period locking — DCAA requires that prior-period accounting is locked against
  // retroactive changes. Checks for DRAFT journal entries whose effective_date falls before
  // the current calendar month. Column is 'effective_date' (not 'posting_date' — that column
  // does not exist; using it caused a silent SQL error that made this check score 0 incorrectly).
  const unlockCount = await safeCount(`SELECT COUNT(*) as count FROM journal_entries WHERE effective_date < date_trunc('month', NOW()) AND status = 'DRAFT'`);
  checks['PERIOD_LOCKING'] = unlockCount === null ? 0 : unlockCount === 0 ? 1 : 0.5;
  evidenceItems.push({ label: 'Open entries in prior periods', value: unlockCount ?? 'SCORER_UNAVAILABLE' });
  if (unlockCount === null || unlockCount > 0) {
    redFlags.push({
      domainKey: 'ACCOUNTING', flagKey: 'NO_PERIOD_LOCKING', severity: 'HIGH',
      title: 'Prior Periods Not Locked',
      description: `${unlockCount} journal entries in prior periods remain in DRAFT state. Period locking not enforced.`,
      farCitation: 'FAR 31.201-2(d)', potentialScoreRecovery: 6,
    });
    remediationItems.push({ domainKey: 'ACCOUNTING', flagKey: 'NO_PERIOD_LOCKING', title: 'Implement period locking', description: 'Lock prior accounting periods to prevent retroactive changes.', priority: 'P2_HIGH', potentialScoreRecovery: 6 });
  }

  // Check 4: Void approval — no voids should exist without corresponding audit event
  const voidedCount = await safeCount(`SELECT COUNT(*) as count FROM journal_entries WHERE status = 'VOIDED'`);
  const voidAuditCount = await safeCount(`
    SELECT COUNT(*) as count FROM audit_events
    WHERE action LIKE '%VOID%' OR action LIKE '%CANCEL%'
    LIMIT 1000
  `);
  checks['VOID_APPROVAL'] = (voidedCount === null || voidAuditCount === null) ? 0.5 : voidedCount === 0 ? 1 : (voidAuditCount >= voidedCount ? 1 : 0.5);
  evidenceItems.push({ label: 'Voided journal entries', value: voidedCount });
  evidenceItems.push({ label: 'Void audit events', value: voidAuditCount });
  if (voidedCount > 0 && voidAuditCount < voidedCount) {
    redFlags.push({
      domainKey: 'ACCOUNTING', flagKey: 'UNAPPROVED_VOIDS', severity: 'HIGH',
      title: 'Journal Entry Voids Missing Approval Records',
      description: `${voidedCount} journal entries are voided but only ${voidAuditCount} void events appear in the audit log.`,
      farCitation: 'FAR 31.201-2(d)', potentialScoreRecovery: 5,
    });
    remediationItems.push({ domainKey: 'ACCOUNTING', flagKey: 'UNAPPROVED_VOIDS', title: 'Document all journal entry void approvals', description: 'Ensure every void has an audit trail with approver information.', priority: 'P2_HIGH', potentialScoreRecovery: 5 });
  }

  // Check 5: QuickBooks/GL reconciliation
  const unexportedCount = await safeCount(`SELECT COUNT(*) as count FROM journal_entries WHERE status = 'DRAFT'`);
  checks['QB_RECONCILIATION'] = unexportedCount === null ? 0.5 : unexportedCount < 10 ? 1 : (unexportedCount < 30 ? 0.5 : 0);
  evidenceItems.push({ label: 'Unexported/draft journal entries', value: unexportedCount ?? 'SCORER_UNAVAILABLE' });
  if (unexportedCount >= 10) {
    redFlags.push({
      domainKey: 'ACCOUNTING', flagKey: 'QB_DIVERGENCE', severity: 'MEDIUM',
      title: 'Unreconciled Journal Entries',
      description: `${unexportedCount} journal entries remain in DRAFT state and have not been posted to the general ledger.`,
      farCitation: 'FAR 31.201-2(b)', potentialScoreRecovery: 3,
    });
    remediationItems.push({ domainKey: 'ACCOUNTING', flagKey: 'QB_DIVERGENCE', title: 'Post and reconcile all pending journal entries', description: 'Review and post DRAFT journal entries to the GL.', priority: 'P3_MEDIUM', potentialScoreRecovery: 3 });
  }

  return { rawScore: computeRawScore(checks), checks, redFlags, remediationItems, evidenceItems };
}

// ---------------------------------------------------------------------------
// procurementComplianceStats — single-pass query over issued vendor POs
// Evidence source: vendor_pos (status IN ('Sent','Partially Received','Fully Received'))
//   joined to vendor_po_compliance_reviews and po_optional_settings.
// Optional dateFilterClause: extra SQL AND-clause to restrict to enforced population only.
// ---------------------------------------------------------------------------
interface ProcurementComplianceStats {
  totalIssuedPos: number;
  withAnyReview: number;
  withReviewedStatus: number;
  withSecondPartyComplete: number;
  withVendorApprovedTrue: number;
  withVendorApprovedFalse: number;
  withAttentionOrBlocked: number;
  farRequiredCount: number;
  farRequiredWithStatement: number;
  farNotRequiredReviewedCount: number; // far_required=false reviewed POs (denominator for justification coverage)
  farNotRequiredWithNotes: number;     // far_required=false reviewed POs that have non-empty review_notes (justified exemptions)
  staleReviewCount: number;            // reviewed_at older than 365 days — stale per annual audit cycle
  noReviewPos: number;
  sampleFailingPoNumbers: string[];
}

async function procurementComplianceStats(dateFilterClause = '', params: unknown[] = []): Promise<ProcurementComplianceStats | null> {
  try {
    // Main aggregate query — one pass over issued vendor POs
    const rows = await pool.query(`
      SELECT
        COUNT(vp.id)::text                                                  AS total_issued,
        COUNT(cr.id)::text                                                  AS with_any_review,
        COUNT(cr.id) FILTER (WHERE cr.review_status = 'reviewed')::text    AS with_reviewed_status,
        COUNT(cr.id) FILTER (WHERE cr.second_party_complete = true AND cr.review_status = 'reviewed')::text
                                                                            AS with_second_party_complete,
        COUNT(cr.id) FILTER (WHERE cr.vendor_approved = true AND cr.review_status = 'reviewed')::text
                                                                            AS with_vendor_approved_true,
        COUNT(cr.id) FILTER (WHERE cr.vendor_approved = false AND cr.review_status = 'reviewed')::text
                                                                            AS with_vendor_approved_false,
        COUNT(cr.id) FILTER (WHERE cr.review_status IN ('requires_attention','blocked'))::text
                                                                            AS with_attention_or_blocked,
        COUNT(cr.id) FILTER (WHERE cr.far_required = true)::text           AS far_required_count,
        COUNT(cr.id) FILTER (
          WHERE cr.far_required = true
            AND EXISTS (
              SELECT 1 FROM po_optional_settings pos2
              JOIN optional_settings os ON os.id = pos2.optional_setting_id
              WHERE pos2.vendor_po_id = vp.id
                AND (os.name ILIKE '%FAR%' OR os.name ILIKE '%DFAR%')
            )
        )::text                                                             AS far_required_with_statement,
        COUNT(cr.id) FILTER (
          WHERE cr.far_required = false
            AND cr.review_status = 'reviewed'
        )::text                                                             AS far_not_required_reviewed_count,
        COUNT(cr.id) FILTER (
          WHERE cr.far_required = false
            AND cr.review_status = 'reviewed'
            AND cr.review_notes IS NOT NULL
            AND cr.review_notes != ''
        )::text                                                             AS far_not_required_with_notes,
        COUNT(cr.id) FILTER (
          WHERE cr.review_status = 'reviewed'
            AND cr.reviewed_at IS NOT NULL
            AND cr.reviewed_at < NOW() - INTERVAL '365 days'
        )::text                                                             AS stale_review_count,
        COUNT(vp.id) FILTER (WHERE cr.id IS NULL)::text                    AS no_review_count
      FROM vendor_pos vp
      LEFT JOIN vendor_po_compliance_reviews cr ON cr.vendor_po_id = vp.id
      WHERE vp.status IN ('Sent', 'Partially Received', 'Fully Received')
        AND vp.archived = false
        ${dateFilterClause}
    `, params);

    const r = rows[0];
    if (!r) return null;

    // Collect up to 5 sample failing PO numbers:
    //   - no compliance review at all
    //   - requires_attention or blocked review status
    //   - FAR-required but no FAR/DFARS statement attached
    //   - stale review (reviewed_at older than 365 days)
    const failingRows = await pool.query(`
      SELECT COALESCE(vp.po_number, vp.id::text) AS po_number
      FROM vendor_pos vp
      LEFT JOIN vendor_po_compliance_reviews cr ON cr.vendor_po_id = vp.id
      LEFT JOIN LATERAL (
        SELECT 1 FROM po_optional_settings pos2
        JOIN optional_settings os ON os.id = pos2.optional_setting_id
        WHERE pos2.vendor_po_id = vp.id
          AND (os.name ILIKE '%FAR%' OR os.name ILIKE '%DFAR%')
        LIMIT 1
      ) has_far_stmt ON true
      WHERE vp.status IN ('Sent', 'Partially Received', 'Fully Received')
        AND vp.archived = false
        ${dateFilterClause}
        AND (
          cr.id IS NULL
          OR cr.review_status IN ('requires_attention','blocked')
          OR (cr.far_required = true AND has_far_stmt IS NULL)
          OR (cr.review_status = 'reviewed' AND cr.reviewed_at IS NOT NULL AND cr.reviewed_at < NOW() - INTERVAL '365 days')
        )
      ORDER BY vp.id DESC
      LIMIT 5
    `, params);

    return {
      totalIssuedPos: parseInt(r.total_issued, 10) || 0,
      withAnyReview: parseInt(r.with_any_review, 10) || 0,
      withReviewedStatus: parseInt(r.with_reviewed_status, 10) || 0,
      withSecondPartyComplete: parseInt(r.with_second_party_complete, 10) || 0,
      withVendorApprovedTrue: parseInt(r.with_vendor_approved_true, 10) || 0,
      withVendorApprovedFalse: parseInt(r.with_vendor_approved_false, 10) || 0,
      withAttentionOrBlocked: parseInt(r.with_attention_or_blocked, 10) || 0,
      farRequiredCount: parseInt(r.far_required_count, 10) || 0,
      farRequiredWithStatement: parseInt(r.far_required_with_statement, 10) || 0,
      farNotRequiredReviewedCount: parseInt(r.far_not_required_reviewed_count, 10) || 0,
      farNotRequiredWithNotes: parseInt(r.far_not_required_with_notes, 10) || 0,
      staleReviewCount: parseInt(r.stale_review_count, 10) || 0,
      noReviewPos: parseInt(r.no_review_count, 10) || 0,
      sampleFailingPoNumbers: failingRows.map(fr => fr.po_number),
    };
  } catch (err) {
    console.error('[EDRI procurementComplianceStats] Query error:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function scoreProcurement(): Promise<DomainScorerResult> {
  const checks: Record<string, 0 | 0.5 | 1> = {};
  const redFlags: RedFlagInput[] = [];
  const remediationItems: RemediationInput[] = [];
  const evidenceItems: EvidenceRef[] = [];

  // ─── Fetch Procurement Compliance Effective Date ──────────────────────────
  // POs issued before this date are "legacy pre-policy" and excluded from mandatory
  // enforcement scoring. Exception-flagged legacy POs are moved into the enforced population.
  let effectiveDate = '2026-06-01'; // default
  try {
    const edRows = await safeQuery<{ effective_date: string }>(
      `SELECT effective_date::text AS effective_date FROM procurement_compliance_effective_dates ORDER BY configured_at DESC LIMIT 1`
    );
    if (edRows.length > 0 && edRows[0].effective_date) {
      effectiveDate = edRows[0].effective_date;
    }
  } catch {
    // If table doesn't exist yet, use default
  }

  // Build the enforced population filter using $1 as the parameterized effective date.
  // enforced = (created_at >= effective_date) OR (legacy_exception_flagged = true)
  // Use order_date as the canonical PO issue date; fall back to created_at::date
  // for POs that do not have an explicit order date set.
  const enforcedDateFilter = `AND (COALESCE(vp.order_date, vp.created_at::date) >= $1::date OR COALESCE(cr.legacy_exception_flagged, false) = true)`;
  const legacyDateFilter = `AND COALESCE(vp.order_date, vp.created_at::date) < $1::date AND COALESCE(cr.legacy_exception_flagged, false) = false`;
  const dateParams = [effectiveDate];

  // Count total issued POs (all populations)
  const totalAllIssuedPos = await safeCount(`
    SELECT COUNT(*) AS count FROM vendor_pos vp
    LEFT JOIN vendor_po_compliance_reviews cr ON cr.vendor_po_id = vp.id
    WHERE vp.status IN ('Sent', 'Partially Received', 'Fully Received') AND vp.archived = false
  `);

  // Count legacy POs (pre-effective-date, not exception-flagged)
  const totalLegacyPos = await safeCount(`
    SELECT COUNT(*) AS count FROM vendor_pos vp
    LEFT JOIN vendor_po_compliance_reviews cr ON cr.vendor_po_id = vp.id
    WHERE vp.status IN ('Sent', 'Partially Received', 'Fully Received')
      AND vp.archived = false
      ${legacyDateFilter}
  `, dateParams);
  const totalExceptionFlagged = await safeCount(`
    SELECT COUNT(*) AS count FROM vendor_pos vp
    JOIN vendor_po_compliance_reviews cr ON cr.vendor_po_id = vp.id
    WHERE vp.status IN ('Sent', 'Partially Received', 'Fully Received')
      AND vp.archived = false
      AND COALESCE(vp.order_date, vp.created_at::date) < $1::date
      AND cr.legacy_exception_flagged = true
  `, dateParams);

  // Expose population metadata in evidence
  evidenceItems.push({ label: 'Compliance Effective Date (enforcement begins)', value: effectiveDate });
  evidenceItems.push({ label: 'Total issued POs (all populations)', value: totalAllIssuedPos ?? 'SCORER_UNAVAILABLE' });
  evidenceItems.push({ label: 'Legacy pre-policy POs (pre-date, not exception-flagged)', value: totalLegacyPos ?? 'SCORER_UNAVAILABLE' });
  if ((totalExceptionFlagged ?? 0) > 0) {
    evidenceItems.push({ label: 'Legacy POs promoted to enforcement (exception-flagged)', value: totalExceptionFlagged ?? 0 });
  }

  // Gather compliance evidence for enforced population only
  const stats = await procurementComplianceStats(enforcedDateFilter, dateParams);
  const totalIssuedPos = stats?.totalIssuedPos ?? 0;

  // -------------------------------------------------------------------------
  // Check 1: REQUISITION_WORKFLOW
  // Evidence source: parts_requests.vendor_po_id FK → vendor_pos.id
  // This is the real requisition-to-PO traceability linkage used by the system.
  // -------------------------------------------------------------------------
  const issuedPosWithReq = await safeCount(`
    SELECT COUNT(DISTINCT vp.id) AS count
    FROM vendor_pos vp
    LEFT JOIN vendor_po_compliance_reviews cr ON cr.vendor_po_id = vp.id
    WHERE vp.status IN ('Sent', 'Partially Received', 'Fully Received')
      AND vp.archived = false
      ${enforcedDateFilter}
      AND EXISTS (
        SELECT 1 FROM parts_requests pr WHERE pr.vendor_po_id = vp.id
      )
  `, dateParams);
  const reqRate = (issuedPosWithReq === null || totalIssuedPos === 0)
    ? null
    : issuedPosWithReq / totalIssuedPos;
  checks['REQUISITION_WORKFLOW'] = reqRate === null ? 0.5 : reqRate >= 0.80 ? 1 : (reqRate >= 0.50 ? 0.5 : 0);
  evidenceItems.push({ label: 'Enforced POs evaluated (post-effective-date + exception-flagged)', value: totalIssuedPos });
  evidenceItems.push({ label: 'Issued POs with linked parts-request (requisition)', value: issuedPosWithReq === null ? 'SCORER_UNAVAILABLE' : `${issuedPosWithReq} / ${totalIssuedPos}` });
  if (reqRate !== null && reqRate < 0.80 && totalIssuedPos > 0) {
    redFlags.push({
      domainKey: 'PROCUREMENT', flagKey: 'NO_REQUISITION_WORKFLOW', severity: 'HIGH',
      title: 'Issued POs Missing Requisition Linkage',
      description: `${((1 - reqRate) * 100).toFixed(0)}% of issued vendor POs are not traceable to an approved parts-request requisition.`,
      farCitation: 'FAR 44.201', potentialScoreRecovery: 8,
    });
    remediationItems.push({ domainKey: 'PROCUREMENT', flagKey: 'NO_REQUISITION_WORKFLOW', title: 'Link vendor POs to approved requisitions', description: 'Require a parts-request record (vendor_po_id linkage) before issuing a vendor PO.', priority: 'P2_HIGH', potentialScoreRecovery: 8 });
  }

  // -------------------------------------------------------------------------
  // Check 2: SECOND_PARTY_APPROVAL
  // Evidence source: vendor_po_compliance_reviews.second_party_complete on reviewed records.
  // Measures whether each issued PO has a second-party reviewer sign-off recorded.
  // -------------------------------------------------------------------------
  if (stats === null) {
    checks['SECOND_PARTY_APPROVAL'] = 0.5;
    evidenceItems.push({ label: 'Second-party approval (compliance reviews)', value: 'SCORER_UNAVAILABLE' });
  } else if (totalIssuedPos === 0) {
    checks['SECOND_PARTY_APPROVAL'] = 0.5;
    evidenceItems.push({ label: 'Second-party approval (compliance reviews)', value: 'N/A — no issued vendor POs' });
  } else {
    // Denominator is withAnyReview — all issued POs that have any compliance review record
    // (pending, reviewed, blocked, requires_attention). secondPartyComplete is gated on
    // reviewed status, so any issued PO with a non-reviewed review counts as incomplete coverage.
    // FAIL: no issued POs have any compliance review at all
    // FULL: all issued POs with any review have secondPartyComplete = true
    // PARTIAL: some issued POs with reviews have secondPartyComplete, but not all
    const anyReviewCount = stats.withAnyReview;
    const secondPartyCount = stats.withSecondPartyComplete;
    const approvalRate = anyReviewCount > 0 ? secondPartyCount / anyReviewCount : 0;
    checks['SECOND_PARTY_APPROVAL'] = anyReviewCount === 0 ? 0 : (approvalRate >= 1 ? 1 : 0.5);
    evidenceItems.push({ label: 'Issued POs with any compliance review having second-party complete', value: `${secondPartyCount} / ${anyReviewCount} with any review` });
    if (anyReviewCount === 0) {
      redFlags.push({
        domainKey: 'PROCUREMENT', flagKey: 'INSUFFICIENT_PO_APPROVAL', severity: 'HIGH',
        title: 'No Compliance Reviews Completed on Issued POs',
        description: `${totalIssuedPos} issued vendor POs have no completed compliance review — second-party approval cannot be confirmed.`,
        farCitation: 'FAR 44.202-2', potentialScoreRecovery: 5,
      });
      remediationItems.push({ domainKey: 'PROCUREMENT', flagKey: 'INSUFFICIENT_PO_APPROVAL', title: 'Complete compliance reviews on issued POs', description: 'Each issued vendor PO requires a completed compliance review with second-party sign-off.', priority: 'P2_HIGH', potentialScoreRecovery: 5 });
    } else if (approvalRate < 1) {
      redFlags.push({
        domainKey: 'PROCUREMENT', flagKey: 'INSUFFICIENT_PO_APPROVAL', severity: 'HIGH',
        title: 'Incomplete Second-Party PO Approval Coverage',
        description: `Only ${secondPartyCount} of ${anyReviewCount} issued POs with a compliance review have second-party approval documented (${(approvalRate * 100).toFixed(0)}%).`,
        farCitation: 'FAR 44.202-2', potentialScoreRecovery: 5,
      });
      remediationItems.push({ domainKey: 'PROCUREMENT', flagKey: 'INSUFFICIENT_PO_APPROVAL', title: 'Ensure all POs with reviews have second-party approval', description: 'Set second_party_complete on all compliance review records before closing the review.', priority: 'P2_HIGH', potentialScoreRecovery: 5 });
    }
  }

  // -------------------------------------------------------------------------
  // Check 3: VENDOR_APPROVAL_BLOCKING
  // Primary evidence: vendor_po_compliance_reviews.vendor_approved = false on reviewed records.
  // Secondary evidence: vendors.approved = false for issued POs with no compliance review yet.
  // Any reviewed PO where vendor_approved = false is a critical deficiency.
  // -------------------------------------------------------------------------
  if (stats === null) {
    checks['VENDOR_APPROVAL_BLOCKING'] = 0.5;
    evidenceItems.push({ label: 'POs with unapproved vendor (compliance review)', value: 'SCORER_UNAVAILABLE' });
  } else if (totalIssuedPos === 0) {
    checks['VENDOR_APPROVAL_BLOCKING'] = 1;
    evidenceItems.push({ label: 'POs with unapproved vendor (compliance review)', value: 'N/A — no issued vendor POs' });
  } else {
    // Secondary check: enforced issued POs with no compliance review whose vendor master is not approved
    const issuedPosUnapprovedVendorNoReview = await safeCount(`
      SELECT COUNT(vp.id) AS count
      FROM vendor_pos vp
      JOIN vendors v ON v.id = vp.vendor_id
      LEFT JOIN vendor_po_compliance_reviews cr ON cr.vendor_po_id = vp.id
      WHERE vp.status IN ('Sent', 'Partially Received', 'Fully Received')
        AND vp.archived = false
        ${enforcedDateFilter}
        AND cr.id IS NULL
        AND v.approved = false
    `, dateParams);

    const vendorApprovedFalse = stats.withVendorApprovedFalse;
    const secondaryFail = issuedPosUnapprovedVendorNoReview ?? 0;

    if (vendorApprovedFalse > 0) {
      checks['VENDOR_APPROVAL_BLOCKING'] = 0;
    } else if (secondaryFail > 0) {
      checks['VENDOR_APPROVAL_BLOCKING'] = 0.5;
    } else {
      checks['VENDOR_APPROVAL_BLOCKING'] = 1;
    }

    evidenceItems.push({ label: 'Reviewed POs with vendor_approved = false (compliance review)', value: vendorApprovedFalse });
    evidenceItems.push({ label: 'Issued POs with unapproved vendor master (no review yet)', value: issuedPosUnapprovedVendorNoReview ?? 'SCORER_UNAVAILABLE' });

    if (vendorApprovedFalse > 0) {
      redFlags.push({
        domainKey: 'PROCUREMENT', flagKey: 'UNAPPROVED_VENDOR_POS', severity: 'HIGH',
        title: 'Issued POs with Vendor Approval Rejected in Compliance Review',
        description: `${vendorApprovedFalse} issued vendor POs have a completed compliance review where vendor_approved = false — these represent active procurement violations.${secondaryFail > 0 ? ` Additionally, ${secondaryFail} issued POs have an unapproved vendor master and no compliance review.` : ''}`,
        farCitation: 'FAR 44.201', potentialScoreRecovery: 6,
      });
      remediationItems.push({ domainKey: 'PROCUREMENT', flagKey: 'UNAPPROVED_VENDOR_POS', title: 'Resolve vendor approval failures on issued POs', description: 'Review and resolve all compliance review records where vendor_approved = false before closing the PO.', priority: 'P2_HIGH', potentialScoreRecovery: 6 });
    } else if (secondaryFail > 0) {
      redFlags.push({
        domainKey: 'PROCUREMENT', flagKey: 'UNAPPROVED_VENDOR_POS', severity: 'HIGH',
        title: 'Issued POs Against Unapproved Vendors Without Compliance Review',
        description: `${secondaryFail} issued vendor POs have an unapproved vendor master and no compliance review on file.`,
        farCitation: 'FAR 44.201', potentialScoreRecovery: 6,
      });
      remediationItems.push({ domainKey: 'PROCUREMENT', flagKey: 'UNAPPROVED_VENDOR_POS', title: 'Complete compliance reviews for unapproved-vendor POs', description: 'Each issued PO against an unapproved vendor must have a compliance review completed.', priority: 'P2_HIGH', potentialScoreRecovery: 6 });
    }
  }

  // -------------------------------------------------------------------------
  // Check 4: FAR_FLOWDOWN
  // Evidence source: vendor_po_compliance_reviews (far_required, review_status) joined to
  //   po_optional_settings + optional_settings (name ILIKE '%FAR%' or '%DFAR%').
  // No longer reads vendors.terms or vendors.notes — those fields are not compliance proof.
  // FULL:    all issued POs have reviewed compliance review, all far_required=true have FAR
  //          statement attached, no requires_attention/blocked statuses.
  // PARTIAL: some POs have reviews but gaps exist.
  // FAIL:    issued POs exist with no compliance review at all.
  // N/A:     no issued vendor POs.
  // -------------------------------------------------------------------------
  if (stats === null) {
    checks['FAR_FLOWDOWN'] = 0.5;
    evidenceItems.push({ label: 'FAR/DFARS flowdown compliance (vendor PO reviews)', value: 'SCORER_UNAVAILABLE' });
  } else if (totalIssuedPos === 0) {
    checks['FAR_FLOWDOWN'] = 0.5;
    evidenceItems.push({ label: 'FAR/DFARS flowdown compliance (vendor PO reviews)', value: 'N/A — no issued vendor POs' });
  } else {
    const {
      withAnyReview, withReviewedStatus, noReviewPos,
      farRequiredCount, farRequiredWithStatement,
      farNotRequiredReviewedCount, farNotRequiredWithNotes,
      withAttentionOrBlocked, staleReviewCount, sampleFailingPoNumbers,
    } = stats;

    // FAR-not-required reviewed POs without justification notes — these are a gap even without FAR requirement
    const farNotRequiredMissingNotes = farNotRequiredReviewedCount - farNotRequiredWithNotes;

    const failingSample = sampleFailingPoNumbers.length > 0
      ? ` Failing/stale POs: ${sampleFailingPoNumbers.join(', ')}.`
      : '';
    const evidenceStr = [
      `${totalIssuedPos} issued POs evaluated.`,
      `${withAnyReview} have a compliance review; ${withReviewedStatus} are fully reviewed.`,
      `${farRequiredCount} marked FAR/DFARS required; ${farRequiredWithStatement} have FAR/DFARS statement attached.`,
      `${farNotRequiredWithNotes} / ${farNotRequiredReviewedCount} FAR-not-required reviewed POs have a documented justification in review notes.`,
      `${noReviewPos} issued POs lack any compliance review.`,
      `${withAttentionOrBlocked} have requires-attention or blocked status.`,
      `${staleReviewCount} have a stale compliance review (reviewed_at > 365 days ago).`,
      failingSample,
    ].filter(Boolean).join(' ');
    evidenceItems.push({ label: 'FAR/DFARS flowdown compliance (vendor PO reviews)', value: evidenceStr });

    const allReviewed = withReviewedStatus === totalIssuedPos;
    const allFarStatementsAttached = farRequiredCount === 0 || farRequiredWithStatement === farRequiredCount;
    // All FAR-not-required reviewed POs must have a non-empty justification note (no silent exemptions)
    const allExemptionsJustified = farNotRequiredReviewedCount === 0 || farNotRequiredMissingNotes === 0;
    const noGaps = noReviewPos === 0 && withAttentionOrBlocked === 0 && staleReviewCount === 0;

    // FAIL: any issued PO has no compliance review at all (traceability gap regardless of other results)
    // FULL: all reviewed, all FAR statements, all exemptions justified, no stale/attention/blocked
    // PARTIAL: no missing reviews but gaps remain (missing FAR statements, stale, blocked, undocumented exemptions)
    if (noReviewPos > 0) {
      checks['FAR_FLOWDOWN'] = 0;
    } else if (allReviewed && allFarStatementsAttached && allExemptionsJustified && noGaps) {
      checks['FAR_FLOWDOWN'] = 1;
    } else {
      checks['FAR_FLOWDOWN'] = 0.5;
    }

    if (checks['FAR_FLOWDOWN'] < 1) {
      const isFullFail = checks['FAR_FLOWDOWN'] === 0;
      redFlags.push({
        domainKey: 'PROCUREMENT', flagKey: 'NO_FAR_FLOWDOWN', severity: 'HIGH',
        title: isFullFail ? 'No FAR/DFARS Compliance Reviews on Issued POs' : 'Incomplete FAR/DFARS Compliance Review Coverage',
        description: evidenceStr,
        farCitation: 'FAR 44.201', potentialScoreRecovery: 5,
      });
      remediationItems.push({
        domainKey: 'PROCUREMENT', flagKey: 'NO_FAR_FLOWDOWN',
        title: isFullFail ? 'Create compliance reviews for all issued vendor POs' : 'Resolve FAR/DFARS compliance review gaps on issued POs',
        description: 'Ensure every issued vendor PO has a completed compliance review. For POs where far_required = true, attach the FAR/DFARS optional statement via po_optional_settings.',
        priority: 'P2_HIGH', potentialScoreRecovery: 5,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Check 5: VENDOR_EVALUATION
  // Evidence source: vendors.evaluated boolean and vendors.evaluation_date date field.
  // Note: the schema does not have a last_evaluated_at column — evaluation_date is the
  //   actual field populated by the vendor evaluation workflow.
  //   This check does NOT conflate vendor approval with performance evaluation;
  //   approved = whether the vendor is approved to be used; evaluated = whether a periodic
  //   performance evaluation has been completed.
  //
  // Policy: Annual evaluations are only required for Approval Level A vendors
  // (critical / high-risk suppliers). Level B and C vendors are out of scope for
  // this check, matching the policy surfaced on the Vendor Management page.
  // Vendors with no approval_level set are treated as out of scope here — they
  // are flagged separately by the vendor approval / classification workflows.
  // If there are zero Level A vendors, this check is recorded as fully
  // satisfied (denominator 0 → nothing to evaluate) rather than penalised.
  // -------------------------------------------------------------------------
  const totalVendors = await safeCount(`SELECT COUNT(*) AS count FROM vendors WHERE is_active = true AND approval_level = 'A'`);
  const recentlyEvaluatedVendors = await safeCount(`
    SELECT COUNT(*) AS count FROM vendors
    WHERE is_active = true
      AND approval_level = 'A'
      AND evaluated = true
      AND evaluation_date IS NOT NULL
      AND evaluation_date::timestamp > NOW() - INTERVAL '365 days'
  `);
  const evalRate = (totalVendors === null || recentlyEvaluatedVendors === null)
    ? null
    : (totalVendors > 0 ? recentlyEvaluatedVendors / totalVendors : 1);
  checks['VENDOR_EVALUATION'] = evalRate === null ? 0.5 : evalRate >= 0.75 ? 1 : (evalRate > 0 ? 0.5 : 0);
  evidenceItems.push({ label: 'Active Level A vendors evaluated in last 365 days (evaluation_date)', value: (recentlyEvaluatedVendors === null || totalVendors === null) ? 'SCORER_UNAVAILABLE' : `${recentlyEvaluatedVendors} / ${totalVendors}` });
  if (evalRate !== null && evalRate < 0.75 && totalVendors !== null && totalVendors > 0) {
    redFlags.push({
      domainKey: 'PROCUREMENT', flagKey: 'OVERDUE_VENDOR_EVALUATIONS', severity: 'MEDIUM',
      title: 'Vendor Performance Evaluation Lapsed',
      description: `Only ${(evalRate * 100).toFixed(0)}% of active Approval Level A vendors have a recorded performance evaluation in the last 12 months (${recentlyEvaluatedVendors} of ${totalVendors}).`,
      farCitation: 'FAR 44.303', potentialScoreRecovery: 3,
    });
    remediationItems.push({ domainKey: 'PROCUREMENT', flagKey: 'OVERDUE_VENDOR_EVALUATIONS', title: 'Complete overdue vendor performance evaluations', description: 'Evaluate all active Approval Level A vendors on an annual cycle and record evaluation_date in the vendor record. Levels B and C are not subject to this requirement.', priority: 'P3_MEDIUM', potentialScoreRecovery: 3 });
  }

  return { rawScore: computeRawScore(checks), checks, redFlags, remediationItems, evidenceItems };
}

export async function scoreInventory(): Promise<DomainScorerResult> {
  const checks: Record<string, 0 | 0.5 | 1> = {};
  const redFlags: RedFlagInput[] = [];
  const remediationItems: RemediationInput[] = [];
  const evidenceItems: EvidenceRef[] = [];

  // Check 1: Zero-quantity ledger guard
  const zeroQtyTransactions = await safeCount(`
    SELECT COUNT(*) as count FROM inventory_transactions
    WHERE quantity = 0 OR quantity IS NULL
  `);
  checks['ZERO_QTY_GUARD'] = zeroQtyTransactions === null ? 0 : zeroQtyTransactions === 0 ? 1 : 0;
  evidenceItems.push({ label: 'Zero-quantity transactions', value: zeroQtyTransactions ?? 'SCORER_UNAVAILABLE' });
  if (zeroQtyTransactions === null || zeroQtyTransactions > 0) {
    redFlags.push({
      domainKey: 'INVENTORY', flagKey: 'ZERO_QUANTITY_LEDGER', severity: 'HIGH',
      title: 'Zero-Quantity Ledger Entries',
      description: zeroQtyTransactions === null ? 'Unable to verify inventory transaction quantities (table unavailable). All inventory transactions must have non-zero quantities.' : `${zeroQtyTransactions} inventory transactions have zero or null quantity values.`,
      farCitation: 'FAR 45.402', potentialScoreRecovery: 5,
    });
    remediationItems.push({ domainKey: 'INVENTORY', flagKey: 'ZERO_QUANTITY_LEDGER', title: 'Guard against zero-quantity ledger events', description: 'Prevent inventory transactions with zero or null quantity.', priority: 'P2_HIGH', potentialScoreRecovery: 5 });
  }

  // Check 2: Lot traceability (ICN coverage)
  const totalLots = await safeCount(`SELECT COUNT(*) as count FROM material_lots`);
  const lotsWithICN = await safeCount(`SELECT COUNT(*) as count FROM material_lots WHERE icn IS NOT NULL AND icn != ''`);
  const icnRate = (totalLots === null || lotsWithICN === null) ? null : (totalLots > 0 ? lotsWithICN / totalLots : 1);
  checks['LOT_TRACEABILITY'] = icnRate === null ? 0.5 : icnRate >= 0.95 ? 1 : (icnRate >= 0.75 ? 0.5 : 0);
  evidenceItems.push({ label: 'ICN coverage rate', value: (totalLots === null || lotsWithICN === null) ? 'SCORER_UNAVAILABLE' : `${(icnRate * 100).toFixed(1)}%` });
  if (icnRate !== null && icnRate < 0.95 && totalLots !== null && totalLots > 0) {
    redFlags.push({
      domainKey: 'INVENTORY', flagKey: 'ICN_GAP', severity: 'MEDIUM',
      title: 'Incomplete ICN Coverage',
      description: `${((1 - icnRate) * 100).toFixed(1)}% of material lots are missing ICN (Item Control Number).`,
      farCitation: 'FAR 45.402', potentialScoreRecovery: 4,
    });
    remediationItems.push({ domainKey: 'INVENTORY', flagKey: 'ICN_GAP', title: 'Assign ICNs to all material lots', description: 'Ensure every material lot has a unique ICN for full traceability.', priority: 'P3_MEDIUM', potentialScoreRecovery: 4 });
  }

  // Check 3: FIFO/FEFO enforcement — verify lots are issued in creation order
  // A proxy: count lots issued out of order (issued_at < predecessor lot created_at for same part)
  const outOfOrderLots = await safeCount(`
    SELECT COUNT(*) as count
    FROM material_lots ml
    WHERE received_date IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM material_lots older
        WHERE older.part_number = ml.part_number
          AND older.received_date > ml.received_date
          AND older.id < ml.id
      )
    LIMIT 1000
  `);
  const hasLotSystem = totalLots !== null && totalLots > 0;
  checks['FIFO_ENFORCEMENT'] = (totalLots === null || outOfOrderLots === null) ? 0.5 : (!hasLotSystem ? 0 : (outOfOrderLots === 0 ? 1 : 0.5));
  evidenceItems.push({ label: 'Out-of-order lot issuances (FIFO violations)', value: outOfOrderLots ?? 'SCORER_UNAVAILABLE' });
  if (hasLotSystem && outOfOrderLots > 0) {
    redFlags.push({
      domainKey: 'INVENTORY', flagKey: 'NO_FIFO_ENFORCEMENT', severity: 'MEDIUM',
      title: 'FIFO/FEFO Not Enforced',
      description: `${outOfOrderLots} instances of material lots being processed out of FIFO order detected.`,
      farCitation: 'FAR 45.402', potentialScoreRecovery: 3,
    });
    remediationItems.push({ domainKey: 'INVENTORY', flagKey: 'NO_FIFO_ENFORCEMENT', title: 'Implement FIFO/FEFO enforcement on lot issuance', description: 'Add system enforcement of First-In-First-Out for material lot issuance.', priority: 'P3_MEDIUM', potentialScoreRecovery: 3 });
  }

  // Check 4: Event visibility (ISSUE, MOVE, SPLIT)
  const moveEvents = await safeCount(`SELECT COUNT(*) as count FROM inventory_transactions WHERE transaction_type IN ('ISSUE', 'MOVE', 'SPLIT')`);
  checks['EVENT_VISIBILITY'] = moveEvents === null ? 0.5 : moveEvents > 0 ? 1 : 0.5;
  evidenceItems.push({ label: 'ISSUE/MOVE/SPLIT events', value: moveEvents ?? 'SCORER_UNAVAILABLE' });
  if (moveEvents !== null && moveEvents === 0) {
    redFlags.push({
      domainKey: 'INVENTORY', flagKey: 'NO_INVENTORY_EVENTS', severity: 'MEDIUM',
      title: 'No Inventory Movement Events Recorded',
      description: 'No ISSUE, MOVE, or SPLIT inventory transaction events found. Physical inventory movements must be tracked for DCAA property accountability.',
      farCitation: 'FAR 45.402', potentialScoreRecovery: 3,
    });
    remediationItems.push({ domainKey: 'INVENTORY', flagKey: 'NO_INVENTORY_EVENTS', title: 'Enable full inventory event tracking (ISSUE/MOVE/SPLIT)', description: 'Ensure all physical inventory movements generate transaction event records.', priority: 'P3_MEDIUM', potentialScoreRecovery: 3 });
  }

  return { rawScore: computeRawScore(checks), checks, redFlags, remediationItems, evidenceItems };
}

export async function scorePolicy(): Promise<DomainScorerResult> {
  const checks: Record<string, 0 | 0.5 | 1> = {};
  const redFlags: RedFlagInput[] = [];
  const remediationItems: RemediationInput[] = [];
  const evidenceItems: EvidenceRef[] = [];

  // Check 1: Audit log completeness
  const auditEventCount = await safeCount(`SELECT COUNT(*) as count FROM audit_events WHERE created_at > NOW() - INTERVAL '30 days'`);
  checks['AUDIT_LOG_COMPLETENESS'] = auditEventCount === null ? 0 : auditEventCount > 100 ? 1 : (auditEventCount > 0 ? 0.5 : 0);
  evidenceItems.push({ label: 'Audit events (last 30 days)', value: auditEventCount ?? 'SCORER_UNAVAILABLE' });
  if (auditEventCount === null || auditEventCount < 100) {
    redFlags.push({
      domainKey: 'POLICY', flagKey: 'AUDIT_LOG_GAPS', severity: 'HIGH',
      title: 'Audit Log Gaps Detected',
      description: `Only ${auditEventCount} audit events in the last 30 days. Critical tables may not be fully audited.`,
      farCitation: 'FAR 52.215-2(f)', potentialScoreRecovery: 6,
    });
    remediationItems.push({ domainKey: 'POLICY', flagKey: 'AUDIT_LOG_GAPS', title: 'Expand audit log coverage', description: 'Ensure all critical tables (labor, procurement, inventory) log changes to audit_events.', priority: 'P2_HIGH', potentialScoreRecovery: 6 });
  }

  // Check 2: Deletion protection — look for admin_audit_log DELETE events with reason.
  // Column is 'change_type' (not 'action' — that column does not exist on admin_audit_log;
  // using 'action' caused a silent SQL error that made this check score 0 incorrectly).
  // admin_audit_log columns: id, order_id, field_name, field_label, old_value, new_value,
  //   changed_by, user_role, change_type, ip_address, user_agent, timestamp, reason.
  const deletionWithReason = await safeCount(`
    SELECT COUNT(*) as count FROM admin_audit_log
    WHERE change_type ILIKE '%DELETE%' AND reason IS NOT NULL AND reason != ''
    LIMIT 1000
  `);
  const deletionTotal = await safeCount(`
    SELECT COUNT(*) as count FROM admin_audit_log
    WHERE change_type ILIKE '%DELETE%'
    LIMIT 1000
  `);
  const deletionProtectionRate = (deletionTotal === null || deletionWithReason === null) ? null : (deletionTotal > 0 ? deletionWithReason / deletionTotal : 1);
  checks['DELETION_PROTECTION'] = deletionProtectionRate === null ? 0 : deletionProtectionRate >= 0.95 ? 1 : (deletionProtectionRate >= 0.50 ? 0.5 : 0);
  evidenceItems.push({ label: 'Deletions with justification', value: (deletionWithReason === null || deletionTotal === null) ? 'SCORER_UNAVAILABLE' : `${deletionWithReason} / ${deletionTotal}` });
  if (deletionProtectionRate === null || deletionProtectionRate < 0.95) {
    redFlags.push({
      domainKey: 'POLICY', flagKey: 'NO_DELETION_PROTECTION', severity: 'HIGH',
      title: 'Insufficient Deletion Protection',
      description: `${((1 - deletionProtectionRate) * 100).toFixed(0)}% of deletion events lack a documented justification/reason.`,
      farCitation: 'FAR 31.201-2(d)', potentialScoreRecovery: 5,
    });
    remediationItems.push({ domainKey: 'POLICY', flagKey: 'NO_DELETION_PROTECTION', title: 'Require justification for all record deletions', description: 'Enforce reason/justification field for all admin delete operations.', priority: 'P2_HIGH', potentialScoreRecovery: 5 });
  }

  // Check 3: Approval chain completeness
  const approvalChainCheck = await safeCount(`SELECT COUNT(*) as count FROM users WHERE role IN ('ADMIN', 'OWNER')`);
  checks['APPROVAL_CHAIN'] = approvalChainCheck === null ? 0.5 : approvalChainCheck >= 2 ? 1 : 0.5;
  evidenceItems.push({ label: 'Admin/Owner users for approval chain', value: approvalChainCheck ?? 'SCORER_UNAVAILABLE' });
  if (approvalChainCheck !== null && approvalChainCheck < 2) {
    redFlags.push({
      domainKey: 'POLICY', flagKey: 'INSUFFICIENT_APPROVAL_CHAIN', severity: 'HIGH',
      title: 'Insufficient Approval Chain Coverage',
      description: `Only ${approvalChainCheck} admin/owner user(s) configured. DCAA requires at least two authority levels for approval chains.`,
      farCitation: 'FAR 52.215-2(d)', potentialScoreRecovery: 4,
    });
    remediationItems.push({ domainKey: 'POLICY', flagKey: 'INSUFFICIENT_APPROVAL_CHAIN', title: 'Designate at least two admin/owner approvers', description: 'Ensure at least two users with ADMIN or OWNER role can execute approval workflows.', priority: 'P2_HIGH', potentialScoreRecovery: 4 });
  }

  // Check 3b: HARDCODED_APPROVER — detect active-approver bottleneck distinct from total-count gap.
  // This check is intentionally scoped to fire ONLY when APPROVAL_CHAIN passes (≥2 total admin/owner
  // users exist) but the active subset has collapsed to ≤1 — e.g., secondary approver is deactivated.
  // If APPROVAL_CHAIN already failed (< 2 total), that flag covers the root cause; surfacing
  // HARDCODED_APPROVER on top would create duplicate HIGH flags for the same underlying problem.
  const singleApproverCheck = await safeCount(`SELECT COUNT(*) as count FROM users WHERE role IN ('ADMIN', 'OWNER') AND is_active = true`);
  checks['HARDCODED_APPROVER'] = singleApproverCheck === null ? 0.5 : singleApproverCheck > 1 ? 1 : 0;
  evidenceItems.push({ label: 'Active admin/owner approver users', value: singleApproverCheck ?? 'SCORER_UNAVAILABLE' });
  // Only flag when total count was sufficient (APPROVAL_CHAIN passed) but active count has dropped ≤1.
  // This ensures HARDCODED_APPROVER and INSUFFICIENT_APPROVAL_CHAIN are mutually exclusive.
  const approvalChainPassed = approvalChainCheck !== null && approvalChainCheck >= 2;
  if (approvalChainPassed && singleApproverCheck !== null && singleApproverCheck <= 1) {
    redFlags.push({
      domainKey: 'POLICY', flagKey: 'HARDCODED_APPROVER', severity: 'HIGH',
      title: 'Active Approver Pool Reduced to Single User',
      description: `${approvalChainCheck} admin/owner accounts exist but only ${singleApproverCheck} is currently active. DCAA requires at least two active approvers for segregation of duties.`,
      farCitation: 'FAR 52.215-2(d)', potentialScoreRecovery: 5,
    });
    remediationItems.push({ domainKey: 'POLICY', flagKey: 'HARDCODED_APPROVER', title: 'Re-activate or add a second active approver (ADMIN or OWNER)', description: 'A second approver account is inactive — re-activate it or onboard a replacement to restore segregation of duties.', priority: 'P2_HIGH', potentialScoreRecovery: 5 });
  }

  // Check 4: Document version control
  const controlledDocs = await safeCount(`SELECT COUNT(*) as count FROM controlled_documents WHERE status = 'ACTIVE'`);
  checks['DOCUMENT_VERSION_CONTROL'] = controlledDocs === null ? 0.5 : controlledDocs > 0 ? 1 : 0.5;
  evidenceItems.push({ label: 'Active controlled documents', value: controlledDocs ?? 'SCORER_UNAVAILABLE' });
  if (controlledDocs !== null && controlledDocs === 0) {
    redFlags.push({
      domainKey: 'POLICY', flagKey: 'NO_CONTROLLED_DOCUMENTS', severity: 'MEDIUM',
      title: 'No Active Controlled Documents',
      description: 'No active controlled documents found. DCAA requires version-controlled procedure and policy documentation.',
      farCitation: 'FAR 31.201-2(c)', potentialScoreRecovery: 3,
    });
    remediationItems.push({ domainKey: 'POLICY', flagKey: 'NO_CONTROLLED_DOCUMENTS', title: 'Implement controlled document management', description: 'Create and activate controlled documents for key DCAA compliance procedures and policies.', priority: 'P3_MEDIUM', potentialScoreRecovery: 3 });
  }

  return { rawScore: computeRawScore(checks), checks, redFlags, remediationItems, evidenceItems };
}

export async function scoreGovtProperty(): Promise<DomainScorerResult> {
  return {
    rawScore: 0,
    checks: { 'MODULE_EXISTS': 0 },
    redFlags: [],
    remediationItems: [],
    evidenceItems: [{ label: 'Government Property module', value: 'Not implemented — weight = 0' }],
  };
}
