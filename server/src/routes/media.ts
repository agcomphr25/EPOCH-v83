import { Router } from 'express';
import { db, pool } from '../../db';
import { mediaLibrary, mediaAttachments, mediaFolders, onboardingSessionDocuments, onboardingSessionCaptures } from '../../schema';
import { eq, desc, and, ilike, or, inArray, sql, isNull } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { ObjectNotFoundError } from '../../replit_integrations/object_storage';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
  getStorageErrorResponse,
} from '../services/fileStorageProvider';
import { registerMediaLibraryFile } from '../services/mediaLibraryService';

const router = Router();

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

    const uploadTarget = await getFileStorageProvider().createUploadTarget({
      fileName: name,
      contentType,
      scope: 'media-library',
    });

    res.json({
      uploadURL: uploadTarget.uploadURL,
      objectPath: uploadTarget.objectPath,
      provider: uploadTarget.provider,
      metadata: { name, size, contentType },
    });
  } catch (error) {
    const { status, reason, message } = getStorageErrorResponse(error);
    console.error('Error generating upload URL:', { status, reason, message });
    res.status(status).json({ error: 'Failed to generate upload URL', reason, details: message });
  }
});

// Complete upload - save metadata to database after cloud upload
router.post('/complete-upload', async (req, res) => {
  try {
    const { objectPath, filename, mimeType, fileSize, title, notes, tags, category, folderId } = req.body;
    const user = (req as any).user;

    if (!objectPath || !filename) {
      return res.status(400).json({ error: 'Missing required fields: objectPath, filename' });
    }

    const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];

    // Set ACL policy for the uploaded object (make it publicly readable)
    try {
      await getFileStorageProviderForObjectPath(objectPath).setPublicReadPolicy(
        objectPath,
        user?.id?.toString() || 'system',
      );
    } catch (aclError) {
      console.warn('Failed to set ACL policy:', aclError);
      // Continue even if ACL fails - file is still accessible
    }

    const newMedia = await registerMediaLibraryFile({
      filename: filename,
      storagePath: objectPath, // Store the cloud object path
      mimeType: mimeType || 'application/octet-stream',
      fileSize: fileSize || 0,
      folderId: folderId || null, // Support folder placement
      capturedById: user?.id || null,
      capturedByName: user?.username || 'Unknown',
      title: title || filename,
      notes: notes || null,
      tags: parsedTags,
      category: category || 'other',
    });

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

      const { title, notes, tags, category, folderId } = req.body;
      const user = (req as any).user;
      const finalCategory = category || 'other';

      console.log('[UPLOAD DEBUG] Category received:', category, '-> Using:', finalCategory);
      console.log('[UPLOAD DEBUG] Folder ID:', folderId || 'root');
      console.log('[UPLOAD DEBUG] User:', user?.username || 'Unknown');

      const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];

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
        folderId: folderId || null,
        capturedByName: user?.username || 'Unknown',
        title: title || req.file.originalname,
        notes: notes || null,
        tags: parsedTags,
        category: finalCategory,
      };

      console.log('[UPLOAD DEBUG] Inserting into DB:', insertValues);

      // DRIVER GUARDRAIL:
      // Do NOT depend on result.rows - database drivers (e.g., Neon, pg pool wrapper)
      // may not return pg-style result objects. Our pool.query() returns rows directly
      // as an array. Success is determined by:
      // 1. Absence of a thrown error (query execution completed)
      // 2. RETURNING clause provides the inserted row(s)
      // If this query fails, it throws an exception - reaching the next line means success.
      const rows = await pool.query(
        `INSERT INTO media_library (filename, storage_path, mime_type, file_size, folder_id, captured_by_name, title, notes, tags, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, filename, storage_path, mime_type, file_size, folder_id, title, category, created_at`,
        [
          insertValues.filename,
          insertValues.storagePath,
          insertValues.mimeType,
          insertValues.fileSize,
          insertValues.folderId,
          insertValues.capturedByName,
          insertValues.title,
          insertValues.notes,
          insertValues.tags,
          insertValues.category
        ]
      );
      
      console.log('[UPLOAD DEBUG] DB insert result (rows array):', rows);

      // rows is the array directly, not rows.rows
      const newMedia = rows[0];
      console.log('[UPLOAD DEBUG] SUCCESS - Document ID:', newMedia?.id);

      res.json({ 
        success: true, 
        fileReceived: true, 
        fileStored: true, 
        documentId: newMedia?.id || null,
        ...newMedia 
      });
    } catch (error: any) {
      console.error('[UPLOAD DEBUG] Exception:', error);
      
      // ATOMICITY: Clean up the orphaned file on disk if DB insert failed
      if (req.file) {
        const orphanedFilePath = path.join(process.cwd(), 'uploads', 'media-library', req.file.filename);
        try {
          if (fs.existsSync(orphanedFilePath)) {
            fs.unlinkSync(orphanedFilePath);
            console.log('[UPLOAD DEBUG] Cleaned up orphaned file:', orphanedFilePath);
          }
        } catch (cleanupError) {
          console.error('[UPLOAD DEBUG] Failed to clean up orphaned file:', cleanupError);
        }
      }
      
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
        file_size as "fileSize", folder_id as "folderId", captured_by_id as "capturedById", 
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
  const filename = req.params.filename;
  
  // First try local file
  const localFilePath = path.join(process.cwd(), 'uploads', 'media-library', filename);
  if (fs.existsSync(localFilePath)) {
    return res.sendFile(localFilePath);
  }
  
  // Local file not found - check database for cloud storage path
  try {
    const result = await pool.query(
      `SELECT storage_path, mime_type, filename FROM media_library 
       WHERE storage_path LIKE $1 
       OR filename = $2
       LIMIT 1`,
      [`%${filename}`, filename]
    );
    
    const record = Array.isArray(result) ? result[0] : result?.rows?.[0];
    
    if (record && record.storage_path) {
      // Check if there's a cloud storage version (object storage path)
      if (record.storage_path.startsWith('/objects/') || record.storage_path.startsWith('objects/')) {
        const objectPath = record.storage_path.startsWith('/') ? record.storage_path : `/${record.storage_path}`;
        try {
          if (record.mime_type) {
            res.setHeader('Content-Type', record.mime_type);
          }
          if (record.filename) {
            res.setHeader('Content-Disposition', `inline; filename="${record.filename}"`);
          }
          return await getFileStorageProviderForObjectPath(objectPath).downloadObject(objectPath, res);
        } catch (objError) {
          console.error('Cloud storage file not found:', objError);
        }
      }
    }
  } catch (dbError) {
    console.error('Error looking up media file in database:', dbError);
  }
  
  // Neither local nor cloud storage found
  res.status(404).json({ 
    error: 'File not found - this file was uploaded before cloud storage was enabled and is no longer available on the server. Please re-upload the file through the Media Library.' 
  });
});

