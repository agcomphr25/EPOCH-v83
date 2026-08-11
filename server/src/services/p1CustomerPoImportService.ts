import crypto from 'crypto';

import Papa from 'papaparse';

import { pool } from '../../db';
import { auditService } from './auditService';
import {
  createP1QuantityAdjustmentBatch,
  getP1POLineReconciliation,
  type P1POLineReconciliation,
} from './p1POReconciliationService';
import { getFileStorageProvider } from './fileStorageProvider';

export type P1ImportDocumentType = 'NEW_PO_PDF' | 'CANCELLATION_CSV';
export type P1ImportRowStatus =
  | 'READY'
  | 'ALREADY_APPLIED'
  | 'APPLIED'
  | 'PO_NOT_FOUND'
  | 'PO_ALREADY_EXISTS'
  | 'LINE_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_CONFLICT'
  | 'QUANTITY_MISMATCH'
  | 'RECEIPT_MISMATCH'
  | 'INVALID_TOTALS'
  | 'CANCELLATION_CONFLICT';

export interface P1ImportActor {
  userId: number;
  displayName: string;
  username?: string;
  role?: string;
}

export interface P1ImportFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface P1ImportPreviewRow {
  rowNumber: number;
  poNumber: string;
  poDate: string | null;
  dueDate: string | null;
  description: string;
  supplierProductNumber: string;
  customerProductNumber: string | null;
  originalOrderQuantity: number;
  customerReceivedQuantity: number | null;
  customerRemainingQuantity: number | null;
  targetCanceledQuantity: number | null;
  unitPrice: number | null;
  extendedPrice: number | null;
  purchaseOrderId: number | null;
  purchaseOrderItemId: number | null;
  productId: number | null;
  productType: string | null;
  productData?: Record<string, unknown> | null;
  currentCanceledQuantity: number | null;
  cancellationDelta: number;
  reconciliation: P1POLineReconciliation | null;
  status: P1ImportRowStatus;
  message: string;
}

export interface P1ImportPreviewGroup {
  poNumber: string;
  purchaseOrderId: number | null;
  status: 'READY' | 'NO_CHANGES' | 'BLOCKED';
  rows: P1ImportPreviewRow[];
}

export interface P1ImportPreview {
  documentType: P1ImportDocumentType;
  customerName: string;
  fileName: string;
  fileSha256: string;
  duplicateImport: null | {
    id: string;
    status: string;
    createdAt: string;
  };
  groups: P1ImportPreviewGroup[];
  summary: {
    poCount: number;
    lineCount: number;
    readyPoCount: number;
    blockedPoCount: number;
    noChangePoCount: number;
    originalQuantity: number;
    targetCanceledQuantity: number;
    cancellationDelta: number;
    documentTotal: number | null;
  };
  parsed: Record<string, unknown>;
}

type MidwayCsvRow = {
  poNumber: string;
  poDate: string;
  dueDate: string;
  description: string;
  customerProductNumber: string;
  supplierProductNumber: string;
  originalOrderQuantity: number;
  customerReceivedQuantity: number;
  customerRemainingQuantity: number;
  targetCanceledQuantity: number;
};

type MidwayPdfLine = {
  supplierProductNumber: string;
  customerProductNumber: string;
  quantity: number;
  description: string;
  unitPrice: number;
  extendedPrice: number;
};

type MidwayPdf = {
  poNumber: string;
  poDate: string;
  shipOnDate: string;
  totalQuantity: number;
  poTotal: number;
  lines: MidwayPdfLine[];
};

