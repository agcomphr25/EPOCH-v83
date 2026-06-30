import { Router } from 'express';

import { pool, db } from '../../db';
import { authenticateToken } from '../../middleware/auth';
import { createShipment, ShipTo } from '../utils/upsShipping';
import { auditUpdateOrders } from '../services/orderAuditWrapper';
import { auditService } from '../services/auditService';
import { generatePoPackingSlipPdf } from '../../utils/pdf/packingSlipPdf';
import type { PackingSlipData } from '../../utils/pdf/types';
import {
  groupItemsByDescription,
  resolvePackingSlipDescription,
} from '../helpers/packingSlipHelper';
import {
  createOrUpdateP1ShipmentRevenueFromShipmentRecord,
  reverseP1ShipmentRevenueDraftOrEntry,
} from '../services/p1ShipmentRevenueService';
import { buildRevenueDimensionTags } from '../services/productionLineAccounting';
import { deriveP1ProductionStatus } from '../utils/p1ProductionStatus';

const router = Router();

// Auto-close a PO when all non-cancelled production orders are SHIPPED
async function autoClosePOIfFullyShipped(poId: number): Promise<void> {
  try {
    const rows = await pool.query<{
      total: string;
      shipped: string;
      cancelled: string;
    }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE production_status = 'SHIPPED') AS shipped,
         COUNT(*) FILTER (WHERE production_status = 'CANCELLED') AS cancelled
       FROM production_orders
       WHERE po_id = $1`,
      [poId]
    );
    const row = rows[0];
    if (!row) return;
    const total = parseInt(row.total, 10);
    const shipped = parseInt(row.shipped, 10);
    const cancelled = parseInt(row.cancelled, 10);
    const active = total - cancelled;
    if (active > 0 && shipped >= active) {
      await pool.query(
        `UPDATE purchase_orders SET status = 'CLOSED' WHERE id = $1 AND status = 'OPEN'`,
        [poId]
      );
      console.log(
        `✅ PO id=${poId} auto-closed — all ${active} active order(s) shipped`
      );
    }
  } catch (err: any) {
    console.warn(`⚠️ Auto-close check for PO ${poId} failed: ${err.message}`);
  }
}

function rowsOf<T = any>(result: any): T[] {
  return Array.isArray(result) ? result : result?.rows || [];
}

function isGlennAdmin(user: any): boolean {
  return (
    user?.username === 'glennj' &&
    String(user?.role || '').toUpperCase() === 'ADMIN'
  );
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

let p1FulfillmentAttemptsTableAvailable: boolean | null = null;

async function hasP1FulfillmentAttemptsTable(): Promise<boolean> {
  if (p1FulfillmentAttemptsTableAvailable != null) {
    return p1FulfillmentAttemptsTableAvailable;
  }

  try {
    const rows = rowsOf<{ table_exists: boolean }>(
      await pool.query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name = 'p1_fulfillment_attempts'
         ) AS table_exists`
      )
    );
    p1FulfillmentAttemptsTableAvailable = Boolean(rows[0]?.table_exists);
  } catch (err: any) {
    console.warn(
      `Could not inspect P1 fulfillment artifact table: ${err.message}`
    );
    p1FulfillmentAttemptsTableAvailable = false;
  }

  return p1FulfillmentAttemptsTableAvailable;
}

async function findP1PackingSlipInvoice(
  shipmentRecordId: string,
  poNumber: string
) {
  const includeArtifactHistory = await hasP1FulfillmentAttemptsTable();
  const shipmentPoCount = await getP1ShipmentPoCount(shipmentRecordId);
  const rows = rowsOf<{
    id: string;
    invoice_number: string;
    status: string;
  }>(
    await pool.query(
      `SELECT inv.id, inv.invoice_number, inv.status
     FROM ar_invoices inv
     WHERE COALESCE(inv.status, '') <> 'VOID'
       AND (
         EXISTS (
           SELECT 1
           FROM ar_invoice_lines line
           WHERE line.invoice_id = inv.id
             AND line.dimension_tags->>'source' = 'p1_oem_packing_slip'
             AND line.dimension_tags->>'shipmentRecordId' = $1
             AND line.dimension_tags->>'poNumber' = $2
         )
         ${
           includeArtifactHistory
             ? `OR (
           inv.po_override = $2
           AND inv.invoice_number IN (
             SELECT pfa.metadata->>'invoiceNumber'
             FROM p1_fulfillment_attempts pfa
             WHERE pfa.metadata->>'invoiceNumber' IS NOT NULL
               AND pfa.shipment_record_id::text = $1
               AND pfa.metadata->>'poNumber' = $2
           )
           AND (
             inv.notes ILIKE 'Auto-created from P1 OEM packing slip%'
             OR inv.internal_notes ILIKE 'Source: P1 OEM shipment%'
         )
         )`
             : ''
         }
         OR (
           inv.po_override = $2
           AND (
             inv.internal_notes ILIKE '%' || $1 || '%'
             OR inv.notes ILIKE '%' || $1 || '%'
             OR EXISTS (
               SELECT 1
               FROM shipment_records sr
               WHERE sr.id::text = $1
                 AND NULLIF(sr.reference, '') IS NOT NULL
                 AND (
                   inv.internal_notes ILIKE '%' || sr.reference || '%'
                   OR inv.notes ILIKE '%' || sr.reference || '%'
                 )
             )
           )
           AND (
             inv.notes ILIKE 'Auto-created from P1 OEM packing slip%'
             OR inv.internal_notes ILIKE 'Source: P1 OEM shipment%'
           )
         )
         ${
           shipmentPoCount <= 1
             ? `OR (
           inv.po_override = $2
           AND inv.invoice_number = (
             SELECT sr.invoice_number
             FROM shipment_records sr
             WHERE sr.id::text = $1
             LIMIT 1
           )
           AND (
             inv.notes ILIKE 'Auto-created from P1 OEM packing slip%'
             OR inv.internal_notes ILIKE 'Source: P1 OEM shipment%'
           )
         )`
             : ''
         }
       )
     ORDER BY inv.created_at DESC
     LIMIT 1`,
      [shipmentRecordId, poNumber]
    )
  );

  return rows[0] || null;
}

async function findP1PackingSlipInvoiceForOrders(
  poNumber: string,
  orderIds: string[]
) {
  const usableOrderIds = orderIds.filter(Boolean);
  if (usableOrderIds.length === 0) return null;

  const rows = rowsOf<{
    id: string;
    invoice_number: string;
    status: string;
  }>(
    await pool.query(
      `SELECT inv.id, inv.invoice_number, inv.status
     FROM ar_invoices inv
     WHERE COALESCE(inv.status, '') <> 'VOID'
       AND (
         EXISTS (
           SELECT 1
           FROM ar_invoice_lines line
           WHERE line.invoice_id = inv.id
             AND line.dimension_tags->>'source' = 'p1_oem_packing_slip'
             AND line.dimension_tags->>'poNumber' = $1
             AND (
               line.dimension_tags->>'orderId' = ANY($2::text[])
               OR EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements_text(
                   CASE
                     WHEN jsonb_typeof(line.dimension_tags->'orderIds') = 'array'
                     THEN line.dimension_tags->'orderIds'
                     ELSE '[]'::jsonb
                   END
                 ) AS order_id(value)
                 WHERE order_id.value = ANY($2::text[])
               )
             )
         )
       )
     ORDER BY inv.created_at DESC
     LIMIT 1`,
      [poNumber, usableOrderIds]
    )
  );

  return rows[0] || null;
}

async function findReusableP1InvoiceNumber({
  poNumber,
  orderIds,
  shipmentRecordId,
  includeBroadHistory = false,
}: {
  poNumber: string;
  orderIds: string[];
  shipmentRecordId?: string | null;
  includeBroadHistory?: boolean;
}): Promise<string | null> {
  try {
    if (!(await hasP1FulfillmentAttemptsTable())) {
      return null;
    }

    if (shipmentRecordId) {
      const exactShipmentRows = rowsOf<{ invoice_number: string }>(
        await pool.query(
          `SELECT metadata->>'invoiceNumber' AS invoice_number
       FROM p1_fulfillment_attempts
       WHERE metadata->>'invoiceNumber' IS NOT NULL
         AND shipment_record_id::text = $1
         AND metadata->>'poNumber' = $2
       ORDER BY COALESCE(completed_at, updated_at, created_at) DESC
       LIMIT 1`,
          [shipmentRecordId, poNumber]
        )
      );

      if (exactShipmentRows[0]?.invoice_number) {
        return exactShipmentRows[0].invoice_number;
      }
    }

    if (!includeBroadHistory) {
      return null;
    }

    const attemptRows = rowsOf<{ invoice_number: string }>(
      await pool.query(
        `SELECT metadata->>'invoiceNumber' AS invoice_number
       FROM p1_fulfillment_attempts
       WHERE metadata->>'invoiceNumber' IS NOT NULL
         AND (
           metadata->>'poNumber' = $1
           OR order_id = ANY($2::text[])
         )
       ORDER BY COALESCE(completed_at, updated_at, created_at) DESC
       LIMIT 1`,
        [poNumber, orderIds]
      )
    );

    if (attemptRows[0]?.invoice_number) {
      return attemptRows[0].invoice_number;
    }
  } catch (err: any) {
    console.warn(
      `⚠️ Could not search P1 fulfillment artifact history for PO ${poNumber}: ${err.message}`
    );
  }

  return null;
}

