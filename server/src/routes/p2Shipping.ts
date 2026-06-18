import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db, pool, pgPool } from '../../db';
import { createInvoiceFromPackingSlip } from '../services/invoiceFromPackingSlip';
import {
  p2SerializedItems,
  p2Customers,
  p2LotNumbers,
  p2PackingSlips,
  p2CertificatesOfConformance,
} from '../../schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generatePackingSlipPdf } from '../../utils/pdf/packingSlipPdf';
import { generateMaterialTransferPdf } from '../../utils/pdf/materialTransferPdf';
import type { PackingSlipData, PackingSlipItem } from '../../utils/pdf/types';
import { COMPANY_INFO } from '../../utils/pdf/pdfConfig';
import {
  buildCertPackageExport,
  evaluateShippingCertPackageGate,
} from '../services/certPackageService';
import { recordAuditEvent } from '../services/auditLedgerService';
import multer from 'multer';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
} from '../services/fileStorageProvider';
import {
  recordP2InvoiceNumberAudit,
  reserveP2InvoiceNumber,
  syncP2InvoiceSequenceFromManualNumber,
} from '../services/p2InvoiceNumberService';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

const materialTransferItemSchema = z.object({
  quantity: z.coerce.number().positive('Quantity must be greater than zero'),
  description: z.string().trim().min(1, 'Description is required'),
  partNumber: z.string().trim().optional().default(''),
  serialNumber: z.string().trim().optional().default(''),
  customerAssetId: z.string().trim().optional().default(''),
  condition: z.string().trim().optional().default(''),
  notes: z.string().trim().optional().default(''),
});

const materialTransferPdfSchema = z.object({
  formNumber: z.string().trim().optional().default(''),
  transferDate: z.string().trim().min(1, 'Transfer date is required'),
  customerName: z.string().trim().min(1, 'Customer name is required'),
  customerContact: z.string().trim().optional().default(''),
  customerPhone: z.string().trim().optional().default(''),
  customerEmail: z.string().trim().optional().default(''),
  shipToAddress: z.string().trim().min(1, 'Ship-to address is required'),
  returnReason: z.string().trim().min(1, 'Reason for transfer is required'),
  carrier: z.string().trim().optional().default(''),
  trackingNumber: z.string().trim().optional().default(''),
  freightTerms: z.string().trim().optional().default('Prepaid'),
  preparedBy: z.string().trim().min(1, 'Prepared by is required'),
  authorizedBy: z.string().trim().optional().default(''),
  notes: z.string().trim().optional().default(''),
  items: z.array(materialTransferItemSchema).min(1, 'At least one item is required'),
});

const MANUFACTURER_COC_TEMPLATE_KEY = 'manufacturer_coc';
const MANUFACTURER_COC_FALLBACK = {
  documentId: null as string | null,
  documentName: "Manufacturer's Certificate of Conformance",
  documentNumber: 'FO Form 6',
  version: '2.3',
  versionDate: '2024-08-14',
  display: 'Version 2.3 08/14/2024',
};

let p2CertificateTemplateMetadataSchemaReady: Promise<void> | null = null;
let p2PackingSlipInvoiceNumberSchemaReady: Promise<void> | null = null;

function ensureP2PackingSlipInvoiceNumberSchema(): Promise<void> {
  if (!p2PackingSlipInvoiceNumberSchemaReady) {
    p2PackingSlipInvoiceNumberSchemaReady = pool.query(`
      ALTER TABLE p2_packing_slips
        ADD COLUMN IF NOT EXISTS invoice_number text
    `)
      .then(() => undefined)
      .catch((err) => {
        p2PackingSlipInvoiceNumberSchemaReady = null;
        throw err;
      });
  }

  return p2PackingSlipInvoiceNumberSchemaReady;
}

