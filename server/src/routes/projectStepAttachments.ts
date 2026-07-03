import express from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { storage } from '../../storage';
import { insertProjectStepAttachmentSchema } from '../../schema';
import { ObjectNotFoundError } from '../../replit_integrations/object_storage';
import { sessionAwareAuth } from '../../middleware/auth';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
  getStorageErrorResponse,
} from '../services/fileStorageProvider';

const router = express.Router();
const localProjectStepAttachmentsDir = path.join(process.cwd(), 'uploads', 'project-step-attachments');
const localProjectStepAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function safeLocalFileName(fileName: string) {
  const parsed = path.parse(fileName || 'project-step-attachment');
  const base = parsed.name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'project-step-attachment';
  const ext = parsed.ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 20);
  return `${randomUUID()}-${base}${ext}`;
}

function isLocalProjectStepAttachmentPath(filePath: string | null | undefined) {
  return !!filePath && filePath.startsWith('/uploads/project-step-attachments/');
}

function resolveLocalProjectStepAttachmentPath(filePath: string) {
  const fileName = path.basename(filePath);
  return path.join(localProjectStepAttachmentsDir, fileName);
}

async function saveLocalProjectStepAttachment(file: Express.Multer.File) {
  await fs.mkdir(localProjectStepAttachmentsDir, { recursive: true });
  const storedFileName = safeLocalFileName(file.originalname);
  await fs.writeFile(path.join(localProjectStepAttachmentsDir, storedFileName), file.buffer);
  return `/uploads/project-step-attachments/${storedFileName}`;
}

async function deleteLocalProjectStepAttachment(filePath: string) {
  if (!isLocalProjectStepAttachmentPath(filePath)) return;
  await fs.unlink(resolveLocalProjectStepAttachmentPath(filePath));
}

router.get('/by-project/:projectId', sessionAwareAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const attachments = await storage.getProjectStepAttachmentsByProject(projectId);
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching project step attachments by project:', error);
    res.status(500).json({ error: 'Failed to fetch project step attachments' });
  }
});

router.get('/:stepId', sessionAwareAuth, async (req, res) => {
  try {
    const { stepId } = req.params;
    
    const step = await storage.getProjectStep(stepId);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }
    
    const attachments = await storage.getProjectStepAttachments(stepId);
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching project step attachments:', error);
    res.status(500).json({ error: 'Failed to fetch project step attachments' });
  }
});

router.post('/request-upload-url', sessionAwareAuth, async (req, res) => {
  try {
    const { name, size, contentType, projectId, stepId } = req.body;

    if (!name || !projectId || !stepId) {
      return res.status(400).json({ error: 'Missing required fields: name, projectId, stepId' });
    }

    const step = await storage.getProjectStep(stepId);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }
    
    if (step.projectId !== projectId) {
      return res.status(400).json({ error: 'Step does not belong to the specified project' });
    }

    console.log(`📁 Requesting upload URL for project step ${stepId}: ${name}`);

    const uploadTarget = await getFileStorageProvider().createUploadTarget({
      fileName: name,
      contentType,
      scope: 'project-step-attachments',
      entityId: `${projectId}-${stepId}`,
    });

    console.log(`📁 Generated upload URL for ${name}, objectPath: ${uploadTarget.objectPath}`);

    res.json({
      uploadURL: uploadTarget.uploadURL,
      objectPath: uploadTarget.objectPath,
      provider: uploadTarget.provider,
      metadata: { name, size, contentType, projectId, stepId },
    });
  } catch (error) {
    const { status, reason, message } = getStorageErrorResponse(error);
    console.error('Error generating upload URL for project step attachment:', { status, reason, message });
    res.status(status).json({ error: 'Failed to generate upload URL', reason, details: message });
  }
});

