import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { db } from '../../../server/db';
import { pool } from '../../../server/db';
import { requirePermission } from '../../../server/middleware/requirePermission';
import { controlledDocuments, documentVersionHistory, insertControlledDocumentSchema, insertDocumentVersionHistorySchema } from '../../../server/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { z } from 'zod';
import Papa from 'papaparse';
import { requireStepUp } from '../../../server/middleware/auth';
import { writeAccessLog } from './vault';

const router = Router();

// Helper function to get user from session
async function getUserFromSession(req: Request): Promise<any | null> {
  const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
  
  if (!sessionToken) {
    return null;
  }

  try {
    // Query database for session — enforce is_active so revoked/superseded sessions are rejected
    const result = await pool.query(
      `SELECT user_id, username, expires_at
       FROM user_sessions
       WHERE session_token = $1 AND is_active = true AND expires_at > NOW()`,
      [sessionToken]
    );

    if (!result || result.length === 0) {
      return null;
    }

    const session = result[0];

    // Belt-and-suspenders expiry check (the SQL above already filters these out)
    if (new Date(session.expires_at) < new Date()) {
      await pool.query(`UPDATE user_sessions SET is_active = false WHERE session_token = $1`, [sessionToken]);
      return null;
    }

    // Get user data from database
    const dbUserResult = await pool.query(
      `SELECT id, username, role FROM users WHERE username = $1 AND is_active = true`,
      [session.username.toLowerCase()]
    );

    if (dbUserResult && dbUserResult.length > 0) {
      return dbUserResult[0];
    }

    return null;
  } catch (error) {
    console.error('Error getting user from session:', error);
    return null;
  }
}

// Authentication middleware - runs before all other route handlers
const requireAuth = async (req: Request, res: Response, next: any) => {
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  (req as any).user = user;
  next();
};

// Authorization middleware - check for admin/owner role
const requireAdminOrOwner = async (req: Request, res: Response, next: any) => {
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (user.role !== 'ADMIN' && user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Only admins and owners can perform this action' });
  }
  (req as any).user = user;
  next();
};

// Authorization middleware for document create/edit - admin, owner, or designated document managers
const requireDocumentEditor = async (req: Request, res: Response, next: any) => {
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const documentManagers = ['lauriet'];
  if (user.role !== 'ADMIN' && user.role !== 'OWNER' && !documentManagers.includes(user.username)) {
    return res.status(403).json({ error: 'You do not have permission to create or edit documents' });
  }
  (req as any).user = user;
  next();
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'server/src/assets/documents');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(pdf|docx?|xlsx?|txt|jpg|jpeg|png)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Word, Excel, Text, Images'));
    }
  }
});

// Separate multer configuration for CSV imports
const csvUpload = multer({
  storage: multer.memoryStorage(), // Store in memory for CSV parsing
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for CSV
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV files are allowed.'));
    }
  }
});

// Get all controlled documents (authenticated users only)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const docs = await db.select().from(controlledDocuments).orderBy(desc(controlledDocuments.createdAt));
    res.json(docs);
  } catch (error) {
    console.error('Error fetching controlled documents:', error);
    res.status(500).json({ error: 'Failed to fetch controlled documents' });
  }
});

// Get single document by ID (authenticated users only)
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const [doc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(doc);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Get version history for a document (authenticated users only)
router.get('/:id/versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const versions = await db
      .select()
      .from(documentVersionHistory)
      .where(eq(documentVersionHistory.documentId, req.params.id))
      .orderBy(desc(documentVersionHistory.createdAt));
    
    res.json(versions);
  } catch (error) {
    console.error('Error fetching version history:', error);
    res.status(500).json({ error: 'Failed to fetch version history' });
  }
});

