import { Router, Request, Response } from 'express';
import { 
  insertVendorPOSchema, 
  insertVendorPOItemSchema, 
  insertVendorPOSettingsSchema,
  insertOptionalSettingSchema,
  insertPOOptionalSettingSchema,
  procurementComplianceEffectiveDates,
  auditEvents,
} from '@shared/schema';
import { z } from 'zod';
import { storage } from '../../storage';
import { requirePermission } from '../../middleware/requirePermission';
import { sendCommunication } from '../../communication/send';
import { db, queryRows } from '../../db';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import {
  appendUniqueEmail,
  DEFAULT_VENDOR_PO_RETURN_EMAIL,
  resolveVendorPoContactName,
  resolveVendorPoReturnEmail,
} from '../../utils/vendorPoContact';
import {
  getVendorQualificationBlockers,
  emitProcurementLedgerEvent,
  hasCurrentVendorMasterApproval,
} from '../services/procurementControlsService';
import { recordAuditEvent } from '../services/auditLedgerService';
import { sendApiError } from '../../utils/apiErrors';
import { generateVendorPoPdf } from '../../utils/pdf/vendorPoPdf';

const router = Router();

// Temporary operational override: purchasing leadership is transitioning, so
// vendor PO issuance must not be blocked by procurement/compliance gates.
const VENDOR_PO_ISSUE_GATES_DEACTIVATED = true;

type VendorPoAuditOptions = {
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  fieldsChanged?: Record<string, { before: unknown; after: unknown }> | null;
  meta?: Record<string, any> | null;
};

const VENDOR_PO_AUDIT_SUBJECT = 'vendor_po';

function getRequestActor(req: Request) {
  const user: any = (req as any).user;
  return {
    id: null,
    username: user?.fullName || user?.username || user?.email || null,
    role: user?.role || null,
  };
}

function normalizeAuditReason(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requireAuditReason(value: unknown, actionLabel: string): string {
  const reason = normalizeAuditReason(value);
  if (reason.length < 10) {
    const err: any = new Error(`${actionLabel} requires a reason of at least 10 characters for the audit trail.`);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return reason;
}

function buildFieldChanges(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
  candidateFields?: string[],
): Record<string, { before: unknown; after: unknown }> | null {
  if (!before || !after) return null;
  const fields = candidateFields ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of fields) {
    const beforeValue = before[field] ?? null;
    const afterValue = after[field] ?? null;
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[field] = { before: beforeValue, after: afterValue };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

function summarizeVendorPO(po: Record<string, any> | null | undefined) {
  if (!po) return null;
  return {
    id: po.id,
    poNumber: po.poNumber ?? null,
    vendorId: po.vendorId ?? null,
    vendorName: po.vendorName ?? null,
    status: po.status ?? null,
    externalPoNumber: po.externalPoNumber ?? null,
    expectedDeliveryDate: po.expectedDeliveryDate ?? null,
    archived: po.archived ?? null,
  };
}

async function recordVendorPoAudit(
  req: Request,
  vendorPoId: number,
  action: string,
  options: VendorPoAuditOptions = {},
) {
  const beforeSummary = summarizeVendorPO(options.before ?? null);
  const afterSummary = summarizeVendorPO(options.after ?? null);
  const meta = {
    ...(options.meta ?? {}),
    vendorPoId,
    actorUserId: (req as any).user?.id ?? null,
    poNumber: (options.after as any)?.poNumber ?? (options.before as any)?.poNumber ?? null,
    vendorId: (options.after as any)?.vendorId ?? (options.before as any)?.vendorId ?? null,
    status: (options.after as any)?.status ?? (options.before as any)?.status ?? null,
  };

  await recordAuditEvent({
    eventType: action,
    subjectType: VENDOR_PO_AUDIT_SUBJECT,
    subjectId: String(vendorPoId),
    sourceService: 'vendorPOs.route',
    actor: getRequestActor(req),
    reason: options.reason ?? null,
    fieldsChanged: options.fieldsChanged ?? null,
    meta,
    payload: {
      vendorPoId,
      action,
      reason: options.reason ?? null,
      before: beforeSummary,
      after: afterSummary,
      fieldsChanged: (options.fieldsChanged ?? null) as any,
      meta,
    },
    entityType: VENDOR_PO_AUDIT_SUBJECT,
    entityId: String(vendorPoId),
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });
}

async function markLinkedPartsRequestsOrdered(vendorPoId: number, actor: string) {
  const updated = await queryRows<{ id: number; status: string }>(
    `
    UPDATE parts_requests
       SET status = 'ORDERED',
           order_date = COALESCE(order_date, NOW()),
           qty_ordered = GREATEST(COALESCE(qty_ordered, 0), quantity),
           updated_at = NOW()
     WHERE vendor_po_id = $1
       AND status = 'APPROVED'
     RETURNING id, status
    `,
    [vendorPoId]
  );

  if (updated.length === 0) return;

  await queryRows(
    `
    INSERT INTO parts_request_status_history (parts_request_id, from_status, to_status, changed_by, reason)
    SELECT unnest($1::int[]), 'APPROVED', 'ORDERED', $2, $3
    `,
    [
      updated.map((row) => row.id),
      actor,
      `Linked Vendor PO #${vendorPoId} was issued.`,
    ]
  );
}

async function markLinkedPartsRequestsReceivedForPo(vendorPoId: number, actor: string) {
  const updated = await queryRows<{ id: number; previous_status: string; next_status: string }>(
    `
    WITH po_totals AS (
      SELECT
        pr.id,
        pr.status AS previous_status,
        pr.quantity,
        COALESCE(SUM(vpi.received_quantity), 0)::float AS received_qty
      FROM parts_requests pr
      JOIN vendor_po_items vpi
        ON vpi.vendor_po_id = pr.vendor_po_id
       AND (
         (pr.ag_part_number IS NOT NULL AND vpi.ag_part_number = pr.ag_part_number)
         OR (pr.ag_part_number IS NULL AND vpi.description = pr.part_name)
       )
      WHERE pr.vendor_po_id = $1
        AND pr.status IN ('ORDERED', 'ORDERED_PARTIAL', 'RECEIVED_PARTIAL')
      GROUP BY pr.id, pr.status, pr.quantity
    ),
    next_values AS (
      SELECT
        id,
        previous_status,
        LEAST(quantity, FLOOR(received_qty)::int) AS qty_received,
        CASE
          WHEN received_qty >= quantity THEN 'RECEIVED'
          WHEN received_qty > 0 THEN 'RECEIVED_PARTIAL'
          ELSE previous_status
        END AS next_status
      FROM po_totals
      WHERE received_qty > 0
    )
    UPDATE parts_requests pr
       SET qty_received = next_values.qty_received,
           status = next_values.next_status,
           actual_delivery = CASE WHEN next_values.next_status = 'RECEIVED' THEN CURRENT_DATE ELSE pr.actual_delivery END,
           updated_at = NOW()
      FROM next_values
     WHERE pr.id = next_values.id
       AND pr.status <> next_values.next_status
    RETURNING pr.id, next_values.previous_status, next_values.next_status
    `,
    [vendorPoId]
  );

  if (updated.length === 0) return;

  await queryRows(
    `
    INSERT INTO parts_request_status_history (parts_request_id, from_status, to_status, changed_by, reason)
    SELECT id, previous_status, next_status, $2, $3
      FROM jsonb_to_recordset($1::jsonb) AS x(id int, previous_status text, next_status text)
    `,
    [
      JSON.stringify(updated),
      actor,
      `Linked Vendor PO #${vendorPoId} receipt updated the parts request automatically.`,
    ]
  );
}

let vendorPOReadSchemaReady: Promise<void> | null = null;

function ensureVendorPOReadSchema(): Promise<void> {
  if (!vendorPOReadSchemaReady) {
    vendorPOReadSchemaReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS company_settings (
          id serial PRIMARY KEY,
          company_name text,
          company_address text,
          company_phone text,
          company_email text,
          company_website text,
          company_logo_url text,
          company_logo_filename text,
          company_logo_mimetype text,
          created_at timestamp DEFAULT now() NOT NULL,
          updated_at timestamp DEFAULT now() NOT NULL
        )
      `);

      await db.execute(sql`
        ALTER TABLE company_settings
          ADD COLUMN IF NOT EXISTS company_name text,
          ADD COLUMN IF NOT EXISTS company_address text,
          ADD COLUMN IF NOT EXISTS company_phone text,
          ADD COLUMN IF NOT EXISTS company_email text,
          ADD COLUMN IF NOT EXISTS company_website text,
          ADD COLUMN IF NOT EXISTS company_logo_url text,
          ADD COLUMN IF NOT EXISTS company_logo_filename text,
          ADD COLUMN IF NOT EXISTS company_logo_mimetype text,
          ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now(),
          ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vendor_po_settings (
          id serial PRIMARY KEY,
          contact_name text,
          contact_title text,
          contact_phone text,
          contact_email text,
          terms_and_conditions text,
          payment_terms text,
          shipping_instructions text,
          created_at timestamp DEFAULT now() NOT NULL,
          updated_at timestamp DEFAULT now() NOT NULL
        )
      `);

      await db.execute(sql`
        ALTER TABLE vendor_po_settings
          ADD COLUMN IF NOT EXISTS contact_name text,
          ADD COLUMN IF NOT EXISTS contact_title text,
          ADD COLUMN IF NOT EXISTS contact_phone text,
          ADD COLUMN IF NOT EXISTS contact_email text,
          ADD COLUMN IF NOT EXISTS terms_and_conditions text,
          ADD COLUMN IF NOT EXISTS payment_terms text,
          ADD COLUMN IF NOT EXISTS shipping_instructions text,
          ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now(),
          ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS optional_settings (
          id serial PRIMARY KEY,
          name text NOT NULL,
          statement text NOT NULL,
          sort_order integer DEFAULT 0,
          is_active boolean DEFAULT true NOT NULL,
          created_at timestamp DEFAULT now() NOT NULL,
          updated_at timestamp DEFAULT now() NOT NULL
        )
      `);

      await db.execute(sql`
        ALTER TABLE optional_settings
          ADD COLUMN IF NOT EXISTS name text,
          ADD COLUMN IF NOT EXISTS statement text,
          ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
          ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now(),
          ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS po_optional_settings (
          id serial PRIMARY KEY,
          vendor_po_id integer,
          optional_setting_id integer,
          created_at timestamp DEFAULT now()
        )
      `);

      await db.execute(sql`
        ALTER TABLE po_optional_settings
          ADD COLUMN IF NOT EXISTS vendor_po_id integer,
          ADD COLUMN IF NOT EXISTS optional_setting_id integer,
          ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()
      `);

      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS po_optional_settings_unique_idx
          ON po_optional_settings(vendor_po_id, optional_setting_id)
      `);

      await db.execute(sql`
        DO $$
        BEGIN
          IF to_regclass('public.vendor_pos') IS NOT NULL THEN
            ALTER TABLE vendor_pos
              ADD COLUMN IF NOT EXISTS external_po_number text,
              ADD COLUMN IF NOT EXISTS production_line text,
              ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS parent_po_id integer,
              ADD COLUMN IF NOT EXISTS change_reason text,
              ADD COLUMN IF NOT EXISTS is_current_revision boolean NOT NULL DEFAULT true,
              ADD COLUMN IF NOT EXISTS revised_at timestamp,
              ADD COLUMN IF NOT EXISTS revised_by text,
              ADD COLUMN IF NOT EXISTS issued_without_email boolean NOT NULL DEFAULT false,
              ADD COLUMN IF NOT EXISTS issued_without_email_reason text,
              ADD COLUMN IF NOT EXISTS issued_without_email_at timestamp,
              ADD COLUMN IF NOT EXISTS rfq_outcome_notes text,
              ADD COLUMN IF NOT EXISTS vendor_confirmed_at timestamp,
              ADD COLUMN IF NOT EXISTS vendor_confirmed_action text,
              ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
              ADD COLUMN IF NOT EXISTS requisition_id integer,
              ADD COLUMN IF NOT EXISTS competition_method text,
              ADD COLUMN IF NOT EXISTS sole_source_justification text,
              ADD COLUMN IF NOT EXISTS direct_po_exception_approved_by_id integer,
              ADD COLUMN IF NOT EXISTS direct_po_exception_approved_by_name text,
              ADD COLUMN IF NOT EXISTS direct_po_exception_reason text,
              ADD COLUMN IF NOT EXISTS direct_po_exception_approved_at timestamp;
          END IF;

          IF to_regclass('public.vendor_po_items') IS NOT NULL THEN
            ALTER TABLE vendor_po_items
              ADD COLUMN IF NOT EXISTS received_quantity real DEFAULT 0,
              ADD COLUMN IF NOT EXISTS purchase_qty real,
              ADD COLUMN IF NOT EXISTS purchase_unit_price real,
              ADD COLUMN IF NOT EXISTS purchase_unit text,
              ADD COLUMN IF NOT EXISTS pricing_unit text,
              ADD COLUMN IF NOT EXISTS vendor_unit text,
              ADD COLUMN IF NOT EXISTS conversion_factor real,
              ADD COLUMN IF NOT EXISTS customer_po_id integer,
              ADD COLUMN IF NOT EXISTS project_id uuid,
              ADD COLUMN IF NOT EXISTS production_work_order_id uuid,
              ADD COLUMN IF NOT EXISTS charge_code_id integer,
              ADD COLUMN IF NOT EXISTS other_identifier text,
              ADD COLUMN IF NOT EXISTS historical_avg_price real,
              ADD COLUMN IF NOT EXISTS price_variance_percent real,
              ADD COLUMN IF NOT EXISTS variance_flag boolean DEFAULT false;

            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'vendor_po_items'
                AND column_name = 'customer_po_id'
                AND data_type <> 'integer'
            ) THEN
              ALTER TABLE vendor_po_items
                ALTER COLUMN customer_po_id TYPE integer
                USING CASE
                  WHEN customer_po_id::text ~ '^[0-9]+$' THEN customer_po_id::integer
                  ELSE NULL
                END;
            END IF;

            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'vendor_po_items'
                AND column_name = 'received_quantity'
                AND data_type = 'integer'
            ) THEN
              ALTER TABLE vendor_po_items
                ALTER COLUMN received_quantity TYPE real
                USING received_quantity::real;
            END IF;
          END IF;
        END $$;
      `);
    })().catch((err) => {
      vendorPOReadSchemaReady = null;
      throw err;
    });
  }
  return vendorPOReadSchemaReady;
}

