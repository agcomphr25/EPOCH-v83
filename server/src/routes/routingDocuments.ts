import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { 
  routingDocuments, 
  specSheets, 
  documentTemplates, 
  templateFields,
  routingDocumentLinks,
  certificationTaskLinks,
  documentDistributionLogs,
  insertRoutingDocumentSchema,
  insertSpecSheetSchema,
  insertDocumentTemplateSchema,
  insertTemplateFieldSchema
} from '@shared/schema';
import { eq, desc, and, ilike, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { ObjectStorageService } from '../../replit_integrations/object_storage';

const router = Router();
const objectStorageService = new ObjectStorageService();

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Get all routing documents
router.get('/', async (req: Request, res: Response) => {
  try {
    const { partNumber, departmentName, documentType, isTemplate } = req.query;
    
    let query = db.select().from(routingDocuments);
    
    const conditions = [];
    if (partNumber) {
      conditions.push(ilike(routingDocuments.partNumber, `%${partNumber}%`));
    }
    if (departmentName) {
      conditions.push(eq(routingDocuments.departmentName, String(departmentName)));
    }
    if (documentType) {
      conditions.push(eq(routingDocuments.documentType, String(documentType)));
    }
    if (isTemplate === 'true') {
      conditions.push(eq(routingDocuments.isTemplate, true));
    }
    
    const results = conditions.length > 0 
      ? await db.select().from(routingDocuments).where(and(...conditions)).orderBy(desc(routingDocuments.createdAt))
      : await db.select().from(routingDocuments).orderBy(desc(routingDocuments.createdAt));
    
    res.json(results);
  } catch (error) {
    console.error('Error fetching routing documents:', error);
    res.status(500).json({ error: 'Failed to fetch routing documents' });
  }
});

// Get single routing document
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [document] = await db.select().from(routingDocuments).where(eq(routingDocuments.id, req.params.id));
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
  } catch (error) {
    console.error('Error fetching routing document:', error);
    res.status(500).json({ error: 'Failed to fetch routing document' });
  }
});

// Request upload URL for routing document
router.post('/request-upload-url', async (req: Request, res: Response) => {
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

// Complete upload and create routing document
router.post('/complete-upload', async (req: Request, res: Response) => {
  try {
    const { objectPath, title, originalFileName, fileSize, mimeType, partRoutingId, partNumber, departmentName, documentType, isTemplate, sourceType } = req.body;
    const user = (req as any).user;
    
    if (!objectPath || !originalFileName) {
      return res.status(400).json({ error: 'Missing required fields: objectPath, originalFileName' });
    }
    
    // Validate sourceType
    const validSourceTypes = ['uploaded', 'generated', 'imported'];
    const finalSourceType = validSourceTypes.includes(sourceType) ? sourceType : 'uploaded';
    
    // Set ACL policy to make file accessible
    try {
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: user?.id?.toString() || 'system',
        visibility: 'public',
      });
    } catch (aclError) {
      console.warn('Failed to set ACL policy for routing document:', aclError);
    }
    
    const [document] = await db.insert(routingDocuments).values({
      title: title || originalFileName,
      partRoutingId: partRoutingId || null,
      partNumber: partNumber || null,
      departmentName: departmentName || null,
      documentType: documentType || 'work_instruction',
      sourceType: finalSourceType,
      fileUrl: objectPath,
      fileName: originalFileName,
      fileType: mimeType || 'application/octet-stream',
      fileSize: fileSize || 0,
      isTemplate: isTemplate === true || isTemplate === 'true',
      createdBy: user?.username || 'system',
    }).returning();
    
    res.status(201).json(document);
  } catch (error) {
    console.error('Error completing routing document upload:', error);
    res.status(500).json({ error: 'Failed to complete document upload' });
  }
});