function extractP1InvoiceNumberFromPdfText(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const invoiceLabelMatch = normalized.match(/Invoice\s*#\s*([A-Z0-9-]+)/i);
  if (invoiceLabelMatch?.[1]) return invoiceLabelMatch[1];

  const packingSlipLabelMatch = normalized.match(/Packing\s+Slip\s*#\s*([A-Z0-9-]+)/i);
  if (packingSlipLabelMatch?.[1]) return packingSlipLabelMatch[1];

  return null;
}

async function findP1PackingSlipNumberFromStoredPdf({
  shipmentRecordId,
  poNumber,
}: {
  shipmentRecordId: string | null;
  poNumber: string;
}): Promise<string | null> {
  if (!shipmentRecordId) return null;

  try {
    const pdfRows = rowsOf<{ packing_slip_base64: string | null }>(
      await pool.query(
        `SELECT si.packing_slip_base64
         FROM shipment_items si
         LEFT JOIN production_orders prod_ord ON prod_ord.order_id = si.order_id
         LEFT JOIN purchase_order_items poi ON poi.id = si.po_item_id
         LEFT JOIN purchase_orders po ON po.id = poi.po_id
         WHERE si.shipment_id = $1
           AND si.packing_slip_base64 IS NOT NULL
           AND COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number) = $2
         ORDER BY si.created_at DESC
         LIMIT 1`,
        [shipmentRecordId, poNumber]
      )
    );
    const packingSlipBase64 = pdfRows[0]?.packing_slip_base64;
    if (!packingSlipBase64) return null;

    const { PDFParse } = await import('pdf-parse/node');
    const parser = new PDFParse({
      data: new Uint8Array(Buffer.from(packingSlipBase64, 'base64')),
      verbosity: 0,
    });
    const parsed = await parser.getText();
    await parser.destroy();

    const invoiceNumber = extractP1InvoiceNumberFromPdfText(parsed.text || '');
    return invoiceNumber && /^[A-Z0-9-]+$/.test(invoiceNumber) ? invoiceNumber : null;
  } catch (err: any) {
    console.warn(
      `Could not extract P1 packing slip invoice number for shipment ${shipmentRecordId}, PO ${poNumber}: ${err.message}`
    );
    return null;
  }
}

async function resolveP1PackingSlipInvoiceNumber({
  shipmentRecordId,
  shipmentPoCount,
  shipmentInvoiceNumber,
  poNumber,
  orderIds,
}: {
  shipmentRecordId: string | null;
  shipmentPoCount: number;
  shipmentInvoiceNumber: string | null;
  poNumber: string;
  orderIds: string[];
}): Promise<string | null> {
  const reusableInvoiceNumber = await findReusableP1InvoiceNumber({
    poNumber,
    orderIds,
    shipmentRecordId,
    includeBroadHistory: false,
  });
  if (reusableInvoiceNumber) return reusableInvoiceNumber;

  const storedPdfInvoiceNumber = await findP1PackingSlipNumberFromStoredPdf({
    shipmentRecordId,
    poNumber,
  });
  if (storedPdfInvoiceNumber) return storedPdfInvoiceNumber;

  if (shipmentPoCount <= 1 && shipmentInvoiceNumber) {
    return shipmentInvoiceNumber;
  }

  return null;
}

async function getP1ShipmentPoCount(shipmentRecordId: string): Promise<number> {
  try {
    const rows = rowsOf<{ po_count: number | string }>(
      await pool.query(
        `SELECT COUNT(DISTINCT COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number))::int AS po_count
         FROM shipment_items si
         LEFT JOIN production_orders prod_ord ON prod_ord.order_id = si.order_id
         LEFT JOIN purchase_order_items poi ON poi.id = si.po_item_id
         LEFT JOIN purchase_orders po ON po.id = poi.po_id
         WHERE si.shipment_id = $1`,
        [shipmentRecordId]
      )
    );

    return Number(rows[0]?.po_count || 0);
  } catch (err: any) {
    console.warn(
      `Could not count P1 shipment POs for shipment ${shipmentRecordId}: ${err.message}`
    );
    return 0;
  }
}

async function buildP1PackingSlipInvoiceDraft(
  shipmentRecordId: string,
  poNumber: string
) {
  const lineResult = await pool.query(
    `WITH shipment_lines AS (
       SELECT
         sr.id AS shipment_record_id,
         sr.reference,
         sr.invoice_number AS shipment_invoice_number,
         sr.master_tracking_number,
         sr.shipped_at,
         sr.created_at AS shipment_created_at,
         sr.customer_id AS shipment_customer_id,
         sr.customer_name AS shipment_customer_name,
         sr.ship_to_snapshot,
         si.id AS shipment_item_id,
         si.order_id,
         si.quantity,
         si.po_item_id AS p1_po_item_id,
         COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number) AS po_number,
         COALESCE(NULLIF(si.description, ''), poi.stock_model_name, poi.item_name, prod_ord.item_name, si.order_id) AS description,
         COALESCE(poi.item_id, poi.stock_model_id, poi.item_name, prod_ord.item_name, si.order_id) AS part_number,
         poi.unit_price,
         po.id AS purchase_order_id,
         po.customer_id AS po_customer_id,
         po.customer_name AS po_customer_name
       FROM shipment_records sr
       JOIN shipment_items si ON si.shipment_id = sr.id
       LEFT JOIN production_orders prod_ord ON prod_ord.order_id = si.order_id
       LEFT JOIN purchase_order_items poi ON poi.id = si.po_item_id
       LEFT JOIN purchase_orders po ON po.id = poi.po_id
       WHERE sr.id = $1
     )
     SELECT *
     FROM shipment_lines
     WHERE po_number = $2
     ORDER BY order_id, shipment_item_id`,
    [shipmentRecordId, poNumber]
  );

  const lines = rowsOf<any>(lineResult);
  if (lines.length === 0) {
    throw new Error('No shipment items found for this P1 packing slip.');
  }

  const shipmentOrderIds = lines.map((line: any) => line.order_id).filter(Boolean);
  const existingForShipment = await findP1PackingSlipInvoice(
    shipmentRecordId,
    poNumber
  );
  if (existingForShipment) {
    return {
      existingInvoice: existingForShipment,
      invoiceNumber: existingForShipment.invoice_number,
      lines,
      consolidatedLines: [],
      subtotal: 0,
      pricingMismatch: false,
      first: lines[0],
    };
  }

  const existingForOrders = await findP1PackingSlipInvoiceForOrders(
    poNumber,
    shipmentOrderIds
  );
  if (existingForOrders) {
    return {
      existingInvoice: existingForOrders,
      invoiceNumber: existingForOrders.invoice_number,
      lines,
      consolidatedLines: [],
      subtotal: 0,
      pricingMismatch: false,
      first: lines[0],
    };
  }

  const first = lines[0];
  const resolvedShipmentRecordId = first.shipment_record_id || shipmentRecordId;
  const shipmentPoCount = resolvedShipmentRecordId
    ? await getP1ShipmentPoCount(resolvedShipmentRecordId)
    : 0;
  const invoiceNumber = await resolveP1PackingSlipInvoiceNumber({
    shipmentRecordId: resolvedShipmentRecordId,
    shipmentPoCount,
    shipmentInvoiceNumber: first.shipment_invoice_number || null,
    poNumber,
    orderIds: shipmentOrderIds,
  });

  const consolidatedLines = Array.from(
    lines
      .reduce((map: Map<string, any>, line: any) => {
        const unitPrice = Number(line.unit_price || 0);
        const partNumber = line.part_number || null;
        const description = line.description || line.order_id || poNumber;
        const key = JSON.stringify([partNumber, description, unitPrice]);
        const existing = map.get(key);
        if (existing) {
          existing.quantity += Number(line.quantity || 0);
          existing.shipmentItemIds.push(line.shipment_item_id);
          existing.orderIds.push(line.order_id);
          existing.p1PoItemIds.push(line.p1_po_item_id);
        } else {
          map.set(key, {
            ...line,
            part_number: partNumber,
            description,
            unit_price: unitPrice,
            quantity: Number(line.quantity || 0),
            shipmentItemIds: [line.shipment_item_id],
            orderIds: [line.order_id],
            p1PoItemIds: [line.p1_po_item_id],
          });
        }
        return map;
      }, new Map<string, any>())
      .values()
  );

  const subtotal = consolidatedLines.reduce(
    (sum: number, line: any) =>
      sum + Number(line.quantity || 0) * Number(line.unit_price || 0),
    0
  );
  const pricingMismatch = lines.some(
    (line: any) => line.unit_price === null || line.unit_price === undefined
  );

  return {
    existingInvoice: null,
    invoiceNumber,
    lines,
    consolidatedLines,
    subtotal,
    pricingMismatch,
    first,
  };
}

async function recordP1FulfillmentArtifacts({
  orderIds,
  poNumber,
  invoiceNumber,
  trackingNumber,
  shipmentRecordId,
}: {
  orderIds: string[];
  poNumber: string;
  invoiceNumber: string;
  trackingNumber: string;
  shipmentRecordId: string | null;
}): Promise<void> {
  if (!invoiceNumber || orderIds.length === 0) return;
  if (!(await hasP1FulfillmentAttemptsTable())) return;

  try {
    for (const orderId of orderIds) {
      await pool.query(
        `INSERT INTO p1_fulfillment_attempts (
           order_id,
           status,
           current_step,
           source,
           source_route,
           tracking_number,
           shipment_record_id,
           metadata,
           completed_at,
           updated_at
         )
         VALUES ($1, 'COMPLETED', 'ARTIFACTS', 'shipping', '/api/po-orders/process-shipment', $2, $3, $4::jsonb, NOW(), NOW())`,
        [
          orderId,
          trackingNumber,
          shipmentRecordId,
          JSON.stringify({
            poNumber,
            invoiceNumber,
            artifactType: 'P1_PACKING_SLIP',
            preservedForReturnToQcReuse: true,
          }),
        ]
      );
    }
  } catch (err: any) {
    console.warn(
      `⚠️ Could not record reusable P1 fulfillment artifacts for PO ${poNumber}: ${err.message}`
    );
  }
}

// GET /api/po-orders/shipping-qc
// Returns PO orders in Shipping QC department, grouped by customer → PO → items
router.get('/shipping-qc', authenticateToken, async (req, res) => {
  try {
    console.log('📦 Fetching PO orders in Shipping QC...');
    const { storage } = await import('../../storage');

    const customers = await storage.getPOOrdersInShippingQC();

    const totalItems = customers.reduce(
      (total, customer) =>
        total + customer.pos.reduce((sum, po) => sum + po.items.length, 0),
      0
    );

    console.log(
      `📊 Found ${totalItems} PO items in Shipping QC across ${customers.length} customers`
    );

    res.json(customers);
  } catch (error: any) {
    console.error('❌ Error fetching PO orders in Shipping QC:', error);
    res
      .status(500)
      .json({ _error: 'Failed to fetch PO orders', details: error.message });
  }
});

// GET /api/po-orders/all-p1-with-status
// Returns ALL P1 PO orders with full item status tracking across all departments
router.get('/all-p1-with-status', authenticateToken, async (req, res) => {
  try {
    console.log('📦 Fetching all P1 PO orders with department statuses...');
    const { storage } = await import('../../storage');

    const customers = await storage.getAllP1POOrdersWithStatus();

    const totalPOs = customers.reduce(
      (sum, customer) => sum + customer.pos.length,
      0
    );
    const totalItems = customers.reduce(
      (sum, customer) =>
        sum + customer.pos.reduce((poSum, po) => poSum + po.items.length, 0),
      0
    );

    console.log(
      `📊 Found ${totalItems} PO items across ${totalPOs} POs from ${customers.length} customers`
    );

    res.json(customers);
  } catch (error: any) {
    console.error('❌ Error fetching all P1 PO orders:', error);
    res
      .status(500)
      .json({ _error: 'Failed to fetch P1 PO orders', details: error.message });
  }
});

// POST /api/po-orders/packing-slips
// Generate packing slips for selected PO items (one PDF per PO)
// RULE: All packing slips MUST be persisted to DB immediately after generation.
// The PDF buffer is converted to base64 and written to shipment_items.packing_slip_base64
// before the response is sent. Do not add any branch that skips the DB write.
// TODO: unify P1 + P2 packing slip storage into single document system
router.post('/packing-slips', authenticateToken, async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ _error: 'orderIds array is required' });
    }

    console.log(
      `📄 Generating packing slips for ${orderIds.length} PO items...`
    );
    const { storage } = await import('../../storage');

    // Fetch order details - handle both Order IDs and poItemId-unitNumber format
    const orderDetails = await Promise.all(
      orderIds.map(async (itemKey) => {
        let order: any = null;
        let poItem: any = null;

        // Check if this is in poItemId-unitNumber format (e.g., "92-1")
        const match = itemKey.match(/^(\d+)-(\d+)$/);

        if (match) {
          // Format: poItemId-unitNumber
          const poItemId = parseInt(match[1]);
          const unitNumber = parseInt(match[2]);
          console.log(
            `🔍 Looking up by PO item ID ${poItemId}, unit ${unitNumber}`
          );

          // Get PO item directly
          poItem = await storage.getPurchaseOrderItem(poItemId);
          if (!poItem) {
            console.warn(`⚠️ PO item ${poItemId} not found`);
            return null;
          }

          // Get PO to access customer information
          const tempPo = await storage.getPurchaseOrder(poItem.poId);
          if (!tempPo) {
            console.warn(`⚠️ PO ${poItem.poId} not found`);
            return null;
          }

          // For PO items without orderIds, create a minimal order object for packing slip generation
          // Customer info comes from the PO, not the PO item
          order = {
            poItemId,
            unitNumber,
            orderId: `Unit ${unitNumber}`,
            item_id: poItem.stockModelId,
            item_name: poItem.stockModelName,
            specifications: poItem.specifications,
            customer_id: tempPo.customerId,
            customer_name: tempPo.customerName || '',
            po_number: tempPo.poNumber || '',
            due_date: poItem.dueDate,
          };
        } else {
          // Standard Order ID format (e.g., "AG123", "EH456")
          order = await storage.getProductionOrderByOrderId(itemKey);
          if (!order) {
            console.warn(`⚠️ Order ${itemKey} not found`);
            return null;
          }

          // Get PO item details
          if (!order.poItemId) {
            console.warn(`⚠️ Order ${itemKey} has no PO item ID`);
            return null;
          }

          poItem = await storage.getPurchaseOrderItem(order.poItemId);
          if (!poItem) {
            console.warn(`⚠️ PO item ${order.poItemId} not found`);
            return null;
          }
        }

        // Get PO details
        const po = await storage.getPurchaseOrder(poItem.poId);
        if (!po) {
          console.warn(`⚠️ PO ${poItem.poId} not found`);
          return null;
        }

        return {
          order,
          poItem,
          po,
        };
      })
    );

    // Filter out nulls and group by PO number
    const validOrders = orderDetails.filter((d) => d !== null);
    const poGroups = new Map<string, typeof validOrders>();

    validOrders.forEach((detail) => {
      const poNumber = detail.po.poNumber;
      if (!poGroups.has(poNumber)) {
        poGroups.set(poNumber, []);
      }
      poGroups.get(poNumber)!.push(detail);
    });

    console.log(`📦 Grouped into ${poGroups.size} PO(s)`);

    // Generate one PDF per PO
    const pdfs: Array<{ poNumber: string; pdf: Buffer }> = [];

    for (const [poNumber, items] of poGroups.entries()) {
      // Get customer ID and name from PO (Purchase Order has the customer info)
      const customerId = items[0].po.customerId;
      const customerName = items[0].po.customerName || 'Unknown Customer';

      const customerAddress = customerId
        ? await storage.getCustomerDefaultAddress(String(customerId))
        : null;

      // Fetch shipment data to populate weeklyBoxNumber / shipmentNumber + existing invoice_number
      let weeklyBoxNumber: string | undefined;
      let shipmentNumber: string | undefined;
      let trackingNumber: string | undefined;
      let existingInvoiceNumber: string | null = null;
      let shipmentRecordId: string | null = null;
      let shipmentPoCount = 0;

      try {
        const shipmentRows = await pool.query(
          `SELECT sr.id, sr.reference, sr.master_tracking_number, sr.invoice_number
           FROM shipment_records sr
           JOIN shipment_items si ON si.shipment_id = sr.id
           WHERE si.po_number = $1
           ORDER BY sr.shipped_at DESC
           LIMIT 1`,
          [poNumber]
        );
        if (shipmentRows.length > 0) {
          const sr = shipmentRows[0];
          shipmentRecordId = sr.id || null;
          shipmentNumber = sr.reference || undefined;
          trackingNumber = sr.master_tracking_number || undefined;
          shipmentPoCount = shipmentRecordId
            ? await getP1ShipmentPoCount(shipmentRecordId)
            : 0;
          existingInvoiceNumber =
            shipmentPoCount <= 1 ? sr.invoice_number || null : null;
        }
      } catch (shipErr: any) {
        console.warn(
          `⚠️ Could not fetch shipment data for PO ${poNumber}: ${shipErr.message}`
        );
      }

      // Resolve invoice number for the PDF — reuse if already stored, otherwise generate a new one.
      // Persistence of a newly generated number is deferred until after matchedItemIds are collected
      // so the shipment_record_id is guaranteed even if the PO-based lookup above found nothing.
      let invoiceNumber: string;
      let newlyGeneratedInvoice = false;
      if (existingInvoiceNumber) {
        invoiceNumber = existingInvoiceNumber;
        console.log(
          `♻️ Reusing existing invoice number ${invoiceNumber} for PO ${poNumber}`
        );
      } else {
        const reusableInvoiceNumber = await findReusableP1InvoiceNumber({
          poNumber,
          orderIds: items
            .map((item) => item.order?.orderId || item.order?.order_id)
            .filter(Boolean),
          shipmentRecordId,
          includeBroadHistory: false,
        });

        if (reusableInvoiceNumber) {
          invoiceNumber = reusableInvoiceNumber;
          console.log(
            `♻️ Reusing historical invoice number ${invoiceNumber} for PO ${poNumber}`
          );
        } else {
          invoiceNumber = await storage.getNextInvoiceNumber(
            String(customerId || '0'),
            customerName
          );
          newlyGeneratedInvoice = true;
          console.log(
            `🆕 Generated new invoice number ${invoiceNumber} for PO ${poNumber}`
          );
        }
      }

      // Map assembled order data to PackingSlipData (one row per distinct description)
      const slipItems = groupItemsByDescription(items, {
        partNumber: poNumber,
        weeklyBoxNumber,
        shipmentNumber,
      });

      const slipData: PackingSlipData = {
        packingSlipNumber: invoiceNumber,
        poNumber,
        date: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        customerName,
        customerAddress: customerAddress
          ? {
              street: customerAddress.street,
              street2: customerAddress.street2 || undefined,
              city: customerAddress.city,
              state: customerAddress.state,
              zip: customerAddress.zipCode,
            }
          : undefined,
        trackingNumber,
        totalQuantity: items.length,
        weeklyBoxNumber,
        shipmentNumber,
        items: slipItems,
      };

      const pdfBuffer = await generatePoPackingSlipPdf(slipData);
      const pdfBase64 = pdfBuffer.toString('base64');

      // Collect all matching shipment_items by po_number or order_id, deduplicated
      const matchedItemIds = new Set<string>();

      const poNumberMatches = await pool.query<{ id: string }>(
        `SELECT id FROM shipment_items WHERE po_number = $1`,
        [poNumber]
      );
      for (const row of poNumberMatches.rows) {
        matchedItemIds.add(row.id);
      }

      for (const item of items) {
        const itemOrderId = item.order?.orderId || item.order?.order_id;
        if (!itemOrderId) continue;
        const orderMatches = await pool.query<{ id: string }>(
          `SELECT id FROM shipment_items WHERE order_id = $1`,
          [itemOrderId]
        );
        for (const row of orderMatches.rows) {
          matchedItemIds.add(row.id);
        }
      }

      // Persist packing slip to each matched shipment_item exactly once
      if (matchedItemIds.size === 0) {
        console.error(
          `WARNING: Packing slip generated without persistence — no matching shipment_items found for PO ${poNumber}`
        );
      }
      for (const itemId of matchedItemIds) {
        await pool.query(
          `UPDATE shipment_items SET packing_slip_base64 = $1 WHERE id = $2`,
          [pdfBase64, itemId]
        );
        console.log(
          `✅ Packing slip persisted to shipment_item id=${itemId} (poNumber=${poNumber})`
        );
      }
      await recordP1FulfillmentArtifacts({
        orderIds: items
          .map((item) => item.order?.orderId || item.order?.order_id)
          .filter(Boolean),
        poNumber,
        invoiceNumber,
        trackingNumber: trackingNumber || '',
        shipmentRecordId,
      });

      // Persist invoice_number to shipment_records now that we have the full item context.
      // If the initial PO-based lookup found a shipment_record, use that id; otherwise find
      // the record via a fresh join so order_id-matched shipments are also covered.
      if (newlyGeneratedInvoice && shipmentPoCount <= 1) {
        try {
          if (!shipmentRecordId) {
            // Fallback: resolve shipment_record via order_id if PO-based lookup missed
            for (const item of items) {
              const fallbackOrderId =
                item.order?.orderId || item.order?.order_id;
              if (!fallbackOrderId) continue;
              const fallbackRows = await pool.query(
                `SELECT sr.id FROM shipment_records sr
                 JOIN shipment_items si ON si.shipment_id = sr.id
                 WHERE si.order_id = $1
                 ORDER BY sr.shipped_at DESC LIMIT 1`,
                [fallbackOrderId]
              );
              if (fallbackRows.length > 0) {
                shipmentRecordId = fallbackRows[0].id || null;
                shipmentPoCount = shipmentRecordId
                  ? await getP1ShipmentPoCount(shipmentRecordId)
                  : 0;
                break;
              }
            }
          }
          if (shipmentRecordId && shipmentPoCount <= 1) {
            const saveResult = await pool.query(
              `UPDATE shipment_records SET invoice_number = $1 WHERE id = $2 AND invoice_number IS NULL RETURNING invoice_number`,
              [invoiceNumber, shipmentRecordId]
            );
            if (saveResult.length > 0) {
              console.log(
                `💾 Saved invoice number ${invoiceNumber} to shipment_record id=${shipmentRecordId}`
              );
            } else {
              // Concurrent write won; read back the winning value so the PDF and DB agree
              const reRead = await pool.query(
                `SELECT invoice_number FROM shipment_records WHERE id = $1`,
                [shipmentRecordId]
              );
              if (
                reRead[0]?.invoice_number &&
                reRead[0].invoice_number !== invoiceNumber
              ) {
                console.log(
                  `♻️ Concurrent write detected — DB has ${reRead[0].invoice_number}, PDF used ${invoiceNumber} for PO ${poNumber}`
                );
              }
            }
          } else {
            console.warn(
              `⚠️ Could not find shipment_record for PO ${poNumber} — invoice number ${invoiceNumber} not persisted`
            );
          }
        } catch (saveErr: any) {
          console.warn(
            `⚠️ Could not persist invoice number to shipment_record for PO ${poNumber}: ${saveErr.message}`
          );
        }
      }

      pdfs.push({
        poNumber,
        pdf: pdfBuffer,
      });
    }

    // Always return JSON with base64 PDFs (consistent format)
    res.json({
      pdfs: pdfs.map((p) => ({
        poNumber: p.poNumber,
        filename: `Packing-Slip-PO-${p.poNumber}.pdf`,
        data: p.pdf.toString('base64'),
      })),
    });
  } catch (error: any) {
    console.error('❌ Error generating packing slips:', error);
    res.status(500).json({
      _error: 'Failed to generate packing slips',
      details: error.message,
    });
  }
});