function mapP2PackingSlipRow(row: any) {
  if (!row) return null;

  return {
    id: row.id,
    packingSlipNumber: row.packing_slip_number,
    lotNumberId: row.lot_number_id,
    lotNumber: row.lot_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerAddress: row.customer_address,
    poNumber: row.po_number,
    invoiceNumber: row.invoice_number ?? null,
    shipDate: row.ship_date,
    shipmentNumber: row.shipment_number,
    carrier: row.carrier,
    trackingNumber: row.tracking_number,
    lineItems: row.line_items,
    totalQuantity: row.total_quantity,
    packedBy: row.packed_by,
    packedBySignature: row.packed_by_signature,
    verifiedBy: row.verified_by,
    verifiedBySignature: row.verified_by_signature,
    status: row.status,
    notes: row.notes,
    externalPdfUrl: row.external_pdf_url,
    replacesPackingSlipId: row.replaces_packing_slip_id,
    replacementReason: row.replacement_reason,
    isNoChargeReplacement: row.is_no_charge_replacement,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function selectP2PackingSlipFallback(id: string) {
  const result = await pool.query(
    `
      SELECT
        id, packing_slip_number, lot_number_id, lot_number, customer_id,
        customer_name, customer_address, po_number, ship_date, shipment_number,
        carrier, tracking_number, line_items, total_quantity, packed_by,
        packed_by_signature, verified_by, verified_by_signature, status, notes,
        external_pdf_url, replaces_packing_slip_id, replacement_reason,
        is_no_charge_replacement, created_by, created_at, updated_at
      FROM p2_packing_slips
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return mapP2PackingSlipRow(result.rows[0]);
}

async function selectP2ReplacementSlipsFallback(replacesPackingSlipId: string) {
  const result = await pool.query(
    `
      SELECT
        id, packing_slip_number, lot_number_id, lot_number, customer_id,
        customer_name, customer_address, po_number, ship_date, shipment_number,
        carrier, tracking_number, line_items, total_quantity, packed_by,
        packed_by_signature, verified_by, verified_by_signature, status, notes,
        external_pdf_url, replaces_packing_slip_id, replacement_reason,
        is_no_charge_replacement, created_by, created_at, updated_at
      FROM p2_packing_slips
      WHERE replaces_packing_slip_id = $1
      ORDER BY created_at DESC
    `,
    [replacesPackingSlipId]
  );

  return result.rows.map(mapP2PackingSlipRow).filter(Boolean);
}

async function selectP2PackingSlipById(id: string) {
  try {
    await ensureP2PackingSlipInvoiceNumberSchema();
    await ensureP2BillingAllocationSchema();

    const [slip] = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, id));

    return slip ?? null;
  } catch (err) {
    console.warn('[P2Shipping] Falling back to compatibility packing slip lookup:', { id, err });
    return selectP2PackingSlipFallback(id);
  }
}

function ensureP2CertificateTemplateMetadataSchema(): Promise<void> {
  if (!p2CertificateTemplateMetadataSchemaReady) {
    p2CertificateTemplateMetadataSchemaReady = pool.query(`
      ALTER TABLE p2_certificates_of_conformance
        ADD COLUMN IF NOT EXISTS template_document_id uuid,
        ADD COLUMN IF NOT EXISTS template_document_name text,
        ADD COLUMN IF NOT EXISTS template_document_number text,
        ADD COLUMN IF NOT EXISTS template_version text,
        ADD COLUMN IF NOT EXISTS template_version_date date,
        ADD COLUMN IF NOT EXISTS template_display text
    `).then(() => undefined);
  }

  return p2CertificateTemplateMetadataSchemaReady;
}

function formatControlledVersionDisplay(version: string, versionDate: string | Date | null | undefined): string {
  if (!versionDate) return `Version ${version}`;
  const date = versionDate instanceof Date
    ? versionDate
    : new Date(String(versionDate).includes('T') ? versionDate : `${versionDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return `Version ${version}`;
  return `Version ${version} ${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

async function getApprovedManufacturerCocTemplateSnapshot() {
  const rows = await pool.query<{
    id: string;
    document_name: string;
    document_number: string;
    current_version: string;
    version_date: string | Date | null;
    effective_date: string | Date | null;
  }>(
    `SELECT id, document_name, document_number, current_version, version_date, effective_date
       FROM controlled_documents
      WHERE status = 'approved'
        AND (
          template_key = $1
          OR document_number = $2
          OR lower(document_name) = lower($3)
        )
      ORDER BY COALESCE(version_date, effective_date, created_at::date) DESC, updated_at DESC
      LIMIT 1`,
    [
      MANUFACTURER_COC_TEMPLATE_KEY,
      MANUFACTURER_COC_FALLBACK.documentNumber,
      MANUFACTURER_COC_FALLBACK.documentName,
    ]
  ).catch((error) => {
    console.warn('Falling back to built-in Manufacturer CoC template metadata:', error);
    return [];
  });

  const doc = rows[0];
  if (!doc) return MANUFACTURER_COC_FALLBACK;

  const versionDate = doc.version_date || doc.effective_date || MANUFACTURER_COC_FALLBACK.versionDate;
  return {
    documentId: doc.id,
    documentName: doc.document_name,
    documentNumber: doc.document_number,
    version: doc.current_version,
    versionDate,
    display: formatControlledVersionDisplay(doc.current_version, versionDate),
  };
}

async function uploadP2EvidenceFile(file: Express.Multer.File, scope: string, entityId?: string): Promise<string> {
  return getFileStorageProvider().uploadBuffer({
    buffer: file.buffer,
    fileName: file.originalname,
    contentType: file.mimetype || 'application/octet-stream',
    scope,
    entityId,
  });
}

async function downloadStoredBuffer(storagePath: string): Promise<Buffer> {
  return getFileStorageProviderForObjectPath(storagePath).downloadBuffer(storagePath);
}

function buildStructuredPackingSlipAddress(slip: any): PackingSlipData['customerAddress'] {
  const rawAddress = slip.customerAddress || '';
  const addrLines = rawAddress
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string, index: number, lines: string[]) =>
      line.length > 0 &&
      line.toLowerCase() !== (slip.customerName || '').trim().toLowerCase() &&
      lines.findIndex((candidate) => candidate.toLowerCase() === line.toLowerCase()) === index
    );

  if (addrLines.length === 0) return undefined;

  const lastLine = addrLines[addrLines.length - 1];
  const cityStateZip = lastLine.match(/^(.+),\s+([A-Z]{2})\s+(\S+)$/);
  if (!cityStateZip) return { rawLines: addrLines };

  return {
    street: addrLines[0] || '',
    street2: addrLines.length > 2 ? addrLines[1] : undefined,
    city: cityStateZip[1].trim(),
    state: cityStateZip[2],
    zip: cityStateZip[3],
  };
}

async function buildP2PackingSlipPdfData(slip: any): Promise<PackingSlipData> {
  const lineItems = (slip.lineItems as any[]) || [];
  const lineItemSerialNumbers = Array.from(
    new Set(
      lineItems.flatMap((item) =>
        Array.isArray(item.serialNumbers)
          ? item.serialNumbers.filter((serial: unknown): serial is string => typeof serial === 'string' && serial.trim().length > 0)
          : []
      )
    )
  );
  type PackingSlipSerialIdentity = {
    serial_number: string;
    sku: string | null;
    drawing_name: string | null;
  };
  let serialRows: PackingSlipSerialIdentity[] = [];
  if (lineItemSerialNumbers.length > 0) {
    try {
      serialRows = await pool.query<PackingSlipSerialIdentity>(
        `SELECT serial_number, sku, drawing_name
           FROM p2_serialized_items
          WHERE serial_number = ANY($1::text[])`,
        [lineItemSerialNumbers]
      );
    } catch (err) {
      console.warn('[P2Shipping] Packing slip serial identity enrichment unavailable:', {
        packingSlipId: slip.id,
        err,
      });
    }
  }
  const serialIdentityByNumber = new Map<string, PackingSlipSerialIdentity>(
    serialRows.map((row) => [row.serial_number, row])
  );

  const slipItems: PackingSlipItem[] = lineItems.map((item) => ({
    partNumber: assignedSkuFromSerials(
      (Array.isArray(item.serialNumbers) ? item.serialNumbers : [])
        .map((serialNumber: string) => serialIdentityByNumber.get(serialNumber))
        .filter((row: unknown): row is { sku: string | null } => Boolean(row))
    ) || item.customerSku || item.sku || item.partNumber || '',
    description: Array.from(
      new Set(
        (Array.isArray(item.serialNumbers) ? item.serialNumbers : [])
          .map((serialNumber: string) => serialIdentityByNumber.get(serialNumber)?.drawing_name?.trim())
          .filter((drawingName: unknown): drawingName is string => typeof drawingName === 'string' && drawingName.length > 0)
      )
    ).join(', ') || item.drawingName || item.partName || item.partNumber || 'N/A',
    quantity: item.quantity ?? (Array.isArray(item.serialNumbers) ? item.serialNumbers.length : 1),
    serialNumbers: Array.isArray(item.serialNumbers) ? item.serialNumbers : [],
    lotNumber: item.lotNumber || slip.lotNumber || undefined,
  }));

  return {
    packingSlipNumber: slip.packingSlipNumber,
    invoiceNumber: slip.invoiceNumber || slip.packingSlipNumber,
    poNumber: slip.poNumber || undefined,
    lotNumber: slip.lotNumber || undefined,
    date: (slip.shipDate || slip.createdAt)
      ? new Date(slip.shipDate || slip.createdAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    customerName: slip.customerName,
    customerAddress: buildStructuredPackingSlipAddress(slip),
    trackingNumber: slip.trackingNumber || undefined,
    totalQuantity: slip.totalQuantity ?? 0,
    packedBy: slip.packedBy || undefined,
    verifiedBy: slip.verifiedBy || undefined,
    items: slipItems,
  };
}

async function persistP2PackingSlipPdfSnapshot(slip: any): Promise<{ bytes: Buffer; slip: any }> {
  const slipData = await buildP2PackingSlipPdfData(slip);
  const bytes = await generatePackingSlipPdf(slipData);
  const storagePath = await getFileStorageProvider().uploadBuffer({
    buffer: bytes,
    fileName: `packing-slip-${slip.packingSlipNumber}.pdf`,
    contentType: 'application/pdf',
    scope: 'p2-packing-slip-issued',
    entityId: slip.id,
  });

  const [updatedSlip] = await db
    .update(p2PackingSlips)
    .set({ externalPdfUrl: storagePath, updatedAt: new Date() })
    .where(eq(p2PackingSlips.id, slip.id))
    .returning();

  return { bytes, slip: updatedSlip || { ...slip, externalPdfUrl: storagePath } };
}

function auditActor(req: Request) {
  const user = (req as any).user;
  return {
    id: typeof user?.id === 'number' ? user.id : null,
    username: user?.username ?? user?.email ?? user?.displayName ?? null,
    role: user?.role ?? null,
  };
}

// ─── Session auth helper (for PDF routes that use cookie-based sessions) ─────
function assignedSkuFromSerials(serials: Array<{ sku?: string | null }>): string | null {
  const skus = Array.from(
    new Set(
      serials
        .map((serial) => serial.sku?.trim())
        .filter((sku): sku is string => Boolean(sku))
    )
  );

  return skus.length > 0 ? skus.join(', ') : null;
}

async function hydratePackingSlipLineItemSkus(lineItems: any[]): Promise<any[]> {
  const serialNumbers = Array.from(
    new Set(
      lineItems.flatMap((item) =>
        Array.isArray(item.serialNumbers)
          ? item.serialNumbers.filter((serial: unknown): serial is string => typeof serial === 'string' && serial.trim().length > 0)
          : []
      )
    )
  );

  if (serialNumbers.length === 0) return lineItems;

  const serialRows = await pool.query<{ serial_number: string; sku: string | null }>(
    `SELECT serial_number, sku
       FROM p2_serialized_items
      WHERE serial_number = ANY($1::text[])`,
    [serialNumbers]
  );
  const skuBySerialNumber = new Map(serialRows.map((row) => [row.serial_number, row.sku]));

  return lineItems.map((item) => {
    const customerSku = assignedSkuFromSerials(
      (Array.isArray(item.serialNumbers) ? item.serialNumbers : [])
        .map((serialNumber: string) => ({ sku: skuBySerialNumber.get(serialNumber) }))
    );

    return customerSku
      ? { ...item, customerSku }
      : item;
  });
}

async function getAssignedSkuForLot(lotNumberId: string | null | undefined): Promise<string | null> {
  if (!lotNumberId) return null;

  const [lot] = await db
    .select({ serializedItemIds: p2LotNumbers.serializedItemIds })
    .from(p2LotNumbers)
    .where(eq(p2LotNumbers.id, lotNumberId));

  const serialIds = Array.isArray(lot?.serializedItemIds)
    ? lot.serializedItemIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];

  if (serialIds.length === 0) return null;

  const serials = await db
    .select({ sku: p2SerializedItems.sku })
    .from(p2SerializedItems)
    .where(inArray(p2SerializedItems.id, serialIds));

  return assignedSkuFromSerials(serials);
}

function getSpecialProcesses(processRecords: unknown): string {
  if (processRecords && typeof processRecords === 'object') {
    if (!Array.isArray(processRecords)) {
      const value = (processRecords as { specialProcesses?: unknown }).specialProcesses;
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    if (Array.isArray(processRecords)) {
      const values = processRecords
        .map((record) =>
          record && typeof record === 'object'
            ? (record as { process?: unknown; name?: unknown }).process || (record as { name?: unknown }).name
            : null
        )
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim());

      if (values.length > 0) return Array.from(new Set(values)).join(', ');
    }
  }

  return 'N/A';
}

function getQaMgrTitle(traceabilityData: unknown): string {
  if (traceabilityData && typeof traceabilityData === 'object' && !Array.isArray(traceabilityData)) {
    const value = (traceabilityData as { qaMgrTitle?: unknown }).qaMgrTitle;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return 'Quality Assurance';
}

async function getUserFromSession(req: Request): Promise<{ username: string; role: string } | null> {
  const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
  if (!sessionToken) return null;
  try {
    const result = await pool.query<{ username: string; expires_at: Date }>(
      'SELECT username, expires_at FROM user_sessions WHERE session_token = $1',
      [sessionToken]
    );
    if (!result || result.length === 0) return null;
    const session = result[0];
    if (new Date(session.expires_at) < new Date()) {
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [sessionToken]);
      return null;
    }
    const userRows = await pool.query<{ username: string; role: string }>(
      'SELECT username, role FROM users WHERE username = $1 AND is_active = true',
      [session.username.toLowerCase()]
    );
    return userRows?.length > 0 ? userRows[0] : null;
  } catch {
    return null;
  }
}

// ─── P2 document access logger ─────────────────────────────────────────────
// Logs PDF download events to p2_shipping_audit_log for audit trail
async function logP2DocumentAccess(
  entityType: string,
  entityId: string,
  actor: string,
  ipAddress: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO p2_shipping_audit_log (entity_type, entity_id, field_name, old_value, new_value, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entityType, entityId, 'pdf_download', null, null, actor, `PDF downloaded from IP ${ipAddress}`]
    );
  } catch (err) {
    console.error('[P2Shipping] Failed to write document access log:', { entityType, entityId, actor, err });
  }
}

// Ensure lot_validation_report_url column exists (idempotent migration)
;(async () => {
  try {
    await pool.query(
      `ALTER TABLE p2_lot_numbers ADD COLUMN IF NOT EXISTS lot_validation_report_url text`
    );
  } catch (err) {
    console.error('Migration: lot_validation_report_url column error:', err);
  }
})();

function buildCustomerAddress(customer: {
  customerName: string;
  shippingCompanyName?: string | null;
  shippingContactName?: string | null;
  shippingAddress?: string | null;
  shippingAddress2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingZip?: string | null;
}): string {
  return [
    customer.shippingCompanyName || customer.customerName,
    customer.shippingContactName,
    customer.shippingAddress,
    customer.shippingAddress2,
    [
      [customer.shippingCity, customer.shippingState].filter(Boolean).join(', '),
      customer.shippingZip,
    ]
      .filter(Boolean)
      .join(' '),
  ]
    .filter(Boolean)
    .join('\n');
}

async function generateSequentialId(
  _prefix: string,
  table: string,
  column: string
): Promise<string> {
  const today = new Date();
  // Format: YYMMDD-XX  (e.g. 260318-01)
  const iso = today.toISOString(); // 2026-03-18T...
  const dateStr = iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10); // YYMMDD
  const pattern = `${dateStr}-%`;
  const rows = await pool.query(
    `SELECT COUNT(*) as count FROM ${table} WHERE ${column} LIKE $1`,
    [pattern]
  );
  const seq = (parseInt(rows[0].count) + 1).toString().padStart(2, '0');
  return `${dateStr}-${seq}`;
}

// ============================================================
// POST /api/p2/lots — Create lot from selected finalized serials
// ============================================================
const createLotSchema = z.object({
  serialIds: z.array(z.string().uuid()).min(1, 'At least one serial required'),
  createdBy: z.string().min(1).default('system'),
  billingAssignments: z.array(z.object({
    serializedItemId: z.string().uuid(),
    allocationId: z.string().uuid(),
  })).optional(),
  billingBucketOverrides: z.array(z.object({
    poItemId: z.coerce.number().int().positive(),
    bucketLabel: z.string().trim().min(1, 'Bucket label is required'),
    description: z.string().trim().optional(),
    customerPoLine: z.string().trim().optional(),
    quantityAuthorized: z.coerce.number().int().positive().optional(),
    unitPrice: z.coerce.number().min(0).optional(),
    serialIds: z.array(z.string().uuid()).optional(),
  })).optional(),
});

const voidShipmentSchema = z.object({
  reason: z.string().trim().min(1, 'Void reason is required'),
});

// ============================================================
// POST /api/p2/material-transfer/pdf - Generate manual material transfer form
// ============================================================
router.post('/material-transfer/pdf', authenticateToken, requirePermission('shipping.release_shipment'), async (req: Request, res: Response) => {
  try {
    const input = materialTransferPdfSchema.parse(req.body);
    const pdf = await generateMaterialTransferPdf(input);
    const safeFormNumber = (input.formNumber || `MTF-${input.transferDate}`)
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'material-transfer-form';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeFormNumber}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(pdf);
  } catch (err: any) {
    if (err?.issues) {
      return res.status(400).json({ error: 'Invalid material transfer form data', issues: err.issues });
    }
    console.error('Material transfer PDF error:', err);
    return res.status(500).json({ error: 'Failed to generate material transfer form' });
  }
});

async function ensureP2VoidShipmentSchema(client: Pick<typeof pgPool, 'query'>): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS p2_shipping_audit_log (
      id          SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id   TEXT NOT NULL,
      field_name  TEXT NOT NULL,
      old_value   TEXT,
      new_value   TEXT,
      changed_by  TEXT NOT NULL,
      changed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      reason      TEXT NOT NULL
    )
  `);
  await client.query(`ALTER TABLE ar_invoices ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP`);
  await client.query(`ALTER TABLE ar_invoices ADD COLUMN IF NOT EXISTS voided_by TEXT`);
  await client.query(`ALTER TABLE ar_invoices ADD COLUMN IF NOT EXISTS void_reason TEXT`);
}

let p2BillingAllocationSchemaReady: Promise<void> | null = null;

function ensureP2BillingAllocationSchema(): Promise<void> {
  if (!p2BillingAllocationSchemaReady) {
    p2BillingAllocationSchemaReady = pool.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS p2_billing_allocations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        po_id integer NOT NULL REFERENCES p2_purchase_orders(id),
        po_item_id integer REFERENCES p2_purchase_order_items(id),
        po_number text NOT NULL,
        part_number text NOT NULL,
        bucket_label text NOT NULL,
        description text,
        customer_po_line text,
        quantity_authorized integer NOT NULL,
        unit_price numeric(12,2) NOT NULL,
        notes text,
        active boolean NOT NULL DEFAULT true,
        created_by text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      ALTER TABLE p2_billing_allocations
        ADD COLUMN IF NOT EXISTS po_id integer,
        ADD COLUMN IF NOT EXISTS po_item_id integer REFERENCES p2_purchase_order_items(id),
        ADD COLUMN IF NOT EXISTS po_number text,
        ADD COLUMN IF NOT EXISTS part_number text,
        ADD COLUMN IF NOT EXISTS bucket_label text,
        ADD COLUMN IF NOT EXISTS description text,
        ADD COLUMN IF NOT EXISTS customer_po_line text,
        ADD COLUMN IF NOT EXISTS quantity_authorized integer,
        ADD COLUMN IF NOT EXISTS unit_price numeric(12,2),
        ADD COLUMN IF NOT EXISTS notes text,
        ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS created_by text,
        ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

      ALTER TABLE p2_billing_allocations
        ALTER COLUMN active SET DEFAULT true,
        ALTER COLUMN quantity_authorized SET DEFAULT 0,
        ALTER COLUMN unit_price SET DEFAULT 0,
        ALTER COLUMN created_at SET DEFAULT now(),
        ALTER COLUMN updated_at SET DEFAULT now();

      UPDATE p2_billing_allocations
         SET active = true
       WHERE active IS NULL;

      UPDATE p2_billing_allocations
         SET quantity_authorized = 0
       WHERE quantity_authorized IS NULL;

      UPDATE p2_billing_allocations
         SET unit_price = 0
       WHERE unit_price IS NULL;

      CREATE INDEX IF NOT EXISTS p2_billing_allocations_po_idx
        ON p2_billing_allocations(po_id)
        WHERE active = true;

      CREATE TABLE IF NOT EXISTS p2_serial_billing_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        allocation_id uuid NOT NULL REFERENCES p2_billing_allocations(id),
        serialized_item_id uuid NOT NULL REFERENCES p2_serialized_items(id),
        po_id integer NOT NULL REFERENCES p2_purchase_orders(id),
        po_item_id integer REFERENCES p2_purchase_order_items(id),
        lot_id uuid REFERENCES p2_lot_numbers(id),
        packing_slip_id uuid REFERENCES p2_packing_slips(id),
        invoice_id uuid REFERENCES ar_invoices(id),
        assigned_at timestamp NOT NULL DEFAULT now(),
        assigned_by text,
        assignment_source text NOT NULL DEFAULT 'shipment',
        locked_at timestamp,
        locked_by text,
        lock_reason text,
        notes text,
        updated_at timestamp NOT NULL DEFAULT now(),
        UNIQUE(serialized_item_id)
      );

      ALTER TABLE p2_serial_billing_assignments
        ADD COLUMN IF NOT EXISTS allocation_id uuid,
        ADD COLUMN IF NOT EXISTS serialized_item_id uuid,
        ADD COLUMN IF NOT EXISTS po_id integer,
        ADD COLUMN IF NOT EXISTS po_item_id integer REFERENCES p2_purchase_order_items(id),
        ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES p2_lot_numbers(id),
        ADD COLUMN IF NOT EXISTS packing_slip_id uuid REFERENCES p2_packing_slips(id),
        ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES ar_invoices(id),
        ADD COLUMN IF NOT EXISTS assigned_at timestamp NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS assigned_by text,
        ADD COLUMN IF NOT EXISTS assignment_source text NOT NULL DEFAULT 'shipment',
        ADD COLUMN IF NOT EXISTS locked_at timestamp,
        ADD COLUMN IF NOT EXISTS locked_by text,
        ADD COLUMN IF NOT EXISTS lock_reason text,
        ADD COLUMN IF NOT EXISTS notes text,
        ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

      ALTER TABLE p2_serial_billing_assignments
        ALTER COLUMN assigned_at SET DEFAULT now(),
        ALTER COLUMN assignment_source SET DEFAULT 'shipment',
        ALTER COLUMN updated_at SET DEFAULT now();

      UPDATE p2_serial_billing_assignments
         SET assignment_source = 'shipment'
       WHERE assignment_source IS NULL;

      CREATE INDEX IF NOT EXISTS p2_serial_billing_assignments_allocation_idx
        ON p2_serial_billing_assignments(allocation_id);

      CREATE TABLE IF NOT EXISTS p2_billing_allocation_audit (
        id serial PRIMARY KEY,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        action text NOT NULL,
        old_value jsonb,
        new_value jsonb,
        changed_by text,
        reason text,
        created_at timestamp NOT NULL DEFAULT now()
      );

      ALTER TABLE p2_billing_allocation_audit
        ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'billing_allocation',
        ADD COLUMN IF NOT EXISTS entity_id text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'UNKNOWN',
        ADD COLUMN IF NOT EXISTS old_value jsonb,
        ADD COLUMN IF NOT EXISTS new_value jsonb,
        ADD COLUMN IF NOT EXISTS changed_by text,
        ADD COLUMN IF NOT EXISTS reason text,
        ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
    `).then(() => undefined).catch((err) => {
      p2BillingAllocationSchemaReady = null;
      throw err;
    });
  }

  return p2BillingAllocationSchemaReady;
}

let p2LotNumberShipmentSchemaReady: Promise<void> | null = null;

function ensureP2LotNumberShipmentSchema(): Promise<void> {
  if (!p2LotNumberShipmentSchemaReady) {
    p2LotNumberShipmentSchemaReady = pool.query(`
      ALTER TABLE p2_lot_numbers
        ADD COLUMN IF NOT EXISTS lot_type text DEFAULT 'PRODUCTION',
        ADD COLUMN IF NOT EXISTS part_number text,
        ADD COLUMN IF NOT EXISTS part_name text,
        ADD COLUMN IF NOT EXISTS customer_id text,
        ADD COLUMN IF NOT EXISTS customer_name text,
        ADD COLUMN IF NOT EXISTS po_number text,
        ADD COLUMN IF NOT EXISTS po_id integer REFERENCES p2_purchase_orders(id),
        ADD COLUMN IF NOT EXISTS po_item_id integer REFERENCES p2_purchase_order_items(id),
        ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1,
        ADD COLUMN IF NOT EXISTS serialized_item_ids jsonb,
        ADD COLUMN IF NOT EXISTS barcodes jsonb,
        ADD COLUMN IF NOT EXISTS manufacturing_date timestamp,
        ADD COLUMN IF NOT EXISTS expiration_date timestamp,
        ADD COLUMN IF NOT EXISTS status text DEFAULT 'OPEN',
        ADD COLUMN IF NOT EXISTS closed_at timestamp,
        ADD COLUMN IF NOT EXISTS closed_by text,
        ADD COLUMN IF NOT EXISTS shipped_at timestamp,
        ADD COLUMN IF NOT EXISTS shipped_by text,
        ADD COLUMN IF NOT EXISTS packing_slip_id uuid,
        ADD COLUMN IF NOT EXISTS certificate_id uuid,
        ADD COLUMN IF NOT EXISTS notes text,
        ADD COLUMN IF NOT EXISTS tracking_number text,
        ADD COLUMN IF NOT EXISTS carrier text,
        ADD COLUMN IF NOT EXISTS bill_of_lading_url text,
        ADD COLUMN IF NOT EXISTS lot_validation_report_url text,
        ADD COLUMN IF NOT EXISTS packing_slip_upload_url text,
        ADD COLUMN IF NOT EXISTS certificate_upload_url text,
        ADD COLUMN IF NOT EXISTS created_by text,
        ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

      ALTER TABLE p2_lot_numbers
        ALTER COLUMN lot_type SET DEFAULT 'PRODUCTION',
        ALTER COLUMN quantity SET DEFAULT 1,
        ALTER COLUMN status SET DEFAULT 'OPEN',
        ALTER COLUMN created_at SET DEFAULT now(),
        ALTER COLUMN updated_at SET DEFAULT now();

      ALTER TABLE p2_lot_numbers
        ALTER COLUMN serialized_item_ids TYPE jsonb
        USING CASE
          WHEN serialized_item_ids IS NULL THEN '[]'::jsonb
          WHEN jsonb_typeof(serialized_item_ids::jsonb) = 'array' THEN serialized_item_ids::jsonb
          ELSE jsonb_build_array(serialized_item_ids::jsonb)
        END;

      ALTER TABLE p2_lot_numbers
        ALTER COLUMN barcodes TYPE jsonb
        USING CASE
          WHEN barcodes IS NULL THEN '[]'::jsonb
          WHEN jsonb_typeof(barcodes::jsonb) = 'array' THEN barcodes::jsonb
          ELSE jsonb_build_array(barcodes::jsonb)
        END;
    `).then(() => undefined).catch((err) => {
      p2LotNumberShipmentSchemaReady = null;
      throw err;
    });
  }

  return p2LotNumberShipmentSchemaReady;
}

router.get('/billing-allocations', authenticateToken, requirePermission('shipping.release_shipment'), async (req: Request, res: Response) => {
  try {
    await ensureP2BillingAllocationSchema();
    const poId = Number(req.query.poId);
    if (!Number.isFinite(poId)) {
      return res.status(400).json({ error: 'poId is required' });
    }

    const poItemsResult = await pool.query(`
      SELECT id, part_number, part_name, quantity, unit_price
        FROM p2_purchase_order_items
       WHERE po_id = $1
       ORDER BY id
    `, [poId]);

    const allocationsResult = await pool.query(`
      SELECT
        a.id,
        a.po_id,
        a.po_item_id,
        a.po_number,
        a.part_number,
        a.bucket_label,
        a.description,
        a.customer_po_line,
        a.quantity_authorized,
        a.unit_price,
        a.notes,
        COALESCE(COUNT(sba.id), 0)::int AS assigned_quantity
      FROM p2_billing_allocations a
      LEFT JOIN p2_serial_billing_assignments sba
        ON sba.allocation_id = a.id
      WHERE a.po_id = $1
        AND a.active = true
      GROUP BY a.id
      ORDER BY a.created_at, a.bucket_label
    `, [poId]);

    return res.json({ poItems: poItemsResult.rows, allocations: allocationsResult.rows });
  } catch (err: any) {
    console.error('P2 billing allocations fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch P2 billing allocations' });
  }
});

const createBillingAllocationSchema = z.object({
  poId: z.coerce.number().int().positive(),
  poItemId: z.coerce.number().int().positive(),
  bucketLabel: z.string().trim().min(1, 'Bucket/CLIN label is required'),
  description: z.string().trim().optional().default(''),
  customerPoLine: z.string().trim().optional().default(''),
  quantityAuthorized: z.coerce.number().int().positive('Quantity must be greater than zero'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be zero or greater'),
  notes: z.string().trim().optional().default(''),
});

router.post('/billing-allocations', authenticateToken, requirePermission('shipping.release_shipment'), async (req: Request, res: Response) => {
  try {
    await ensureP2BillingAllocationSchema();
    const input = createBillingAllocationSchema.parse(req.body);
    const actor = (req as any).user?.username || 'shipping';

    const poResult = await pool.query<{ id: number; po_number: string }>(
      `SELECT id, po_number FROM p2_purchase_orders WHERE id = $1`,
      [input.poId],
    );
    const poRows = poResult.rows;
    if (poRows.length === 0) return res.status(404).json({ error: 'P2 PO not found' });

    const itemResult = await pool.query<{ id: number; part_number: string }>(
      `SELECT id, part_number FROM p2_purchase_order_items WHERE id = $1 AND po_id = $2`,
      [input.poItemId, input.poId],
    );
    const itemRows = itemResult.rows;
    if (itemRows.length === 0) return res.status(404).json({ error: 'P2 PO item not found for this PO' });

    const insertResult = await pool.query(`
      INSERT INTO p2_billing_allocations (
        po_id, po_item_id, po_number, part_number, bucket_label, description,
        customer_po_line, quantity_authorized, unit_price, notes, created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      input.poId,
      input.poItemId,
      poRows[0].po_number,
      itemRows[0].part_number,
      input.bucketLabel,
      input.description || null,
      input.customerPoLine || null,
      input.quantityAuthorized,
      input.unitPrice.toFixed(2),
      input.notes || null,
      actor,
    ]);
    const createdAllocation = insertResult.rows[0];

    await pool.query(`
      INSERT INTO p2_billing_allocation_audit (entity_type, entity_id, action, new_value, changed_by, reason)
      VALUES ('billing_allocation', $1, 'CREATE', $2::jsonb, $3, 'Manual bucket setup from customer PO')
    `, [createdAllocation.id, JSON.stringify(createdAllocation), actor]);

    return res.status(201).json(createdAllocation);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    console.error('P2 billing allocation create error:', err);
    return res.status(500).json({ error: 'Failed to create P2 billing allocation' });
  }
});