router.use(async (_req, res, next) => {
  try {
    await ensureVendorPOReadSchema();
    next();
  } catch (error) {
    console.error('[VendorPO] Schema readiness check failed:', error);
    res.status(503).json({ error: 'Vendor PO database is preparing, please retry' });
  }
});

function isP2ProductionLine(value: unknown): boolean {
  return String(value ?? '').trim().toUpperCase() === 'P2';
}

async function getVendorPOComplianceBlockers(vendorPoId: number): Promise<string[]> {
  const review = await storage.getVendorPOComplianceReview(vendorPoId);
  if (!review) {
    return ['P2 purchase requires a completed compliance review before it can be allocated to a project'];
  }

  const blockers: string[] = [];
  if (review.reviewStatus === 'requires_attention') {
    blockers.push('Compliance review requires attention because the PO changed after review');
  } else if (review.reviewStatus !== 'reviewed') {
    blockers.push(`Compliance review status is "${review.reviewStatus}" and must be "reviewed"`);
  }
  if (!review.secondPartyComplete) blockers.push('Second-party approval is not complete');
  if (!review.vendorApproved) blockers.push('Vendor is not approved');
  if (!review.reviewNotes?.trim()) blockers.push('Compliance justification is missing');
  return blockers;
}

type IssueReadinessSection = {
  key: string;
  label: string;
  status: 'pass' | 'fail' | 'not_applicable';
  blockers: string[];
  details?: Record<string, unknown>;
};

async function buildVendorPOIssueReadiness(vendorPO: any): Promise<{
  vendorPoId: number;
  vendorId: number | null;
  vendorName: string | null;
  productionLine: string | null;
  isP2: boolean;
  ready: boolean;
  sections: IssueReadinessSection[];
}> {
  const isP2 = isP2ProductionLine(vendorPO.productionLine);
  const { db: drizzleDb } = await import('../../db');
  const {
    purchaseRequisitions,
    vendorPoFarFlowdowns,
    vendorDebarmentChecks,
    procurementSettings,
    vendors,
  } = await import('../../schema');
  const { eq: dEq, and: dAnd, gte: dGte, desc: dDesc, sql: dSql } = await import('drizzle-orm');

  const vendorId = Number(vendorPO.vendorId);
  const [vendor] = Number.isFinite(vendorId)
    ? await drizzleDb.select().from(vendors).where(dEq(vendors.id, vendorId)).limit(1)
    : [];

  const [setting] = await drizzleDb.select().from(procurementSettings).limit(1);
  const freshnessDays = setting?.debarmentCheckFreshnessDays ?? 30;
  const cutoff = new Date(Date.now() - freshnessDays * 86_400_000);
  const freshDebarment = Number.isFinite(vendorId)
    ? await drizzleDb.select().from(vendorDebarmentChecks).where(dAnd(
      dEq(vendorDebarmentChecks.vendorId, vendorId),
      dGte(vendorDebarmentChecks.checkedAt, cutoff),
      dEq(vendorDebarmentChecks.result, 'pass'),
    )).orderBy(dDesc(vendorDebarmentChecks.checkedAt)).limit(1)
    : [];

  const vendorMasterBlockers: string[] = [];
  let approvedSameNameVendors: Array<{ id: number; name: string }> = [];
  if (!vendor) {
    vendorMasterBlockers.push('Vendor record not found');
  } else {
    if (vendor.isActive === false) vendorMasterBlockers.push('Vendor is inactive');
    const vendorMasterApproved = hasCurrentVendorMasterApproval(vendor);
    if (!vendorMasterApproved) {
      approvedSameNameVendors = await drizzleDb
        .select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(dSql`
          LOWER(${vendors.name}) = LOWER(${vendor.name})
          AND ${vendors.isActive} IS DISTINCT FROM false
          AND (
            ${vendors.approved} = true
            OR (
              NULLIF(TRIM(${vendors.approvalLevel}), '') IS NOT NULL
              AND ${vendors.approvalExpiration} IS NOT NULL
              AND ${vendors.approvalExpiration} >= CURRENT_DATE
            )
          )
          AND ${vendors.id} <> ${vendor.id}
        `)
        .limit(5);
      if (approvedSameNameVendors.length > 0) {
        vendorMasterBlockers.push(
          `This PO is linked to vendor #${vendor.id}, which is not approved. Approved vendor record(s) with the same name: ${approvedSameNameVendors.map((v) => `#${v.id}`).join(', ')}`
        );
      } else {
        vendorMasterBlockers.push(`Vendor master record #${vendor.id} is not approved`);
      }
    }
    if (vendor.approvalExpiration && new Date(vendor.approvalExpiration) < new Date()) {
      vendorMasterBlockers.push(`Vendor approval expired on ${vendor.approvalExpiration}`);
    }
  }

  const supplierQualificationBlockers = await getVendorQualificationBlockers(
    vendorPO.id,
    vendorId,
    vendorPO.productionLine ?? null,
  );
  const scopeBlockers = supplierQualificationBlockers.filter((reason) =>
    reason.includes('scope') ||
    reason.includes('line items') ||
    reason.includes('outside the vendor')
  );

  const purchasingBlockers: string[] = [];
  if (vendorPO.requisitionId) {
    const [r] = await drizzleDb.select().from(purchaseRequisitions)
      .where(dEq(purchaseRequisitions.id, vendorPO.requisitionId));
    if (!r) purchasingBlockers.push('Linked requisition not found');
    else if (r.status !== 'APPROVED' && r.status !== 'CONVERTED_TO_PO') {
      purchasingBlockers.push(`Linked requisition must be APPROVED (currently ${r.status})`);
    }
  }
  if (!vendorPO.competitionMethod) {
    purchasingBlockers.push('Competition method must be recorded');
  }
  if (vendorPO.competitionMethod === 'sole-source' &&
      (!vendorPO.soleSourceJustification || vendorPO.soleSourceJustification.trim().length < 10)) {
    purchasingBlockers.push('Sole-source justification required');
  }
  const flowdowns = await drizzleDb.select().from(vendorPoFarFlowdowns)
    .where(dEq(vendorPoFarFlowdowns.vendorPoId, vendorPO.id));
  if (flowdowns.length === 0) {
    purchasingBlockers.push('FAR flowdown checklist has not been recorded for this PO');
  } else if (flowdowns.some((fd) => !fd.reasoning || fd.reasoning.trim().length < 3)) {
    purchasingBlockers.push('One or more FAR flowdown entries is missing applicability reasoning');
  }

  const complianceBlockers = isP2 ? await getVendorPOComplianceBlockers(vendorPO.id) : [];
  const sections: IssueReadinessSection[] = [
    {
      key: 'vendor_master',
      label: VENDOR_PO_ISSUE_GATES_DEACTIVATED ? 'Vendor Master Approval (deactivated)' : 'Vendor Master Approval',
      status: VENDOR_PO_ISSUE_GATES_DEACTIVATED ? 'not_applicable' : vendorMasterBlockers.length > 0 ? 'fail' : 'pass',
      blockers: VENDOR_PO_ISSUE_GATES_DEACTIVATED ? [] : vendorMasterBlockers,
      details: vendor ? {
        deactivatedForIssuance: VENDOR_PO_ISSUE_GATES_DEACTIVATED,
        deactivatedBlockers: vendorMasterBlockers,
        vendorId: vendor.id,
        vendorName: vendor.name,
        approved: hasCurrentVendorMasterApproval(vendor),
        rawApprovedFlag: vendor.approved,
        approvalLevel: vendor.approvalLevel ?? null,
        approvalExpiration: vendor.approvalExpiration ?? null,
        debarmentStatus: vendor.debarmentStatus ?? null,
        debarmentCheckedAt: vendor.debarmentCheckedAt ?? null,
        approvedSameNameVendors,
      } : {
        vendorId,
        deactivatedForIssuance: VENDOR_PO_ISSUE_GATES_DEACTIVATED,
        deactivatedBlockers: vendorMasterBlockers,
      },
    },
    {
      key: 'debarment',
      label: 'Debarment Check (deactivated)',
      status: 'not_applicable',
      blockers: [],
      details: {
        deactivated: true,
        deactivatedReason: 'Debarment check is temporarily not enforced on vendor PO issuance.',
        freshnessDays,
        latestPassingCheck: freshDebarment[0] ?? null,
      },
    },
    {
      key: 'supplier_scope',
      label: VENDOR_PO_ISSUE_GATES_DEACTIVATED ? 'Approved Supplier Scope (deactivated)' : 'Approved Supplier Scope',
      status: VENDOR_PO_ISSUE_GATES_DEACTIVATED ? 'not_applicable' : scopeBlockers.length > 0 ? 'fail' : 'pass',
      blockers: VENDOR_PO_ISSUE_GATES_DEACTIVATED ? [] : scopeBlockers,
      details: {
        deactivatedForIssuance: VENDOR_PO_ISSUE_GATES_DEACTIVATED,
        deactivatedBlockers: scopeBlockers,
      },
    },
    {
      key: 'purchasing_controls',
      label: VENDOR_PO_ISSUE_GATES_DEACTIVATED ? 'Purchasing Controls (deactivated)' : 'Purchasing Controls',
      status: VENDOR_PO_ISSUE_GATES_DEACTIVATED || !isP2 ? 'not_applicable' : purchasingBlockers.length > 0 ? 'fail' : 'pass',
      blockers: VENDOR_PO_ISSUE_GATES_DEACTIVATED || !isP2 ? [] : purchasingBlockers,
      details: {
        deactivatedForIssuance: VENDOR_PO_ISSUE_GATES_DEACTIVATED,
        deactivatedBlockers: purchasingBlockers,
        requisitionId: vendorPO.requisitionId ?? null,
        competitionMethod: vendorPO.competitionMethod ?? null,
        flowdownCount: flowdowns.length,
      },
    },
    {
      key: 'p2_compliance_review',
      label: VENDOR_PO_ISSUE_GATES_DEACTIVATED ? 'P2 Compliance Review (deactivated)' : 'P2 Compliance Review',
      status: VENDOR_PO_ISSUE_GATES_DEACTIVATED || !isP2 ? 'not_applicable' : complianceBlockers.length > 0 ? 'fail' : 'pass',
      blockers: VENDOR_PO_ISSUE_GATES_DEACTIVATED || !isP2 ? [] : complianceBlockers,
      details: {
        appliesToProductionLine: isP2,
        deactivatedForIssuance: VENDOR_PO_ISSUE_GATES_DEACTIVATED,
        deactivatedBlockers: complianceBlockers,
      },
    },
  ];

  return {
    vendorPoId: vendorPO.id,
    vendorId: vendor?.id ?? vendorId ?? null,
    vendorName: vendor?.name ?? vendorPO.vendorName ?? null,
    productionLine: vendorPO.productionLine ?? null,
    isP2,
    ready: sections.every((section) => section.status !== 'fail'),
    sections,
  };
}

function hasTraceabilityLink(data: Record<string, unknown>): boolean {
  return ['customerPoId', 'projectId', 'productionWorkOrderId', 'chargeCodeId'].some((key) => {
    const value = data[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
}

function numericValuesDiffer(next: unknown, current: unknown): boolean {
  const nextNumber = Number(next);
  const currentNumber = Number(current);
  if (!Number.isFinite(nextNumber) || !Number.isFinite(currentNumber)) {
    return next !== current;
  }
  return Math.abs(nextNumber - currentNumber) > 0.0001;
}

async function requireP2ComplianceBeforeProjectAllocation(
  vendorPoId: number,
  traceability: { customerPoId?: unknown; projectId?: unknown; productionWorkOrderId?: unknown }
) {
  if (VENDOR_PO_ISSUE_GATES_DEACTIVATED) return;

  const hasProjectAllocation =
    traceability.customerPoId !== undefined && traceability.customerPoId !== null ||
    traceability.projectId !== undefined && traceability.projectId !== null ||
    traceability.productionWorkOrderId !== undefined && traceability.productionWorkOrderId !== null;
  if (!hasProjectAllocation) return;
  const vendorPO = await storage.getVendorPO(vendorPoId);
  if (!vendorPO) {
    const error: any = new Error('Vendor PO not found');
    error.status = 404;
    throw error;
  }
  if (!isP2ProductionLine(vendorPO.productionLine)) return;

  const blockers = await getVendorPOComplianceBlockers(vendorPoId);
  if (blockers.length > 0) {
    const error: any = new Error(`Cannot allocate P2 vendor purchase to a project. Reason(s): ${blockers.join('; ')}.`);
    error.status = 422;
    error.blockingReasons = blockers;
    throw error;
  }
}

async function requireP2LineTraceability(vendorPoId: number, data: Record<string, unknown>) {
  const vendorPO = await storage.getVendorPO(vendorPoId);
  if (!isP2ProductionLine(vendorPO?.productionLine)) return;

  if (!hasTraceabilityLink(data)) {
    const error: any = new Error(
      'P2 vendor PO lines must include at least one traceability link: customer PO, project, WAD/work order, or charge code.'
    );
    error.status = 422;
    error.blockingReasons = [error.message];
    throw error;
  }
}

/**
 * Build the set of allowed recipient emails for a vendor:
 * primary email, additionalEmail, and all active vendor_contact emails.
 * Used to validate client-provided recipient lists server-side before sending.
 */
async function getAllowedVendorEmails(vendorId: number): Promise<Set<string>> {
  const vendor = await storage.getVendor(vendorId);
  const allowed = new Set<string>();
  if (vendor?.email) allowed.add(vendor.email.trim().toLowerCase());
  if (vendor?.additionalEmail) allowed.add(vendor.additionalEmail.trim().toLowerCase());
  const contacts = await storage.getVendorContacts(vendorId);
  for (const c of contacts) {
    if (c.email) allowed.add(c.email.trim().toLowerCase());
  }
  return allowed;
}

/**
 * Intersect a client-provided recipients array with the allowed set.
 * Returns only the emails that are genuinely allowed for this vendor.
 */
function filterAllowedRecipients(raw: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is string => typeof e === 'string')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => allowed.has(e));
}

function rowsFromDbResult<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

/**
 * Derive authoritative `to` and `cc` from the validated recipient selection.
 *
 * Rules:
 *  - If no valid selections → fall back to primaryEmail as `to`.
 *  - If primary is in the selection → use primaryEmail as `to`, rest go to CC.
 *  - If primary is NOT in the selection → first validated entry is `to`, rest go to CC.
 *  - standardCc entries (Vendor PO return contact, issuing user email) are merged into CC, deduped.
 */
function deriveToAndCc(
  rawRecipients: unknown,
  primaryEmail: string,
  allowedEmails: Set<string>,
  standardCc: string[]
): { to: string; cc: string[] } {
  const validated = filterAllowedRecipients(rawRecipients, allowedEmails);
  const primaryNorm = primaryEmail.trim().toLowerCase();

  if (validated.length === 0) {
    return { to: primaryEmail, cc: standardCc };
  }

  const to = validated.includes(primaryNorm) ? primaryEmail : validated[0];
  const toNorm = to.trim().toLowerCase();
  const extras = validated.filter((e) => e !== toNorm);

  const cc = [...standardCc];
  for (const email of extras) {
    if (!cc.map((c) => c.toLowerCase()).includes(email)) {
      cc.push(email);
    }
  }

  return { to, cc };
}

async function getVendorPoEmailRouting(userEmail?: string | null): Promise<{ returnEmail: string; cc: string[] }> {
  const settings = await storage.getVendorPOSettings();
  const returnEmail = resolveVendorPoReturnEmail(settings);
  const cc = appendUniqueEmail(
    appendUniqueEmail(appendUniqueEmail([], returnEmail), DEFAULT_VENDOR_PO_RETURN_EMAIL),
    userEmail
  );
  return { returnEmail, cc };
}

// Query params schema for list vendor POs
const listVendorPOsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(200),
  search: z.string().optional(),
  status: z.enum(['Draft', 'RFQ Sent', 'Quote Received', 'Declined', 'Expired', 'Sent', 'Partially Received', 'Fully Received', 'Cancelled', 'any']).default('any'),
  vendorId: z.coerce.number().int().positive().optional(),
  sort: z.string().default('createdAt:desc'),
  archived: z.enum(['true', 'false', 'any']).default('false'),
});

