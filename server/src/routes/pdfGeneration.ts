// PDFME SYSTEM COMMENTED OUT - NOT IN USE
/*
import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { generatePdf, prepareVendorPOData } from '../utils/pdfGenerator';
import { Template } from '@pdfme/common';

const router = Router();

// POST /api/generate-pdf/vendor-po/:id - Generate vendor PO PDF from template
router.post('/vendor-po/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const poData = req.body;

    // Get the active vendor PO template or a specific template by ID
    const template = await storage.getActivePdfTemplateByType('vendor_po');
    
    if (!template) {
      return res.status(404).json({ error: 'No active vendor PO template found' });
    }

    // Prepare the data for PDF generation
    const pdfData = prepareVendorPOData(poData);

    // Generate the PDF
    const pdfBuffer = await generatePdf({
      template: template.templateJson as any as Template,
      inputs: [pdfData],
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="vendor-po-${id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error('Vendor PO PDF generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate vendor PO PDF',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/generate-pdf/preview - Generate PDF preview from template
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { template, data } = req.body;

    if (!template) {
      return res.status(400).json({ error: 'Template is required' });
    }

    // Generate the PDF with sample data
    const pdfBuffer = await generatePdf({
      template: template as Template,
      inputs: data || [{}],
    });

    // Set response headers for PDF display
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF preview generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF preview',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/generate-pdf/by-template/:templateId - Generate PDF using a specific template
router.post('/by-template/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const data = req.body;

    const template = await storage.getPdfTemplate(templateId);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Generate the PDF
    const pdfBuffer = await generatePdf({
      template: template.templateJson as any as Template,
      inputs: [data],
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${template.name}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
*/

import { Router } from 'express';
const router = Router();
export default router;