type BillingBucketOverride = NonNullable<z.infer<typeof createLotSchema>['billingBucketOverrides']>[number];

async function assignSerialBillingBucket(params: {
  allocationId: string;
  serializedItemId: string;
  poId: number;
  poItemId: number | null;
  actor: string;
  assignmentSource: string;
}): Promise<void> {
  const updated = await pool.query(
    `UPDATE p2_serial_billing_assignments
        SET allocation_id = $1,
            po_id = $3,
            po_item_id = $4,
            assigned_at = now(),
            assigned_by = $5,
            assignment_source = $6,
            updated_at = now()
      WHERE serialized_item_id = $2
        AND locked_at IS NULL
      RETURNING id`,
    [
      params.allocationId,
      params.serializedItemId,
      params.poId,
      params.poItemId,
      params.actor,
      params.assignmentSource,
    ],
  );

  if (updated.rowCount > 0) return;

  const existing = await pool.query<{ id: string }>(
    `SELECT id
       FROM p2_serial_billing_assignments
      WHERE serialized_item_id = $1
      LIMIT 1`,
    [params.serializedItemId],
  );
  if (existing.rows.length > 0) return;

  await pool.query(
    `INSERT INTO p2_serial_billing_assignments (
       allocation_id, serialized_item_id, po_id, po_item_id, assigned_by, assignment_source
     )
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      params.allocationId,
      params.serializedItemId,
      params.poId,
      params.poItemId,
      params.actor,
      params.assignmentSource,
    ],
  );
}

async function assignSerialsToPoItemBuckets(
  serials: any[],
  actor: string,
  bucketOverrides: BillingBucketOverride[] = [],
): Promise<void> {
  const serialById = new Map(serials.map((serial) => [serial.id, serial]));
  const assignedByOverride = new Set<string>();
  const bucketGroups: { poItemId: number; group: any[]; override?: BillingBucketOverride }[] = [];

  for (const override of bucketOverrides) {
    const overrideSerialIds = override.serialIds?.filter((serialId) => serialById.has(serialId)) ?? [];
    if (overrideSerialIds.length === 0) continue;

    const group = overrideSerialIds.map((serialId) => serialById.get(serialId)!);
    bucketGroups.push({ poItemId: override.poItemId, group, override });
    for (const serialId of overrideSerialIds) assignedByOverride.add(serialId);
  }

  const serialsByPoItemId = new Map<number, any[]>();
  for (const serial of serials) {
    if (assignedByOverride.has(serial.id)) continue;

    const poItemId = Number(serial.poItemId);
    if (!Number.isInteger(poItemId) || poItemId <= 0) {
      throw new Error(`Serial ${serial.serialNumber} is missing a PO item line`);
    }
    serialsByPoItemId.set(poItemId, [...(serialsByPoItemId.get(poItemId) ?? []), serial]);
  }

  const overrideByPoItemId = new Map(bucketOverrides.map((override) => [override.poItemId, override]));

  for (const [poItemId, group] of serialsByPoItemId.entries()) {
    bucketGroups.push({ poItemId, group, override: overrideByPoItemId.get(poItemId) });
  }

  for (const { poItemId, group, override } of bucketGroups) {
    const first = group[0];
    const poItemResult = await pool.query<{
      id: number;
      po_id: number;
      part_number: string;
      part_name: string | null;
      quantity: number | null;
      unit_price: string | number | null;
    }>(
      `SELECT id, po_id, part_number, part_name, quantity, unit_price
         FROM p2_purchase_order_items
        WHERE id = $1 AND po_id = $2`,
      [poItemId, first.poId],
    );
    const poItem = poItemResult.rows[0];
    if (!poItem) throw new Error(`PO item ${poItemId} was not found for PO ${first.poNumber}`);

    const authorizedQuantity = Math.max(
      Number(override?.quantityAuthorized) || 0,
      Number(poItem.quantity) || 0,
      group.length,
    );
    const unitPrice = Number(override?.unitPrice ?? poItem.unit_price) || 0;
    const bucketLabel = override?.bucketLabel || `PO Item #${poItem.id}`;
    const description = override?.description || poItem.part_name || first.partName || null;
    const customerPoLine = override?.customerPoLine || String(poItem.id);

    const existingAllocationResult = await pool.query<{ id: string }>(
      `SELECT id
         FROM p2_billing_allocations
        WHERE po_id = $1
          AND po_item_id = $2
          AND bucket_label = $3
          AND active = true
        ORDER BY created_at
        LIMIT 1`,
      [poItem.po_id, poItem.id, bucketLabel],
    );

    let allocationId = existingAllocationResult.rows[0]?.id;
    if (allocationId) {
      await pool.query(
        `UPDATE p2_billing_allocations
            SET bucket_label = $1,
                description = COALESCE(description, $2),
                customer_po_line = COALESCE(customer_po_line, $6),
                quantity_authorized = GREATEST(quantity_authorized, $3),
                unit_price = $4,
                updated_at = now()
          WHERE id = $5`,
        [bucketLabel, description, authorizedQuantity, unitPrice.toFixed(2), allocationId, customerPoLine],
      );
    } else {
      const createdAllocationResult = await pool.query<{ id: string }>(
        `INSERT INTO p2_billing_allocations (
           po_id, po_item_id, po_number, part_number, bucket_label, description,
           customer_po_line, quantity_authorized, unit_price, notes, created_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          poItem.po_id,
          poItem.id,
          first.poNumber,
          poItem.part_number || first.partNumber,
          bucketLabel,
          description,
          customerPoLine,
          authorizedQuantity,
          unitPrice.toFixed(2),
          override
            ? 'Pending revised PO bucket created during shipment creation'
            : 'Auto-created from PO item line during shipment creation',
          actor,
        ],
      );
      allocationId = createdAllocationResult.rows[0].id;
    }

    for (const serial of group) {
      await assignSerialBillingBucket({
        allocationId,
        serializedItemId: serial.id,
        poId: serial.poId,
        poItemId: poItem.id,
        actor,
        assignmentSource: 'po_item_shipment_create',
      });
    }
  }
}

router.post('/lots', authenticateToken, requirePermission('shipping.release_shipment'), async (req: Request, res: Response) => {
  try {
    await ensureP2LotNumberShipmentSchema();
    await ensureP2BillingAllocationSchema();
    const input = createLotSchema.parse(req.body);
    const actor = (req as any).user?.username || input.createdBy || 'shipping';

    const serials = await db
      .select()
      .from(p2SerializedItems)
      .where(inArray(p2SerializedItems.id, input.serialIds));

    if (serials.length !== input.serialIds.length) {
      return res.status(400).json({ error: 'Some serial IDs not found' });
    }

    // Guard: all serials must be COMPLETED and finalized
    const notReady = serials.filter((s) => s.status !== 'COMPLETED' || !s.finalizedAt);
    if (notReady.length > 0) {
      return res.status(400).json({
        error: 'All selected serials must be completed and finalized before shipment',
        items: notReady.map((s) => s.serialNumber),
      });
    }

    const poNumbers = Array.from(new Set(serials.map((s) => s.poNumber)));
    if (poNumbers.length > 1) {
      return res.status(400).json({
        error: 'All serials must belong to the same PO',
        found: poNumbers,
      });
    }

    const selectedSerialIdSet = new Set(input.serialIds);
    const incomingAssignments = input.billingAssignments ?? [];
    const incomingAssignmentBySerialId = new Map(
      incomingAssignments.map((assignment) => [assignment.serializedItemId, assignment.allocationId]),
    );
    if (incomingAssignments.length === 0) {
      await assignSerialsToPoItemBuckets(serials, actor, input.billingBucketOverrides ?? []);
    }

    if (incomingAssignments.length > 0) {
      const missingIncoming = input.serialIds.filter((serialId) => !incomingAssignmentBySerialId.has(serialId));
      const outsideShipment = incomingAssignments.filter((assignment) => !selectedSerialIdSet.has(assignment.serializedItemId));
      if (missingIncoming.length > 0 || outsideShipment.length > 0) {
        return res.status(400).json({
          error: 'Every selected serial must have exactly one billing bucket assignment',
          missingSerialIds: missingIncoming,
          extraSerialIds: outsideShipment.map((assignment) => assignment.serializedItemId),
        });
      }

      const allocationIds = Array.from(new Set(incomingAssignments.map((assignment) => assignment.allocationId)));
      const allocationResult = await pool.query<{
        id: string;
        po_id: number;
        po_item_id: number | null;
        part_number: string;
        bucket_label: string;
        quantity_authorized: number;
        assigned_quantity: number;
      }>(`
        SELECT
          a.id,
          a.po_id,
          a.po_item_id,
          a.part_number,
          a.bucket_label,
          a.quantity_authorized,
          COALESCE(COUNT(sba.id) FILTER (WHERE NOT (sba.serialized_item_id = ANY($2::uuid[]))), 0)::int AS assigned_quantity
        FROM p2_billing_allocations a
        LEFT JOIN p2_serial_billing_assignments sba ON sba.allocation_id = a.id
        WHERE a.id = ANY($1::uuid[])
          AND a.active = true
        GROUP BY a.id
      `, [allocationIds, input.serialIds]);

      const allocationRows = allocationResult.rows;
      if (allocationRows.length !== allocationIds.length) {
        return res.status(400).json({ error: 'One or more billing buckets were not found or are inactive' });
      }

      const allocationById = new Map(allocationRows.map((allocation) => [allocation.id, allocation]));
      const selectedSerialById = new Map(serials.map((serial) => [serial.id, serial]));
      const requestedCountByAllocation = new Map<string, number>();
      for (const assignment of incomingAssignments) {
        const serial = selectedSerialById.get(assignment.serializedItemId);
        const allocation = allocationById.get(assignment.allocationId);
        if (!serial || !allocation) continue;
        if (allocation.po_id !== serial.poId) {
          return res.status(400).json({ error: `Billing bucket ${allocation.id} does not belong to PO ${serial.poNumber}` });
        }
        if (allocation.po_item_id && allocation.po_item_id !== serial.poItemId) {
          return res.status(400).json({ error: `Billing bucket ${allocation.bucket_label || allocation.id} does not match serial ${serial.serialNumber}` });
        }
        if (allocation.part_number !== serial.partNumber) {
          return res.status(400).json({ error: `Billing bucket ${allocation.id} part number does not match serial ${serial.serialNumber}` });
        }
        requestedCountByAllocation.set(
          assignment.allocationId,
          (requestedCountByAllocation.get(assignment.allocationId) ?? 0) + 1,
        );
      }

      for (const allocation of allocationRows) {
        const requested = requestedCountByAllocation.get(allocation.id) ?? 0;
        if (allocation.assigned_quantity + requested > Number(allocation.quantity_authorized)) {
          return res.status(409).json({
            error: `Billing bucket quantity exceeded for ${allocation.id}`,
            quantityAuthorized: allocation.quantity_authorized,
            alreadyAssigned: allocation.assigned_quantity,
            requested,
          });
        }
      }

      for (const assignment of incomingAssignments) {
        const serial = selectedSerialById.get(assignment.serializedItemId)!;
        await assignSerialBillingBucket({
          allocationId: assignment.allocationId,
          serializedItemId: assignment.serializedItemId,
          poId: serial.poId,
          poItemId: serial.poItemId,
          actor,
          assignmentSource: 'shipment_create',
        });

        await pool.query(`
          INSERT INTO p2_billing_allocation_audit (entity_type, entity_id, action, new_value, changed_by, reason)
          VALUES ('serial_billing_assignment', $1, 'ASSIGN_FOR_SHIPMENT', $2::jsonb, $3, 'Assigned during P2 shipment creation')
        `, [
          assignment.serializedItemId,
          JSON.stringify({
            serializedItemId: assignment.serializedItemId,
            allocationId: assignment.allocationId,
            poId: serial.poId,
            poItemId: serial.poItemId,
          }),
          actor,
        ]);
      }
    }

    const assignmentResult = await pool.query<{ serialized_item_id: string }>(`
      SELECT serialized_item_id
      FROM p2_serial_billing_assignments
      WHERE serialized_item_id = ANY($1::uuid[])
    `, [input.serialIds]);
    const assignmentRows = assignmentResult.rows;
    const assignedSerialIds = new Set(assignmentRows.map((row) => row.serialized_item_id));
    const missingAssignments = input.serialIds.filter((serialId) => !assignedSerialIds.has(serialId));
    if (missingAssignments.length > 0) {
      return res.status(400).json({
        error: 'Billing bucket assignment is required before shipment can be created',
        missingSerialIds: missingAssignments,
      });
    }

    // Guard: serial reuse — reject if any serial already exists in another lot
    const existingLotsResult = await pool.query<{
      id: string;
      lot_number: string;
      serialized_item_ids: string[] | null;
      packing_slip_id: string | null;
    }>(
      `SELECT id, lot_number, serialized_item_ids, packing_slip_id
         FROM p2_lot_numbers
        WHERE COALESCE(serialized_item_ids, '[]'::jsonb) ?| $1::text[]
          AND COALESCE(status, '') <> 'VOID'`,
      [input.serialIds]
    );
    const existingLots = existingLotsResult.rows;
    if (existingLots.length > 0) {
      const requestedSerialIds = new Set(input.serialIds);
      const recoverableLot = existingLots.find((lot) => {
        const lotSerialIds = Array.isArray(lot.serialized_item_ids) ? lot.serialized_item_ids : [];
        return (
          !lot.packing_slip_id &&
          lotSerialIds.length === requestedSerialIds.size &&
          lotSerialIds.every((id) => requestedSerialIds.has(id))
        );
      });

      if (recoverableLot && existingLots.length === 1) {
        const [lot] = await db
          .select()
          .from(p2LotNumbers)
          .where(eq(p2LotNumbers.id, recoverableLot.id));
        if (lot) return res.status(200).json(lot);
      }

      return res.status(409).json({
        error: 'One or more serial numbers already assigned to an existing shipment lot',
        lots: existingLots.map((r) => r.lot_number),
      });
    }

    const first = serials[0];
    const poItemIds = Array.from(new Set(serials.map((serial) => serial.poItemId)));
    const fullShipmentOverride = (input.billingBucketOverrides ?? []).find((override) => {
      const overrideSerialIds = new Set(override.serialIds ?? []);
      return (
        overrideSerialIds.size === input.serialIds.length &&
        input.serialIds.every((serialId) => overrideSerialIds.has(serialId))
      );
    });
    const lotPoItemId = fullShipmentOverride?.poItemId ?? (poItemIds.length === 1 ? poItemIds[0] : null);
    const lotBucketSerial = lotPoItemId
      ? serials.find((serial) => serial.poItemId === lotPoItemId) ?? first
      : first;
    const lotNumber = await generateSequentialId('LOT', 'p2_lot_numbers', 'lot_number');

    const manufacturingDate =
      (serials.map((s) => s.completedAt).filter(Boolean).sort().pop() as Date | null) ||
      new Date();

    const lotResult = await pgPool.query<typeof p2LotNumbers.$inferSelect>(
      `INSERT INTO p2_lot_numbers (
         lot_number, lot_type, part_number, part_name, customer_id, customer_name,
         po_number, po_id, po_item_id, quantity, serialized_item_ids, barcodes,
         manufacturing_date, status, created_by, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,now(),now())
       RETURNING *`,
      [
        lotNumber,
        'SHIPPING',
        lotBucketSerial.partNumber,
        lotBucketSerial.partName,
        first.customerId,
        first.customerName,
        first.poNumber,
        first.poId,
        lotPoItemId,
        serials.length,
        JSON.stringify(input.serialIds),
        JSON.stringify(serials.map((s) => s.barcode).filter(Boolean)),
        manufacturingDate,
        'OPEN',
        input.createdBy || actor || 'shipping',
      ],
    );
    const lot = lotResult.rows[0];
    if (!lot) throw new Error('Shipping lot insert returned no row');

    await pool.query(`
      UPDATE p2_serial_billing_assignments
         SET lot_id = $1,
             updated_at = now()
       WHERE serialized_item_id = ANY($2::uuid[])
         AND locked_at IS NULL
    `, [lot.id, input.serialIds]);

    return res.status(201).json(lot);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message });
    if (typeof err?.message === 'string' && /PO item|PO line|Serial .*missing/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Create lot error:', err);
    return res.status(500).json({
      error: 'Failed to create lot',
      message: err?.message || 'Unknown create-lot error',
      code: err?.code,
      detail: err?.detail,
      hint: err?.hint,
    });
  }
});

// ============================================================
// GET /api/p2/lots/existing-shipments — all lots that have packing slips
// Returns map-friendly array: [{ poId, lotId, lotNumber, slipId, slipNumber, certId?, certNumber? }]
// Must appear BEFORE /lots/:id so Express doesn't match 'existing-shipments' as an :id param
// ============================================================
router.get('/lots/existing-shipments', async (req: Request, res: Response) => {
  try {
    const rows = await pool.query<{
      po_id: number;
      lot_id: string;
      lot_number: string;
      slip_id: string;
      slip_number: string;
      cert_id: string | null;
      cert_number: string | null;
      invoice_id: string | null;
      invoice_number: string | null;
      invoice_status: string | null;
      invoice_total_amount: string | null;
      journal_entry_id: number | null;
      journal_entry_status: string | null;
      journal_line_count: number | null;
    }>(`
      SELECT
        l.po_id,
        l.id           AS lot_id,
        l.lot_number,
        ps.id          AS slip_id,
        ps.packing_slip_number AS slip_number,
        NULL::uuid AS cert_id,
        NULL::text AS cert_number,
        NULL::uuid AS invoice_id,
        NULL::text AS invoice_number,
        NULL::text AS invoice_status,
        NULL::numeric AS invoice_total_amount,
        NULL::integer AS journal_entry_id,
        NULL::text AS journal_entry_status,
        0::int AS journal_line_count
      FROM p2_lot_numbers l
      JOIN p2_packing_slips ps ON ps.id = l.packing_slip_id
      WHERE l.po_id IS NOT NULL
        AND l.packing_slip_id IS NOT NULL
        AND COALESCE(l.status, '') <> 'VOID'
      ORDER BY l.created_at DESC
    `);
    return res.json(rows);
  } catch (err: any) {
    console.error('existing-shipments error:', err);
    return res.status(500).json({ error: 'Failed to fetch existing shipments' });
  }
});

// ============================================================
// GET /api/p2/lots/:id
// ============================================================
router.get('/lots/:id', async (req: Request, res: Response) => {
  try {
    const [lot] = await db
      .select()
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, req.params.id));
    if (!lot) return res.status(404).json({ error: 'Lot not found' });
    return res.json(lot);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch lot' });
  }
});

// ============================================================
// POST /api/p2/packing-slips — Create packing slip from lot
// RULE: All packing slips MUST be persisted to DB immediately after generation.
// This route inserts a record into p2_packing_slips and links it via p2_lot_numbers.packing_slip_id.
// TODO: unify P1 + P2 packing slip storage into single document system
// ============================================================
const createPackingSlipSchema = z.object({
  lotId: z.string().uuid(),
  createdBy: z.string().min(1).default('system'),
  // Optional replacement linkage fields (Phase 5C)
  replacesPackingSlipId: z.string().uuid().optional(),
  replacementReason: z.string().optional(),
  isNoChargeReplacement: z.boolean().optional(),
});

router.post('/packing-slips', authenticateToken, requirePermission('shipping.release_shipment'), async (req: Request, res: Response) => {
  try {
    await ensureP2PackingSlipInvoiceNumberSchema();

    const input = createPackingSlipSchema.parse(req.body);

    const [lot] = await db
      .select()
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, input.lotId));
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    // Guard: one packing slip per lot.
    // This guard checks whether the lot already has a packing slip assigned via
    // p2_lot_numbers.packing_slip_id. Replacement slips are always created for
    // NEW lots (the replacement items are repacked as a new lot with new serials),
    // so this guard does not conflict with replacements — each lot can only ever
    // have one packing slip regardless of whether the slip is a replacement.
    if (lot.packingSlipId) {
      return res.status(409).json({ error: 'Packing slip already exists for this lot' });
    }

    const [existingSlipForLot] = await db
      .select({ id: p2PackingSlips.id, packingSlipNumber: p2PackingSlips.packingSlipNumber })
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.lotNumberId, lot.id));

    if (existingSlipForLot) {
      await db
        .update(p2LotNumbers)
        .set({ packingSlipId: existingSlipForLot.id })
        .where(eq(p2LotNumbers.id, lot.id));
      return res.status(200).json(existingSlipForLot);
    }

    // Validate that replacesPackingSlipId references an existing slip
    if (input.replacesPackingSlipId) {
      const [originalSlip] = await db
        .select({ id: p2PackingSlips.id })
        .from(p2PackingSlips)
        .where(eq(p2PackingSlips.id, input.replacesPackingSlipId));
      if (!originalSlip) {
        return res.status(422).json({ error: `Original packing slip ${input.replacesPackingSlipId} not found — cannot create replacement` });
      }
    }

    const serialIds = (lot.serializedItemIds as string[]) || [];
    const serials = await db
      .select()
      .from(p2SerializedItems)
      .where(inArray(p2SerializedItems.id, serialIds));

    const assignmentRows = serialIds.length > 0
      ? await pool.query<{
          serialized_item_id: string;
          allocation_id: string;
          po_item_id: number | null;
          bucket_label: string;
          customer_po_line: string | null;
          unit_price: string;
        }>(`
          SELECT
            sba.serialized_item_id,
            sba.allocation_id,
            a.po_item_id,
            a.bucket_label,
            a.customer_po_line,
            a.unit_price
          FROM p2_serial_billing_assignments sba
          JOIN p2_billing_allocations a ON a.id = sba.allocation_id
          WHERE sba.serialized_item_id = ANY($1::uuid[])
        `, [serialIds])
      : [];
    const assignmentBySerialId = new Map(assignmentRows.map((row) => [row.serialized_item_id, row]));

    const byPart: Record<string, typeof serials> = {};
    for (const s of serials) {
      const assignment = assignmentBySerialId.get(s.id);
      const key = assignment?.allocation_id || `po-item:${s.poItemId || s.partNumber}`;
      if (!byPart[key]) byPart[key] = [];
      byPart[key].push(s);
    }

    const lineItems = Object.values(byPart).map((group) => {
      const assignedSku = assignedSkuFromSerials(group) || group[0].sku || null;
      const firstAssignment = assignmentBySerialId.get(group[0].id);

      return {
        poItemId: firstAssignment?.po_item_id || group[0].poItemId,
        billingAllocationId: firstAssignment?.allocation_id || null,
        billingBucketLabel: firstAssignment?.bucket_label || null,
        customerPoLine: firstAssignment?.customer_po_line || null,
        unitPrice: firstAssignment?.unit_price || null,
        sku: assignedSku,
        partNumber: assignedSku || group[0].partNumber,
        partName: group[0].drawingName || group[0].partName,
        quantity: group.length,
        serialNumbers: group.map((s) => s.serialNumber),
        lotNumber: lot.lotNumber,
      };
    });

    const [customer] = await db
      .select()
      .from(p2Customers)
      .where(eq(p2Customers.customerId, lot.customerId || ''));

    const customerAddress = customer ? buildCustomerAddress(customer) : '';

    const reservation = await reserveP2InvoiceNumber({
      customerId: lot.customerId || '',
      customerName: lot.customerName || '',
    });
    const invoiceNumber = reservation.invoiceNumber;
    const packingSlipNumber = invoiceNumber;

    let [slip] = await db
      .insert(p2PackingSlips)
      .values({
        packingSlipNumber,
        invoiceNumber,
        lotNumberId: lot.id,
        lotNumber: lot.lotNumber,
        customerId: lot.customerId || '',
        customerName: lot.customerName || '',
        customerAddress,
        poNumber: lot.poNumber,
        lineItems,
        totalQuantity: serials.length,
        status: 'DRAFT',
        createdBy: input.createdBy,
        replacesPackingSlipId: input.replacesPackingSlipId ?? null,
        replacementReason: input.replacementReason ?? null,
        isNoChargeReplacement: input.isNoChargeReplacement ?? false,
      })
      .returning();

    try {
      await recordP2InvoiceNumberAudit({
        packingSlipId: slip.id,
        customerId: lot.customerId || '',
        oldPackingSlipNumber: null,
        newPackingSlipNumber: invoiceNumber,
        oldInvoiceNumber: null,
        newInvoiceNumber: invoiceNumber,
        action: 'RESERVE_FOR_PACKING_SLIP',
        reason: 'Reserved during P2 packing slip creation',
        changedBy: input.createdBy || 'system',
        metadata: {
          prefix: reservation.prefix,
          year: reservation.year,
          sequenceNumber: reservation.sequenceNumber,
          lotId: lot.id,
        },
      });
    } catch (auditErr) {
      console.warn('[P2Shipping] P2 invoice number audit failed during packing slip creation:', {
        packingSlipId: slip.id,
        invoiceNumber,
        auditErr,
      });
    }

    try {
      const snapshot = await persistP2PackingSlipPdfSnapshot(slip);
      slip = snapshot.slip;
    } catch (snapshotErr) {
      console.warn('[P2Shipping] Packing slip PDF snapshot failed; continuing with persisted slip:', {
        packingSlipId: slip.id,
        snapshotErr,
      });
      slip = {
        ...slip,
        pdfSnapshotWarning: 'Packing slip was created, but the frozen PDF snapshot could not be stored. It will be regenerated on view.',
      };
    }

    if (input.replacesPackingSlipId) {
      console.log(`[P2Shipping] Replacement packing slip ${slip.packingSlipNumber} (${slip.id}) created, replacing original slip ${input.replacesPackingSlipId}`);
      console.log(`[P2Shipping] Original packing slip linked: ${input.replacesPackingSlipId} → replacement: ${slip.id}`);
    }
    if (input.isNoChargeReplacement) {
      console.log(`[P2Shipping] No-charge replacement flag active for packing slip ${slip.packingSlipNumber} (${slip.id}) — invoice will be zero-dollar`);
    }

    await db
      .update(p2LotNumbers)
      .set({ packingSlipId: slip.id })
      .where(eq(p2LotNumbers.id, lot.id));

    await pool.query(`
      UPDATE p2_serial_billing_assignments
         SET packing_slip_id = $1,
             updated_at = now()
       WHERE serialized_item_id = ANY($2::uuid[])
         AND locked_at IS NULL
    `, [slip.id, serialIds]);

    return res.status(201).json(slip);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message });
    console.error('Create packing slip error:', err);
    return res.status(500).json({ error: 'Failed to create packing slip' });
  }
});

// ============================================================
// GET /api/p2/packing-slips/:id
// Returns the packing slip plus bi-directional replacement linkage:
//   - originalPackingSlip: the slip that this one replaces (populated when replacesPackingSlipId is set)
//   - replacementSlips: array of slips that reference this one as their original
// ============================================================
router.get('/packing-slips/:id', async (req: Request, res: Response) => {
  try {
    const slip = await selectP2PackingSlipById(req.params.id);
    if (!slip) return res.status(404).json({ error: 'Packing slip not found' });

    // Fetch original slip (if this slip is a replacement)
    let originalPackingSlip: typeof slip | null = null;
    if (slip.replacesPackingSlipId) {
      originalPackingSlip = await selectP2PackingSlipById(slip.replacesPackingSlipId);
    }

    // Fetch any replacement slips that reference this one as the original
    let replacementSlips: any[] = [];
    try {
      replacementSlips = await db
        .select()
        .from(p2PackingSlips)
        .where(eq(p2PackingSlips.replacesPackingSlipId, slip.id));
    } catch (err) {
      console.warn('[P2Shipping] Falling back to compatibility replacement slip lookup:', { id: slip.id, err });
      replacementSlips = await selectP2ReplacementSlipsFallback(slip.id);
    }

    let lineItems: any[];
    try {
      lineItems = await hydratePackingSlipLineItemSkus(
        Array.isArray(slip.lineItems) ? slip.lineItems : []
      );
    } catch (err) {
      console.warn('[P2Shipping] Packing slip serial SKU enrichment unavailable:', {
        packingSlipId: slip.id,
        err,
      });
      lineItems = Array.isArray(slip.lineItems) ? slip.lineItems : [];
    }

    return res.json({ ...slip, lineItems, originalPackingSlip, replacementSlips });
  } catch (err: any) {
    console.error('Get packing slip error:', err);
    return res.status(500).json({ error: 'Failed to fetch packing slip' });
  }
});

// ============================================================
// PATCH /api/p2/packing-slips/:id — Edit packing slip number and/or ship date
// Admin/Owner only. Writes audit log entries for each changed field.
// changedBy is derived from authenticated user — never trusted from request body.
// ============================================================
const editPackingSlipSchema = z.object({
  packingSlipNumber: z.string().trim().min(1).optional(),
  shipDate: z.string().datetime({ offset: true }).nullable().optional(),
  lotNumber: z.string().trim().min(1, 'Lot number cannot be empty').optional(),
  reason: z.string().trim().min(1, 'Reason is required'),
});

router.patch(
  '/packing-slips/:id',
  authenticateToken,
  requireRole('ADMIN', 'OWNER'),
  async (req: Request, res: Response) => {
    try {
      const input = editPackingSlipSchema.parse(req.body);
      const actor = req.user!.username;
      const slipId = req.params.id;

      // Fetch current slip (outside transaction — read-only pre-check)
      const slipRows = await pool.query<{
        id: string;
        packing_slip_number: string;
        invoice_number: string | null;
        ship_date: string | null;
        lot_number: string | null;
        lot_number_id: string | null;
        customer_id: string;
        customer_name: string;
      }>(
        `SELECT id, packing_slip_number, invoice_number, ship_date, lot_number, lot_number_id, customer_id, customer_name FROM p2_packing_slips WHERE id = $1`,
        [slipId]
      );
      if (slipRows.length === 0) {
        return res.status(404).json({ error: 'Packing slip not found' });
      }
      const slip = slipRows[0];

      const setClauses: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      const auditEntries: { fieldName: string; oldValue: string | null; newValue: string | null }[] = [];
      let invoiceNumberChanged = false;
      let clearPdfSnapshot = false;

      if (input.packingSlipNumber !== undefined && input.packingSlipNumber !== slip.packing_slip_number) {
        const linkedInvoiceRows = await pool.query<{ id: string; invoice_number: string }>(
          `SELECT id, invoice_number FROM ar_invoices WHERE packing_slip_id = $1 LIMIT 1`,
          [slipId]
        );
        if (linkedInvoiceRows.length > 0) {
          return res.status(409).json({
            error: `Cannot change the invoice number after invoice ${linkedInvoiceRows[0].invoice_number} has been created. Edit or void the invoice instead.`,
          });
        }

        // Check uniqueness across both visible packing-slip and AR invoice numbers.
        const dupRows = await pool.query<{ id: string }>(
          `SELECT id FROM p2_packing_slips
            WHERE (packing_slip_number = $1 OR invoice_number = $1)
              AND id != $2`,
          [input.packingSlipNumber, slipId]
        );
        if (dupRows.length > 0) {
          return res.status(409).json({ error: 'A packing slip with that number already exists' });
        }
        const dupInvoiceRows = await pool.query<{ id: string }>(
          `SELECT id FROM ar_invoices WHERE invoice_number = $1 LIMIT 1`,
          [input.packingSlipNumber]
        );
        if (dupInvoiceRows.length > 0) {
          return res.status(409).json({ error: 'An invoice with that number already exists' });
        }

        params.push(input.packingSlipNumber);
        setClauses.push(`packing_slip_number = $${params.length}`);
        setClauses.push(`invoice_number = $${params.length}`);
        invoiceNumberChanged = true;
        clearPdfSnapshot = true;
        auditEntries.push({
          fieldName: 'packing_slip_number',
          oldValue: slip.packing_slip_number,
          newValue: input.packingSlipNumber,
        });
        auditEntries.push({
          fieldName: 'invoice_number',
          oldValue: slip.invoice_number,
          newValue: input.packingSlipNumber,
        });
      }

      if (input.shipDate !== undefined) {
        const oldVal = slip.ship_date ?? null;
        const newVal = input.shipDate;
        if (oldVal !== newVal) {
          params.push(newVal);
          setClauses.push(`ship_date = $${params.length}`);
          clearPdfSnapshot = true;
          auditEntries.push({
            fieldName: 'ship_date',
            oldValue: oldVal,
            newValue: newVal,
          });
        }
      }

      let updateLotTable = false;
      if (input.lotNumber !== undefined && input.lotNumber !== (slip.lot_number ?? '')) {
        // Enforce uniqueness against p2_lot_numbers.lot_number, excluding this slip's own linked lot
        const dupLotRows = await pool.query<{ id: string }>(
          slip.lot_number_id
            ? `SELECT id FROM p2_lot_numbers WHERE lot_number = $1 AND id != $2`
            : `SELECT id FROM p2_lot_numbers WHERE lot_number = $1`,
          slip.lot_number_id ? [input.lotNumber, slip.lot_number_id] : [input.lotNumber]
        );
        if (dupLotRows.length > 0) {
          return res.status(409).json({ error: 'A lot with that number already exists' });
        }
        params.push(input.lotNumber);
        setClauses.push(`lot_number = $${params.length}`);
        clearPdfSnapshot = true;
        auditEntries.push({
          fieldName: 'lot_number',
          oldValue: slip.lot_number,
          newValue: input.lotNumber,
        });
        updateLotTable = !!slip.lot_number_id;
      }

      if (auditEntries.length === 0) {
        // Nothing changed — return current record
        const currentRows = await pool.query(
          `SELECT * FROM p2_packing_slips WHERE id = $1`,
          [slipId]
        );
        return res.json(currentRows[0]);
      }

      if (clearPdfSnapshot) {
        setClauses.push(`external_pdf_url = NULL`);
      }

      // Execute update + audit log in a single transaction using one client connection
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        params.push(slipId);
        const updateSql = `UPDATE p2_packing_slips SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`;
        const updateResult = await client.query(updateSql, params);
        const updated = updateResult.rows[0];

        if (updateLotTable && input.lotNumber !== undefined) {
          await client.query(
            `UPDATE p2_lot_numbers SET lot_number = $1, updated_at = NOW() WHERE id = $2`,
            [input.lotNumber, slip.lot_number_id]
          );
        }

        for (const entry of auditEntries) {
          await client.query(
            `INSERT INTO p2_shipping_audit_log (entity_type, entity_id, field_name, old_value, new_value, changed_by, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['packing_slip', slipId, entry.fieldName, entry.oldValue, entry.newValue, actor, input.reason]
          );
        }

        await client.query('COMMIT');
        if (invoiceNumberChanged && input.packingSlipNumber !== undefined) {
          try {
            await syncP2InvoiceSequenceFromManualNumber({
              customerId: slip.customer_id,
              customerName: slip.customer_name,
              invoiceNumber: input.packingSlipNumber,
            });
            await recordP2InvoiceNumberAudit({
              packingSlipId: slipId,
              customerId: slip.customer_id,
              oldPackingSlipNumber: slip.packing_slip_number,
              newPackingSlipNumber: input.packingSlipNumber,
              oldInvoiceNumber: slip.invoice_number,
              newInvoiceNumber: input.packingSlipNumber,
              action: 'MANUAL_EDIT',
              reason: input.reason,
              changedBy: actor,
            });
          } catch (numberAuditErr) {
            console.warn('[P2Shipping] P2 invoice number sequence/audit sync failed after manual edit:', {
              packingSlipId: slipId,
              invoiceNumber: input.packingSlipNumber,
              numberAuditErr,
            });
          }
        }
        return res.json(updated);
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ error: err.errors[0].message });
      console.error('Edit packing slip error:', err);
      return res.status(500).json({ error: 'Failed to update packing slip' });
    }
  }
);

