import { Router } from 'express';
import { storage } from '../../storage';
import { insertCuttingDocumentSchema } from '../../schema';
import { ObjectStorageService } from '../../replit_integrations/object_storage/objectStorage';

const router = Router();
const objectStorageService = new ObjectStorageService();

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
      await objectStorageService.trySetObjectEntityAclPolicy(parsed.data.fileUrl, {
        owner: user?.id?.toString() || 'system',
        visibility: 'public',
      });
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
      await objectStorageService.deleteByStoragePath(deleted.fileUrl);
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