// POST /api/po-orders/progress-to-shipping
// Move selected PO items from Shipping QC to Shipping department
router.post('/progress-to-shipping', async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ _error: 'orderIds array is required' });
    }

    console.log(`📦 Progressing ${orderIds.length} PO items to Shipping...`);
    const { storage } = await import('../../storage');

    const results = {
      success: [] as string[],
      failed: [] as { orderId: string; reason: string }[],
    };

    // Process each order with validation
    for (const orderId of orderIds) {
      try {
        // Try the given ID first; fall back to "PO-{id}" if the frontend sent a bare "{poItemId}-{unitNumber}" key
        let order = await storage.getProductionOrderByOrderId(orderId);
        if (!order && /^\d+-\d+$/.test(orderId)) {
          order = await storage.getProductionOrderByOrderId(`PO-${orderId}`);
        }

        // Validate order exists
        if (!order) {
          results.failed.push({ orderId, reason: 'Order not found' });
          console.warn(`⚠️ ${orderId}: Order not found`);
          continue;
        }

        // Validate order is in Shipping QC
        if (order.currentDepartment !== 'Shipping QC') {
          results.failed.push({
            orderId,
            reason: `Order is in ${order.currentDepartment}, not Shipping QC`,
          });
          console.warn(
            `⚠️ ${orderId}: Wrong department (${order.currentDepartment})`
          );
          continue;
        }

        // Update to Shipping department
        await storage.updateProductionOrder(order.id, {
          currentDepartment: 'Shipping',
        });

        await auditService.closeDepartmentTransition(
          orderId,
          undefined,
          'completed'
        );
        await auditService.recordDepartmentEntry({
          entityType: 'p1_order',
          entityId: orderId,
          department: 'Shipping',
        });

        results.success.push(orderId);
        console.log(`✅ ${orderId} progressed to Shipping`);
      } catch (error: any) {
        console.error(`❌ Failed to progress ${orderId}:`, error);
        results.failed.push({ orderId, reason: error.message });
      }
    }

    console.log(`✅ Successfully progressed ${results.success.length} items`);
    if (results.failed.length > 0) {
      console.warn(
        `⚠️ Failed to progress ${results.failed.length} items:`,
        results.failed
      );
    }

    // Always return 200 with success/failed arrays (never throw)
    res.json({
      success: results.success,
      failed: results.failed,
      message: `Progressed ${results.success.length}/${orderIds.length} items to Shipping`,
    });
  } catch (error: any) {
    console.error('❌ Error progressing PO orders:', error);
    res
      .status(500)
      .json({ _error: 'Failed to progress orders', details: error.message });
  }
});

// POST /api/po-orders/smart-progress
// Smart progression for PO items from Barcode department
// Routes 'no stock' items directly to Shipping QC, others to CNC/Finish
router.post('/smart-progress', async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ _error: 'orderIds array is required' });
    }

    console.log(
      `🔄 Smart progressing ${orderIds.length} PO items from Barcode...`
    );
    const { storage } = await import('../../storage');

    const results = {
      toShippingQC: [] as string[],
      toCNC: [] as string[],
      failed: [] as { orderId: string; reason: string }[],
    };

    for (const orderId of orderIds) {
      try {
        const order = await storage.getProductionOrderByOrderId(orderId);

        // Validate order exists
        if (!order) {
          results.failed.push({ orderId, reason: 'Order not found' });
          console.warn(`⚠️ ${orderId}: Order not found`);
          continue;
        }

        // Validate order is in Barcode department
        if (order.currentDepartment !== 'Barcode') {
          results.failed.push({
            orderId,
            reason: `Order is in ${order.currentDepartment}, not Barcode`,
          });
          console.warn(
            `⚠️ ${orderId}: Wrong department (${order.currentDepartment})`
          );
          continue;
        }

        // Check if item has 'no stock' or empty stock model
        const itemId = (order.itemId || '').trim().toLowerCase();
        const isNoStock =
          !itemId ||
          itemId === '' ||
          itemId === 'none' ||
          itemId === 'no stock' ||
          itemId === 'no_stock';

        if (isNoStock) {
          // Route directly to Shipping QC (skip CNC/Finish)
          await storage.updateProductionOrder(order.id, {
            currentDepartment: 'Shipping QC',
          });
          results.toShippingQC.push(orderId);
          console.log(`✅ ${orderId} → Shipping QC (no stock item)`);
        } else {
          // Route to CNC department (normal flow)
          await storage.updateProductionOrder(order.id, {
            currentDepartment: 'CNC',
          });
          results.toCNC.push(orderId);
          console.log(`✅ ${orderId} → CNC (stock item: ${order.itemId})`);
        }
      } catch (error: any) {
        console.error(`❌ Failed to progress ${orderId}:`, error);
        results.failed.push({ orderId, reason: error.message });
      }
    }

    console.log(
      `✅ Smart progression complete: ${results.toShippingQC.length} to Shipping QC, ${results.toCNC.length} to CNC`
    );
    if (results.failed.length > 0) {
      console.warn(
        `⚠️ Failed to progress ${results.failed.length} items:`,
        results.failed
      );
    }

    // Always return 200 with success/failed arrays
    res.json({
      toShippingQC: results.toShippingQC,
      toCNC: results.toCNC,
      failed: results.failed,
      message: `Progressed ${results.toShippingQC.length + results.toCNC.length}/${orderIds.length} items`,
    });
  } catch (error: any) {
    console.error('❌ Error in smart progression:', error);
    res
      .status(500)
      .json({ _error: 'Failed to progress orders', details: error.message });
  }
});

// POST /api/po-orders/progress-to-department
// Progress PO items to a specific department (e.g., Finish for flattops)
router.post('/progress-to-department', async (req, res) => {
  try {
    const { orderIds, toDepartment } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ _error: 'orderIds array is required' });
    }

    if (!toDepartment) {
      return res.status(400).json({ _error: 'toDepartment is required' });
    }

    console.log(
      `🔄 Progressing ${orderIds.length} PO items to ${toDepartment}...`
    );
    const { storage } = await import('../../storage');

    const results = {
      success: [] as string[],
      failed: [] as { orderId: string; reason: string }[],
    };

    for (const orderId of orderIds) {
      try {
        const order = await storage.getProductionOrderByOrderId(orderId);

        // Validate order exists
        if (!order) {
          results.failed.push({ orderId, reason: 'Order not found' });
          console.warn(`⚠️ ${orderId}: Order not found`);
          continue;
        }

        // Validate order is in Barcode department (prevent accidental cross-department jumps)
        if (order.currentDepartment !== 'Barcode') {
          results.failed.push({
            orderId,
            reason: `Order is in ${order.currentDepartment}, not Barcode`,
          });
          console.warn(
            `⚠️ ${orderId}: Wrong department (${order.currentDepartment})`
          );
          continue;
        }

        // Progress to specified department
        await storage.updateProductionOrder(order.id, {
          currentDepartment: toDepartment,
        });
        results.success.push(orderId);
        console.log(`✅ ${orderId} → ${toDepartment}`);
      } catch (error: any) {
        console.error(`❌ Failed to progress ${orderId}:`, error);
        results.failed.push({ orderId, reason: error.message });
      }
    }

    console.log(
      `✅ Progression complete: ${results.success.length} to ${toDepartment}`
    );
    if (results.failed.length > 0) {
      console.warn(
        `⚠️ Failed to progress ${results.failed.length} items:`,
        results.failed
      );
    }

    // Always return 200 with success/failed arrays
    res.json({
      success: results.success,
      failed: results.failed,
      message: `Progressed ${results.success.length}/${orderIds.length} items to ${toDepartment}`,
    });
  } catch (error: any) {
    console.error('❌ Error progressing PO orders:', error);
    res
      .status(500)
      .json({ _error: 'Failed to progress orders', details: error.message });
  }
});