// ============================================================
// GET /api/p2/packing-slips/:id/pdf — Stream the frozen packing slip PDF.
// New slips store their generated PDF at creation time. Legacy slips without a
// stored PDF are rendered once, saved to the slip record, then streamed.
// TODO: unify P1 + P2 packing slip storage into single document system
// ============================================================
router.get('/packing-slips/:id/pdf', async (req: Request, res: Response) => {
  // ACL enforcement: require an authenticated session
  const sessionUser = await getUserFromSession(req);
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required to access P2 shipping documents' });
  }
  const ipAddress = (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );

  try {
    const slip = await selectP2PackingSlipById(req.params.id);
    if (!slip) return res.status(404).json({ error: 'Packing slip not found' });
    let shouldPersistSnapshot = !slip.externalPdfUrl;

    if (slip.externalPdfUrl) {
      try {
        const storedBytes = await downloadStoredBuffer(slip.externalPdfUrl);
        res.set('Content-Type', 'application/pdf');
        res.set(
          'Content-Disposition',
          `inline; filename="packing-slip-${slip.packingSlipNumber}.pdf"`
        );
        await logP2DocumentAccess('packing_slip', slip.id, sessionUser.username, ipAddress);
        return res.send(storedBytes);
      } catch (downloadErr) {
        shouldPersistSnapshot = true;
        console.warn('[P2Shipping] Stored packing slip PDF unavailable; regenerating fallback snapshot:', {
          packingSlipId: slip.id,
          externalPdfUrl: slip.externalPdfUrl,
          downloadErr,
        });
      }
    }

    // Map slip DB record to PackingSlipData
    const lineItems = (slip.lineItems as any[]) || [];
    const lineItemSerialNumbers = Array.from(
      new Set(
        lineItems.flatMap((item) =>
          Array.isArray(item.serialNumbers)
            ? item.serialNumbers.filter((serial: unknown): serial is string => typeof serial === 'string' && serial.trim().length > 0)
            : []
        )
      )
    );
    type PackingSlipSerialIdentity = {
      serial_number: string;
      sku: string | null;
      drawing_name: string | null;
    };
    let serialRows: PackingSlipSerialIdentity[] = [];
    if (lineItemSerialNumbers.length > 0) {
      try {
        serialRows = await pool.query<PackingSlipSerialIdentity>(
          `SELECT serial_number, sku, drawing_name
             FROM p2_serialized_items
            WHERE serial_number = ANY($1::text[])`,
          [lineItemSerialNumbers]
        );
      } catch (err) {
        console.warn('[P2Shipping] Packing slip serial identity enrichment unavailable:', {
          packingSlipId: slip.id,
          err,
        });
      }
    }
    const serialIdentityByNumber = new Map<string, PackingSlipSerialIdentity>(
      serialRows.map((row) => [row.serial_number, row])
    );

    const slipItems: PackingSlipItem[] = lineItems.map((item) => ({
      partNumber: assignedSkuFromSerials(
        (Array.isArray(item.serialNumbers) ? item.serialNumbers : [])
          .map((serialNumber: string) => serialIdentityByNumber.get(serialNumber))
          .filter((row: unknown): row is { sku: string | null } => Boolean(row))
      ) || item.customerSku || item.sku || item.partNumber || '',
      description: Array.from(
        new Set(
          (Array.isArray(item.serialNumbers) ? item.serialNumbers : [])
            .map((serialNumber: string) => serialIdentityByNumber.get(serialNumber)?.drawing_name?.trim())
            .filter((drawingName: unknown): drawingName is string => typeof drawingName === 'string' && drawingName.length > 0)
        )
      ).join(', ') || item.drawingName || item.partName || item.partNumber || 'N/A',
      quantity: item.quantity ?? (Array.isArray(item.serialNumbers) ? item.serialNumbers.length : 1),
      serialNumbers: Array.isArray(item.serialNumbers) ? item.serialNumbers : [],
      lotNumber: item.lotNumber || slip.lotNumber || undefined,
    }));

    // Parse the stored customerAddress string into structured fields where possible,
    // preserving rawLines as a fallback for addresses that don't match a standard pattern.
    const rawAddress = slip.customerAddress || '';
    const addrLines = rawAddress
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string, index: number, lines: string[]) =>
        line.length > 0 &&
        line.toLowerCase() !== (slip.customerName || '').trim().toLowerCase() &&
        lines.findIndex((candidate) => candidate.toLowerCase() === line.toLowerCase()) === index
      );
    let structuredAddress: PackingSlipData['customerAddress'];
    if (addrLines.length > 0) {
      const lastLine = addrLines[addrLines.length - 1];
      const cityStateZip = lastLine.match(/^(.+),\s+([A-Z]{2})\s+(\S+)$/);
      if (cityStateZip) {
        structuredAddress = {
          street: addrLines[0] || '',
          street2: addrLines.length > 2 ? addrLines[1] : undefined,
          city: cityStateZip[1].trim(),
          state: cityStateZip[2],
          zip: cityStateZip[3],
        };
      } else {
        structuredAddress = { rawLines: addrLines };
      }
    }

    const slipData: PackingSlipData = {
      packingSlipNumber: slip.packingSlipNumber,
      invoiceNumber: slip.invoiceNumber || slip.packingSlipNumber,
      poNumber: slip.poNumber || undefined,
      lotNumber: slip.lotNumber || undefined,
      date: (slip.shipDate || slip.createdAt)
        ? new Date(slip.shipDate || slip.createdAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      customerName: slip.customerName,
      customerAddress: structuredAddress,
      trackingNumber: slip.trackingNumber || undefined,
      totalQuantity: slip.totalQuantity ?? 0,
      packedBy: slip.packedBy || undefined,
      verifiedBy: slip.verifiedBy || undefined,
      items: slipItems,
    };

    // LEGACY PACKING SLIP RENDERER — REPLACED BY generatePackingSlipPdf
    // const pdfDoc = await PDFDocument.create();
    // let page = pdfDoc.addPage([612, 792]);
    // const { width, height } = page.getSize();
    // const margin = 50;
    // const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    // const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    // const black = rgb(0, 0, 0);
    // const gray = rgb(0.45, 0.45, 0.45);
    // const lightGray = rgb(0.82, 0.82, 0.82);
    // const darkGray = rgb(0.2, 0.2, 0.2);
    // const tableHeaderBg = rgb(0.88, 0.88, 0.88);
    // const rowBg = rgb(0.96, 0.96, 0.96);
    // let y = height - margin;
    // const usableWidth = width - margin * 2;
    // // ── Header left ──
    // page.drawText(COMPANY_INFO.NAME, { x: margin, y, size: 13, font: boldFont, color: black });
    // y -= 14;
    // page.drawText(COMPANY_INFO.ADDRESS, { x: margin, y, size: 8.5, font, color: gray });
    // y -= 11;
    // page.drawText(`${COMPANY_INFO.PHONE}  |  ${COMPANY_INFO.EMAIL}`, { x: margin, y, size: 8.5, font, color: gray });
    // y -= 8;
    // page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lightGray });
    // y -= 22;
    // // ── Header right ──
    // const rightX = width - margin - 150;
    // const headerTopY = height - margin;
    // page.drawText('PACKING SLIP', { x: rightX, y: headerTopY, size: 16, font: boldFont, color: black });
    // page.drawText(slip.packingSlipNumber, { x: rightX, y: headerTopY - 18, size: 10, font, color: gray });
    // const slipDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    // page.drawText(`Date: ${slipDate}`, { x: rightX, y: headerTopY - 30, size: 8.5, font, color: gray });
    // // ── Ship To ──
    // page.drawText('SHIP TO:', { x: margin, y, size: 8.5, font: boldFont, color: gray });
    // y -= 13;
    // page.drawText(slip.customerName, { x: margin, y, size: 10.5, font: boldFont, color: black });
    // y -= 13;
    // const addressLines = (slip.customerAddress || '').split('\n').filter(l => l && l !== slip.customerName);
    // for (const line of addressLines) { page.drawText(line, { x: margin, y, size: 9.5, font, color: darkGray }); y -= 12; }
    // y -= 4;
    // if (slip.poNumber) { page.drawText(`PO #: ${slip.poNumber}`, { x: margin, y, size: 9.5, font, color: darkGray }); y -= 12; }
    // if (slip.lotNumber) { page.drawText(`Lot #: ${slip.lotNumber}`, { x: margin, y, size: 9.5, font, color: darkGray }); y -= 12; }
    // y -= 10;
    // page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lightGray });
    // y -= 16;
    // // ── Table ──
    // const colWidths = [90, 150, 40, 100, usableWidth - 90 - 150 - 40 - 100];
    // const colX: number[] = [margin];
    // for (let i = 0; i < colWidths.length - 1; i++) { colX.push(colX[i] + colWidths[i]); }
    // const hdrHeight = 16;
    // const headers = ['Part Number', 'Part Name', 'Qty', 'Lot Number', 'Serial Numbers'];
    // page.drawRectangle({ x: margin, y: y - hdrHeight, width: usableWidth, height: hdrHeight, color: tableHeaderBg });
    // headers.forEach((h, i) => { page.drawText(h, { x: colX[i] + 3, y: y - hdrHeight + 4, size: 8, font: boldFont, color: darkGray }); });
    // y -= hdrHeight;
    // const lineItems = (slip.lineItems as any[]) || [];
    // let rowAlt = false;
    // for (const item of lineItems) {
    //   const serialsArr: string[] = Array.isArray(item.serialNumbers) ? item.serialNumbers : [];
    //   const serialsPerRow = 2;
    //   const serialRows = Math.max(1, Math.ceil(serialsArr.length / serialsPerRow));
    //   const rowHeight = Math.max(16, serialRows * 11 + 6);
    //   if (y - rowHeight < margin + 70) { page = pdfDoc.addPage([612, 792]); y = 792 - margin; rowAlt = false; }
    //   if (rowAlt) { page.drawRectangle({ x: margin, y: y - rowHeight, width: usableWidth, height: rowHeight, color: rowBg }); }
    //   rowAlt = !rowAlt;
    //   const cellY = y - 11;
    //   page.drawText(item.partNumber || '', { x: colX[0] + 3, y: cellY, size: 8, font, color: darkGray });
    //   page.drawText((item.partName || '').slice(0, 26), { x: colX[1] + 3, y: cellY, size: 8, font, color: darkGray });
    //   page.drawText(String(item.quantity ?? serialsArr.length), { x: colX[2] + 3, y: cellY, size: 8, font, color: darkGray });
    //   page.drawText(item.lotNumber || slip.lotNumber || '', { x: colX[3] + 3, y: cellY, size: 8, font, color: darkGray });
    //   let sy = cellY;
    //   for (let r = 0; r < serialRows; r++) {
    //     const chunk = serialsArr.slice(r * serialsPerRow, (r + 1) * serialsPerRow).join('   ');
    //     page.drawText(chunk, { x: colX[4] + 3, y: sy, size: 7.5, font, color: darkGray }); sy -= 11;
    //   }
    //   page.drawLine({ start: { x: margin, y: y - rowHeight }, end: { x: width - margin, y: y - rowHeight }, thickness: 0.25, color: lightGray });
    //   y -= rowHeight;
    // }
    // // ── Totals ──
    // y -= 10;
    // page.drawText(`Total Quantity: ${slip.totalQuantity}`, { x: width - margin - 130, y, size: 9.5, font: boldFont, color: black });
    // // ── Footer ──
    // const footerY = margin + 40;
    // page.drawLine({ start: { x: margin, y: footerY + 20 }, end: { x: width - margin, y: footerY + 20 }, thickness: 0.5, color: lightGray });
    // page.drawText('Packed By: _______________________________', { x: margin, y: footerY, size: 8.5, font, color: darkGray });
    // page.drawText(`Tracking #: ${slip.trackingNumber || '_____________________________'}`, { x: margin + 260, y: footerY, size: 8.5, font, color: darkGray });
    // page.drawText('Verified By: _______________________________', { x: margin, y: footerY - 16, size: 8.5, font, color: darkGray });
    // const bytes = await pdfDoc.save();
    // res.set('Content-Type', 'application/pdf');
    // res.set('Content-Disposition', `inline; filename="packing-slip-${slip.packingSlipNumber}.pdf"`);
    // return res.send(Buffer.from(bytes));

    // The slip record is already persisted in p2_packing_slips (created via POST /packing-slips).
    // PDF bytes are rendered on-the-fly and streamed — they are NOT saved back to the DB.
    // The persistence invariant: a valid slip.id guarantees the slip metadata is in DB.
    // If this route is ever refactored to generate a slip outside a persisted record context
    // (i.e., slip.id is missing), the warning below acts as an explicit guardrail.
    const isPersistedContext = typeof slip.id === 'string' && slip.id.length > 0;
    if (!isPersistedContext) {
      console.error("WARNING: Packing slip generated without persistence");
    }
    const bytes = await generatePackingSlipPdf(slipData);
    if (shouldPersistSnapshot) {
      try {
        const storagePath = await getFileStorageProvider().uploadBuffer({
          buffer: bytes,
          fileName: `packing-slip-${slip.packingSlipNumber}.pdf`,
          contentType: 'application/pdf',
          scope: 'p2-packing-slip-issued',
          entityId: slip.id,
        });
        await db
          .update(p2PackingSlips)
          .set({ externalPdfUrl: storagePath, updatedAt: new Date() })
          .where(eq(p2PackingSlips.id, slip.id));
      } catch (snapshotErr) {
        console.warn('[P2Shipping] Failed to persist regenerated packing slip PDF snapshot:', {
          packingSlipId: slip.id,
          snapshotErr,
        });
      }
    }
    res.set('Content-Type', 'application/pdf');
    res.set(
      'Content-Disposition',
      `inline; filename="packing-slip-${slip.packingSlipNumber}.pdf"`
    );
    // Log download access before streaming
    await logP2DocumentAccess('packing_slip', slip.id, sessionUser.username, ipAddress);
    return res.send(bytes);
  } catch (err: any) {
    console.error('Packing slip PDF error:', err);
    return res.status(500).json({ error: 'Failed to generate packing slip PDF' });
  }
});

