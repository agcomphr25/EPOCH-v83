import { Router, Request, Response } from 'express';
import { 
  insertVendorPOSchema, 
  insertVendorPOItemSchema, 
  insertVendorPOSettingsSchema,
  insertOptionalSettingSchema,
  insertPOOptionalSettingSchema
} from '@shared/schema';
import { z } from 'zod';
import { storage } from '../../storage';
import { generateMagicLink } from '../../utils/magicLink';
import { sendCommunication } from '../../communication/send';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

const router = Router();

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

/**
 * Derive authoritative `to` and `cc` from the validated recipient selection.
 *
 * Rules:
 *  - If no valid selections → fall back to primaryEmail as `to`.
 *  - If primary is in the selection → use primaryEmail as `to`, rest go to CC.
 *  - If primary is NOT in the selection → first validated entry is `to`, rest go to CC.
 *  - standardCc entries (laurie@, issuing user email) are merged into CC, deduped.
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

// Query params schema for list vendor POs
const listVendorPOsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().optional(),
  status: z.enum(['Draft', 'RFQ Sent', 'Sent', 'Partially Received', 'Fully Received', 'Cancelled', 'any']).default('any'),
  vendorId: z.coerce.number().int().positive().optional(),
  sort: z.string().default('createdAt:desc'),
});

// GET /api/vendor-pos - List all vendor POs with filtering and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const params = listVendorPOsQuerySchema.parse(req.query);
    const result = await storage.getAllVendorPOs(params);

    // Augment each PO with pendingReceiptCount (in-progress receipts tied to that PO)
    try {
      const countRows = await db.execute(
        sql`SELECT vendor_po_id, COUNT(*)::int AS cnt
            FROM receipts
            WHERE vendor_po_id IS NOT NULL AND status = 'in_progress'
            GROUP BY vendor_po_id`
      );
      type CountRow = { vendor_po_id: number; cnt: number };
      const rows: CountRow[] = (
        countRows && typeof countRows === 'object' && 'rows' in countRows
          ? (countRows as { rows: CountRow[] }).rows
          : countRows
      ) as CountRow[];
      const countMap: Record<number, number> = {};
      for (const row of rows) {
        countMap[row.vendor_po_id] = Number(row.cnt);
      }
      // result is either an array of POs or a paginated { data: PO[], total: number } object
      const resultObj = result as { data?: { id: number }[] } | { id: number }[];
      if (Array.isArray(resultObj)) {
        return res.json(resultObj.map(po => ({ ...po, pendingReceiptCount: countMap[po.id] ?? 0 })));
      }
      const paginated = resultObj as { data: { id: number }[]; [key: string]: unknown };
      if (Array.isArray(paginated.data)) {
        return res.json({ ...paginated, data: paginated.data.map(po => ({ ...po, pendingReceiptCount: countMap[po.id] ?? 0 })) });
      }
      return res.json(result);
    } catch (_) {
      // Non-fatal: return result without pendingReceiptCount if count query fails
      return res.json(result);
    }
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

// GET /api/vendor-pos/settings - Get vendor PO settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await storage.getVendorPOSettings();
    if (!settings) {
      // Return default settings if none exist
      return res.json({
        termsAndConditions: '',
        paymentTerms: '',
        shippingInstructions: '',
      });
    }
    res.json(settings);
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
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = insertVendorPOSchema.parse(req.body);
    const vendorPO = await storage.createVendorPO(data);
    res.status(201).json(vendorPO);
  } catch (error) {
    console.error('Create vendor PO error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor PO data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create vendor PO' });
  }
});

// PUT /api/vendor-pos/:id - Update a vendor PO
// Note: Blocks edits on issued POs (status Sent or beyond) - use revisions instead
router.put('/:id', async (req: Request, res: Response) => {
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
    const data = insertVendorPOSchema.partial().parse(req.body);
    
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

    const vendorPO = await storage.updateVendorPO(id, data);

    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    res.json(vendorPO);
  } catch (error) {
    console.error('Update vendor PO error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor PO data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update vendor PO' });
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

// DELETE /api/vendor-pos/:id - Delete a vendor PO
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    await storage.deleteVendorPO(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete vendor PO error:', error);
    res.status(500).json({ error: 'Failed to delete vendor PO' });
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

    const item = await storage.createVendorPOItem(data);
    res.status(201).json(item);
  } catch (error) {
    console.error('Create vendor PO item error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor PO item data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create vendor PO item' });
  }
});

// PUT /api/vendor-pos/items/:itemId - Update a vendor PO item
router.put('/items/:itemId', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid vendor PO item ID' });
    }

    const data = insertVendorPOItemSchema.partial().parse(req.body);
    const item = await storage.updateVendorPOItem(itemId, data);

    if (!item) {
      return res.status(404).json({ error: 'Vendor PO item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Update vendor PO item error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor PO item data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update vendor PO item' });
  }
});

// DELETE /api/vendor-pos/items/:itemId - Delete a vendor PO item
router.delete('/items/:itemId', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid vendor PO item ID' });
    }

    await storage.deleteVendorPOItem(itemId);
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
    });

    const { receivedQuantity, receivedDate, notes, createdBy, cocLink, documentUrl } = receiveSchema.parse(req.body);

    // Record PO receipt and calculate COGS
    const result = await storage.recordVendorPOReceipt({
      poLineItemId: itemId,
      receivedQuantity,
      receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
      notes: documentUrl ? `${notes || ''} | Document: ${documentUrl}`.trim() : notes,
      createdBy,
      cocLink,
    });

    res.json(result);
  } catch (error) {
    console.error('Record PO receipt error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid receipt data', details: error.errors });
    }
    // Pass business logic errors (like validation failures) to the client with 400
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to record PO receipt' });
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

    await storage.updatePOOptionalSettings(vendorPoId, optionalSettingIds);
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

    if (vendorPO.status !== 'Draft') {
      return res.status(400).json({
        error: 'RFQ can only be sent from Draft status',
        message: `PO is currently in ${vendorPO.status} status`,
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

    const { recipients: rawRecipients } = req.body ?? {};
    const allowedEmails = await getAllowedVendorEmails(vendorPO.vendorId);
    const { to: rfqTo, cc: rfqCc } = deriveToAndCc(
      rawRecipients,
      vendor.email,
      allowedEmails,
      ['laurie@agcomposites.com']
    );

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
      triggeredBy: String((req as any).user?.id ?? (req as any).user?.username ?? 'unknown'),
      capabilityRequired: 'send_vendor_rfq',
      orderId: String(id),
    });

    if (!emailResult.success) {
      console.error('Failed to send RFQ email:', emailResult.error);
      return res.status(500).json({
        error: 'Failed to send RFQ email',
        message: emailResult.error || 'Email service unavailable. Please try again.',
        emailSent: false,
      });
    }

    // Update status to RFQ Sent (no PO number assigned — stays null)
    const updatedPO = await storage.updateVendorPO(id, { status: 'RFQ Sent' });

    console.log(`✅ RFQ sent to ${rfqTo} for vendor PO ID ${id} (cc: ${rfqCc.join(', ')})`);

    res.json({
      ...updatedPO,
      emailSent: true,
      emailRecipient: rfqTo,
      emailCc: rfqCc,
      message: `RFQ sent successfully to ${rfqTo}.`,
    });
  } catch (error) {
    console.error('Send RFQ error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to send RFQ' });
  }
});

// POST /api/vendor-pos/:id/issue - Issue a PO, optionally sending confirmation email to vendor
router.post('/:id/issue', async (req: Request, res: Response) => {
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
    if (vendorPO.status !== 'Draft' && vendorPO.status !== 'RFQ Sent') {
      return res.status(400).json({ 
        error: 'PO cannot be issued', 
        message: `PO is already in ${vendorPO.status} status` 
      });
    }

    const performedBy = String((req as any).user?.username ?? (req as any).user?.id ?? 'unknown');
    const performedByEmail = (req as any).user?.email as string | undefined;

    // ── PATH A: Issue WITHOUT emailing vendor (legacy/backfill) ──────────────
    if (skip) {
      const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
      if (trimmedReason.length < 10 || !/\S/.test(trimmedReason)) {
        return res.status(400).json({
          error: 'Reason required',
          message: 'Please provide a meaningful reason (at least 10 characters) for issuing without notifying the vendor.',
        });
      }

      const nowAt = new Date();
      const { vendorPO: issuedPO, poNumber } = await storage.issueVendorPO(id, {
        issuedWithoutEmail: true,
        reason: trimmedReason,
        issuedWithoutEmailAt: nowAt,
        performedBy,
        performedByEmail,
      });

      console.log(`[VendorPOIssuedNoEmail] PO ${poNumber} issued WITHOUT email by ${performedBy} — reason: ${trimmedReason}`);

      return res.json({
        ...issuedPO,
        emailSent: false,
        poNumber,
        message: 'PO marked as issued. Vendor was NOT notified.',
      });
    }

    // ── PATH B: Issue WITH vendor confirmation email (default path) ──────────
    const vendor = await storage.getVendor(vendorPO.vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    if (!vendor.email) {
      return res.status(400).json({ 
        error: 'Vendor email not configured',
        message: 'Please add a contact email for this vendor before issuing the PO.',
      });
    }

    // Atomic transactional issuance: lock row, generate number, update status
    const { vendorPO: issuedPO, poNumber } = await storage.issueVendorPO(id);

    // Generate magic link for PO confirmation
    const { link, expiresAt } = await generateMagicLink({
      email: vendor.email,
      purpose: 'vendor_po_confirmation',
      metadata: {
        vendorPoId: id,
        poNumber: poNumber,
        vendorId: vendor.id,
        vendorName: vendor.name,
      },
      expiresInMinutes: 60 * 24 * 7, // 7 days expiration
    });

    // Build standard CC list: always include laurie@agcomposites.com + issuing user's email
    const standardCc: string[] = ['laurie@agcomposites.com'];
    const issuingUserEmail = (req as any).user?.email as string | undefined;
    if (issuingUserEmail && !standardCc.map((c) => c.toLowerCase()).includes(issuingUserEmail.toLowerCase())) {
      standardCc.push(issuingUserEmail);
    }

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
      confirmation_link: link,
    };

    const emailResult = await sendCommunication({
      templateKey: 'vendor_po_issue',
      context: issueContext,
      to: issueToEmail,
      cc: issueCcList,
      triggeredBy: performedBy,
      capabilityRequired: 'issue_vendor_po',
      orderId: String(id),
    });

    if (!emailResult.success) {
      console.error('Failed to send PO confirmation email:', emailResult.error);
      return res.status(500).json({
        error: 'PO issued but confirmation email failed',
        message: emailResult.error || 'Email service unavailable. PO has been issued — you may resend the email later.',
        emailSent: false,
        poNumber,
      });
    }

    console.log(`[VendorPOIssuedEmailSent] PO ${poNumber} issued by ${performedBy} — email sent to ${issueToEmail}, cc: ${issueCcList.join(', ')}`);

    return res.json({
      ...issuedPO,
      emailSent: true,
      emailRecipient: issueToEmail,
      emailCc: issueCcList,
      confirmationLinkExpires: expiresAt,
      message: `PO issued successfully. Confirmation email sent to ${issueToEmail}.`,
    });
  } catch (error: any) {
    console.error('Issue vendor PO error:', error);
    if (error?.code === '23505' || error?.message?.includes('duplicate key') || error?.message?.includes('vendor_pos_po_number')) {
      return res.status(409).json({
        error: 'PO number conflict',
        message: 'A PO number conflict occurred. Please try again.',
      });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to issue vendor PO' });
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

    const { link, expiresAt } = await generateMagicLink({
      email: vendor.email,
      purpose: 'vendor_po_confirmation',
      metadata: {
        vendorPoId: id,
        poNumber: vendorPO.poNumber,
        vendorId: vendor.id,
        vendorName: vendor.name,
      },
      expiresInMinutes: 60 * 24 * 7,
    });

    const poNumber = vendorPO.poNumber;

    const standardResendCc: string[] = ['laurie@agcomposites.com'];
    const resendingUserEmail = (req as any).user?.email as string | undefined;
    if (resendingUserEmail && !standardResendCc.map((c) => c.toLowerCase()).includes(resendingUserEmail.toLowerCase())) {
      standardResendCc.push(resendingUserEmail);
    }

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
      confirmation_link: link,
    };

    const emailResult = await sendCommunication({
      templateKey: 'vendor_po_resend',
      context: resendContext,
      to: resendToEmail,
      cc: resendCcList,
      triggeredBy: String((req as any).user?.id ?? (req as any).user?.username ?? 'unknown'),
      capabilityRequired: 'resend_vendor_po',
      orderId: String(id),
    });

    if (!emailResult.success) {
      console.error('Failed to resend PO confirmation email:', emailResult.error);
      return res.status(500).json({
        error: 'Failed to resend PO confirmation email',
        message: emailResult.error || 'Email service unavailable.',
        emailSent: false,
      });
    }

    console.log(`[VendorPOResent] PO ${poNumber} resent by user ${(req as any).user?.username ?? 'unknown'} — email sent to ${resendToEmail}, cc: ${resendCcList.join(', ')}`);

    res.json({
      emailSent: true,
      emailRecipient: resendToEmail,
      emailCc: resendCcList,
      confirmationLinkExpires: expiresAt,
      message: `PO resent successfully. Confirmation email sent to ${resendToEmail}.`,
    });
  } catch (error) {
    console.error('Resend vendor PO error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to resend vendor PO' });
  }
});

export default router;
