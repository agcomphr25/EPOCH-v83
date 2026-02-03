import express from 'express';
import { storage } from '../../storage';
import {
  insertOrderAttachmentSchema,
  type OrderAttachment,
} from '@shared/schema';
import { ObjectStorageService } from '../../replit_integrations/object_storage';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const objectStorageService = new ObjectStorageService();

// GET /api/order-attachments/:orderId - Get all attachments for an order
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const attachments = await storage.getOrderAttachments(orderId);
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching order attachments:', error);
    res.status(500).json({ error: 'Failed to fetch order attachments' });
  }
});

// POST /api/order-attachments/request-upload-url - Request presigned URL for cloud upload
router.post('/request-upload-url', async (req, res) => {
  try {
    const { name, size, contentType, orderId } = req.body;

    if (!name || !orderId) {
      return res.status(400).json({ error: 'Missing required fields: name, orderId' });
    }

    console.log(`📁 Requesting upload URL for order ${orderId}: ${name}`);

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    console.log(`📁 Generated upload URL for ${name}, objectPath: ${objectPath}`);

    res.json({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType, orderId },
    });
  } catch (error) {
    console.error('Error generating upload URL for order attachment:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// POST /api/order-attachments/complete-upload - Complete upload and save to database
router.post('/complete-upload', async (req, res) => {
  try {
    const { objectPath, orderId, originalFileName, fileSize, mimeType, notes } = req.body;
    const user = (req as any).user;

    console.log(`📁 Complete upload request received:`, { objectPath, orderId, originalFileName, hasUser: !!user });

    if (!objectPath || !orderId || !originalFileName) {
      console.error('📁 Missing required fields:', { objectPath: !!objectPath, orderId: !!orderId, originalFileName: !!originalFileName });
      return res.status(400).json({ 
        error: 'Missing required fields: objectPath, orderId, originalFileName' 
      });
    }

    console.log(`📁 Completing upload for order ${orderId}: ${originalFileName}`);

    // Set ACL policy to make file accessible
    try {
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: user?.id?.toString() || 'system',
        visibility: 'public',
      });
      console.log('📁 ACL policy set successfully for:', objectPath);
    } catch (aclError) {
      console.warn('📁 Failed to set ACL policy for order attachment:', aclError);
      // Continue anyway - ACL errors shouldn't block the upload
    }

    const attachmentData = {
      orderId,
      fileName: objectPath.split('/').pop() || originalFileName,
      originalFileName,
      fileSize: fileSize || 0,
      mimeType: mimeType || 'application/octet-stream',
      filePath: objectPath, // Store cloud object path
      uploadedBy: user?.username || null,
      notes: notes || null,
    };

    console.log('📁 Creating database record:', attachmentData);
    
    try {
      const validatedData = insertOrderAttachmentSchema.parse(attachmentData);
      const attachment = await storage.createOrderAttachment(validatedData);
      
      console.log('📁 Order attachment saved successfully:', attachment.id);
      res.json(attachment);
    } catch (dbError: any) {
      console.error('📁 Database error creating attachment:', dbError);
      res.status(500).json({ 
        error: `Database error: ${dbError.message || 'Failed to save attachment record'}` 
      });
    }
  } catch (error: any) {
    console.error('📁 Error completing order attachment upload:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to complete upload' 
    });
  }
});

// DELETE /api/order-attachments/:attachmentId - Delete an attachment
router.delete('/:attachmentId', async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);

    // Get attachment info before deleting
    const attachment = await storage.getOrderAttachment(attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Try to delete from cloud storage if it's a cloud path (starts with /objects/ or objects/)
    // Normalize objects/ prefix to /objects/
    const normalizedPath = attachment.filePath?.startsWith('objects/') 
      ? `/${attachment.filePath}` 
      : attachment.filePath;
    
    if (normalizedPath && normalizedPath.startsWith('/objects/')) {
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(normalizedPath);
        await objectFile.delete();
        console.log(`📁 Deleted cloud file: ${normalizedPath}`);
      } catch (deleteError) {
        console.warn('Failed to delete file from cloud storage:', deleteError);
        // Continue with database deletion even if cloud deletion fails
      }
    } else if (attachment.filePath) {
      // Legacy local file - try to delete if it exists
      try {
        if (fs.existsSync(attachment.filePath)) {
          fs.unlinkSync(attachment.filePath);
          console.log(`📁 Deleted local file: ${attachment.filePath}`);
        }
      } catch (localDeleteError) {
        console.warn('Failed to delete local file:', localDeleteError);
      }
    }

    // Delete from database
    await storage.deleteOrderAttachment(attachmentId);

    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting order attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// GET /api/order-attachments/download/:attachmentId - Download/view an attachment
router.get('/download/:attachmentId', async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);
    const attachment = await storage.getOrderAttachment(attachmentId);
    const forceDownload = req.query.download === 'true';

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Check if this is a cloud storage path (starts with /objects/ or objects/)
    // Normalize objects/ prefix to /objects/
    const normalizedDownloadPath = attachment.filePath?.startsWith('objects/') 
      ? `/${attachment.filePath}` 
      : attachment.filePath;
    
    if (normalizedDownloadPath && normalizedDownloadPath.startsWith('/objects/')) {
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(normalizedDownloadPath);
        
        if (forceDownload) {
          // Set download disposition header
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${attachment.originalFileName}"`
          );
        } else {
          res.setHeader(
            'Content-Disposition',
            `inline; filename="${attachment.originalFileName}"`
          );
        }
        
        // Stream the file using the built-in download method
        await objectStorageService.downloadObject(objectFile, res);
      } catch (cloudError) {
        console.error('Error fetching from cloud storage:', cloudError);
        res.status(404).json({ error: 'File not found in cloud storage' });
      }
    } else if (attachment.filePath && fs.existsSync(attachment.filePath)) {
      // Legacy local file - serve if it exists (dev environment only)
      console.log(`📁 Serving legacy local file: ${attachment.filePath}`);
      
      if (forceDownload) {
        res.download(attachment.filePath, attachment.originalFileName);
      } else {
        res.setHeader('Content-Type', attachment.mimeType);
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${attachment.originalFileName}"`
        );
        res.sendFile(path.resolve(attachment.filePath));
      }
    } else {
      // File not found in either location
      console.warn('File not found:', attachment.filePath);
      res.status(404).json({ 
        error: 'File not available. It may have been stored locally and is not accessible in this environment.' 
      });
    }
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

export default router;