// ============================================================
// POST /api/p2/packing-slips/:id/attach-pdf — Upload external PDF
// Accepts a multipart/form-data file field named "file" (PDF only).
// Stores the file in object storage and saves the path to external_pdf_url.
// ============================================================
router.post('/packing-slips/:id/attach-pdf', authenticateToken, requirePermission('shipping.release_shipment'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const [slip] = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, req.params.id));
    if (!slip) return res.status(404).json({ error: 'Packing slip not found' });

    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are accepted' });
    }

    const storagePath = await getFileStorageProvider().uploadBuffer({
      buffer: req.file.buffer,
      fileName: `packing-slip-${slip.packingSlipNumber}-external.pdf`,
      contentType: 'application/pdf',
      scope: 'p2-packing-slip-external',
      entityId: slip.id,
    });

    const [updated] = await db
      .update(p2PackingSlips)
      .set({ externalPdfUrl: storagePath, updatedAt: new Date() })
      .where(eq(p2PackingSlips.id, req.params.id))
      .returning();

    return res.json(updated);
  } catch (err: any) {
    console.error('Attach external PDF error:', err);
    return res.status(500).json({ error: 'Failed to attach external PDF' });
  }
});

// ============================================================
// DELETE /api/p2/packing-slips/:id/attach-pdf — Remove external PDF
// ============================================================
router.delete('/packing-slips/:id/attach-pdf', authenticateToken, requirePermission('shipping.release_shipment'), async (req: Request, res: Response) => {
  try {
    const [slip] = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, req.params.id));
    if (!slip) return res.status(404).json({ error: 'Packing slip not found' });

    const [updated] = await db
      .update(p2PackingSlips)
      .set({ externalPdfUrl: null, updatedAt: new Date() })
      .where(eq(p2PackingSlips.id, req.params.id))
      .returning();

    return res.json(updated);
  } catch (err: any) {
    console.error('Remove external PDF error:', err);
    return res.status(500).json({ error: 'Failed to remove external PDF' });
  }
});