function normalizeIdentifier(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function parseInteger(
  value: unknown,
  label: string,
  rowNumber: number
): number {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Row ${rowNumber}: ${label} must be a whole number`);
  }
  return Number(raw);
}

function toIsoDate(value: string, label: string): string {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match)
    throw new Error(`${label} is not a valid MM/DD/YYYY date: ${value}`);
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

export function parseMidwayCancellationCsv(buffer: Buffer): MidwayCsvRow[] {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    throw new Error(`CSV could not be read: ${parsed.errors[0].message}`);
  }
  const required = [
    'PO#',
    'PO Date',
    'Due Date',
    'PO Description',
    'MidwayUSA Prod#',
    'Supplier Product #',
    'Original Order Qty',
    'Qty Received',
    'Qty Remaining',
    'Total Qty Canceled',
  ];
  const fields = parsed.meta.fields ?? [];
  const missing = required.filter((field) => !fields.includes(field));
  if (missing.length > 0) {
    throw new Error(
      `Not a supported Midway cancellation CSV. Missing: ${missing.join(', ')}`
    );
  }

  return parsed.data.map((row, index) => {
    const rowNumber = index + 2;
    const result: MidwayCsvRow = {
      poNumber: String(row['PO#'] ?? '').trim(),
      poDate: toIsoDate(
        String(row['PO Date'] ?? ''),
        `Row ${rowNumber} PO Date`
      ),
      dueDate: toIsoDate(
        String(row['Due Date'] ?? ''),
        `Row ${rowNumber} Due Date`
      ),
      description: String(row['PO Description'] ?? '').trim(),
      customerProductNumber: normalizeIdentifier(row['MidwayUSA Prod#']),
      supplierProductNumber: normalizeIdentifier(row['Supplier Product #']),
      originalOrderQuantity: parseInteger(
        row['Original Order Qty'],
        'Original Order Qty',
        rowNumber
      ),
      customerReceivedQuantity: parseInteger(
        row['Qty Received'],
        'Qty Received',
        rowNumber
      ),
      customerRemainingQuantity: parseInteger(
        row['Qty Remaining'],
        'Qty Remaining',
        rowNumber
      ),
      targetCanceledQuantity: parseInteger(
        row['Total Qty Canceled'],
        'Total Qty Canceled',
        rowNumber
      ),
    };
    if (!result.poNumber || !result.supplierProductNumber) {
      throw new Error(
        `Row ${rowNumber}: PO# and Supplier Product # are required`
      );
    }
    return result;
  });
}

export function parseMidwayPoText(text: string): MidwayPdf {
  if (!/MidwayUSA,\s*Inc\./i.test(text)) {
    throw new Error('The PDF is not recognized as a MidwayUSA purchase order');
  }
  const poNumber = text.match(/PO\s*#\s*(\d+)/i)?.[1];
  const poDateRaw = text.match(/PO\s*Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
  // Extracted Midway PDFs place the date on the next visual line after the
  // payment-terms text, so allow a bounded amount of intervening content.
  const shipOnRaw = text.match(
    /Ship\s*On:[\s\S]{0,500}?(\d{1,2}\/\d{1,2}\/\d{4})/i
  )?.[1];
  const totalMatch = text.match(
    /Total\s*Qty:\s*(\d+)\s+PO\s*Total:\s*\$([\d,]+\.\d{2})/i
  );
  if (!poNumber || !poDateRaw || !shipOnRaw || !totalMatch) {
    throw new Error(
      'The Midway PDF is missing its PO number, dates, quantity total, or dollar total'
    );
  }

  const header = 'Description Cost Each Ext. Cost';
  const start = text.indexOf(header);
  const end = text.indexOf('Gross Cost', start + header.length);
  if (start < 0 || end < 0)
    throw new Error('The Midway PDF line-item table could not be located');
  const bodyLines = text
    .slice(start + header.length, end)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Product\s*#\s+Product\s*#$/i.test(line));
  const pricedLine =
    /^(.+?)\s+(\d+)\s+(\d{5,})\s+(.+?)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})$/;
  const lines: MidwayPdfLine[] = [];
  for (const line of bodyLines) {
    const match = line.match(pricedLine);
    if (match) {
      lines.push({
        supplierProductNumber: normalizeIdentifier(match[1]),
        quantity: Number(match[2]),
        customerProductNumber: normalizeIdentifier(match[3]),
        description: match[4].trim(),
        unitPrice: Number(match[5].replace(/,/g, '')),
        extendedPrice: Number(match[6].replace(/,/g, '')),
      });
      continue;
    }

    const current = lines.at(-1);
    if (!current) {
      throw new Error(
        `Unable to parse Midway PO line near: ${line.slice(0, 100)}`
      );
    }

    // Midway prints a wrapped supplier part-number fragment in the first column,
    // followed by any wrapped description text. PDF extraction flattens the
    // columns onto one line, so restore the identifier before matching products.
    const [possibleSkuFragment, ...descriptionWords] = line.split(/\s+/);
    const isWrappedSku =
      /^[A-Z0-9-]+$/.test(possibleSkuFragment) &&
      (current.supplierProductNumber.endsWith('-') ||
        (possibleSkuFragment.length <= 2 && descriptionWords.length > 0));
    if (isWrappedSku) {
      current.supplierProductNumber = normalizeIdentifier(
        `${current.supplierProductNumber}${possibleSkuFragment}`
      );
      if (descriptionWords.length > 0) {
        current.description =
          `${current.description} ${descriptionWords.join(' ')}`.trim();
      }
    } else {
      current.description = `${current.description} ${line}`.trim();
    }
  }
  if (lines.length === 0) throw new Error('No Midway PO line items were found');

  const totalQuantity = Number(totalMatch[1]);
  const poTotal = Number(totalMatch[2].replace(/,/g, ''));
  const parsedQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const parsedTotal = lines.reduce((sum, line) => sum + line.extendedPrice, 0);
  const invalidLine = lines.find(
    (line) =>
      Math.abs(line.quantity * line.unitPrice - line.extendedPrice) > 0.005
  );
  if (
    invalidLine ||
    parsedQuantity !== totalQuantity ||
    Math.abs(parsedTotal - poTotal) > 0.005
  ) {
    throw new Error(
      'The Midway PDF line quantities or prices do not reconcile to its printed totals'
    );
  }

  return {
    poNumber,
    poDate: toIsoDate(poDateRaw, 'PO Date'),
    shipOnDate: toIsoDate(shipOnRaw, 'Ship On date'),
    totalQuantity,
    poTotal,
    lines,
  };
}

