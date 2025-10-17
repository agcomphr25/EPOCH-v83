import { Router, Request, Response } from 'express';

import { pool } from '../../db';
import { uploadMiddleware } from '../../utils/fileUpload';
import { extractCertificationContent } from '../lib/azureDocumentIntelligence';
import { downloadFileAsBuffer, listPDFFiles, getFileMetadata } from '../lib/googleDrive';

const router = Router();

// GET all certifications
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query`
      SELECT 
        id,
        name,
        description,
        issuing_organization as "issuingOrganization",
        validity_period as "validityPeriod",
        category,
        requirements,
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM certifications
      WHERE is_active = true
      ORDER BY name
    `;

    res.json(result || []);
  } catch (error) {
    console.error('Get certifications error:', error);
    res.status(500).json({ error: 'Failed to fetch certifications' });
  }
});

// POST create certification from PDF
router.post(
  '/create-from-pdf',
  uploadMiddleware.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No PDF file uploaded' });
      }

      const pdfBuffer = req.file.buffer;
      const createdBy = req.body.createdBy || 'system';

      // Extract certification content using Azure Document Intelligence
      const extractedData = await extractCertificationContent(pdfBuffer);

      // Create certification in database
      const result = await pool.query`
      INSERT INTO certifications (
        name,
        description,
        category,
        requirements,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        ${extractedData.name || 'Unnamed Certification'},
        ${extractedData.description || ''},
        ${'DEPARTMENT'},
        ${extractedData.requirements || ''},
        true,
        NOW(),
        NOW()
      )
      RETURNING *
    `;

      const certification = result[0];

      res.status(201).json({
        certification: {
          id: certification.id,
          name: certification.name,
          description: certification.description,
          category: certification.category,
        },
        extractedData,
      });
    } catch (error: any) {
      console.error('Create certification from PDF error:', error);
      
      // Handle Azure Document Intelligence specific errors
      if (error.code === 'InvalidRequest' || error.code === 'InvalidContent') {
        return res.status(400).json({ 
          error: 'PDF Format Not Supported',
          details: 'This PDF cannot be processed. Common reasons:\n' +
                   '• PDF is password-protected or encrypted\n' +
                   '• PDF format is not supported by Azure\n' +
                   '• File may be corrupted\n\n' +
                   'Try: Open the PDF in a PDF editor, save as a new file, and upload again.',
          suggestion: 'Consider manually entering the certification details instead.'
        });
      }
      
      if (error instanceof Error) {
        return res.status(500).json({ error: error.message });
      }
      res
        .status(500)
        .json({ error: 'Failed to create certification from PDF' });
    }
  }
);

// GET list PDF files from Google Drive
router.get('/google-drive/pdfs', async (req: Request, res: Response) => {
  try {
    const maxResults = parseInt(req.query.maxResults as string) || 50;
    const files = await listPDFFiles(maxResults);
    res.json(files);
  } catch (error) {
    console.error('List Google Drive PDFs error:', error);
    res.status(500).json({ error: 'Failed to list PDF files from Google Drive' });
  }
});

// POST create certification from Google Drive file
router.post('/create-from-google-drive', async (req: Request, res: Response) => {
  try {
    const { fileId, createdBy } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'Google Drive file ID is required' });
    }

    // Get file metadata
    const fileMetadata = await getFileMetadata(fileId);
    
    // Verify it's a PDF
    if (fileMetadata.mimeType !== 'application/pdf') {
      return res.status(400).json({ 
        error: 'Invalid file type', 
        details: 'Only PDF files are supported. Selected file type: ' + fileMetadata.mimeType 
      });
    }

    // Download file from Google Drive
    console.log(`📥 Downloading file from Google Drive: ${fileMetadata.name} (${fileId})`);
    const pdfBuffer = await downloadFileAsBuffer(fileId);
    console.log(`✅ Downloaded ${pdfBuffer.length} bytes`);

    // Extract certification content using Azure Document Intelligence
    const extractedData = await extractCertificationContent(pdfBuffer);

    // Create certification in database
    const result = await pool.query`
      INSERT INTO certifications (
        name,
        description,
        category,
        requirements,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        ${extractedData.name || fileMetadata.name || 'Unnamed Certification'},
        ${extractedData.description || ''},
        ${'DEPARTMENT'},
        ${extractedData.requirements || ''},
        true,
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    const certification = result[0];

    res.status(201).json({
      certification: {
        id: certification.id,
        name: certification.name,
        description: certification.description,
        category: certification.category,
      },
      extractedData,
      sourceFile: {
        name: fileMetadata.name,
        googleDriveId: fileId,
        webViewLink: fileMetadata.webViewLink
      }
    });
  } catch (error: any) {
    console.error('Create certification from Google Drive error:', error);
    
    // Handle Azure Document Intelligence specific errors
    if (error.code === 'InvalidRequest' || error.code === 'InvalidContent') {
      return res.status(400).json({ 
        error: 'PDF Format Not Supported',
        details: 'This PDF cannot be processed. Common reasons:\n' +
                 '• PDF is password-protected or encrypted\n' +
                 '• PDF format is not supported by Azure\n' +
                 '• File may be corrupted\n\n' +
                 'Try: Open the PDF in Google Drive, download it, then re-upload as a new file.',
        suggestion: 'Consider manually entering the certification details instead.'
      });
    }
    
    if (error instanceof Error) {
      return res.status(500).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create certification from Google Drive file' });
  }
});

export default router;
