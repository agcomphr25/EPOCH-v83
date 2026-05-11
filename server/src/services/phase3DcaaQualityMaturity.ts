export type Phase3DcaaQualityDomain =
  | 'DAILY_TIME_CERTIFICATION'
  | 'SUPERVISOR_APPROVAL_DASHBOARDS'
  | 'PERIOD_CLOSE_LOCK_REOPEN'
  | 'NCR_CAPA_EXPANSION'
  | 'CALIBRATION_LOCKOUT';

export interface Phase3CoverageCheck {
  name: string;
  routeOrService: string;
  evidence: string;
  requiredForClosure: boolean;
}

export interface Phase3MaturityControl {
  name: string;
  ownerRoles: string[];
  sourceOfTruth: string;
  coverageChecks: Phase3CoverageCheck[];
  requiredAuditEvents: string[];
  lockoutOrBlockerBehavior: string;
}

export interface Phase3MaturityDomainCoverage {
  domain: Phase3DcaaQualityDomain;
  objective: string;
  controls: Phase3MaturityControl[];
  readinessExitCriteria: string[];
}

export const PHASE3_DCAA_QUALITY_MATURITY: Phase3MaturityDomainCoverage[] = [
  {
    domain: 'DAILY_TIME_CERTIFICATION',
    objective: 'Require every employee to certify daily or period time with a timestamped statement before submission or downstream payroll export.',
    controls: [
      {
        name: 'Daily employee time certification',
        ownerRoles: ['Employee', 'Supervisor', 'Payroll Administrator'],
        sourceOfTruth: 'timekeeping.timesheets, timekeeping.salaried_timesheets, audit_events DAILY_CERTIFIED',
        coverageChecks: [
          {
            name: 'Hourly attestation is mandatory before submit',
            routeOrService: 'server/src/services/timekeeping/timesheets.service.ts#submitTimesheet',
            evidence: 'policy_settings.certification_required blocks submission until employee_attested and attested_at are recorded.',
            requiredForClosure: true,
          },
          {
            name: 'Daily certification events are queryable',
            routeOrService: 'server/src/routes/timekeeping/daily-certification.ts',
            evidence: 'DAILY_CERTIFIED and DAILY_APPROVED events preserve employee, work date, statement, and timestamp evidence.',
            requiredForClosure: true,
          },
          {
            name: 'Salaried certification captures statement/version',
            routeOrService: 'server/src/routes/timekeeping/salariedTimesheets.ts',
            evidence: 'Salaried certification writes certified_at, certified_by, certification_statement, and certification_version.',
            requiredForClosure: true,
          },
        ],
        requiredAuditEvents: ['TIME_CERTIFIED', 'TIME_CERTIFIED_ADMIN', 'DAILY_CERTIFIED'],
        lockoutOrBlockerBehavior: 'Submission and payroll-ready states must reject uncertified time unless an audited admin override exists.',
      },
    ],
    readinessExitCriteria: [
      'No hourly timesheet can leave draft without an employee certification statement and timestamp.',
      'No salaried timesheet can advance to supervisor review without certification evidence.',
      'Daily certification coverage is visible by employee, date, and pay period for floor-check evidence.',
    ],
  },
  {
    domain: 'SUPERVISOR_APPROVAL_DASHBOARDS',
    objective: 'Surface missing, stale, self-approved, and payroll-exported labor approval exceptions before close.',
    controls: [
      {
        name: 'Supervisor approval completeness dashboard',
        ownerRoles: ['Supervisor', 'Payroll Administrator', 'Controller'],
        sourceOfTruth: 'labor_approvals plus timekeeping timesheet review fields',
        coverageChecks: [
          {
            name: 'Exception report covers hourly and salaried time',
            routeOrService: 'server/src/services/supervisorApprovalExceptionReportService.ts',
            evidence: 'Report identifies missing supervisor approval, stale approval, self approval, unsigned finalized time, and exported batches with exceptions.',
            requiredForClosure: true,
          },
          {
            name: 'Admin dashboard exposes approval queue',
            routeOrService: 'client/src/pages/timekeeping/TimeClockAdminPage.tsx',
            evidence: 'Timekeeping admin page surfaces submitted time, WAD-linked approval rows, and DCAA exception reporting.',
            requiredForClosure: true,
          },
        ],
        requiredAuditEvents: ['LABOR_APPROVED', 'DAILY_APPROVED', 'TIMEKEEPING_SUPERVISOR_EXCEPTION_REVIEWED'],
        lockoutOrBlockerBehavior: 'Period close must treat unresolved critical approval exceptions as close blockers.',
      },
    ],
    readinessExitCriteria: [
      'Supervisors can see what is waiting, stale, self-approved, or finalized without approval.',
      'Payroll can quantify exception rows, affected employees, hours at risk, and exported batches with exceptions.',
      'Critical exceptions are actionable before payroll export or accounting close.',
    ],
  },
  {
    domain: 'PERIOD_CLOSE_LOCK_REOPEN',
    objective: 'Make period close a hard financial control with reopen reason, actor, audit event, and coverage checks before final lock.',
    controls: [
      {
        name: 'Period-close hard lock and reopen workflow coverage checks',
        ownerRoles: ['Controller', 'Accounting Administrator', 'Owner'],
        sourceOfTruth: 'accounting_periods, payroll_export_batches, audit_events',
        coverageChecks: [
          {
            name: 'Accounting period status is controlled',
            routeOrService: 'server/src/routes/chartOfAccounts.ts#PATCH /periods/:year/:month',
            evidence: 'Accounting period transitions require reason, accounting admin authority, closed/reopened actor fields, and ACCOUNTING_PERIOD_STATUS_CHANGED audit events.',
            requiredForClosure: true,
          },
          {
            name: 'Correction reopen path is audited',
            routeOrService: 'server/src/services/timekeeping/corrections.service.ts and server/src/routes/timekeeping/salariedTimesheets.ts#reopen',
            evidence: 'Timesheet reopen requests retain original snapshots, reason, reviewer, and recertification requirement.',
            requiredForClosure: true,
          },
          {
            name: 'Audit evidence template exists',
            routeOrService: 'server/src/services/auditReportingService.ts',
            evidence: 'Period close and reopen history is part of saved DCAA audit evidence templates.',
            requiredForClosure: true,
          },
        ],
        requiredAuditEvents: ['ACCOUNTING_PERIOD_STATUS_CHANGED', 'PERIOD_CLOSE', 'PERIOD_REOPEN', 'PAYROLL_PERIOD_LOCKED'],
        lockoutOrBlockerBehavior: 'FINAL_LOCKED periods must block journal, payroll, and timesheet mutations unless reopened through the approved workflow.',
      },
    ],
    readinessExitCriteria: [
      'Close checks verify certification, supervisor approval, payroll export, and unresolved corrections before hard lock.',
      'Every reopen requires controller-level reason and records the before/after state.',
      'Locked-period writes fail fast and point users to the reopen/correction path.',
    ],
  },
  {
    domain: 'NCR_CAPA_EXPANSION',
    objective: 'Expand nonconformance and CAPA handling into a closed-loop quality workflow with root cause, containment, effectiveness, and audit evidence.',
    controls: [
      {
        name: 'NCR/CAPA expansion',
        ownerRoles: ['Quality Manager', 'Production Supervisor', 'Director of Operations'],
        sourceOfTruth: 'nonconformance_records, capa_records, traveler_events, approval_requests',
        coverageChecks: [
          {
            name: 'CAPA records are permission controlled',
            routeOrService: 'server/src/routes/quality.ts#/capa',
            evidence: 'CAPA creation and update require quality.manage_capa and retain due dates, owners, root cause, corrective action, preventive action, and effectiveness notes.',
            requiredForClosure: true,
          },
          {
            name: 'Traveler quality failures force NCR before signoff',
            routeOrService: 'server/src/routes/travelers.ts',
            evidence: 'QC failed task gate blocks traveler step signoff until an NCR is raised.',
            requiredForClosure: true,
          },
          {
            name: 'NCR disposition is an approval-governed Phase 1 domain',
            routeOrService: 'server/src/services/phase1FoundationClosure.ts',
            evidence: 'NCR_DISPOSITION is registered with owner roles and approval decision route coverage.',
            requiredForClosure: true,
          },
        ],
        requiredAuditEvents: ['NCR_CREATED', 'NCR_DISPOSITION', 'CAPA_CREATED', 'CAPA_EFFECTIVENESS_VERIFIED'],
        lockoutOrBlockerBehavior: 'Open critical NCRs or overdue CAPAs should block shipment, receipt closeout, or traveler completion when the affected scope matches.',
      },
    ],
    readinessExitCriteria: [
      'NCRs link to affected order, traveler, lot, supplier, or receipt scope.',
      'CAPA records include root cause, containment, corrective action, preventive action, owner, due date, and effectiveness verification.',
      'Open NCR/CAPA blockers are visible before shipment or closeout.',
    ],
  },
  {
    domain: 'CALIBRATION_LOCKOUT',
    objective: 'Track calibrated tools and measuring equipment with evidence, due dates, failure events, and automatic lockout from production use.',
    controls: [
      {
        name: 'Calibration management and lockout',
        ownerRoles: ['Quality Manager', 'Maintenance', 'Production Supervisor'],
        sourceOfTruth: 'calibration_assets and calibration_events',
        coverageChecks: [
          {
            name: 'Calibration assets are permission controlled',
            routeOrService: 'server/src/routes/quality.ts#/calibration/assets',
            evidence: 'Calibration asset creation/update requires quality.manage_calibration and stores status, due date, lockout reason, and evidence URL.',
            requiredForClosure: true,
          },
          {
            name: 'Failed calibration locks out the asset',
            routeOrService: 'server/src/routes/quality.ts#POST /calibration/assets/:id/events',
            evidence: 'Failing calibration events set status to locked_out, capture lockout reason, and stamp locked_out_at.',
            requiredForClosure: true,
          },
        ],
        requiredAuditEvents: ['CALIBRATION_ASSET_CREATED', 'CALIBRATION_EVENT_RECORDED', 'CALIBRATION_ASSET_LOCKED_OUT'],
        lockoutOrBlockerBehavior: 'Expired or failed calibration assets must be unavailable for production, inspection, and shipment signoff until a passing event restores active status.',
      },
    ],
    readinessExitCriteria: [
      'Every inspection-critical tool has asset tag, owner, due date, status, and current evidence.',
      'Failed or expired calibration automatically locks the asset out from quality/production use.',
      'Lockout and release history is retained for audit and customer quality evidence.',
    ],
  },
];

