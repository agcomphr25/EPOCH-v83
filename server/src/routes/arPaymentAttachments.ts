import express from 'express';
import { storage } from '../../storage';
import { insertArPaymentAttachmentSchema } from '@shared/schema';
import { ObjectStorageService } from '../../replit_integrations/object_storage';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';

const router = express.Router();
const objectStorageService = new ObjectStorageService();

router.use(authenticateToken);
router.use(requirePermission('finance.view'));

// GET /api/ar-payment-attachments/download/:attachmentId — stream PDF from storage
// NOTE: This route must be registered before /:paymentId to avoid the wildcard matching "download"
router.get('/download/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const attachment = await storage.getArPaymentAttachment(attachmentId);

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const normalizedPath = attachment.filePath?.startsWith('objects/')
      ? `/${attachment.filePath}`
      : attachment.filePath;

    if (normalizedPath && normalizedPath.startsWith('/objects/')) {
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(normalizedPath);
        res.setHeader('Content-Disposition', `inline; filename="${attachment.fileName}"`);
        res.setHeader('Content-Type', 'application/pdf');
        await objectStorageService.downloadObject(objectFile, res);
      } catch (cloudError) {
        console.error('Error fetching from cloud storage:', cloudError);
        res.status(404).json({ error: 'File not found in storage' });
      }
    } else {
      res.status(404).json({ error: 'File not available' });
    }
  } catch (error) {
    console.error('Error downloading AR payment attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// GET /api/ar-payment-attachments/:paymentId — list attachments for a payment
router.get('/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const attachments = await storage.getArPaymentAttachments(paymentId);
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching AR payment attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// POST /api/ar-payment-attachments/request-upload-url — presigned PUT URL
router.post('/request-upload-url', requirePermission('finance.manage_payments'), async (req, res) => {
  try {
    const { name, size, paymentId } = req.body;

    if (!name || !paymentId) {
      return res.status(400).json({ error: 'Missing required fields: name, paymentId' });
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json({ uploadURL, objectPath });
  } catch (error) {
    console.error('Error generating upload URL for AR payment attachment:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// POST /api/ar-payment-attachments/complete-upload — save attachment record after client PUT
router.post('/complete-upload', requirePermission('finance.manage_payments'), async (req, res) => {
  try {
    const { objectPath, paymentId, originalFileName, fileSize } = req.body;
    const user = (req as any).user;

    if (!objectPath || !paymentId || !originalFileName) {
      return res.status(400).json({ error: 'Missing required fields: objectPath, paymentId, originalFileName' });
    }

    // Enforce PDF-only by checking the filename extension
    const lowerName = originalFileName.toLowerCase();
    if (!lowerName.endsWith('.pdf')) {
      return res.status(400).json({ error: 'Only PDF files are accepted' });
    }

    try {
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: user?.id?.toString() || 'system',
        visibility: 'public',
      });
    } catch (aclError) {
      console.warn('Failed to set ACL policy for AR payment attachment:', aclError);
    }

    const attachmentData = {
      paymentId,
      fileName: originalFileName,
      filePath: objectPath,
      fileSize: fileSize || 0,
    };

    const validated = insertArPaymentAttachmentSchema.parse(attachmentData);
    const attachment = await storage.createArPaymentAttachment(validated);

    res.json(attachment);
  } catch (error: any) {
    console.error('Error completing AR payment attachment upload:', error);
    res.status(500).json({ error: error.message || 'Failed to complete upload' });
  }
});

export default router;
