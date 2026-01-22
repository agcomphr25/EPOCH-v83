import { Router } from 'express';
import { db, pool } from '../../db';
import { mediaLibrary, mediaAttachments } from '../../schema';
import { eq, desc, and, ilike, or, inArray, sql } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { ObjectStorageService, ObjectNotFoundError } from '../../replit_integrations/object_storage';

const router = Router();
const objectStorageService = new ObjectStorageService();

// Configure multer for temporary file uploads (will be moved to cloud storage)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'media-library');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${randomUUID()}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 
      'image/png', 
      'image/gif', 
      'image/webp', 
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'application/csv',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: images, PDF, Word, Excel, text, and CSV files.`));
    }
  }
});

// Request a presigned URL for cloud storage upload
router.post('/request-upload-url', async (req, res) => {
  try {
    const { name, size, contentType } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType },
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Complete upload - save metadata to database after cloud upload
router.post('/complete-upload', async (req, res) => {
  try {
    const { objectPath, filename, mimeType, fileSize, title, notes, tags, category } = req.body;
    const user = (req as any).user;

    if (!objectPath || !filename) {
      return res.status(400).json({ error: 'Missing required fields: objectPath, filename' });
    }

    const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : null;

    // Set ACL policy for the uploaded object (make it publicly readable)
    try {
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: user?.id?.toString() || 'system',
        visibility: 'public',
      });
    } catch (aclError) {
      console.warn('Failed to set ACL policy:', aclError);
      // Continue even if ACL fails - file is still accessible
    }

    const [newMedia] = await db.insert(mediaLibrary).values({
      filename: filename,
      storagePath: objectPath, // Store the cloud object path
      mimeType: mimeType || 'application/octet-stream',
      fileSize: fileSize || 0,
      capturedById: user?.id || null,
      capturedByName: user?.username || 'Unknown',
      title: title || filename,
      notes: notes || null,
      tags: parsedTags,
      category: category || 'other',
    }).returning();

    res.json(newMedia);
  } catch (error) {
    console.error('Error completing upload:', error);
    res.status(500).json({ error: 'Failed to complete upload' });
  }
});

// Legacy upload endpoint (for backward compatibility - uses local storage)
router.post('/upload', (req, res, next) => {
  console.log('[UPLOAD DEBUG] Starting upload request');
  
  upload.single('file')(req, res, async (err) => {
    console.log('[UPLOAD DEBUG] Multer callback triggered');
    console.log('[UPLOAD DEBUG] req.file:', req.file ? { 
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      filename: req.file.filename
    } : 'NO FILE');
    console.log('[UPLOAD DEBUG] req.body:', req.body);
    
    if (err) {
      console.error('[UPLOAD DEBUG] Multer error:', err.message);
      return res.status(400).json({ 
        success: false, 
        fileReceived: false, 
        fileStored: false, 
        documentId: null,
        error: err.message 
      });
    }
    
    try {
      if (!req.file) {
        console.error('[UPLOAD DEBUG] No file in request');
        return res.status(400).json({ 
          success: false, 
          fileReceived: false, 
          fileStored: false, 
          documentId: null,
          error: 'No file uploaded' 
        });
      }

      const { title, notes, tags, category } = req.body;
      const user = (req as any).user;
      const finalCategory = category || 'other';

      console.log('[UPLOAD DEBUG] Category received:', category, '-> Using:', finalCategory);
      console.log('[UPLOAD DEBUG] User:', user?.username || 'Unknown');

      const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : null;

      // Verify file exists on disk
      const filePath = path.join(process.cwd(), 'uploads', 'media-library', req.file.filename);
      const fileExists = fs.existsSync(filePath);
      console.log('[UPLOAD DEBUG] File path:', filePath);
      console.log('[UPLOAD DEBUG] File exists on disk:', fileExists);

      if (!fileExists) {
        console.error('[UPLOAD DEBUG] File not found on disk after upload');
        return res.status(500).json({ 
          success: false, 
          fileReceived: true, 
          fileStored: false, 
          documentId: null,
          error: 'File storage failed' 
        });
      }

      const insertValues = {
        filename: req.file.originalname,
        storagePath: `uploads/media-library/${req.file.filename}`,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        capturedById: user?.id || null,
        capturedByName: user?.username || 'Unknown',
        title: title || req.file.originalname,
        notes: notes || null,
        tags: parsedTags,
        category: finalCategory,
      };

      console.log('[UPLOAD DEBUG] Inserting into DB:', insertValues);

      const result = await db.insert(mediaLibrary).values(insertValues).returning();
      
      console.log('[UPLOAD DEBUG] DB insert result:', result);

      if (!result || result.length === 0) {
        console.error('[UPLOAD DEBUG] DB insert returned no rows');
        return res.status(500).json({ 
          success: false, 
          fileReceived: true, 
          fileStored: true, 
          documentId: null,
          error: 'Database insert failed' 
        });
      }

      const newMedia = result[0];
      console.log('[UPLOAD DEBUG] SUCCESS - Document ID:', newMedia.id);

      res.json({ 
        success: true, 
        fileReceived: true, 
        fileStored: true, 
        documentId: newMedia.id,
        ...newMedia 
      });
    } catch (error: any) {
      console.error('[UPLOAD DEBUG] Exception:', error);
      res.status(500).json({ 
        success: false, 
        fileReceived: !!req.file, 
        fileStored: false, 
        documentId: null,
        error: error.message || 'Failed to upload media' 
      });
    }
  });
});

// Get all media items (with filtering)
router.get('/', async (req, res) => {
  try {
    const { search, category, includeArchived } = req.query;
    
    // Use pg pool to avoid drizzle schema issues with newly created table
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (!includeArchived || includeArchived === 'false') {
      conditions.push('(is_archived = false OR is_archived IS NULL)');
    }
    
    if (category && category !== 'all') {
      conditions.push(`category = $${paramIndex++}`);
      params.push(category);
    }
    
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(`(title ILIKE $${paramIndex} OR filename ILIKE $${paramIndex} OR notes ILIKE $${paramIndex} OR captured_by_name ILIKE $${paramIndex})`);
      params.push(searchTerm);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT 
        id, filename, storage_path as "storagePath", mime_type as "mimeType", 
        file_size as "fileSize", captured_by_id as "capturedById", 
        captured_by_name as "capturedByName", capture_date as "captureDate",
        title, notes, tags, category, thumbnail_path as "thumbnailPath",
        is_archived as "isArchived", created_at as "createdAt", updated_at as "updatedAt"
      FROM media_library 
      ${whereClause}
      ORDER BY capture_date DESC NULLS LAST
    `, params);

    res.json(result || []);
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// Serve media files - supports both cloud storage and local files
router.get('/file/:filename', async (req, res) => {
  // First try local file
  const localFilePath = path.join(process.cwd(), 'uploads', 'media-library', req.params.filename);
  if (fs.existsSync(localFilePath)) {
    return res.sendFile(localFilePath);
  }
  
  // If not found locally, return 404 (cloud files are served via /objects/ route)
  res.status(404).json({ error: 'File not found' });
});

