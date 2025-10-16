import { Router, Request, Response } from 'express';
import { pool } from '../../db';
import { uploadMiddleware } from '../../utils/fileUpload';
import { extractCertificationContent } from '../../lib/azureDocumentIntelligence';

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
    console.error("Get certifications error:", error);
    res.status(500).json({ error: "Failed to fetch certifications" });
  }
});

// POST create certification from PDF
router.post('/create-from-pdf', uploadMiddleware.single('file'), async (req: Request, res: Response) => {
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
        ${extractedData.certificationName || 'Unnamed Certification'},
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
  } catch (error) {
    console.error('Create certification from PDF error:', error);
    if (error instanceof Error) {
      return res.status(500).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create certification from PDF' });
  }
});

export default router;