// GET /api/po-orders/oem-shipments
// Get all shipments with tracking info, filters, and pagination (no base64 blobs)
router.get('/oem-shipments', authenticateToken, async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      startDate,
      endDate,
      search,
      limit = '50',
      offset = '0',
    } = req.query;

    console.log('📦 Fetching OEM shipments with filters:', {
      customerId,
      customerName,
      startDate,
      endDate,
      search,
      limit,
      offset,
    });

    // Check if shipment_records table exists
    const tableCheck = await pool.query(`
      SELECT
        EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'shipment_records'
        ) as table_exists,
        EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'p1_fulfillment_attempts'
        ) as fulfillment_attempts_table_exists
    `);
    const tableInfo = (tableCheck.rows || tableCheck)[0] || {};
    const tableExists = tableInfo.table_exists || false;
    const fulfillmentAttemptsTableExists =
      tableInfo.fulfillment_attempts_table_exists || false;

    if (!tableExists) {
      // Fallback: Query shipped items from production_orders instead
      console.log(
        '📦 shipment_records table not found, using fallback query from production_orders'
      );

      // Get shipped production orders grouped by PO
      const shippedOrders = await pool.query(
        `
        SELECT 
          po.po_number,
          po.customer_id,
          po.customer_name,
          po.shipped_at,
          json_agg(
            json_build_object(
              'orderId', po.order_id,
              'poItemId', po.po_item_id,
              'itemName', po.item_name,
              'quantity', 1
            ) ORDER BY po.order_id
          ) as items,
          COUNT(*) as item_count
        FROM production_orders po
        WHERE po.production_status = 'SHIPPED'
        ${customerName ? `AND po.customer_name ILIKE '%' || $1 || '%'` : ''}
        GROUP BY po.po_number, po.customer_id, po.customer_name, po.shipped_at
        ORDER BY po.shipped_at DESC NULLS LAST
        LIMIT $${customerName ? '2' : '1'} OFFSET $${customerName ? '3' : '2'}
      `,
        customerName
          ? [
              customerName,
              parseInt(limit as string, 10),
              parseInt(offset as string, 10),
            ]
          : [parseInt(limit as string, 10), parseInt(offset as string, 10)]
      );

      const shipments = (shippedOrders.rows || shippedOrders).map(
        (row: any) => ({
          id: `fallback-${row.po_number}`,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          master_tracking_number: 'N/A (Legacy)',
          created_at: row.shipped_at,
          items: row.items,
          item_count: parseInt(row.item_count),
          po_count: 1,
          has_shipping_label: false,
        })
      );

      return res.json({
        shipments,
        pagination: {
          total: shipments.length,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
          hasMore: false,
        },
        fallbackMode: true,
      });
    }

    // Build WHERE conditions for shipment_records table
    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let paramIndex = 1;

    if (customerId) {
      conditions.push(`sr.customer_id = $${paramIndex}`);
      params.push(customerId);
      paramIndex++;
    }

    if (customerName) {
      conditions.push(`sr.customer_name ILIKE $${paramIndex}`);
      params.push(`%${customerName}%`);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`sr.created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`sr.created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        sr.customer_name ILIKE $${paramIndex} OR
        sr.master_tracking_number ILIKE $${paramIndex} OR
        sr.reference ILIKE $${paramIndex} OR
        sr.invoice_number ILIKE $${paramIndex} OR
        EXISTS (
          SELECT 1
          FROM shipment_items search_si
          LEFT JOIN production_orders search_prod_ord ON search_si.order_id = search_prod_ord.order_id
          LEFT JOIN purchase_order_items search_poi ON search_poi.id = search_si.po_item_id
          LEFT JOIN purchase_orders search_po ON search_poi.po_id = search_po.id
          WHERE search_si.shipment_id = sr.id
            AND (
              search_si.order_id ILIKE $${paramIndex} OR
              search_si.po_number ILIKE $${paramIndex} OR
              search_si.description ILIKE $${paramIndex} OR
              search_prod_ord.po_number ILIKE $${paramIndex} OR
              search_prod_ord.customer_name ILIKE $${paramIndex} OR
              search_prod_ord.item_name ILIKE $${paramIndex} OR
              search_poi.item_name ILIKE $${paramIndex} OR
              search_poi.stock_model_name ILIKE $${paramIndex} OR
              search_po.po_number ILIKE $${paramIndex} OR
              search_po.customer_name ILIKE $${paramIndex}
            )
        )
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const packingSlipInvoiceNumberSql = fulfillmentAttemptsTableExists
      ? `(
                SELECT pfa.metadata->>'invoiceNumber'
                FROM p1_fulfillment_attempts pfa
                WHERE pfa.metadata->>'invoiceNumber' IS NOT NULL
                  AND pfa.metadata->>'poNumber' = COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number)
                  AND (
                    pfa.order_id = si.order_id
                    OR pfa.shipment_record_id = sr.id
                  )
                ORDER BY COALESCE(pfa.completed_at, pfa.updated_at, pfa.created_at) DESC
                LIMIT 1
              )`
      : `NULL`;
    const fulfillmentAttemptInvoiceSql = fulfillmentAttemptsTableExists
      ? `OR (
                inv.po_override = COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number)
                AND inv.invoice_number IN (
                  SELECT pfa.metadata->>'invoiceNumber'
                  FROM p1_fulfillment_attempts pfa
                  WHERE pfa.metadata->>'invoiceNumber' IS NOT NULL
                    AND pfa.metadata->>'poNumber' = COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number)
                    AND (
                      pfa.order_id = si.order_id
                      OR pfa.shipment_record_id = sr.id
                    )
                )
                AND (
                  inv.notes ILIKE 'Auto-created from P1 OEM packing slip%'
                  OR inv.internal_notes ILIKE 'Source: P1 OEM shipment%'
                )
              )`
      : ``;

    // Main query - lightweight, no base64 blobs
    // Use COALESCE to get customer_name, description and po_number from production_orders or purchase_order_items when not set
    const query = `
      WITH shipment_aggregates AS (
        SELECT 
          sr.id,
          sr.customer_id,
          COALESCE(
            NULLIF(sr.customer_name, ''),
            (SELECT DISTINCT prod_ord.customer_name 
             FROM shipment_items si2 
             JOIN production_orders prod_ord ON si2.order_id = prod_ord.order_id
             WHERE si2.shipment_id = sr.id
             LIMIT 1)
          ) as customer_name,
          sr.customer_address,
          sr.customer_city,
          sr.customer_state,
          sr.customer_zip,
          sr.master_tracking_number,
          sr.service_code,
          sr.total_weight_lbs,
          sr.package_count,
          sr.bill_type,
          sr.reference,
          sr.invoice_number,
          MAX(shipment_inv.id::text) as "shipmentInvoiceId",
          MAX(shipment_inv.invoice_number) as "shipmentInvoiceNumber",
          MAX(shipment_inv.status) as "shipmentInvoiceStatus",
          sr.created_at,
          sr.created_by,
          sr.shipping_label_base64 IS NOT NULL as has_shipping_label,
          CAST(SUM(si.quantity) AS INTEGER) as item_count,
          CAST(SUM(CASE WHEN COALESCE(poi.item_type, 'stock_model') = 'stock_model' THEN si.quantity ELSE 0 END) AS INTEGER) as stock_count,
          CAST(SUM(CASE WHEN COALESCE(poi.item_type, 'stock_model') != 'stock_model' THEN si.quantity ELSE 0 END) AS INTEGER) as accessory_count,
          COUNT(DISTINCT COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number)) as po_count,
          json_agg(
            json_build_object(
              'id', si.id,
              'poItemId', si.po_item_id,
              'orderId', si.order_id,
              'quantity', si.quantity,
              'description', COALESCE(NULLIF(si.description, ''), COALESCE(poi.stock_model_name, poi.item_name), prod_ord.item_name),
              'poNumber', COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number),
              'hasPackingSlip', EXISTS (
                SELECT 1
                FROM shipment_items slip_si
                LEFT JOIN production_orders slip_prod_ord ON slip_si.order_id = slip_prod_ord.order_id
                LEFT JOIN purchase_order_items slip_poi ON slip_poi.id = slip_si.po_item_id
                LEFT JOIN purchase_orders slip_po ON slip_poi.po_id = slip_po.id
                WHERE slip_si.shipment_id = sr.id
                  AND COALESCE(NULLIF(slip_si.po_number, ''), slip_prod_ord.po_number, slip_po.po_number) =
                    COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number)
                  AND slip_si.packing_slip_base64 IS NOT NULL
              ),
              'packingSlipItemId', (
                SELECT slip_si.id::text
                FROM shipment_items slip_si
                LEFT JOIN production_orders slip_prod_ord ON slip_si.order_id = slip_prod_ord.order_id
                LEFT JOIN purchase_order_items slip_poi ON slip_poi.id = slip_si.po_item_id
                LEFT JOIN purchase_orders slip_po ON slip_poi.po_id = slip_po.id
                WHERE slip_si.shipment_id = sr.id
                  AND COALESCE(NULLIF(slip_si.po_number, ''), slip_prod_ord.po_number, slip_po.po_number) =
                    COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number)
                  AND slip_si.packing_slip_base64 IS NOT NULL
                ORDER BY (slip_si.id = si.id) DESC, slip_si.created_at DESC
                LIMIT 1
              ),
              'itemType', COALESCE(poi.item_type, 'stock_model'),
              'unitPrice', CASE WHEN $${paramIndex + 2}::boolean THEN poi.unit_price ELSE NULL END,
              'lineTotal', CASE WHEN $${paramIndex + 2}::boolean THEN COALESCE(poi.unit_price, 0) * COALESCE(si.quantity, 1) ELSE NULL END,
              'packingSlipInvoiceNumber', ${packingSlipInvoiceNumberSql},
              'invoiceId', inv.id,
              'invoiceNumber', inv.invoice_number,
              'invoiceStatus', inv.status
            ) ORDER BY COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number), si.order_id
          ) as items
        FROM shipment_records sr
        LEFT JOIN shipment_items si ON sr.id = si.shipment_id
        LEFT JOIN production_orders prod_ord ON si.order_id = prod_ord.order_id
        LEFT JOIN purchase_order_items poi ON poi.id = si.po_item_id
        LEFT JOIN purchase_orders po ON poi.po_id = po.id
        LEFT JOIN LATERAL (
          SELECT inv.id, inv.invoice_number, inv.status
          FROM ar_invoices inv
          WHERE COALESCE(inv.status, '') <> 'VOID'
            AND sr.invoice_number IS NOT NULL
            AND inv.invoice_number = sr.invoice_number
          ORDER BY inv.created_at DESC
          LIMIT 1
        ) shipment_inv ON true
        LEFT JOIN LATERAL (
          SELECT inv.id, inv.invoice_number, inv.status
          FROM ar_invoices inv
          WHERE COALESCE(inv.status, '') <> 'VOID'
            AND (
              EXISTS (
                SELECT 1
                FROM ar_invoice_lines line
                WHERE line.invoice_id = inv.id
                  AND line.dimension_tags->>'source' = 'p1_oem_packing_slip'
                  AND line.dimension_tags->>'poNumber' = COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number)
                  AND (
                    line.dimension_tags->>'shipmentRecordId' = sr.id::text
                    OR line.dimension_tags->>'orderId' = si.order_id
                    OR EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements_text(
                        CASE
                          WHEN jsonb_typeof(line.dimension_tags->'orderIds') = 'array'
                          THEN line.dimension_tags->'orderIds'
                          ELSE '[]'::jsonb
                        END
                      ) AS order_id(value)
                      WHERE order_id.value = si.order_id
                    )
                  )
              )
              ${fulfillmentAttemptInvoiceSql}
              OR (
                inv.po_override = COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number)
                AND (
                  inv.internal_notes ILIKE '%' || sr.id::text || '%'
                  OR inv.notes ILIKE '%' || sr.id::text || '%'
                  OR (
                    NULLIF(sr.reference, '') IS NOT NULL
                    AND (
                      inv.internal_notes ILIKE '%' || sr.reference || '%'
                      OR inv.notes ILIKE '%' || sr.reference || '%'
                    )
                  )
                )
                AND (
                  inv.notes ILIKE 'Auto-created from P1 OEM packing slip%'
                  OR inv.internal_notes ILIKE 'Source: P1 OEM shipment%'
                )
              )
              OR (
                inv.po_override = COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number)
                AND inv.invoice_number = sr.invoice_number
                AND (
                  inv.notes ILIKE 'Auto-created from P1 OEM packing slip%'
                  OR inv.internal_notes ILIKE 'Source: P1 OEM shipment%'
                )
              )
            )
          ORDER BY inv.created_at DESC
          LIMIT 1
        ) inv ON true
        WHERE ${conditions.join(' AND ')}
        GROUP BY sr.id
        ORDER BY sr.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      )
      SELECT * FROM shipment_aggregates
    `;

    const countParams = [...params];

    params.push(parseInt(limit as string, 10));
    params.push(parseInt(offset as string, 10));
    const canSeePrices = req.user?.username === 'glennj';
    params.push(canSeePrices);

    const result = await pool.query(query, params);
    const shipments = Array.isArray(result) ? result : result.rows || [];

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT sr.id) as total
      FROM shipment_records sr
      WHERE ${conditions.join(' AND ')}
    `;
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(
      (countResult.rows || countResult)[0]?.total || '0',
      10
    );

    console.log(`📊 Found ${shipments.length} shipments (total: ${total})`);

    res.json({
      shipments,
      pagination: {
        total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        hasMore: parseInt(offset as string, 10) + shipments.length < total,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching OEM shipments:', error);
    res.status(500).json({
      _error: 'Failed to fetch OEM shipments',
      details: error.message,
    });
  }
});

// GET /api/po-orders/oem-shipments/stats
// Returns weekly and monthly stock vs accessory totals for the summary card
router.get('/oem-shipments/stats', async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT
        COALESCE(SUM(CASE 
          WHEN sr.created_at >= date_trunc('week', NOW()) 
            AND COALESCE(poi.item_type, 'stock_model') = 'stock_model' 
          THEN si.quantity ELSE 0 END), 0) AS stocks_this_week,
        COALESCE(SUM(CASE 
          WHEN sr.created_at >= date_trunc('week', NOW()) 
            AND COALESCE(poi.item_type, 'stock_model') != 'stock_model' 
          THEN si.quantity ELSE 0 END), 0) AS accessories_this_week,
        COALESCE(SUM(CASE 
          WHEN sr.created_at >= date_trunc('month', NOW()) 
            AND COALESCE(poi.item_type, 'stock_model') = 'stock_model' 
          THEN si.quantity ELSE 0 END), 0) AS stocks_this_month,
        COALESCE(SUM(CASE 
          WHEN sr.created_at >= date_trunc('month', NOW()) 
            AND COALESCE(poi.item_type, 'stock_model') != 'stock_model' 
          THEN si.quantity ELSE 0 END), 0) AS accessories_this_month,
        COALESCE(SUM(CASE 
          WHEN COALESCE(poi.item_type, 'stock_model') = 'stock_model' 
          THEN si.quantity ELSE 0 END), 0) AS stocks_all_time,
        COALESCE(SUM(CASE 
          WHEN COALESCE(poi.item_type, 'stock_model') != 'stock_model' 
          THEN si.quantity ELSE 0 END), 0) AS accessories_all_time
      FROM shipment_records sr
      JOIN shipment_items si ON si.shipment_id = sr.id
      LEFT JOIN purchase_order_items poi ON poi.id = si.po_item_id
    `);
    const row =
      (Array.isArray(statsResult)
        ? statsResult
        : statsResult.rows || statsResult)[0] || {};
    res.json({
      stocksThisWeek: parseInt(row.stocks_this_week || '0', 10),
      accessoriesThisWeek: parseInt(row.accessories_this_week || '0', 10),
      stocksThisMonth: parseInt(row.stocks_this_month || '0', 10),
      accessoriesThisMonth: parseInt(row.accessories_this_month || '0', 10),
      stocksAllTime: parseInt(row.stocks_all_time || '0', 10),
      accessoriesAllTime: parseInt(row.accessories_all_time || '0', 10),
    });
  } catch (error: any) {
    console.error('❌ Error fetching OEM shipment stats:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch stats', details: error.message });
  }
});

// GET /api/po-orders/oem-shipments/:id/label
// Download shipping label for a specific shipment
router.get('/oem-shipments/:id/label', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📄 Downloading shipping label for shipment ${id}...`);

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ _error: 'Invalid shipment ID format' });
    }

    const query = `
      SELECT 
        shipping_label_base64,
        master_tracking_number,
        customer_name
      FROM shipment_records
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);
    const shipment = (result.rows || result)[0];

    if (!shipment) {
      return res.status(404).json({ _error: 'Shipment not found' });
    }

    if (!shipment.shipping_label_base64) {
      return res.status(404).json({ _error: 'Shipping label not available' });
    }

    // Decode base64 and send as GIF
    const labelBuffer = Buffer.from(shipment.shipping_label_base64, 'base64');
    const filename = `shipping-label-${shipment.master_tracking_number}.gif`;

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(labelBuffer);

    console.log(`✅ Shipping label downloaded: ${filename}`);
  } catch (error: any) {
    console.error('❌ Error downloading shipping label:', error);
    res.status(500).json({
      _error: 'Failed to download shipping label',
      details: error.message,
    });
  }
});