router.post('/local-upload', sessionAwareAuth, (req, res) => {
  localProjectStepAttachmentUpload.single('file')(req, res, async (uploadError: any) => {
    if (uploadError) {
      const isSizeLimit = uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE';
      return res.status(isSizeLimit ? 413 : 400).json({
        error: isSizeLimit ? 'Document uploads are limited to 100 MB.' : 'Failed to read uploaded document',
        details: uploadError.message,
      });
    }

    let localFilePath: string | null = null;
    try {
      const file = req.file;
      const { projectId, stepId, notes } = req.body;
      const user = req.user;

      if (!file) {
        return res.status(400).json({ error: 'No file received' });
      }
      if (!projectId || !stepId) {
        return res.status(400).json({ error: 'Missing required fields: projectId, stepId' });
      }

      const step = await storage.getProjectStep(stepId);
      if (!step) {
        return res.status(404).json({ error: 'Step not found' });
      }
      if (step.projectId !== projectId) {
        return res.status(400).json({ error: 'Step does not belong to the specified project' });
      }

      localFilePath = await saveLocalProjectStepAttachment(file);
      const uploadedByEmployeeId = user?.employeeId || null;
      const originalFileName = file.originalname || 'project-step-attachment';
      const attachmentData = {
        projectId,
        stepId,
        fileName: localFilePath.split('/').pop() || originalFileName,
        originalFileName,
        fileSize: file.size || 0,
        mimeType: file.mimetype || 'application/octet-stream',
        filePath: localFilePath,
        uploadedBy: uploadedByEmployeeId,
        notes: notes || null,
      };

      const validatedData = insertProjectStepAttachmentSchema.parse(attachmentData);
      const attachment = await storage.createProjectStepAttachment(validatedData);

      await storage.createProjectActivityLog({
        projectId,
        activityType: 'document_attached',
        stepType: step.stepType,
        description: `Document attached: ${originalFileName}`,
        performedBy: uploadedByEmployeeId || undefined,
      });

      console.warn('[project-step-attachments/local-upload] Used local upload fallback', {
        projectId,
        stepId,
        attachmentId: attachment.id,
        reason: 'object_storage_signing_unavailable',
      });

      res.status(201).json(attachment);
    } catch (error: any) {
      if (localFilePath) {
        try {
          await deleteLocalProjectStepAttachment(localFilePath);
        } catch (cleanupError) {
          console.warn('Failed to clean up local project step attachment after upload error:', cleanupError);
        }
      }
      console.error('Error uploading local project step attachment:', error);
      res.status(500).json({ error: error.message || 'Failed to upload project step attachment' });
    }
  });
});

router.post('/complete-upload', sessionAwareAuth, async (req, res) => {
  try {
    const { objectPath, projectId, stepId, originalFileName, fileSize, mimeType, notes } = req.body;
    const user = req.user;

    console.log(`📁 Complete upload request received:`, { objectPath, projectId, stepId, originalFileName, hasUser: !!user });

    if (!objectPath || !projectId || !stepId || !originalFileName) {
      console.error('📁 Missing required fields:', { objectPath: !!objectPath, projectId: !!projectId, stepId: !!stepId, originalFileName: !!originalFileName });
      return res.status(400).json({ 
        error: 'Missing required fields: objectPath, projectId, stepId, originalFileName' 
      });
    }

    const step = await storage.getProjectStep(stepId);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }
    
    if (step.projectId !== projectId) {
      return res.status(400).json({ error: 'Step does not belong to the specified project' });
    }

    console.log(`📁 Completing upload for project step ${stepId}: ${originalFileName}`);

    try {
      await getFileStorageProviderForObjectPath(objectPath).setPublicReadPolicy(
        objectPath,
        user?.id?.toString() || 'system',
      );
      console.log('📁 ACL policy set successfully for:', objectPath);
    } catch (aclError) {
      console.warn('📁 Failed to set ACL policy for project step attachment:', aclError);
    }

    const uploadedByEmployeeId = user?.employeeId || null;

    const attachmentData = {
      projectId,
      stepId,
      fileName: objectPath.split('/').pop() || originalFileName,
      originalFileName,
      fileSize: fileSize || 0,
      mimeType: mimeType || 'application/octet-stream',
      filePath: objectPath,
      uploadedBy: uploadedByEmployeeId,
      notes: notes || null,
    };

    console.log('📁 Creating database record:', attachmentData);
    
    try {
      const validatedData = insertProjectStepAttachmentSchema.parse(attachmentData);
      const attachment = await storage.createProjectStepAttachment(validatedData);
      
      await storage.createProjectActivityLog({
        projectId,
        activityType: 'document_attached',
        stepType: step.stepType,
        description: `Document attached: ${originalFileName}`,
        performedBy: uploadedByEmployeeId || undefined,
      });
      
      console.log('📁 Project step attachment saved successfully:', attachment.id);
      res.json(attachment);
    } catch (dbError: any) {
      console.error('📁 Database error creating attachment:', dbError);
      res.status(500).json({ 
        error: `Database error: ${dbError.message || 'Failed to save attachment record'}` 
      });
    }
  } catch (error: any) {
    console.error('📁 Error completing project step attachment upload:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to complete upload' 
    });
  }
});