// GET /api/vendor-pos - List all vendor POs with filtering and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const params = listVendorPOsQuerySchema.parse(req.query);
    const archivedFilter = params.archived === 'any' ? undefined : params.archived === 'true';
    const result = await storage.getAllVendorPOs({ ...params, archived: archivedFilter });

    // Augment each PO with pendingReceiptCount (in-progress receipts tied to that PO)
    // and confirmationBadge (confirmed | awaiting | expired | no_link | null) in a single pass.
    //
    // Schema reference (magic_link_tokens): purpose text, metadata jsonb,
    // used_at timestamp, expires_at timestamp NOT NULL, created_at timestamp DEFAULT now()
    // — all columns confirmed present in migration 0000_shiny_amazoness.sql.
    //
    // Queries run independently via Promise.allSettled so a failure in one
    // (e.g. receipts or magic_link_tokens) does not suppress the other field.

    type ConfirmBadge = 'confirmed' | 'awaiting' | 'expired' | 'no_link' | null;
    type ComplianceStatusBadge = 'Pending Review' | 'Reviewed' | 'Blocked' | 'Requires Attention';
    type POShape = { id: number; status?: string };

    const [countResult, confirmResult, complianceResult] = await Promise.allSettled([
      db.execute(
        sql`SELECT vendor_po_id, COUNT(*)::int AS cnt
            FROM receipts
            WHERE vendor_po_id IS NOT NULL AND status = 'in_progress'
            GROUP BY vendor_po_id`
      ),
      db.execute(
        sql`SELECT DISTINCT ON ((metadata->>'vendorPoId')::int)
                  (metadata->>'vendorPoId')::int AS vendor_po_id,
                  used_at AS "usedAt",
                  expires_at AS "expiresAt"
            FROM magic_link_tokens
            WHERE purpose = 'retired_vendor_po_acknowledgement'
              AND metadata->>'vendorPoId' ~ '^\d+$'
            ORDER BY (metadata->>'vendorPoId')::int, created_at DESC`
      ),
      db.execute(
        sql`SELECT vendor_po_id, review_status, second_party_complete, vendor_approved, review_notes
            FROM vendor_po_compliance_reviews`
      ),
    ]);

    // Build receipt-count map (defaults to 0 on query failure)
    type CountRow = { vendor_po_id: number; cnt: number };
    const countMap: Record<number, number> = {};
    if (countResult.status === 'fulfilled') {
      const rows = rowsFromDbResult<CountRow>(countResult.value);
      for (const row of rows) {
        countMap[row.vendor_po_id] = Number(row.cnt);
      }
    } else {
      console.error('[VendorPO] Receipt count query failed:', countResult.reason);
    }

    // Build confirmation map (defaults to no_link for issued POs on query failure)
    type ConfirmRow = { vendor_po_id: number; usedAt: string | null; expiresAt: string };
    const confirmMap: Record<number, ConfirmBadge> = {};
    const confirmUsedAtMap: Record<number, string | null> = {};
    const confirmExpiresAtMap: Record<number, string | null> = {};
    if (confirmResult.status === 'fulfilled') {
      const cRows = rowsFromDbResult<ConfirmRow>(confirmResult.value);
      const now = new Date();
      for (const cr of cRows) {
        if (cr.vendor_po_id == null) continue;
        if (cr.usedAt) {
          confirmMap[cr.vendor_po_id] = 'confirmed';
          confirmUsedAtMap[cr.vendor_po_id] = cr.usedAt;
        } else if (cr.expiresAt && new Date(cr.expiresAt) < now) {
          confirmMap[cr.vendor_po_id] = 'expired';
        } else {
          confirmMap[cr.vendor_po_id] = 'awaiting';
        }
        if (cr.expiresAt) {
          confirmExpiresAtMap[cr.vendor_po_id] = cr.expiresAt;
        }
      }
    } else {
      console.error('[VendorPO] magic_link_tokens confirmation query failed:', confirmResult.reason);
    }

    // Build compliance status map
    type ComplianceRow = { vendor_po_id: number; review_status: string; second_party_complete: boolean; vendor_approved: boolean; review_notes: string | null };
    const complianceMap: Record<number, ComplianceStatusBadge> = {};
    if (complianceResult.status === 'fulfilled') {
      const cRows = rowsFromDbResult<ComplianceRow>(complianceResult.value);
      for (const cr of cRows) {
        if (cr.vendor_po_id == null) continue;
        if (cr.review_status === 'requires_attention') {
          complianceMap[cr.vendor_po_id] = 'Requires Attention';
        } else if (cr.review_status === 'blocked' || !cr.second_party_complete || !cr.vendor_approved) {
          complianceMap[cr.vendor_po_id] = 'Blocked';
        } else if (cr.review_status === 'reviewed') {
          complianceMap[cr.vendor_po_id] = 'Reviewed';
        } else {
          complianceMap[cr.vendor_po_id] = 'Requires Attention';
        }
      }
    } else {
      console.error('[VendorPO] Compliance review query failed:', complianceResult.reason);
    }

    const augment = (po: POShape & { productionLine?: string | null }) => {
      const isIssued = ['Sent', 'Partially Received', 'Fully Received'].includes(po.status ?? '');
      // Compliance review only gates P2 POs. For non-P2 lines (GENERAL/P1/R_AND_D)
      // we hide the badge entirely so a stale review left over from when the PO
      // was P2 doesn't show as "Blocked / Requires Attention". The DB row is left
      // intact so flipping back to P2 re-surfaces the prior state.
      const showCompliance = !VENDOR_PO_ISSUE_GATES_DEACTIVATED && isP2ProductionLine(po.productionLine);
      return {
        ...po,
        pendingReceiptCount: countMap[po.id] ?? 0,
        // null → non-issued PO (no badge shown)
        // 'no_link' → issued PO with no confirmation token on record
        confirmationBadge: (isIssued ? (confirmMap[po.id] ?? 'no_link') : null) as ConfirmBadge,
        confirmationUsedAt: isIssued ? (confirmUsedAtMap[po.id] ?? null) : null,
        confirmationExpiresAt: isIssued ? (confirmExpiresAtMap[po.id] ?? null) : null,
        // Compliance status badge: 'Pending Review' if no review exists; null when not a P2 PO
        complianceStatus: (showCompliance
          ? (complianceMap[po.id] ?? 'Pending Review')
          : null) as ComplianceStatusBadge | null,
      };
    };

    // result is either an array of POs or a paginated { data: PO[], total: number } object
    const resultObj = result as { data?: POShape[] } | POShape[];
    if (Array.isArray(resultObj)) {
      return res.json(resultObj.map(augment));
    }
    const paginated = resultObj as { data: POShape[]; [key: string]: unknown };
    if (Array.isArray(paginated.data)) {
      return res.json({ ...paginated, data: paginated.data.map(augment) });
    }
    return res.json(result);
  } catch (error) {
    console.error('Get vendor POs error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid query parameters', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to retrieve vendor POs' });
  }
});

// GET /api/vendor-pos/counts - Return tab counts for active, closed, and archived RFQs
router.get('/counts', async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        SUM(CASE WHEN archived = false AND status IN ('Draft','RFQ Sent','Quote Received','Sent','Partially Received') THEN 1 ELSE 0 END)::int AS active,
        SUM(CASE WHEN archived = false AND status IN ('Declined','Expired','Cancelled','Fully Received') THEN 1 ELSE 0 END)::int AS closed,
        SUM(CASE WHEN archived = true THEN 1 ELSE 0 END)::int AS archived
      FROM vendor_pos
      WHERE is_current_revision = true
    `);
    const rows = (result && typeof result === 'object' && 'rows' in result ? (result as { rows: unknown[] }).rows : result) as { active: number; closed: number; archived: number }[];
    const row = rows[0] ?? { active: 0, closed: 0, archived: 0 };
    res.json({ active: Number(row.active ?? 0), closed: Number(row.closed ?? 0), archived: Number(row.archived ?? 0) });
  } catch (error) {
    console.error('Vendor PO counts error:', error);
    res.status(500).json({ error: 'Failed to retrieve vendor PO counts' });
  }
});

// GET /api/vendor-pos/settings - Get vendor PO settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await storage.getVendorPOSettings();
    if (!settings) {
      // Return default settings if none exist
      return res.json({
        contactName: resolveVendorPoContactName(),
        contactEmail: resolveVendorPoReturnEmail(),
        termsAndConditions: '',
        paymentTerms: '',
        shippingInstructions: '',
      });
    }
    res.json({
      ...settings,
      contactName: resolveVendorPoContactName(settings),
      contactEmail: resolveVendorPoReturnEmail(settings),
    });
  } catch (error) {
    console.error('Get vendor PO settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve vendor PO settings' });
  }
});

// PUT /api/vendor-pos/settings - Update vendor PO settings
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const data = insertVendorPOSettingsSchema.partial().parse(req.body);
    const settings = await storage.updateVendorPOSettings(data);
    res.json(settings);
  } catch (error) {
    console.error('Update vendor PO settings error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor PO settings data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update vendor PO settings' });
  }
});

// GET /api/vendor-pos/company-settings - Get central company settings
router.get('/company-settings', async (req: Request, res: Response) => {
  try {
    const settings = await storage.getCompanySettings();
    if (!settings) {
      return res.json({
        companyName: '',
        companyAddress: '',
        companyPhone: '',
        companyEmail: '',
        companyWebsite: '',
      });
    }
    res.json(settings);
  } catch (error) {
    console.error('Get company settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve company settings' });
  }
});

// PUT /api/vendor-pos/company-settings - Update central company settings
router.put('/company-settings', async (req: Request, res: Response) => {
  try {
    const data = z.object({
      companyName: z.string().optional(),
      companyAddress: z.string().optional(),
      companyPhone: z.string().optional(),
      companyEmail: z.string().optional(),
      companyWebsite: z.string().optional(),
    }).parse(req.body);
    const settings = await storage.updateCompanySettings(data);
    res.json(settings);
  } catch (error) {
    console.error('Update company settings error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid company settings data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update company settings' });
  }
});

// ============ Optional Settings Routes ============
// NOTE: These routes MUST come before the /:id route to avoid route conflicts

// GET /api/vendor-pos/optional-settings - Get all optional settings
router.get('/optional-settings', async (req: Request, res: Response) => {
  try {
    const settings = await storage.getAllOptionalSettings();
    res.json(settings);
  } catch (error) {
    console.error('Get optional settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve optional settings' });
  }
});

// GET /api/vendor-pos/optional-settings/:id - Get a single optional setting
router.get('/optional-settings/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid optional setting ID' });
    }

    const setting = await storage.getOptionalSetting(id);
    if (!setting) {
      return res.status(404).json({ error: 'Optional setting not found' });
    }

    res.json(setting);
  } catch (error) {
    console.error('Get optional setting error:', error);
    res.status(500).json({ error: 'Failed to retrieve optional setting' });
  }
});

// POST /api/vendor-pos/optional-settings - Create a new optional setting
router.post('/optional-settings', async (req: Request, res: Response) => {
  try {
    const data = insertOptionalSettingSchema.parse(req.body);
    const setting = await storage.createOptionalSetting(data);
    res.status(201).json(setting);
  } catch (error) {
    console.error('Create optional setting error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid optional setting data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create optional setting' });
  }
});

// PUT /api/vendor-pos/optional-settings/:id - Update an optional setting
router.put('/optional-settings/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid optional setting ID' });
    }

    const data = insertOptionalSettingSchema.partial().parse(req.body);
    const setting = await storage.updateOptionalSetting(id, data);

    if (!setting) {
      return res.status(404).json({ error: 'Optional setting not found' });
    }

    res.json(setting);
  } catch (error) {
    console.error('Update optional setting error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid optional setting data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update optional setting' });
  }
});

// DELETE /api/vendor-pos/optional-settings/:id - Delete an optional setting
router.delete('/optional-settings/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid optional setting ID' });
    }

    await storage.deleteOptionalSetting(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete optional setting error:', error);
    res.status(500).json({ error: 'Failed to delete optional setting' });
  }
});

// GET /api/vendor-pos/compliance-backfill - Procurement Compliance Backfill Queue
// Returns issued POs with compliance gaps, enriched with per-row failing reasons and recommended actions.
// Default "all" includes isolated legacy rows; "enforced" matches the current ERDI scoring population.
// Must be defined BEFORE /:id to avoid route conflict.
// Query param: filter = 'all' | 'enforced' | 'legacy' | 'audit-sensitive-legacy'
const backfillFilterSchema = z.enum(['all', 'enforced', 'legacy', 'audit-sensitive-legacy']).default('all');
router.get('/compliance-backfill', async (req: Request, res: Response) => {
  try {
    const filterResult = backfillFilterSchema.safeParse(req.query.filter ?? 'all');
    if (!filterResult.success) {
      return res.status(400).json({ error: 'Invalid filter value. Must be one of: all, enforced, legacy, audit-sensitive-legacy' });
    }
    const { getProcurementComplianceBackfillQueue } = await import('../services/procurementComplianceBackfill');
    const rows = await getProcurementComplianceBackfillQueue(filterResult.data);
    res.json(rows);
  } catch (error) {
    console.error('[VendorPO] Compliance backfill queue error:', error);
    res.status(500).json({ error: 'Failed to retrieve compliance backfill queue' });
  }
});

// ─── Procurement Compliance Effective Date Routes ───────────────────────────
// Must be defined BEFORE /:id to avoid route conflicts.

// GET /api/vendor-pos/compliance-effective-date - Get current effective date + history
router.get('/compliance-effective-date', async (_req: Request, res: Response) => {
  try {
    const { desc } = await import('drizzle-orm');
    const rows = await db.select()
      .from(procurementComplianceEffectiveDates)
      .orderBy(desc(procurementComplianceEffectiveDates.configuredAt));

    const current = rows[0] ?? {
      id: 0,
      effectiveDate: '2026-06-01',
      configuredByDisplayName: 'System (default)',
      configuredAt: null,
      reason: 'Default effective date — no custom date has been configured.',
    };

    res.json({ current, history: rows });
  } catch (error) {
    console.error('[VendorPO] Get compliance effective date error:', error);
    res.status(500).json({ error: 'Failed to retrieve compliance effective date' });
  }
});

// GET /api/vendor-pos/:id/pdf - Serve the same Vendor PO/RFQ PDF used for emailed attachments.
// Must be defined BEFORE /:id to avoid route conflicts.
router.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    const buffer = await generateVendorPoPdf(id);
    const poNumber = vendorPO.poNumber || `RFQ-${id}`;
    const filePrefix = vendorPO.poNumber ? 'Vendor_PO' : 'Vendor_RFQ';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filePrefix}_${poNumber}.pdf"`);
    res.send(buffer);
  } catch (error) {
    console.error('Generate vendor PO/RFQ PDF error:', error);
    return sendApiError(res, error, {
      fallbackMessage: 'Failed to generate vendor PO/RFQ PDF',
      source: 'vendorPO.pdf',
      exposeMessage: true,
    });
  }
});

