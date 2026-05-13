import express from 'express';
import { storage } from '../../storage';
import { insertProjectStepAttachmentSchema } from '../../schema';
import { ObjectNotFoundError, ObjectStorageService } from '../../replit_integrations/object_storage';
import { sessionAwareAuth } from '../../middleware/auth';

const router = express.Router();
const objectStorageService = new ObjectStorageService();

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

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    console.log(`📁 Generated upload URL for ${name}, objectPath: ${objectPath}`);

    res.json({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType, projectId, stepId },
    });
  } catch (error) {
    console.error('Error generating upload URL for project step attachment:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
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
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: user?.id?.toString() || 'system',
        visibility: 'public',
      });
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
        const objectFile = await objectStorageService.getObjectEntityFile(normalizedPath);
        await objectFile.delete();
        console.log(`📁 Deleted cloud file: ${normalizedPath}`);
      } catch (deleteError) {
        console.warn('Failed to delete file from cloud storage:', deleteError);
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
        const buffer = await objectStorageService.downloadAsBuffer(normalizedDownloadPath);

        const disposition = forceDownload ? 'attachment' : 'inline';
        res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(attachment.originalFileName)}"`);
        res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      } catch (cloudError) {
        console.error('Error downloading from cloud storage:', cloudError);
        if (cloudError instanceof ObjectNotFoundError) {
          return res.status(404).json({ error: 'Attachment file not found in storage' });
        }
        return res.status(502).json({ error: 'Failed to retrieve file from cloud storage' });
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