// GET /api/po-orders/oem-shipments/packing-slip/:itemId
// Download packing slip for a specific shipment item
router.get(
  '/oem-shipments/packing-slip/:itemId',
  authenticateToken,
  async (req, res) => {
    try {
      const { itemId } = req.params;
      const requestedPoNumber =
        typeof req.query.poNumber === 'string' ? req.query.poNumber.trim() : '';
      console.log(`📄 Downloading packing slip for shipment item ${itemId}...`);

      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(itemId)) {
        return res.status(400).json({ _error: 'Invalid item ID format' });
      }

      const query = `
      SELECT 
        si.id,
        si.packing_slip_base64,
        COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number) AS po_number,
        si.order_id,
        si.quantity,
        si.description,
        sr.id AS shipment_record_id,
        sr.master_tracking_number AS tracking_number,
        sr.ship_to_snapshot,
        sr.invoice_number AS shipment_invoice_number,
        poi.item_id AS poi_item_id,
        poi.item_name AS poi_item_name,
        poi.stock_model_name AS poi_stock_model_name,
        to_jsonb(si) -> 'serial_numbers' AS serial_numbers
      FROM shipment_items si
      JOIN shipment_records sr ON sr.id = si.shipment_id
      LEFT JOIN production_orders prod_ord ON prod_ord.order_id = si.order_id
      LEFT JOIN purchase_order_items poi ON poi.id = si.po_item_id
      LEFT JOIN purchase_orders po ON po.id = poi.po_id
      WHERE si.id = $1
    `;

      const result = await pool.query(query, [itemId]);
      const item = (result.rows || result)[0];

      if (!item) {
        return res.status(404).json({ _error: 'Shipment item not found' });
      }

      let packingSlipBase64: string = item.packing_slip_base64;

      if (packingSlipBase64 && item.shipment_invoice_number) {
        console.log(
          `📄 Packing slip exists — serving stored PDF (no-op reuse) for itemId=${itemId}, invoice=${item.shipment_invoice_number}`
        );
      } else if (packingSlipBase64) {
        console.log(
          `📄 Packing slip exists (no stored invoice #) — serving stored PDF for itemId=${itemId}`
        );
      }

      if (!packingSlipBase64) {
        console.log(
          `⚙️ Packing slip missing — regenerating for item: ${itemId}`
        );
        try {
          const shipTo = item.ship_to_snapshot || {};
          const customerName = (shipTo.name as string) || 'N/A';
          if (!customerName || customerName === 'N/A') {
            console.warn(
              `⚠️ Packing slip regeneration: customerName is empty for itemId=${itemId}`
            );
          }
          const customerAddress = {
            street: (shipTo.street as string) || 'N/A',
            street2: (shipTo.street2 as string) || undefined,
            city: (shipTo.city as string) || 'N/A',
            state: (shipTo.state as string) || 'N/A',
            zip: (shipTo.postalCode as string) || 'N/A',
          };

          const poNumberForSlip = item.po_number || requestedPoNumber || '';

          // Fetch all items for this PO within the same shipment to compute aggregated fields
          const siblingQuery = `
          SELECT
            si.id,
            si.order_id,
            si.quantity,
            si.packing_slip_base64,
            sr.reference AS shipment_reference,
            poi.item_name AS poi_item_name,
            poi.stock_model_name AS poi_stock_model_name,
            poi.stock_model_id AS poi_stock_model_id,
            COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number) AS po_number
          FROM shipment_items si
          JOIN shipment_records sr ON sr.id = si.shipment_id
          LEFT JOIN production_orders prod_ord ON prod_ord.order_id = si.order_id
          LEFT JOIN purchase_order_items poi ON poi.id = si.po_item_id
          LEFT JOIN purchase_orders po ON po.id = poi.po_id
          WHERE si.shipment_id = (
            SELECT shipment_id FROM shipment_items WHERE id = $1
          )
          AND (
            COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number) = $2
            OR si.id = $1
          )
        `;
          const siblingResult = await pool.query(siblingQuery, [
            itemId,
            poNumberForSlip,
          ]);
          const siblingRows: any[] = (siblingResult.rows ||
            siblingResult) as any[];

          if (siblingRows.length === 0) {
            throw new Error(
              `No shipment items found for PO ${poNumberForSlip || '(unknown PO)'} in this shipment`
            );
          }

          const siblingWithPackingSlip = siblingRows.find((r) => r.packing_slip_base64);
          if (siblingWithPackingSlip?.packing_slip_base64) {
            packingSlipBase64 = siblingWithPackingSlip.packing_slip_base64;
            await pool.query(
              `UPDATE shipment_items
               SET packing_slip_base64 = $1
               WHERE id = $2
                 AND packing_slip_base64 IS NULL`,
              [packingSlipBase64, itemId]
            );
            console.log(
              `Reused sibling packing slip ${siblingWithPackingSlip.id} for itemId=${itemId}, PO=${poNumberForSlip}`
            );
          } else {
          // Aggregate quantity across all items in this PO group
          const totalQty = siblingRows.reduce(
            (sum, r) => sum + (r.quantity || 1),
            0
          );

          // Derive sticker range from order_id suffix (e.g. FA001-3 → unit 3)
          const unitNumbers: number[] = siblingRows.map((r) => {
            if (!r.order_id) return 1;
            const m = String(r.order_id).match(/-(\d+)$/);
            return m ? parseInt(m[1]) : 1;
          });
          const minUnit = Math.min(...unitNumbers);
          const maxUnit = Math.max(...unitNumbers);
          const stickerRange =
            unitNumbers.length === 0
              ? ''
              : minUnit === maxUnit
                ? String(minUnit)
                : `${minUnit}-${maxUnit}`;

          const firstSibling = siblingRows[0] || item;

          // Use shipment reference from query result (sr.reference)
          const shipmentRef = firstSibling.shipment_reference || undefined;

          const { storage: slipStorage } = await import('../../storage');
          const shipmentPoCount = item.shipment_record_id
            ? await getP1ShipmentPoCount(item.shipment_record_id)
            : 0;

          // Resolve invoice number: reuse stored value, or generate + persist a new one
          let invoiceNumber: string;
          if (shipmentPoCount <= 1 && item.shipment_invoice_number) {
            invoiceNumber = item.shipment_invoice_number;
            console.log(
              `♻️ Reusing stored invoice number ${invoiceNumber} for itemId=${itemId}`
            );
          } else {
            const reusableInvoiceNumber = await findReusableP1InvoiceNumber({
              poNumber: poNumberForSlip,
              orderIds: siblingRows.map((r) => r.order_id).filter(Boolean),
              shipmentRecordId: item.shipment_record_id || null,
              includeBroadHistory: false,
            });

            if (reusableInvoiceNumber) {
              invoiceNumber = reusableInvoiceNumber;
              console.log(
                `♻️ Reusing historical invoice number ${invoiceNumber} for itemId=${itemId}`
              );
            } else {
              invoiceNumber = await slipStorage.getNextInvoiceNumber(
                '0',
                customerName
              );
              console.log(
                `🆕 Generated new invoice number ${invoiceNumber} for itemId=${itemId}`
              );
            }
            if (item.shipment_record_id && shipmentPoCount <= 1) {
              try {
                const saveResult = await pool.query(
                  `UPDATE shipment_records SET invoice_number = $1 WHERE id = $2 AND invoice_number IS NULL RETURNING invoice_number`,
                  [invoiceNumber, item.shipment_record_id]
                );
                if (saveResult.length > 0) {
                  console.log(
                    `💾 Saved invoice number ${invoiceNumber} to shipment_record id=${item.shipment_record_id}`
                  );
                } else {
                  const reRead = await pool.query(
                    `SELECT invoice_number FROM shipment_records WHERE id = $1`,
                    [item.shipment_record_id]
                  );
                  if (reRead[0]?.invoice_number) {
                    invoiceNumber = reRead[0].invoice_number;
                    console.log(
                      `♻️ Concurrent write detected — using pre-existing invoice number ${invoiceNumber} for itemId=${itemId}`
                    );
                  }
                }
              } catch (saveErr: any) {
                console.warn(
                  `⚠️ Could not save invoice number to shipment_record: ${saveErr.message}`
                );
              }
            }
          }

          const slipItems = groupItemsByDescription(
            siblingRows.map((r) => ({
              poItem: {
                stockModelName: r.poi_stock_model_name ?? null,
                itemName: r.poi_item_name ?? null,
                stockModelId: r.poi_stock_model_id ?? null,
              },
              order: { orderId: r.order_id ?? null },
              quantity: r.quantity ?? 1,
            })),
            { partNumber: poNumberForSlip, shipmentNumber: shipmentRef }
          );

          console.log(
            `📋 Packing slip regen — customerName: "${customerName}", poNumber: "${poNumberForSlip}", invoice: "${invoiceNumber}", qty: ${totalQty}, stickerRange: "${stickerRange}", shipmentRef: "${shipmentRef}"`
          );

          const slipData: PackingSlipData = {
            packingSlipNumber: invoiceNumber,
            poNumber: poNumberForSlip,
            date: new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }),
            customerName,
            customerAddress,
            trackingNumber: item.tracking_number || '',
            totalQuantity: totalQty,
            shipmentNumber: shipmentRef,
            items: slipItems,
          };
          const pdfBuffer = await generatePoPackingSlipPdf(slipData);
          packingSlipBase64 = pdfBuffer.toString('base64');

          // Persist to all sibling items in this PO group so future fetches don't regenerate
          const siblingIds = siblingRows.map((r) => r.id).filter(Boolean);
          if (siblingIds.length > 1) {
            await pool.query(
              `UPDATE shipment_items SET packing_slip_base64 = $1 WHERE id = ANY($2::uuid[])`,
              [packingSlipBase64, siblingIds]
            );
            console.log(
              `✅ Packing slip persisted to ${siblingIds.length} sibling item(s) for PO ${poNumberForSlip}`
            );
          } else {
            await pool.query(
              `UPDATE shipment_items SET packing_slip_base64 = $1 WHERE id = $2`,
              [packingSlipBase64, itemId]
            );
            console.log(`✅ Packing slip regenerated and persisted: ${itemId}`);
          }
          await recordP1FulfillmentArtifacts({
            orderIds: siblingRows.map((r) => r.order_id).filter(Boolean),
            poNumber: poNumberForSlip,
            invoiceNumber,
            trackingNumber: item.tracking_number || '',
            shipmentRecordId: item.shipment_record_id || null,
          });
          }
        } catch (regenErr: any) {
          console.error(
            `❌ Packing slip regeneration failed for item ${itemId}:`,
            regenErr.message
          );
          return res.status(404).json({
            _error: 'Packing slip not available and could not be regenerated',
            details: regenErr.message,
          });
        }
      }

      // Decode base64 and send as PDF
      const slipBuffer = Buffer.from(packingSlipBase64, 'base64');
      const filenamePoNumber = item.po_number || requestedPoNumber || 'unknown';
      const filename = `packing-slip-PO${filenamePoNumber}-${item.order_id}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.send(slipBuffer);

      console.log(`✅ Packing slip downloaded: ${filename}`);
    } catch (error: any) {
      console.error('❌ Error downloading packing slip:', error);
      res.status(500).json({
        _error: 'Failed to download packing slip',
        details: error.message,
      });
    }
  }
);

// POST /api/po-orders/oem-shipments/:id/invoices
// Create one review AR invoice for a P1 OEM shipment packing slip (shipment + PO group).
router.post(
  '/oem-shipments/:id/invoices/preview',
  authenticateToken,
  async (req, res) => {
    try {
      if (!isGlennAdmin(req.user)) {
        return res.status(403).json({
          error: 'Only glennj/admin can preview P1 OEM packing slip invoices.',
        });
      }

      const { id } = req.params;
      const { poNumber } = req.body || {};
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: 'Invalid shipment ID format' });
      }
      if (!poNumber || typeof poNumber !== 'string') {
        return res.status(400).json({ error: 'poNumber is required' });
      }

      const draft = await buildP1PackingSlipInvoiceDraft(id, poNumber);
      if (draft.existingInvoice) {
        return res.json({
          exists: true,
          id: draft.existingInvoice.id,
          invoiceNumber: draft.existingInvoice.invoice_number,
          status: draft.existingInvoice.status,
          poNumber,
          lines: [],
          subtotal: '0.00',
          totalAmount: '0.00',
          pricingMismatch: false,
        });
      }

      const first = draft.first;
      const invoiceNumber = draft.invoiceNumber || '(new number will be assigned)';
      res.json({
        exists: false,
        invoiceNumber,
        poNumber,
        customerName:
          first.po_customer_name ||
          first.shipment_customer_name ||
          first.ship_to_snapshot?.name ||
          'P1 OEM Customer',
        trackingNumber: first.master_tracking_number || null,
        shipmentReference: first.reference || null,
        lines: draft.consolidatedLines.map((line: any) => {
          const qty = Number(line.quantity || 0);
          const unitPrice = Number(line.unit_price || 0);
          return {
            partNumber: line.part_number || null,
            description: line.description || line.order_id || poNumber,
            quantity: qty,
            unitPrice: unitPrice.toFixed(2),
            lineTotal: (qty * unitPrice).toFixed(2),
            orderIds: line.orderIds,
          };
        }),
        subtotal: draft.subtotal.toFixed(2),
        totalAmount: draft.subtotal.toFixed(2),
        pricingMismatch: draft.pricingMismatch,
      });
    } catch (error: any) {
      console.error('Failed to preview P1 OEM packing slip invoice:', error);
      res.status(500).json({
        error: error.message || 'Failed to preview invoice from P1 packing slip',
      });
    }
  }
);

router.post(
  '/oem-shipments/:id/invoices',
  authenticateToken,
  async (req, res) => {
    const client = await pool.connect();
    try {
      if (!isGlennAdmin(req.user)) {
        return res.status(403).json({
          error: 'Only glennj/admin can create P1 OEM packing slip invoices.',
        });
      }

      const { id } = req.params;
      const { poNumber } = req.body || {};
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: 'Invalid shipment ID format' });
      }
      if (!poNumber || typeof poNumber !== 'string') {
        return res.status(400).json({ error: 'poNumber is required' });
      }

      const draft = await buildP1PackingSlipInvoiceDraft(id, poNumber);
      if (draft.existingInvoice) {
        return res.status(200).json({
          id: draft.existingInvoice.id,
          invoiceNumber: draft.existingInvoice.invoice_number,
          status: draft.existingInvoice.status,
          existing: true,
        });
      }

      const lines = draft.lines;
      const shipmentOrderIds = lines.map((line: any) => line.order_id).filter(Boolean);
      const first = draft.first;
      let invoiceNumber = draft.invoiceNumber as string | null;
      if (!invoiceNumber) {
        const { storage: invoiceStorage } = await import('../../storage');
        invoiceNumber = await invoiceStorage.getNextInvoiceNumber(
          String(first.po_customer_id || first.shipment_customer_id || '0'),
          first.po_customer_name ||
            first.shipment_customer_name ||
            first.ship_to_snapshot?.name ||
            'P1 OEM Customer'
        );
      }

      const today = new Date();
      const invoiceDate = toDateOnly(today);
      const dueDate = toDateOnly(addDays(today, 30));
      const customerId = String(
        first.po_customer_id || first.shipment_customer_id || '0'
      );
      const consolidatedLines = draft.consolidatedLines;
      const subtotal = draft.subtotal;
      const pricingMismatch = draft.pricingMismatch;

      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('p1-oem-packing-slip-invoice'), hashtext($1))`,
        [`${id}:${poNumber}`]
      );

      const existingInTransaction = await findP1PackingSlipInvoice(id, poNumber);
      if (existingInTransaction) {
        await client.query('COMMIT');
        console.log(
          `[P1InvoiceService] Duplicate prevented: shipment ${id}, PO ${poNumber} already has invoice ${existingInTransaction.invoice_number}`
        );
        return res.status(200).json({
          id: existingInTransaction.id,
          invoiceNumber: existingInTransaction.invoice_number,
          status: existingInTransaction.status,
          existing: true,
        });
      }

      const invoiceResult = await client.query(
        `INSERT INTO ar_invoices (
         customer_id,
         invoice_number,
         invoice_date,
         due_date,
         terms,
         po_id,
         po_override,
         subtotal,
         discount_amount,
         freight_amount,
         tax_amount,
         retainage_percent,
         retainage_amount,
         total_amount,
         status,
         notes,
         customer_visible_notes,
         internal_notes,
         created_by,
         auto_created,
         pricing_mismatch,
         pricing_ambiguous
       )
       VALUES ($1, $2, $3, $4, 'NET_30', $5, $6, $7, '0', '0', '0', '0', '0', $7, 'REVIEW', $8, NULL, $9, $10, true, $11, false)
       RETURNING id, invoice_number, status`,
        [
          customerId,
          invoiceNumber,
          invoiceDate,
          dueDate,
          first.purchase_order_id ? String(first.purchase_order_id) : null,
          poNumber,
          subtotal.toFixed(2),
          `Auto-created from P1 OEM packing slip ${invoiceNumber} for PO ${poNumber}.`,
          `Source: P1 OEM shipment ${first.reference || id}; tracking ${first.master_tracking_number || 'n/a'}; PO ${poNumber}.`,
          req.user?.username || 'system',
          pricingMismatch,
        ]
      );

      const invoice = invoiceResult.rows[0];
      for (const line of consolidatedLines) {
        const qty = Number(line.quantity || 0);
        const unitPrice = Number(line.unit_price || 0);
        const tags = {
          source: 'p1_oem_packing_slip',
          shipmentRecordId: id,
          shipmentReference: first.reference || null,
          shipmentItemIds: line.shipmentItemIds,
          poNumber,
          p1PoItemIds: line.p1PoItemIds,
          orderIds: line.orderIds,
          trackingNumber: first.master_tracking_number || null,
          ...buildRevenueDimensionTags('P1'),
        };

        await client.query(
          `INSERT INTO ar_invoice_lines (
           invoice_id,
           inventory_item_id,
           po_item_id,
           part_number,
           production_line,
           description,
           qty,
           unit_price,
           line_total,
           dimension_tags
         )
         VALUES ($1, NULL, NULL, $2, 'P1', $3, $4, $5, $6, $7::jsonb)`,
          [
            invoice.id,
            line.part_number || null,
            line.description || line.order_id || poNumber,
            qty.toString(),
            unitPrice.toFixed(2),
            (qty * unitPrice).toFixed(2),
            JSON.stringify(tags),
          ]
        );
      }

      if (first.shipment_record_id) {
        const shipmentPoCount = await getP1ShipmentPoCount(first.shipment_record_id);
        if (shipmentPoCount <= 1) {
          await client.query(
            `UPDATE shipment_records
             SET invoice_number = COALESCE(invoice_number, $1), updated_at = NOW()
             WHERE id = $2`,
            [invoice.invoice_number, first.shipment_record_id]
          );
        }
      }

      await client.query('COMMIT');
      await recordP1FulfillmentArtifacts({
        orderIds: shipmentOrderIds,
        poNumber,
        invoiceNumber: invoice.invoice_number,
        trackingNumber: first.master_tracking_number || '',
        shipmentRecordId: id,
      });
      console.log(
        `[P1InvoiceService] Invoice ${invoice.invoice_number} created from shipment ${id}, PO ${poNumber}`
      );
      res.status(201).json({
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        status: invoice.status,
        existing: false,
      });
    } catch (error: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors.
      }
      console.error('Failed to create P1 OEM packing slip invoice:', error);
      res.status(500).json({
        error: error.message || 'Failed to create invoice from P1 packing slip',
      });
    } finally {
      client.release();
    }
  }
);