// PUT /api/vendor-pos/compliance-effective-date - Set a new effective date (admin-only, requires reason)
router.put('/compliance-effective-date', async (req: Request, res: Response) => {
  try {
    // Admin-only: only ADMIN and OWNER roles may change the enforcement effective date
    const userRole = (req as any).user?.role as string | undefined;
    if (!userRole || !['ADMIN', 'OWNER'].includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: only admins may change the compliance effective date' });
    }

    // Actor identity is always derived from the authenticated session — never from request body
    const actorDisplayName = String((req as any).user?.username ?? (req as any).user?.id ?? 'Admin');
    const actorUserId: number | null = ((req as any).user?.id as number | undefined) ?? null;

    const schema = z.object({
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective date must be in YYYY-MM-DD format').refine(
        (d) => !isNaN(Date.parse(d)),
        { message: 'Effective date must be a valid calendar date' }
      ),
      reason: z.string().min(10, 'Reason must be at least 10 characters'),
    });
    const data = schema.parse(req.body);

    const { desc } = await import('drizzle-orm');

    // Fetch the current (old) effective date for audit trail — must happen before the transaction
    const currentRows = await db.select()
      .from(procurementComplianceEffectiveDates)
      .orderBy(desc(procurementComplianceEffectiveDates.configuredAt))
      .limit(1);
    const oldEffectiveDate = currentRows[0]?.effectiveDate ?? '2026-06-01';

    // Atomic transaction: insert new effective date row AND write audit event together.
    // If the audit write fails, the date change is rolled back — ensuring all configuration
    // changes are auditable or rejected.
    let inserted: typeof procurementComplianceEffectiveDates.$inferSelect;
    await db.transaction(async (tx) => {
      [inserted] = await tx.insert(procurementComplianceEffectiveDates).values({
        effectiveDate: data.effectiveDate,
        reason: data.reason,
        configuredByDisplayName: actorDisplayName,
        configuredByUserId: actorUserId,
      }).returning();

      await tx.insert(auditEvents).values({
        entityType: 'system_config',
        entityId: 'procurement_compliance_effective_date',
        action: 'COMPLIANCE_EFFECTIVE_DATE_CHANGED',
        actorId: actorUserId,
        actorName: actorDisplayName,
        reason: data.reason,
        meta: {
          oldEffectiveDate,
          newEffectiveDate: data.effectiveDate,
          changedByRole: userRole,
          reason: data.reason,
          ip: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        },
      });
    });

    const allRows = await db.select()
      .from(procurementComplianceEffectiveDates)
      .orderBy(desc(procurementComplianceEffectiveDates.configuredAt));

    res.json({ current: inserted!, history: allRows });
  } catch (error) {
    console.error('[VendorPO] Update compliance effective date error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update compliance effective date' });
  }
});

// GET /api/vendor-pos/traceability-options - Options for line-level project/WAD/charge-code links
router.get('/traceability-options', async (_req: Request, res: Response) => {
  try {
    const [projects, productionWorkOrders, chargeCodes] = await Promise.all([
      storage.getAllProjects(),
      storage.getAllProductionWorkOrders(),
      storage.listChargeCodes(true),
    ]);

    res.json({ projects, productionWorkOrders, chargeCodes });
  } catch (error) {
    console.error('Get vendor PO traceability options error:', error);
    res.status(500).json({ error: 'Failed to retrieve traceability options' });
  }
});

// GET /api/vendor-pos/:id/issue-readiness - Explain all gates that affect PO issuance
router.get('/:id/issue-readiness', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    const readiness = await buildVendorPOIssueReadiness(vendorPO);
    res.json(readiness);
  } catch (error: any) {
    console.error('[VendorPO] Issue readiness error:', error);
    res.status(500).json({ error: error.message || 'Failed to build PO issue readiness' });
  }
});

// GET /api/vendor-pos/:id - Get a single vendor PO
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    res.json(vendorPO);
  } catch (error) {
    console.error('Get vendor PO error:', error);
    res.status(500).json({ error: 'Failed to retrieve vendor PO' });
  }
});

// POST /api/vendor-pos - Create a new vendor PO
router.post('/', requirePermission('purchasing.manage_pos'), async (req: Request, res: Response) => {
  try {
    // Task #83: strip privileged exception fields from client input — they may
    // ONLY be set by the dedicated /:id/direct-po-exception endpoint with
    // session-bound actor capture, never via free-form create/update.
    const sanitized = { ...(req.body ?? {}) };
    delete sanitized.directPoExceptionApprovedAt;
    delete sanitized.directPoExceptionApprovedById;
    delete sanitized.directPoExceptionApprovedByName;
    delete sanitized.directPoExceptionReason;
    delete sanitized.directPoExceptionRequested;

    const data = insertVendorPOSchema.parse(sanitized);
    // TEMP: creation may proceed without a requisition while the workflow is tuned.

    // Task #83: gate at creation — every PO must be backed by an APPROVED
    // requisition OR explicitly opt into the direct-PO exception path
    // (which is then unusable for issuance until /direct-po-exception runs).
    if ((data as any).requisitionId) {
      const { db: drizzleDb } = await import('../../db');
      const { purchaseRequisitions } = await import('../../schema');
      const { eq: dEq } = await import('drizzle-orm');
      const [r] = await drizzleDb.select().from(purchaseRequisitions)
        .where(dEq(purchaseRequisitions.id, (data as any).requisitionId));
      if (!r) return res.status(400).json({ error: 'Linked requisition not found' });
      if (r.status !== 'APPROVED' && r.status !== 'CONVERTED_TO_PO') {
        return res.status(422).json({
          error: 'Requisition not approved',
          message: `Linked requisition ${r.reqNumber} is in status ${r.status}; only APPROVED requisitions may seed a vendor PO.`,
        });
      }
    }

    const vendorPO = await storage.createVendorPO(data);
    await recordVendorPoAudit(req, vendorPO.id, 'VENDOR_PO_CREATED', {
      after: vendorPO,
      meta: { source: 'create' },
    });
    res.status(201).json(vendorPO);
  } catch (error) {
    console.error('Create vendor PO error:', error);
    return sendApiError(res, error, {
      fallbackMessage: 'Failed to create vendor PO',
      source: 'vendorPO.create',
    });
  }
});

// PUT /api/vendor-pos/:id - Update a vendor PO
// Note: Blocks edits on issued POs (status Sent or beyond) - use revisions instead
router.put('/:id', requirePermission('purchasing.manage_pos'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    // Check if PO exists and get current status
    const existingPO = await storage.getVendorPO(id);
    if (!existingPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    // Block edits on issued POs - except for status changes which are allowed
    const issuedStatuses = ['Sent', 'Partially Received', 'Fully Received'];
    // Task #83: strip privileged direct-PO exception fields — only the
    // dedicated /:id/direct-po-exception endpoint may set these.
    const sanitizedPut = { ...(req.body ?? {}) };
    delete sanitizedPut.directPoExceptionApprovedAt;
    delete sanitizedPut.directPoExceptionApprovedById;
    delete sanitizedPut.directPoExceptionApprovedByName;
    delete sanitizedPut.directPoExceptionReason;
    const data = insertVendorPOSchema.partial().parse(sanitizedPut);
    
    // Prevent setting status to 'Sent' via PUT — must use POST /:id/issue for atomic number generation
    if (data.status === 'Sent') {
      return res.status(400).json({
        error: 'Cannot set status to Sent directly',
        message: 'Use the POST /api/vendor-pos/:id/issue endpoint to formally issue a PO. This ensures proper PO number generation.',
      });
    }

    // Allow status changes (e.g., moving to Received, Cancelled, etc.) even on issued POs
    const isStatusOnlyChange = Object.keys(data).length === 1 && data.status !== undefined;
    
    if (issuedStatuses.includes(existingPO.status) && !isStatusOnlyChange) {
      return res.status(403).json({ 
        error: 'Cannot edit issued PO',
        message: 'This PO has been issued and cannot be directly modified. Create a revision to make changes.',
        currentStatus: existingPO.status
      });
    }

    // Invalidate compliance review BEFORE mutating the PO so that if invalidation
    // fails the PO update never commits (fail-safe, not fail-open).
    if (data.vendorId !== undefined && data.vendorId !== existingPO.vendorId) {
      const actorId = (req as any).user?.id as number | undefined;
      await storage.invalidateVendorPoComplianceReview(id, 'Vendor changed after compliance review', actorId, {
        changedField: 'vendorId',
        previousValue: existingPO.vendorId,
        newValue: data.vendorId,
      });
    }
    if ((data as any).productionLine !== undefined && (data as any).productionLine !== existingPO.productionLine) {
      const actorId = (req as any).user?.id as number | undefined;
      await storage.invalidateVendorPoComplianceReview(id, 'Production line changed after compliance review', actorId, {
        changedField: 'productionLine',
        previousValue: existingPO.productionLine,
        newValue: (data as any).productionLine,
      });
    }

    const vendorPO = await storage.updateVendorPO(id, data);

    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    await recordVendorPoAudit(req, id, 'VENDOR_PO_UPDATED', {
      before: existingPO,
      after: vendorPO,
      fieldsChanged: buildFieldChanges(existingPO, vendorPO, Object.keys(data)),
      reason: normalizeAuditReason((req.body ?? {}).reason) || null,
      meta: { source: 'update' },
    });

    res.json(vendorPO);
  } catch (error) {
    console.error('Update vendor PO error:', error);
    return sendApiError(res, error, {
      fallbackMessage: 'Failed to update vendor PO',
      source: 'vendorPO.update',
    });
  }
});

// POST /api/vendor-pos/:id/revisions - Create a new revision of an issued PO
router.post('/:id/revisions', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    // Validate revision request
    const revisionSchema = z.object({
      changeReason: z.string().min(1, 'Change reason is required'),
      revisedBy: z.string().optional(),
    });

    const { changeReason, revisedBy } = revisionSchema.parse(req.body);

    // Get original PO
    const originalPO = await storage.getVendorPO(id);
    if (!originalPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    // Only issued POs can be revised (Draft POs can be edited directly)
    const issuedStatuses = ['Sent', 'Partially Received', 'Fully Received'];
    if (!issuedStatuses.includes(originalPO.status)) {
      return res.status(400).json({ 
        error: 'Cannot create revision',
        message: 'Only issued POs can be revised. Draft POs can be edited directly.',
        currentStatus: originalPO.status
      });
    }

    // Create revision using storage function
    const revision = await storage.createVendorPORevision(id, changeReason, revisedBy);
    await recordVendorPoAudit(req, id, 'VENDOR_PO_REVISION_CREATED', {
      before: originalPO,
      after: revision,
      reason: changeReason,
      meta: { revisionId: revision?.id ?? null, revisionNumber: revision?.revisionNumber ?? null },
    });

    res.status(201).json(revision);
  } catch (error) {
    console.error('Create vendor PO revision error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid revision data', details: error.errors });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create vendor PO revision' });
  }
});

// GET /api/vendor-pos/:id/history - Get revision history for a PO
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const history = await storage.getVendorPORevisionHistory(id);
    res.json(history);
  } catch (error) {
    console.error('Get vendor PO history error:', error);
    res.status(500).json({ error: 'Failed to retrieve vendor PO history' });
  }
});

// GET /api/vendor-pos/:id/transactions - Get audit ledger entries for a PO
router.get('/:id/transactions', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const events = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        actorName: auditEvents.actorName,
        actorRole: auditEvents.actorRole,
        reason: auditEvents.reason,
        fieldsChanged: auditEvents.fieldsChanged,
        meta: auditEvents.meta,
        payloadJson: auditEvents.payloadJson,
        occurredAt: auditEvents.occurredAt,
        timestamp: auditEvents.timestamp,
        recordedAt: auditEvents.recordedAt,
        sequenceNumber: auditEvents.sequenceNumber,
        rowHash: auditEvents.rowHash,
      })
      .from(auditEvents)
      .where(
        or(
          and(eq(auditEvents.subjectType, VENDOR_PO_AUDIT_SUBJECT), eq(auditEvents.subjectId, String(id))),
          and(eq(auditEvents.entityType, VENDOR_PO_AUDIT_SUBJECT), eq(auditEvents.entityId, String(id))),
          and(eq(auditEvents.entityType, 'vendor'), eq(auditEvents.entityId, String(id))),
        ),
      )
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.timestamp), desc(auditEvents.id))
      .limit(250);

    res.json(events);
  } catch (error) {
    console.error('Get vendor PO transactions error:', error);
    res.status(500).json({ error: 'Failed to retrieve vendor PO transactions' });
  }
});

