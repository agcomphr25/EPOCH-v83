import { Router } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { storage } from '../../storage';
import { insertCuttingDocumentSchema } from '../../schema';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
  getStorageErrorResponse,
} from '../services/fileStorageProvider';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});
const localUploadDir = path.join(process.cwd(), 'uploads', 'cutting-documents');

function safeUploadName(fileName: string) {
  const parsed = path.parse(fileName || 'cutting-document');
  const base = parsed.name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'cutting-document';
  const ext = parsed.ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 20);
  return `${randomUUID()}-${base}${ext}`;
}

async function saveLocalCuttingDocument(file: Express.Multer.File) {
  await fs.mkdir(localUploadDir, { recursive: true });
  const fileName = safeUploadName(file.originalname);
  const filePath = path.join(localUploadDir, fileName);
  await fs.writeFile(filePath, file.buffer);
  return `/uploads/cutting-documents/${fileName}`;
}

async function deleteLocalCuttingDocument(fileUrl: string) {
  if (!fileUrl.startsWith('/uploads/cutting-documents/')) return;
  const fileName = path.basename(fileUrl);
  await fs.unlink(path.join(localUploadDir, fileName));
}

router.get('/', async (req, res) => {
  try {
    const docs = await storage.listCuttingDocuments();
    res.json(docs);
  } catch (error) {
    console.error('Error listing cutting documents:', error);
    res.status(500).json({ error: 'Failed to list cutting documents' });
  }
});

router.post('/', async (req, res) => {
  try {
    const parsed = insertCuttingDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid document data', details: parsed.error.flatten() });
    }

    // Set ACL to public so the file can be opened via /objects/* route
    try {
      const user = (req as any).user;
      await getFileStorageProviderForObjectPath(parsed.data.fileUrl).setPublicReadPolicy(
        parsed.data.fileUrl,
        user?.id?.toString() || 'system',
      );
    } catch (aclError) {
      console.warn('[CuttingDocuments] Failed to set ACL policy:', aclError);
      // Non-fatal: continue so the record is saved even if ACL fails
    }

    const doc = await storage.createCuttingDocument(parsed.data);
    res.status(201).json(doc);
  } catch (error) {
    console.error('Error creating cutting document:', error);
    res.status(500).json({ error: 'Failed to create cutting document' });
  }
});

router.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (uploadError: any) => {
    if (uploadError) {
      const isSizeLimit = uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE';
      return res.status(isSizeLimit ? 413 : 400).json({
        error: isSizeLimit ? 'Document uploads are limited to 100 MB.' : 'Failed to read uploaded document',
        details: uploadError.message,
      });
    }

    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file received' });
      }

      let fileUrl: string;
      try {
        const provider = getFileStorageProvider();
        fileUrl = await provider.uploadBuffer({
          buffer: file.buffer,
          fileName: file.originalname || 'cutting-document',
          contentType: file.mimetype || 'application/octet-stream',
          scope: 'cutting-documents',
        });

        try {
          const user = (req as any).user;
          await getFileStorageProviderForObjectPath(fileUrl).setPublicReadPolicy(
            fileUrl,
            user?.id?.toString() || 'system',
          );
        } catch (aclError) {
          console.warn('[CuttingDocuments] Failed to set ACL policy after upload:', aclError);
        }
      } catch (storageError) {
        console.warn('[CuttingDocuments] Object storage upload failed; falling back to local uploads:', storageError);
        fileUrl = await saveLocalCuttingDocument(file);
      }

      const parsed = insertCuttingDocumentSchema.safeParse({
        displayName: req.body.displayName || file.originalname || 'Cutting document',
        fileUrl,
        originalFilename: file.originalname || 'cutting-document',
        mimeType: file.mimetype || 'application/octet-stream',
        fileSize: file.size,
      });
      if (!parsed.success) {
        try {
          if (fileUrl.startsWith('/uploads/cutting-documents/')) {
            await deleteLocalCuttingDocument(fileUrl);
          } else {
            await getFileStorageProviderForObjectPath(fileUrl).deleteObject(fileUrl);
          }
        } catch (cleanupError) {
          console.warn('[CuttingDocuments] Failed to clean up uploaded object after validation error:', cleanupError);
        }
        return res.status(400).json({ error: 'Invalid document data', details: parsed.error.flatten() });
      }

      const doc = await storage.createCuttingDocument(parsed.data);
      res.status(201).json(doc);
    } catch (error) {
      const { status, reason, message } = getStorageErrorResponse(error);
      console.error('[CuttingDocuments] Upload failed:', { reason, message, status });
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: 'Failed to upload cutting document',
        reason,
        details: message,
      });
    }
  });
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    const deleted = await storage.deleteCuttingDocument(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Document not found' });
    }
    // Best-effort: remove the underlying object from storage to prevent orphans
    try {
      if (deleted.fileUrl.startsWith('/uploads/cutting-documents/')) {
        await deleteLocalCuttingDocument(deleted.fileUrl);
      } else {
        await getFileStorageProviderForObjectPath(deleted.fileUrl).deleteObject(deleted.fileUrl);
      }
    } catch (storageErr) {
      console.warn('[CuttingDocuments] Failed to delete object from storage:', storageErr);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting cutting document:', error);
    res.status(500).json({ error: 'Failed to delete cutting document' });
  }
});

export default router;
