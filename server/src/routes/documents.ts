import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertDocumentSchema, insertDocumentTagSchema, insertDocumentCollectionSchema } from '../../schema';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure multer for file uploads
const uploadDir = 'uploads/documents';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});

// Documents Routes

// GET /api/documents - Get all documents
router.get('/', async (req, res) => {
  try {
    const documents = await storage.getAllManagedDocuments();
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/documents/search - Search documents
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const documents = await storage.searchDocuments(q);
    res.json(documents);
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// GET /api/documents/type/:type - Get documents by type
router.get('/type/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const documents = await storage.getManagedDocumentsByType(type);
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents by type:', error);
    res.status(500).json({ error: 'Failed to fetch documents by type' });
  }
});

// Document Tags Routes

// GET /api/documents/tags - Get all tags
router.get('/tags', async (req, res) => {
  try {
    const tags = await storage.getAllTags();
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Document Collections Routes

// GET /api/documents/collections - Get all collections
router.get('/collections', async (req, res) => {
  try {
    const collections = await storage.getAllCollections();
    res.json(collections);
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

// GET /api/documents/:id - Get single document
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const document = await storage.getManagedDocument(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// POST /api/documents/upload - Upload new document
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('📁 Document upload request received');
    console.log('📁 File info:', req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');
    console.log('📁 Body data:', req.body);
    
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, description, documentType, uploadedBy } = req.body;
    
    // Validate required fields
    if (!title || !documentType) {
      console.log('❌ Missing required fields:', { title, documentType });
      return res.status(400).json({ error: 'Title and document type are required' });
    }

    // Generate unique filename to prevent conflicts
    const fileExtension = path.extname(req.file.originalname);
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2)}${fileExtension}`;
    const newFilePath = path.join(uploadDir, uniqueFileName);
    
    // Move file to final location with unique name
    fs.renameSync(req.file.path, newFilePath);

    const documentData = {
      title,
      description: description || null,
      fileName: uniqueFileName,
      originalFileName: req.file.originalname,
      filePath: newFilePath,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      documentType,
      uploadedBy: uploadedBy ? parseInt(uploadedBy) : null
    };

    // Validate data with schema
    const validatedData = insertDocumentSchema.parse(documentData);
    
    console.log('📁 Creating document in database...');
    const document = await storage.createManagedDocument(validatedData);
    console.log('✅ Document created successfully:', document.id);
    res.status(201).json(document);
  } catch (error) {
    console.error('Error uploading document:', error);
    
    // Clean up file if document creation failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid document data', details: error.errors });
    }
    
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// PUT /api/documents/:id - Update document metadata
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    // Validate update data (partial schema)
    const updateData = insertDocumentSchema.partial().parse(req.body);
    
    const document = await storage.updateManagedDocument(id, updateData);
    res.json(document);
  } catch (error) {
    console.error('Error updating document:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid document data', details: error.errors });
    }
    
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// DELETE /api/documents/:id - Delete document
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    await storage.deleteManagedDocument(id);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// GET /api/documents/:id/download - Download document file
router.get('/:id/download', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const document = await storage.getManagedDocument(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if file exists
    if (!fs.existsSync(document.filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.originalFileName}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(document.filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Document Tags Routes (continued from above)

// GET /api/documents/tags/category/:category - Get tags by category
router.get('/tags/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const tags = await storage.getTagsByCategory(category);
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags by category:', error);
    res.status(500).json({ error: 'Failed to fetch tags by category' });
  }
});

// POST /api/documents/tags - Create new tag
router.post('/tags', async (req, res) => {
  try {
    const validatedData = insertDocumentTagSchema.parse(req.body);
    const tag = await storage.createTag(validatedData);
    res.status(201).json(tag);
  } catch (error) {
    console.error('Error creating tag:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid tag data', details: error.errors });
    }
    
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// PUT /api/documents/tags/:id - Update tag
router.put('/tags/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid tag ID' });
    }

    const updateData = insertDocumentTagSchema.partial().parse(req.body);
    const tag = await storage.updateTag(id, updateData);
    res.json(tag);
  } catch (error) {
    console.error('Error updating tag:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid tag data', details: error.errors });
    }
    
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// DELETE /api/documents/tags/:id - Delete tag
router.delete('/tags/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid tag ID' });
    }

    await storage.deleteTag(id);
    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// GET /api/documents/:id/tags - Get tags for a document
router.get('/:id/tags', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const tags = await storage.getDocumentTags(id);
    res.json(tags);
  } catch (error) {
    console.error('Error fetching document tags:', error);
    res.status(500).json({ error: 'Failed to fetch document tags' });
  }
});

// POST /api/documents/:id/tags/:tagId - Add tag to document
router.post('/:id/tags/:tagId', async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);
    
    if (isNaN(documentId) || isNaN(tagId)) {
      return res.status(400).json({ error: 'Invalid document or tag ID' });
    }

    await storage.addTagToDocument(documentId, tagId);
    res.json({ message: 'Tag added to document successfully' });
  } catch (error) {
    console.error('Error adding tag to document:', error);
    res.status(500).json({ error: 'Failed to add tag to document' });
  }
});

// DELETE /api/documents/:id/tags/:tagId - Remove tag from document
router.delete('/:id/tags/:tagId', async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);
    
    if (isNaN(documentId) || isNaN(tagId)) {
      return res.status(400).json({ error: 'Invalid document or tag ID' });
    }

    await storage.removeTagFromDocument(documentId, tagId);
    res.json({ message: 'Tag removed from document successfully' });
  } catch (error) {
    console.error('Error removing tag from document:', error);
    res.status(500).json({ error: 'Failed to remove tag from document' });
  }
});

// Document Collections Routes (continued from above)

// GET /api/documents/collections/type/:type - Get collections by type
router.get('/collections/type/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const collections = await storage.getCollectionsByType(type);
    res.json(collections);
  } catch (error) {
    console.error('Error fetching collections by type:', error);
    res.status(500).json({ error: 'Failed to fetch collections by type' });
  }
});

// GET /api/documents/collections/:id - Get single collection
router.get('/collections/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    const collection = await storage.getCollection(id);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json(collection);
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
});

// POST /api/documents/collections - Create new collection
router.post('/collections', async (req, res) => {
  try {
    const validatedData = insertDocumentCollectionSchema.parse(req.body);
    const collection = await storage.createCollection(validatedData);
    res.status(201).json(collection);
  } catch (error) {
    console.error('Error creating collection:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid collection data', details: error.errors });
    }
    
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

// PUT /api/documents/collections/:id - Update collection
router.put('/collections/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    const updateData = insertDocumentCollectionSchema.partial().parse(req.body);
    const collection = await storage.updateCollection(id, updateData);
    res.json(collection);
  } catch (error) {
    console.error('Error updating collection:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid collection data', details: error.errors });
    }
    
    res.status(500).json({ error: 'Failed to update collection' });
  }
});

// DELETE /api/documents/collections/:id - Delete collection
router.delete('/collections/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    await storage.deleteCollection(id);
    res.json({ message: 'Collection deleted successfully' });
  } catch (error) {
    console.error('Error deleting collection:', error);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

// GET /api/documents/collections/:id/documents - Get documents in collection
router.get('/collections/:id/documents', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    const documents = await storage.getCollectionDocuments(id);
    res.json(documents);
  } catch (error) {
    console.error('Error fetching collection documents:', error);
    res.status(500).json({ error: 'Failed to fetch collection documents' });
  }
});

// POST /api/documents/collections/:id/documents/:documentId - Add document to collection
router.post('/collections/:id/documents/:documentId', async (req, res) => {
  try {
    const collectionId = parseInt(req.params.id);
    const documentId = parseInt(req.params.documentId);
    
    if (isNaN(collectionId) || isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid collection or document ID' });
    }

    const { relationshipType = 'primary', displayOrder = 0, addedBy } = req.body;

    await storage.addDocumentToCollection(
      collectionId, 
      documentId, 
      relationshipType, 
      displayOrder, 
      addedBy ? parseInt(addedBy) : undefined
    );
    
    res.json({ message: 'Document added to collection successfully' });
  } catch (error) {
    console.error('Error adding document to collection:', error);
    res.status(500).json({ error: 'Failed to add document to collection' });
  }
});

// DELETE /api/documents/collections/:id/documents/:documentId - Remove document from collection
router.delete('/collections/:id/documents/:documentId', async (req, res) => {
  try {
    const collectionId = parseInt(req.params.id);
    const documentId = parseInt(req.params.documentId);
    
    if (isNaN(collectionId) || isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid collection or document ID' });
    }

    await storage.removeDocumentFromCollection(collectionId, documentId);
    res.json({ message: 'Document removed from collection successfully' });
  } catch (error) {
    console.error('Error removing document from collection:', error);
    res.status(500).json({ error: 'Failed to remove document from collection' });
  }
});

export default router;