// Create new document with file upload (admin/owner/document managers only)
// Auth middleware runs BEFORE upload to prevent anonymous file uploads
router.post('/', requireDocumentEditor, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user!; // Guaranteed by middleware
    const {
      documentNumber,
      documentName,
      templateKey,
      documentType,
      department,
      category,
      description,
      currentVersion,
      versionDate,
      originationDate,
      retentionLength,
      documentOwner,
      classification,
      cuiCategory,
      itarCategory,
      exportControlJurisdiction,
      customerId,
      contractArtifactType,
      accessRule,
      mfaRequired
    } = req.body;
    
    const createdBy = user.username; // Use authenticated user

    const filePath = req.file ? `/assets/documents/${req.file.filename}` : null;

    // Calculate expiration date (1 year from now)
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    const [newDoc] = await db.insert(controlledDocuments).values({
      documentNumber,
      documentName,
      templateKey: templateKey || null,
      documentType,
      department,
      category,
      description,
      currentVersion: currentVersion || '1.0',
      versionDate: versionDate || null,
      originationDate: originationDate || null,
      status: 'pending',
      retentionLength,
      documentOwner,
      filePath,
      classification: classification || 'internal',
      cuiCategory: cuiCategory || null,
      itarCategory: itarCategory || null,
      exportControlJurisdiction: exportControlJurisdiction || null,
      customerId: customerId || null,
      contractArtifactType: contractArtifactType || null,
      accessRule: accessRule || (classification === 'classified' || classification === 'restricted' ? 'explicit_grant' : 'authenticated'),
      mfaRequired: mfaRequired === 'true' || mfaRequired === true || classification === 'classified' || classification === 'restricted',
      downloadTrackingRequired: true,
      createdBy,
      expirationDate: expirationDate.toISOString().split('T')[0],
    }).returning();

    // Create initial version history entry
    await db.insert(documentVersionHistory).values({
      documentId: newDoc.id,
      versionNumber: currentVersion || '1.0',
      changeDescription: 'Initial version',
      changeType: 'major',
      filePath,
      status: 'pending',
      createdBy,
      expirationDate: expirationDate.toISOString().split('T')[0],
    });

    res.status(201).json(newDoc);
  } catch (error: any) {
    console.error('Error creating document:', error);
    res.status(500).json({
      error: 'Failed to create document',
      details: error?.message || String(error),
    });
  }
});

