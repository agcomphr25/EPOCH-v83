import { queryRows } from '../../db';
import { buildFinanceEvidenceHash } from './financeDecisionLedger.service';
import { evaluateP2ArCandidate } from './financeP2CandidatePolicy';

type PackingSlipLine = {
  poItemId?: number | null;
  partNumber?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
};

type ObservationRow = {
  id: string;
  packing_slip_number: string;
  status: string;
  ship_date: string | Date | null;
  customer_id: string;
  customer_name: string;
  po_number: string | null;
  line_items: unknown;
  total_quantity: number | string;
  is_no_charge_replacement: boolean;
  updated_at: string | Date | null;
  po_id: number | null;
  security_classification: string | null;
  payment_terms: string | null;
  billing_recipients: unknown;
  billing_recipient_version: string | Date | null;
  existing_invoice_count: number | string;
};

type BillingRecipient = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

type PoItemRow = {
  po_id: number;
  id: number;
  part_number: string;
  unit_price: number | string | null;
};

function linesOf(value: unknown): PackingSlipLine[] {
  return Array.isArray(value) ? (value as PackingSlipLine[]) : [];
}

function recipientsOf(value: unknown): BillingRecipient[] {
  return Array.isArray(value) ? (value as BillingRecipient[]) : [];
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export async function observeRealP2ArCandidates(requestedLimit = 100) {
  const limit = Math.min(250, Math.max(1, Math.trunc(requestedLimit || 100)));
  const rows = await queryRows<ObservationRow>(
    `SELECT ps.id,
            ps.packing_slip_number,
            ps.status,
            ps.ship_date,
            ps.customer_id,
            ps.customer_name,
            ps.po_number,
            ps.line_items,
            ps.total_quantity,
            ps.is_no_charge_replacement,
            ps.updated_at,
            lot.po_id,
            po.security_classification,
            customer.payment_terms,
            recipients.billing_recipients,
            recipients.billing_recipient_version,
            invoices.existing_invoice_count
       FROM p2_packing_slips ps
       LEFT JOIN p2_lot_numbers lot ON lot.id = ps.lot_number_id
       LEFT JOIN p2_purchase_orders po ON po.id = lot.po_id
       LEFT JOIN LATERAL (
         SELECT id, payment_terms
           FROM p2_customers
          WHERE customer_id = ps.customer_id
          ORDER BY id
          LIMIT 1
       ) customer ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(
                  jsonb_agg(jsonb_build_object(
                    'name', recipient_name,
                    'email', email,
                    'role', delivery_role
                  ) ORDER BY delivery_role DESC, lower(email)),
                  '[]'::jsonb
                ) AS billing_recipients,
                MAX(updated_at) AS billing_recipient_version
           FROM finance_billing_recipients
          WHERE customer_scope = 'P2'
            AND p2_customer_id = customer.id
            AND active = true
            AND receives_invoices = true
            AND effective_from <= CURRENT_DATE
            AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
       ) recipients ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS existing_invoice_count
           FROM ar_invoices
          WHERE packing_slip_id = ps.id
       ) invoices ON true
      ORDER BY ps.created_at DESC
      LIMIT $1`,
    [limit]
  );

  const poIds = Array.from(
    new Set(
      rows
        .map((row) => row.po_id)
        .filter((value): value is number => value !== null)
    )
  );
  const poItems = poIds.length
    ? await queryRows<PoItemRow>(
        `SELECT po_id, id, part_number, unit_price
           FROM p2_purchase_order_items
          WHERE po_id = ANY($1::int[])`,
        [poIds]
      )
    : [];
  const itemsByPo = new Map<number, PoItemRow[]>();
  for (const item of poItems) {
    itemsByPo.set(item.po_id, [...(itemsByPo.get(item.po_id) ?? []), item]);
  }

  const candidates = rows.map((row) => {
    const lines = linesOf(row.line_items);
    const recipients = recipientsOf(row.billing_recipients);
    const toRecipients = recipients.filter(
      (recipient) => recipient.role === 'TO' && isEmail(recipient.email)
    );
    const ccRecipients = recipients.filter(
      (recipient) => recipient.role === 'CC' && isEmail(recipient.email)
    );
    const poLines = row.po_id ? (itemsByPo.get(row.po_id) ?? []) : [];
    let pricingComplete = lines.length > 0;
    let subtotal = 0;

    for (const line of lines) {
      const matches = line.poItemId
        ? poLines.filter((item) => item.id === line.poItemId)
        : poLines.filter((item) => item.part_number === line.partNumber);
      const embeddedPrice =
        line.unitPrice === null || line.unitPrice === undefined
          ? null
          : finiteNumber(line.unitPrice);
      const resolvedPrice =
        embeddedPrice ??
        (matches.length === 1 ? finiteNumber(matches[0].unit_price) : null);
      if (resolvedPrice === null || resolvedPrice <= 0) pricingComplete = false;
      subtotal += finiteNumber(line.quantity) * (resolvedPrice ?? 0);
    }

    const evidence = {
      packingSlipId: row.id,
      packingSlipNumber: row.packing_slip_number,
      packingSlipStatus: row.status,
      shipDate: iso(row.ship_date),
      customerId: row.customer_id,
      customerName: row.customer_name,
      poNumber: row.po_number,
      paymentTerms: row.payment_terms,
      billingRecipientToCount: toRecipients.length,
      billingRecipientCcCount: ccRecipients.length,
      billingContactDesignated: toRecipients.length > 0,
      securityClassification: row.security_classification ?? 'internal',
      shippedQuantity: finiteNumber(row.total_quantity),
      billableQuantity: lines.reduce(
        (sum, line) => sum + finiteNumber(line.quantity),
        0
      ),
      lineCount: lines.length,
      pricingComplete,
      existingInvoiceCount: finiteNumber(row.existing_invoice_count),
      isNoChargeReplacement: row.is_no_charge_replacement === true,
    };
    const decision = evaluateP2ArCandidate({
      ...evidence,
      billingContact: toRecipients[0]?.email ?? null,
    });
    const sourceVersion = [
      iso(row.updated_at) ?? 'unknown',
      iso(row.billing_recipient_version) ?? 'no-billing-recipient',
    ].join('|');

    return {
      ...decision,
      packingSlipId: row.id,
      packingSlipNumber: row.packing_slip_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      poNumber: row.po_number,
      shipDate: evidence.shipDate,
      securityClassification: evidence.securityClassification,
      billingRecipientToCount: toRecipients.length,
      billingRecipientCcCount: ccRecipients.length,
      revenueStream: 'P2_NET30' as const,
      observedSubtotal: subtotal,
      sourceVersion,
      evidenceHash: buildFinanceEvidenceHash({
        subjectType: 'p2_ar_candidate_observation',
        subjectId: row.id,
        sourceVersion,
        evidenceSnapshot: evidence,
      }),
    };
  });

  return {
    mode: 'OBSERVE_ONLY' as const,
    generatedAt: new Date().toISOString(),
    recordCount: candidates.length,
    cleanCount: candidates.filter((candidate) => candidate.status === 'CLEAN')
      .length,
    blockedCount: candidates.filter(
      (candidate) => candidate.status === 'BLOCKED'
    ).length,
    controls: {
      productionReads: true,
      productionWrites: false,
      mayCreateDrafts: false,
      mayApprove: false,
      mayPost: false,
      maySend: false,
      aiUsed: false,
    },
    modelGap:
      'Legacy general contacts are not promoted automatically. Configure at least one active To recipient in the shared billing-recipient register.',
    candidates,
  };
}
