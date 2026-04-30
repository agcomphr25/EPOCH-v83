import { pool } from '../../db';

export type ForensicSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ForensicEvidence {
  employeeId?: number | null;
  employeeName?: string | null;
  workDate?: string | null;
  punchedAt?: string | null;
  timesheetId?: string | null;
  punchId?: string | null;
  certifiedAt?: string | null;
  hoursRecorded?: number | null;
  chargeCode?: string | null;
  editNote?: string | null;
  [key: string]: unknown;
}

export interface ForensicViolation {
  entityId: string;
  description: string;
  evidence: ForensicEvidence;
}

export interface ForensicRule {
  ruleId: string;
  domain: string;
  severity: ForensicSeverity;
  description: string;
  expectedCondition: string;
  failureCondition: string;
  farCitation: string;
  remediationGuidance: string;
  entityType: string;
  /** True when the rule is enforced at write time — violations are blocked before they occur. Historical violations may still appear in findings. */
  enforcedAtWriteTime?: boolean;
  /** Human-readable note describing how write-time enforcement works for this rule. */
  enforcementNote?: string;
  execute: () => Promise<ForensicViolation[]>;
}

async function safeQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    const rows = await pool.query(sql, params);
    return rows as T[];
  } catch (err: any) {
    console.error('[ForensicEngine] safeQuery failed:', err?.message ?? err);
    throw err;
  }
}