// AI Parse document to extract routing information
router.post('/:id/ai-parse', async (req: Request, res: Response) => {
  try {
    const [document] = await db.select().from(routingDocuments).where(eq(routingDocuments.id, req.params.id));
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // For now, we'll use text content from the request body since PDF parsing requires additional processing
    const { textContent } = req.body;
    
    if (!textContent) {
      return res.status(400).json({ error: 'Text content is required for AI parsing' });
    }
    
    const systemPrompt = `You are an expert manufacturing document analyzer. Analyze the provided document content and extract:
1. Routing steps (operations/departments in order)
2. Data fields that need to be captured for each part (serial numbers, measurements, dates, signatures, etc.)
3. Quality checkpoints and standards
4. Certification requirements
5. Special process requirements

Return a JSON object with the following structure:
{
  "routingSteps": [{"stepNumber": 1, "department": "string", "operation": "string", "description": "string"}],
  "dataFields": [{"fieldName": "string", "fieldLabel": "string", "fieldType": "text|number|date|signature|barcode", "isRequired": boolean, "isUniquePerSerial": boolean, "department": "string"}],
  "qualityCheckpoints": [{"checkpoint": "string", "standard": "string", "tolerance": "string", "department": "string"}],
  "certificationRequirements": [{"certification": "string", "department": "string", "task": "string"}],
  "specialProcesses": [{"process": "string", "requirements": "string", "department": "string"}]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please analyze this document and extract the routing information:\n\n${textContent}` }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
    });
    
    const parsedContent = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    // Update document with AI extracted content
    const [updatedDocument] = await db.update(routingDocuments)
      .set({
        aiExtractedContent: parsedContent,
        aiExtractedFields: parsedContent.dataFields || [],
        aiProcessedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(routingDocuments.id, req.params.id))
      .returning();
    
    res.json({ document: updatedDocument, extractedContent: parsedContent });
  } catch (error) {
    console.error('Error parsing document with AI:', error);
    res.status(500).json({ error: 'Failed to parse document with AI' });
  }
});

