import { Router, type Request, type Response, type NextFunction } from 'express';
import { pool } from '../../db';
import { authenticateToken } from '../../middleware/auth';
import { recordAuditEvent } from '../services/auditLedgerService';

type EvidenceNodeType =
  | 'project'
  | 'period'
  | 'work_order'
  | 'employee'
  | 'labor_cost'
  | 'payroll'
  | 'journal'
  | 'audit'
  | 'document'
  | 'missing';

type EvidenceNodeStatus = 'ok' | 'warning' | 'missing' | 'sensitive';

type EvidenceLink = {
  label: string;
  href: string;
  kind: 'app' | 'api';
};

type EvidenceNode = {
  id: string;
  type: EvidenceNodeType;
  label: string;
  subtitle?: string | null;
  status: EvidenceNodeStatus;
  sensitivity?: 'employee_rate' | 'normal';
  metrics?: Record<string, string | number | null>;
  details?: Record<string, unknown>;
  links?: EvidenceLink[];
  missingEvidence?: string[];
};

type EvidenceEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  status: EvidenceNodeStatus;
};

type JournalLineEvidence = {
  journal_entry_id: number;
  account_name: string | null;
  account_number: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  allowability: string | null;
  direct_indirect: string | null;
  cost_pool: string | null;
};

const router = Router();

function requireGlennj(req: Request, res: Response, next: NextFunction) {
  const username = (req.user?.username ?? '').trim().toLowerCase().replace(/^@/, '');
  if (username !== 'glennj') {
    return res.status(403).json({ error: 'Transaction evidence map is currently restricted to glennj.' });
  }
  return next();
}

function parsePeriod(req: Request) {
  const period = typeof req.query.period === 'string' ? req.query.period : '';
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return { year, month, label: period };
  }

  const year = Number(req.query.periodYear);
  const month = Number(req.query.periodMonth);
  if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
    return { year, month, label: `${year}-${String(month).padStart(2, '0')}` };
  }

  return null;
}