async function extractPdf(buffer: Buffer): Promise<MidwayPdf> {
  const { PDFParse } = await import('pdf-parse/node');
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
  try {
    const result = await parser.getText();
    return parseMidwayPoText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function duplicateImport(fileSha256: string) {
  const result = await pool.query<{
    id: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT id, status, created_at
       FROM p1_customer_po_document_imports
      WHERE file_sha256 = $1`,
    [fileSha256]
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        status: row.status,
        createdAt: row.created_at.toISOString(),
      }
    : null;
}

function groupStatus(
  rows: P1ImportPreviewRow[]
): P1ImportPreviewGroup['status'] {
  if (rows.every((row) => row.status === 'ALREADY_APPLIED'))
    return 'NO_CHANGES';
  if (rows.every((row) => ['READY', 'ALREADY_APPLIED'].includes(row.status)))
    return 'READY';
  return 'BLOCKED';
}

async function previewCancellationRows(
  rows: MidwayCsvRow[]
): Promise<P1ImportPreviewGroup[]> {
  const poNumbers = Array.from(new Set(rows.map((row) => row.poNumber)));
  const poResult = await pool.query<{ id: number; po_number: string }>(
    `SELECT id, po_number FROM purchase_orders WHERE po_number = ANY($1::text[])`,
    [poNumbers]
  );
  const poByNumber = new Map(
    poResult.rows.map((row) => [row.po_number, row.id])
  );
  const groups: P1ImportPreviewGroup[] = [];

  for (const poNumber of poNumbers) {
    const purchaseOrderId = poByNumber.get(poNumber) ?? null;
    const sourceRows = rows.filter((row) => row.poNumber === poNumber);
    let itemRows: Array<{
      id: number;
      quantity: number;
      item_name: string | null;
      product_name: string | null;
      customer_product_number: string | null;
    }> = [];
    if (purchaseOrderId) {
      const itemResult = await pool.query(
        `SELECT poi.id, poi.quantity, poi.item_name,
                pp.product_name, pp.customer_product_number
           FROM purchase_order_items poi
           LEFT JOIN po_products pp ON pp.id::text = poi.item_id
          WHERE poi.po_id = $1`,
        [purchaseOrderId]
      );
      itemRows = itemResult.rows;
    }

    const previewRows: P1ImportPreviewRow[] = [];
    for (const source of sourceRows) {
      const base = {
        rowNumber: rows.indexOf(source) + 2,
        poNumber,
        poDate: source.poDate,
        dueDate: source.dueDate,
        description: source.description,
        supplierProductNumber: source.supplierProductNumber,
        customerProductNumber: source.customerProductNumber,
        originalOrderQuantity: source.originalOrderQuantity,
        customerReceivedQuantity: source.customerReceivedQuantity,
        customerRemainingQuantity: source.customerRemainingQuantity,
        targetCanceledQuantity: source.targetCanceledQuantity,
        unitPrice: null,
        extendedPrice: null,
        purchaseOrderId,
        productId: null,
        productType: null,
        productData: null,
      };
      if (!purchaseOrderId) {
        previewRows.push({
          ...base,
          purchaseOrderItemId: null,
          currentCanceledQuantity: null,
          cancellationDelta: 0,
          reconciliation: null,
          status: 'PO_NOT_FOUND',
          message: `PO ${poNumber} was not found in EPOCH`,
        });
        continue;
      }

      const supplier = normalizeIdentifier(source.supplierProductNumber);
      const customerProduct = normalizeIdentifier(source.customerProductNumber);
      const candidates = itemRows.filter((item) => {
        const itemSupplier = normalizeIdentifier(
          item.product_name || item.item_name
        );
        const itemCustomer = normalizeIdentifier(item.customer_product_number);
        return (
          itemSupplier === supplier ||
          (!!customerProduct && itemCustomer === customerProduct)
        );
      });
      const exact = candidates.filter(
        (item) =>
          normalizeIdentifier(item.product_name || item.item_name) ===
            supplier &&
          normalizeIdentifier(item.customer_product_number) === customerProduct
      );
      const item =
        exact.length === 1
          ? exact[0]
          : candidates.length === 1
            ? candidates[0]
            : null;
      if (!item) {
        previewRows.push({
          ...base,
          purchaseOrderItemId: null,
          currentCanceledQuantity: null,
          cancellationDelta: 0,
          reconciliation: null,
          status: candidates.length > 1 ? 'PRODUCT_CONFLICT' : 'LINE_NOT_FOUND',
          message:
            candidates.length > 1
              ? 'Multiple EPOCH lines match these product identifiers'
              : 'No EPOCH line matches both the PO and product identifiers',
        });
        continue;
      }

      const reconciliation = await getP1POLineReconciliation(item.id);
      if (!reconciliation)
        throw new Error(`Unable to reconcile PO item ${item.id}`);
      const delta =
        source.targetCanceledQuantity - reconciliation.canceledDemandQuantity;
      let status: P1ImportRowStatus = 'READY';
      let message = `Apply ${delta} additional cancellation${delta === 1 ? '' : 's'}`;
      const sourceReconciles =
        source.originalOrderQuantity ===
        source.customerReceivedQuantity +
          source.customerRemainingQuantity +
          source.targetCanceledQuantity;
      if (!sourceReconciles) {
        status = 'INVALID_TOTALS';
        message =
          'Midway quantities do not reconcile: original must equal received + remaining + canceled';
      } else if (
        source.originalOrderQuantity !== reconciliation.originalOrderedQuantity
      ) {
        status = 'QUANTITY_MISMATCH';
        message = `Midway original quantity ${source.originalOrderQuantity} differs from EPOCH ${reconciliation.originalOrderedQuantity}`;
      } else if (
        source.customerReceivedQuantity !== reconciliation.shippedQuantity
      ) {
        status = 'RECEIPT_MISMATCH';
        message = `Midway received ${source.customerReceivedQuantity}; EPOCH shows ${reconciliation.shippedQuantity} shipped`;
      } else if (delta < 0) {
        status = 'CANCELLATION_CONFLICT';
        message = `EPOCH already records ${reconciliation.canceledDemandQuantity} canceled, above Midway's target of ${source.targetCanceledQuantity}`;
      } else if (delta === 0) {
        status = 'ALREADY_APPLIED';
        message = 'The cumulative cancellation is already reflected in EPOCH';
      } else if (
        source.originalOrderQuantity - source.targetCanceledQuantity <
        reconciliation.accountedQuantity
      ) {
        status = 'CANCELLATION_CONFLICT';
        message =
          'Cancellation would reduce active demand below shipped, in-progress, and queued units';
      }
      previewRows.push({
        ...base,
        purchaseOrderItemId: item.id,
        currentCanceledQuantity: reconciliation.canceledDemandQuantity,
        cancellationDelta: Math.max(delta, 0),
        reconciliation,
        status,
        message,
      });
    }
    groups.push({
      poNumber,
      purchaseOrderId,
      status: groupStatus(previewRows),
      rows: previewRows,
    });
  }
  return groups;
}