// Update document / Create new version (admin/owner/document managers only)
// Auth middleware runs BEFORE upload to prevent anonymous file uploads
router.put('/:id', requireDocumentEditor, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user!; // Guaranteed by middleware
    const {
      createNewVersion,
      versionType, // 'major' or 'minor'
      changeDescription,
      documentName,
      templateKey,
      documentType,
      department,
      category,
      description,
      versionDate,
      originationDate,
      retentionLength,
      documentOwner,
      classification,
      cuiCategory,
      itarCategory,
      exportControlJurisdiction,
      customerId,
      contractArtifactType,
      accessRule,
      mfaRequired
    } = req.body;
    
    const createdBy = user.username; // Use authenticated user

    const [existingDoc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));

    if (!existingDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    let newVersion = existingDoc.currentVersion;
    let filePath = existingDoc.filePath;

    if (createNewVersion === 'true' || createNewVersion === true) {
      // Validate that file is uploaded when creating new version
      if (!req.file) {
        return res.status(400).json({ 
          error: 'File upload is required when creating a new version' 
        });
      }

      // Calculate new version number
      const [major, minor] = existingDoc.currentVersion.split('.').map(Number);
      if (versionType === 'major') {
        newVersion = `${major + 1}.0`;
      } else {
        newVersion = `${major}.${minor + 1}`;
      }

      // Use the newly uploaded file
      filePath = `/assets/documents/${req.file.filename}`;

      // Calculate new expiration date (1 year from now)
      const now = new Date();
      const expirationDate = new Date(now);
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);

      // Create version history entry
      await db.insert(documentVersionHistory).values({
        documentId: req.params.id,
        versionNumber: newVersion,
        changeDescription: changeDescription || 'Document updated',
        changeType: versionType,
        filePath,
        status: 'pending',
        createdBy,
        expirationDate: expirationDate.toISOString().split('T')[0],
      });

      // Update main document
      const [updatedDoc] = await db
        .update(controlledDocuments)
        .set({
          currentVersion: newVersion,
          status: 'pending',
          filePath,
          documentName,
          templateKey: templateKey || existingDoc.templateKey,
          documentType,
          department,
          category,
          description,
          versionDate: versionDate || existingDoc.versionDate,
          originationDate: originationDate || existingDoc.originationDate,
          retentionLength,
          documentOwner,
          classification: classification || existingDoc.classification,
          cuiCategory: cuiCategory || null,
          itarCategory: itarCategory || null,
          exportControlJurisdiction: exportControlJurisdiction || null,
          customerId: customerId || null,
          contractArtifactType: contractArtifactType || null,
          accessRule: accessRule || existingDoc.accessRule || 'authenticated',
          mfaRequired: mfaRequired === 'true' || mfaRequired === true || existingDoc.mfaRequired,
          expirationDate: expirationDate.toISOString().split('T')[0],
          updatedAt: new Date(),
        })
        .where(eq(controlledDocuments.id, req.params.id))
        .returning();

      res.json(updatedDoc);
    } else {
      // Just update metadata without versioning
      if (req.file) {
        filePath = `/assets/documents/${req.file.filename}`;
      }

      const [updatedDoc] = await db
        .update(controlledDocuments)
        .set({
          documentName,
          templateKey: templateKey || existingDoc.templateKey,
          documentType,
          department,
          category,
          description,
          versionDate: versionDate || existingDoc.versionDate,
          originationDate: originationDate || existingDoc.originationDate,
          retentionLength,
          documentOwner,
          filePath,
          classification: classification || existingDoc.classification,
          cuiCategory: cuiCategory || null,
          itarCategory: itarCategory || null,
          exportControlJurisdiction: exportControlJurisdiction || null,
          customerId: customerId || null,
          contractArtifactType: contractArtifactType || null,
          accessRule: accessRule || existingDoc.accessRule || 'authenticated',
          mfaRequired: mfaRequired === 'true' || mfaRequired === true || existingDoc.mfaRequired,
          updatedAt: new Date(),
        })
        .where(eq(controlledDocuments.id, req.params.id))
        .returning();

      res.json(updatedDoc);
    }
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Approve document — requires documents.approve capability
router.post('/:id/approve', requirePermission('documents.approve'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { effectiveDate } = req.body;
    const approvedBy = user.username; // Use session username, not client input

    const [existingDoc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));

    if (!existingDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const approvalDate = new Date();
    const effectiveDateObj = effectiveDate ? new Date(effectiveDate) : approvalDate;
    
    // Calculate expiration date (1 year from effective date)
    const expirationDate = new Date(effectiveDateObj);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    // Update main document
    const [updatedDoc] = await db
      .update(controlledDocuments)
      .set({
        status: 'approved',
        effectiveDate: effectiveDateObj.toISOString().split('T')[0],
        expirationDate: expirationDate.toISOString().split('T')[0],
        updatedAt: new Date(),
      })
      .where(eq(controlledDocuments.id, req.params.id))
      .returning();

    // Update version history for current version
    await db
      .update(documentVersionHistory)
      .set({
        status: 'approved',
        approvedBy,
        approvedAt: approvalDate,
        effectiveDate: effectiveDateObj.toISOString().split('T')[0],
        expirationDate: expirationDate.toISOString().split('T')[0],
      })
      .where(and(
        eq(documentVersionHistory.documentId, req.params.id),
        eq(documentVersionHistory.versionNumber, existingDoc.currentVersion)
      ));

    res.json(updatedDoc);
  } catch (error) {
    console.error('Error approving document:', error);
    res.status(500).json({ error: 'Failed to approve document' });
  }
});

// View PDF document file inline - requires authentication + step-up re-auth (credentials verified within 30 min)
// ACL enforcement: restricted/classified docs require an explicit vault access grant or admin/owner role
router.get('/:id/view', requireAuth, requireStepUp(), async (req: Request, res: Response) => {
  const actor = (req as any).user as { id: number; username: string; role: string };
  const ipAddress = (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );

  try {
    const [doc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // ACL enforcement for restricted/classified documents
    const classification = (doc as any).classification ?? 'internal';
    if (classification === 'restricted' || classification === 'classified') {
      const isAdminOrOwner = actor.role === 'ADMIN' || actor.role === 'OWNER';
      if (!isAdminOrOwner) {
        // Check for explicit vault grant
        const grantCheck = await pool.query<{ id: number }>(
          `SELECT id FROM vault_access_grants WHERE document_id = $1 AND (
             (grantee_type = 'user' AND grantee_name = $2)
             OR (grantee_type = 'role' AND grantee_name = $3)
           ) LIMIT 1`,
          [doc.id, actor.username, actor.role]
        );
        if (!grantCheck || grantCheck.length === 0) {
          // Write denied log entry — never silently discard
          await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'denied', ipAddress });
          return res.status(403).json({ error: 'Access denied: insufficient clearance for this document' });
        }
      }
    }

    if (!doc.filePath) {
      return res.status(404).json({ error: 'No file attached to this document' });
    }

    // Strip leading slash from filePath before joining
    const relativePath = doc.filePath.replace(/^\//, '');
    const filePath = path.join(process.cwd(), 'server/src', relativePath);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
    }

    if (path.extname(filePath).toLowerCase() !== '.pdf') {
      return res.status(415).json({ error: 'Only PDF documents can be viewed inline' });
    }

    // Write view access log entry before sending the file
    await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'view', ipAddress });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error viewing document:', error);
    res.status(500).json({ error: 'Failed to view document' });
  }
});