router.delete('/:attachmentId', sessionAwareAuth, async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);

    const attachment = await storage.getProjectStepAttachment(attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const step = await storage.getProjectStep(attachment.stepId);
    if (!step) {
      return res.status(404).json({ error: 'Associated step not found' });
    }

    const project = await storage.getProject(step.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Associated project not found' });
    }

    // Normalize objects/ prefix to /objects/
    const normalizedPath = attachment.filePath?.startsWith('objects/') 
      ? `/${attachment.filePath}` 
      : attachment.filePath;
    
    if (normalizedPath && normalizedPath.startsWith('/objects/')) {
      try {
        await getFileStorageProviderForObjectPath(normalizedPath).deleteObject(normalizedPath);
        console.log(`📁 Deleted cloud file: ${normalizedPath}`);
      } catch (deleteError) {
        console.warn('Failed to delete file from cloud storage:', deleteError);
      }
    } else if (normalizedPath && isLocalProjectStepAttachmentPath(normalizedPath)) {
      try {
        await deleteLocalProjectStepAttachment(normalizedPath);
        console.log(`Deleted local file: ${normalizedPath}`);
      } catch (deleteError) {
        console.warn('Failed to delete local project step attachment:', deleteError);
      }
    }

    await storage.deleteProjectStepAttachment(attachmentId);

    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting project step attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

router.get('/download/:attachmentId', sessionAwareAuth, async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);
    const attachment = await storage.getProjectStepAttachment(attachmentId);
    const forceDownload = req.query.download === 'true';

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const step = await storage.getProjectStep(attachment.stepId);
    if (!step) {
      return res.status(404).json({ error: 'Associated step not found' });
    }

    const project = await storage.getProject(step.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Associated project not found' });
    }

    // Normalize objects/ prefix to /objects/
    const normalizedDownloadPath = attachment.filePath?.startsWith('objects/') 
      ? `/${attachment.filePath}` 
      : attachment.filePath;
    
    if (normalizedDownloadPath && normalizedDownloadPath.startsWith('/objects/')) {
      try {
        const disposition = forceDownload ? 'attachment' : 'inline';
        res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(attachment.originalFileName)}"`);
        res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
        return await getFileStorageProviderForObjectPath(normalizedDownloadPath).downloadObject(normalizedDownloadPath, res);
      } catch (cloudError) {
        console.error('Error downloading from cloud storage:', cloudError);
        if (cloudError instanceof ObjectNotFoundError) {
          return res.status(404).json({ error: 'Attachment file not found in storage' });
        }
        return res.status(502).json({ error: 'Failed to retrieve file from cloud storage' });
      }
    } else if (normalizedDownloadPath && isLocalProjectStepAttachmentPath(normalizedDownloadPath)) {
      try {
        const localPath = resolveLocalProjectStepAttachmentPath(normalizedDownloadPath);
        await fs.access(localPath);
        const disposition = forceDownload ? 'attachment' : 'inline';
        res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(attachment.originalFileName)}"`);
        res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
        return res.sendFile(localPath);
      } catch {
        return res.status(404).json({ error: 'Attachment file not found on server' });
      }
    } else {
      return res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    console.error('Error downloading project step attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

export default router;
