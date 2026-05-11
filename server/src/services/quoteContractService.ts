import { pool } from '../../db';

type QueryResult<T> = T[] | { rows?: T[] };

function rowsFrom<T>(result: QueryResult<T>): T[] {
  return Array.isArray(result) ? result : result.rows ?? [];
}

function firstRow<T>(result: QueryResult<T>): T | null {
  return rowsFrom(result)[0] ?? null;
}

function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function hasMeaningfulValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (value && typeof value === 'object') return Object.values(value).some(hasMeaningfulValue);
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized !== '' && normalized !== 'n/a' && normalized !== 'na' && normalized !== 'none';
}

function arrayPayload(value: unknown): unknown[] {
  if (!hasMeaningfulValue(value)) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueText(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function sameDate(a: unknown, b: unknown): boolean {
  if (!a || !b) return !a && !b;
  const ad = new Date(String(a));
  const bd = new Date(String(b));
  if (Number.isNaN(ad.getTime()) || Number.isNaN(bd.getTime())) return false;
  return ad.toISOString().slice(0, 10) === bd.toISOString().slice(0, 10);
}

function extractRevision(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? '');
    const match = text.match(/\b(?:rev(?:ision)?\.?\s*)([A-Z0-9.-]+)\b/i);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

function extractClauseNumbers(...values: unknown[]): string[] {
  const clauses: string[] = [];
  for (const value of values) {
    const text = JSON.stringify(value ?? '');
    const matches = text.match(/\b(?:FAR|DFARS)\s+\d{1,3}\.\d{3}(?:-\d+)?\b/gi) ?? [];
    clauses.push(...matches.map((match) => match.replace(/\s+/g, ' ').toUpperCase()));
  }
  return uniqueText(clauses);
}

function buildSnapshotPayloadChecks(payload: Record<string, unknown>) {
  const checks = Object.entries(payload).map(([key, value]) => ({
    key,
    present: hasMeaningfulValue(value),
    count: Array.isArray(value) ? value.length : hasMeaningfulValue(value) ? 1 : 0,
  }));
  return {
    complete: checks.every((check) => check.present),
    missing: checks.filter((check) => !check.present).map((check) => check.key),
    checks,
  };
}

async function nextRevisionNumber(quoteId: string): Promise<number> {
  const row = firstRow<{ next_revision: number }>(
    await pool.query(
      `SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision
       FROM quote_snapshots
       WHERE quote_id = $1`,
      [quoteId],
    ),
  );
  return Number(row?.next_revision ?? 1);
}

async function latestSnapshot(quoteId: string) {
  return firstRow<any>(
    await pool.query(
      `SELECT *
       FROM quote_snapshots
       WHERE quote_id = $1
       ORDER BY revision_number DESC
       LIMIT 1`,
      [quoteId],
    ),
  );
}

async function loadEstimatingContext(quoteId: string) {
  const rfq = firstRow<any>(
    await pool.query(
      `SELECT *
       FROM estimating_rfqs
       WHERE quote_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [quoteId],
    ),
  );

  if (!rfq) {
    return {
      rfq: null,
      bomLines: [],
      processRows: [],
      pricingSnapshots: [],
      quantityBreaks: [],
      complianceFlags: [],
    };
  }

  const [bomLines, processRows, pricingSnapshots, quantityBreaks, parts] = await Promise.all([
    pool.query(`SELECT * FROM estimating_bom_lines WHERE rfq_id = $1 ORDER BY created_at, id`, [rfq.id]),
    pool.query(`SELECT * FROM estimating_process_rows WHERE rfq_id = $1 ORDER BY created_at, id`, [rfq.id]),
    pool.query(`SELECT * FROM estimating_pricing_snapshots WHERE rfq_id = $1 ORDER BY calculated_at, id`, [rfq.id]),
    pool.query(`SELECT * FROM estimating_quantity_breaks WHERE rfq_id = $1 ORDER BY quantity, id`, [rfq.id]),
    pool.query(`SELECT line_number, part_number, revision, compliance_flags FROM estimating_rfq_parts WHERE rfq_id = $1 ORDER BY line_number`, [rfq.id]),
  ]);

  return {
    rfq,
    bomLines: rowsFrom<any>(bomLines),
    processRows: rowsFrom<any>(processRows),
    pricingSnapshots: rowsFrom<any>(pricingSnapshots),
    quantityBreaks: rowsFrom<any>(quantityBreaks),
    complianceFlags: rowsFrom<any>(parts).map((p) => ({
      lineNumber: p.line_number,
      partNumber: p.part_number,
      revision: p.revision,
      flags: p.compliance_flags ?? [],
    })),
  };
}

export async function createQuoteSnapshot(
  quoteId: string,
  options: {
    revisionLabel?: string | null;
    exclusions?: unknown;
    certRequirements?: unknown;
    contractualClauses?: unknown;
    sentAt?: Date;
  } = {},
) {
  const quote = firstRow<any>(
    await pool.query(
      `SELECT *
       FROM quotes
       WHERE id = $1`,
      [quoteId],
    ),
  );
  if (!quote) {
    throw new Error(`Quote ${quoteId} not found`);
  }

  const lineItems = rowsFrom<any>(
    await pool.query(
      `SELECT *
       FROM quote_line_items
       WHERE quote_id = $1
       ORDER BY line_number`,
      [quoteId],
    ),
  );

  const revisionNumber = await nextRevisionNumber(quoteId);
  const estimating = await loadEstimatingContext(quoteId);
  const revisionLabel =
    options.revisionLabel ||
    estimating.rfq?.revision ||
    `R${revisionNumber}`;
  const sentAt = options.sentAt ?? new Date();
  const leadTimes = {
    pricingSnapshots: estimating.pricingSnapshots.map((snap) => ({
      rfqPartId: snap.rfq_part_id,
      quantityBreakId: snap.quantity_break_id,
      leadTimeDays: snap.lead_time_days,
    })),
    quantityBreaks: estimating.quantityBreaks,
  };
  const exclusions = arrayPayload(options.exclusions);
  const certRequirements = arrayPayload(options.certRequirements ?? estimating.complianceFlags);
  const contractualClauses = uniqueText([
    ...arrayPayload(options.contractualClauses),
    ...extractClauseNumbers(quote.notes, options.exclusions, options.certRequirements, estimating.complianceFlags, estimating.rfq),
  ]);
  const payloadChecks = buildSnapshotPayloadChecks({
    bomAssumptions: estimating.bomLines,
    laborAssumptions: estimating.processRows,
    leadTimes,
    exclusions,
    certRequirements,
    contractualClauses,
  });

  const snapshot = firstRow<any>(
    await pool.query(
      `INSERT INTO quote_snapshots (
        quote_id, quote_number, revision_number, revision_label, status_at_snapshot,
        customer_id, customer_name, customers_integer_id, description, total_amount,
        valid_until, quoted_by, notes, bom_assumptions, labor_assumptions,
        lead_times, exclusions, cert_requirements, contractual_clauses, source_data, sent_at
       ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14::jsonb, $15::jsonb,
        $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21
       )
       RETURNING *`,
      [
        quote.id,
        quote.quote_number,
        revisionNumber,
        String(revisionLabel),
        'SENT',
        quote.customer_id,
        quote.customer_name,
        quote.customers_integer_id ?? null,
        quote.description ?? null,
        Number(quote.total_amount ?? 0),
        quote.valid_until ?? null,
        quote.quoted_by ?? null,
        quote.notes ?? null,
        JSON.stringify(estimating.bomLines),
        JSON.stringify(estimating.processRows),
        JSON.stringify(leadTimes),
        JSON.stringify(exclusions),
        JSON.stringify(certRequirements),
        JSON.stringify(contractualClauses),
        JSON.stringify({ estimatingRfq: estimating.rfq, payloadChecks }),
        sentAt,
      ],
    ),
  );

  if (!snapshot) {
    throw new Error(`Failed to create snapshot for quote ${quoteId}`);
  }

  for (const item of lineItems) {
    const partRevision = estimating.complianceFlags.find(
      (flag) => Number(flag.lineNumber) === Number(item.line_number),
    )?.revision;
    await pool.query(
      `INSERT INTO quote_line_snapshots (
        quote_snapshot_id, quote_id, quote_line_item_id, line_number, quantity,
        description, unit_price, total_price, inventory_item_id, ag_part_number,
        line_revision, labor_hours, department, bom_assumptions, labor_assumptions,
        lead_time_days, cert_requirements
       ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14::jsonb, $15::jsonb,
        $16, $17::jsonb
       )`,
      [
        snapshot.id,
        quote.id,
        item.id,
        item.line_number,
        Number(item.quantity ?? 1),
        item.description,
        Number(item.unit_price ?? 0),
        Number(item.total_price ?? 0),
        item.inventory_item_id ?? null,
        item.ag_part_number ?? null,
        extractRevision(item.ag_part_number, item.description) ?? partRevision ?? null,
        item.labor_hours ?? null,
        item.department ?? null,
        JSON.stringify(estimating.bomLines.filter((line) => line.rfq_part_id === item.id)),
        JSON.stringify(estimating.processRows.filter((row) => row.rfq_part_id === item.id)),
        null,
        JSON.stringify(estimating.complianceFlags.find((flag) => Number(flag.lineNumber) === Number(item.line_number)) ?? null),
      ],
    );
  }

  return snapshot;
}

export async function getQuoteContractReviewGate(quoteId: string | null | undefined, projectId?: string | null) {
  if (!quoteId && !projectId) {
    return {
      key: 'contract_review',
      label: 'Contract Review',
      passed: false,
      status: 'missing_link',
      message: 'No source quote or project link is available for contract review.',
    };
  }

  const snapshot = quoteId ? await latestSnapshot(quoteId) : null;
  const params: unknown[] = [];
  const predicates: string[] = [];
  if (quoteId) {
    params.push(quoteId);
    predicates.push(`form_data->>'quoteId' = $${params.length}`);
    predicates.push(`form_data->>'quote_id' = $${params.length}`);
  }
  if (projectId) {
    params.push(projectId);
    predicates.push(`form_data->>'projectId' = $${params.length}`);
    predicates.push(`form_data->>'project_id' = $${params.length}`);
  }

  const review = predicates.length > 0
    ? firstRow<any>(
        await pool.query(
          `SELECT id, status, form_data, updated_at
           FROM purchase_review_checklists
           WHERE ${predicates.map((predicate) => `(${predicate})`).join(' OR ')}
           ORDER BY updated_at DESC, created_at DESC
           LIMIT 1`,
          params,
        ),
      )
    : null;
  const reviewApproved = normalizeText(review?.status) === 'approved';

  return {
    key: 'contract_review',
    label: 'Contract Review',
    passed: Boolean(snapshot && reviewApproved),
    status: !snapshot ? 'missing_snapshot' : reviewApproved ? 'approved' : review ? 'review_not_approved' : 'missing_review',
    quoteSnapshotId: snapshot?.id ?? null,
    quoteRevision: snapshot?.revision_label ?? null,
    purchaseReviewChecklistId: review?.id ?? null,
    purchaseReviewStatus: review?.status ?? null,
    message: !snapshot
      ? 'A sent quote snapshot is required before project release.'
      : reviewApproved
        ? 'Contract review is approved for the quote snapshot.'
        : 'Purchase review checklist must be approved before project release.',
  };
}

export async function reconcileCustomerPoToQuote(poId: number) {
  const po = firstRow<any>(
    await pool.query(
      `SELECT *
       FROM p2_purchase_orders
       WHERE id = $1`,
      [poId],
    ),
  );
  if (!po?.source_quote_id) return null;

  const snapshot = await latestSnapshot(po.source_quote_id);
  if (!snapshot) {
    const summary = { missingSnapshot: 'No sent quote snapshot exists for this source quote.' };
    return firstRow<any>(
      await pool.query(
        `INSERT INTO quote_po_reconciliations (
          quote_id, quote_snapshot_id, p2_purchase_order_id, po_number, status,
          revision_mismatch, pricing_mismatch, clause_mismatch, schedule_mismatch,
          quantity_mismatch, mismatch_summary
        ) VALUES ($1, NULL, $2, $3, 'MISMATCH', true, false, false, false, false, $4::jsonb)
        RETURNING *`,
        [po.source_quote_id, po.id, po.po_number, JSON.stringify(summary)],
      ),
    );
  }

  const [snapshotLinesResult, poItemsResult] = await Promise.all([
    pool.query(
      `SELECT *
       FROM quote_line_snapshots
       WHERE quote_snapshot_id = $1
       ORDER BY line_number`,
      [snapshot.id],
    ),
    pool.query(
      `SELECT *
       FROM p2_purchase_order_items
       WHERE po_id = $1
       ORDER BY id`,
      [po.id],
    ),
  ]);
  const snapshotLines = rowsFrom<any>(snapshotLinesResult);
  const poItems = rowsFrom<any>(poItemsResult);

  const quoteTotal = money(snapshot.total_amount);
  const poTotal = money(poItems.reduce((sum, item) => sum + Number(item.total_price ?? Number(item.quantity ?? 0) * Number(item.unit_price ?? 0)), 0));
  const pricingMismatch = Math.abs(quoteTotal - poTotal) > 0.01;

  const quoteQty = snapshotLines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
  const poQty = poItems.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const quantityMismatch = quoteQty !== poQty;

  const quoteRevision = normalizeText(snapshot.revision_label);
  const poRevisionCandidates = poItems.map((item) => extractRevision(item.part_number, item.part_name, item.specifications)).filter(Boolean);
  const revisionMismatch = poRevisionCandidates.length > 0 && quoteRevision !== '' && !poRevisionCandidates.some((rev) => normalizeText(rev) === quoteRevision);

  const scheduleMismatch =
    snapshot.valid_until && po.expected_delivery
      ? !sameDate(snapshot.valid_until, po.expected_delivery) && new Date(String(po.expected_delivery)) > new Date(String(snapshot.valid_until))
      : false;

  const snapshotCerts = JSON.stringify(snapshot.cert_requirements ?? []);
  const snapshotClauses = JSON.stringify(snapshot.contractual_clauses ?? []);
  const poClauseText = normalizeText(`${po.notes ?? ''} ${poItems.map((item) => `${item.specifications ?? ''} ${item.notes ?? ''}`).join(' ')}`);
  const clauseMismatch =
    ((snapshotCerts !== '[]' && snapshotCerts !== 'null') || (snapshotClauses !== '[]' && snapshotClauses !== 'null')) &&
    !poClauseText.includes('cert') &&
    !poClauseText.includes('coc') &&
    !poClauseText.includes('sds') &&
    !poClauseText.includes('tds') &&
    !poClauseText.includes('far') &&
    !poClauseText.includes('dfars');

  const status =
    revisionMismatch || pricingMismatch || clauseMismatch || scheduleMismatch || quantityMismatch
      ? 'MISMATCH'
      : 'MATCH';

  const summary = {
    quantity: { quote: quoteQty, po: poQty, mismatch: quantityMismatch },
    pricing: { quoteTotal, poTotal, mismatch: pricingMismatch },
    revision: { quoteRevision: snapshot.revision_label, poRevisions: poRevisionCandidates, mismatch: revisionMismatch },
    schedule: { quoteValidUntil: snapshot.valid_until, poExpectedDelivery: po.expected_delivery, mismatch: scheduleMismatch },
    clauses: { requiredCerts: snapshot.cert_requirements ?? [], contractualClauses: snapshot.contractual_clauses ?? [], mismatch: clauseMismatch },
  };

  return firstRow<any>(
    await pool.query(
      `INSERT INTO quote_po_reconciliations (
        quote_id, quote_snapshot_id, p2_purchase_order_id, po_number, status,
        revision_mismatch, pricing_mismatch, clause_mismatch, schedule_mismatch,
        quantity_mismatch, mismatch_summary
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11::jsonb
      )
      RETURNING *`,
      [
        po.source_quote_id,
        snapshot.id,
        po.id,
        po.po_number,
        status,
        revisionMismatch,
        pricingMismatch,
        clauseMismatch,
        scheduleMismatch,
        quantityMismatch,
        JSON.stringify(summary),
      ],
    ),
  );
}

export async function getLatestQuotePoReconciliation(poId: number) {
  return firstRow<any>(
    await pool.query(
      `SELECT *
       FROM quote_po_reconciliations
       WHERE p2_purchase_order_id = $1
       ORDER BY checked_at DESC, created_at DESC
       LIMIT 1`,
      [poId],
    ),
  );
}

export async function getLatestQuotePoReconciliations() {
  return rowsFrom<any>(
    await pool.query(
      `SELECT DISTINCT ON (p2_purchase_order_id) *
       FROM quote_po_reconciliations
       ORDER BY p2_purchase_order_id, checked_at DESC, created_at DESC`,
    ),
  );
}