// DELETE /api/vendor-pos/:id - Delete a vendor PO
router.delete('/:id', requirePermission('purchasing.manage_pos'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const reason = requireAuditReason((req.body ?? {}).reason, 'Deleting a vendor PO');
    const existingPO = await storage.getVendorPO(id);
    if (!existingPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    await recordVendorPoAudit(req, id, 'VENDOR_PO_DELETE_REQUESTED', {
      before: existingPO,
      reason,
      meta: { source: 'delete' },
    });
    await storage.deleteVendorPO(id);
    await recordVendorPoAudit(req, id, 'VENDOR_PO_DELETED', {
      before: existingPO,
      reason,
      meta: { source: 'delete' },
    });
    res.json({ ok: true, deleted: true });
  } catch (error) {
    console.error('Delete vendor PO error:', error);
    return sendApiError(res, error, {
      fallbackMessage: 'Failed to delete vendor PO',
      source: 'vendorPO.delete',
      exposeMessage: true,
    });
  }
});

// GET /api/vendor-pos/:id/items - Get all items for a vendor PO
router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const vendorPoId = parseInt(req.params.id);
    if (isNaN(vendorPoId)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const items = await storage.getVendorPOItems(vendorPoId);
    res.json(items);
  } catch (error) {
    console.error('Get vendor PO items error:', error);
    res.status(500).json({ error: 'Failed to retrieve vendor PO items' });
  }
});

// POST /api/vendor-pos/:id/items - Add an item to a vendor PO
// Note: Manufacturing queue auto-population now handled in storage layer
router.post('/:id/items', async (req: Request, res: Response) => {
  try {
    const vendorPoId = parseInt(req.params.id);
    if (isNaN(vendorPoId)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const data = insertVendorPOItemSchema.parse({
      ...req.body,
      vendorPoId,
    });

    await requireP2LineTraceability(vendorPoId, data as Record<string, unknown>);
    await requireP2ComplianceBeforeProjectAllocation(vendorPoId, data);

    const item = await storage.createVendorPOItem(data);
    await recordVendorPoAudit(req, vendorPoId, 'VENDOR_PO_ITEM_CREATED', {
      after: item,
      meta: { itemId: item?.id ?? null, lineNumber: item?.lineNumber ?? null },
    });
    res.status(201).json(item);
  } catch (error) {
    console.error('Create vendor PO item error:', error);
    if ((error as any)?.status) {
      return sendApiError(res, error, {
        fallbackMessage: 'Failed to create vendor PO item',
        source: 'vendorPO.item.create',
        exposeMessage: true,
      });
    }
    return sendApiError(res, error, {
      fallbackMessage: 'Failed to create vendor PO item',
      source: 'vendorPO.item.create',
    });
  }
});

// PUT /api/vendor-pos/items/:itemId - Update a vendor PO item
router.put('/items/:itemId', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid vendor PO item ID' });
    }

    // Fetch old item to compare material fields before updating.
    const oldItem = await storage.getVendorPOItemById(itemId);
    const data = insertVendorPOItemSchema.partial().parse(req.body);
    const materialFields: Array<{ key: string; label: string }> = [
      { key: 'quantity', label: 'quantity' },
      { key: 'unitPrice', label: 'unit price' },
      { key: 'purchaseQty', label: 'purchase quantity' },
      { key: 'purchaseUnitPrice', label: 'purchase unit price' },
    ];
    const changedField = oldItem
      ? materialFields.find(
          (f) => data[f.key as keyof typeof data] !== undefined && numericValuesDiffer(data[f.key as keyof typeof data], oldItem[f.key])
        )
      : undefined;

    if (oldItem) {
      const finalTraceability = {
        customerPoId: data.customerPoId !== undefined ? data.customerPoId : oldItem.customerPoId,
        projectId: data.projectId !== undefined ? data.projectId : oldItem.projectId,
        productionWorkOrderId: data.productionWorkOrderId !== undefined ? data.productionWorkOrderId : oldItem.productionWorkOrderId,
        chargeCodeId: data.chargeCodeId !== undefined ? data.chargeCodeId : oldItem.chargeCodeId,
      };

      // Material changes are allowed on linked P2 lines, but they invalidate
      // compliance below. Traceability remains required unless the same save is
      // intentionally clearing allocation as part of the material change.
      if (!changedField || hasTraceabilityLink(finalTraceability)) {
        await requireP2LineTraceability(oldItem.vendorPoId, finalTraceability);
        await requireP2ComplianceBeforeProjectAllocation(oldItem.vendorPoId, finalTraceability);
      }
    }

    // Invalidate compliance review BEFORE updating the item so that if invalidation
    // fails the item mutation never commits (fail-safe).
    if (oldItem) {
      if (changedField) {
        const actorId = (req as any).user?.id as number | undefined;
        await storage.invalidateVendorPoComplianceReview(
          oldItem.vendorPoId,
          `Line item ${changedField.label} changed after compliance review`,
          actorId,
          { changedField: changedField.key, itemId },
        );
      }
    }

    const item = await storage.updateVendorPOItem(itemId, data);

    if (!item) {
      return res.status(404).json({ error: 'Vendor PO item not found' });
    }

    const itemVendorPoId = item.vendorPoId ?? oldItem?.vendorPoId;
    if (itemVendorPoId != null) {
      await recordVendorPoAudit(req, itemVendorPoId, 'VENDOR_PO_ITEM_UPDATED', {
        before: oldItem,
        after: item,
        fieldsChanged: buildFieldChanges(oldItem, item, Object.keys(data)),
        meta: { itemId, lineNumber: item?.lineNumber ?? oldItem?.lineNumber ?? null },
      });
    }

    res.json(item);
  } catch (error) {
    console.error('Update vendor PO item error:', error);
    if ((error as any)?.status) {
      return sendApiError(res, error, {
        fallbackMessage: 'Failed to update vendor PO item',
        source: 'vendorPO.item.update',
        exposeMessage: true,
      });
    }
    return sendApiError(res, error, {
      fallbackMessage: 'Failed to update vendor PO item',
      source: 'vendorPO.item.update',
    });
  }
});

// DELETE /api/vendor-pos/items/:itemId - Delete a vendor PO item
router.delete('/items/:itemId', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid vendor PO item ID' });
    }

    // Fetch item first so we know its vendorPoId for compliance invalidation.
    // Invalidate BEFORE deletion so that if invalidation fails the delete never
    // commits (fail-safe).
    const itemToDelete = await storage.getVendorPOItemById(itemId);

    if (itemToDelete) {
      const actorId = (req as any).user?.id as number | undefined;
      await storage.invalidateVendorPoComplianceReview(
        itemToDelete.vendorPoId,
        'Line item removed after compliance review',
        actorId,
        { changedField: 'lineItems', action: 'removed', itemId },
      );
    }

    await storage.deleteVendorPOItem(itemId);
    if (itemToDelete) {
      await recordVendorPoAudit(req, itemToDelete.vendorPoId, 'VENDOR_PO_ITEM_DELETED', {
        before: itemToDelete,
        meta: { itemId, lineNumber: itemToDelete.lineNumber ?? null },
      });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Delete vendor PO item error:', error);
    res.status(500).json({ error: 'Failed to delete vendor PO item' });
  }
});

// POST /api/vendor-pos/items/:itemId/receive - Record PO item receipt and auto-calculate COGS
router.post('/items/:itemId/receive', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid vendor PO item ID' });
    }

    // Validate request body
    const receiveSchema = z.object({
      receivedQuantity: z.number().positive('Received quantity must be positive'),
      receivedDate: z.string().optional(), // ISO date string, defaults to now
      notes: z.string().optional(),
      createdBy: z.number().int().positive().optional(), // Employee ID
      cocLink: z.string().optional(), // Certificate of Conformance link
      documentUrl: z.string().optional(), // Uploaded document URL
      // Per-unit traceability splits (Task #240). When provided, each entry
      // creates its own material_lots row + its own ITL RECEIVE row. Sum of
      // unit quantities must equal `receivedQuantity`.
      units: z.array(z.object({
        quantity: z.number().positive('Unit quantity must be positive'),
        traceability: z.record(z.string(), z.string()).optional(),
        notes: z.string().optional(),
      })).optional(),
    });

    const { receivedQuantity, receivedDate, notes, createdBy, cocLink, documentUrl, units } = receiveSchema.parse(req.body);

    // Record PO receipt and calculate COGS
    const result = await storage.recordVendorPOReceipt({
      poLineItemId: itemId,
      receivedQuantity,
      receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
      notes: documentUrl ? `${notes || ''} | Document: ${documentUrl}`.trim() : notes,
      createdBy,
      cocLink,
      units,
    });

    const receivedItem = await storage.getVendorPOItemById(itemId);
    if (receivedItem?.vendorPoId) {
      const actor = String((req as any).user?.username ?? createdBy ?? 'unknown');
      await markLinkedPartsRequestsReceivedForPo(receivedItem.vendorPoId, actor);
      await recordVendorPoAudit(req, receivedItem.vendorPoId, 'VENDOR_PO_ITEM_RECEIVED', {
        after: receivedItem,
        reason: normalizeAuditReason(notes) || null,
        meta: {
          itemId,
          receivedQuantity,
          receivedDate: receivedDate ?? null,
          cocLink: cocLink ?? null,
          documentUrl: documentUrl ?? null,
          receipt: result as any,
        },
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Record PO receipt error:', error);
    return sendApiError(res, error, {
      fallbackMessage: 'Failed to record PO receipt',
      source: 'vendorPO.item.receive',
      exposeMessage: true,
    });
  }
});

// ============ PO Optional Settings Routes ============

// GET /api/vendor-pos/:id/optional-settings - Get all optional settings for a PO
router.get('/:id/optional-settings', async (req: Request, res: Response) => {
  try {
    const vendorPoId = parseInt(req.params.id);
    if (isNaN(vendorPoId)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const settings = await storage.getPOOptionalSettings(vendorPoId);
    res.json(settings);
  } catch (error) {
    console.error('Get PO optional settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve PO optional settings' });
  }
});

// PUT /api/vendor-pos/:id/optional-settings - Update all optional settings for a PO (bulk update)
router.put('/:id/optional-settings', async (req: Request, res: Response) => {
  try {
    const vendorPoId = parseInt(req.params.id);
    if (isNaN(vendorPoId)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const updateSchema = z.object({
      optionalSettingIds: z.array(z.number().int().positive()),
    });

    const { optionalSettingIds } = updateSchema.parse(req.body);

    // Capture current settings (with name/statement) before update for compliance check.
    const currentSettings = await storage.getPOOptionalSettings(vendorPoId);
    const newIds = new Set(optionalSettingIds);

    // Determine which settings are being removed and whether any are compliance-related.
    // A removal is material only if the removed statement's text matches a keyword for a
    // compliance field that is currently marked required in the saved review.
    const removedSettings = currentSettings.filter((s: any) => !newIds.has(s.id));
    let complianceRelatedRemoval = false;
    if (removedSettings.length > 0) {
      const review = await storage.getVendorPOComplianceReview(vendorPoId);
      if (review && review.reviewStatus === 'reviewed') {
        // Build keyword list from flags that are actually marked required in this review
        const requiredKeywords: string[] = [];
        if (review.farRequired) requiredKeywords.push('FAR', 'DFAR', 'DFARS');
        if (review.dpasRequired) requiredKeywords.push('DPAS');
        if (review.cocRequired) requiredKeywords.push('CoC', 'COC', 'Certificate of Conformance');
        if (review.mtrRequired) requiredKeywords.push('MTR', 'Material Test Report');

        if (requiredKeywords.length > 0) {
          complianceRelatedRemoval = removedSettings.some((s: any) => {
            const text = `${s.name ?? ''} ${s.statement ?? ''}`;
            return requiredKeywords.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
          });
        }
      }
    }

    // Invalidate compliance review BEFORE updating settings so that if invalidation
    // fails the settings change never commits (fail-safe).
    if (complianceRelatedRemoval) {
      const actorId = (req as any).user?.id as number | undefined;
      await storage.invalidateVendorPoComplianceReview(
        vendorPoId,
        'Compliance-required statement removed after compliance review',
        actorId,
        { changedField: 'optionalSettings', action: 'removed', removedCount: removedSettings.length },
      );
    }

    await storage.updatePOOptionalSettings(vendorPoId, optionalSettingIds);
    await recordVendorPoAudit(req, vendorPoId, 'VENDOR_PO_OPTIONAL_SETTINGS_UPDATED', {
      fieldsChanged: {
        optionalSettingIds: {
          before: currentSettings.map((setting: any) => setting.id),
          after: optionalSettingIds,
        },
      },
      meta: {
        removedSettingIds: removedSettings.map((setting: any) => setting.id),
        addedSettingIds: optionalSettingIds.filter((id) => !currentSettings.some((setting: any) => setting.id === id)),
        complianceRelatedRemoval,
      },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Update PO optional settings error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid optional settings data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update PO optional settings' });
  }
});

// GET /api/vendor-pos/:id/email-recipients - List available email recipients for a vendor PO
router.get('/:id/email-recipients', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    const vendor = await storage.getVendor(vendorPO.vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const recipients: { name: string; email: string; type: 'primary' | 'additional' | 'contact' }[] = [];

    if (vendor.email) {
      recipients.push({
        name: vendor.contactPerson || vendor.name,
        email: vendor.email,
        type: 'primary',
      });
    }

    if (vendor.additionalEmail) {
      recipients.push({
        name: vendor.name,
        email: vendor.additionalEmail,
        type: 'additional',
      });
    }

    const contacts = await storage.getVendorContacts(vendorPO.vendorId);
    for (const contact of contacts) {
      if (contact.email) {
        recipients.push({
          name: contact.name,
          email: contact.email,
          type: 'contact',
        });
      }
    }

    res.json(recipients);
  } catch (error) {
    console.error('Get email recipients error:', error);
    res.status(500).json({ error: 'Failed to retrieve email recipients' });
  }
});

// ============ Compliance Review Routes ============

// GET /api/vendor-pos/:id/compliance-review - Get the compliance review for a PO
router.get('/:id/compliance-review', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const review = await storage.getVendorPOComplianceReview(id);

    if (!review) {
      return res.json({
        vendorPoId: id,
        governmentContract: false,
        farRequired: false,
        dpasRequired: false,
        cocRequired: false,
        mtrRequired: false,
        sourceInspectionRequired: false,
        secondPartyComplete: false,
        vendorApproved: false,
        reviewNotes: '',
        reviewStatus: 'pending',
        reviewedByDisplayName: null,
        reviewedAt: null,
      });
    }

    res.json(review);
  } catch (error) {
    console.error('Get compliance review error:', error);
    res.status(500).json({ error: 'Failed to retrieve compliance review' });
  }
});