export function getPhase3DcaaQualityMaturity(): Phase3MaturityDomainCoverage[] {
  return PHASE3_DCAA_QUALITY_MATURITY;
}

export function getPhase3DcaaQualitySummary(domains = PHASE3_DCAA_QUALITY_MATURITY) {
  const controls = domains.flatMap((domain) => domain.controls);
  const checks = controls.flatMap((control) => control.coverageChecks);
  const auditEvents = controls.flatMap((control) => control.requiredAuditEvents);

  return {
    domainCount: domains.length,
    controlCount: controls.length,
    requiredCoverageCheckCount: checks.filter((check) => check.requiredForClosure).length,
    auditEventCount: new Set(auditEvents).size,
    hasDailyEmployeeTimeCertification: domains.some((item) => item.domain === 'DAILY_TIME_CERTIFICATION'),
    hasSupervisorApprovalCompletenessDashboard: domains.some((item) => item.domain === 'SUPERVISOR_APPROVAL_DASHBOARDS'),
    hasPeriodCloseHardLockReopenChecks: domains.some((item) => item.domain === 'PERIOD_CLOSE_LOCK_REOPEN'),
    hasNcrCapaExpansion: domains.some((item) => item.domain === 'NCR_CAPA_EXPANSION'),
    hasCalibrationManagementLockout: domains.some((item) => item.domain === 'CALIBRATION_LOCKOUT'),
  };
}