export const timekeepingForensicRules: ForensicRule[] = [
  {
    ruleId: 'TK-001',
    domain: 'TIMEKEEPING',
    severity: 'critical',
    description: 'Time record edited after supervisor approval — post-approval modification is a DCAA material deficiency.',
    expectedCondition: 'All edited punch_ledger entries have no audit_events edit record (PUNCH_EDITED/PUNCH_MODIFIED) timestamped after the linked labor_approval.approved_at for the same employee+work order.',
    failureCondition: 'A punch_ledger entry has is_edited=true AND either updated_at > labor_approval.approved_at OR an audit_events edit-class event for the same punch is timestamped after the approval.',
    farCitation: 'FAR 31.201-2(d)',
    remediationGuidance: 'Lock all time records once a supervisor has approved them. Any correction must go through the formal amendment workflow with re-approval.',
    entityType: 'punch_ledger',
    enforcedAtWriteTime: true,
    enforcementNote: 'The punch_ledger enforces immutability via is_edited flag and edit_note requirement. New violations are blocked at write time; findings below reflect historical pre-enforcement records only.',
    execute: async (): Promise<ForensicViolation[]> => {
      // Cross-reference labor_approvals (approval timestamp) with audit_events (edit timestamp)
      // to detect edits that occurred after the supervisor approved the session.
      const rows = await safeQuery<{
        id: string;
        employee_id: number;
        clock_in: string;
        name: string | null;
        approved_at: string;
        edit_event_at: string | null;
      }>(`
        SELECT DISTINCT
          pl.id::text,
          pl.employee_id,
          pl.clock_in,
          e.name,
          la.approved_at::text,
          ae_edit.timestamp::text AS edit_event_at
        FROM punch_ledger pl
        JOIN employees e ON e.id = pl.employee_id
        INNER JOIN labor_approvals la
          ON la.employee_id = pl.employee_id::text
          AND la.production_work_order_id = pl.production_work_order_id
          AND la.approved_at IS NOT NULL
        LEFT JOIN audit_events ae_edit
          ON ae_edit.entity_type = 'time_entry'
          AND ae_edit.entity_id = pl.id::text
          AND ae_edit.action IN ('PUNCH_EDITED', 'PUNCH_MODIFIED', 'TIME_ENTRY_EDITED', 'ENTRY_UPDATED')
          AND ae_edit.timestamp > la.approved_at
        WHERE pl.is_edited = true
          AND (
            pl.updated_at > la.approved_at
            OR ae_edit.id IS NOT NULL
          )
      `);
      return rows.map(r => {
        const workDate = r.clock_in ? r.clock_in.split('T')[0] : null;
        const editSource = r.edit_event_at
          ? `audit trail event at ${r.edit_event_at}`
          : `record updated_at after approval`;
        return {
          entityId: r.id,
          description: `Punch ledger entry ${r.id} (employee ${r.employee_id}${r.name ? ` — ${r.name}` : ''}, ${r.clock_in}) was edited after supervisor approval (approved_at: ${r.approved_at}; detected via ${editSource}).`,
          evidence: {
            punchId: r.id,
            employeeId: r.employee_id,
            employeeName: r.name,
            punchedAt: r.clock_in,
            workDate,
            editNote: r.edit_event_at ? `audit event at ${r.edit_event_at}` : null,
          },
        };
      });
    },
  },

  {
    ruleId: 'TK-002',
    domain: 'TIMEKEEPING',
    severity: 'high',
    description: 'Unsigned finalized timesheet — employee self-certified (DAILY_CERTIFIED) but no supervisor-level labor_approvals sign-off covers the work date, meaning management has not formally accepted the time record.',
    expectedCondition: 'Every DAILY_CERTIFIED audit event for a past date has at least one labor_approvals record (approved_at IS NOT NULL) covering a session from that employee on that date.',
    failureCondition: 'An audit_events DAILY_CERTIFIED entry exists for a past work date AND no labor_approvals record with approved_at IS NOT NULL exists for that employee and any of their punch_ledger sessions on that date.',
    farCitation: 'FAR 31.201-2(c)',
    remediationGuidance: 'Supervisors must review and formally approve daily time records in the Labor Approvals module after employees complete daily sign-off. Unsigned sheets may not be billed to government contracts.',
    entityType: 'daily_certification',
    execute: async (): Promise<ForensicViolation[]> => {
      // Detect "finalized but unsigned by supervisor":
      //   Source 1 (audit_events): DAILY_CERTIFIED events are the primary signal that an
      //     employee has self-attested their time for a given date.
      //   Source 2 (labor_approvals): approved_at IS NOT NULL is the supervisor-acceptance
      //     signal, since supervisor approvals do not generate separate audit_events entries
      //     in the current system (labor_approvals is the authoritative supervisor record).
      // Only work-order days are flagged: overhead-only days have no work order to approve
      // against and so cannot have a labor_approvals record by definition.
      const rows = await safeQuery<{
        employee_id: number | null;
        work_date: string;
        name: string | null;
        certified_at: string;
      }>(`
        SELECT
          ae.actor_id AS employee_id,
          ae.meta->>'workDate' AS work_date,
          ae.actor_name AS name,
          ae.timestamp::text AS certified_at
        FROM audit_events ae
        WHERE ae.entity_type = 'time_entry'
          AND ae.action = 'DAILY_CERTIFIED'
          AND ae.meta->>'workDate' IS NOT NULL
          AND (ae.meta->>'workDate')::date < CURRENT_DATE
          AND EXISTS (
            -- Only flag if there is at least one work-order session on this date
            -- (overhead-only days have no supervisor approval requirement)
            SELECT 1 FROM punch_ledger pl
            WHERE pl.employee_id::text = ae.actor_id::text
              AND pl.clock_out IS NOT NULL
              AND pl.labor_class = 'REGULAR'
              AND pl.production_work_order_id IS NOT NULL
              AND DATE(pl.clock_in AT TIME ZONE 'UTC') = (ae.meta->>'workDate')::date
          )
          AND NOT EXISTS (
            -- No supervisor has approved any work-order session for this employee+date
            SELECT 1
            FROM labor_approvals la
            INNER JOIN punch_ledger pl
              ON pl.employee_id::text = la.employee_id
              AND pl.production_work_order_id = la.production_work_order_id
            WHERE la.employee_id = ae.actor_id::text
              AND la.approved_at IS NOT NULL
              AND DATE(pl.clock_in AT TIME ZONE 'UTC') = (ae.meta->>'workDate')::date
          )
        ORDER BY work_date DESC
        LIMIT 500
      `);
      return rows.map(r => ({
        entityId: `unsigned-timesheet-${r.employee_id}-${r.work_date}`,
        description: `Employee ${r.employee_id}${r.name ? ` (${r.name})` : ''} self-certified their time on ${r.work_date} (certified at ${r.certified_at}) but no supervisor labor approval covers this date — timesheet is unsigned by management.`,
        evidence: {
          employeeId: r.employee_id,
          employeeName: r.name,
          workDate: r.work_date,
          certifiedAt: r.certified_at,
        },
      }));
    },
  },

  {
    ruleId: 'TK-003',
    domain: 'TIMEKEEPING',
    severity: 'critical',
    description: 'Self-approval detected — an employee approved their own labor record or a DAILY_CERTIFIED audit actor is the same identity as the labor_approvals approved_by, violating segregation-of-duties.',
    expectedCondition: 'approved_by in labor_approvals is always a different identity from employee_id, and no audit_events approval actor matches the session employee.',
    failureCondition: 'A labor_approvals record has approved_by = employee_id, OR an audit_events DAILY_CERTIFIED actor_id appears as approved_by in a labor_approvals record for the same employee — same actor approving their own time.',
    farCitation: 'FAR 31.201-2(c)',
    remediationGuidance: 'Enforce a rule in the approval workflow that approved_by must differ from employee_id. Display an error and block self-approvals.',
    entityType: 'labor_approval',
    execute: async (): Promise<ForensicViolation[]> => {
      // Primary check: labor_approvals table where approved_by = employee_id (same identity).
      // Secondary cross-reference: audit_events DAILY_CERTIFIED events where the actor who
      // self-certified (actor_id) also appears as the approved_by in a labor_approvals record
      // for the same employee — detects cases where one actor acted as both employee and approver.
      const rows = await safeQuery<{
        id: string;
        employee_id: string;
        approved_by: string;
        approved_at: string | null;
        name: string | null;
        detection_source: string;
      }>(`
        SELECT
          la.id::text,
          la.employee_id,
          la.approved_by,
          la.approved_at::text,
          e.name,
          'labor_approvals_table' AS detection_source
        FROM labor_approvals la
        LEFT JOIN employees e ON e.id::text = la.employee_id
        WHERE la.approved_by IS NOT NULL
          AND la.approved_by = la.employee_id

        UNION

        SELECT DISTINCT
          la.id::text,
          la.employee_id,
          la.approved_by,
          la.approved_at::text,
          e.name,
          'audit_events_actor_cross_check' AS detection_source
        FROM audit_events ae
        INNER JOIN labor_approvals la
          ON la.employee_id = ae.actor_id::text
          AND la.approved_by = ae.actor_id::text
        LEFT JOIN employees e ON e.id::text = la.employee_id
        WHERE ae.entity_type = 'time_entry'
          AND ae.action = 'DAILY_CERTIFIED'
          AND la.approved_by IS NOT NULL
          AND la.approved_by = la.employee_id
      `);
      return rows.map(r => ({
        entityId: r.id,
        description: `Labor approval ${r.id} (employee ${r.employee_id}${r.name ? ` — ${r.name}` : ''}) was approved by the same employee who owns it — self-approval detected via ${r.detection_source}.`,
        evidence: {
          timesheetId: r.id,
          employeeId: r.employee_id ? Number(r.employee_id) : null,
          employeeName: r.name,
          certifiedAt: r.approved_at,
        },
      }));
    },
  },

  {
    ruleId: 'TK-004',
    domain: 'TIMEKEEPING',
    severity: 'high',
    description: 'Edited punch missing edit reason — DCAA requires documented justification for every time record modification.',
    expectedCondition: 'Every punch_ledger entry with is_edited=true has a non-empty edit_note.',
    failureCondition: 'A punch_ledger entry has is_edited=true AND (edit_note IS NULL OR trim(edit_note)="").',
    farCitation: 'FAR 31.201-2(d)',
    remediationGuidance: 'Make the edit_note field mandatory whenever is_edited is set to true. Reject edits submitted without a reason through the API.',
    entityType: 'punch_ledger',
    enforcedAtWriteTime: true,
    enforcementNote: 'PUT/PATCH to any punch_ledger entry is rejected at write time with HTTP 400 if edit_note is missing or empty [DCAA Rule TK-004]. New violations are impossible going forward; findings below reflect historical pre-enforcement records only.',
    execute: async (): Promise<ForensicViolation[]> => {
      const rows = await safeQuery<{
        id: string;
        employee_id: number;
        clock_in: string;
        name: string | null;
      }>(`
        SELECT pl.id::text, pl.employee_id, pl.clock_in, e.name
        FROM punch_ledger pl
        JOIN employees e ON e.id = pl.employee_id
        WHERE pl.is_edited = true
          AND (pl.edit_note IS NULL OR trim(pl.edit_note) = '')
      `);
      return rows.map(r => {
        const workDate = r.clock_in ? r.clock_in.split('T')[0] : null;
        return {
          entityId: r.id,
          description: `Punch ledger entry ${r.id} (employee ${r.employee_id}${r.name ? ` — ${r.name}` : ''}, ${r.clock_in}) was edited but has no edit reason documented.`,
          evidence: {
            punchId: r.id,
            employeeId: r.employee_id,
            employeeName: r.name,
            punchedAt: r.clock_in,
            workDate,
            editNote: null,
          },
        };
      });
    },
  },

  {
    ruleId: 'TK-005',
    domain: 'TIMEKEEPING',
    severity: 'high',
    description: 'Edited punch with no corresponding audit trail entry — DCAA forensic review requires every edit to appear in the immutable audit log.',
    expectedCondition: 'Every punch_ledger entry with is_edited=true has at least one matching audit_events row with an edit-class action.',
    failureCondition: 'A punch_ledger entry has is_edited=true AND no audit_events record exists for (entity_type="time_entry", entity_id=entry.id) with action in (PUNCH_EDITED, PUNCH_MODIFIED, TIME_ENTRY_EDITED, ENTRY_UPDATED).',
    farCitation: 'FAR 31.201-2(d)',
    remediationGuidance: 'Ensure the punch edit endpoint always writes an audit_events record. Add an application-level guard to enforce this invariant.',
    entityType: 'punch_ledger',
    enforcedAtWriteTime: true,
    enforcementNote: 'All punch_ledger writes are wrapped in a database transaction — the audit_events entry is written atomically with the data change. New violations are impossible going forward; findings below reflect historical pre-enforcement records only.',
    execute: async (): Promise<ForensicViolation[]> => {
      const rows = await safeQuery<{
        id: string;
        employee_id: number;
        clock_in: string;
        name: string | null;
      }>(`
        SELECT pl.id::text, pl.employee_id, pl.clock_in, e.name
        FROM punch_ledger pl
        JOIN employees e ON e.id = pl.employee_id
        WHERE pl.is_edited = true
          AND NOT EXISTS (
            SELECT 1 FROM audit_events ae
            WHERE ae.entity_type = 'time_entry'
              AND ae.entity_id = pl.id::text
              AND ae.action IN ('PUNCH_EDITED', 'PUNCH_MODIFIED', 'TIME_ENTRY_EDITED', 'ENTRY_UPDATED')
          )
      `);
      return rows.map(r => {
        const workDate = r.clock_in ? r.clock_in.split('T')[0] : null;
        return {
          entityId: r.id,
          description: `Punch ledger entry ${r.id} (employee ${r.employee_id}${r.name ? ` — ${r.name}` : ''}, ${r.clock_in}) is marked edited but has no audit trail record.`,
          evidence: {
            punchId: r.id,
            employeeId: r.employee_id,
            employeeName: r.name,
            punchedAt: r.clock_in,
            workDate,
          },
        };
      });
    },
  },

  {
    ruleId: 'TK-006',
    domain: 'TIMEKEEPING',
    severity: 'medium',
    description: 'Daily time certification (contemporaneous recording) — employees must certify their time each day via the guided daily sign-off flow. This rule flags certifications recorded more than 1 business day after the work date.',
    expectedCondition: 'Every DAILY_CERTIFIED audit_events entry has timestamp no later than the next business day after the work date stored in meta.workDate.',
    failureCondition: 'A DAILY_CERTIFIED audit_events entry has timestamp::date > next-business-day deadline computed from meta.workDate (Fri→Mon+3, Sat→Mon+2, Sun→Mon+1, Mon–Thu→+1).',
    farCitation: 'FAR 31.201-2(c)',
    remediationGuidance: 'Employees are prompted to certify daily via the Daily Labor Timesheets page. Supervisors can monitor daily certification status on the admin dashboard (DCAA TK-006 panel).',
    entityType: 'daily_certification',
    execute: async (): Promise<ForensicViolation[]> => {
      const rows = await safeQuery<{
        id: string;
        actor_id: number | null;
        actor_name: string | null;
        certified_at: string;
        work_date: string;
      }>(`
        SELECT
          ae.id::text,
          ae.actor_id,
          ae.actor_name,
          ae.timestamp::text AS certified_at,
          ae.meta->>'workDate' AS work_date
        FROM audit_events ae
        WHERE ae.entity_type = 'time_entry'
          AND ae.action = 'DAILY_CERTIFIED'
          AND ae.meta->>'workDate' IS NOT NULL
          AND ae.timestamp::date > (
            (ae.meta->>'workDate')::date + CASE
              WHEN EXTRACT(DOW FROM (ae.meta->>'workDate')::date) = 5 THEN 3
              WHEN EXTRACT(DOW FROM (ae.meta->>'workDate')::date) = 6 THEN 2
              WHEN EXTRACT(DOW FROM (ae.meta->>'workDate')::date) = 0 THEN 1
              ELSE 1
            END
          )
      `);
      return rows.map(r => ({
        entityId: r.id,
        description: `Daily certification (employee ${r.actor_id ?? 'unknown'}${r.actor_name ? ` — ${r.actor_name}` : ''}, work date ${r.work_date}) was certified on ${r.certified_at} — beyond the 1 business day contemporaneous entry requirement.`,
        evidence: {
          timesheetId: r.id,
          employeeId: r.actor_id,
          employeeName: r.actor_name,
          workDate: r.work_date,
          certifiedAt: r.certified_at,
        },
      }));
    },
  },

  {
    ruleId: 'TK-007',
    domain: 'TIMEKEEPING',
    severity: 'medium',
    description: 'Excessive daily hours — employee recorded more than 12 hours on a single calendar day, which may indicate data entry error or labor mischarging.',
    expectedCondition: 'Total REGULAR hours per employee per calendar day <= 12.',
    failureCondition: 'Aggregate of closed REGULAR punch_ledger sessions for an employee on one calendar day exceeds 12 hours.',
    farCitation: 'FAR 31.201-2(b)',
    remediationGuidance: 'Add a validation rule that prevents clocking out when daily hours would exceed 12 without a supervisor override and documented explanation.',
    entityType: 'daily_timesheet',
    execute: async (): Promise<ForensicViolation[]> => {
      const rows = await safeQuery<{
        employee_id: number;
        work_date: string;
        total_hours: number;
        name: string | null;
      }>(`
        SELECT
          pl.employee_id,
          DATE(pl.clock_in AT TIME ZONE 'UTC')::text AS work_date,
          SUM(EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) / 3600.0)::float AS total_hours,
          e.name
        FROM punch_ledger pl
        JOIN employees e ON e.id = pl.employee_id
        WHERE pl.clock_out IS NOT NULL
          AND pl.labor_class = 'REGULAR'
        GROUP BY pl.employee_id, DATE(pl.clock_in AT TIME ZONE 'UTC'), e.name
        HAVING SUM(EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) / 3600.0) > 12
        ORDER BY total_hours DESC
        LIMIT 500
      `);
      return rows.map(r => ({
        entityId: `daily-hours-${r.employee_id}-${r.work_date}`,
        description: `Employee ${r.employee_id}${r.name ? ` (${r.name})` : ''} on ${r.work_date} recorded ${Number(r.total_hours).toFixed(2)} hours — exceeds the 12-hour daily threshold.`,
        evidence: {
          employeeId: r.employee_id,
          employeeName: r.name,
          workDate: r.work_date,
          hoursRecorded: Number(r.total_hours),
        },
      }));
    },
  },

  {
    ruleId: 'TK-008',
    domain: 'TIMEKEEPING',
    severity: 'high',
    description: 'Invalid or inactive charge code usage — labor recorded against a charge code that is inactive or not in the authoritative charge code registry.',
    expectedCondition: 'Every punch_ledger entry with a non-null charge_code references an active record in public.charge_codes.',
    failureCondition: 'A punch_ledger entry has charge_code IS NOT NULL AND no matching active record in public.charge_codes (code=punch.charge_code AND active=true).',
    farCitation: 'FAR 31.201-2(c)',
    remediationGuidance: 'Historical violations: review and correct the charge_code on affected entries via admin correction with edit note. New violations are blocked at clock-in by the DCAA TK-008 enforcement gate.',
    entityType: 'punch_ledger',
    execute: async (): Promise<ForensicViolation[]> => {
      const rows = await safeQuery<{
        id: string;
        employee_id: number;
        charge_code: string;
        clock_in: string;
        name: string | null;
      }>(`
        SELECT pl.id::text, pl.employee_id, pl.charge_code, pl.clock_in, e.name
        FROM punch_ledger pl
        JOIN employees e ON e.id = pl.employee_id
        WHERE pl.charge_code IS NOT NULL
          AND trim(pl.charge_code) != ''
          AND NOT EXISTS (
            SELECT 1 FROM charge_codes cc
            WHERE cc.code = pl.charge_code
              AND cc.active = true
          )
      `);
      return rows.map(r => {
        const workDate = r.clock_in ? r.clock_in.split('T')[0] : null;
        return {
          entityId: r.id,
          description: `Punch ledger entry ${r.id} (employee ${r.employee_id}${r.name ? ` — ${r.name}` : ''}, ${r.clock_in}) references charge code '${r.charge_code}' which is inactive or not in the charge code registry.`,
          evidence: {
            punchId: r.id,
            employeeId: r.employee_id,
            employeeName: r.name,
            punchedAt: r.clock_in,
            workDate,
            chargeCode: r.charge_code,
          },
        };
      });
    },
  },

  {
    ruleId: 'TK-009',
    domain: 'TIMEKEEPING',
    severity: 'critical',
    description: 'Unauthorized project charging — labor charged to a charge code that requires approval but has no active labor authorization on file.',
    expectedCondition: 'Every punch_ledger entry against a charge code with requires_approval=true has at least one active labor_approvals record for that employee+work_order scope.',
    failureCondition: 'A punch_ledger entry has charge_code referencing a charge_codes record with requires_approval=true AND no labor_approvals exists for (employee_id, production_work_order_id).',
    farCitation: 'FAR 52.215-2(d)',
    remediationGuidance: 'Historical violations: work with the program office to create a retroactive labor authorization or re-charge to an authorized code via an admin correction. New violations are blocked at clock-in by the DCAA TK-009 enforcement gate.',
    entityType: 'punch_ledger',
    execute: async (): Promise<ForensicViolation[]> => {
      const rows = await safeQuery<{
        id: string;
        employee_id: number;
        charge_code: string;
        clock_in: string;
        auth_count: string;
        name: string | null;
      }>(`
        SELECT
          pl.id::text,
          pl.employee_id,
          pl.charge_code,
          pl.clock_in,
          COUNT(la.id)::text AS auth_count,
          e.name
        FROM punch_ledger pl
        JOIN employees e ON e.id = pl.employee_id
        INNER JOIN charge_codes cc
          ON cc.code = pl.charge_code
          AND cc.active = true
          AND cc.requires_approval = true
        LEFT JOIN labor_approvals la
          ON la.employee_id = pl.employee_id::text
          AND la.production_work_order_id = pl.production_work_order_id
        WHERE pl.charge_code IS NOT NULL
          AND pl.production_work_order_id IS NOT NULL
        GROUP BY pl.id, pl.employee_id, pl.charge_code, pl.clock_in, e.name
        HAVING COUNT(la.id) = 0
      `);
      return rows.map(r => {
        const workDate = r.clock_in ? r.clock_in.split('T')[0] : null;
        return {
          entityId: r.id,
          description: `Punch ledger entry ${r.id} (employee ${r.employee_id}${r.name ? ` — ${r.name}` : ''}, ${r.clock_in}) charges to '${r.charge_code}' which requires authorization — no active labor authorization exists for this employee + work order.`,
          evidence: {
            punchId: r.id,
            employeeId: r.employee_id,
            employeeName: r.name,
            punchedAt: r.clock_in,
            workDate,
            chargeCode: r.charge_code,
          },
        };
      });
    },
  },
];
