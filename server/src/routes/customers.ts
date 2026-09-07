import { Router, Request, Response } from 'express';
import {
  insertCustomerSchema,
  insertCustomerAddressSchema,
  insertCommunicationLogSchema,
  insertP2CustomerSchema,
  insertCustomerContactSchema,
} from '@shared/schema';
import { requireExecutiveAccess } from '../middleware/requireExecutiveAccess';

import { storage } from '../../storage';
import { pool, db } from '../../db';
import { customerContacts, p2LayupSchedules, p2SerializedItems, insertP2PurchaseOrderSchema } from '../../schema';
import { eq, and, inArray, or } from 'drizzle-orm';
import { uploadMiddleware } from '../../utils/fileUpload';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import { softAuth } from '../../middleware/auth';
import { z } from 'zod';

const router = Router();

const customerContactUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required').optional(),
  title: z.string().nullable().optional(),
  email: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === '' ? null : val))
    .refine(
      (email) => !email || z.string().email().safeParse(email).success,
      { message: 'Invalid email format' }
    ),
  phone: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
  receivesInvoices: z.boolean().optional(),
  invoiceDeliveryRole: z.enum(['TO', 'CC']).optional(),
  receivesShippingNotifications: z.boolean().optional(),
  receivesOrderConfirmations: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sendCustomerContactDatabaseError(res: Response, error: unknown, action: string): boolean {
  const dbError = error as { code?: string; message?: string };

  if (dbError.code === '42P01') {
    res.status(503).json({
      error: 'Customer contacts are not available yet. Run the latest database migrations, then try again.',
      detail: 'Missing customer_contacts table',
    });
    return true;
  }

  if (dbError.code === '23503') {
    res.status(404).json({ error: 'Customer not found for this contact' });
    return true;
  }

  console.error(`${action} customer contact database error:`, {
    code: dbError.code,
    message: dbError.message,
  });
  return false;
}

// P2 Customers Management - Bypass route (must be before parameterized routes)
// SECURITY: softAuth enforces authentication in production
router.get('/p2-customers-bypass', softAuth, async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    console.log('🔧 P2 CUSTOMERS BYPASS ROUTE CALLED, includeInactive:', includeInactive);
    const p2Customers = await storage.getAllP2Customers(includeInactive);
    console.log('🔧 Found P2 customers:', p2Customers.length);
    res.json(p2Customers);
  } catch (error) {
    console.error('Get P2 customers error:', error);
    res.status(500).json({ error: 'Failed to fetch P2 customers' });
  }
});

// P2 Purchase Orders Bypass Routes (to avoid monolithic route conflicts)
// SECURITY: softAuth enforces authentication in production
router.get(
  '/p2-purchase-orders-bypass',
  softAuth,
  async (req: Request, res: Response) => {
    try {
      console.log('🔧 DIRECT P2 PURCHASE ORDERS BYPASS ROUTE CALLED');
      const pos = await storage.getAllP2PurchaseOrders();
      console.log('🔧 Found P2 purchase orders:', pos.length);
      res.json(pos);
    } catch (error) {
      console.error('🔧 P2 purchase orders bypass error:', error);
      res
        .status(500)
        .json({ error: 'Failed to fetch P2 purchase orders via bypass route' });
    }
  }
);

// SECURITY: softAuth enforces authentication in production
router.post(
  '/p2-purchase-orders-bypass',
  softAuth,
  async (req: Request, res: Response) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER CREATE BYPASS ROUTE CALLED');
      console.log('🔧 Request body:', JSON.stringify(req.body, null, 2));
      
      const { customerId, customerPONumber, dueDate, toleranceAuthorizerId, toleranceAuthorizerName, toleranceNotes, notes, lineItems } = req.body;
      
      // Get customer info
      const customer = await storage.getP2Customer(customerId);
      if (!customer) {
        return res.status(400).json({ error: 'Customer not found' });
      }
      
      // Use the customer-provided PO number directly
      const poNumber = customerPONumber;
      
      // Build the complete PO data with all required fields
      const poData = {
        poNumber,
        customerId: customer.customerId,
        customerName: customer.customerName,
        poDate: new Date().toISOString().split('T')[0],
        expectedDelivery: dueDate,
        status: 'OPEN',
        notes: notes || toleranceNotes || null,
        toleranceAuthorizerId: toleranceAuthorizerId || null,
        toleranceAuthorizerName: toleranceAuthorizerName || null,
        toleranceNotes: toleranceNotes || null,
      };
      
      console.log('🔧 Creating PO with complete data:', JSON.stringify(poData, null, 2));
      const po = await storage.createP2PurchaseOrder(poData);
      console.log('🔧 Created P2 purchase order:', po.id, po.poNumber);
      
      // Create line items if provided
      if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
        console.log('🔧 Creating line items:', lineItems.length);
        for (const item of lineItems) {
          await storage.createP2PurchaseOrderItem({
            poId: po.id,
            partNumber: item.partNumber,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice || 0,
          });
        }
      }
      
      res.status(201).json(po);
    } catch (error: any) {
      console.error('🔧 P2 purchase order create bypass error:', error);
      console.error('🔧 Error message:', error?.message);
      console.error('🔧 Error stack:', error?.stack);
      res
        .status(500)
        .json({ 
          error: 'Failed to create P2 purchase order via bypass route',
          message: error?.message || 'Unknown error',
          details: error?.detail || error?.code || null
        });
    }
  }
);

// SECURITY: softAuth enforces authentication in production
router.put(
  '/p2-purchase-orders-bypass/:id',
  softAuth,
  async (req: Request, res: Response) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER UPDATE BYPASS ROUTE CALLED');
      const { id } = req.params;
      
      const validation = insertP2PurchaseOrderSchema.partial().safeParse(req.body);
      if (!validation.success) {
        console.error('🔧 P2 PO update validation error:', validation.error.format());
        return res.status(400).json({ 
          error: 'Invalid P2 purchase order update data',
          details: validation.error.format()
        });
      }
      
      const po = await storage.updateP2PurchaseOrder(parseInt(id), validation.data);
      console.log('🔧 Updated P2 purchase order:', po.id);
      res.json(po);
    } catch (error) {
      console.error('🔧 P2 purchase order update bypass error:', error);
      res
        .status(500)
        .json({ error: 'Failed to update P2 purchase order via bypass route' });
    }
  }
);

// SECURITY: softAuth enforces authentication in production
router.delete(
  '/p2-purchase-orders-bypass/:id',
  softAuth,
  async (req: Request, res: Response) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER DELETE BYPASS ROUTE CALLED');
      const { id } = req.params;
      await storage.deleteP2PurchaseOrder(parseInt(id));
      console.log('🔧 Deleted P2 purchase order:', id);
      res.json({ success: true });
    } catch (error) {
      console.error('🔧 P2 purchase order delete bypass error:', error);
      res
        .status(500)
        .json({ error: 'Failed to delete P2 purchase order via bypass route' });
    }
  }
);

// Bypass route to get all customers
// SECURITY: softAuth enforces authentication in production
router.get('/bypass', softAuth, async (req: Request, res: Response) => {
  try {
    console.log('🔧 CUSTOMERS BYPASS ROUTE CALLED');
    const customers = await storage.getAllCustomers();
    console.log('🔧 Found customers:', customers.length);
    res.json(customers);
  } catch (error) {
    console.error('🔧 Get customers bypass error:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch customers via bypass route' });
  }
});