async function previewPdf(pdf: MidwayPdf): Promise<P1ImportPreviewGroup[]> {
  const existing = await pool.query<{ id: number }>(
    'SELECT id FROM purchase_orders WHERE po_number = $1 LIMIT 1',
    [pdf.poNumber]
  );
  const products = await pool.query<{
    id: number;
    product_name: string;
    customer_product_number: string | null;
    product_type: string | null;
    stock_model: string | null;
    material: string | null;
    handedness: string | null;
    action_length: string | null;
    action_inlet: string | null;
    bottom_metal: string | null;
    barrel_inlet: string | null;
    qds: string | null;
    swivel_studs: string | null;
    paint_options: string | null;
    texture: string | null;
    flat_top: boolean | null;
  }>(
    `SELECT id, product_name, customer_product_number, product_type, stock_model,
            material, handedness, action_length, action_inlet, bottom_metal,
            barrel_inlet, qds, swivel_studs, paint_options, texture, flat_top
       FROM po_products
      WHERE is_active IS NOT FALSE
        AND lower(customer_name) LIKE '%midway%'`
  );
  const rows: P1ImportPreviewRow[] = pdf.lines.map((line, index) => {
    const supplier = normalizeIdentifier(line.supplierProductNumber);
    const customerProduct = normalizeIdentifier(line.customerProductNumber);
    const candidates = products.rows.filter(
      (product) =>
        normalizeIdentifier(product.product_name) === supplier ||
        normalizeIdentifier(product.customer_product_number) === customerProduct
    );
    const exact = candidates.filter(
      (product) =>
        normalizeIdentifier(product.product_name) === supplier &&
        normalizeIdentifier(product.customer_product_number) === customerProduct
    );
    const product =
      exact.length === 1
        ? exact[0]
        : candidates.length === 1
          ? candidates[0]
          : null;
    const status: P1ImportRowStatus = existing.rows[0]
      ? 'PO_ALREADY_EXISTS'
      : !product
        ? candidates.length > 1
          ? 'PRODUCT_CONFLICT'
          : 'PRODUCT_NOT_FOUND'
        : 'READY';
    return {
      rowNumber: index + 1,
      poNumber: pdf.poNumber,
      poDate: pdf.poDate,
      dueDate: pdf.shipOnDate,
      description: line.description,
      supplierProductNumber: line.supplierProductNumber,
      customerProductNumber: line.customerProductNumber,
      originalOrderQuantity: line.quantity,
      customerReceivedQuantity: null,
      customerRemainingQuantity: null,
      targetCanceledQuantity: null,
      unitPrice: line.unitPrice,
      extendedPrice: line.extendedPrice,
      purchaseOrderId: existing.rows[0]?.id ?? null,
      purchaseOrderItemId: null,
      productId: product?.id ?? null,
      productType: product?.product_type ?? null,
      productData: product ?? null,
      currentCanceledQuantity: null,
      cancellationDelta: 0,
      reconciliation: null,
      status,
      message: existing.rows[0]
        ? `PO ${pdf.poNumber} already exists in EPOCH`
        : product
          ? `Matched ${product.product_name}`
          : candidates.length > 1
            ? 'The two product identifiers match different catalog products'
            : 'No active Midway PO Product matches these identifiers',
    };
  });
  return [
    {
      poNumber: pdf.poNumber,
      purchaseOrderId: existing.rows[0]?.id ?? null,
      status: groupStatus(rows),
      rows,
    },
  ];
}

