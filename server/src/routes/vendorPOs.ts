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
import { generateMagicLink, getMagicLinkBaseUrl } from '../../utils/magicLink';
import { sendEmailViaSendGrid } from '../../utils/sendgrid';

const router = Router();

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
    res.json(result);
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

    // Fetch line items for the RFQ
    const items = await storage.getVendorPOItems(id);

    const subject = `Request for Quote from AG Composites`;

    const itemsTableRows = items.map((item: any) =>
      `<tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.lineNumber}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.supplierPartNumber || '-'}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.description || '-'}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.quantity != null ? Number(item.quantity).toFixed(2) : '0.00'}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.vendorUnit || item.uom || '-'}</td>
      </tr>`
    ).join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #e67e22;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #1a1a1a;
      font-size: 24px;
      margin: 0;
    }
    .content { margin-bottom: 30px; }
    .rfq-details {
      background-color: #fef9e7;
      border-radius: 6px;
      padding: 20px;
      margin: 20px 0;
    }
    .rfq-details p { margin: 5px 0; }
    .notice {
      background-color: #fef9e7;
      border-left: 4px solid #e67e22;
      padding: 12px;
      margin: 20px 0;
      font-size: 14px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 14px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Request for Quote</h1>
    </div>
    
    <div class="content">
      <p>Hello${vendor.contactPerson ? ` ${vendor.contactPerson}` : ''},</p>
      
      <p>AG Composites is requesting a quote for the following items. <strong>This is not a purchase order</strong> — we are seeking pricing and availability information.</p>
      
      <div class="rfq-details">
        <p><strong>Vendor:</strong> ${vendor.name}</p>
        ${vendorPO.expectedDeliveryDate ? `<p><strong>Desired Delivery Date:</strong> ${new Date(vendorPO.expectedDeliveryDate).toLocaleDateString()}</p>` : ''}
      </div>
      
      ${items.length > 0 ? `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Line</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Part #</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Description</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Qty</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Unit</th>
          </tr>
        </thead>
        <tbody>
          ${itemsTableRows}
        </tbody>
      </table>
      ` : '<p><em>No specific items listed. Please contact us for details.</em></p>'}
      
      <div class="notice">
        <strong>Note:</strong> This is a Request for Quote only. No commitment to purchase is implied. Please reply to this email with your pricing and availability.
      </div>
      
      <p>If you have any questions, please contact us at sales@agcomposites.com or call 256-723-8381.</p>
    </div>
    
    <div class="footer">
      <p>
        <strong>AG Composites</strong><br>
        230 Hamer Road<br>
        Owens Cross Roads, AL 35763<br>
        Phone: 256-723-8381<br>
        Email: sales@agcomposites.com
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const text = `
Request for Quote

Hello${vendor.contactPerson ? ` ${vendor.contactPerson}` : ''},

AG Composites is requesting a quote for the following items. This is NOT a purchase order — we are seeking pricing and availability information.

Vendor: ${vendor.name}
${vendorPO.expectedDeliveryDate ? `Desired Delivery Date: ${new Date(vendorPO.expectedDeliveryDate).toLocaleDateString()}` : ''}

${items.length > 0 ? items.map((item: any) => `- ${item.description || 'Item'}: Qty ${item.quantity || 0} ${item.vendorUnit || item.uom || ''}`).join('\n') : 'No specific items listed. Please contact us for details.'}

Note: This is a Request for Quote only. No commitment to purchase is implied.
Please reply to this email with your pricing and availability.

If you have any questions, please contact us at sales@agcomposites.com or call 256-723-8381.

---
AG Composites
230 Hamer Road
Owens Cross Roads, AL 35763
Phone: 256-723-8381
Email: sales@agcomposites.com
    `.trim();

    const emailResult = await sendEmailViaSendGrid({
      to: vendor.email,
      cc: 'laurie@agcomposites.com',
      subject,
      text,
      html,
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

    console.log(`✅ RFQ sent to ${vendor.email} for vendor PO ID ${id} (cc: laurie@agcomposites.com)`);

    res.json({
      ...updatedPO,
      emailSent: true,
      emailRecipient: vendor.email,
      emailCc: 'laurie@agcomposites.com',
      message: `RFQ sent successfully to ${vendor.email}.`,
    });
  } catch (error) {
    console.error('Send RFQ error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to send RFQ' });
  }
});