// Regular Customers Management
router.get('/', async (req: Request, res: Response) => {
  try {
    const customers = await storage.getAllCustomers();
    res.json(customers);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

router.get('/with-pos', async (req: Request, res: Response) => {
  try {
    const customers = await storage.getCustomersWithPurchaseOrders();
    res.json(customers);
  } catch (error) {
    console.error('Get customers with POs error:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch customers with purchase orders' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const customers = await storage.searchCustomers(query);
    res.json(customers);
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({ error: 'Failed to search customers' });
  }
});

// RFQ Risk Assessment Routes (must come before /:id route to avoid conflicts)
router.post('/rfq-assessments', async (req: Request, res: Response) => {
  try {
    const assessmentData = req.body;
    
    // Validate that rfqNumber is provided (it should have been generated via GET /:customerId/rfq-next-number)
    if (!assessmentData.rfqNumber) {
      return res.status(400).json({ error: 'RFQ number is required' });
    }
    
    const customer = await storage.getP2CustomerByCustomerId(assessmentData.customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Use the RFQ number that was already generated and reserved
    const newAssessment = await storage.createRFQRiskAssessment({
      rfqNumber: assessmentData.rfqNumber,
      customerId: assessmentData.customerId,
      customerName: customer.customerName,
      description: assessmentData.description,
      formData: assessmentData.formData,
      totalOverallPoints: assessmentData.totalOverallPoints,
      adjustedRiskLevel: assessmentData.adjustedRiskLevel,
      riskDetermination: assessmentData.riskDetermination,
      bidDecision: assessmentData.bidDecision,
    });
    
    res.status(201).json(newAssessment);
  } catch (error) {
    console.error('Create RFQ risk assessment error:', error);
    res.status(500).json({ error: 'Failed to create RFQ risk assessment' });
  }
});

router.get('/rfq-assessments', async (req: Request, res: Response) => {
  try {
    const assessments = await storage.getAllRFQRiskAssessments();
    res.json(assessments);
  } catch (error) {
    console.error('Get RFQ risk assessments error:', error);
    res.status(500).json({ error: 'Failed to fetch RFQ risk assessments' });
  }
});

router.get('/rfq-assessments/:rfqNumber', async (req: Request, res: Response) => {
  try {
    const { rfqNumber } = req.params;
    const assessment = await storage.getRFQRiskAssessment(rfqNumber);
    
    if (!assessment) {
      return res.status(404).json({ error: 'RFQ risk assessment not found' });
    }
    
    res.json(assessment);
  } catch (error) {
    console.error('Get RFQ risk assessment error:', error);
    res.status(500).json({ error: 'Failed to fetch RFQ risk assessment' });
  }
});

router.put('/rfq-assessments/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const assessmentData = req.body;
    
    // Get the customer name if customerId is provided
    let customerName = assessmentData.customerName;
    if (assessmentData.customerId && !customerName) {
      const customer = await storage.getP2CustomerByCustomerId(assessmentData.customerId);
      if (customer) {
        customerName = customer.customerName;
      }
    }
    
    const updatedAssessment = await storage.updateRFQRiskAssessment(id, {
      customerId: assessmentData.customerId,
      customerName: customerName,
      description: assessmentData.description,
      formData: assessmentData.formData,
      totalOverallPoints: assessmentData.totalOverallPoints,
      adjustedRiskLevel: assessmentData.adjustedRiskLevel,
      riskDetermination: assessmentData.riskDetermination,
      bidDecision: assessmentData.bidDecision,
    });
    
    if (!updatedAssessment) {
      return res.status(404).json({ error: 'RFQ risk assessment not found' });
    }
    
    res.json(updatedAssessment);
  } catch (error) {
    console.error('Update RFQ risk assessment error:', error);
    res.status(500).json({ error: 'Failed to update RFQ risk assessment' });
  }
});

router.put('/rfq-assessments/:id/submit', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    // Debug logging
    console.log('🔍 RFQ Submit - Cookies:', req.cookies);
    console.log('🔍 RFQ Submit - Headers:', req.headers);
    
    // Extract session token from cookies or authorization header
    const sessionToken =
      req.cookies?.sessionToken ||
      req.headers.authorization?.replace('Bearer ', '');

    console.log('🔍 RFQ Submit - Session Token:', sessionToken ? 'Found' : 'Not found');

    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Query database for session to get authenticated username
    const result: any = await pool.query(
      'SELECT user_id, username, expires_at FROM user_sessions WHERE session_token = $1',
      [sessionToken]
    );

    console.log('🔍 RFQ Submit - DB Query Result:', {
      result: result,
      rowCount: result.rowCount,
      rows: result.rows,
      hasRows: !!result.rows,
      rowsLength: result.rows?.length,
      isArray: Array.isArray(result),
      resultLength: result.length
    });

    // Handle both result formats (some pools return result.rows, others return array directly)
    const rows = Array.isArray(result) ? result : result.rows;
    
    if (!rows || rows.length === 0) {
      console.log('❌ RFQ Submit - No session found in database');
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { username, expires_at } = rows[0];

    console.log('🔍 RFQ Submit - Session found:', {
      username,
      expires_at,
      isExpired: new Date(expires_at) < new Date()
    });

    // Check if session has expired
    if (new Date(expires_at) < new Date()) {
      console.log('❌ RFQ Submit - Session expired');
      return res.status(401).json({ error: 'Session expired' });
    }
    
    // Submit the assessment with the authenticated username
    const submittedAssessment = await storage.submitRFQRiskAssessment(id, username);
    
    if (!submittedAssessment) {
      return res.status(404).json({ error: 'RFQ risk assessment not found' });
    }
    
    res.json(submittedAssessment);
  } catch (error) {
    console.error('Submit RFQ risk assessment error:', error);
    res.status(500).json({ error: 'Failed to submit RFQ risk assessment' });
  }
});

// RFQ Risk Assessment PDF Attachments
const rfqAttachmentsDir = path.join(process.cwd(), 'uploads', 'rfq-attachments');
if (!fs.existsSync(rfqAttachmentsDir)) {
  fs.mkdirSync(rfqAttachmentsDir, { recursive: true });
}

// Create dedicated multer instance for RFQ attachments
const rfqAttachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, rfqAttachmentsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${timestamp}_${hash}_${name}${ext}`);
  },
});

const rfqUpload = multer({
  storage: rfqAttachmentStorage,
  fileFilter: (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5,
  },
});

router.post('/rfq-assessments/:id/attachments', rfqUpload.array('files', 5), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Get the current assessment by ID
    const assessment = await storage.getRFQRiskAssessmentById(id);
    if (!assessment) {
      return res.status(404).json({ error: 'RFQ Risk Assessment not found' });
    }

    // Files are already saved in the correct directory by multer
    // Just collect the file paths
    const uploadedFiles: string[] = files.map(file => file.path);

    // Update assessment with new attachment paths
    const currentAttachments = assessment.attachments || [];
    const updatedAttachments = [...currentAttachments, ...uploadedFiles];

    const updatedAssessment = await storage.updateRFQRiskAssessment(id, {
      attachments: updatedAttachments,
    });

    res.json({
      message: 'Files uploaded successfully',
      attachments: updatedAttachments,
      assessment: updatedAssessment,
    });
  } catch (error) {
    console.error('Upload RFQ attachment error:', error);
    res.status(500).json({ error: 'Failed to upload attachments' });
  }
});

router.delete('/rfq-assessments/:id/attachments/:fileName', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { fileName } = req.params;

    // Get the current assessment
    const assessment = await storage.getRFQRiskAssessment(id.toString());
    if (!assessment) {
      return res.status(404).json({ error: 'RFQ Risk Assessment not found' });
    }

    // Remove the file from attachments array
    const currentAttachments = assessment.attachments || [];
    const updatedAttachments = currentAttachments.filter(
      (filePath) => !filePath.includes(fileName)
    );

    // Delete the physical file
    const fileToDelete = currentAttachments.find((filePath) =>
      filePath.includes(fileName)
    );
    if (fileToDelete && fs.existsSync(fileToDelete)) {
      fs.unlinkSync(fileToDelete);
    }

    // Update assessment
    const updatedAssessment = await storage.updateRFQRiskAssessment(id, {
      attachments: updatedAttachments,
    });

    res.json({
      message: 'Attachment deleted successfully',
      assessment: updatedAssessment,
    });
  } catch (error) {
    console.error('Delete RFQ attachment error:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

router.get('/rfq-assessments/:id/attachments/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    const filePath = path.join(rfqAttachmentsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Download RFQ attachment error:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// RFQ Risk Assessment PDF Generation
router.get('/rfq-assessments/blank/pdf', async (_req: Request, res: Response) => {
  try {
    const { generateBlankRfqRiskAssessmentPdf } = await import('../services/blankRfqRiskAssessmentPdf');
    const pdfBytes = await generateBlankRfqRiskAssessmentPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Blank_RFQ_Risk_Assessment.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Generate blank RFQ PDF error:', error);
    res.status(500).json({ error: 'Failed to generate blank RFQ assessment PDF' });
  }
});

router.get('/rfq-assessments/:id/pdf', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const assessment = await storage.getRFQRiskAssessmentById(id);

    if (!assessment) {
      return res.status(404).json({ error: 'RFQ Risk Assessment not found' });
    }

    const { generateRfqRiskAssessmentPdf } = await import('../services/blankRfqRiskAssessmentPdf');
    const pdfBytes = await generateRfqRiskAssessmentPdf(assessment as any);
    const safeRfqNumber = String(assessment.rfqNumber || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="RFQ_${safeRfqNumber}_Risk_Assessment.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Generate RFQ PDF error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Retained temporarily for direct comparison while the unified FO Form 11 renderer is adopted.
router.get('/rfq-assessments/:id/pdf-legacy', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const assessment = await storage.getRFQRiskAssessmentById(id);
    
    if (!assessment) {
      return res.status(404).json({ error: 'RFQ Risk Assessment not found' });
    }

    // Load RFQ template (if available)
    const {
      loadActiveTemplate,
      embedTemplateLogo,
      getTemplateFontSizes,
      getTemplateSpacing,
      getTemplateColors,
      getTemplateLineHeights,
      getTemplateCompanyInfo,
      getTemplateMargins,
    } = await import('../../utils/pdf/templateLoader');
    
    const template = await loadActiveTemplate('rfq_risk_assessment');
    console.log('📄 [RFQ PDF] Using template:', template?.name || 'Default');

    // Import PDF generation utilities
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const { PAGE_SIZES, getPrintableArea } = await import('../../utils/pdf/pdfConfig');
    
    // Get template-specific or default settings
    const MARGINS = getTemplateMargins(template);
    const FONT_SIZES = getTemplateFontSizes(template);
    const SPACING = getTemplateSpacing(template);
    const COLORS = getTemplateColors(template);
    const LINE_HEIGHTS = getTemplateLineHeights(template);
    const COMPANY_INFO = getTemplateCompanyInfo(template);
    const LOGO_CONFIG = { WIDTH: 150, VERTICAL_SPACING: 15 };
    
    const DEFAULT_MARGIN = MARGINS.STANDARD;

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Embed logo once and reuse (performance + layout fix)
    const embeddedLogo = await embedTemplateLogo(pdfDoc, template);

    // Initialize first page
    let page = pdfDoc.addPage(PAGE_SIZES.LETTER_PORTRAIT);
    const pageSize = page.getSize();
    let dims = getPrintableArea(pageSize.width, pageSize.height);
    let currentY = dims.margin + dims.height;
    
    // Shared header drawing function (reuses embedded logo)
    const drawTemplateHeader = () => {
      currentY = dims.margin + dims.height;
      if (embeddedLogo) {
        const logoWidth = LOGO_CONFIG.WIDTH;
        const logoHeight = logoWidth * (embeddedLogo.height / embeddedLogo.width);
        
        page.drawImage(embeddedLogo, {
          x: dims.margin,
          y: currentY - logoHeight,
          width: logoWidth,
          height: logoHeight,
        });
        
        currentY -= logoHeight + LOGO_CONFIG.VERTICAL_SPACING;
        page.drawText(COMPANY_INFO.ADDRESS, {
          x: dims.margin,
          y: currentY,
          size: FONT_SIZES.BODY_SMALL,
          font: regularFont,
          color: COLORS.TEXT_SECONDARY,
        });
        currentY -= LINE_HEIGHTS.COMPACT;
        page.drawText(`Phone: ${COMPANY_INFO.PHONE} | Email: ${COMPANY_INFO.EMAIL}`, {
          x: dims.margin,
          y: currentY,
          size: FONT_SIZES.BODY_SMALL,
          font: regularFont,
          color: COLORS.TEXT_SECONDARY,
        });
        currentY -= SPACING.SECTION_GAP_SMALL;
      } else {
        page.drawText(COMPANY_INFO.NAME, {
          x: dims.margin,
          y: currentY,
          size: FONT_SIZES.TITLE_LARGE,
          font: boldFont,
          color: COLORS.TEXT_PRIMARY,
        });
        currentY -= SPACING.SECTION_GAP_SMALL;
      }
    };
    
    // Draw initial header
    drawTemplateHeader();

    // Shared startNewPage helper
    const startNewPage = () => {
      page = pdfDoc.addPage(PAGE_SIZES.LETTER_PORTRAIT);
      const pageSize = page.getSize();
      dims = getPrintableArea(pageSize.width, pageSize.height);
      drawTemplateHeader();
    };

    // Shared checkNewPage helper
    const checkNewPage = async (requiredSpace: number) => {
      if (currentY - requiredSpace < dims.margin) {
        await startNewPage();
      }
    };
    
    // Helper functions for drawing (template-aware wrappers matching pdfConfig signatures)
    const wrapText = (text: string, maxWidth: number, fontSize: number, font: any): string[] => {
      const paragraphs = text.split(/\r?\n/);
      const allLines: string[] = [];
      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
          allLines.push('');
          continue;
        }
        const words = paragraph.split(' ');
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testWidth = font.widthOfTextAtSize(testLine, fontSize);
          if (testWidth > maxWidth && currentLine) {
            allLines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          allLines.push(currentLine);
        }
      }
      return allLines;
    };
    
    const drawSectionHeader = (pg: any, text: string, x: number, y: number, font: any): number => {
      pg.drawText(text, {
        x,
        y,
        size: FONT_SIZES.SECTION_HEADER,
        font,
        color: COLORS.TEXT_PRIMARY,
      });
      return LINE_HEIGHTS.SECTION;
    };
    
    const drawKeyValuePair = (pg: any, key: string, value: string, x: number, y: number, regFont: any, boldFontParam?: any): number => {
      pg.drawText(`${key}: ${value}`, {
        x,
        y,
        size: FONT_SIZES.BODY_MEDIUM,
        font: boldFontParam || regFont,
      });
      return LINE_HEIGHTS.BODY;
    };
    
    const drawInfoBox = (pg: any, x: number, y: number, width: number, height: number, title?: string, font?: any) => {
      pg.drawRectangle({
        x,
        y,
        width,
        height,
        borderColor: COLORS.BORDER_BLACK,
        borderWidth: 1,
      });
      if (title && font) {
        pg.drawText(title, {
          x,
          y: y + height + SPACING.LINE_SPACING_SMALL,
          size: FONT_SIZES.TITLE_MEDIUM,
          font,
          color: COLORS.TEXT_PRIMARY,
        });
      }
    };

    // Document title
    const titleText = 'RFQ Risk Assessment';
    const titleWidth = boldFont.widthOfTextAtSize(titleText, FONT_SIZES.TITLE_LARGE);
    page.drawText(titleText, {
      x: (dims.width / 2) - (titleWidth / 2) + dims.margin,
      y: currentY,
      size: FONT_SIZES.TITLE_LARGE,
      font: boldFont,
      color: COLORS.TEXT_PRIMARY,
    });
    currentY -= SPACING.SECTION_GAP_LARGE;

    // RFQ Information
    const formData: any = assessment.formData || {};
    
    await checkNewPage(LINE_HEIGHTS.BODY * 3);
    
    page.drawText(`RFQ Number: ${assessment.rfqNumber || 'N/A'}`, {
      x: dims.margin,
      y: currentY,
      size: FONT_SIZES.BODY_LARGE,
      font: boldFont,
    });
    currentY -= LINE_HEIGHTS.BODY;
    
    page.drawText(`Customer: ${assessment.customerName || formData.customerName || 'N/A'}`, {
      x: dims.margin,
      y: currentY,
      size: FONT_SIZES.BODY_LARGE,
      font: regularFont,
    });
    currentY -= LINE_HEIGHTS.BODY;
    
    // Description with text wrapping
    if (assessment.description || formData.description) {
      const descriptionText = assessment.description || formData.description;
      const descLines = wrapText(`Description: ${descriptionText}`, dims.width, FONT_SIZES.BODY_MEDIUM, regularFont);
      
      await checkNewPage(descLines.length * LINE_HEIGHTS.BODY + SPACING.SECTION_GAP_MEDIUM);
      
      for (const line of descLines) {
        page.drawText(line, {
          x: dims.margin,
          y: currentY,
          size: FONT_SIZES.BODY_MEDIUM,
          font: regularFont,
        });
        currentY -= LINE_HEIGHTS.BODY;
      }
      currentY -= SPACING.SECTION_GAP_SMALL;
    }

    // Helper to get risk level display
    const getRiskDisplay = (value: string) => {
      if (!value) return 'Not specified';
      return value.charAt(0).toUpperCase() + value.slice(1);
    };

    // Section renderer: Risk section with per-row pagination
    const renderRiskSection = async (title: string, risks: Array<{label: string, value: string}>) => {
      // Check space for header
      await checkNewPage(LINE_HEIGHTS.SECTION);
      
      // Draw section header using shared helper
      const headerHeight = drawSectionHeader(page, title, dims.margin, currentY, boldFont);
      currentY -= headerHeight;

      // Draw each risk row with individual pagination check
      for (const risk of risks) {
        await checkNewPage(LINE_HEIGHTS.BODY);
        const value = getRiskDisplay(risk.value);
        const rowHeight = drawKeyValuePair(page, risk.label, value, dims.margin + 20, currentY, regularFont);
        currentY -= rowHeight;
      }
      
      currentY -= SPACING.SECTION_GAP_SMALL;
    };

    // Internal Risks
    const internalRisks = [
      { label: 'Trained Staff', value: formData.trainedStaff },
      { label: 'Equipment Requirements', value: formData.equipmentRequirements },
      { label: 'Manufacturing Space', value: formData.manufacturingSpace },
      { label: 'Regulatory Requirements', value: formData.regulatoryRequirements },
      { label: 'Conflicting Priorities', value: formData.conflictingPriorities },
      { label: 'Customer Concentration', value: formData.customerConcentration },
      { label: 'Climate/Environmental', value: formData.climateEnvironmental },
    ];
    
    await renderRiskSection('Internal Risks', internalRisks);
    
    await checkNewPage(LINE_HEIGHTS.BODY);
    drawKeyValuePair(page, 'Internal Subtotal', `${formData.internalSubtotal || 0} points`, dims.margin + 20, currentY, regularFont, boldFont);
    currentY -= LINE_HEIGHTS.BODY + SPACING.SECTION_GAP_MEDIUM;

    // External Risks
    const externalRisks = [
      { label: 'Supply Chain Disruptions', value: formData.supplyChainDisruptions },
      { label: 'Supplier Variability', value: formData.supplierVariability },
      { label: 'Contract Provisions', value: formData.contractProvisions },
      { label: 'Timelines', value: formData.timelines },
      { label: 'Quality Expectations', value: formData.qualityExpectations },
    ];
    
    await renderRiskSection('External Risks', externalRisks);
    
    await checkNewPage(LINE_HEIGHTS.BODY);
    drawKeyValuePair(page, 'External Subtotal', `${formData.externalSubtotal || 0} points`, dims.margin + 20, currentY, regularFont, boldFont);
    currentY -= LINE_HEIGHTS.BODY + SPACING.SECTION_GAP_MEDIUM;

    // Section renderer: Mitigation Actions with per-line pagination
    const renderMitigationActions = async () => {
      const actions = [
        { label: 'Action A', action: formData.mitigationActionA, reduction: formData.mitigationReductionA },
        { label: 'Action B', action: formData.mitigationActionB, reduction: formData.mitigationReductionB },
        { label: 'Action C', action: formData.mitigationActionC, reduction: formData.mitigationReductionC },
      ].filter(a => a.action && a.action !== 'n/a');
      
      if (actions.length === 0) return;
      
      // Check space for header
      await checkNewPage(LINE_HEIGHTS.SECTION);
      
      // Draw section header using shared helper
      const headerHeight = drawSectionHeader(page, 'Mitigation Actions', dims.margin, currentY, boldFont);
      currentY -= headerHeight;
      
      // Draw each mitigation action with per-line pagination
      for (const action of actions) {
        const lines = wrapText(
          `${action.label}: ${action.action} (Risk Reduction: ${action.reduction || 0} points)`,
          dims.width - 20,
          FONT_SIZES.BODY_MEDIUM,
          regularFont
        );
        
        for (const line of lines) {
          await checkNewPage(LINE_HEIGHTS.BODY);
          page.drawText(line, {
            x: dims.margin + 20,
            y: currentY,
            size: FONT_SIZES.BODY_MEDIUM,
            font: regularFont,
          });
          currentY -= LINE_HEIGHTS.BODY;
        }
      }
      
      currentY -= SPACING.SECTION_GAP_SMALL;
    };
    
    await renderMitigationActions();

    // Section renderer: Risk Summary Box
    const renderSummaryBox = async () => {
      const boxHeight = 100;
      await checkNewPage(boxHeight + SPACING.SECTION_GAP_MEDIUM);
      
      currentY -= SPACING.SECTION_GAP_SMALL;
      
      // Use shared drawInfoBox helper
      drawInfoBox(page, dims.margin, currentY - boxHeight, dims.width, boxHeight);
      
      // Draw summary content
      let boxY = currentY - 15;
      page.drawText(`Total Overall Points: ${assessment.totalOverallPoints || 0}`, {
        x: dims.margin + 10,
        y: boxY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
      });
      boxY -= LINE_HEIGHTS.BODY;

      page.drawText(`Adjusted Risk Level: ${assessment.adjustedRiskLevel || 0}`, {
        x: dims.margin + 10,
        y: boxY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
      });
      boxY -= LINE_HEIGHTS.BODY;

      page.drawText(`Risk Determination: ${assessment.riskDetermination || 'N/A'}`, {
        x: dims.margin + 10,
        y: boxY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: assessment.riskDetermination?.includes('High') ? COLORS.ACCENT_RED : COLORS.TEXT_PRIMARY,
      });
      boxY -= LINE_HEIGHTS.BODY;

      if (assessment.bidDecision) {
        page.drawText(`Bid Decision: ${assessment.bidDecision}`, {
          x: dims.margin + 10,
          y: boxY,
          size: FONT_SIZES.BODY_LARGE,
          font: boldFont,
        });
      }

      currentY -= boxHeight + SPACING.SECTION_GAP_MEDIUM;
    };
    
    await renderSummaryBox();

    // Section renderer: Signature
    const renderSignature = async () => {
      if (!formData.signature && !formData.printedName && !formData.date) return;
      
      const requiredSpace = LINE_HEIGHTS.SECTION + (3 * LINE_HEIGHTS.BODY);
      await checkNewPage(requiredSpace);
      
      // Draw section header using shared helper
      const headerHeight = drawSectionHeader(page, 'Approval Signature', dims.margin, currentY, boldFont);
      currentY -= headerHeight;

      if (formData.printedName) {
        drawKeyValuePair(page, 'Name', formData.printedName, dims.margin + 20, currentY, regularFont);
        currentY -= LINE_HEIGHTS.BODY;
      }

      if (formData.date) {
        drawKeyValuePair(page, 'Date', formData.date, dims.margin + 20, currentY, regularFont);
        currentY -= LINE_HEIGHTS.BODY;
      }

      if (formData.signature) {
        page.drawText('[Digital Signature Present]', {
          x: dims.margin + 20,
          y: currentY,
          size: FONT_SIZES.BODY_SMALL,
          font: regularFont,
          color: COLORS.TEXT_SECONDARY,
        });
      }
    };
    
    await renderSignature();

    // Footer on all pages
    const pages = pdfDoc.getPages();
    pages.forEach((pg, index) => {
      const footerY = 40;
      const footerText = `FO Form 11 • Version 1.4 10/23/2024 • Page ${index + 1} of ${pages.length}`;
      const footerWidth = regularFont.widthOfTextAtSize(footerText, FONT_SIZES.BODY_SMALL);
      const pageWidth = pg.getSize().width;
      pg.drawText(footerText, {
        x: (pageWidth - footerWidth) / 2,
        y: footerY,
        size: FONT_SIZES.BODY_SMALL,
        font: regularFont,
        color: COLORS.TEXT_TERTIARY,
      });
    });

    // Serialize the PDF
    const pdfBytes = await pdfDoc.save();

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="RFQ_${assessment.rfqNumber}_Risk_Assessment.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Generate RFQ PDF error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

router.get('/:id/contacts', softAuth, async (req: Request, res: Response) => {
  try {
    const customerId = parsePositiveInt(req.params.id);
    if (!customerId) {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }

    const contacts = await db
      .select()
      .from(customerContacts)
      .where(eq(customerContacts.customerId, customerId))
      .orderBy(customerContacts.name);

    res.json(contacts);
  } catch (error) {
    console.error('Get customer contacts error:', error);
    if (sendCustomerContactDatabaseError(res, error, 'Get')) return;
    res.status(500).json({ error: 'Failed to fetch customer contacts' });
  }
});

router.post('/:id/contacts', softAuth, async (req: Request, res: Response) => {
  try {
    const customerId = parsePositiveInt(req.params.id);
    if (!customerId) {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }

    const contactData = insertCustomerContactSchema.parse({
      ...req.body,
      customerId,
    });

    const [contact] = await db.transaction(async (tx) => {
      if (contactData.isPrimary) {
        await tx
          .update(customerContacts)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(eq(customerContacts.customerId, customerId));
      }

      return tx.insert(customerContacts).values(contactData).returning();
    });

    res.status(201).json(contact);
  } catch (error) {
    console.error('Create customer contact error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid contact data', issues: error.errors });
    }
    if (sendCustomerContactDatabaseError(res, error, 'Create')) return;
    res.status(500).json({ error: 'Failed to create customer contact' });
  }
});

router.put('/:id/contacts/:contactId', softAuth, async (req: Request, res: Response) => {
  try {
    const customerId = parsePositiveInt(req.params.id);
    const contactId = parsePositiveInt(req.params.contactId);
    if (!customerId || !contactId) {
      return res.status(400).json({ error: 'Invalid customer contact ID' });
    }

    const updates = customerContactUpdateSchema.parse(req.body);

    const [contact] = await db.transaction(async (tx) => {
      if (updates.isPrimary) {
        await tx
          .update(customerContacts)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(eq(customerContacts.customerId, customerId));
      }

      return tx
        .update(customerContacts)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(customerContacts.id, contactId), eq(customerContacts.customerId, customerId)))
        .returning();
    });

    if (!contact) {
      return res.status(404).json({ error: 'Customer contact not found' });
    }

    res.json(contact);
  } catch (error) {
    console.error('Update customer contact error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid contact data', issues: error.errors });
    }
    if (sendCustomerContactDatabaseError(res, error, 'Update')) return;
    res.status(500).json({ error: 'Failed to update customer contact' });
  }
});

router.delete('/:id/contacts/:contactId', softAuth, async (req: Request, res: Response) => {
  try {
    const customerId = parsePositiveInt(req.params.id);
    const contactId = parsePositiveInt(req.params.contactId);
    if (!customerId || !contactId) {
      return res.status(400).json({ error: 'Invalid customer contact ID' });
    }

    const [deleted] = await db
      .delete(customerContacts)
      .where(and(eq(customerContacts.id, contactId), eq(customerContacts.customerId, customerId)))
      .returning({ id: customerContacts.id });

    if (!deleted) {
      return res.status(404).json({ error: 'Customer contact not found' });
    }

    res.status(204).end();
  } catch (error) {
    console.error('Delete customer contact error:', error);
    if (sendCustomerContactDatabaseError(res, error, 'Delete')) return;
    res.status(500).json({ error: 'Failed to delete customer contact' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const raw = req.params.id;
    // Use strict all-digits test so keys like "3M" or "123_ABC" aren't mis-parsed as numbers
    const isStrictNumeric = /^\d+$/.test(raw);
    let customer;

    if (isStrictNumeric) {
      // Fast path: pure numeric DB id
      customer = await storage.getCustomer(parseInt(raw, 10));
    } else {
      // Fallback: treat the param as a customer_key / customer name (canonical key lookup)
      customer = await storage.getCustomerByKey(raw);
    }

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Customer creation (for Order Entry)
// SECURITY: softAuth enforces authentication in production
router.post('/create-bypass', softAuth, async (req: Request, res: Response) => {
  try {
    console.log('🔧 BYPASS CUSTOMER CREATE ROUTE CALLED');
    console.log('🔧 Request body:', req.body);

    const customerData = insertCustomerSchema.parse(req.body);
    const newCustomer = await storage.createCustomer(customerData);

    console.log('🔧 Customer created successfully:', newCustomer.id);
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Create customer error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Customer update (for Customer Management)
// SECURITY: softAuth enforces authentication in production
router.put('/update-bypass/:id', softAuth, async (req: Request, res: Response) => {
  try {
    console.log('🔧 BYPASS CUSTOMER UPDATE ROUTE CALLED');
    console.log('🔧 Customer ID:', req.params.id);
    console.log('🔧 Request body:', req.body);

    const customerId = parseInt(req.params.id);
    const updates = req.body;
    const updatedCustomer = await storage.updateCustomer(customerId, updates);

    console.log('🔧 Customer updated successfully:', updatedCustomer.id);
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Customer delete (for Customer Management)
// SECURITY: softAuth enforces authentication in production
router.delete('/delete-bypass/:id', softAuth, async (req: Request, res: Response) => {
  try {
    console.log('🔧 BYPASS CUSTOMER DELETE ROUTE CALLED');
    console.log('🔧 Customer ID:', req.params.id);

    const customerId = parseInt(req.params.id);
    await storage.deleteCustomer(customerId);

    console.log('🔧 Customer deleted successfully:', customerId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const customerData = insertCustomerSchema.parse(req.body);
    const newCustomer = await storage.createCustomer(customerData);
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Create customer error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const updates = req.body;
    const updatedCustomer = await storage.updateCustomer(customerId, updates);
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    await storage.deleteCustomer(customerId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Customer Addresses
router.get('/:id/addresses', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const addresses = await storage.getCustomerAddresses(customerId.toString());
    res.json(addresses);
  } catch (error) {
    console.error('Get customer addresses error:', error);
    res.status(500).json({ error: 'Failed to fetch customer addresses' });
  }
});

router.post('/:id/addresses', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const { allowOverride, overrideReason, skipValidation, ...bodyData } = req.body;

    const addressData = insertCustomerAddressSchema.parse({
      ...bodyData,
      customerId,
    });

    const validationEnabled = process.env.ADDRESS_VALIDATION_ENABLED !== 'false';

    if (skipValidation || !validationEnabled) {
      if (!validationEnabled) {
        console.log('🔧 Address validation PAUSED (ADDRESS_VALIDATION_ENABLED=false) — saving raw via customers route');
      }
      const newAddress = await storage.createCustomerAddress(addressData);
      return res.status(201).json(newAddress);
    }

    const { validateAndNormalize, fromLegacyFields, toLegacyFields } = await import('../domain/address/addressService');

    const addressInput = fromLegacyFields({
      street: addressData.street,
      city: addressData.city,
      state: addressData.state,
      zipCode: addressData.zipCode,
      country: addressData.country || 'United States',
    });

    const result = await validateAndNormalize(addressInput);

    if (result.success) {
      const legacyFields = toLegacyFields(result.address);
      const enrichedData = {
        ...addressData,
        ...legacyFields,
        validationStatus: result.address.status,
        validatedAt: result.address.validatedAt || new Date(),
        validationProvider: result.address.validationProvider || null,
        dpvMatchCode: result.address.dpvMatchCode || null,
      };
      const newAddress = await storage.createCustomerAddress(enrichedData);
      return res.status(201).json(newAddress);
    }

    if (allowOverride && overrideReason) {
      const legacyFields = toLegacyFields(result.address);
      const enrichedData = {
        ...addressData,
        ...legacyFields,
        validationStatus: 'overridden',
        validatedAt: new Date(),
        validationProvider: result.address.validationProvider || null,
        dpvMatchCode: result.address.dpvMatchCode || null,
        overrideReason,
      };
      const newAddress = await storage.createCustomerAddress(enrichedData);
      return res.status(201).json(newAddress);
    }

    return res.status(400).json({
      error: 'Address validation failed',
      message: result.message,
      validationStatus: result.address.status,
      dpvMatchCode: result.address.dpvMatchCode,
      suggestedAddress: result.address.suggestedAddress,
      originalAddress: {
        street: addressData.street,
        city: addressData.city,
        state: addressData.state,
        zipCode: addressData.zipCode,
      },
    });
  } catch (error) {
    console.error('Create customer address error:', error);
    res.status(500).json({ error: 'Failed to create customer address' });
  }
});

// Communication Logs
router.get('/:id/communications', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const communications = await storage.getCommunicationLogs(
      customerId.toString()
    );
    res.json(communications);
  } catch (error) {
    console.error('Get communication logs error:', error);
    res.status(500).json({ error: 'Failed to fetch communication logs' });
  }
});

router.post('/:id/communications', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const communicationData = insertCommunicationLogSchema.parse({
      ...req.body,
      customerId,
    });
    const newCommunication =
      await storage.createCommunicationLog(communicationData);
    res.status(201).json(newCommunication);
  } catch (error) {
    console.error('Create communication log error:', error);
    res.status(500).json({ error: 'Failed to create communication log' });
  }
});

router.post('/customers', async (req: Request, res: Response) => {
  try {
    const customerData = insertP2CustomerSchema.parse(req.body);
    
    // Check if customerId already exists
    const existingCustomer = await storage.getP2CustomerByCustomerId(customerData.customerId);
    if (existingCustomer) {
      return res.status(400).json({ 
        error: `Customer ID "${customerData.customerId}" already exists. Please use a different ID.` 
      });
    }
    
    const newCustomer = await storage.createP2Customer(customerData);
    res.status(201).json(newCustomer);
  } catch (error: any) {
    console.error('Create P2 customer error:', error);
    // Handle duplicate key constraint - check multiple error formats
    const errorString = JSON.stringify(error) + (error?.message || '') + (error?.detail || '');
    if (error?.code === '23505' || errorString.includes('duplicate key') || errorString.includes('unique constraint')) {
      return res.status(400).json({ 
        error: 'This Customer ID is already in use. Please choose a different ID.' 
      });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create P2 customer' });
  }
});

router.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    console.log('📝 Updating P2 customer:', id);
    console.log('📊 Update data received:', JSON.stringify(req.body, null, 2));
    
    // Validate the update data through the schema (partial allows optional fields)
    const validation = insertP2CustomerSchema.partial().safeParse(req.body);
    if (!validation.success) {
      console.error('❌ P2 customer validation error:', validation.error.format());
      return res.status(400).json({ 
        error: 'Invalid customer data',
        details: validation.error.format()
      });
    }
    
    // Extract validated data and explicitly remove customerId - it's an immutable identifier
    const { customerId, ...updates } = validation.data;
    if (customerId !== undefined) {
      console.log('⚠️ Ignoring customerId field in update - this field cannot be changed');
    }
    console.log('🔢 Validated updates (without customerId):', JSON.stringify(updates, null, 2));
    
    const updatedCustomer = await storage.updateP2Customer(id, updates);
    
    if (!updatedCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    console.log('✅ Customer updated successfully:', updatedCustomer.id);
    
    res.json(updatedCustomer);
  } catch (error: any) {
    console.error('Update P2 customer error:', error);
    console.error('Error name:', error?.name);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Error detail:', error?.detail);
    console.error('Error stack:', error?.stack);
    res.status(500).json({ 
      error: 'Failed to update P2 customer', 
      details: error?.message || 'Unknown error',
      code: error?.code
    });
  }
});

router.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    await storage.deleteP2Customer(customerId);
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete P2 customer error:', error);
    res.status(500).json({ error: 'Failed to delete P2 customer' });
  }
});

// RFQ Configuration Routes
router.put('/:id/rfq-config', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const { rfqPrefix, rfqSequences } = req.body;
    
    const updatedCustomer = await storage.updateP2CustomerRFQConfig(customerId, {
      rfqPrefix,
      rfqSequences,
    });
    
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update P2 customer RFQ config error:', error);
    res.status(500).json({ error: 'Failed to update RFQ configuration' });
  }
});

router.get('/:customerId/rfq-next-number', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    
    const currentYear = new Date().getFullYear().toString();
    
    // Use atomic reservation method to prevent race conditions
    const result = await storage.reserveNextRFQNumber(customerId, currentYear);
    
    res.json(result);
  } catch (error) {
    console.error('Get next RFQ number error:', error);
    res.status(500).json({ error: 'Failed to generate RFQ number' });
  }
});

// Address autocomplete bypass route (to avoid monolithic route conflicts)
// SECURITY: softAuth enforces authentication in production
router.post(
  '/address-autocomplete-bypass',
  softAuth,
  async (req: Request, res: Response) => {
    try {
      console.log('🔧 BYPASS ADDRESS AUTOCOMPLETE CALLED');
      console.log('🔧 Request body:', req.body);

      const { search, getZipCode } = req.body;

      if (!search || typeof search !== 'string') {
        console.log('🔧 Invalid search parameter:', search);
        return res.status(400).json({ error: 'Search parameter is required' });
      }

      // Check if we have SmartyStreets credentials
      const authId = process.env.SMARTYSTREETS_AUTH_ID;
      const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;

      console.log('🔧 SmartyStreets credentials check:', {
        hasAuthId: !!authId,
        hasAuthToken: !!authToken,
      });

      if (!authId || !authToken) {
        console.log('🔧 Missing SmartyStreets credentials');
        return res.status(500).json({
          error: 'SmartyStreets credentials not configured',
        });
      }

      // If getZipCode is true and we have a complete address, use Street API
      if (getZipCode && search.includes(',')) {
        console.log('🔧 Using Street API for ZIP code lookup');

        // Parse the complete address for Street API
        const addressParts = search.split(', ');
        if (addressParts.length >= 2) {
          const street = addressParts[0];
          let city, state;

          if (addressParts.length >= 3) {
            city = addressParts[1];
            state = addressParts[2];
          } else {
            // Handle "City State" format
            const cityStateParts = addressParts[1].split(' ');
            state = cityStateParts.pop(); // Last part is state
            city = cityStateParts.join(' '); // Rest is city
          }

          console.log('🔧 Street API params:', { street, city, state });

          const streetUrl = `https://us-street.api.smartystreets.com/street-address?auth-id=${authId}&auth-token=${authToken}&street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`;

          console.log('🔧 Street API URL:', streetUrl);

          const streetResponse = await fetch(streetUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          console.log('🔧 Street API response status:', streetResponse.status);

          if (streetResponse.ok) {
            const streetData = await streetResponse.json();
            console.log('🔧 Street API response:', streetData);

            if (streetData && streetData.length > 0) {
              const result = streetData[0];
              const fullAddress = {
                delivery_line_1: result.delivery_line_1,
                components: {
                  city_name: result.components.city_name,
                  state_abbreviation: result.components.state_abbreviation,
                  zipcode:
                    result.components.zipcode +
                    (result.components.plus4_code
                      ? '-' + result.components.plus4_code
                      : ''),
                },
              };

              console.log('🔧 Returning full address with ZIP:', fullAddress);
              return res.json({ fullAddress: fullAddress });
            } else {
              console.log(
                '🔧 Street API returned empty results, falling back to autocomplete'
              );
            }
          } else {
            const errorText = await streetResponse.text();
            console.log(
              '🔧 Street API error:',
              streetResponse.status,
              errorText
            );

            // If Street API fails (like 402 subscription error), try to extract ZIP from the search text
            const zipMatch = search.match(/\b(\d{5}(?:-\d{4})?)\b/);
            if (zipMatch) {
              console.log(
                '🔧 Extracted ZIP code from search text:',
                zipMatch[1]
              );
              return res.json({
                fullAddress: {
                  delivery_line_1: street,
                  components: {
                    city_name: city,
                    state_abbreviation: state,
                    zipcode: zipMatch[1],
                  },
                },
              });
            }
          }
        }
      }

      // Use SmartyStreets US Autocomplete Pro API for partial searches
      const smartyStreetsUrl = `https://us-autocomplete-pro.api.smarty.com/lookup?auth-id=${authId}&auth-token=${authToken}&search=${encodeURIComponent(search)}&max_results=10`;

      console.log('🔧 Making SmartyStreets Autocomplete API call');

      const response = await fetch(smartyStreetsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('🔧 SmartyStreets response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('🔧 SmartyStreets error response:', errorText);
        throw new Error(
          `SmartyStreets Autocomplete API error: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json();
      console.log('🔧 SmartyStreets raw response:', data);

      // Transform SmartyStreets autocomplete response
      const suggestions =
        data.suggestions?.map((item: any) => {
          // Construct display text from individual fields
          const displayText = `${item.street_line}, ${item.city} ${item.state} ${item.zipcode}`;
          
          return {
            text: displayText,
            streetLine: item.street_line,
            secondary: item.secondary || '',
            city: item.city,
            state: item.state,
            zipCode: item.zipcode,
            entries: item.entries,
          };
        }) || [];

      console.log('🔧 Transformed suggestions:', suggestions);
      console.log(
        '🔧 Sending response with suggestions count:',
        suggestions.length
      );

      res.json({
        suggestions: suggestions,
      });
    } catch (error) {
      console.error('🔧 Address autocomplete error:', error);
      res.status(500).json({
        error: 'Failed to get address suggestions',
        details: (error as any).message || 'Unknown error',
      });
    }
  }
);

// Address validation endpoint using SmartyStreets API
router.post('/validate-address', async (req: Request, res: Response) => {
  try {
    const { street, city, state, zipCode } = req.body;

    // Check if we have SmartyStreets credentials
    const authId = process.env.SMARTYSTREETS_AUTH_ID;
    const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;

    if (!authId || !authToken) {
      return res.status(500).json({
        error: 'SmartyStreets credentials not configured',
      });
    }

    // Use SmartyStreets US Street API for validation
    const smartyStreetsUrl = `https://us-street.api.smartystreets.com/street-address?auth-id=${authId}&auth-token=${authToken}`;

    const requestBody = [
      {
        street: street || '',
        city: city || '',
        state: state || '',
        zipcode: zipCode || '',
        candidates: 3, // Request up to 3 suggestions
      },
    ];

    const response = await fetch(smartyStreetsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`SmartyStreets API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform SmartyStreets response to our format
    const suggestions = data.map((item: any) => ({
      street: item.delivery_line_1 || '',
      city: item.components?.city_name || '',
      state: item.components?.state_abbreviation || '',
      zipCode: item.components?.zipcode || '',
      isValid: true,
      smartyStreetsData: {
        deliveryLine1: item.delivery_line_1,
        lastLine: item.last_line,
        deliveryPointBarcode: item.delivery_point_barcode,
        components: item.components,
        metadata: item.metadata,
        analysis: item.analysis,
      },
    }));

    res.json({
      isValid: suggestions.length > 0,
      suggestions: suggestions,
    });
  } catch (error) {
    console.error('Address validation error:', error);
    res.status(500).json({
      error: 'Failed to validate address',
      details: (error as any).message || 'Unknown error',
    });
  }
});

// Get balance due for a specific customer (ADMIN/OWNER only)
router.get('/:id/balance-due', requireExecutiveAccess, async (req: Request, res: Response) => {
  try {

    const customerId = req.params.id;
    const requestingUser = (req as any).user;
    console.log(`Calculating balance due for customer ${customerId} (requested by ${requestingUser?.username})`);

    // Get unpaid orders for this customer using existing method
    const unpaidOrders = await storage.getUnpaidOrdersByCustomer(customerId);

    // Get refund data for these orders
    const { refundRequests, creditMemos } = await import('@shared/schema');
    const { db } = await import('../../db');
    const { eq, inArray, sql: drizzleSql, and, gt } = await import('drizzle-orm');

    // Get all processed refunds for this customer's orders
    const orderIds = unpaidOrders.map((o) => o.orderId);
    let refundsData: Array<{ orderId: string; totalRefunded: number }> = [];

    if (orderIds.length > 0) {
      const refunds = await db
        .select({
          orderId: refundRequests.orderId,
          totalRefunded: drizzleSql`SUM(COALESCE(${refundRequests.refundAmount}, ${refundRequests.amount}, 0))`.as('totalRefunded'),
        })
        .from(refundRequests)
        .where(
          and(
            inArray(refundRequests.orderId, orderIds),
            eq(refundRequests.status, 'PROCESSED')
          )
        )
        .groupBy(refundRequests.orderId);

      refundsData = refunds.map((r: any) => ({
        orderId: r.orderId as string,
        totalRefunded: Number(r.totalRefunded || 0),
      }));
    }

    // Create a map for quick refund lookup
    const refundMap = new Map(refundsData.map((r) => [r.orderId, r.totalRefunded]));

    // Enrich unpaid orders with refund information and adjust balance
    // IMPORTANT: Refunds INCREASE the balance due (money owed back to customer reduces what they paid)
    const ordersWithRefunds = unpaidOrders.map((order) => {
      const totalRefunded = refundMap.get(order.orderId) || 0;
      // Balance due = Order Total - (Payments - Refunds)
      // Which simplifies to: Balance due = Order Total - Payments + Refunds
      const adjustedBalance = Math.max(0, order.balanceDue + totalRefunded);
      // Calculate net paid amount for display (payments minus refunds)
      // NOTE: This can be negative if refunds exceed payments (over-refund/credit situation)
      const netPaid = order.totalPaid - totalRefunded;

      return {
        orderId: order.orderId,
        customerPO: order.customerPO,
        orderDate: order.orderDate,
        dueDate: order.dueDate,
        status: order.status,
        orderTotal: order.totalAmount,
        totalPaid: order.totalPaid,
        netPaid: Math.round(netPaid * 100) / 100, // Round to 2 decimal places
        totalRefunded: totalRefunded,
        balanceDue: adjustedBalance,
      };
    });

    // Filter out orders with $0 balance after refunds
    const ordersWithBalance = ordersWithRefunds.filter((o) => o.balanceDue > 0);

    // Calculate total balance due from orders
    const totalBalanceDue = ordersWithBalance.reduce((sum, order) => sum + order.balanceDue, 0);

    // Get credit memos with unapplied amounts for this customer
    const customerCreditMemos = await db
      .select({
        id: creditMemos.id,
        memoNumber: creditMemos.memoNumber,
        amount: creditMemos.amount,
        appliedAmount: creditMemos.appliedAmount,
        unappliedAmount: creditMemos.unappliedAmount,
        reason: creditMemos.reason,
        status: creditMemos.status,
        issuedDate: creditMemos.issuedDate,
      })
      .from(creditMemos)
      .where(
        and(
          eq(creditMemos.customerId, customerId),
          eq(creditMemos.status, 'active'),
          gt(creditMemos.unappliedAmount, 0)
        )
      );

    // Calculate total available credits
    const totalCreditsAvailable = customerCreditMemos.reduce(
      (sum, memo) => sum + (memo.unappliedAmount || 0),
      0
    );

    // Calculate net balance due (orders balance minus available credits)
    const netBalanceDue = Math.max(0, totalBalanceDue - totalCreditsAvailable);

    res.json({
      customerId,
      orders: ordersWithBalance,
      totalBalanceDue: Math.round(totalBalanceDue * 100) / 100,
      orderCount: ordersWithBalance.length,
      creditMemos: customerCreditMemos.map((memo) => ({
        ...memo,
        amount: Math.round((memo.amount || 0) * 100) / 100,
        appliedAmount: Math.round((memo.appliedAmount || 0) * 100) / 100,
        unappliedAmount: Math.round((memo.unappliedAmount || 0) * 100) / 100,
      })),
      totalCreditsAvailable: Math.round(totalCreditsAvailable * 100) / 100,
      netBalanceDue: Math.round(netBalanceDue * 100) / 100,
    });
  } catch (error) {
    console.error('Error calculating balance due:', error);
    res.status(500).json({
      error: 'Failed to calculate balance due',
      details: (error as any).message,
    });
  }
});

// P2 Purchase Order Items Routes
router.get(
  '/purchase-orders/:id/items',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const items = await storage.getP2PurchaseOrderItems(parseInt(id));
      res.json(items);
    } catch (error) {
      console.error('Error fetching P2 purchase order items:', error);
      res.status(500).json({ error: 'Failed to fetch P2 purchase order items' });
    }
  }
);

router.post(
  '/purchase-orders/:id/items',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const itemData = { ...req.body, poId: parseInt(id) };
      const item = await storage.createP2PurchaseOrderItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      console.error('Error creating P2 purchase order item:', error);
      res.status(500).json({ error: 'Failed to create P2 purchase order item' });
    }
  }
);

router.put(
  '/purchase-orders/:poId/items/:itemId',
  async (req: Request, res: Response) => {
    try {
      const { itemId } = req.params;
      const item = await storage.updateP2PurchaseOrderItem(parseInt(itemId), req.body);
      res.json(item);
    } catch (error) {
      console.error('Error updating P2 purchase order item:', error);
      res.status(500).json({ error: 'Failed to update P2 purchase order item' });
    }
  }
);

router.delete(
  '/purchase-orders/:poId/items/:itemId',
  async (req: Request, res: Response) => {
    try {
      const { itemId } = req.params;
      await storage.deleteP2PurchaseOrderItem(parseInt(itemId));
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting P2 purchase order item:', error);
      res.status(500).json({ error: 'Failed to delete P2 purchase order item' });
    }
  }
);

// P2 Serialized Items Routes

// Generate serialized items from a PO item
router.post(
  '/purchase-orders/items/:poItemId/generate-serialized',
  async (req: Request, res: Response) => {
    try {
      const { poItemId } = req.params;
      const { username = 'system' } = req.body;
      const items = await storage.generateSerializedItems(parseInt(poItemId), username);
      res.status(201).json(items);
    } catch (error) {
      console.error('Error generating serialized items:', error);
      res.status(500).json({ 
        error: 'Failed to generate serialized items',
        details: (error as any).message
      });
    }
  }
);

// Get serialized items with filters
router.get(
  '/serialized-items',
  async (req: Request, res: Response) => {
    try {
      const { poId, poItemId, department, status } = req.query;
      const filters: any = {};
      
      if (poId) filters.poId = parseInt(poId as string);
      if (poItemId) filters.poItemId = parseInt(poItemId as string);
      if (department) filters.department = department as string;
      if (status) filters.status = status as string;
      
      const items = await storage.getP2SerializedItems(filters);
      res.json(items);
    } catch (error) {
      console.error('Error fetching serialized items:', error);
      res.status(500).json({ error: 'Failed to fetch serialized items' });
    }
  }
);

// Get department queue (items for a specific department)
// For Layup: Items only appear after being scheduled from the P2 Production Queue
router.get(
  '/departments/:department/queue',
  async (req: Request, res: Response) => {
    try {
      const { department } = req.params;
      const { status = 'ACTIVE' } = req.query;
      
      // For Layup department, only show items that have been scheduled
      if (department === 'Layup') {
        // Get items that have an active layup schedule (SCHEDULED or IN_PROGRESS)
        const scheduledItems = await db
          .select({
            serializedItem: p2SerializedItems,
            schedule: p2LayupSchedules,
          })
          .from(p2LayupSchedules)
          .innerJoin(
            p2SerializedItems,
            eq(p2LayupSchedules.serializedItemId, p2SerializedItems.id)
          )
          .where(
            and(
              or(
                eq(p2LayupSchedules.status, 'SCHEDULED'),
                eq(p2LayupSchedules.status, 'IN_PROGRESS')
              ),
              eq(p2SerializedItems.status, status as string),
              eq(p2SerializedItems.currentDepartment, 'Layup')
            )
          );
        
        // Return serialized items with schedule info attached
        const items = scheduledItems.map(row => ({
          ...row.serializedItem,
          layupSchedule: row.schedule,
        }));
        
        return res.json(items);
      }
      
      // For other departments, use standard filtering
      const items = await storage.getP2SerializedItems({
        department,
        status: status as string
      });
      
      res.json(items);
    } catch (error) {
      console.error('Error fetching department queue:', error);
      res.status(500).json({ error: 'Failed to fetch department queue' });
    }
  }
);

// Get single serialized item by ID
router.get(
  '/serialized-items/:id',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const item = await storage.getP2SerializedItem(id);
      
      if (!item) {
        return res.status(404).json({ error: 'Serialized item not found' });
      }
      
      res.json(item);
    } catch (error) {
      console.error('Error fetching serialized item:', error);
      res.status(500).json({ error: 'Failed to fetch serialized item' });
    }
  }
);

// Get serialized item by barcode (for scanner lookup)
router.get(
  '/barcode/:barcode',
  async (req: Request, res: Response) => {
    try {
      const { barcode } = req.params;
      const item = await storage.getP2SerializedItemByBarcode(barcode);
      
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      res.json(item);
    } catch (error) {
      console.error('Error looking up barcode:', error);
      res.status(500).json({ error: 'Failed to lookup barcode' });
    }
  }
);

// Transition item to next department
router.post(
  '/serialized-items/:id/transition',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { username = 'system', notes } = req.body;
      
      const item = await storage.transitionSerializedItem(
        id,
        '', // nextDepartment is determined automatically
        username,
        notes
      );
      
      res.json(item);
    } catch (error) {
      console.error('Error transitioning item:', error);
      res.status(500).json({ 
        error: 'Failed to transition item',
        details: (error as any).message
      });
    }
  }
);

// Hold an item
router.post(
  '/serialized-items/:id/hold',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { reason, username = 'system' } = req.body;
      
      if (!reason) {
        return res.status(400).json({ error: 'Hold reason is required' });
      }
      
      const item = await storage.holdSerializedItem(
        id,
        reason,
        username
      );
      
      res.json(item);
    } catch (error) {
      console.error('Error holding item:', error);
      res.status(500).json({ 
        error: 'Failed to hold item',
        details: (error as any).message
      });
    }
  }
);

// Release an item from hold
router.post(
  '/serialized-items/:id/release',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { username = 'system' } = req.body;
      
      const item = await storage.releaseSerializedItem(
        id,
        username
      );
      
      res.json(item);
    } catch (error) {
      console.error('Error releasing item:', error);
      res.status(500).json({ 
        error: 'Failed to release item',
        details: (error as any).message
      });
    }
  }
);

// Scrap an item
router.post(
  '/serialized-items/:id/scrap',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { reason, username = 'system' } = req.body;
      
      if (!reason) {
        return res.status(400).json({ error: 'Scrap reason is required' });
      }
      
      const item = await storage.scrapSerializedItem(
        id,
        reason,
        username
      );
      
      res.json(item);
    } catch (error) {
      console.error('Error scrapping item:', error);
      res.status(500).json({ 
        error: 'Failed to scrap item',
        details: (error as any).message
      });
    }
  }
);

// Get item history
router.get(
  '/serialized-items/:id/history',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const history = await storage.getP2SerializedItemHistory(id);
      res.json(history);
    } catch (error) {
      console.error('Error fetching item history:', error);
      res.status(500).json({ error: 'Failed to fetch item history' });
    }
  }
);

// ========== PART ROUTING ROUTES ==========

// Create part routing
router.post(
  '/part-routings',
  async (req: Request, res: Response) => {
    try {
      const { insertPartRoutingSchema } = await import('../../schema');
      const validated = insertPartRoutingSchema.parse(req.body);
      const routing = await storage.createPartRouting(validated);
      res.json(routing);
    } catch (error) {
      console.error('Error creating part routing:', error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.message });
      }
      res.status(500).json({ 
        error: 'Failed to create part routing',
        details: (error as any).message
      });
    }
  }
);

// Get all part routings (with optional filters)
router.get(
  '/part-routings',
  async (req: Request, res: Response) => {
    try {
      const { inventoryItemId, isActive } = req.query;
      const routings = await storage.getPartRoutings({
        inventoryItemId: inventoryItemId as string | undefined,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined
      });
      res.json(routings);
    } catch (error) {
      console.error('Error fetching part routings:', error);
      res.status(500).json({ error: 'Failed to fetch part routings' });
    }
  }
);

// Get routing by ID
router.get(
  '/part-routings/:id',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const routing = await storage.getPartRouting(id);
      
      if (!routing) {
        return res.status(404).json({ error: 'Part routing not found' });
      }
      
      res.json(routing);
    } catch (error) {
      console.error('Error fetching part routing:', error);
      res.status(500).json({ error: 'Failed to fetch part routing' });
    }
  }
);

// Get routing by inventory item ID
router.get(
  '/part-routings/by-item/:inventoryItemId',
  async (req: Request, res: Response) => {
    try {
      const { inventoryItemId } = req.params;
      const routing = await storage.getPartRoutingByInventoryItem(inventoryItemId);
      
      if (!routing) {
        return res.status(404).json({ error: 'No active routing found for this item' });
      }
      
      res.json(routing);
    } catch (error) {
      console.error('Error fetching part routing:', error);
      res.status(500).json({ error: 'Failed to fetch part routing' });
    }
  }
);

// Get routing by part number
router.get(
  '/part-routings/part/:partNumber',
  async (req: Request, res: Response) => {
    try {
      const { partNumber } = req.params;
      const routing = await storage.getPartRoutingByPartNumber(partNumber);
      
      if (!routing) {
        return res.status(404).json({ error: 'No active routing found for this part number' });
      }
      
      res.json(routing);
    } catch (error) {
      console.error('Error fetching part routing:', error);
      res.status(500).json({ error: 'Failed to fetch part routing' });
    }
  }
);

// Update part routing
router.put(
  '/part-routings/:id',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { updatePartRoutingSchema } = await import('../../schema');
      
      // Validate against dedicated update schema (with refinements)
      const validated = updatePartRoutingSchema.parse(req.body);
      
      // Storage now handles merging with existing record
      const routing = await storage.updatePartRouting(id, validated);
      res.json(routing);
    } catch (error) {
      console.error('Error updating part routing:', error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.message });
      }
      res.status(500).json({ 
        error: 'Failed to update part routing',
        details: (error as any).message
      });
    }
  }
);

// Delete part routing
router.delete(
  '/part-routings/:id',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deletePartRouting(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting part routing:', error);
      res.status(500).json({ error: 'Failed to delete part routing' });
    }
  }
);

// ========== TRACEABILITY ROUTES ==========

// Add traceability data
router.post(
  '/serialized-items/:id/traceability',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { insertP2SerializedItemTraceabilitySchema } = await import('../../schema');
      const data = { ...req.body, serializedItemId: id };
      const validated = insertP2SerializedItemTraceabilitySchema.parse(data);
      const record = await storage.addTraceabilityData(validated);
      res.json(record);
    } catch (error) {
      console.error('Error adding traceability data:', error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.message });
      }
      res.status(500).json({ 
        error: 'Failed to add traceability data',
        details: (error as any).message
      });
    }
  }
);

// Get traceability data for item
router.get(
  '/serialized-items/:id/traceability',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { department } = req.query;
      
      const data = department
        ? await storage.getTraceabilityForDepartment(id, department as string)
        : await storage.getTraceabilityData(id);
      
      res.json(data);
    } catch (error) {
      console.error('Error fetching traceability data:', error);
      res.status(500).json({ error: 'Failed to fetch traceability data' });
    }
  }
);

// ========== CUSTOM DATA ROUTES ==========

// Add custom data
router.post(
  '/serialized-items/:id/custom-data',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { insertP2SerializedItemCustomDataSchema } = await import('../../schema');
      const data = { ...req.body, serializedItemId: id };
      const validated = insertP2SerializedItemCustomDataSchema.parse(data);
      const record = await storage.addCustomData(validated);
      res.json(record);
    } catch (error) {
      console.error('Error adding custom data:', error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.message });
      }
      res.status(500).json({ 
        error: 'Failed to add custom data',
        details: (error as any).message
      });
    }
  }
);

// Get custom data for item
router.get(
  '/serialized-items/:id/custom-data',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { department } = req.query;
      
      const data = department
        ? await storage.getCustomDataForDepartment(id, department as string)
        : await storage.getCustomData(id);
      
      res.json(data);
    } catch (error) {
      console.error('Error fetching custom data:', error);
      res.status(500).json({ error: 'Failed to fetch custom data' });
    }
  }
);

export default router;