export async function previewP1CustomerPoImport(
  file: P1ImportFile
): Promise<P1ImportPreview> {
  const fileSha256 = crypto
    .createHash('sha256')
    .update(file.buffer)
    .digest('hex');
  const isCsv =
    file.originalname.toLowerCase().endsWith('.csv') ||
    file.mimetype.includes('csv');
  const documentType: P1ImportDocumentType = isCsv
    ? 'CANCELLATION_CSV'
    : 'NEW_PO_PDF';
  const parsedDocument = isCsv
    ? { rows: parseMidwayCancellationCsv(file.buffer) }
    : await extractPdf(file.buffer);
  const groups = isCsv
    ? await previewCancellationRows(
        (parsedDocument as { rows: MidwayCsvRow[] }).rows
      )
    : await previewPdf(parsedDocument as MidwayPdf);
  const allRows = groups.flatMap((group) => group.rows);
  return {
    documentType,
    customerName: 'MidwayUSA Inc',
    fileName: file.originalname,
    fileSha256,
    duplicateImport: await duplicateImport(fileSha256),
    groups,
    summary: {
      poCount: groups.length,
      lineCount: allRows.length,
      readyPoCount: groups.filter((group) => group.status === 'READY').length,
      blockedPoCount: groups.filter((group) => group.status === 'BLOCKED')
        .length,
      noChangePoCount: groups.filter((group) => group.status === 'NO_CHANGES')
        .length,
      originalQuantity: allRows.reduce(
        (sum, row) => sum + row.originalOrderQuantity,
        0
      ),
      targetCanceledQuantity: allRows.reduce(
        (sum, row) => sum + (row.targetCanceledQuantity ?? 0),
        0
      ),
      cancellationDelta: allRows.reduce(
        (sum, row) => sum + row.cancellationDelta,
        0
      ),
      documentTotal:
        documentType === 'NEW_PO_PDF'
          ? (parsedDocument as MidwayPdf).poTotal
          : null,
    },
    parsed: parsedDocument as unknown as Record<string, unknown>,
  };
}