// PUT /api/vendor-pos/:id/compliance-review - Save/update the compliance review for a PO
//
// Design note on HTTP status: This endpoint intentionally returns 200 even when the
// review is blocked (secondPartyComplete=false or vendorApproved=false). The reason is
// that the record IS successfully persisted — saving a blocked review is valid for audit
// trail purposes (reviewers must document their findings even when approvals are missing).
// The response includes a `blockingReasons` array so the client can display why the PO
// cannot proceed to issuance. The actual issuance gate lives in POST /:id/issue which
// returns 422 if the review is not in a passing state.
router.put('/:id/compliance-review', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    const reviewSchema = z.object({
      governmentContract: z.boolean(),
      farRequired: z.boolean(),
      dpasRequired: z.boolean(),
      cocRequired: z.boolean(),
      mtrRequired: z.boolean(),
      sourceInspectionRequired: z.boolean(),
      secondPartyComplete: z.boolean(),
      vendorApproved: z.boolean(),
      reviewNotes: z.string().min(1, 'Justification is required'),
      reviewStatus: z.enum(['pending', 'reviewed', 'blocked', 'requires_attention']).optional().default('reviewed'),
      historicalBackfill: z.boolean().optional().default(false),
    });

    const body = reviewSchema.parse(req.body);

    const performedBy = String((req as any).user?.username ?? (req as any).user?.id ?? 'unknown');
    const performedById = (req as any).user?.id as number | undefined;

    // If a previously-reviewed PO is being re-submitted with blocking answers, write an invalidation
    // audit event before the upsert overwrites the status to 'blocked'.
    const existingReview = await storage.getVendorPOComplianceReview(id);
    if (existingReview && existingReview.reviewStatus === 'reviewed') {
      const incomingBlocking = !body.secondPartyComplete || !body.vendorApproved;
      if (incomingBlocking) {
        await storage.invalidateVendorPoComplianceReview(
          id,
          'Compliance answers changed to a blocking state',
          performedById,
          { changedField: 'complianceAnswers', secondPartyComplete: body.secondPartyComplete, vendorApproved: body.vendorApproved },
        );
      }
    }

    const review = await storage.upsertVendorPOComplianceReview({
      vendorPoId: id,
      ...body,
      reviewStatus: body.reviewStatus ?? 'reviewed',
      reviewedByUserId: performedById,
      reviewedByDisplayName: performedBy,
    });

    // Derive blocking reasons to surface to client
    const blockingReasons: string[] = [];
    if (!body.secondPartyComplete) blockingReasons.push('Second-party approval is not complete');
    if (!body.vendorApproved) blockingReasons.push('Vendor is not approved');

    await recordVendorPoAudit(req, id, 'VENDOR_PO_COMPLIANCE_REVIEW_SAVED', {
      before: existingReview ?? null,
      after: review,
      reason: body.reviewNotes,
      fieldsChanged: buildFieldChanges(existingReview, review, [
        'governmentContract',
        'farRequired',
        'dpasRequired',
        'cocRequired',
        'mtrRequired',
        'sourceInspectionRequired',
        'secondPartyComplete',
        'vendorApproved',
        'reviewStatus',
        'reviewNotes',
      ]),
      meta: { reviewStatus: review.reviewStatus, blockingReasons },
    });

    res.json({ ...review, blockingReasons });
  } catch (error) {
    console.error('Save compliance review error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid compliance review data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to save compliance review' });
  }
});

// PUT /api/vendor-pos/:id/legacy-exception-flag - Set or clear the legacy exception flag on a PO's compliance review
// Exception-flagged legacy POs are moved from the Legacy Queue into the Active Enforcement Queue.
// Restricted to ADMIN and OWNER roles — changing this flag directly affects ERDI scoring population.
router.put('/:id/legacy-exception-flag', async (req: Request, res: Response) => {
  try {
    const userRole = String((req as any).user?.role ?? '');
    if (!['ADMIN', 'OWNER'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin or Owner role required to manage legacy exception flags.' });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const schema = z.object({
      legacyExceptionFlagged: z.boolean(),
      legacyExceptionReason: z.string().optional(),
    }).superRefine((val, ctx) => {
      if (val.legacyExceptionFlagged && (!val.legacyExceptionReason || val.legacyExceptionReason.trim().length < 10)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Reason must be at least 10 characters when setting a legacy exception flag', path: ['legacyExceptionReason'] });
      }
    });
    const body = schema.parse(req.body);

    const performedBy = String((req as any).user?.username ?? (req as any).user?.id ?? 'unknown');
    const performedById = (req as any).user?.id as number | undefined;

    // Capture old flag state before making changes — for audit trail old/new comparison.
    const existingReview = await storage.getVendorPOComplianceReview(id);
    const oldFlagged = existingReview?.legacyExceptionFlagged ?? false;
    const oldReason = existingReview?.legacyExceptionReason ?? null;

    // Use the dedicated flag-only update: does NOT recalculate review status or
    // touch reviewedAt/reviewer identity. Creates a minimal pending record if needed.
    const updated = await storage.setVendorPOLegacyExceptionFlag(
      id,
      body.legacyExceptionFlagged,
      body.legacyExceptionReason ?? null,
    );

    const { auditService } = await import('../services/auditService');
    await auditService.logEvent({
      entityType: 'vendor_po_compliance_review' as any,
      entityId: `vendor-po-${id}`,
      action: body.legacyExceptionFlagged ? 'LEGACY_EXCEPTION_FLAG_SET' : 'LEGACY_EXCEPTION_FLAG_CLEARED',
      actor: { id: performedById, username: performedBy, role: userRole },
      meta: {
        vendorPoId: id,
        oldFlagged,
        newFlagged: body.legacyExceptionFlagged,
        oldReason,
        newReason: body.legacyExceptionReason ?? null,
        actorRole: userRole,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('[VendorPO] Legacy exception flag error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update legacy exception flag' });
  }
});

// POST /api/vendor-pos/:id/send-rfq - Send an RFQ email to vendor (non-binding quote request)
router.post('/:id/send-rfq', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    const isRfqResend = vendorPO.status === 'RFQ Sent';
    if (!['Draft', 'RFQ Sent'].includes(vendorPO.status)) {
      return res.status(400).json({
        error: 'RFQ can only be sent from Draft or RFQ Sent status',
        message: `PO is currently in ${vendorPO.status} status`,
      });
    }

    if (vendorPO.poNumber) {
      return res.status(400).json({
        error: 'RFQ resend not allowed after PO issue',
        message: 'This record has already been issued as a PO. Use Resend PO instead.',
      });
    }

    const vendor = await storage.getVendor(vendorPO.vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    if (!vendor.email) {
      return res.status(400).json({
        error: 'Vendor email not configured',
        message: 'Please add a contact email for this vendor before sending an RFQ.',
      });
    }

    const { recipients: rawRecipients, printOnly } = req.body ?? {};
    const allowedEmails = await getAllowedVendorEmails(vendorPO.vendorId);
    const { returnEmail: rfqReplyTo, cc: rfqStandardCc } = await getVendorPoEmailRouting((req as any).user?.email);
    const { to: rfqTo, cc: rfqCc } = deriveToAndCc(
      rawRecipients,
      vendor.email,
      allowedEmails,
      rfqStandardCc
    );

    const shouldPrintOnly =
      printOnly === true ||
      printOnly === 'true' ||
      printOnly === 1 ||
      printOnly === '1';

    if (shouldPrintOnly) {
      const updatedPO = await storage.updateVendorPO(id, { status: 'RFQ Sent' });
      await recordVendorPoAudit(req, id, isRfqResend ? 'VENDOR_RFQ_RESEND_PRINT_ONLY' : 'VENDOR_RFQ_PRINT_ONLY', {
        before: vendorPO,
        after: updatedPO,
        reason: normalizeAuditReason((req.body ?? {}).reason) || 'Prepared without sending email',
        fieldsChanged: buildFieldChanges(vendorPO, updatedPO, ['status']),
        meta: { to: rfqTo, cc: rfqCc, printOnly: true, wasResend: isRfqResend },
      });
      return res.json({
        ...updatedPO,
        emailSent: false,
        emailRecipient: rfqTo,
        emailCc: rfqCc,
        printOnly: true,
        wasResend: isRfqResend,
        message: `RFQ prepared for printing only.`,
      });
    }

    // Fetch line items for the RFQ
    const items = await storage.getVendorPOItems(id);

    // Build items context variables (HTML table for body_html, text list for body_text)
    const itemsTableRows = items.map((item: any) =>
      `<tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.lineNumber}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.supplierPartNumber || '-'}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.description || '-'}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.quantity != null ? Number(item.quantity).toFixed(2) : '0.00'}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.vendorUnit || item.uom || '-'}</td>
      </tr>`
    ).join('');

    const items_table = items.length > 0
      ? `<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Line</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Part #</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Description</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Qty</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Unit</th>
          </tr>
        </thead>
        <tbody>${itemsTableRows}</tbody>
      </table>`
      : '<p><em>No specific items listed. Please contact us for details.</em></p>';

    const items_list = items.length > 0
      ? items.map((item: any) => `- ${item.description || 'Item'}: Qty ${item.quantity || 0} ${item.vendorUnit || item.uom || ''}`.trimEnd()).join('\n')
      : 'No specific items listed. Please contact us for details.';

    const rfqContext = {
      po_number: vendorPO.poNumber || `RFQ-${id}`,
      vendor_name: vendor.name,
      vendor_contact_person: vendor.contactPerson ? ` ${vendor.contactPerson}` : '',
      desired_delivery_date: vendorPO.expectedDeliveryDate
        ? new Date(vendorPO.expectedDeliveryDate).toLocaleDateString()
        : '',
      items_table,
      items_list,
    };

    const emailResult = await sendCommunication({
      templateKey: 'vendor_rfq',
      context: rfqContext,
      to: rfqTo,
      cc: rfqCc,
      replyTo: rfqReplyTo,
      triggeredBy: String((req as any).user?.id ?? (req as any).user?.username ?? 'unknown'),
      capabilityRequired: 'send_vendor_rfq',
      orderId: String(id),
    });

    if (!emailResult.success) {
      console.error('Failed to send RFQ email:', emailResult.error);
      const emailError: any = new Error(emailResult.error || 'Email service unavailable. Please try again.');
      emailError.status = 503;
      return sendApiError(res, emailError, {
        fallbackMessage: 'Failed to send RFQ email',
        source: 'vendorPO.rfq.email',
        exposeMessage: true,
      });
    }

    // Update status to RFQ Sent (no PO number assigned — stays null)
    const updatedPO = await storage.updateVendorPO(id, { status: 'RFQ Sent' });
    await recordVendorPoAudit(req, id, isRfqResend ? 'VENDOR_RFQ_RESENT' : 'VENDOR_RFQ_SENT', {
      before: vendorPO,
      after: updatedPO,
      fieldsChanged: buildFieldChanges(vendorPO, updatedPO, ['status']),
      meta: { to: rfqTo, cc: rfqCc, wasResend: isRfqResend },
    });

    console.log(`✅ RFQ sent to ${rfqTo} for vendor PO ID ${id} (cc: ${rfqCc.join(', ')})`);

    res.json({
      ...updatedPO,
      emailSent: true,
      emailRecipient: rfqTo,
      emailCc: rfqCc,
      wasResend: isRfqResend,
      message: `RFQ sent successfully to ${rfqTo}.`,
    });
  } catch (error) {
    console.error('Send RFQ error:', error);
    return sendApiError(res, error, {
      fallbackMessage: 'Failed to send RFQ',
      source: 'vendorPO.rfq.send',
      exposeMessage: true,
    });
  }
});

// POST /api/vendor-pos/:id/direct-po-exception
// Task #83: Dedicated, session-bound endpoint that records a direct-PO
// exception. The approver identity is taken from the authenticated session —
// it is NEVER trusted from the request body. Requires the
// `purchasing.direct_po_exception` capability (admin/owner roles bypass per
// requirePermission contract).
router.post('/:id/direct-po-exception', requirePermission('purchasing.direct_po_exception'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid vendor PO ID' });

    const { reason } = (req.body ?? {}) as { reason?: string };
    const trimmed = String(reason ?? '').trim();
    if (trimmed.length < 10) {
      return res.status(400).json({ error: 'Reason (≥10 chars) is required for the audit trail' });
    }

    const existing = await storage.getVendorPO(id);
    if (!existing) return res.status(404).json({ error: 'Vendor PO not found' });
    if (existing.requisitionId) {
      return res.status(409).json({
        error: 'PO is already linked to a requisition',
        message: 'Direct-PO exceptions are only valid for POs not backed by a purchase requisition.',
      });
    }

    // Honor the kill-switch from procurement_settings
    const { db: drizzleDb2 } = await import('../../db');
    const { procurementSettings } = await import('../../schema');
    const sRows = await drizzleDb2.select().from(procurementSettings).limit(1);
    const allow = sRows[0]?.allowDirectPo ?? false;
    if (!allow) {
      return res.status(403).json({
        error: 'Direct-PO exceptions are disabled',
        message: 'Procurement settings have allow_direct_po=false. An administrator must enable it before exceptions can be approved.',
      });
    }

    const u: any = (req as any).user;
    const approverId = u?.id;
    const approverName = u?.fullName || u?.username || u?.email || `user:${approverId}`;
    if (!approverId) return res.status(401).json({ error: 'Unauthenticated' });

    const updated = await storage.updateVendorPO(id, {
      directPoExceptionApprovedAt: new Date(),
      directPoExceptionApprovedById: approverId,
      directPoExceptionApprovedByName: String(approverName),
      directPoExceptionReason: trimmed,
    } as any);

    const { auditService: aSvc } = await import('../services/auditService');
    await aSvc.logEvent({
      entityType: 'vendor' as any,
      entityId: String(id),
      action: 'DIRECT_PO_EXCEPTION_APPROVED',
      actor: { id: approverId, username: u?.username, role: u?.role },
      reason: trimmed,
      meta: { poNumber: existing.poNumber ?? null },
    });
    await recordVendorPoAudit(req, id, 'DIRECT_PO_EXCEPTION_APPROVED', {
      before: existing,
      after: updated,
      reason: trimmed,
      fieldsChanged: buildFieldChanges(existing, updated, [
        'directPoExceptionApprovedAt',
        'directPoExceptionApprovedById',
        'directPoExceptionApprovedByName',
        'directPoExceptionReason',
      ]),
      meta: { poNumber: existing.poNumber ?? null },
    });

    res.json({ ok: true, vendorPO: updated });
  } catch (err: any) {
    console.error('Direct-PO exception error:', err);
    return sendApiError(res, err, {
      fallbackMessage: 'Failed to record direct-PO exception',
      source: 'vendorPO.directPoException',
      exposeMessage: true,
    });
  }
});

