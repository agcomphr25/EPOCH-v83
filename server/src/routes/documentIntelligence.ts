import { Router } from 'express';
import multer from 'multer';
import { 
  analyzeDocument, 
  analyzeDocumentFromUrl,
  extractInvoiceData,
  extractReceiptData,
  DocumentType 
} from '../lib/azureDocumentIntelligence';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const documentType = (req.body.documentType || 'document') as DocumentType;
    const result = await analyzeDocument(req.file.buffer, documentType);

    res.json(result);
  } catch (error: any) {
    console.error('Document analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze document',
      message: error.message 
    });
  }
});

router.post('/analyze-url', async (req, res) => {
  try {
    const { url, documentType = 'document' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const result = await analyzeDocumentFromUrl(url, documentType as DocumentType);

    res.json(result);
  } catch (error: any) {
    console.error('Document analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze document from URL',
      message: error.message 
    });
  }
});

router.post('/extract-invoice', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await extractInvoiceData(req.file.buffer);

    res.json(result);
  } catch (error: any) {
    console.error('Invoice extraction error:', error);
    res.status(500).json({ 
      error: 'Failed to extract invoice data',
      message: error.message 
    });
  }
});

router.post('/extract-receipt', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await extractReceiptData(req.file.buffer);

    res.json(result);
  } catch (error: any) {
    console.error('Receipt extraction error:', error);
    res.status(500).json({ 
      error: 'Failed to extract receipt data',
      message: error.message 
    });
  }
});

export default router;