// AI Generate new document from templates
router.post('/ai-generate', async (req: Request, res: Response) => {
  try {
    const { templateId, partNumber, partName, customFields, referenceDocumentIds } = req.body;
    
    if (!partNumber) {
      return res.status(400).json({ error: 'Part number is required' });
    }
    
    // Validate and get reference documents
    let referenceContent = '';
    if (referenceDocumentIds && referenceDocumentIds.length > 0) {
      const refDocs = await db.select().from(routingDocuments).where(
        sql`${routingDocuments.id} = ANY(${referenceDocumentIds}::uuid[])`
      );
      
      // Validate that all referenced documents exist
      if (refDocs.length !== referenceDocumentIds.length) {
        const foundIds = refDocs.map(d => d.id);
        const missingIds = referenceDocumentIds.filter((id: string) => !foundIds.includes(id));
        return res.status(400).json({ error: `Referenced documents not found: ${missingIds.join(', ')}` });
      }
      
      referenceContent = refDocs.map(doc => {
        return `Document: ${doc.title}\nExtracted Content: ${JSON.stringify(doc.aiExtractedContent || {})}`;
      }).join('\n\n---\n\n');
    }
    
    // Validate and get template if provided
    let templateContent = '';
    if (templateId) {
      const [template] = await db.select().from(documentTemplates).where(eq(documentTemplates.id, templateId));
      if (!template) {
        return res.status(400).json({ error: `Template not found: ${templateId}` });
      }
      const fields = await db.select().from(templateFields).where(eq(templateFields.templateId, templateId));
      templateContent = `Template: ${template.templateName}\nStructure: ${JSON.stringify(template.structure)}\nSections: ${JSON.stringify(template.sections)}\nFields: ${JSON.stringify(fields)}`;
    }
    
    const systemPrompt = `You are an expert at creating manufacturing work instructions, spec sheets, and travelers. Based on the provided reference documents and template, generate a new document structure with all necessary fields.

Return a JSON object with:
{
  "title": "Generated document title",
  "sections": [{"name": "string", "content": "string", "fields": [...]}],
  "fields": [{"fieldName": "string", "fieldLabel": "string", "fieldType": "string", "isRequired": boolean, "isUniquePerSerial": boolean, "defaultValue": "string"}],
  "routingSteps": [...],
  "qualityCheckpoints": [...]
}`;

    const userPrompt = `Generate a document for:
Part Number: ${partNumber || 'Not specified'}
Part Name: ${partName || 'Not specified'}
Custom Requirements: ${JSON.stringify(customFields || {})}

${referenceContent ? `Reference Documents:\n${referenceContent}` : ''}
${templateContent ? `\nTemplate:\n${templateContent}` : ''}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
    });
    
    const generatedContent = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    // Create new routing document with generated content
    const [newDocument] = await db.insert(routingDocuments).values({
      title: generatedContent.title || `Generated Document for ${partNumber}`,
      partNumber,
      documentType: 'work_instruction',
      sourceType: 'generated',
      aiExtractedContent: generatedContent,
      aiExtractedFields: generatedContent.fields || [],
      aiProcessedAt: new Date(),
      isTemplate: false,
      createdBy: (req as any).user?.username || 'system',
    }).returning();
    
    res.status(201).json({ document: newDocument, generatedContent });
  } catch (error) {
    console.error('Error generating document with AI:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

// Create document template from reference documents
router.post('/templates/learn', async (req: Request, res: Response) => {
  try {
    const { templateName, templateType, description, referenceDocumentIds } = req.body;
    
    if (!templateName || !templateName.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    
    if (!referenceDocumentIds || referenceDocumentIds.length === 0) {
      return res.status(400).json({ error: 'At least one reference document is required' });
    }
    
    // Get reference documents and validate all exist
    const refDocs = await db.select().from(routingDocuments).where(
      sql`${routingDocuments.id} = ANY(${referenceDocumentIds}::uuid[])`
    );
    
    if (refDocs.length === 0) {
      return res.status(404).json({ error: 'No reference documents found' });
    }
    
    // Validate that all referenced documents exist
    if (refDocs.length !== referenceDocumentIds.length) {
      const foundIds = refDocs.map(d => d.id);
      const missingIds = referenceDocumentIds.filter((id: string) => !foundIds.includes(id));
      return res.status(400).json({ error: `Referenced documents not found: ${missingIds.join(', ')}` });
    }
    
    // Analyze patterns across documents
    const documentAnalysis = refDocs.map(doc => ({
      title: doc.title,
      documentType: doc.documentType,
      extractedContent: doc.aiExtractedContent,
      extractedFields: doc.aiExtractedFields,
    }));
    
    const systemPrompt = `You are an expert at analyzing manufacturing documents and creating templates. Analyze the provided documents and identify common patterns, fields, and structure to create a reusable template.

Return a JSON object with:
{
  "structure": {"sections": [...], "layout": "string"},
  "sections": [{"name": "string", "description": "string", "order": number}],
  "defaultFields": [{"fieldName": "string", "fieldLabel": "string", "fieldType": "string", "isRequired": boolean, "isUniquePerSerial": boolean, "sectionName": "string", "sortOrder": number}],
  "aiGeneratedPrompt": "A prompt that can be used to generate similar documents in the future"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze these documents and create a template:\n\n${JSON.stringify(documentAnalysis, null, 2)}` }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
    });
    
    const learnedContent = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    // Create template
    const [template] = await db.insert(documentTemplates).values({
      templateName: templateName || 'Learned Template',
      templateType: templateType || 'mixed',
      description: description || 'Template learned from reference documents',
      sourceDocumentIds: referenceDocumentIds,
      learnedFromCount: referenceDocumentIds.length,
      structure: learnedContent.structure,
      sections: learnedContent.sections,
      defaultFields: learnedContent.defaultFields,
      aiGeneratedPrompt: learnedContent.aiGeneratedPrompt,
      createdBy: (req as any).user?.username || 'system',
    }).returning();
    
    // Create template fields
    if (learnedContent.defaultFields && learnedContent.defaultFields.length > 0) {
      for (const field of learnedContent.defaultFields) {
        await db.insert(templateFields).values({
          templateId: template.id,
          fieldName: field.fieldName,
          fieldLabel: field.fieldLabel,
          fieldType: field.fieldType || 'text',
          isRequired: field.isRequired || false,
          isUniquePerSerial: field.isUniquePerSerial || false,
          defaultValue: field.defaultValue,
          sectionName: field.sectionName,
          sortOrder: field.sortOrder || 0,
          aiSuggested: true,
        });
      }
    }
    
    const fields = await db.select().from(templateFields).where(eq(templateFields.templateId, template.id));
    
    res.status(201).json({ template, fields, learnedContent });
  } catch (error) {
    console.error('Error learning template:', error);
    res.status(500).json({ error: 'Failed to learn template from documents' });
  }
});

// Get all templates
router.get('/templates/list', async (req: Request, res: Response) => {
  try {
    const templates = await db.select().from(documentTemplates).where(eq(documentTemplates.isActive, true)).orderBy(desc(documentTemplates.createdAt));
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get template with fields
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const [template] = await db.select().from(documentTemplates).where(eq(documentTemplates.id, req.params.id));
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const fields = await db.select().from(templateFields).where(eq(templateFields.templateId, req.params.id)).orderBy(templateFields.sortOrder);
    
    res.json({ template, fields });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Spec Sheets endpoints
router.get('/spec-sheets', async (req: Request, res: Response) => {
  try {
    const sheets = await db.select().from(specSheets).where(eq(specSheets.isActive, true)).orderBy(desc(specSheets.createdAt));
    res.json(sheets);
  } catch (error) {
    console.error('Error fetching spec sheets:', error);
    res.status(500).json({ error: 'Failed to fetch spec sheets' });
  }
});

// Request upload URL for spec sheet
router.post('/spec-sheets/request-upload-url', async (req: Request, res: Response) => {
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
    console.error('Error generating upload URL for spec sheet:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Complete upload for spec sheet
router.post('/spec-sheets/complete-upload', async (req: Request, res: Response) => {
  try {
    const { objectPath, title, originalFileName, fileSize, mimeType, partRoutingId, partNumber, isTemplate, sourceType } = req.body;
    const user = (req as any).user;
    
    if (!objectPath || !originalFileName) {
      return res.status(400).json({ error: 'Missing required fields: objectPath, originalFileName' });
    }
    
    // Validate sourceType
    const validSourceTypes = ['uploaded', 'generated', 'imported'];
    const finalSourceType = validSourceTypes.includes(sourceType) ? sourceType : 'uploaded';
    
    try {
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: user?.id?.toString() || 'system',
        visibility: 'public',
      });
    } catch (aclError) {
      console.warn('Failed to set ACL policy for spec sheet:', aclError);
    }
    
    const [sheet] = await db.insert(specSheets).values({
      title: title || originalFileName,
      partRoutingId: partRoutingId || null,
      partNumber: partNumber || null,
      sourceType: finalSourceType,
      fileUrl: objectPath,
      fileName: originalFileName,
      fileType: mimeType || 'application/octet-stream',
      fileSize: fileSize || 0,
      isTemplate: isTemplate === true || isTemplate === 'true',
      createdBy: user?.username || 'system',
    }).returning();
    
    res.status(201).json(sheet);
  } catch (error) {
    console.error('Error completing spec sheet upload:', error);
    res.status(500).json({ error: 'Failed to complete spec sheet upload' });
  }
});

// Document Distribution Logs
router.get('/distribution-logs', async (req: Request, res: Response) => {
  try {
    const { poId, departmentName } = req.query;
    
    let conditions = [];
    if (poId) {
      conditions.push(eq(documentDistributionLogs.poId, Number(poId)));
    }
    if (departmentName) {
      conditions.push(eq(documentDistributionLogs.departmentName, String(departmentName)));
    }
    
    const logs = conditions.length > 0
      ? await db.select().from(documentDistributionLogs).where(and(...conditions)).orderBy(desc(documentDistributionLogs.printedAt))
      : await db.select().from(documentDistributionLogs).orderBy(desc(documentDistributionLogs.printedAt)).limit(100);
    
    res.json(logs);
  } catch (error) {
    console.error('Error fetching distribution logs:', error);
    res.status(500).json({ error: 'Failed to fetch distribution logs' });
  }
});

router.post('/distribution-logs', async (req: Request, res: Response) => {
  try {
    const { poId, poNumber, documentType, documentId, documentTitle, departmentName, recipientId, recipientName, distributionMethod, notes } = req.body;
    
    const [log] = await db.insert(documentDistributionLogs).values({
      poId,
      poNumber,
      documentType,
      documentId,
      documentTitle,
      departmentName,
      recipientId,
      recipientName,
      distributionMethod: distributionMethod || 'print',
      printedBy: (req as any).user?.username || 'system',
      notes,
    }).returning();
    
    res.status(201).json(log);
  } catch (error) {
    console.error('Error creating distribution log:', error);
    res.status(500).json({ error: 'Failed to create distribution log' });
  }
});

router.patch('/distribution-logs/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const [log] = await db.update(documentDistributionLogs)
      .set({
        acknowledged: true,
        acknowledgedAt: new Date(),
        acknowledgedBy: (req as any).user?.username || 'system',
      })
      .where(eq(documentDistributionLogs.id, req.params.id))
      .returning();
    
    if (!log) {
      return res.status(404).json({ error: 'Distribution log not found' });
    }
    
    res.json(log);
  } catch (error) {
    console.error('Error acknowledging distribution:', error);
    res.status(500).json({ error: 'Failed to acknowledge distribution' });
  }
});

// Link documents to routing
router.post('/routing-links', async (req: Request, res: Response) => {
  try {
    const { partRoutingId, departmentName, documentType, documentId, isPrimary, sortOrder } = req.body;
    
    const [link] = await db.insert(routingDocumentLinks).values({
      partRoutingId,
      departmentName,
      documentType,
      documentId,
      isPrimary: isPrimary || false,
      sortOrder: sortOrder || 0,
      createdBy: (req as any).user?.username || 'system',
    }).returning();
    
    res.status(201).json(link);
  } catch (error) {
    console.error('Error creating routing document link:', error);
    res.status(500).json({ error: 'Failed to link document to routing' });
  }
});

router.get('/routing-links/:partRoutingId', async (req: Request, res: Response) => {
  try {
    const links = await db.select().from(routingDocumentLinks)
      .where(eq(routingDocumentLinks.partRoutingId, req.params.partRoutingId))
      .orderBy(routingDocumentLinks.sortOrder);
    
    // Get the actual documents
    const enrichedLinks = await Promise.all(links.map(async (link) => {
      let document = null;
      if (link.documentType === 'work_instruction' || link.documentType === 'procedure' || link.documentType === 'traveler_template') {
        const [doc] = await db.select().from(routingDocuments).where(eq(routingDocuments.id, link.documentId));
        document = doc;
      } else if (link.documentType === 'spec_sheet') {
        const [doc] = await db.select().from(specSheets).where(eq(specSheets.id, link.documentId));
        document = doc;
      }
      return { ...link, document };
    }));
    
    res.json(enrichedLinks);
  } catch (error) {
    console.error('Error fetching routing document links:', error);
    res.status(500).json({ error: 'Failed to fetch routing document links' });
  }
});

// Certification task links
router.post('/certification-links', async (req: Request, res: Response) => {
  try {
    const { certificationId, partRoutingId, departmentName, routingDocumentId, travelerStepId, travelerTaskId, taskDescription, isRequired } = req.body;
    
    const [link] = await db.insert(certificationTaskLinks).values({
      certificationId,
      partRoutingId,
      departmentName,
      routingDocumentId,
      travelerStepId,
      travelerTaskId,
      taskDescription,
      isRequired: isRequired !== false,
      createdBy: (req as any).user?.username || 'system',
    }).returning();
    
    res.status(201).json(link);
  } catch (error) {
    console.error('Error creating certification task link:', error);
    res.status(500).json({ error: 'Failed to link certification to task' });
  }
});

router.get('/certification-links/:certificationId', async (req: Request, res: Response) => {
  try {
    const links = await db.select().from(certificationTaskLinks)
      .where(eq(certificationTaskLinks.certificationId, Number(req.params.certificationId)));
    
    res.json(links);
  } catch (error) {
    console.error('Error fetching certification task links:', error);
    res.status(500).json({ error: 'Failed to fetch certification task links' });
  }
});

export default router;