// POST /api/vendor-pos/:id/issue - Issue a PO, optionally sending email to vendor
router.post('/:id/issue', requirePermission('purchasing.approve_po'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const { skipEmail, reason, recipients: additionalRecipients } = req.body ?? {};
    const skip = Boolean(skipEmail);

    // Get the PO first for vendor lookup and pre-flight checks
    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    // Pre-flight status check (non-locking, for fast rejection)
    const issuableStatuses = ['Draft', 'RFQ Sent', 'Quote Received'];
    if (!issuableStatuses.includes(vendorPO.status ?? '')) {
      return res.status(400).json({ 
        error: 'PO cannot be issued', 
        message: `PO is already in ${vendorPO.status} status` 
      });
    }

    const performedBy = String((req as any).user?.username ?? (req as any).user?.id ?? 'unknown');
    const performedByEmail = (req as any).user?.email as string | undefined;
    const actor = {
      id: (req as any).user?.id,
      username: (req as any).user?.username,
      role: (req as any).user?.role,
    };

    const supplierQualificationBlockers = await getVendorQualificationBlockers(id, vendorPO.vendorId, vendorPO.productionLine ?? null);
    if (supplierQualificationBlockers.length > 0) {
      await emitProcurementLedgerEvent({
        action: VENDOR_PO_ISSUE_GATES_DEACTIVATED
          ? 'VENDOR_PO_ISSUE_SUPPLIER_QUALIFICATION_GATE_DEACTIVATED'
          : 'VENDOR_PO_ISSUE_BLOCKED_SUPPLIER_QUALIFICATION',
        entityId: id,
        actor,
        reason: supplierQualificationBlockers.join('; '),
        meta: {
          vendorPoId: id,
          vendorId: vendorPO.vendorId,
          productionLine: vendorPO.productionLine ?? null,
          blockers: supplierQualificationBlockers,
        },
      });
      if (!VENDOR_PO_ISSUE_GATES_DEACTIVATED) {
        return res.status(422).json({
          error: 'Supplier qualification gate failed',
          message: `Cannot issue PO. Reason(s): ${supplierQualificationBlockers.join('; ')}.`,
          supplierQualificationBlocked: true,
          blockingReasons: supplierQualificationBlockers,
        });
      }
    }

    // ── PURCHASING-CONTROLS GATE (Task #83): require approved requisition + FAR flowdowns ─
    {
      const { db: drizzleDb } = await import('../../db');
      const {
        purchaseRequisitions,
        vendorPoFarFlowdowns,
        procurementSettings,
      } = await import('../../schema');
      const { eq: dEq } = await import('drizzle-orm');

      const [setting] = await drizzleDb.select().from(procurementSettings).limit(1);
      const allowDirectPo = setting?.allowDirectPo ?? false;
      const directPoCap = setting?.directPoExceptionCapability ?? 'purchasing.direct_po_exception';

      const purchasingBlockers: string[] = [];

      // (1) Requisition linkage
      if (vendorPO.requisitionId) {
        const [r] = await drizzleDb.select().from(purchaseRequisitions)
          .where(dEq(purchaseRequisitions.id, vendorPO.requisitionId));
        if (!r) purchasingBlockers.push('Linked requisition not found');
        else if (r.status !== 'APPROVED' && r.status !== 'CONVERTED_TO_PO') {
          purchasingBlockers.push(`Linked requisition must be APPROVED (currently ${r.status})`);
        }
      } else if (vendorPO.directPoExceptionApprovedAt && allowDirectPo) {
        if (!vendorPO.directPoExceptionReason || vendorPO.directPoExceptionReason.trim().length < 10) {
          purchasingBlockers.push('Direct-PO exception reason missing or too short');
        }
        if (!vendorPO.directPoExceptionApprovedById || !vendorPO.directPoExceptionApprovedByName) {
          purchasingBlockers.push('Direct-PO exception is missing the approver identity');
        } else {
          // Verify the recorded approver actually held the exception capability
          // at approval time, using the approver's ACTUAL role (not a hard-coded
          // 'EMPLOYEE' assumption). Admin/owner roles bypass capability check.
          try {
            const { db: dDb2 } = await import('../../db');
            const { users: usersTable } = await import('../../schema');
            const { eq: dEq2 } = await import('drizzle-orm');
            const [approverUser] = await dDb2.select().from(usersTable)
              .where(dEq2(usersTable.id, vendorPO.directPoExceptionApprovedById));
            if (!approverUser) {
              purchasingBlockers.push(`Direct-PO exception approver id=${vendorPO.directPoExceptionApprovedById} no longer exists`);
            } else if (approverUser.role !== 'ADMIN' && approverUser.role !== 'OWNER') {
              const { getUserPermissions: gup } = await import('../services/permissionService');
              const { permissionSet } = await gup(approverUser.id, approverUser.role);
              if (!permissionSet.has(directPoCap)) {
                purchasingBlockers.push(`Direct-PO exception approver (${vendorPO.directPoExceptionApprovedByName}) lacks capability "${directPoCap}"`);
              }
            }
          } catch (e) {
            purchasingBlockers.push('Could not verify direct-PO exception approver permissions');
          }
        }
      } else if (vendorPO.directPoExceptionApprovedAt && !allowDirectPo) {
        // Temporarily allowed while requisition-backed PO workflow is being tuned.
      } else {
        // Temporarily allowed while requisition-backed PO workflow is being tuned.
      }

      // (2) Competition method must be set
      if (!vendorPO.competitionMethod) {
        purchasingBlockers.push('Competition method must be recorded (competed | sole-source | small-purchase | exception)');
      }
      if (vendorPO.competitionMethod === 'sole-source' &&
          (!vendorPO.soleSourceJustification || vendorPO.soleSourceJustification.trim().length < 10)) {
        purchasingBlockers.push('Sole-source justification required (≥10 characters)');
      }

      // (3) FAR flowdowns recorded (at least one row)
      const flowdowns = await drizzleDb.select().from(vendorPoFarFlowdowns)
        .where(dEq(vendorPoFarFlowdowns.vendorPoId, id));
      if (flowdowns.length === 0) {
        purchasingBlockers.push('FAR flowdown checklist has not been recorded for this PO');
      } else {
        for (const fd of flowdowns) {
          if (!fd.reasoning || fd.reasoning.trim().length < 3) {
            purchasingBlockers.push(`FAR flowdown clause ${fd.clauseId}: applicability reasoning missing`);
            break;
          }
        }
      }

      if (purchasingBlockers.length > 0 && VENDOR_PO_ISSUE_GATES_DEACTIVATED) {
        await emitProcurementLedgerEvent({
          action: 'VENDOR_PO_ISSUE_PURCHASING_CONTROLS_GATE_DEACTIVATED',
          entityId: id,
          actor,
          reason: purchasingBlockers.join('; '),
          meta: { vendorPoId: id, vendorId: vendorPO.vendorId, productionLine: vendorPO.productionLine ?? null, blockers: purchasingBlockers },
        });
      }

      // P2/customer-project purchases normally remain hard-blocked. This can be
      // re-enabled by turning off VENDOR_PO_ISSUE_GATES_DEACTIVATED.
      if (purchasingBlockers.length > 0 && isP2ProductionLine(vendorPO.productionLine) && !VENDOR_PO_ISSUE_GATES_DEACTIVATED) {
        await emitProcurementLedgerEvent({
          action: 'VENDOR_PO_ISSUE_BLOCKED_PURCHASING_CONTROLS',
          entityId: id,
          actor,
          reason: purchasingBlockers.join('; '),
          meta: { vendorPoId: id, vendorId: vendorPO.vendorId, productionLine: vendorPO.productionLine ?? null, blockers: purchasingBlockers },
        });
        return res.status(422).json({
          error: 'Purchasing controls gate failed',
          message: `Cannot issue PO. Reason(s): ${purchasingBlockers.join('; ')}.`,
          purchasingBlocked: true,
          blockingReasons: purchasingBlockers,
        });
      }
    }

    // ── COMPLIANCE GATE: Server-side enforcement (UI gate is not sufficient) ─
    // Only enforced for P2 POs. Non-P2 production lines (GENERAL/P1/R_AND_D) are
    // not gated by the compliance review even if a stale review row exists from
    // when the PO was previously P2. The same isP2ProductionLine guard is used by
    // requireP2ComplianceBeforeProjectAllocation so issuance and project-allocation
    // gates stay consistent. The DB row is left intact so flipping back to P2
    // re-surfaces the prior state (and invalidateVendorPoComplianceReview already
    // marks it 'requires_attention' on production-line change).
    const complianceReview = isP2ProductionLine(vendorPO.productionLine)
      ? await storage.getVendorPOComplianceReview(id)
      : null;
    if (isP2ProductionLine(vendorPO.productionLine)) {
      const blockingReasons: string[] = [];
      if (!complianceReview) {
        blockingReasons.push('No compliance review found — complete the pre-issue review before issuing');
      } else {
        // Explicit requires_attention check — PO changed after review
        if (complianceReview.reviewStatus === 'requires_attention') {
          blockingReasons.push('Compliance review requires attention because PO changed after review.');
        }
        if (complianceReview.reviewStatus !== 'reviewed') {
          blockingReasons.push(`Compliance review status is "${complianceReview.reviewStatus}" — must be "reviewed"`);
        }
        if (!complianceReview.secondPartyComplete) {
          blockingReasons.push('Second-party approval is not complete');
        }
        if (!complianceReview.vendorApproved) {
          blockingReasons.push('Vendor is not approved');
        }
        if (!complianceReview.reviewNotes?.trim()) {
          blockingReasons.push('Compliance justification is missing');
        }
      }
      if (blockingReasons.length > 0) {
        await emitProcurementLedgerEvent({
          action: VENDOR_PO_ISSUE_GATES_DEACTIVATED
            ? 'VENDOR_PO_ISSUE_COMPLIANCE_REVIEW_GATE_DEACTIVATED'
            : 'VENDOR_PO_ISSUE_BLOCKED_COMPLIANCE_REVIEW',
          entityId: id,
          actor,
          reason: blockingReasons.join('; '),
          meta: { vendorPoId: id, vendorId: vendorPO.vendorId, productionLine: vendorPO.productionLine ?? null, blockers: blockingReasons },
        });
        if (!VENDOR_PO_ISSUE_GATES_DEACTIVATED) {
          return res.status(422).json({
            error: 'Compliance review gate failed',
            message: `Cannot issue PO. Reason(s): ${blockingReasons.join('; ')}.`,
            complianceBlocked: true,
            blockingReasons,
          });
        }
      }
    }

    // ── PATH A: Issue WITHOUT emailing vendor (legacy/backfill) ──────────────
    if (skip) {
      const trimmedReason = typeof reason === 'string' && reason.trim().length >= 10
        ? reason.trim()
        : 'Issued without vendor email during temporary purchasing controls deactivation.';

      const nowAt = new Date();
      const { vendorPO: issuedPO, poNumber } = await storage.issueVendorPO(id, {
        issuedWithoutEmail: true,
        reason: trimmedReason,
        issuedWithoutEmailAt: nowAt,
        performedBy,
        performedByEmail,
      });
      await markLinkedPartsRequestsOrdered(id, performedBy);

      console.log(`[VendorPOIssuedNoEmail] PO ${poNumber} issued WITHOUT email by ${performedBy} — reason: ${trimmedReason}`);

      await emitProcurementLedgerEvent({
        action: 'VENDOR_PO_ISSUED_WITHOUT_EMAIL',
        entityId: id,
        actor,
        reason: trimmedReason,
        meta: { vendorPoId: id, vendorId: vendorPO.vendorId, poNumber, issuedWithoutEmail: true },
      });
      await recordVendorPoAudit(req, id, 'VENDOR_PO_ISSUED_WITHOUT_EMAIL', {
        before: vendorPO,
        after: issuedPO,
        reason: trimmedReason,
        fieldsChanged: buildFieldChanges(vendorPO, issuedPO, ['status', 'poNumber', 'issuedWithoutEmail', 'issuedWithoutEmailReason']),
        meta: { poNumber, issuedWithoutEmail: true },
      });

      // Task #83: NOW (post-issuance success) record po_issuance debarment evidence
      try {
        const fid = (req as any)._task83_freshDebarmentCheckId;
        if (fid && vendorPO.vendorId) {
          const { db: dDb } = await import('../../db');
          const { vendorDebarmentChecks: vdc } = await import('../../schema');
          await dDb.insert(vdc).values({
            vendorId: vendorPO.vendorId,
            context: 'po_issuance',
            contextRefId: id,
            source: (req as any)._task83_freshDebarmentSource,
            result: (req as any)._task83_freshDebarmentResult,
            checkedByUserId: (req as any).user?.id ?? null,
            checkedByDisplayName: (req as any).user?.username ?? null,
            notes: `Auto-recorded at PO issuance; references debarment check #${fid}`,
          });
        }
      } catch (e) { console.error('[Task #83] failed to record po_issuance evidence', e); }

      // Task #83: auto-convert linked requisition
      if (vendorPO.requisitionId) {
        try {
          const { db: drizzleDb } = await import('../../db');
          const { purchaseRequisitions } = await import('../../schema');
          const { eq: dEq } = await import('drizzle-orm');
          await drizzleDb.update(purchaseRequisitions).set({
            status: 'CONVERTED_TO_PO',
            convertedToPoId: id,
            convertedAt: new Date(),
            updatedAt: new Date(),
          }).where(dEq(purchaseRequisitions.id, vendorPO.requisitionId));
        } catch (e) {
          console.error('[Task #83] failed to auto-convert requisition', e);
        }
      }

      return res.json({
        ...issuedPO,
        emailSent: false,
        poNumber,
        message: 'PO marked as issued. Vendor was NOT notified.',
      });
    }

    // ── PATH B: Issue WITH vendor email (default path) ──────────
    const vendor = await storage.getVendor(vendorPO.vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    if (!vendor.email) {
      const nowAt = new Date();
      const fallbackReason = 'Issued without vendor email because vendor email is not configured.';
      const { vendorPO: issuedPO, poNumber } = await storage.issueVendorPO(id, {
        issuedWithoutEmail: true,
        reason: fallbackReason,
        issuedWithoutEmailAt: nowAt,
        performedBy,
        performedByEmail,
      });
      await markLinkedPartsRequestsOrdered(id, performedBy);

      await emitProcurementLedgerEvent({
        action: 'VENDOR_PO_ISSUED_WITHOUT_EMAIL',
        entityId: id,
        actor,
        reason: fallbackReason,
        meta: { vendorPoId: id, vendorId: vendorPO.vendorId, poNumber, issuedWithoutEmail: true, vendorEmailMissing: true },
      });
      await recordVendorPoAudit(req, id, 'VENDOR_PO_ISSUED_WITHOUT_EMAIL', {
        before: vendorPO,
        after: issuedPO,
        reason: fallbackReason,
        fieldsChanged: buildFieldChanges(vendorPO, issuedPO, ['status', 'poNumber', 'issuedWithoutEmail', 'issuedWithoutEmailReason']),
        meta: { poNumber, issuedWithoutEmail: true, vendorEmailMissing: true },
      });

      if (vendorPO.requisitionId) {
        try {
          const { db: drizzleDb } = await import('../../db');
          const { purchaseRequisitions } = await import('../../schema');
          const { eq: dEq } = await import('drizzle-orm');
          await drizzleDb.update(purchaseRequisitions).set({
            status: 'CONVERTED_TO_PO',
            convertedToPoId: id,
            convertedAt: new Date(),
            updatedAt: new Date(),
          }).where(dEq(purchaseRequisitions.id, vendorPO.requisitionId));
        } catch (e) {
          console.error('[Task #83] failed to auto-convert requisition', e);
        }
      }

      return res.json({
        ...issuedPO,
        emailSent: false,
        poNumber,
        message: 'PO issued successfully. Vendor email is not configured, so no confirmation email was sent.',
      });
    }

    // Atomic transactional issuance: lock row, generate number, update status
    const { vendorPO: issuedPO, poNumber } = await storage.issueVendorPO(id);
    await markLinkedPartsRequestsOrdered(id, performedBy);

    await emitProcurementLedgerEvent({
      action: 'VENDOR_PO_ISSUED',
      entityId: id,
      actor,
      meta: { vendorPoId: id, vendorId: vendorPO.vendorId, poNumber, issuedWithoutEmail: false },
    });
    await recordVendorPoAudit(req, id, 'VENDOR_PO_ISSUED', {
      before: vendorPO,
      after: issuedPO,
      fieldsChanged: buildFieldChanges(vendorPO, issuedPO, ['status', 'poNumber', 'issuedWithoutEmail']),
      meta: { poNumber, issuedWithoutEmail: false },
    });

    // Build standard email routing from Vendor PO settings plus the issuing user's email.
    const issuingUserEmail = (req as any).user?.email as string | undefined;
    const { returnEmail: issueReplyTo, cc: standardCc } = await getVendorPoEmailRouting(issuingUserEmail);

    // Derive authoritative to/cc from selected recipients (validated against vendor's allowed emails)
    const allowedEmails = await getAllowedVendorEmails(vendorPO.vendorId);
    const { to: issueToEmail, cc: issueCcList } = deriveToAndCc(
      additionalRecipients,
      vendor.email,
      allowedEmails,
      standardCc
    );

    const issueContext = {
      vendor_name: vendor.name,
      vendor_contact_person: vendor.contactPerson ? ` ${vendor.contactPerson}` : '',
      po_number: poNumber,
      requested_delivery_date: issuedPO.expectedDeliveryDate
        ? new Date(issuedPO.expectedDeliveryDate).toLocaleDateString()
        : '',
    };

    const emailResult = await sendCommunication({
      templateKey: 'vendor_po_issue',
      context: issueContext,
      to: issueToEmail,
      cc: issueCcList,
      replyTo: issueReplyTo,
      triggeredBy: performedBy,
      capabilityRequired: 'issue_vendor_po',
      orderId: String(id),
    });

    if (!emailResult.success) {
      const requestId = res.locals.requestId;
      const emailFailureMessage =
        emailResult.error || 'Email service unavailable. PO has been issued - you may resend the email later.';

      console.error('[VendorPOIssuedEmailFailed]', {
        requestId,
        poNumber,
        vendorPOId: id,
        to: issueToEmail,
        cc: issueCcList,
        error: emailResult.error,
      });

      return res.json({
        ...issuedPO,
        success: true,
        partialSuccess: true,
        emailSent: false,
        emailError: emailFailureMessage,
        retryAction: 'resend',
        poNumber,
        requestId,
        message: 'PO issued successfully, but the email was not sent. Use resend to notify the vendor.',
      });
    }
    await recordVendorPoAudit(req, id, 'VENDOR_PO_EMAIL_SENT', {
      after: issuedPO,
      meta: { poNumber, to: issueToEmail, cc: issueCcList, templateKey: 'vendor_po_issue' },
    });

    console.log(`[VendorPOIssuedEmailSent] PO ${poNumber} issued by ${performedBy} — email sent to ${issueToEmail}, cc: ${issueCcList.join(', ')}`);

    // Task #83: NOW (post-issuance success + email confirmed) record po_issuance evidence
    try {
      const fid = (req as any)._task83_freshDebarmentCheckId;
      if (fid && vendorPO.vendorId) {
        const { db: dDb } = await import('../../db');
        const { vendorDebarmentChecks: vdc } = await import('../../schema');
        await dDb.insert(vdc).values({
          vendorId: vendorPO.vendorId,
          context: 'po_issuance',
          contextRefId: id,
          source: (req as any)._task83_freshDebarmentSource,
          result: (req as any)._task83_freshDebarmentResult,
          checkedByUserId: (req as any).user?.id ?? null,
          checkedByDisplayName: (req as any).user?.username ?? null,
          notes: `Auto-recorded at PO issuance; references debarment check #${fid}`,
        });
      }
    } catch (e) { console.error('[Task #83] failed to record po_issuance evidence', e); }

    // Task #83: auto-convert linked requisition
    if (vendorPO.requisitionId) {
      try {
        const { db: drizzleDb } = await import('../../db');
        const { purchaseRequisitions } = await import('../../schema');
        const { eq: dEq } = await import('drizzle-orm');
        await drizzleDb.update(purchaseRequisitions).set({
          status: 'CONVERTED_TO_PO',
          convertedToPoId: id,
          convertedAt: new Date(),
          updatedAt: new Date(),
        }).where(dEq(purchaseRequisitions.id, vendorPO.requisitionId));
      } catch (e) {
        console.error('[Task #83] failed to auto-convert requisition', e);
      }
    }

    return res.json({
      ...issuedPO,
      emailSent: true,
      emailRecipient: issueToEmail,
      emailCc: issueCcList,
      message: `PO issued successfully. Email sent to ${issueToEmail}.`,
    });
  } catch (error: any) {
    console.error('Issue vendor PO error:', error);
    return sendApiError(res, error, {
      fallbackMessage: 'Failed to issue vendor PO',
      source: 'vendorPO.issue',
      exposeMessage: true,
    });
  }
});