// Download document file - requires authentication + step-up re-auth (credentials verified within 30 min)
// ACL enforcement: restricted/classified docs require an explicit vault access grant or admin/owner role
router.get('/:id/download', requireAuth, requireStepUp(), async (req: Request, res: Response) => {
  const actor = (req as any).user as { id: number; username: string; role: string };
  const ipAddress = (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );

  try {
    const [doc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // ACL enforcement for restricted/classified documents
    const classification = (doc as any).classification ?? 'internal';
    if (classification === 'restricted' || classification === 'classified') {
      const isAdminOrOwner = actor.role === 'ADMIN' || actor.role === 'OWNER';
      if (!isAdminOrOwner) {
        // Check for explicit vault grant
        const grantCheck = await pool.query<{ id: number }>(
          `SELECT id FROM vault_access_grants WHERE document_id = $1 AND (
             (grantee_type = 'user' AND grantee_name = $2)
             OR (grantee_type = 'role' AND grantee_name = $3)
           ) LIMIT 1`,
          [doc.id, actor.username, actor.role]
        );
        if (!grantCheck || grantCheck.length === 0) {
          // Write denied log entry - never silently discard
          await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'denied', ipAddress });
          return res.status(403).json({ error: 'Access denied: insufficient clearance for this document' });
        }
      }
    }

    if (!doc.filePath) {
      return res.status(404).json({ error: 'No file attached to this document' });
    }

    // Strip leading slash from filePath before joining
    const relativePath = doc.filePath.replace(/^\//, '');
    const filePath = path.join(process.cwd(), 'server/src', relativePath);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Write download access log entry before sending the file
    await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'download', ipAddress });

    // Send file with appropriate content type
    res.download(filePath, path.basename(filePath));
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Delete document (admin/owner only)
router.delete('/:id', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const [doc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete version history first (foreign key constraint)
    await db
      .delete(documentVersionHistory)
      .where(eq(documentVersionHistory.documentId, req.params.id));

    // Delete main document
    await db
      .delete(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));

    // Optionally delete files from filesystem
    // This is commented out for safety - consider implementing with soft delete
    // if (doc.filePath) {
    //   const fullPath = path.join(process.cwd(), 'server/src', doc.filePath);
    //   await fs.unlink(fullPath).catch(console.error);
    // }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// CSV Import (admin/owner/document managers only)
router.post('/import/csv', requireDocumentEditor, csvUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user!;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    // Convert buffer to string (file is stored in memory)
    const fileContent = req.file.buffer.toString('utf-8');
    
    // Parse CSV
    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    if (parseResult.errors.length > 0) {
      console.error('CSV parsing errors:', parseResult.errors);
      return res.status(400).json({ 
        error: 'CSV parsing failed',
        details: parseResult.errors 
      });
    }

    const rows = parseResult.data as any[];
    
    // Debug: Log the columns we found
    if (rows.length > 0) {
      console.log('CSV Columns found:', Object.keys(rows[0]));
      console.log('First row sample:', rows[0]);
    }
    
    // Skip the first row if it's a title row
    const dataRows = rows[0]?.TITLE?.includes('QMS MASTER LIST') ? rows.slice(1) : rows;
    
    const importResults = {
      success: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Helper function to determine document type from code
    const determineDocumentType = (code: string): string => {
      const upperCode = code?.toUpperCase() || '';
      if (upperCode.includes('POSTER')) return 'POSTER';
      if (upperCode.includes('FORM')) return 'FORM';
      if (upperCode.includes('DOC')) return 'PROCEDURE';
      return 'OTHER';
    };

    const parsedDocuments = [];

    // Process and validate each row before writing so the database work can be batched.
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      try {
        // Skip rows with missing critical data
        if (!row.TITLE || !row.CODE) {
          importResults.skipped++;
          importResults.errors.push(`Row ${i + 2}: Missing TITLE or CODE`);
          continue;
        }

        const documentNumber = String(row.CODE || '').trim();
        const documentName = String(row.TITLE || '').trim();
        const department = String(row.Department || 'General Use').trim();
        const currentVersion = String(row.Version || '1.0').trim();
        const retentionLength = String(row['Record Retention Length'] || 'N/A').trim();
        const description = String(row['Summary of Changes (if needed)'] || '').trim();
        const dateStr = String(row.Date || '').trim();
        
        // Parse effective date
        let effectiveDate = null;
        if (dateStr && dateStr !== 'N/A' && dateStr !== 'on-going') {
          try {
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate.getTime())) {
              effectiveDate = parsedDate.toISOString().split('T')[0];
            }
          } catch {
            // Invalid date, leave as null
          }
        }

        const documentType = determineDocumentType(documentNumber);

        // Calculate expiration date (1 year from effective date or now)
        const baseDate = effectiveDate ? new Date(effectiveDate) : new Date();
        const expirationDate = new Date(baseDate);
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);

        parsedDocuments.push({
          documentNumber,
          documentName,
          documentType,
          department,
          currentVersion,
          retentionLength,
          description,
          effectiveDate,
          expirationDate: expirationDate.toISOString().split('T')[0],
          rowNumber: i + 2,
        });
      } catch (error: any) {
        const errorMsg = `Row ${i + 2}: ${error.message}`;
        console.error('CSV import error:', errorMsg);
        importResults.errors.push(errorMsg);
      }
    }

    const seenDocumentNumbers = new Set<string>();
    const importDocuments = parsedDocuments.filter((doc) => {
      if (seenDocumentNumbers.has(doc.documentNumber)) {
        importResults.skipped++;
        importResults.errors.push(`Row ${doc.rowNumber}: Duplicate CODE "${doc.documentNumber}" in import file`);
        return false;
      }
      seenDocumentNumbers.add(doc.documentNumber);
      return true;
    });

    const existingDocuments = importDocuments.length > 0
      ? await db
          .select()
          .from(controlledDocuments)
          .where(inArray(
            controlledDocuments.documentNumber,
            importDocuments.map((doc) => doc.documentNumber)
          ))
      : [];

    const existingByNumber = new Map(existingDocuments.map((doc) => [doc.documentNumber, doc]));
    const documentsToCreate = [];

    for (const doc of importDocuments) {
      const existing = existingByNumber.get(doc.documentNumber);

      if (existing) {
        await db
          .update(controlledDocuments)
          .set({
            documentName: doc.documentName,
            documentType: doc.documentType,
            department: doc.department,
            currentVersion: doc.currentVersion,
            retentionLength: doc.retentionLength,
            description: doc.description || existing.description,
            effectiveDate: doc.effectiveDate || existing.effectiveDate,
            expirationDate: doc.expirationDate,
            updatedAt: new Date(),
          })
          .where(eq(controlledDocuments.id, existing.id));
      } else {
        documentsToCreate.push({
          documentNumber: doc.documentNumber,
          documentName: doc.documentName,
          documentType: doc.documentType,
          department: doc.department,
          currentVersion: doc.currentVersion,
          status: doc.effectiveDate ? 'approved' : 'draft',
          retentionLength: doc.retentionLength,
          description: doc.description,
          effectiveDate: doc.effectiveDate,
          expirationDate: doc.expirationDate,
          createdBy: user.username,
        });
      }

      importResults.success++;
    }

    if (documentsToCreate.length > 0) {
      const newDocs = await db.insert(controlledDocuments).values(documentsToCreate).returning();

      const versionHistoryToCreate = newDocs.map((newDoc) => ({
        documentId: newDoc.id,
        versionNumber: newDoc.currentVersion,
        changeDescription: newDoc.description || 'Imported from CSV',
        changeType: 'major',
        status: newDoc.status,
        createdBy: user.username,
        effectiveDate: newDoc.effectiveDate,
        expirationDate: newDoc.expirationDate,
      }));

      await db.insert(documentVersionHistory).values(versionHistoryToCreate);
    }

    // Log final results
    console.log('CSV Import Results:', {
      total: dataRows.length,
      success: importResults.success,
      skipped: importResults.skipped,
      errors: importResults.errors.length,
      firstFewErrors: importResults.errors.slice(0, 5)
    });

    res.json({
      message: 'CSV import completed',
      results: importResults,
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

export default router;