// POST /api/vendor-pos/:id/issue - Issue a PO and optionally send confirmation email with magic link
router.post('/:id/issue', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const { skipEmail } = req.body || {};

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

    // Get the vendor details
    const vendor = await storage.getVendor(vendorPO.vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // If skipEmail is true, use atomic transactional issuance (lock, generate number, update status)
    if (skipEmail) {
      const { vendorPO: updatedPO, poNumber } = await storage.issueVendorPO(id);
      console.log(`✅ PO ${poNumber} marked as issued (no email sent - manual entry mode)`);
      return res.json({
        ...updatedPO,
        emailSent: false,
        emailSkipped: true,
        message: `PO marked as issued successfully. No email was sent.`,
      });
    }

    // Check if vendor has an email (only required when sending email)
    if (!vendor.email) {
      return res.status(400).json({ 
        error: 'Vendor email not configured',
        message: 'Please add a contact email for this vendor before issuing the PO.'
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

    // Create confirmation page URL (the magic link will redirect here after verification)
    const baseUrl = getMagicLinkBaseUrl();
    
    // Generate email content
    const subject = `PO ${poNumber} from AG Composites - Confirmation Requested`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #0066cc;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #1a1a1a;
      font-size: 24px;
      margin: 0;
    }
    .content {
      margin-bottom: 30px;
    }
    .po-details {
      background-color: #f5f5f5;
      border-radius: 6px;
      padding: 20px;
      margin: 20px 0;
    }
    .po-details p {
      margin: 5px 0;
    }
    .button {
      display: inline-block;
      background-color: #0066cc;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 6px;
      font-weight: 600;
      text-align: center;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #0052a3;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 14px;
      color: #666;
    }
    .warning {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 12px;
      margin: 20px 0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Purchase Order Confirmation Request</h1>
    </div>
    
    <div class="content">
      <p>Hello${vendor.contactPerson ? ` ${vendor.contactPerson}` : ''},</p>
      
      <p>AG Composites has issued a new Purchase Order to your company. Please confirm receipt of this order by clicking the button below.</p>
      
      <div class="po-details">
        <p><strong>PO Number:</strong> ${poNumber}</p>
        <p><strong>Vendor:</strong> ${vendor.name}</p>
        ${issuedPO.expectedDeliveryDate ? `<p><strong>Requested Delivery Date:</strong> ${new Date(issuedPO.expectedDeliveryDate).toLocaleDateString()}</p>` : ''}
      </div>
      
      <div style="text-align: center;">
        <a href="${link}" class="button">Confirm PO Receipt</a>
      </div>
      
      <div class="warning">
        <strong>Important:</strong> This confirmation link will expire in 7 days. Please confirm your receipt as soon as possible.
      </div>
      
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #0066cc;">${link}</p>
      
      <p>If you have any questions about this order, please contact us at sales@agcomposites.com or call 256-723-8381.</p>
    </div>
    
    <div class="footer">
      <p>
        <strong>AG Composites</strong><br>
        230 Hamer Road<br>
        Owens Cross Roads, AL 35763<br>
        Phone: 256-723-8381<br>
        Email: sales@agcomposites.com
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const text = `
Purchase Order Confirmation Request

Hello${vendor.contactPerson ? ` ${vendor.contactPerson}` : ''},

AG Composites has issued a new Purchase Order to your company. Please confirm receipt of this order by clicking the link below.

PO Number: ${poNumber}
Vendor: ${vendor.name}
${issuedPO.expectedDeliveryDate ? `Requested Delivery Date: ${new Date(issuedPO.expectedDeliveryDate).toLocaleDateString()}` : ''}

Confirm your receipt: ${link}

This confirmation link will expire in 7 days. Please confirm your receipt as soon as possible.

If you have any questions about this order, please contact us at sales@agcomposites.com or call 256-723-8381.

---
AG Composites
230 Hamer Road
Owens Cross Roads, AL 35763
Phone: 256-723-8381
Email: sales@agcomposites.com
    `.trim();

    // Send email to vendor with CC to laurie@agcomposites.com
    const emailResult = await sendEmailViaSendGrid({
      to: vendor.email,
      cc: 'laurie@agcomposites.com',
      subject,
      text,
      html,
    });

    if (!emailResult.success) {
      console.error('Failed to send PO confirmation email:', emailResult.error);
      // PO is already issued (status = Sent) but email failed - report the failure
      return res.status(500).json({
        error: 'PO issued but confirmation email failed',
        message: emailResult.error || 'Email service unavailable. PO has been issued — you may resend the email later.',
        emailSent: false,
        poNumber,
      });
    }

    console.log(`✅ PO ${poNumber} issued and confirmation email sent to ${vendor.email} (cc: laurie@agcomposites.com)`);

    res.json({
      ...issuedPO,
      emailSent: true,
      emailRecipient: vendor.email,
      emailCc: 'laurie@agcomposites.com',
      confirmationLinkExpires: expiresAt,
      message: `PO issued successfully. Confirmation email sent to ${vendor.email}.`,
    });
  } catch (error) {
    console.error('Issue vendor PO error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to issue vendor PO' });
  }
});

export default router;