// POST /api/vendor-pos/:id/rfq-transition - Transition an RFQ to Quote Received, Declined, or Expired
router.post('/:id/rfq-transition', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const transitionSchema = z.object({
      status: z.enum(['Quote Received', 'Declined', 'Expired']),
      rfqOutcomeNotes: z.string().optional(),
    });

    const { status, rfqOutcomeNotes } = transitionSchema.parse(req.body);

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    if (vendorPO.status !== 'RFQ Sent') {
      return res.status(400).json({
        error: 'RFQ transition not allowed',
        message: `Only RFQs in "RFQ Sent" status can be transitioned to ${status}. Current status: ${vendorPO.status}`,
      });
    }

    const updatePayload: Record<string, unknown> = { status };
    if (['Declined', 'Expired'].includes(status)) {
      updatePayload.rfqOutcomeNotes = rfqOutcomeNotes || null;
    }
    const updated = await storage.updateVendorPO(id, updatePayload);
    await recordVendorPoAudit(req, id, 'VENDOR_RFQ_STATUS_CHANGED', {
      before: vendorPO,
      after: updated,
      reason: normalizeAuditReason(rfqOutcomeNotes) || null,
      fieldsChanged: buildFieldChanges(vendorPO, updated, ['status', 'rfqOutcomeNotes']),
      meta: { fromStatus: vendorPO.status, toStatus: status },
    });
    return res.json(updated);
  } catch (error) {
    console.error('RFQ transition error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid transition data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to transition RFQ status' });
  }
});

// POST /api/vendor-pos/:id/archive - Toggle the archived flag on a vendor PO
router.post('/:id/archive', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const bodySchema = z.object({
      archived: z.boolean(),
    });

    const { archived } = bodySchema.parse(req.body);

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    // Only closed-state records can be archived
    const closedStatuses = ['Quote Received', 'Declined', 'Expired', 'Cancelled'];
    if (archived && !closedStatuses.includes(vendorPO.status)) {
      return res.status(400).json({
        error: 'Only closed-state RFQs can be archived',
        message: `Cannot archive a record in "${vendorPO.status}" status. Archive is only allowed for: ${closedStatuses.join(', ')}.`,
      });
    }

    const updated = await storage.updateVendorPO(id, { archived });
    await recordVendorPoAudit(req, id, archived ? 'VENDOR_PO_ARCHIVED' : 'VENDOR_PO_UNARCHIVED', {
      before: vendorPO,
      after: updated,
      fieldsChanged: buildFieldChanges(vendorPO, updated, ['archived']),
      meta: { archived },
    });
    return res.json(updated);
  } catch (error) {
    console.error('Archive toggle error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid archive data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update archive status' });
  }
});

// GET /api/vendor-pos/:id/confirmation - Get vendor confirmation status for an issued PO
router.get('/:id/confirmation', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    const issuedStatuses = ['Sent', 'Partially Received', 'Fully Received'];
    if (!issuedStatuses.includes(vendorPO.status)) {
      return res.status(404).json({ error: 'Confirmation status is only available for issued POs' });
    }

    const result = await db.execute(
      sql`SELECT email, expires_at AS "expiresAt", used_at AS "usedAt"
          FROM magic_link_tokens
          WHERE purpose = 'retired_vendor_po_acknowledgement'
            AND (metadata->>'vendorPoId')::int = ${id}
          ORDER BY created_at DESC
          LIMIT 1`
    );

    type ConfirmationRow = { email: string; expiresAt: string; usedAt: string | null };
    const rows: ConfirmationRow[] = (
      result && typeof result === 'object' && 'rows' in result
        ? (result as unknown as { rows: ConfirmationRow[] }).rows
        : result
    ) as ConfirmationRow[];

    if (!rows || rows.length === 0) {
      return res.json({ found: false });
    }

    const row = rows[0];
    return res.json({
      found: true,
      email: row.email,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt ?? null,
    });
  } catch (error) {
    console.error('Get vendor PO confirmation error:', error);
    res.status(500).json({ error: 'Failed to retrieve confirmation status' });
  }
});

router.post('/:id/resend', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    if (!['Sent', 'Partially Received'].includes(vendorPO.status)) {
      return res.status(400).json({
        error: 'PO cannot be resent',
        message: `Only issued POs (Sent or Partially Received) can be resent. Current status: ${vendorPO.status}`,
      });
    }

    if (!vendorPO.poNumber) {
      return res.status(400).json({ error: 'PO has no PO number assigned' });
    }

    const vendor = await storage.getVendor(vendorPO.vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    if (!vendor.email) {
      return res.status(400).json({
        error: 'Vendor email not configured',
        message: 'Please add a contact email for this vendor before resending the PO.',
      });
    }

    const { recipients: additionalRecipients } = req.body ?? {};

    const poNumber = vendorPO.poNumber;

    const resendingUserEmail = (req as any).user?.email as string | undefined;
    const { returnEmail: resendReplyTo, cc: standardResendCc } = await getVendorPoEmailRouting(resendingUserEmail);

    const resendAllowedEmails = await getAllowedVendorEmails(vendorPO.vendorId);
    const { to: resendToEmail, cc: resendCcList } = deriveToAndCc(
      additionalRecipients,
      vendor.email,
      resendAllowedEmails,
      standardResendCc
    );

    const resendContext = {
      vendor_name: vendor.name,
      vendor_contact_person: vendor.contactPerson ? ` ${vendor.contactPerson}` : '',
      po_number: poNumber,
      requested_delivery_date: vendorPO.expectedDeliveryDate
        ? new Date(vendorPO.expectedDeliveryDate).toLocaleDateString()
        : '',
    };

    const emailResult = await sendCommunication({
      templateKey: 'vendor_po_resend',
      context: resendContext,
      to: resendToEmail,
      cc: resendCcList,
      replyTo: resendReplyTo,
      triggeredBy: String((req as any).user?.id ?? (req as any).user?.username ?? 'unknown'),
      capabilityRequired: 'resend_vendor_po',
      orderId: String(id),
    });

    if (!emailResult.success) {
      console.error('Failed to resend PO email:', emailResult.error);
      const emailError: any = new Error(emailResult.error || 'Email service unavailable.');
      emailError.status = 503;
      return sendApiError(res, emailError, {
        fallbackMessage: 'Failed to resend PO email',
        source: 'vendorPO.resend.email',
        exposeMessage: true,
      });
    }

    console.log(`[VendorPOResent] PO ${poNumber} resent by user ${(req as any).user?.username ?? 'unknown'} — email sent to ${resendToEmail}, cc: ${resendCcList.join(', ')}`);
    await recordVendorPoAudit(req, id, 'VENDOR_PO_RESENT', {
      after: vendorPO,
      meta: { poNumber, to: resendToEmail, cc: resendCcList, templateKey: 'vendor_po_resend' },
    });

    res.json({
      emailSent: true,
      emailRecipient: resendToEmail,
      emailCc: resendCcList,
      message: `PO resent successfully. Email sent to ${resendToEmail}.`,
    });
  } catch (error) {
    console.error('Resend vendor PO error:', error);
    return sendApiError(res, error, {
      fallbackMessage: 'Failed to resend vendor PO',
      source: 'vendorPO.resend',
      exposeMessage: true,
    });
  }
});

// Vendor PO confirmation is retired. The routes remain only to give
// old emailed URLs a deterministic response instead of falling through.
router.get('/confirm/preview', async (_req: Request, res: Response) => {
  return res.status(410).json({
    valid: false,
    errorCode: 'VENDOR_CONFIRMATION_DISABLED',
    error: 'Vendor PO confirmation is no longer supported.',
  });
});

router.post('/confirm', async (_req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    errorCode: 'VENDOR_CONFIRMATION_DISABLED',
    error: 'Vendor PO confirmation is no longer supported.',
  });
});
export default router;