// PATCH /api/po-orders/oem-shipments/:id/tracking
// Update tracking number for a specific shipment
router.patch(
  '/oem-shipments/:id/tracking',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { trackingNumber } = req.body;

      console.log(
        `📝 Updating tracking number for shipment ${id} to: ${trackingNumber}`
      );

      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ _error: 'Invalid shipment ID format' });
      }

      if (
        !trackingNumber ||
        typeof trackingNumber !== 'string' ||
        trackingNumber.trim().length === 0
      ) {
        return res.status(400).json({ _error: 'Tracking number is required' });
      }

      const query = `
      UPDATE shipment_records
      SET master_tracking_number = $1
      WHERE id = $2
      RETURNING id, master_tracking_number
    `;

      const result = await pool.query(query, [trackingNumber.trim(), id]);
      const updated = (result.rows || result)[0];

      if (!updated) {
        return res.status(404).json({ _error: 'Shipment not found' });
      }

      console.log(`✅ Tracking number updated successfully for shipment ${id}`);
      res.json({
        success: true,
        shipmentId: updated.id,
        trackingNumber: updated.master_tracking_number,
      });
    } catch (error: any) {
      console.error('❌ Error updating tracking number:', error);
      res.status(500).json({
        _error: 'Failed to update tracking number',
        details: error.message,
      });
    }
  }
);

// POST /api/po-orders/oem-shipments/:id/items
// Add items to an existing shipment (admin correction feature)
router.post('/oem-shipments/:id/items', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      poItemId,
      orderId,
      quantity = 1,
      description = '',
      poNumber = '',
    } = req.body;

    console.log(`📦 Adding item to shipment ${id}: ${orderId}`);

    // Validate UUID format for shipment ID
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ _error: 'Invalid shipment ID format' });
    }

    // Validate required fields
    if (!poItemId || !orderId) {
      return res
        .status(400)
        .json({ _error: 'poItemId and orderId are required' });
    }

    // Check if shipment exists
    const shipmentCheck = await pool.query(
      'SELECT id FROM shipment_records WHERE id = $1',
      [id]
    );

    if ((shipmentCheck.rows || shipmentCheck).length === 0) {
      return res.status(404).json({ _error: 'Shipment not found' });
    }

    // Check if item already exists in this shipment
    const existingCheck = await pool.query(
      'SELECT id FROM shipment_items WHERE shipment_id = $1 AND order_id = $2',
      [id, orderId]
    );

    if ((existingCheck.rows || existingCheck).length > 0) {
      return res
        .status(400)
        .json({ _error: `Item ${orderId} already exists in this shipment` });
    }

    const inheritedSlipRows = rowsOf<{ packing_slip_base64: string | null }>(
      await pool.query(
        `SELECT existing_si.packing_slip_base64
         FROM shipment_items existing_si
         LEFT JOIN production_orders existing_prod_ord ON existing_si.order_id = existing_prod_ord.order_id
         LEFT JOIN purchase_order_items existing_poi ON existing_poi.id = existing_si.po_item_id
         LEFT JOIN purchase_orders existing_po ON existing_poi.po_id = existing_po.id
         WHERE existing_si.shipment_id = $1
           AND COALESCE(NULLIF(existing_si.po_number, ''), existing_prod_ord.po_number, existing_po.po_number) = $2
           AND existing_si.packing_slip_base64 IS NOT NULL
         ORDER BY existing_si.created_at DESC
         LIMIT 1`,
        [id, poNumber]
      )
    );
    const inheritedPackingSlipBase64 =
      inheritedSlipRows[0]?.packing_slip_base64 || null;

    // Insert the new shipment item
    const insertQuery = `
      INSERT INTO shipment_items (id, shipment_id, po_item_id, order_id, quantity, description, po_number, packing_slip_base64)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
      RETURNING id, shipment_id, po_item_id, order_id, quantity, packing_slip_base64 IS NOT NULL AS has_packing_slip
    `;

    const result = await pool.query(insertQuery, [
      id,
      poItemId,
      orderId,
      quantity,
      description,
      poNumber,
      inheritedPackingSlipBase64,
    ]);
    const newItem = (result.rows || result)[0];

    console.log(`✅ Item ${orderId} added to shipment ${id}`);
    res.json({
      success: true,
      item: newItem,
      message: `Item ${orderId} added to shipment successfully`,
    });
  } catch (error: any) {
    console.error('❌ Error adding item to shipment:', error);
    res.status(500).json({
      _error: 'Failed to add item to shipment',
      details: error.message,
    });
  }
});

// POST /api/po-orders/oem-shipments/cleanup-duplicates
// Remove FULFILLED-* shipments where the same orders already have real tracking numbers
router.post(
  '/oem-shipments/cleanup-duplicates',
  authenticateToken,
  async (req, res) => {
    try {
      console.log('🧹 Starting duplicate shipment cleanup...');

      // Find and delete FULFILLED-* shipments where orders also exist with real tracking
      const result = await pool.query(`
      WITH order_shipments AS (
        SELECT 
          si.order_id,
          sr.id as shipment_id,
          sr.master_tracking_number,
          CASE WHEN sr.master_tracking_number LIKE 'FULFILLED-%' THEN 'fulfilled' ELSE 'real' END as tracking_type
        FROM shipment_items si
        JOIN shipment_records sr ON si.shipment_id = sr.id
      ),
      orders_with_both_types AS (
        SELECT order_id
        FROM order_shipments
        GROUP BY order_id
        HAVING COUNT(DISTINCT tracking_type) > 1
      ),
      fulfilled_shipments_to_delete AS (
        SELECT DISTINCT os.shipment_id
        FROM order_shipments os
        WHERE os.order_id IN (SELECT order_id FROM orders_with_both_types)
          AND os.tracking_type = 'fulfilled'
      )
      DELETE FROM shipment_records
      WHERE id IN (SELECT shipment_id FROM fulfilled_shipments_to_delete)
      RETURNING id, master_tracking_number
    `);

      const deletedShipments = result.rows || result || [];
      console.log(
        `✅ Cleaned up ${deletedShipments.length} duplicate FULFILLED-* shipments`
      );

      res.json({
        success: true,
        deletedCount: deletedShipments.length,
        deletedShipments: deletedShipments.map((s: any) => ({
          id: s.id,
          trackingNumber: s.master_tracking_number,
        })),
      });
    } catch (error: any) {
      console.error('❌ Error cleaning up duplicate shipments:', error);
      res.status(500).json({
        _error: 'Failed to cleanup duplicates',
        details: error.message,
      });
    }
  }
);

// POST /api/po-orders/oem-shipments/:id/return-to-qc
// Return all items from a shipment back to Shipping QC for reprinting/editing
router.post(
  '/oem-shipments/:id/return-to-qc',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      console.log(
        `🔄 Returning shipment ${id} to Shipping QC. Reason: ${reason || 'Not specified'}`
      );

      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ _error: 'Invalid shipment ID format' });
      }

      // Get all items in this shipment
      const itemsResult = await pool.query(
        `SELECT
         si.order_id,
         si.po_number,
         sr.invoice_number,
         sr.master_tracking_number
       FROM shipment_items si
       JOIN shipment_records sr ON sr.id = si.shipment_id
       WHERE si.shipment_id = $1`,
        [id]
      );
      const items = itemsResult.rows || itemsResult;

      if (items.length === 0) {
        return res
          .status(404)
          .json({ _error: 'Shipment not found or has no items' });
      }

      const orderIds = items.map((item: any) => item.order_id);
      console.log(
        `🔄 Regressing ${orderIds.length} orders back to Shipping QC: ${orderIds.join(', ')}`
      );

      const artifactGroups = new Map<
        string,
        { invoiceNumber: string; trackingNumber: string; orderIds: string[] }
      >();
      for (const item of items) {
        if (!item.invoice_number || !item.po_number) continue;
        if (!artifactGroups.has(item.po_number)) {
          artifactGroups.set(item.po_number, {
            invoiceNumber: item.invoice_number,
            trackingNumber: item.master_tracking_number || '',
            orderIds: [],
          });
        }
        artifactGroups.get(item.po_number)!.orderIds.push(item.order_id);
      }

      for (const [poNumber, artifact] of artifactGroups.entries()) {
        await recordP1FulfillmentArtifacts({
          orderIds: artifact.orderIds,
          poNumber,
          invoiceNumber: artifact.invoiceNumber,
          trackingNumber: artifact.trackingNumber,
          shipmentRecordId: id,
        });
      }

      // Parse order IDs to extract PO item IDs
      // Format is "PO-{poItemId}-{unitNumber}" e.g., "PO-93-1"
      const poItemIds: number[] = [];
      for (const orderId of orderIds) {
        const match = orderId.match(/^PO-(\d+)-\d+$/);
        if (match) {
          poItemIds.push(parseInt(match[1], 10));
        }
      }
      const uniquePoItemIds = [...new Set(poItemIds)];
      console.log(`🔄 Extracted PO item IDs: ${uniquePoItemIds.join(', ')}`);

      let totalUpdated = 0;

      // Update purchase_order_items.stock_status back to null (ready for shipping QC).
      // The explicit return-to-QC action is itself the business authorization to reverse any
      // prior shipped status, so we clear stock_status unconditionally for all items in this
      // shipment — including metal accessories that have no production order and whose Shipping
      // QC visibility depends entirely on stock_status being NULL.
      if (uniquePoItemIds.length > 0) {
        const poItemResult = await pool.query(
          `
        UPDATE purchase_order_items 
        SET stock_status = NULL,
            updated_at = NOW()
        WHERE id = ANY($1::int[])
        RETURNING id, stock_status
      `,
          [uniquePoItemIds]
        );
        const poItemsUpdated = poItemResult.rows || poItemResult;
        console.log(
          `✅ Updated ${poItemsUpdated.length} purchase_order_items to null stock_status`
        );
        totalUpdated += poItemsUpdated.length;
      }

      // Also try to update production_orders if they exist
      const updateResult = await pool.query(
        `
      UPDATE production_orders 
      SET production_status = 'IN_PROGRESS',
          current_department = 'Shipping QC',
          shipped_at = NULL,
          is_fulfilled = false,
          fulfilled_date = NULL,
          updated_at = NOW()
      WHERE order_id = ANY($1::text[])
      RETURNING order_id, production_status, current_department
    `,
        [orderIds]
      );

      const updated = updateResult.rows || updateResult;
      if (updated.length > 0) {
        console.log(
          `✅ Updated ${updated.length} production orders to Shipping QC`
        );
        totalUpdated += updated.length;
      }

      // Also update all_orders if they exist there
      await auditUpdateOrders({
        db: pool,
        orderIds,
        changes: {
          current_department: 'Shipping QC',
          status: 'IN_PROGRESS',
        },
        source: 'RETURN_TO_QC',
        user: (req as any).user,
        reason: (req as any).body?.reason || 'Return to QC',
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | null,
      });

      try {
        await reverseP1ShipmentRevenueDraftOrEntry(
          'p1_shipment_record',
          id,
          reason || 'Shipment returned to Shipping QC',
          req.user
        );
      } catch (revenueErr: any) {
        console.error(
          `Failed to reverse P1 PO shipment revenue draft for ${id}:`,
          revenueErr.message
        );
      }

      // Delete shipment_items so they don't appear in OEM Shipments anymore
      const deleteItemsResult = await pool.query(
        `
      DELETE FROM shipment_items 
      WHERE shipment_id = $1
      RETURNING id
    `,
        [id]
      );
      const deletedItems = deleteItemsResult.rows || deleteItemsResult;
      console.log(`🗑️ Deleted ${deletedItems.length} shipment_items`);

      // Delete the shipment record since it's now empty
      await pool.query(
        `
      DELETE FROM shipment_records 
      WHERE id = $1
    `,
        [id]
      );
      console.log(`🗑️ Deleted shipment record ${id}`);

      res.json({
        success: true,
        message: `Returned ${totalUpdated} items to Shipping QC`,
        orderIds: orderIds,
        poItemIds: uniquePoItemIds,
        updatedCount: totalUpdated,
      });
    } catch (error: any) {
      console.error('❌ Error returning shipment to QC:', error);
      res.status(500).json({
        _error: 'Failed to return shipment to QC',
        details: error.message,
      });
    }
  }
);

// POST /api/po-orders/toggle-fulfilled
// Mark PO item(s) as fulfilled (shipped through another system) or unfulfilled
// Supports both single orderId and batch orderIds array
// This removes items from the Shipping QC queue - shipment records are created by process-shipment
router.post('/toggle-fulfilled', authenticateToken, async (req, res) => {
  try {
    // Support both single orderId and batch orderIds
    const { orderId, orderIds, isFulfilled, fulfilled } = req.body;
    const shouldFulfill = isFulfilled ?? fulfilled ?? true;

    // Normalize to array of order IDs
    let idsToProcess: string[] = [];
    if (orderIds && Array.isArray(orderIds)) {
      idsToProcess = orderIds;
    } else if (orderId) {
      idsToProcess = [orderId];
    }

    if (idsToProcess.length === 0) {
      return res
        .status(400)
        .json({ _error: 'orderId or orderIds is required' });
    }

    console.log(
      `📦 ${shouldFulfill ? 'Marking' : 'Unmarking'} ${idsToProcess.length} item(s) as fulfilled...`
    );

    const { storage } = await import('../../storage');
    const results: any[] = [];
    const shippedAt = new Date();
    const shippedPoIds = new Set<number>();

    for (const id of idsToProcess) {
      // Check if this is a PO item (non-stock/metal accessory) or a production order
      if (id.startsWith('PO-') && id.includes('-')) {
        // This is a PO item - extract poItemId from orderId (format: PO-{poItemId}-{unitNumber})
        const parts = id.split('-');
        if (parts.length >= 3) {
          const poItemId = parseInt(parts[1]);
          if (!isNaN(poItemId)) {
            // Update PO item stock status
            await storage.updatePurchaseOrderItem(poItemId, {
              stockStatus: shouldFulfill ? 'SHIPPED' : 'IN_STOCK',
            });
            console.log(
              `✅ PO Item ${poItemId} marked as ${shouldFulfill ? 'SHIPPED' : 'IN_STOCK'}`
            );

            results.push({
              orderId: id,
              success: true,
              isFulfilled: shouldFulfill,
            });
            continue;
          }
        }
      }

      // Try to find as production order
      const order = await storage.getProductionOrderByOrderId(id);

      if (!order) {
        console.log(`⚠️ Order ${id} not found, skipping`);
        results.push({
          orderId: id,
          success: false,
          error: 'Order not found',
        });
        continue;
      }

      const nextProductionStatus = deriveP1ProductionStatus({
        currentDepartment: order.currentDepartment,
        isFulfilled: shouldFulfill,
        currentStatus: order.productionStatus,
        preserveCancelled: true,
      });
      const nextDepartment =
        shouldFulfill
          ? 'Shipped'
          : ['shipped', 'fulfilled'].includes(String(order.currentDepartment || '').trim().toLowerCase())
            ? 'Shipping QC'
            : order.currentDepartment;

      // Update production status to SHIPPED or back to the status implied by its department.
      await storage.updateProductionOrder(order.id, {
        productionStatus: nextProductionStatus,
        currentDepartment: nextDepartment,
        shippedAt: shouldFulfill ? shippedAt : null,
        isFulfilled: shouldFulfill,
        fulfilledDate: shouldFulfill ? shippedAt : null,
      });

      if (shouldFulfill && order.poId) shippedPoIds.add(order.poId);

      console.log(`✅ ${id} fulfillment status updated: ${shouldFulfill}`);
      results.push({
        orderId: id,
        success: true,
        isFulfilled: shouldFulfill,
      });
    }

    // Auto-close any POs where all active production orders are now SHIPPED
    for (const poId of shippedPoIds) {
      await autoClosePOIfFullyShipped(poId);
    }

    // Note: Shipment records are created by process-shipment endpoint, not here
    // This endpoint only updates order status to remove items from Shipping QC queue

    res.json({
      success: true,
      processed: results.length,
      results,
      shippedAt: shouldFulfill ? shippedAt.toISOString() : null,
    });
  } catch (error: any) {
    console.error('❌ Error toggling fulfilled status:', error);
    if (error?.name === 'TransitionValidationError') {
      return res.status(422).json({
        _error: error.message,
        code: error.code,
        context: error.context,
      });
    }
    res.status(500).json({
      _error: 'Failed to update fulfilled status',
      details: error.message,
    });
  }
});