function money(value: unknown) {
  const numberValue = Number(value ?? 0);
  return numberValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function hours(value: unknown) {
  return Number(value ?? 0).toFixed(2);
}

function addNode(nodes: Map<string, EvidenceNode>, node: EvidenceNode) {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function addEdge(edges: EvidenceEdge[], edge: EvidenceEdge) {
  if (!edges.some((existing) => existing.id === edge.id)) edges.push(edge);
}

router.get('/transaction-evidence-map', authenticateToken, requireGlennj, async (req: Request, res: Response) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
  const period = parsePeriod(req);

  if (!projectId) return res.status(400).json({ error: 'projectId is required' });
  if (!period) return res.status(400).json({ error: 'period must be YYYY-MM' });

  try {
    const projectRows = await pool.query<{
      id: string;
      project_code: string;
      project_name: string;
      customer_id: string;
      customer_name_snapshot: string | null;
      status: string | null;
      default_charge_code_id: number | null;
      created_at: string | null;
    }>(
      `SELECT id, project_code, project_name, customer_id, customer_name_snapshot, status,
              default_charge_code_id, created_at
       FROM projects
       WHERE id = $1::uuid
       LIMIT 1`,
      [projectId],
    );
    const project = projectRows[0];
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const laborRows = await pool.query<{
      id: number;
      epoch_employee_id: number | null;
      employee_code: string | null;
      employee_name: string | null;
      department: string | null;
      job_title: string | null;
      canonical_id: string | null;
      source_punch_canonical_id: string | null;
      clock_in: string;
      clock_out: string;
      hours_worked: string;
      rate_used: string;
      dollar_cost: string;
      cost_type: string;
      rate_source: string;
      charge_code_id: number | null;
      charge_code: string | null;
      charge_code_description: string | null;
      production_work_order_id: string | null;
      work_order_number: string | null;
      traveler_id: string | null;
      journal_entry_id: number | null;
      journal_status: string | null;
      journal_memo: string | null;
      journal_effective_date: string | null;
      payroll_batch_ids: number[] | null;
    }>(
      `WITH payroll_batches AS (
         SELECT
           jsonb_array_elements_text(source_timesheet_ids)::int AS timesheet_id,
           array_agg(id ORDER BY revision_number) AS batch_ids
         FROM timekeeping.payroll_export_batches
         WHERE status IN ('active', 'processed')
         GROUP BY 1
       )
       SELECT
         lcr.id,
         lcr.epoch_employee_id,
         e.employee_code,
         e.name AS employee_name,
         COALESCE(lcr.department_code, e.department) AS department,
         e.job_title,
         lcr.canonical_id,
         lcr.source_punch_canonical_id,
         lcr.clock_in,
         lcr.clock_out,
         lcr.hours_worked,
         lcr.rate_used,
         lcr.dollar_cost,
         lcr.cost_type,
         lcr.rate_source,
         lcr.charge_code_id,
         cc.code AS charge_code,
         cc.description AS charge_code_description,
         lcr.production_work_order_id,
         pwo.work_order_number,
         lcr.traveler_id,
         lcr.journal_entry_id,
         je.status AS journal_status,
         je.memo AS journal_memo,
         je.effective_date AS journal_effective_date,
         pb.batch_ids AS payroll_batch_ids
       FROM labor_cost_records lcr
       LEFT JOIN employees e ON e.id = lcr.epoch_employee_id
       LEFT JOIN charge_codes cc ON cc.id = lcr.charge_code_id
       LEFT JOIN production_work_orders pwo ON pwo.id = lcr.production_work_order_id
       LEFT JOIN journal_entries je ON je.id = lcr.journal_entry_id
       LEFT JOIN timekeeping.salaried_timesheet_lines stl
         ON lcr.canonical_id = ('stl-' || stl.timesheet_id || '-' || stl.id)
       LEFT JOIN payroll_batches pb ON pb.timesheet_id = stl.timesheet_id
       WHERE lcr.project_id = $1::uuid
         AND lcr.period_year = $2
         AND lcr.period_month = $3
       ORDER BY lcr.clock_in ASC, e.name NULLS LAST, lcr.id ASC`,
      [projectId, period.year, period.month],
    );

    const journalIds = Array.from(new Set(laborRows.map((r) => r.journal_entry_id).filter((id): id is number => id != null)));
    const laborRecordIds = laborRows.map((r) => String(r.id));
    const workOrderIds = Array.from(new Set(laborRows.map((r) => r.production_work_order_id).filter((id): id is string => !!id)));
    const employeeIds = Array.from(new Set(laborRows.map((r) => r.epoch_employee_id).filter((id): id is number => id != null)));

    const journalLines: JournalLineEvidence[] = journalIds.length
      ? await pool.query<JournalLineEvidence>(
          `SELECT jl.journal_entry_id, coa.account_name, coa.account_number,
                  jl.debit_amount, jl.credit_amount, jl.allowability,
                  jl.direct_indirect, jl.cost_pool
           FROM journal_lines jl
           LEFT JOIN chart_of_accounts coa ON coa.id = jl.account_id
           WHERE jl.journal_entry_id = ANY($1::int[])
           ORDER BY jl.journal_entry_id, jl.id`,
          [journalIds],
        )
      : [];

    const projectDocs = await pool.query<{
      id: number;
      label: string | null;
      original_file_name: string;
      mime_type: string | null;
      file_size: number | null;
      created_at: string | null;
    }>(
      `SELECT id, label, original_file_name, mime_type, file_size, created_at
       FROM project_documents
       WHERE project_id = $1::uuid
       ORDER BY created_at DESC`,
      [projectId],
    ).catch(() => []);

    const auditRows = await pool.query<{
      id: number;
      action: string;
      subject_type: string | null;
      subject_id: string | null;
      entity_type: string | null;
      entity_id: string | null;
      actor_name: string | null;
      row_hash: string | null;
      sequence_number: number | null;
      occurred_at: string | null;
      created_at: string | null;
    }>(
      `SELECT id, action, subject_type, subject_id, entity_type, entity_id, actor_name,
              row_hash, sequence_number, occurred_at, created_at
       FROM audit_events
       WHERE
         (subject_type = 'project' AND subject_id = $1)
         OR (entity_type = 'project' AND entity_id = $1)
         OR (subject_type IN ('labor_cost_record', 'labor_cost_records') AND subject_id = ANY($2::text[]))
         OR (entity_type IN ('labor_cost_record', 'labor_cost_records') AND entity_id = ANY($2::text[]))
         OR (subject_type IN ('journal_entry', 'journal_entries') AND subject_id = ANY($3::text[]))
         OR (entity_type IN ('journal_entry', 'journal_entries') AND entity_id = ANY($3::text[]))
         OR (subject_type IN ('production_work_order', 'production_work_orders') AND subject_id = ANY($4::text[]))
         OR (entity_type IN ('production_work_order', 'production_work_orders') AND entity_id = ANY($4::text[]))
         OR (actor_id = ANY($5::int[]) AND action IN ('DAILY_CERTIFIED', 'DAILY_SUPERVISOR_APPROVED', 'TIME_CERTIFIED_ADMIN'))
       ORDER BY COALESCE(occurred_at, created_at) DESC
       LIMIT 250`,
      [projectId, laborRecordIds, journalIds.map(String), workOrderIds, employeeIds],
    );

    const linesByJournal = new Map<number, JournalLineEvidence[]>();
    for (const line of journalLines) {
      const bucket = linesByJournal.get(line.journal_entry_id) ?? [];
      bucket.push(line);
      linesByJournal.set(line.journal_entry_id, bucket);
    }

    const nodes = new Map<string, EvidenceNode>();
    const edges: EvidenceEdge[] = [];

    addNode(nodes, {
      id: `project:${project.id}`,
      type: 'project',
      label: project.project_code,
      subtitle: project.project_name,
      status: 'ok',
      metrics: {
        customer: project.customer_name_snapshot ?? project.customer_id,
        status: project.status,
      },
      details: project,
      links: [{ label: 'Open project', href: `/projects/${project.id}`, kind: 'app' }],
      missingEvidence: projectDocs.length ? [] : ['No project-level documents are attached.'],
    });

    addNode(nodes, {
      id: `period:${period.label}`,
      type: 'period',
      label: period.label,
      subtitle: 'Payroll / accounting period',
      status: laborRows.length ? 'ok' : 'missing',
      metrics: {
        laborRecords: laborRows.length,
        laborDollars: money(laborRows.reduce((sum, row) => sum + Number(row.dollar_cost ?? 0), 0)),
        hours: hours(laborRows.reduce((sum, row) => sum + Number(row.hours_worked ?? 0), 0)),
      },
      missingEvidence: laborRows.length ? [] : ['No labor cost records found for this project and period.'],
    });
    addEdge(edges, {
      id: `project:${project.id}->period:${period.label}`,
      from: `project:${project.id}`,
      to: `period:${period.label}`,
      label: 'selected period',
      status: laborRows.length ? 'ok' : 'missing',
    });

    for (const doc of projectDocs) {
      const docId = `document:project:${doc.id}`;
      addNode(nodes, {
        id: docId,
        type: 'document',
        label: doc.label || doc.original_file_name,
        subtitle: doc.mime_type,
        status: 'ok',
        details: doc,
        links: [{ label: 'Open evidence', href: `/api/projects/${project.id}/documents/${doc.id}/file`, kind: 'api' }],
      });
      addEdge(edges, {
        id: `project:${project.id}->${docId}`,
        from: `project:${project.id}`,
        to: docId,
        label: 'attached document',
        status: 'ok',
      });
    }

    for (const row of laborRows) {
      if (row.production_work_order_id) {
        const workOrderId = `work_order:${row.production_work_order_id}`;
        addNode(nodes, {
          id: workOrderId,
          type: 'work_order',
          label: row.work_order_number || 'WAD',
          subtitle: row.production_work_order_id,
          status: 'ok',
          details: {
            productionWorkOrderId: row.production_work_order_id,
            travelerId: row.traveler_id,
          },
        });
        addEdge(edges, {
          id: `period:${period.label}->${workOrderId}`,
          from: `period:${period.label}`,
          to: workOrderId,
          label: 'WAD labor',
          status: 'ok',
        });
      }

      const employeeId = row.epoch_employee_id ? `employee:${row.epoch_employee_id}` : `employee:unknown:${row.id}`;
      addNode(nodes, {
        id: employeeId,
        type: 'employee',
        label: row.employee_name || 'Unknown employee',
        subtitle: [row.employee_code, row.department, row.job_title].filter(Boolean).join(' | '),
        status: 'sensitive',
        sensitivity: 'employee_rate',
        metrics: {
          rateUsed: money(row.rate_used),
          rateSource: row.rate_source,
        },
        details: {
          employeeId: row.epoch_employee_id,
          employeeCode: row.employee_code,
          department: row.department,
          jobTitle: row.job_title,
        },
      });

      const laborId = `labor:${row.id}`;
      const laborMissing = [
        row.journal_entry_id ? null : 'No linked journal entry.',
        row.source_punch_canonical_id || row.canonical_id ? null : 'No source punch/timesheet canonical id.',
        row.charge_code_id ? null : 'No charge code.',
      ].filter((item): item is string => !!item);
      addNode(nodes, {
        id: laborId,
        type: 'labor_cost',
        label: `Labor cost #${row.id}`,
        subtitle: `${hours(row.hours_worked)} hrs | ${money(row.dollar_cost)} | ${row.cost_type}`,
        status: laborMissing.length ? 'warning' : 'ok',
        sensitivity: 'employee_rate',
        metrics: {
          hours: Number(row.hours_worked),
          rateUsed: money(row.rate_used),
          dollarCost: money(row.dollar_cost),
          costType: row.cost_type,
          chargeCode: row.charge_code,
        },
        details: row,
        missingEvidence: laborMissing,
      });

      addEdge(edges, {
        id: `${employeeId}->${laborId}`,
        from: employeeId,
        to: laborId,
        label: 'worked',
        status: laborMissing.length ? 'warning' : 'ok',
      });

      addEdge(edges, {
        id: `${row.production_work_order_id ? `work_order:${row.production_work_order_id}` : `period:${period.label}`}->${laborId}`,
        from: row.production_work_order_id ? `work_order:${row.production_work_order_id}` : `period:${period.label}`,
        to: laborId,
        label: 'costed to',
        status: laborMissing.length ? 'warning' : 'ok',
      });

      for (const batchId of row.payroll_batch_ids ?? []) {
        const payrollId = `payroll:${batchId}`;
        addNode(nodes, {
          id: payrollId,
          type: 'payroll',
          label: `Payroll batch #${batchId}`,
          subtitle: 'Export evidence',
          status: 'ok',
          links: [{ label: 'Open payroll export', href: `/api/timekeeping/admin/payroll/batches/${batchId}/download?evidenceOnly=true`, kind: 'api' }],
        });
        addEdge(edges, {
          id: `${laborId}->${payrollId}`,
          from: laborId,
          to: payrollId,
          label: 'exported in',
          status: 'ok',
        });
      }

      if (row.journal_entry_id) {
        const journalId = `journal:${row.journal_entry_id}`;
        const linkedLines = linesByJournal.get(row.journal_entry_id) ?? [];
        addNode(nodes, {
          id: journalId,
          type: 'journal',
          label: `Journal entry #${row.journal_entry_id}`,
          subtitle: row.journal_status || 'Unknown status',
          status: row.journal_status === 'POSTED' ? 'ok' : 'warning',
          metrics: {
            status: row.journal_status,
            debitTotal: money(linkedLines.reduce((sum, line) => sum + Number(line.debit_amount ?? 0), 0)),
            creditTotal: money(linkedLines.reduce((sum, line) => sum + Number(line.credit_amount ?? 0), 0)),
          },
          details: {
            memo: row.journal_memo,
            effectiveDate: row.journal_effective_date,
            lines: linkedLines,
          },
          missingEvidence: row.journal_status === 'POSTED' ? [] : ['Journal entry is not POSTED.'],
        });
        addEdge(edges, {
          id: `${laborId}->${journalId}`,
          from: laborId,
          to: journalId,
          label: 'posted to GL',
          status: row.journal_status === 'POSTED' ? 'ok' : 'warning',
        });
      }
    }

    for (const audit of auditRows) {
      const auditId = `audit:${audit.id}`;
      addNode(nodes, {
        id: auditId,
        type: 'audit',
        label: audit.action,
        subtitle: `Seq ${audit.sequence_number ?? 'n/a'} | ${audit.actor_name ?? 'system'}`,
        status: audit.row_hash ? 'ok' : 'warning',
        metrics: {
          sequence: audit.sequence_number,
          hash: audit.row_hash ? `${audit.row_hash.slice(0, 12)}...` : null,
        },
        details: audit,
        links: [{ label: 'Open audit ledger', href: `/admin/audit-ledger?subjectType=${encodeURIComponent(audit.subject_type ?? audit.entity_type ?? '')}&subjectId=${encodeURIComponent(audit.subject_id ?? audit.entity_id ?? '')}`, kind: 'app' }],
      });

      let parentId = `project:${project.id}`;
      if (audit.subject_type?.includes('journal') && audit.subject_id) parentId = `journal:${audit.subject_id}`;
      if (audit.entity_type?.includes('journal') && audit.entity_id) parentId = `journal:${audit.entity_id}`;
      if (audit.subject_type?.includes('labor') && audit.subject_id) parentId = `labor:${audit.subject_id}`;
      if (audit.entity_type?.includes('labor') && audit.entity_id) parentId = `labor:${audit.entity_id}`;
      if (audit.subject_type?.includes('production_work_order') && audit.subject_id) parentId = `work_order:${audit.subject_id}`;
      if (audit.entity_type?.includes('production_work_order') && audit.entity_id) parentId = `work_order:${audit.entity_id}`;

      if (nodes.has(parentId)) {
        addEdge(edges, {
          id: `${parentId}->${auditId}`,
          from: parentId,
          to: auditId,
          label: 'audit event',
          status: audit.row_hash ? 'ok' : 'warning',
        });
      }
    }

    const totalHours = laborRows.reduce((sum, row) => sum + Number(row.hours_worked ?? 0), 0);
    const totalLaborDollars = laborRows.reduce((sum, row) => sum + Number(row.dollar_cost ?? 0), 0);
    const missingEvidence = Array.from(nodes.values()).flatMap((node) =>
      (node.missingEvidence ?? []).map((message) => ({ nodeId: node.id, nodeLabel: node.label, message })),
    );

    await recordAuditEvent({
      eventType: 'TRANSACTION_EVIDENCE_MAP_VIEWED',
      subjectType: 'project',
      subjectId: project.id,
      sourceService: 'transactionEvidenceMap.route',
      actor: { id: req.user?.id, username: req.user?.username, role: req.user?.role },
      payload: {
        projectId: project.id,
        period: period.label,
        nodeCount: nodes.size,
        edgeCount: edges.length,
        laborRecordCount: laborRows.length,
        totalHours,
        totalLaborDollars,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    }).catch((err) => console.error('[transaction-evidence-map] audit write failed', err));

    return res.json({
      generatedAt: new Date().toISOString(),
      project,
      period,
      summary: {
        laborRecordCount: laborRows.length,
        employeeCount: employeeIds.length,
        workOrderCount: workOrderIds.length,
        journalEntryCount: journalIds.length,
        documentCount: projectDocs.length,
        auditEventCount: auditRows.length,
        totalHours: Number(totalHours.toFixed(4)),
        totalLaborDollars: Number(totalLaborDollars.toFixed(2)),
        missingEvidenceCount: missingEvidence.length,
      },
      nodes: Array.from(nodes.values()),
      edges,
      missingEvidence,
    });
  } catch (err) {
    console.error('[transaction-evidence-map] failed', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to build evidence map' });
  }
});

export default router;