// Serve cloud storage files by object path
router.get('/cloud/:path(*)', async (req, res) => {
  try {
    const objectPath = `/objects/${req.params.path}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    await objectStorageService.downloadObject(objectFile, res);
  } catch (error) {
    console.error('Error serving cloud file:', error);
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: 'File not found' });
    }
    return res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Get a single media item
router.get('/:id', async (req, res) => {
  try {
    const [media] = await db.select()
      .from(mediaLibrary)
      .where(eq(mediaLibrary.id, req.params.id));

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    res.json(media);
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// Update a media item
router.patch('/:id', async (req, res) => {
  try {
    const { title, notes, tags, category, isArchived } = req.body;

    const [updated] = await db.update(mediaLibrary)
      .set({
        title,
        notes,
        tags,
        category,
        isArchived,
        updatedAt: new Date(),
      })
      .where(eq(mediaLibrary.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Media not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating media:', error);
    res.status(500).json({ error: 'Failed to update media' });
  }
});

// Delete a media item
router.delete('/:id', async (req, res) => {
  try {
    const [media] = await db.select()
      .from(mediaLibrary)
      .where(eq(mediaLibrary.id, req.params.id));

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Delete local file if it exists (for legacy uploads)
    if (media.storagePath && media.storagePath.startsWith('uploads/')) {
      const filePath = path.join(process.cwd(), media.storagePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    // Note: Cloud storage files could also be deleted here if needed
    // For now, we'll leave orphaned cloud files (they can be cleaned up later)

    // Delete from database (attachments will cascade)
    await db.delete(mediaLibrary).where(eq(mediaLibrary.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting media:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// --- Attachment Routes ---

// Attach media to an entity
router.post('/attachments', async (req, res) => {
  try {
    const { mediaId, entityType, entityId, notes } = req.body;
    const user = (req as any).user;

    // Check if already attached
    const existing = await db.select()
      .from(mediaAttachments)
      .where(and(
        eq(mediaAttachments.mediaId, mediaId),
        eq(mediaAttachments.entityType, entityType),
        eq(mediaAttachments.entityId, entityId)
      ));

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Media already attached to this entity' });
    }

    const [attachment] = await db.insert(mediaAttachments).values({
      mediaId,
      entityType,
      entityId,
      attachedById: user?.id || null,
      attachedByName: user?.username || 'Unknown',
      notes,
    }).returning();

    res.json(attachment);
  } catch (error) {
    console.error('Error creating attachment:', error);
    res.status(500).json({ error: 'Failed to create attachment' });
  }
});

// Get attachments for an entity
router.get('/attachments/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    const attachments = await db.select({
      attachment: mediaAttachments,
      media: mediaLibrary,
    })
      .from(mediaAttachments)
      .innerJoin(mediaLibrary, eq(mediaAttachments.mediaId, mediaLibrary.id))
      .where(and(
        eq(mediaAttachments.entityType, entityType),
        eq(mediaAttachments.entityId, entityId)
      ))
      .orderBy(desc(mediaAttachments.attachedAt));

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// Detach media from an entity
router.delete('/attachments/:id', async (req, res) => {
  try {
    await db.delete(mediaAttachments).where(eq(mediaAttachments.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// Get all entities that reference a media item
router.get('/:id/references', async (req, res) => {
  try {
    const attachments = await db.select()
      .from(mediaAttachments)
      .where(eq(mediaAttachments.mediaId, req.params.id));

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching references:', error);
    res.status(500).json({ error: 'Failed to fetch references' });
  }
});

export default router;