// ============================================================
// POST /api/p2/certificates — Create CoC from lot
// ============================================================
const createCertificateSchema = z.object({
  lotId: z.string().uuid(),
  createdBy: z.string().min(1).default('system'),
  certificationText: z.string().optional(),
  specialProcesses: z.string().optional(),
  qaMgrTitle: z.string().optional(),
  shipDate: z.string().optional(),
});

router.post('/certificates', authenticateToken, requirePermission('shipping.release_shipment'), async (req: Request, res: Response) => {
  try {
    const input = createCertificateSchema.parse(req.body);
    await ensureP2CertificateTemplateMetadataSchema();

    const [lot] = await db
      .select()
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, input.lotId));
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    // Idempotency guard: one certificate per lot. If the certificate already
    // exists but the lot link/UI cache is stale, return the existing CoC.
    const existingCertRows = await pool.query<{
      id: string;
      certificate_number: string;
    }>(
      `SELECT id, certificate_number
         FROM p2_certificates_of_conformance
        WHERE id = COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           OR lot_number_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 1`,
      [lot.certificateId, lot.id]
    );
    if (existingCertRows.length > 0) {
      const existingCert = existingCertRows[0];
      if (lot.certificateId !== existingCert.id) {
        await pool.query(
          `UPDATE p2_lot_numbers
              SET certificate_id = $1::uuid,
                  updated_at = NOW()
            WHERE id = $2::uuid`,
          [existingCert.id, lot.id]
        );
      }

      return res.status(200).json({
        id: existingCert.id,
        certificateNumber: existingCert.certificate_number,
        alreadyExists: true,
      });
    }

    const serialIds = (lot.serializedItemIds as string[]) || [];
    const serials = await db
      .select()
      .from(p2SerializedItems)
      .where(inArray(p2SerializedItems.id, serialIds));
    const assignedSku = assignedSkuFromSerials(serials);

    const [customer] = await db
      .select()
      .from(p2Customers)
      .where(eq(p2Customers.customerId, lot.customerId || ''));

    const customerAddress = customer ? buildCustomerAddress(customer) : '';

    const manufacturingDate =
      (serials.map((s) => s.completedAt).filter(Boolean).sort().pop() as Date | null) ||
      lot.manufacturingDate ||
      new Date();

    const certNumberRows = await pool.query<{ certificate_number: string }>(
      `SELECT certificate_number
         FROM p2_certificates_of_conformance
        WHERE certificate_number = $1
           OR certificate_number LIKE $2
        ORDER BY certificate_number DESC`,
      [lot.lotNumber, `${lot.lotNumber}-%`]
    );
    const certNumber = certNumberRows.length === 0
      ? lot.lotNumber
      : `${lot.lotNumber}-${String(certNumberRows.length + 1).padStart(2, '0')}`;

    const defaultText =
      'AG Advanced certifies that the items listed herein have been manufactured, inspected, and tested in accordance with the applicable drawings, specifications, and purchase order requirements. All materials used in manufacture conform to applicable specifications. Records are on file and available for review.';

    const templateSnapshot = await getApprovedManufacturerCocTemplateSnapshot();

    const [cert] = await db
      .insert(p2CertificatesOfConformance)
      .values({
        certificateNumber: certNumber,
        lotNumberId: lot.id,
        lotNumber: lot.lotNumber,
        customerId: lot.customerId || '',
        customerName: lot.customerName || '',
        customerAddress,
        poNumber: lot.poNumber,
        partNumber: assignedSku || lot.partNumber,
        partName: lot.partName,
        quantity: serials.length,
        serialNumbers: serials.map((s) => s.serialNumber),
        manufacturingDate: manufacturingDate as Date,
        shipDate: input.shipDate ? new Date(`${input.shipDate}T12:00:00`) : new Date(),
        certificationText: input.certificationText || defaultText,
        templateDocumentId: templateSnapshot.documentId,
        templateDocumentName: templateSnapshot.documentName,
        templateDocumentNumber: templateSnapshot.documentNumber,
        templateVersion: templateSnapshot.version,
        templateVersionDate: templateSnapshot.versionDate as any,
        templateDisplay: templateSnapshot.display,
        processRecords: { specialProcesses: input.specialProcesses?.trim() || 'N/A' },
        traceabilityData: { qaMgrTitle: input.qaMgrTitle?.trim() || 'Quality Assurance' },
        status: 'DRAFT',
        createdBy: input.createdBy,
      })
      .returning();

    await db
      .update(p2LotNumbers)
      .set({ certificateId: cert.id })
      .where(eq(p2LotNumbers.id, lot.id));

    return res.status(201).json(cert);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message });
    console.error('Create certificate error:', {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      column: err?.column,
      constraint: err?.constraint,
    });
    return res.status(500).json({
      error: err?.message || 'Failed to create certificate',
      code: err?.code,
      detail: err?.detail,
      column: err?.column,
      constraint: err?.constraint,
    });
  }
});

// ============================================================
// GET /api/p2/certificates/:id
// ============================================================
router.get('/certificates/:id', async (req: Request, res: Response) => {
  try {
    const [cert] = await db
      .select()
      .from(p2CertificatesOfConformance)
      .where(eq(p2CertificatesOfConformance.id, req.params.id));
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    const assignedSku = await getAssignedSkuForLot(cert.lotNumberId);
    return res.json({
      ...cert,
      partNumber: assignedSku || cert.partNumber,
      specialProcesses: getSpecialProcesses(cert.processRecords),
      qaMgrTitle: getQaMgrTitle(cert.traceabilityData),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch certificate' });
  }
});

// ============================================================
// GET /api/p2/certificates/:id/pdf — Generate CoC PDF
// ============================================================
router.get('/certificates/:id/pdf', async (req: Request, res: Response) => {
  // ACL enforcement: require an authenticated session
  const sessionUser = await getUserFromSession(req);
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required to access P2 shipping documents' });
  }
  const ipAddress = (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );

  try {
    const [cert] = await db
      .select()
      .from(p2CertificatesOfConformance)
      .where(eq(p2CertificatesOfConformance.id, req.params.id));
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    const assignedSku = await getAssignedSkuForLot(cert.lotNumberId);
    const displayPartNumber = assignedSku || cert.partNumber || '—';
    const specialProcesses = getSpecialProcesses(cert.processRecords);
    const qaMgrName = cert.qaMgrName || cert.approvedBy || '';
    const qaMgrTitle = getQaMgrTitle(cert.traceabilityData);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const margin = 50;
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const black = rgb(0, 0, 0);
    const gray = rgb(0.45, 0.45, 0.45);
    const lightGray = rgb(0.82, 0.82, 0.82);
    const darkGray = rgb(0.2, 0.2, 0.2);

    let y = height - margin;
    const usableWidth = width - margin * 2;

    // ── Header ──
    page.drawText('AG Advanced Technologies', { x: margin, y, size: 13, font: boldFont, color: black });
    y -= 14;
    page.drawText(COMPANY_INFO.ADDRESS, { x: margin, y, size: 8.5, font, color: gray });
    y -= 11;
    page.drawText(`${COMPANY_INFO.PHONE}  |  glenn@agadvanced.com`, {
      x: margin,
      y,
      size: 8.5,
      font,
      color: gray,
    });
    y -= 8;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 26;

    // ── Title ──
    const titleText = "MANUFACTURER'S CERTIFICATE OF CONFORMANCE";
    const titleW = boldFont.widthOfTextAtSize(titleText, 15);
    page.drawText(titleText, {
      x: (width - titleW) / 2,
      y,
      size: 15,
      font: boldFont,
      color: black,
    });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: black,
    });
    y -= 24;

    // ── Info rows ──
    const labelX = margin;
    const valueX = margin + 130;
    const rowGap = 16;

    const infoRows: [string, string][] = [
      ['Customer:', cert.customerName],
      ['Purchase Order #:', cert.poNumber || '—'],
      [assignedSku ? 'SKU:' : 'Part Number:', displayPartNumber],
      ['Part Description:', cert.partName || '—'],
      ['Special Processes:', specialProcesses],
      ['Lot Number:', cert.lotNumber || '—'],
      ['Quantity:', String(cert.quantity)],
    ];

    if (cert.manufacturingDate) {
      infoRows.push([
        'Date Manufactured:',
        new Date(cert.manufacturingDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      ]);
    }
    if (cert.shipDate) {
      infoRows.push([
        'Date Shipped:',
        new Date(cert.shipDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      ]);
    }

    for (const [label, value] of infoRows) {
      page.drawText(label, { x: labelX, y, size: 9, font: boldFont, color: darkGray });
      page.drawText(value, { x: valueX, y, size: 9, font, color: black });
      y -= rowGap;
    }

    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.3,
      color: lightGray,
    });
    y -= 16;

    // ── Serial Numbers ──
    page.drawText('Serial Numbers:', { x: margin, y, size: 9, font: boldFont, color: darkGray });
    y -= 14;

    const serialNums = (cert.serialNumbers as string[]) || [];
    const serialsPerRow = 4;
    const serialColW = usableWidth / serialsPerRow;
    for (let i = 0; i < serialNums.length; i += serialsPerRow) {
      const chunk = serialNums.slice(i, i + serialsPerRow);
      chunk.forEach((s, j) => {
        page.drawText(s, { x: margin + j * serialColW, y, size: 8.5, font, color: black });
      });
      y -= 13;
    }

    y -= 12;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.3,
      color: lightGray,
    });
    y -= 20;

    // ── Certification Statement ──
    page.drawText('CERTIFICATION STATEMENT', {
      x: margin,
      y,
      size: 9.5,
      font: boldFont,
      color: black,
    });
    y -= 14;

    const certText = cert.certificationText || '';
    const words = certText.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(testLine, 9) > usableWidth && line) {
        page.drawText(line, { x: margin, y, size: 9, font, color: darkGray });
        y -= 13;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x: margin, y, size: 9, font, color: darkGray });
      y -= 13;
    }

    // ── Signature Block ──
    const sigY = Math.min(y - 30, margin + 80);
    page.drawLine({
      start: { x: margin, y: sigY + 20 },
      end: { x: width - margin, y: sigY + 20 },
      thickness: 0.5,
      color: lightGray,
    });
    page.drawText('Quality Assurance Authorization', {
      x: margin,
      y: sigY + 4,
      size: 8.5,
      font: boldFont,
      color: darkGray,
    });
    page.drawLine({
      start: { x: margin, y: sigY - 20 },
      end: { x: margin + 210, y: sigY - 20 },
      thickness: 0.5,
      color: darkGray,
    });
    page.drawLine({
      start: { x: margin + 260, y: sigY - 20 },
      end: { x: margin + 360, y: sigY - 20 },
      thickness: 0.5,
      color: darkGray,
    });
    page.drawText('Signature', { x: margin, y: sigY - 32, size: 8, font, color: gray });
    if (qaMgrName) {
      page.drawText(qaMgrName, { x: margin, y: sigY - 45, size: 8.5, font: boldFont, color: black });
    }
    page.drawText('Title', { x: margin, y: sigY - 58, size: 8, font, color: gray });
    page.drawLine({
      start: { x: margin + 25, y: sigY - 55 },
      end: { x: margin + 210, y: sigY - 55 },
      thickness: 0.5,
      color: darkGray,
    });
    page.drawText('Date', { x: margin + 260, y: sigY - 32, size: 8, font, color: gray });

    const formNumber = cert.templateDocumentNumber || MANUFACTURER_COC_FALLBACK.documentNumber;
    const versionDisplay =
      cert.templateDisplay ||
      formatControlledVersionDisplay(
        cert.templateVersion || MANUFACTURER_COC_FALLBACK.version,
        cert.templateVersionDate || MANUFACTURER_COC_FALLBACK.versionDate
      );
    const versionW = font.widthOfTextAtSize(versionDisplay, 8);
    page.drawText(formNumber, {
      x: margin,
      y: margin - 18,
      size: 8,
      font,
      color: gray,
    });
    page.drawText(versionDisplay, {
      x: width - margin - versionW,
      y: margin - 18,
      size: 8,
      font,
      color: gray,
    });

    const bytes = await pdfDoc.save();
    res.set('Content-Type', 'application/pdf');
    res.set(
      'Content-Disposition',
      `inline; filename="coc-${cert.certificateNumber}.pdf"`
    );
    // Log download access before streaming
    await logP2DocumentAccess('certificate', cert.id, sessionUser.username, ipAddress);
    return res.send(Buffer.from(bytes));
  } catch (err: any) {
    console.error('CoC PDF error:', err);
    return res.status(500).json({ error: 'Failed to generate CoC PDF' });
  }
});

// ─── Shipment History / Detail endpoints ───────────────────────────────────