// GET /api/po-orders/fulfilled-items
// Get all fulfilled items for a specific customer (admin tool to find incorrectly fulfilled items)
router.get('/fulfilled-items', authenticateToken, async (req, res) => {
  try {
    const { customerName } = req.query;

    console.log(
      `🔍 Fetching fulfilled items${customerName ? ` for customer: ${customerName}` : ''}...`
    );

    // Query production_orders for fulfilled items
    let query = `
      SELECT 
        prod.id,
        prod.order_id,
        prod.production_status,
        prod.current_department,
        prod.shipped_at,
        prod.is_fulfilled,
        prod.fulfilled_date,
        poi.item_name,
        poi.stock_model_name,
        poi.quantity,
        po.po_number,
        po.customer_name
      FROM production_orders prod
      JOIN purchase_order_items poi ON prod.po_item_id = poi.id
      JOIN purchase_orders po ON poi.po_id = po.id
      WHERE (prod.production_status = 'Shipped' OR prod.is_fulfilled = true)
    `;

    const params: any[] = [];
    if (customerName) {
      query += ` AND po.customer_name ILIKE $1`;
      params.push(`%${customerName}%`);
    }

    query += ` ORDER BY po.customer_name, po.po_number, prod.order_id`;

    const result = await pool.query(query, params);
    const items = result.rows || result || [];

    console.log(`📊 Found ${items.length} fulfilled items`);

    res.json({
      success: true,
      count: items.length,
      items: items.map((item: any) => ({
        id: item.id,
        orderId: item.order_id,
        productionStatus: item.production_status,
        currentDepartment: item.current_department,
        shippedAt: item.shipped_at,
        isFulfilled: item.is_fulfilled,
        fulfilledDate: item.fulfilled_date,
        itemName: item.item_name,
        stockModel: item.stock_model_name,
        quantity: item.quantity,
        poNumber: item.po_number,
        customerName: item.customer_name,
      })),
    });
  } catch (error: any) {
    console.error('❌ Error fetching fulfilled items:', error);
    res.status(500).json({
      _error: 'Failed to fetch fulfilled items',
      details: error.message,
    });
  }
});

// POST /api/po-orders/reset-fulfilled
// Reset fulfilled status for specific items (admin tool to fix incorrectly fulfilled items)
router.post('/reset-fulfilled', authenticateToken, async (req, res) => {
  try {
    const { orderIds, customerName, poNumber } = req.body;

    if (!orderIds && !customerName && !poNumber) {
      return res.status(400).json({
        _error:
          'Provide orderIds array, customerName, or poNumber to reset fulfilled items',
      });
    }

    console.log(`🔄 Resetting fulfilled status...`);

    let updateQuery = `
      UPDATE production_orders 
      SET 
        production_status = 'IN_PROGRESS',
        current_department = 'Shipping QC',
        shipped_at = NULL,
        is_fulfilled = false,
        fulfilled_date = NULL,
        updated_at = NOW()
      WHERE (UPPER(production_status) = 'SHIPPED' OR is_fulfilled = true)
    `;

    const params: any[] = [];

    if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
      updateQuery += ` AND order_id = ANY($1::text[])`;
      params.push(orderIds);
    } else if (customerName || poNumber) {
      // Reset by customer or PO
      updateQuery = `
        UPDATE production_orders 
        SET 
          production_status = 'IN_PROGRESS',
          current_department = 'Shipping QC',
          shipped_at = NULL,
          is_fulfilled = false,
          fulfilled_date = NULL,
          updated_at = NOW()
        WHERE (UPPER(production_status) = 'SHIPPED' OR is_fulfilled = true)
        AND po_item_id IN (
          SELECT poi.id FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          WHERE 1=1
      `;

      if (customerName) {
        params.push(`%${customerName}%`);
        updateQuery += ` AND po.customer_name ILIKE $${params.length}`;
      }
      if (poNumber) {
        params.push(poNumber);
        updateQuery += ` AND po.po_number = $${params.length}`;
      }

      updateQuery += `)`;
    }

    updateQuery += ` RETURNING order_id, production_status`;

    const result = await pool.query(updateQuery, params);
    const resetItems = result.rows || result || [];

    console.log(`✅ Reset ${resetItems.length} items to Shipping QC`);

    res.json({
      success: true,
      resetCount: resetItems.length,
      resetItems: resetItems.map((item: any) => item.order_id),
    });
  } catch (error: any) {
    console.error('❌ Error resetting fulfilled status:', error);
    res.status(500).json({
      _error: 'Failed to reset fulfilled status',
      details: error.message,
    });
  }
});