async function insertImportHeader(
  preview: P1ImportPreview,
  file: P1ImportFile,
  objectPath: string,
  actor: P1ImportActor
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO p1_customer_po_document_imports (
       customer_name, document_type, original_file_name, mime_type, file_size,
       file_sha256, storage_object_path, status, parsed_payload,
       created_by_user_id, created_by_display_name
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'RECEIVED',$8::jsonb,$9,$10)
     RETURNING id`,
    [
      preview.customerName,
      preview.documentType,
      file.originalname,
      file.mimetype,
      file.size,
      preview.fileSha256,
      objectPath,
      JSON.stringify(preview.parsed),
      actor.userId,
      actor.displayName,
    ]
  );
  return result.rows[0].id;
}

async function insertImportRows(importId: string, preview: P1ImportPreview) {
  const byKey = new Map<string, string>();
  for (const row of preview.groups.flatMap((group) => group.rows)) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO p1_customer_po_document_import_rows (
         import_id, row_number, po_number, supplier_product_number,
         customer_product_number, original_order_quantity,
         customer_received_quantity, customer_remaining_quantity,
         target_canceled_quantity, purchase_order_id, purchase_order_item_id,
         prior_canceled_quantity, validation_status, validation_message
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        importId,
        row.rowNumber,
        row.poNumber,
        row.supplierProductNumber,
        row.customerProductNumber,
        row.originalOrderQuantity,
        row.customerReceivedQuantity,
        row.customerRemainingQuantity,
        row.targetCanceledQuantity,
        row.purchaseOrderId,
        row.purchaseOrderItemId,
        row.currentCanceledQuantity,
        row.status,
        row.message,
      ]
    );
    byKey.set(`${row.poNumber}:${row.rowNumber}`, result.rows[0].id);
  }
  return byKey;
}

async function applyNewPo(preview: P1ImportPreview, importId: string) {
  const group = preview.groups[0];
  if (!group || group.status !== 'READY')
    throw new Error('The new PO has unresolved validation issues');
  const customerResult = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM customers WHERE lower(name) LIKE '%midway%' ORDER BY is_active DESC NULLS LAST, id LIMIT 1`
  );
  const customer = customerResult.rows[0];
  if (!customer)
    throw new Error(
      'MidwayUSA must exist in Customer Management before importing its PO'
    );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const first = group.rows[0];
    const poResult = await client.query<{ id: number }>(
      `INSERT INTO purchase_orders (
         po_number, customer_id, customer_name, item_type, po_date,
         expected_delivery, status, notes, created_at, updated_at
       ) VALUES ($1,$2,$3,'multiple',$4,$5,'OPEN',$6,now(),now()) RETURNING id`,
      [
        group.poNumber,
        String(customer.id),
        customer.name,
        first.poDate,
        first.dueDate,
        `Imported from MidwayUSA PDF ${preview.fileName}`,
      ]
    );
    const poId = poResult.rows[0].id;
    for (const row of group.rows) {
      const product = row.productData as Record<string, unknown>;
      const specifications = {
        stockModel: product.stock_model,
        material: product.material,
        handedness: product.handedness,
        actionLength: product.action_length,
        actionInlet: product.action_inlet,
        bottomMetal: product.bottom_metal,
        barrelInlet: product.barrel_inlet,
        qds: product.qds,
        swivelStuds: product.swivel_studs,
        paintOptions: product.paint_options,
        texture: product.texture,
        flatTop: product.flat_top,
        customerProductNumber: row.customerProductNumber,
        sourceImportId: importId,
      };
      const itemResult = await client.query<{ id: number }>(
        `INSERT INTO purchase_order_items (
           po_id, stock_model_id, stock_model_name, quantity, unit_price,
           total_price, due_date, item_type, item_id, item_name,
           specifications, order_count, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,0,now(),now()) RETURNING id`,
        [
          poId,
          product.stock_model || 'mesa_universal',
          product.product_name || row.supplierProductNumber,
          row.originalOrderQuantity,
          row.unitPrice,
          row.extendedPrice,
          row.dueDate,
          row.productType === 'stock' ? 'stock_model' : 'custom_model',
          String(row.productId),
          product.product_name || row.supplierProductNumber,
          JSON.stringify(specifications),
        ]
      );
      await client.query(
        `UPDATE p1_customer_po_document_import_rows
            SET purchase_order_id = $2, purchase_order_item_id = $3,
                validation_status = 'APPLIED', validation_message = 'PO line created from customer PDF'
          WHERE import_id = $1 AND row_number = $4`,
        [importId, poId, itemResult.rows[0].id, row.rowNumber]
      );
    }
    await client.query(
      `UPDATE p1_customer_po_document_imports
          SET status = 'APPLIED', applied_at = now(),
              applied_summary = $2::jsonb
        WHERE id = $1`,
      [
        importId,
        JSON.stringify({
          purchaseOrderId: poId,
          poNumber: group.poNumber,
          lines: group.rows.length,
        }),
      ]
    );
    await client.query('COMMIT');
    return {
      purchaseOrderId: poId,
      poNumber: group.poNumber,
      appliedLines: group.rows.length,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function applyP1CustomerPoImport(input: {
  file: P1ImportFile;
  selectedPoNumbers?: string[];
  reason: string;
  actor: P1ImportActor;
}) {
  const preview = await previewP1CustomerPoImport(input.file);
  if (preview.duplicateImport) {
    return {
      duplicate: true,
      importId: preview.duplicateImport.id,
      preview,
      results: [],
    };
  }
  const provider = getFileStorageProvider();
  const objectPath = await provider.uploadBuffer({
    buffer: input.file.buffer,
    fileName: input.file.originalname,
    contentType: input.file.mimetype,
    scope: 'p1-customer-po-imports',
    entityId: preview.fileSha256.slice(0, 16),
  });
  let importId: string | null = null;
  try {
    importId = await insertImportHeader(
      preview,
      input.file,
      objectPath,
      input.actor
    );
    const rowIds = await insertImportRows(importId, preview);
    if (preview.documentType === 'NEW_PO_PDF') {
      const result = await applyNewPo(preview, importId);
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: String(result.purchaseOrderId),
        action: 'P1_CUSTOMER_PO_IMPORTED',
        actor: {
          id: input.actor.userId,
          username: input.actor.username || input.actor.displayName,
          role: input.actor.role,
        },
        reason: input.reason,
        meta: {
          importId,
          fileSha256: preview.fileSha256,
          poNumber: result.poNumber,
        },
      });
      return { duplicate: false, importId, preview, results: [result] };
    }

    const selected = new Set(
      input.selectedPoNumbers?.length
        ? input.selectedPoNumbers
        : preview.groups.map((group) => group.poNumber)
    );
    const results: Array<Record<string, unknown>> = [];
    for (const group of preview.groups) {
      if (!selected.has(group.poNumber)) continue;
      if (group.status === 'BLOCKED') {
        results.push({
          poNumber: group.poNumber,
          status: 'BLOCKED',
          appliedLines: 0,
        });
        continue;
      }
      const readyRows = group.rows.filter((row) => row.status === 'READY');
      if (readyRows.length === 0) {
        results.push({
          poNumber: group.poNumber,
          status: 'NO_CHANGES',
          appliedLines: 0,
        });
        continue;
      }
      const adjustments = await createP1QuantityAdjustmentBatch({
        purchaseOrderId: group.purchaseOrderId!,
        adjustments: readyRows.map((row) => ({
          purchaseOrderItemId: row.purchaseOrderItemId!,
          adjustmentType: 'CANCEL_QUANTITY' as const,
          quantity: row.cancellationDelta,
          reason: input.reason,
          createdByUserId: input.actor.userId,
          createdByDisplayName: input.actor.displayName,
          source: 'MIDWAY_CANCELLATION_CSV',
          reference: `${input.file.originalname} / PO ${row.poNumber}`,
          idempotencyKey: `MIDWAY_CANCEL:${row.poNumber}:${normalizeIdentifier(row.supplierProductNumber)}:${row.targetCanceledQuantity}`,
          importRowId: rowIds.get(`${row.poNumber}:${row.rowNumber}`),
          priorCanceledQuantity: row.currentCanceledQuantity ?? 0,
        })),
      });
      results.push({
        poNumber: group.poNumber,
        purchaseOrderId: group.purchaseOrderId,
        status: 'APPLIED',
        appliedLines: adjustments.length,
        canceledQuantity: readyRows.reduce(
          (sum, row) => sum + row.cancellationDelta,
          0
        ),
      });
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: String(group.purchaseOrderId),
        action: 'P1_CUSTOMER_CANCELLATIONS_IMPORTED',
        actor: {
          id: input.actor.userId,
          username: input.actor.username || input.actor.displayName,
          role: input.actor.role,
        },
        reason: input.reason,
        meta: {
          importId,
          fileSha256: preview.fileSha256,
          poNumber: group.poNumber,
          adjustments,
        },
      });
    }
    const applied = results.filter(
      (result) => result.status === 'APPLIED'
    ).length;
    const status =
      applied === 0
        ? 'NO_CHANGES'
        : applied === results.length
          ? 'APPLIED'
          : 'PARTIALLY_APPLIED';
    await pool.query(
      `UPDATE p1_customer_po_document_imports
          SET status = $2, applied_at = CASE WHEN $2 IN ('APPLIED','PARTIALLY_APPLIED') THEN now() ELSE NULL END,
              applied_summary = $3::jsonb
        WHERE id = $1`,
      [importId, status, JSON.stringify({ results })]
    );
    return { duplicate: false, importId, preview, results };
  } catch (error) {
    if (importId) {
      await pool
        .query(
          `UPDATE p1_customer_po_document_imports SET status = 'FAILED', applied_summary = $2::jsonb WHERE id = $1`,
          [
            importId,
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          ]
        )
        .catch(() => undefined);
    } else {
      await provider.deleteObject(objectPath).catch(() => undefined);
    }
    throw error;
  }
}

export async function listRecentP1CustomerPoImports(limit = 20) {
  const result = await pool.query(
    `SELECT id, customer_name AS "customerName", document_type AS "documentType",
            original_file_name AS "originalFileName", status, applied_summary AS "appliedSummary",
            created_by_display_name AS "createdByDisplayName", created_at AS "createdAt",
            applied_at AS "appliedAt"
       FROM p1_customer_po_document_imports
      ORDER BY created_at DESC
      LIMIT $1`,
    [Math.max(1, Math.min(limit, 100))]
  );
  return result.rows;
}