// GET /api/p2/shipments — all lots with packing slip link, newest first
router.get('/shipments', async (req: Request, res: Response) => {
  try {
    const includeVoid = String(req.query.includeVoid ?? '').toLowerCase() === 'true';
    const rows = await pool.query(
      `SELECT
         l.id,
         l.lot_number,
         l.po_number,
         l.po_id,
         l.customer_name,
         l.part_number,
         l.part_name,
         l.quantity,
         l.status,
         l.tracking_number,
         l.carrier,
         l.shipped_at,
         l.created_at,
         ps.id AS packing_slip_id,
         ps.packing_slip_number,
         inv.id AS invoice_id,
         inv.invoice_number,
         inv.status AS invoice_status
       FROM p2_lot_numbers l
       LEFT JOIN p2_packing_slips ps ON ps.lot_number_id = l.id
       LEFT JOIN LATERAL (
         SELECT id, invoice_number, status
         FROM ar_invoices
         WHERE packing_slip_id = ps.id OR lot_id = l.id
         ORDER BY created_at DESC
         LIMIT 1
       ) inv ON true
       WHERE ($1::boolean = true OR COALESCE(l.status, '') <> 'VOID')
       ORDER BY l.created_at DESC
       LIMIT 500`,
      [includeVoid]
    );
    return res.json(rows);
  } catch (err: any) {
    console.error('Shipment history error:', err);
    return res.status(500).json({ error: 'Failed to load shipment history' });
  }
});

// GET /api/p2/shipments/:lotId — full shipment detail record
router.get('/shipments/:lotId', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;

    const lotRows = await pool.query<{
      id: string; lot_number: string; lot_type: string;
      part_number: string | null; part_name: string | null;
      customer_id: string | null; customer_name: string | null;
      po_number: string | null; po_id: number | null;
      quantity: number | null;
      serialized_item_ids: any;
      status: string;
      closed_at: string | null; closed_by: string | null;
      shipped_at: string | null; shipped_by: string | null;
      packing_slip_id: string | null; certificate_id: string | null;
      notes: string | null;
      tracking_number: string | null; carrier: string | null;
      bill_of_lading_url: string | null;
      lot_validation_report_url: string | null;
      packing_slip_upload_url: string | null;
      certificate_upload_url: string | null;
      created_by: string; created_at: string;
    }>(
      `SELECT id, lot_number, lot_type, part_number, part_name,
              customer_id, customer_name, po_number, po_id, quantity,
              serialized_item_ids, status, closed_at, closed_by,
              shipped_at, shipped_by, packing_slip_id, certificate_id, notes,
              tracking_number, carrier, bill_of_lading_url,
              lot_validation_report_url,
              packing_slip_upload_url, certificate_upload_url,
              created_by, created_at
       FROM p2_lot_numbers WHERE id = $1`,
      [lotId]
    );

    if (lotRows.length === 0) return res.status(404).json({ error: 'Lot not found' });
    const lot = lotRows[0];

    // Fetch packing slip if linked
    let packingSlip: any = null;
    if (lot.packing_slip_id) {
      const psRows = await pool.query(
        `SELECT id, packing_slip_number, lot_number, customer_id, customer_name,
                po_number, invoice_number, ship_date, shipment_number, carrier,
                tracking_number, line_items, total_quantity, packed_by,
                verified_by, status, notes, created_at
         FROM p2_packing_slips WHERE id = $1`,
        [lot.packing_slip_id]
      );
      if (psRows.length) packingSlip = psRows[0];
    }

    // Fetch certificate if linked
    let certificate: any = null;
    if (lot.certificate_id) {
      const certRows = await pool.query(
        `SELECT id, certificate_number, lot_number, customer_id, customer_name,
                po_number, part_number, part_name, quantity, serial_numbers,
                manufacturing_date, ship_date, status, approved_by, approved_at,
                issued_at, created_at
         FROM p2_certificates_of_conformance WHERE id = $1`,
        [lot.certificate_id]
      );
      if (certRows.length) certificate = certRows[0];
    }

    // Fetch serialized items in this lot
    let serializedItems: any[] = [];
    const itemIds = Array.isArray(lot.serialized_item_ids) ? lot.serialized_item_ids : [];
    if (itemIds.length > 0) {
      const placeholders = itemIds.map((_: any, i: number) => `$${i + 1}`).join(', ');
      serializedItems = await pool.query(
        `SELECT id, serial_number, part_number, part_name, status, barcode,
                completed_at, po_id
         FROM p2_serialized_items WHERE id IN (${placeholders})
         ORDER BY serial_number`,
        itemIds
      );
    }

    // Fetch invoice and posting status if linked to this lot or packing slip
    const invoiceRows = await pool.query(
      `SELECT
         inv.id,
         inv.invoice_number,
         inv.invoice_date,
         inv.due_date,
         inv.total_amount,
         inv.status,
         inv.packing_slip_id,
         NULL::integer AS journal_entry_id,
         NULL::text AS journal_entry_status,
         0::int AS journal_line_count
       FROM ar_invoices inv
       WHERE inv.lot_id = $1 OR ($2::uuid IS NOT NULL AND inv.packing_slip_id = $2::uuid)
       ORDER BY inv.created_at DESC
       LIMIT 1`,
      [lotId, lot.packing_slip_id]
    );
    const invoice = invoiceRows.length ? invoiceRows[0] : null;

    return res.json({ lot, packingSlip, certificate, serializedItems, invoice });
  } catch (err: any) {
    console.error('Shipment detail error:', err);
    return res.status(500).json({ error: 'Failed to load shipment detail' });
  }
});

// GET /api/p2/shipments/:lotId/cert-package — evaluate shipment/cert-package readiness
router.get('/shipments/:lotId/cert-package', async (req: Request, res: Response) => {
  try {
    const gate = await evaluateShippingCertPackageGate(req.params.lotId);
    if (!gate) return res.status(404).json({ error: 'Lot not found' });
    return res.json(gate);
  } catch (err: any) {
    console.error('Cert package gate error:', err);
    return res.status(500).json({ error: 'Failed to evaluate cert package readiness' });
  }
});

// GET /api/p2/shipments/:lotId/cert-package/export — deterministic package manifest + hash
router.get('/shipments/:lotId/cert-package/export', async (req: Request, res: Response) => {
  try {
    const certPackage = await buildCertPackageExport(req.params.lotId);
    if (!certPackage) return res.status(404).json({ error: 'Lot not found' });

    res.set('Content-Type', 'application/json');
    res.set(
      'Content-Disposition',
      `attachment; filename="cert-package-${certPackage.lotNumber}.json"`
    );
    return res.send(JSON.stringify(certPackage, null, 2));
  } catch (err: any) {
    console.error('Cert package export error:', err);
    return res.status(500).json({ error: 'Failed to export cert package' });
  }
});

// PATCH /api/p2/shipments/:lotId — update tracking, carrier, notes; optionally mark shipped
router.patch('/shipments/:lotId', authenticateToken, requirePermission('shipping.mark_shipped'), async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const { trackingNumber, carrier, notes, markShipped, shippedBy } = req.body;
    let shipmentGate: Awaited<ReturnType<typeof evaluateShippingCertPackageGate>> | null = null;

    if (markShipped) {
      shipmentGate = await evaluateShippingCertPackageGate(lotId);
      if (!shipmentGate) return res.status(404).json({ error: 'Lot not found' });
      if (!shipmentGate.readyToShip) {
        return res.status(409).json({
          error: 'Shipment blocked by cert package gate',
          gate: 'shipping_cert_package',
          message: 'Shipment cannot be marked shipped until all required cert-package evidence is complete.',
          blockers: shipmentGate.blockers,
          evidence: shipmentGate.evidence,
          revisionSnapshot: shipmentGate.revisionSnapshot,
        });
      }
    }

    const setClauses: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (trackingNumber !== undefined) { setClauses.push(`tracking_number = $${idx++}`); vals.push(trackingNumber || null); }
    if (carrier !== undefined) { setClauses.push(`carrier = $${idx++}`); vals.push(carrier || null); }
    if (notes !== undefined) { setClauses.push(`notes = $${idx++}`); vals.push(notes || null); }
    if (markShipped) {
      setClauses.push(`status = $${idx++}`); vals.push('SHIPPED');
      setClauses.push(`shipped_at = $${idx++}`); vals.push(new Date().toISOString());
      setClauses.push(`shipped_by = $${idx++}`); vals.push(shippedBy || 'system');
    }
    setClauses.push(`updated_at = NOW()`);

    if (setClauses.length === 1) return res.status(400).json({ error: 'No fields to update' });

    vals.push(lotId);
    await pool.query(
      `UPDATE p2_lot_numbers SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      vals
    );

    // Also update packing slip tracking/carrier/status if it exists
    if (trackingNumber !== undefined || carrier !== undefined || markShipped) {
      const lotRow = await pool.query<{ packing_slip_id: string | null }>(
        `SELECT packing_slip_id FROM p2_lot_numbers WHERE id = $1`, [lotId]
      );
      if (lotRow[0]?.packing_slip_id) {
        const psUpdates: string[] = [];
        const psVals: any[] = [];
        let psIdx = 1;
        if (trackingNumber !== undefined) { psUpdates.push(`tracking_number = $${psIdx++}`); psVals.push(trackingNumber || null); }
        if (carrier !== undefined) { psUpdates.push(`carrier = $${psIdx++}`); psVals.push(carrier || null); }
        if (markShipped) {
          psUpdates.push(`status = $${psIdx++}`); psVals.push('SHIPPED');
          psUpdates.push(`ship_date = $${psIdx++}`); psVals.push(new Date().toISOString());
        }
        if (psUpdates.length) {
          psVals.push(lotRow[0].packing_slip_id);
          await pool.query(
            `UPDATE p2_packing_slips SET ${psUpdates.join(', ')} WHERE id = $${psIdx}`,
            psVals
          );
        }

        if (markShipped) {
          try {
            await createInvoiceFromPackingSlip(lotRow[0].packing_slip_id, lotId);
          } catch (invoiceErr: any) {
            console.error('Auto-invoice creation failed (shipment still succeeds):', invoiceErr);
          }
        }
      }
    }

    if (markShipped && shipmentGate) {
      await recordAuditEvent({
        eventType: 'SHIPMENT_RELEASED',
        subjectType: 'shipment',
        subjectId: lotId,
        sourceService: 'p2Shipping.route',
        actor: auditActor(req),
        reason: notes || 'Shipment marked shipped after cert package gate cleared',
        payload: {
          lotId,
          trackingNumber: trackingNumber || null,
          carrier: carrier || null,
          shippedBy: shippedBy || auditActor(req).username || 'system',
          gate: 'shipping_cert_package',
          readyToShip: shipmentGate.readyToShip,
          blockers: shipmentGate.blockers as any,
          evidence: shipmentGate.evidence as any,
          revisionSnapshot: shipmentGate.revisionSnapshot as any,
        },
        entityType: 'shipment',
        entityId: lotId,
        meta: {
          lotId,
          trackingNumber: trackingNumber || null,
          carrier: carrier || null,
          gate: 'shipping_cert_package',
          readyToShip: shipmentGate.readyToShip,
        },
      });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Shipment update error:', err);
    return res.status(500).json({ error: 'Failed to update shipment' });
  }
});

// POST /api/p2/shipments/:lotId/void — void a shipment lot and release its finalized serials for regrouping.
router.post('/shipments/:lotId/void', authenticateToken, requirePermission('shipping.release_shipment'), async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const input = voidShipmentSchema.parse(req.body);
    const actor = auditActor(req).username || req.body?.voidedBy || 'system';

    const client = await pgPool.connect();
    try {
      await ensureP2VoidShipmentSchema(client);
      await client.query('BEGIN');

      const lotRows = await client.query<{
        id: string;
        lot_number: string;
        status: string;
        packing_slip_id: string | null;
        certificate_id: string | null;
        serialized_item_ids: string[] | null;
      }>(
        `SELECT id, lot_number, status, packing_slip_id, certificate_id, serialized_item_ids
           FROM p2_lot_numbers
          WHERE id::text = $1 OR lot_number = $1
          FOR UPDATE`,
        [lotId]
      );

      if (lotRows.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Shipment lot not found' });
      }

      const lot = lotRows.rows[0];
      const wasAlreadyVoid = lot.status === 'VOID';

      const invoiceRows = wasAlreadyVoid ? { rows: [] as Array<{
        id: string;
        invoice_number: string;
        status: string;
      }> } : await client.query<{
        id: string;
        invoice_number: string;
        status: string;
      }>(
        `SELECT id, invoice_number, status
           FROM ar_invoices
          WHERE lot_id = $1
             OR ($2::uuid IS NOT NULL AND packing_slip_id = $2::uuid)
          FOR UPDATE`,
        [lot.id, lot.packing_slip_id]
      );

      const blockedInvoices = invoiceRows.rows.filter((invoice) =>
        ['POSTED', 'SENT', 'PAID'].includes(invoice.status)
      );
      if (blockedInvoices.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Shipment has posted, sent, or paid invoices. Void those invoices through finance first so reversals are handled.',
          invoices: blockedInvoices.map((invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoice_number,
            status: invoice.status,
          })),
        });
      }

      const now = new Date();
      const serializedItemIds = Array.isArray(lot.serialized_item_ids)
        ? lot.serialized_item_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];

      const finalizedSerialRows = serializedItemIds.length > 0
        ? await client.query<{
            id: string;
            barcode: string;
            sku: string | null;
            drawing_name: string | null;
            customer_serial_number: string | null;
            finalized_at: string | Date | null;
            finalized_by: string | null;
          }>(
            `SELECT id, barcode, sku, drawing_name, customer_serial_number, finalized_at, finalized_by
               FROM p2_serialized_items
              WHERE id = ANY($1::uuid[])
                AND finalized_at IS NOT NULL
              FOR UPDATE`,
            [serializedItemIds]
          )
        : { rows: [] };

      if (finalizedSerialRows.rows.length > 0) {
        const finalizedIds = finalizedSerialRows.rows.map((item) => item.id);
        await client.query(
          `UPDATE p2_serialized_items
              SET finalized_at = NULL,
                  finalized_by = NULL,
                  updated_at = NOW()
            WHERE id = ANY($1::uuid[])`,
          [finalizedIds]
        );

        for (const item of finalizedSerialRows.rows) {
          await client.query(
            `INSERT INTO p2_serialized_item_events
               (serialized_item_id, barcode, event_type, performed_by, notes, metadata)
             VALUES ($1::uuid, $2::text, 'NOTE', $3::text, $4::text, $5::jsonb)`,
            [
              item.id,
              item.barcode,
              actor,
              `Unfinalized because shipment ${lot.lot_number} was voided: ${input.reason}`,
              JSON.stringify({
                lotId: lot.id,
                lotNumber: lot.lot_number,
                previousSku: item.sku,
                previousDrawingName: item.drawing_name,
                previousCustomerSerialNumber: item.customer_serial_number,
                previousFinalizedAt: item.finalized_at,
                previousFinalizedBy: item.finalized_by,
                reason: input.reason,
                alreadyVoidShipment: wasAlreadyVoid,
              }),
            ]
          );
        }
      }

      if (!wasAlreadyVoid) {
        await client.query(
          `UPDATE p2_lot_numbers
              SET status = 'VOID',
                  closed_at = COALESCE(closed_at, $1::timestamp),
                  closed_by = COALESCE(closed_by, $2::text),
                  notes = CONCAT_WS(E'\n', NULLIF(notes, ''), $3::text),
                  updated_at = NOW()
            WHERE id = $4::uuid`,
          [now.toISOString(), actor, `VOIDED: ${input.reason}`, lot.id]
        );
      }

      if (!wasAlreadyVoid && lot.packing_slip_id) {
        await client.query(
          `UPDATE p2_packing_slips
              SET status = 'VOID',
                  notes = CONCAT_WS(E'\n', NULLIF(notes, ''), $1::text),
                  updated_at = NOW()
            WHERE id = $2::uuid`,
          [`VOIDED: ${input.reason}`, lot.packing_slip_id]
        );
      }

      if (!wasAlreadyVoid && lot.certificate_id) {
        await client.query(
          `UPDATE p2_certificates_of_conformance
              SET status = 'VOID',
                  notes = CONCAT_WS(E'\n', NULLIF(notes, ''), $1::text),
                  updated_at = NOW()
            WHERE id = $2::uuid`,
          [`VOIDED: ${input.reason}`, lot.certificate_id]
        );
      }

      const voidableInvoices = wasAlreadyVoid ? [] : invoiceRows.rows.filter((invoice) =>
        ['DRAFT', 'REVIEW'].includes(invoice.status)
      );
      for (const invoice of voidableInvoices) {
        await client.query(
          `UPDATE ar_invoices
              SET status = 'VOID',
                  voided_at = $1::timestamp,
                  voided_by = $2::text,
                  void_reason = $3::text,
                  updated_at = NOW()
            WHERE id = $4::uuid`,
          [now.toISOString(), actor, `Shipment ${lot.lot_number} voided: ${input.reason}`, invoice.id]
        );
      }

      const auditRows: Array<[string, string, string, string | null, string | null]> = wasAlreadyVoid
        ? []
        : [['lot_number', lot.id, 'status', lot.status, 'VOID']];
      if (!wasAlreadyVoid && lot.packing_slip_id) auditRows.push(['packing_slip', lot.packing_slip_id, 'status', null, 'VOID']);
      if (!wasAlreadyVoid && lot.certificate_id) auditRows.push(['certificate', lot.certificate_id, 'status', null, 'VOID']);
      for (const item of finalizedSerialRows.rows) {
        auditRows.push(['serialized_item', item.id, 'finalized_at', item.finalized_at ? String(item.finalized_at) : null, null]);
      }
      for (const invoice of voidableInvoices) {
        auditRows.push(['ar_invoice', invoice.id, 'status', invoice.status, 'VOID']);
      }

      for (const [entityType, entityId, fieldName, oldValue, newValue] of auditRows) {
        await client.query(
          `INSERT INTO p2_shipping_audit_log
             (entity_type, entity_id, field_name, old_value, new_value, changed_by, reason)
           VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text)`,
          [entityType, entityId, fieldName, oldValue, newValue, actor, input.reason]
        );
      }

      await client.query('COMMIT');
      return res.json({
        success: true,
        lotId: lot.id,
        lotNumber: lot.lot_number,
        releasedSerializedItemIds: Array.isArray(lot.serialized_item_ids) ? lot.serialized_item_ids : [],
        unfinalizedSerializedItemIds: finalizedSerialRows.rows.map((item) => item.id),
        wasAlreadyVoid,
        voidedInvoices: voidableInvoices.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          previousStatus: invoice.status,
        })),
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('Void shipment error:', { message: err?.message, code: err?.code });
    return res.status(500).json({ error: err?.message || 'Failed to void shipment' });
  }
});

// POST /api/p2/shipments/:lotId/upload-bol — upload Bill of Lading PDF/image
router.post('/shipments/:lotId/upload-bol', authenticateToken, requirePermission('shipping.release_shipment'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storagePath = await uploadP2EvidenceFile(req.file, 'p2-bill-of-lading', lotId);

    await pool.query(
      `UPDATE p2_lot_numbers SET bill_of_lading_url = $1, updated_at = NOW() WHERE id = $2`,
      [storagePath, lotId]
    );

    return res.json({ success: true, billOfLadingUrl: storagePath });
  } catch (err: any) {
    console.error('BoL upload error:', err);
    return res.status(500).json({ error: 'Failed to upload bill of lading' });
  }
});

// GET /api/p2/shipments/:lotId/bill-of-lading — stream BoL file back to client
router.get('/shipments/:lotId/bill-of-lading', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const rows = await pool.query<{ bill_of_lading_url: string | null }>(
      `SELECT bill_of_lading_url FROM p2_lot_numbers WHERE id = $1`, [lotId]
    );
    const bolUrl = rows[0]?.bill_of_lading_url;
    if (!bolUrl) return res.status(404).json({ error: 'No bill of lading attached' });

    const buffer = await downloadStoredBuffer(bolUrl);
    const ext = bolUrl.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : (ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'));
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `inline; filename="bill-of-lading"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('BoL download error:', err);
    return res.status(500).json({ error: 'Failed to retrieve bill of lading' });
  }
});