// POST /api/po-orders/process-shipment
// Comprehensive shipment processing: validates items, generates 1 UPS label + multiple packing slips, updates status, persists shipment
router.post('/process-shipment', authenticateToken, async (req, res) => {
  try {
    // Handle both legacy (orderIds) and new (items) payload formats
    const {
      orderIds,
      items,
      serviceCode = '03',
      weightPerItemLbs = 5,
      weightLbs,
      boxSize = 'medium',
      billingOption = 'sender',
      thirdPartyAccountNumber,
      thirdPartyPostalCode,
      thirdPartyCountryCode,
    } = req.body;

    // Use weightLbs from frontend if provided, otherwise fall back to weightPerItemLbs
    const totalPackageWeight = weightLbs
      ? parseFloat(weightLbs)
      : weightPerItemLbs;

    // Validate billing third-party requirements
    if (billingOption === 'third-party') {
      if (
        !thirdPartyAccountNumber ||
        !thirdPartyPostalCode ||
        !thirdPartyCountryCode
      ) {
        return res.status(400).json({
          _error:
            'Third-party billing requires accountNumber, postalCode, and countryCode',
        });
      }
    }

    // Normalize payload to items format
    let normalizedItems: Array<{
      poItemId: number;
      orderId: string;
      quantity: number;
    }>;

    if (items && Array.isArray(items)) {
      // New format from ShipmentDialog
      normalizedItems = items;
    } else if (orderIds && Array.isArray(orderIds)) {
      // Legacy format - fetch order details to get real poItemId and quantity
      const legacyOrders = await Promise.all(
        orderIds.map(async (orderId: string) => {
          const order = await storage.getProductionOrderByOrderId(orderId);
          if (!order || !order.poItemId) {
            throw new Error(`Order ${orderId} not found or missing PO item ID`);
          }
          return {
            poItemId: order.poItemId,
            orderId,
            quantity: 1, // Legacy assumes 1 unit per order
          };
        })
      );
      normalizedItems = legacyOrders;
    } else {
      return res
        .status(400)
        .json({ _error: 'Either items array or orderIds array is required' });
    }

    if (normalizedItems.length === 0) {
      return res.status(400).json({ _error: 'No items to ship' });
    }

    console.log(
      `📦 Processing shipment for ${normalizedItems.length} items...`
    );
    const { storage } = await import('../../storage');

    // 1. VALIDATE: Fetch all orders and ensure they exist + are ready to ship
    // Handle both items with production orders (orderId) and non-stock items (poItemId only)
    const orderDetails = await Promise.all(
      normalizedItems.map(async (item) => {
        // Check if this is a synthetic orderId (format: PO-{poItemId}-{unitNumber})
        // These are non-stock items that bypass production
        const syntheticMatch = item.orderId?.match(/^PO-(\d+)-(\d+)$/);

        // Also handle case where there's no orderId but we have a poItemId
        const hasNoOrderId = !item.orderId && item.poItemId;

        if (syntheticMatch || hasNoOrderId) {
          // Non-stock item: lookup directly by poItemId
          const poItemId = syntheticMatch
            ? parseInt(syntheticMatch[1])
            : item.poItemId;
          const unitNumber = syntheticMatch ? parseInt(syntheticMatch[2]) : 1;

          console.log(
            `📦 Processing non-stock item: poItemId=${poItemId}, unit=${unitNumber}`
          );

          const poItem = await storage.getPurchaseOrderItem(poItemId);
          if (!poItem) {
            throw new Error(`PO item ${poItemId} not found`);
          }

          // Check if already shipped (skip in dev mode)
          const isDevModeItem = process.env.NODE_ENV === 'development';
          if (
            (poItem.stockStatus === 'SHIPPED' ||
              poItem.stockStatus === 'FULFILLED') &&
            !isDevModeItem
          ) {
            throw new Error(`PO item ${poItemId} has already been shipped`);
          }
          if (
            (poItem.stockStatus === 'SHIPPED' ||
              poItem.stockStatus === 'FULFILLED') &&
            isDevModeItem
          ) {
            console.log(
              `🧪 DEV MODE: Allowing re-shipment of already shipped PO item ${poItemId}`
            );
          }

          const po = await storage.getPurchaseOrder(poItem.poId);
          if (!po) {
            throw new Error(`PO ${poItem.poId} not found`);
          }

          const customerId = parseInt(po.customerId);
          let customer: any = null;
          if (!isNaN(customerId)) {
            try {
              customer = await storage.getCustomer(customerId);
            } catch (dbError: any) {
              console.warn(
                `Database error fetching customer ${customerId}:`,
                dbError.message
              );
            }
          }
          // Fallback to PO customer info if customer not found
          if (!customer) {
            console.warn(
              `Customer ${po.customerId} not found, using PO customer data`
            );
            customer = {
              id: customerId || 0,
              name: po.customerName || 'Unknown Customer',
            };
          }

          // Create a synthetic order object for non-stock items
          const syntheticOrder = {
            id: null, // No production order
            orderId: item.orderId,
            poItemId: poItemId,
            customerId: String(po.customerId),
            unitNumber,
            itemId: poItem.stockModelId || null,
            itemName: poItem.itemName || poItem.stockModelName,
            productionStatus: 'PENDING',
            isNonStock: true, // Flag to identify non-stock items
          };

          return {
            order: syntheticOrder,
            poItem,
            po,
            customer,
            quantity: item.quantity,
          };
        } else {
          // Regular production order
          const order = await storage.getProductionOrderByOrderId(item.orderId);
          if (!order) {
            throw new Error(`Order ${item.orderId} not found`);
          }
          // P1 PO orders use productionStatus (PENDING, IN_PROGRESS, SHIPPED) not currentDepartment
          const isDevMode = process.env.NODE_ENV === 'development';
          if (order.productionStatus === 'SHIPPED' && !isDevMode) {
            throw new Error(`Order ${item.orderId} has already been shipped`);
          }
          if (order.productionStatus === 'SHIPPED' && isDevMode) {
            console.log(
              `🧪 DEV MODE: Allowing re-shipment of already shipped order ${item.orderId}`
            );
          }

          // Get PO item details
          if (!order.poItemId) {
            throw new Error(`Order ${item.orderId} has no PO item ID`);
          }
          const poItem = await storage.getPurchaseOrderItem(order.poItemId);
          if (!poItem) {
            throw new Error(`PO item ${order.poItemId} not found`);
          }

          // Get PO details
          const po = await storage.getPurchaseOrder(poItem.poId);
          if (!po) {
            throw new Error(`PO ${poItem.poId} not found`);
          }

          // Get customer details
          const customerId = parseInt(order.customerId);
          let customer: any = null;
          if (!isNaN(customerId)) {
            try {
              customer = await storage.getCustomer(customerId);
            } catch (dbError: any) {
              console.warn(
                `Database error fetching customer ${customerId}:`,
                dbError.message
              );
            }
          }
          // Fallback to PO customer info if customer not found
          if (!customer) {
            console.warn(
              `Customer ${order.customerId} not found, using PO customer data`
            );
            customer = {
              id: customerId || 0,
              name: po.customerName || 'Unknown Customer',
            };
          }

          return {
            order: { ...order, isNonStock: false },
            poItem,
            po,
            customer,
            quantity: item.quantity,
          };
        }
      })
    );

    // 2. VALIDATE: Ensure all orders from same customer (by normalized name, since same customer can have multiple IDs/name variations)
    const customerNames = orderDetails.map(
      (d) => d.customer?.name || d.po.customerName
    );
    const uniqueCustomerIds = new Set(
      orderDetails.map((d) => d.order.customerId)
    );

    // Normalize customer names for comparison (lowercase, remove LLC/Inc/Corp suffixes, trim)
    const normalizeCustomerName = (name: string): string => {
      return name
        .toLowerCase()
        .replace(/\s*(llc|inc|corp|corporation|ltd|limited|co\.?)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const normalizedNames = new Set(customerNames.map(normalizeCustomerName));
    const uniqueCustomerNames = new Set(customerNames);

    // Allow if normalized customer names match (even if exact names/IDs differ)
    if (normalizedNames.size > 1) {
      return res.status(400).json({
        _error: 'All items must be from the same customer',
        customers: Array.from(uniqueCustomerNames),
        customerIds: Array.from(uniqueCustomerIds),
      });
    }

    // Log warning if same customer has multiple IDs or name variations
    if (uniqueCustomerIds.size > 1 || uniqueCustomerNames.size > 1) {
      console.warn(
        `⚠️ Customer has variations - Names: ${Array.from(uniqueCustomerNames).join(', ')}, IDs: ${Array.from(uniqueCustomerIds).join(', ')}`
      );
    }

    // 2b. FINALIZATION GATE — block shipment if any serialized units missing SKU/drawing
    {
      const { p2SerializedItems } = await import('../../schema');
      const { and: andOp, eq: eqOp } = await import('drizzle-orm');

      for (const detail of orderDetails) {
        const poId = detail.order?.poId ?? (detail.order as any)?.po_id;
        const poItemId =
          detail.order?.poItemId ?? (detail.order as any)?.po_item_id;

        if (!poId || !poItemId) continue;

        const units = await db.query.p2SerializedItems.findMany({
          where: andOp(
            eqOp(p2SerializedItems.poId, poId),
            eqOp(p2SerializedItems.poItemId, poItemId),
            eqOp(p2SerializedItems.status, 'ACTIVE')
          ),
        });

        if (units.length === 0) continue;

        const shippableUnits = units.filter((u) => !!(u as any).completedAt);
        if (shippableUnits.length === 0) continue;

        const notFinalized = shippableUnits.filter(
          (u) =>
            !(u as any).finalizedAt ||
            !(u as any).sku ||
            !(u as any).drawingName
        );

        if (notFinalized.length > 0) {
          return res.status(403).json({
            error:
              'Cannot ship: some units are not finalized (SKU/Drawing required)',
            guard: 'FINALIZATION_REQUIRED',
            poId,
            poItemId,
            missing: notFinalized.map((u) => ({
              id: u.id,
              barcode: u.barcode,
              serialNumber: u.serialNumber,
              sku: (u as any).sku ?? null,
              drawingName: (u as any).drawingName ?? null,
              finalizedAt: (u as any).finalizedAt ?? null,
            })),
          });
        }
      }
    }

    // 3. GROUP BY PO NUMBER
    const poGroups = new Map<string, typeof orderDetails>();
    orderDetails.forEach((detail) => {
      const poNumber = detail.po.poNumber;
      if (!poGroups.has(poNumber)) {
        poGroups.set(poNumber, []);
      }
      poGroups.get(poNumber)!.push(detail);
    });

    console.log(
      `📊 Grouped ${orderDetails.length} items into ${poGroups.size} PO(s)`
    );
    console.log(`📋 PO Numbers: ${Array.from(poGroups.keys()).join(', ')}`);

    // 4. USE TOTAL WEIGHT FROM FRONTEND (or calculate from default)
    // If frontend provides totalPackageWeight, use that; otherwise calculate from default per-item weight
    let totalWeight = totalPackageWeight;
    if (!weightLbs) {
      // Legacy fallback: calculate from per-item weight
      totalWeight = 0;
      for (const detail of orderDetails) {
        totalWeight += weightPerItemLbs * detail.quantity;
      }
    }
    console.log(`⚖️  Total weight: ${totalWeight} lbs (box size: ${boxSize})`);

    // 5. GET CUSTOMER SHIPPING ADDRESS
    const firstCustomer = orderDetails[0].customer;
    let addresses: any[] = [];
    try {
      addresses = await storage.getCustomerAddresses(
        orderDetails[0].order.customerId
      );
    } catch (addrError: any) {
      console.error('Error fetching customer addresses:', addrError.message);
    }
    let primaryAddress = addresses[0];

    const isDev = process.env.NODE_ENV === 'development';

    if (!primaryAddress) {
      if (isDev) {
        // Use test address in development mode
        console.log(
          `🧪 DEV MODE: Using test shipping address for ${firstCustomer.name}`
        );
        primaryAddress = {
          street: '123 Test Street',
          street2: '',
          city: 'Test City',
          state: 'AL',
          zipCode: '35801',
          country: 'United States',
        };
      } else {
        return res.status(400).json({
          _error: `No shipping address found for customer ${firstCustomer.name}`,
        });
      }
    }

    const shipTo: ShipTo = {
      name: firstCustomer.name || '',
      attention: firstCustomer.name || '',
      phone: firstCustomer.phone || '0000000000',
      address1: primaryAddress.street || '',
      address2: primaryAddress.street2 || undefined,
      city: primaryAddress.city || '',
      state: primaryAddress.state || '',
      postalCode: primaryAddress.zipCode || '',
      country: primaryAddress.country || 'United States',
    };

    // 6. BUILD REFERENCE NUMBER (truncated to 35 chars for UPS)
    const poNumbers = Array.from(poGroups.keys());
    const referenceNumber = poNumbers.join(',').substring(0, 35);
    console.log(`📝 Reference number: ${referenceNumber}`);

    // 7. GENERATE UPS SHIPPING LABEL
    let trackingNumber: string;
    let labelBase64: string;

    // Use UPS_ENV to determine whether to call UPS API
    // If UPS_ENV is set to 'production' or 'sandbox', use real UPS
    // Otherwise, generate test tracking numbers
    const useRealUps =
      process.env.UPS_ENV === 'production' || process.env.UPS_ENV === 'sandbox';
    const hasUpsCredentials =
      process.env.UPS_CLIENT_ID &&
      process.env.UPS_CLIENT_SECRET &&
      process.env.UPS_ACCOUNT_NUMBER;

    if (!useRealUps || !hasUpsCredentials) {
      // Generate test tracking number when UPS is not configured
      const crypto = await import('crypto');
      trackingNumber = `TEST-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
      labelBase64 = '';
      console.log(
        `🧪 TEST MODE: Generated test tracking number: ${trackingNumber}`
      );
      console.log(
        `   UPS_ENV=${process.env.UPS_ENV || 'not set'}, hasCredentials=${hasUpsCredentials}`
      );
    } else {
      // In production, use real UPS API
      try {
        const shipmentResult = await createShipment({
          shipTo,
          serviceCode,
          weightLbs: Math.max(totalWeight, 1),
          referenceNumber,
          billingOption,
          thirdPartyAccountNumber,
          thirdPartyPostalCode,
          thirdPartyCountryCode,
        });

        trackingNumber = shipmentResult.trackingNumber;
        labelBase64 = shipmentResult.labelBase64 || '';

        if (!trackingNumber) {
          throw new Error('UPS did not return a tracking number');
        }

        console.log(`✅ UPS Label generated: ${trackingNumber}`);
      } catch (upsError: any) {
        console.error('❌ UPS API Error:', upsError.message);
        return res.status(502).json({
          _error: 'UPS shipping label generation failed',
          details: upsError.message,
          suggestion:
            'Check UPS credentials and try again, or process manually',
        });
      }
    }

    // 8. PERSIST SHIPMENT TO DATABASE (skip when using test tracking numbers)
    const shippedAt = new Date();
    const crypto = await import('crypto');
    const shipmentId = crypto.randomUUID();

    // Skip database persistence if using test mode (no real UPS)
    const skipDbPersistence = !useRealUps || !hasUpsCredentials;

    // Generate one packing slip per PO group (runs unconditionally, regardless of test mode)
    const poSlipMap = new Map<string, string | null>();
    const poInvoiceMap = new Map<string, string>();
    const failedPackingSlips: Array<{ poNumber: string; reason: string }> = [];

    for (const [groupPoNumber, groupItems] of poGroups.entries()) {
      try {
        const groupCustomerId = groupItems[0].po.customerId;
        const groupCustomerName =
          groupItems[0].po.customerName ||
          firstCustomer?.name ||
          'Unknown Customer';

        let groupCustomerAddress = null;
        try {
          groupCustomerAddress = groupCustomerId
            ? await storage.getCustomerDefaultAddress(String(groupCustomerId))
            : null;
        } catch (addrErr: any) {
          console.warn(
            `⚠️ Could not fetch customer address for PO ${groupPoNumber}: ${addrErr.message}`
          );
        }

        const reusableInvoiceNumber = await findReusableP1InvoiceNumber({
          poNumber: groupPoNumber,
          orderIds: groupItems
            .map((item) => item.order?.orderId || item.order?.order_id)
            .filter(Boolean),
          includeBroadHistory: false,
        });

        const invoiceNumber =
          reusableInvoiceNumber ||
          (await storage.getNextInvoiceNumber(
            String(groupCustomerId || '0'),
            groupCustomerName
          ));
        poInvoiceMap.set(groupPoNumber, invoiceNumber);

        if (reusableInvoiceNumber) {
          console.log(
            `♻️ Reusing historical invoice number ${invoiceNumber} for PO ${groupPoNumber}`
          );
        } else {
          console.log(
            `🆕 Generated new invoice number ${invoiceNumber} for PO ${groupPoNumber}`
          );
        }

        const slipItems = groupItemsByDescription(groupItems, {
          partNumber: groupPoNumber,
          shipmentNumber: referenceNumber || undefined,
        });

        const slipData: PackingSlipData = {
          packingSlipNumber: invoiceNumber,
          poNumber: groupPoNumber,
          date: new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          customerName: groupCustomerName,
          customerAddress: groupCustomerAddress
            ? {
                street: groupCustomerAddress.street,
                street2: groupCustomerAddress.street2 || undefined,
                city: groupCustomerAddress.city,
                state: groupCustomerAddress.state,
                zip: groupCustomerAddress.zipCode,
              }
            : undefined,
          trackingNumber: trackingNumber,
          totalQuantity: groupItems.reduce(
            (sum, gi) => sum + (gi.quantity || 1),
            0
          ),
          shipmentNumber: referenceNumber || undefined,
          items: slipItems,
        };

        const pdfBuffer = await generatePoPackingSlipPdf(slipData);
        poSlipMap.set(groupPoNumber, pdfBuffer.toString('base64'));
        console.log(
          `✅ Packing slip generated for PO ${groupPoNumber} (invoice: ${invoiceNumber})`
        );
      } catch (slipErr: any) {
        console.error(
          `❌ Packing slip generation failed for PO ${groupPoNumber}: ${slipErr.message}`,
          slipErr.stack
        );
        poSlipMap.set(groupPoNumber, null);
        failedPackingSlips.push({
          poNumber: groupPoNumber,
          reason: slipErr.message,
        });
      }
    }

    if (skipDbPersistence) {
      console.log(
        `🧪 TEST MODE: Skipping shipment record persistence (shipmentId: ${shipmentId})`
      );
    } else {
      try {
        // Map billingOption to billType enum
        const billType: 'SENDER' | 'RECEIVER' | 'THIRD_PARTY' =
          billingOption === 'prepaid'
            ? 'SENDER'
            : billingOption === 'collect'
              ? 'RECEIVER'
              : 'THIRD_PARTY';

        const shipmentRecord = {
          id: shipmentId,
          createdBy: req.user?.username || 'system',
          reference: referenceNumber,
          poNumbers: poNumbers.join(', '),
          shippedAt,
          carrier: 'UPS',
          serviceLevel: serviceCode,
          serviceCode: serviceCode,
          billType,
          masterTrackingNumber: trackingNumber,
          packageCount: 1,
          thirdPartyAccount: thirdPartyAccountNumber || null,
          customerId: orderDetails[0].order.customerId,
          customerName: firstCustomer?.name || '',
          customerAddress: primaryAddress?.street || shipTo.address1 || '',
          customerCity: primaryAddress?.city || shipTo.city || '',
          customerState: primaryAddress?.state || shipTo.state || '',
          customerZip: primaryAddress?.zipCode || shipTo.postalCode || '',
          shippingLabelBase64: labelBase64 || null,
          invoiceNumber:
            poInvoiceMap.size === 1
              ? Array.from(poInvoiceMap.values())[0]
              : null,
          shipFromSnapshot: {
            name: process.env.SHIP_FROM_NAME || 'AG Composites',
            street: process.env.SHIP_FROM_ADDRESS1 || '',
            city: process.env.SHIP_FROM_CITY || '',
            state: process.env.SHIP_FROM_STATE || '',
            postalCode: process.env.SHIP_FROM_POSTAL || '',
            country: process.env.SHIP_FROM_COUNTRY || 'US',
          },
          shipToSnapshot: {
            name: shipTo.name,
            street: shipTo.address1,
            street2: shipTo.address2 || null,
            city: shipTo.city,
            state: shipTo.state,
            postalCode: shipTo.postalCode,
            country: shipTo.country || 'US',
          },
          totalWeightLbs: String(totalWeight),
          documents: [
            labelBase64
              ? {
                  type: 'label',
                  fileName: `Label-${trackingNumber}.gif`,
                  mime: 'image/gif',
                  storagePath: '',
                  bytes: labelBase64.length,
                }
              : null,
          ].filter(Boolean),
          notificationMetadata: {},
        };

        const shipmentItemsData = orderDetails.map((detail) => {
          const itemPoNumber =
            detail.po?.poNumber ||
            detail.po?.po_number ||
            detail.order?.poNumber ||
            detail.order?.po_number ||
            '';
          const itemDescription = resolvePackingSlipDescription({
            stockModelName:
              detail.poItem?.stockModelName || detail.poItem?.stock_model_name,
            itemName:
              detail.order.itemName ||
              detail.order.item_name ||
              detail.poItem?.itemName ||
              detail.poItem?.item_name,
            stockModelId:
              detail.poItem?.stockModelId || detail.poItem?.stock_model_id,
          });
          const itemOrderId =
            detail.order.orderId || detail.order.order_id || '';
          const packingSlipBase64 = poSlipMap.get(itemPoNumber) || undefined;

          return {
            poItemId: detail.order.poItemId || detail.order.po_item_id,
            orderId: itemOrderId,
            quantity: detail.quantity,
            weightLbs: weightPerItemLbs * detail.quantity,
            description: itemDescription,
            poNumber: itemPoNumber,
            packingSlipBase64,
          };
        });

        const createdShipment = await storage.createShipment({
          shipment: shipmentRecord,
          items: shipmentItemsData,
        });

        console.log(`✅ Shipment persisted to database: ${shipmentId}`);

        try {
          await createOrUpdateP1ShipmentRevenueFromShipmentRecord(
            createdShipment.id,
            req.user
          );
        } catch (revenueErr: any) {
          console.error(
            `Failed to create P1 PO shipment revenue draft for ${createdShipment.id}:`,
            revenueErr.message
          );
        }

        // Verify packing slips were persisted for all items
        const verifyResult = await pool.query<{
          id: string;
          packing_slip_base64: string | null;
        }>(
          `SELECT id, packing_slip_base64 FROM shipment_items WHERE shipment_id = $1`,
          [createdShipment.id]
        );
        const verifyRows: { id: string; packing_slip_base64: string | null }[] =
          (verifyResult as any).rows ?? (verifyResult as any);
        const missingSlips = verifyRows.filter((r) => !r.packing_slip_base64);
        if (missingSlips.length > 0) {
          const missingIds = missingSlips.map((r) => r.id).join(', ');
          console.warn(
            `⚠️ Packing slip missing on shipment_items after persist: ids=[${missingIds}]`
          );
        } else {
          console.log(
            `✅ Verified packing_slip_base64 present on all ${verifyRows.length} shipment_item(s)`
          );
        }

        for (const [
          artifactPoNumber,
          invoiceNumber,
        ] of poInvoiceMap.entries()) {
          const artifactOrderIds = shipmentItemsData
            .filter((item) => item.poNumber === artifactPoNumber)
            .map((item) => item.orderId)
            .filter(Boolean);

          await recordP1FulfillmentArtifacts({
            orderIds: artifactOrderIds,
            poNumber: artifactPoNumber,
            invoiceNumber,
            trackingNumber,
            shipmentRecordId: createdShipment.id,
          });
        }
      } catch (dbError: any) {
        console.error(`❌ Shipment persistence failed: ${dbError.message}`);
        throw new Error(`Shipment persistence failed: ${dbError.message}`);
      }
    }

    // 9. UPDATE ORDER/ITEM STATUSES TO SHIPPED
    const mainShipPoIds = new Set<number>();
    for (const detail of orderDetails) {
      try {
        if (detail.order.isNonStock) {
          await storage.updatePurchaseOrderItem(detail.order.poItemId, {
            stockStatus: 'SHIPPED',
          });
          console.log(
            `✅ PO Item ${detail.order.poItemId} marked as SHIPPED (non-stock)`
          );
        } else if (detail.order.id) {
          await storage.updateProductionOrder(detail.order.id, {
            productionStatus: 'SHIPPED',
            currentDepartment: 'Shipped',
            shippedAt,
            isFulfilled: true,
            fulfilledDate: shippedAt,
          });
          console.log(`✅ Order ${detail.order.orderId} marked as SHIPPED`);
          const poId = detail.order?.poId ?? (detail.order as any)?.po_id;
          if (poId) mainShipPoIds.add(Number(poId));
        }
      } catch (updateError: any) {
        console.error(
          `⚠️ Failed to update order ${detail.order.orderId}:`,
          updateError.message
        );
      }
    }

    // Auto-close any POs where all active production orders are now SHIPPED
    for (const poId of mainShipPoIds) {
      await autoClosePOIfFullyShipped(poId);
    }

    // 10. BUILD PACKING SLIP RESPONSE (reuse PDFs already generated in step 8)
    const packingSlips: Array<{
      poNumber: string;
      filename: string;
      data: string;
    }> = [];

    for (const [poNumber, slipBase64] of poSlipMap.entries()) {
      if (slipBase64) {
        packingSlips.push({
          poNumber,
          filename: `Packing-Slip-PO-${poNumber}.pdf`,
          data: slipBase64,
        });
      }
    }

    console.log(
      `📄 Generated ${packingSlips.length} packing slip(s)${failedPackingSlips.length > 0 ? `, ${failedPackingSlips.length} failed` : ''}`
    );

    // Return comprehensive response (production orders already updated in persistence block)
    res.json({
      success: true,
      shipmentId,
      trackingNumber,
      shippedAt: shippedAt.toISOString(),
      shippingLabel: {
        format: 'GIF',
        data: labelBase64,
      },
      packingSlips,
      failedPackingSlips:
        failedPackingSlips.length > 0 ? failedPackingSlips : undefined,
      itemsShipped: orderDetails.length,
      poNumbers: Array.from(poGroups.keys()),
      totalWeight: totalWeight,
    });
  } catch (error: any) {
    console.error('❌ Error processing shipment:', error);
    res.status(500).json({
      _error: 'Failed to process shipment',
      details: error.message,
    });
  }
});

export default router;