// Serve cloud storage files by object path
router.get('/cloud/:path(*)', async (req, res) => {
  try {
    const objectPath = `/objects/${req.params.path}`;
    await getFileStorageProviderForObjectPath(objectPath).downloadObject(objectPath, res);
  } catch (error) {
    console.error('Error serving cloud file:', error);
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: 'File not found' });
    }
    return res.status(500).json({ error: 'Failed to serve file' });
  }
});

// =====================
// FOLDER MANAGEMENT ROUTES
// NOTE: These must be defined BEFORE /:id routes to avoid "folders" being treated as a UUID
// =====================

// Get all folders (with hierarchy)
router.get('/folders', async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT 
        id, name, parent_id as "parentId", visible_to_roles as "visibleToRoles",
        created_by_id as "createdById", created_by_name as "createdByName",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM media_folders
      ORDER BY name ASC
    `);
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Create a new folder
router.post('/folders', async (req, res) => {
  try {
    const { name, parentId, visibleToRoles } = req.body;
    const user = (req as any).user;

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const rows = await pool.query(
      `INSERT INTO media_folders (name, parent_id, visible_to_roles, created_by_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, parent_id as "parentId", visible_to_roles as "visibleToRoles", created_at as "createdAt"`,
      [name, parentId || null, visibleToRoles || null, null, user?.username || 'Unknown']
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Update a folder
router.patch('/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parentId, visibleToRoles } = req.body;

    const rows = await pool.query(
      `UPDATE media_folders 
       SET name = COALESCE($1, name), 
           parent_id = $2, 
           visible_to_roles = COALESCE($3, visible_to_roles),
           updated_at = now()
       WHERE id = $4
       RETURNING id, name, parent_id as "parentId", visible_to_roles as "visibleToRoles"`,
      [name, parentId, visibleToRoles, id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Delete a folder (moves contents to root)
router.delete('/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Move all documents in this folder to root (null folder_id)
    await pool.query(
      `UPDATE media_library SET folder_id = NULL WHERE folder_id = $1`,
      [id]
    );

    // Move all child folders to root (null parent_id)
    await pool.query(
      `UPDATE media_folders SET parent_id = NULL WHERE parent_id = $1`,
      [id]
    );

    // Delete the folder
    await pool.query(`DELETE FROM media_folders WHERE id = $1`, [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Move a document to a different folder
// NOTE: Must be defined BEFORE generic /:id routes to avoid route interception
router.patch('/:id/move', async (req, res) => {
  try {
    const { id } = req.params;
    const { folderId } = req.body;

    const rows = await pool.query(
      `UPDATE media_library 
       SET folder_id = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, folder_id as "folderId"`,
      [folderId || null, id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error moving document:', error);
    res.status(500).json({ error: 'Failed to move document' });
  }
});

// Get a single media item
// Download/serve a media file by ID - handles both cloud and legacy storage
router.get('/:id/download', async (req, res) => {
  try {
    const [media] = await db.select()
      .from(mediaLibrary)
      .where(eq(mediaLibrary.id, req.params.id));

    if (!media) {
      return res.status(404).send('<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>File Not Found</h2><p>This file could not be found.</p></body></html>');
    }

    const storagePath = media.storagePath;

    // Cloud storage paths
    if (storagePath && (storagePath.startsWith('/objects/') || storagePath.startsWith('objects/'))) {
      const objectPath = storagePath.startsWith('/') ? storagePath : `/${storagePath}`;
      try {
        if (media.mimeType) res.setHeader('Content-Type', media.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${media.filename || 'file'}"`);
        return await getFileStorageProviderForObjectPath(objectPath).downloadObject(objectPath, res);
      } catch (objError) {
        console.error('Cloud storage download failed:', objError);
      }
    }

    // Legacy local file path
    if (storagePath) {
      const localPath = path.join(process.cwd(), storagePath);
      if (fs.existsSync(localPath)) {
        if (media.mimeType) res.setHeader('Content-Type', media.mimeType);
        return res.sendFile(localPath);
      }
      // Also try just the filename portion
      const filename = storagePath.split('/').pop();
      if (filename) {
        const altPath = path.join(process.cwd(), 'uploads', 'media-library', filename);
        if (fs.existsSync(altPath)) {
          if (media.mimeType) res.setHeader('Content-Type', media.mimeType);
          return res.sendFile(altPath);
        }
      }
    }

    // File is not available
    res.status(404).send(
      `<html><body style="font-family:sans-serif;padding:40px;text-align:center">` +
      `<h2>File Not Available</h2>` +
      `<p><strong>${media.filename || 'This file'}</strong> was uploaded before cloud storage was enabled and is no longer available on the server.</p>` +
      `<p>Please re-upload this file through the Media Library.</p>` +
      `</body></html>`
    );
  } catch (error) {
    console.error('Error downloading media:', error);
    res.status(500).json({ error: 'Failed to download media' });
  }
});

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

    // Null out references in tables that lack ON DELETE CASCADE/SET NULL
    await db.update(onboardingSessionDocuments)
      .set({ mediaItemId: null })
      .where(eq(onboardingSessionDocuments.mediaItemId, req.params.id));

    await db.update(onboardingSessionCaptures)
      .set({ mediaItemId: null })
      .where(eq(onboardingSessionCaptures.mediaItemId, req.params.id));

    // Delete from database (media_attachments and signature_requests cascade/set-null automatically)
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