// POST /api/p2/shipments/:lotId/upload-lot-validation-report — upload Lot Validation Report PDF/image
router.post('/shipments/:lotId/upload-lot-validation-report', authenticateToken, requirePermission('shipping.release_shipment'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storagePath = await uploadP2EvidenceFile(req.file, 'p2-lot-validation-report', lotId);

    await pool.query(
      `UPDATE p2_lot_numbers SET lot_validation_report_url = $1, updated_at = NOW() WHERE id = $2`,
      [storagePath, lotId]
    );

    return res.json({ success: true, lotValidationReportUrl: storagePath });
  } catch (err: any) {
    console.error('Lot validation report upload error:', err);
    return res.status(500).json({ error: 'Failed to upload lot validation report' });
  }
});

// GET /api/p2/shipments/:lotId/lot-validation-report — stream Lot Validation Report back to client
router.get('/shipments/:lotId/lot-validation-report', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const rows = await pool.query<{ lot_validation_report_url: string | null }>(
      `SELECT lot_validation_report_url FROM p2_lot_numbers WHERE id = $1`, [lotId]
    );
    const fileUrl = rows[0]?.lot_validation_report_url;
    if (!fileUrl) return res.status(404).json({ error: 'No lot validation report attached' });

    const buffer = await downloadStoredBuffer(fileUrl);
    const ext = fileUrl.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : (ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'));
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `inline; filename="lot-validation-report"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('Lot validation report download error:', err);
    return res.status(500).json({ error: 'Failed to retrieve lot validation report' });
  }
});

// POST /api/p2/shipments/:lotId/upload-packing-slip — upload external packing slip PDF
router.post('/shipments/:lotId/upload-packing-slip', authenticateToken, requirePermission('shipping.release_shipment'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storagePath = await uploadP2EvidenceFile(req.file, 'p2-packing-slip-upload', lotId);

    await pool.query(
      `UPDATE p2_lot_numbers SET packing_slip_upload_url = $1, updated_at = NOW() WHERE id = $2`,
      [storagePath, lotId]
    );

    return res.json({ success: true, packingSlipUploadUrl: storagePath });
  } catch (err: any) {
    console.error('Packing slip upload error:', err);
    return res.status(500).json({ error: 'Failed to upload packing slip' });
  }
});

// GET /api/p2/shipments/:lotId/packing-slip-upload — download uploaded packing slip PDF
router.get('/shipments/:lotId/packing-slip-upload', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const rows = await pool.query<{ packing_slip_upload_url: string | null }>(
      `SELECT packing_slip_upload_url FROM p2_lot_numbers WHERE id = $1`, [lotId]
    );
    const fileUrl = rows[0]?.packing_slip_upload_url;
    if (!fileUrl) return res.status(404).json({ error: 'No packing slip upload attached' });

    const buffer = await downloadStoredBuffer(fileUrl);
    const ext = fileUrl.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : (ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'));
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `inline; filename="packing-slip-upload"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('Packing slip download error:', err);
    return res.status(500).json({ error: 'Failed to retrieve packing slip' });
  }
});

// POST /api/p2/shipments/:lotId/upload-certificate — upload external certificate PDF
router.post('/shipments/:lotId/upload-certificate', authenticateToken, requirePermission('shipping.release_shipment'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storagePath = await uploadP2EvidenceFile(req.file, 'p2-certificate-upload', lotId);

    await pool.query(
      `UPDATE p2_lot_numbers SET certificate_upload_url = $1, updated_at = NOW() WHERE id = $2`,
      [storagePath, lotId]
    );

    return res.json({ success: true, certificateUploadUrl: storagePath });
  } catch (err: any) {
    console.error('Certificate upload error:', err);
    return res.status(500).json({ error: 'Failed to upload certificate' });
  }
});

// GET /api/p2/shipments/:lotId/certificate-upload — download uploaded certificate PDF
router.get('/shipments/:lotId/certificate-upload', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const rows = await pool.query<{ certificate_upload_url: string | null }>(
      `SELECT certificate_upload_url FROM p2_lot_numbers WHERE id = $1`, [lotId]
    );
    const fileUrl = rows[0]?.certificate_upload_url;
    if (!fileUrl) return res.status(404).json({ error: 'No certificate upload attached' });

    const buffer = await downloadStoredBuffer(fileUrl);
    const ext = fileUrl.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : (ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'));
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `inline; filename="certificate-upload"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('Certificate download error:', err);
    return res.status(500).json({ error: 'Failed to retrieve certificate' });
  }
});

// ── Override Shipping Data endpoints (CMMC/DCAA compliant) ─────────────────

const OVERRIDE_ALLOWED_ROLES = ['ADMIN', 'OWNER'];

const overrideShippingSchema = z.object({
  shipped_date: z.string().optional(),
  lot_number: z.string().optional(),
  reason: z.string().min(1, 'Reason is required'),
}).refine(
  (d) => d.shipped_date !== undefined || d.lot_number !== undefined,
  { message: 'At least one of shipped_date or lot_number must be provided' }
);

// PATCH /api/p2/lots/:id/override — override shipped_at and/or lot_number with audit trail
router.patch(
  '/lots/:id/override',
  authenticateToken,
  requireRole(...OVERRIDE_ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { id: lotId } = req.params;
      const input = overrideShippingSchema.parse(req.body);
      const actor = req.user!.username;

      // Validate shipped_date format up front
      let parsedDate: Date | undefined;
      if (input.shipped_date !== undefined) {
        parsedDate = new Date(input.shipped_date);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: 'Invalid shipped_date format. Use ISO 8601 or YYYY-MM-DD.' });
        }
      }

      // Fetch current lot values
      const lotRows = await pool.query<{
        id: string;
        lot_number: string;
        shipped_at: string | null;
        packing_slip_id: string | null;
      }>(
        `SELECT id, lot_number, shipped_at, packing_slip_id FROM p2_lot_numbers WHERE id = $1`,
        [lotId]
      );
      if (lotRows.length === 0) return res.status(404).json({ error: 'Lot not found' });
      const lot = lotRows[0];

      // Collect changes (before touching the DB) so we can detect no-ops
      type AuditEntry = { entityType: string; entityId: string; fieldName: string; oldValue: string | null; newValue: string | null };
      const auditInserts: AuditEntry[] = [];

      const lotUpdates: string[] = [];
      const lotVals: any[] = [];
      let lotIdx = 1;

      if (input.lot_number !== undefined && input.lot_number !== lot.lot_number) {
        auditInserts.push({ entityType: 'lot_number', entityId: lotId, fieldName: 'lot_number', oldValue: lot.lot_number, newValue: input.lot_number });
        lotUpdates.push(`lot_number = $${lotIdx++}`);
        lotVals.push(input.lot_number);
      }

      if (parsedDate !== undefined) {
        const oldVal = lot.shipped_at ? new Date(lot.shipped_at).toISOString() : null;
        const newVal = parsedDate.toISOString();
        if (oldVal !== newVal) {
          auditInserts.push({ entityType: 'lot_number', entityId: lotId, fieldName: 'shipped_at', oldValue: oldVal, newValue: newVal });
          lotUpdates.push(`shipped_at = $${lotIdx++}`);
          lotVals.push(parsedDate.toISOString());
        }
      }

      // Packing slip preamble (needed to detect changes before transaction)
      let psShipDateChange: { oldPsDate: string | null; newDateIso: string } | null = null;
      let psLotNumberChange: { oldPsLotNumber: string | null } | null = null;

      if (lot.packing_slip_id) {
        if (parsedDate !== undefined) {
          const psRows = await pool.query<{ ship_date: string | null }>(
            `SELECT ship_date FROM p2_packing_slips WHERE id = $1`,
            [lot.packing_slip_id]
          );
          const oldPsDate = psRows[0]?.ship_date ? new Date(psRows[0].ship_date).toISOString() : null;
          const newDateIso = parsedDate.toISOString();
          if (oldPsDate !== newDateIso) {
            psShipDateChange = { oldPsDate, newDateIso };
            auditInserts.push({ entityType: 'packing_slip', entityId: lot.packing_slip_id, fieldName: 'ship_date', oldValue: oldPsDate, newValue: newDateIso });
          }
        }
        if (input.lot_number !== undefined && input.lot_number !== lot.lot_number) {
          const psLotRows = await pool.query<{ lot_number: string | null }>(
            `SELECT lot_number FROM p2_packing_slips WHERE id = $1`,
            [lot.packing_slip_id]
          );
          psLotNumberChange = { oldPsLotNumber: psLotRows[0]?.lot_number ?? null };
          auditInserts.push({ entityType: 'packing_slip', entityId: lot.packing_slip_id, fieldName: 'lot_number', oldValue: psLotRows[0]?.lot_number ?? null, newValue: input.lot_number });
        }
      }

      // Server-side no-op guard — reject if nothing would actually change
      if (auditInserts.length === 0) {
        return res.status(400).json({ error: 'No changes detected. The provided values are identical to the current values.' });
      }

      // Execute all writes atomically
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        if (lotUpdates.length > 0) {
          lotUpdates.push(`updated_at = NOW()`);
          lotVals.push(lotId);
          await client.query(
            `UPDATE p2_lot_numbers SET ${lotUpdates.join(', ')} WHERE id = $${lotIdx}`,
            lotVals
          );
        }

        if (lot.packing_slip_id) {
          if (psShipDateChange) {
            await client.query(
              `UPDATE p2_packing_slips SET ship_date = $1, updated_at = NOW() WHERE id = $2`,
              [psShipDateChange.newDateIso, lot.packing_slip_id]
            );
          }
          if (psLotNumberChange && input.lot_number) {
            await client.query(
              `UPDATE p2_packing_slips SET lot_number = $1, updated_at = NOW() WHERE id = $2`,
              [input.lot_number, lot.packing_slip_id]
            );
          }
        }

        for (const entry of auditInserts) {
          await client.query(
            `INSERT INTO p2_shipping_audit_log (entity_type, entity_id, field_name, old_value, new_value, changed_by, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [entry.entityType, entry.entityId, entry.fieldName, entry.oldValue, entry.newValue, actor, input.reason]
          );
        }

        await client.query('COMMIT');
      } catch (txErr: any) {
        await client.query('ROLLBACK');
        console.error('Override shipping data transaction error:', {
          message: txErr?.message,
          code: txErr?.code,
          detail: txErr?.detail,
          table: txErr?.table,
          lotId,
          actor,
        });
        throw txErr;
      } finally {
        client.release();
      }

      return res.json({ success: true, auditRowsWritten: auditInserts.length });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error('Override shipping data error:', { message: err?.message, code: err?.code });
      return res.status(500).json({ error: 'Failed to override shipping data' });
    }
  }
);

// GET /api/p2/packing-slips/:id/audit-log — retrieve audit log for a packing slip (admin/owner only)
router.get(
  '/packing-slips/:id/audit-log',
  authenticateToken,
  requireRole(...OVERRIDE_ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { id: slipId } = req.params;

      // Verify slip exists and pull linked lot id so we can include lot-scoped entries
      const slipCheck = await pool.query<{ id: string; lot_number_id: string | null }>(
        `SELECT id, lot_number_id FROM p2_packing_slips WHERE id = $1`,
        [slipId]
      );
      if (slipCheck.length === 0) return res.status(404).json({ error: 'Packing slip not found' });

      const entityIds = [slipId];
      if (slipCheck[0].lot_number_id) entityIds.push(slipCheck[0].lot_number_id);

      const placeholders = entityIds.map((_, i) => `$${i + 1}`).join(', ');
      const rows = await pool.query(
        `SELECT * FROM p2_shipping_audit_log WHERE entity_id IN (${placeholders}) ORDER BY changed_at DESC`,
        entityIds
      );
      return res.json(rows);
    } catch (err: any) {
      console.error('Packing slip audit log fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  }
);

// GET /api/p2/lots/:id/audit-log — retrieve audit log for a lot (admin/owner only)
router.get(
  '/lots/:id/audit-log',
  authenticateToken,
  requireRole(...OVERRIDE_ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { id: lotId } = req.params;

      // Verify lot exists
      const lotCheck = await pool.query<{ id: string; packing_slip_id: string | null }>(
        `SELECT id, packing_slip_id FROM p2_lot_numbers WHERE id = $1`,
        [lotId]
      );
      if (lotCheck.length === 0) return res.status(404).json({ error: 'Lot not found' });

      const entityIds = [lotId];
      if (lotCheck[0].packing_slip_id) entityIds.push(lotCheck[0].packing_slip_id);

      const placeholders = entityIds.map((_, i) => `$${i + 1}`).join(', ');
      const rows = await pool.query(
        `SELECT * FROM p2_shipping_audit_log WHERE entity_id IN (${placeholders}) ORDER BY changed_at DESC`,
        entityIds
      );
      return res.json(rows);
    } catch (err: any) {
      console.error('Audit log fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  }
);

// GET /api/p2/serial-search?q=XXXX — partial serial number search with project linkage
router.get('/serial-search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q) return res.json([]);

    const rows = await pool.query<{
      serial_number: string;
      part_number: string;
      part_name: string;
      po_id: number;
      po_number: string;
      project_id: string | null;
      project_code: string | null;
      project_name: string | null;
    }>(
      `SELECT
         si.serial_number,
         si.part_number,
         si.part_name,
         si.po_id,
         po.po_number,
         p.id        AS project_id,
         p.project_code,
         p.project_name
       FROM p2_serialized_items si
       JOIN p2_purchase_orders po ON po.id = si.po_id
       LEFT JOIN projects p ON p.po_id = po.id
       WHERE si.serial_number ILIKE '%' || $1 || '%'
       ORDER BY si.serial_number
       LIMIT 10`,
      [q]
    );

    return res.json(rows);
  } catch (err: any) {
    console.error('Serial search error:', err);
    return res.status(500).json({ error: 'Serial search failed' });
  }
});

export default router;
