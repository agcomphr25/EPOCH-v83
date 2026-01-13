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

// Dynamic PDF parser function
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const pdfData = await pdfParse(buffer);
    return pdfData.text || '';
  } catch (error) {
    console.error('Error parsing PDF:', error);
    return '';
  }
}

const router = Router();
const objectStorageService = new ObjectStorageService();

// Helper to format UUID bytes to string if needed
function formatUuid(value: any): string {
  if (!value) return '';
  // If it's a proper UUID string (with dashes), return it
  if (typeof value === 'string' && value.includes('-') && value.length === 36) {
    return value;
  }
  // If it's a comma-separated byte string like "111,95,164,137,..."
  if (typeof value === 'string' && value.includes(',')) {
    const byteArray = value.split(',').map(b => parseInt(b.trim(), 10));
    if (byteArray.length === 16) {
      const bytes = Buffer.from(byteArray);
      const hex = bytes.toString('hex');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
  }
  // If it's a Buffer or byte array, convert to UUID format
  if (Buffer.isBuffer(value) || (Array.isArray(value) && value.length === 16)) {
    const bytes = Buffer.from(value);
    const hex = bytes.toString('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  return String(value);
}

// Transform row UUIDs to string format
function transformRow(row: any): any {
  if (!row) return row;
  const transformed = { ...row };
  if (transformed.id) transformed.id = formatUuid(transformed.id);
  if (transformed.template_id) transformed.template_id = formatUuid(transformed.template_id);
  if (transformed.document_id) transformed.document_id = formatUuid(transformed.document_id);
  if (transformed.part_id) transformed.part_id = formatUuid(transformed.part_id);
  return transformed;
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Get all routing documents
router.get('/', async (req: Request, res: Response) => {
  try {
    const { partNumber, departmentName, documentType, isTemplate } = req.query;
    
    // Use raw SQL template to avoid Neon HTTP driver issues with empty tables
    const results = await db.execute(sql`SELECT * FROM routing_documents WHERE is_active = true ORDER BY created_at DESC`);
    
    // Extract rows from the raw result and transform UUIDs
    const rows = (results as any)?.rows || results || [];
    const transformed = Array.isArray(rows) ? rows.map(transformRow) : [];
    res.json(transformed);
  } catch (error: any) {
    console.error('Error fetching routing documents:', error);
    // Return empty array on error (for new/empty tables)
    res.json([]);
  }
});

// Spec Sheets endpoints - MUST be before /:id to avoid route matching issues
router.get('/spec-sheets', async (req: Request, res: Response) => {
  try {
    const results = await db.execute(sql`SELECT * FROM spec_sheets WHERE is_active = true ORDER BY created_at DESC`);
    const rows = (results as any)?.rows || results || [];
    const transformed = Array.isArray(rows) ? rows.map(transformRow) : [];
    res.json(transformed);
  } catch (error) {
    console.error('Error fetching spec sheets:', error);
    res.json([]);
  }
});

// Get all templates - MUST be before /:id
router.get('/templates/list', async (req: Request, res: Response) => {
  try {
    const results = await db.execute(sql`SELECT * FROM document_templates WHERE is_active = true ORDER BY created_at DESC`);
    const rows = (results as any)?.rows || results || [];
    const transformed = Array.isArray(rows) ? rows.map(transformRow) : [];
    res.json(transformed);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.json([]);
  }
});

// Get template with fields - MUST be before /:id
router.get('/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const templateResults = await db.execute(sql`SELECT * FROM document_templates WHERE id = ${req.params.templateId} LIMIT 1`);
    const templates = (templateResults as any)?.rows || templateResults || [];
    const template = templates[0];
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const fieldResults = await db.execute(sql`SELECT * FROM template_fields WHERE template_id = ${req.params.templateId} ORDER BY sort_order ASC`);
    const fields = (fieldResults as any)?.rows || fieldResults || [];
    
    res.json({ template, fields: Array.isArray(fields) ? fields : [] });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Document Distribution Logs - MUST be before /:id
router.get('/distribution-logs', async (req: Request, res: Response) => {
  try {
    const { poId, departmentName } = req.query;
    
    let results;
    if (poId && departmentName) {
      const parsedPoId = Number(poId);
      if (isNaN(parsedPoId)) {
        return res.status(400).json({ error: 'Invalid PO ID' });
      }
      results = await db.execute(sql`SELECT * FROM document_distribution_logs WHERE po_id = ${parsedPoId} AND department_name = ${String(departmentName)} ORDER BY printed_at DESC LIMIT 100`);
    } else if (poId) {
      const parsedPoId = Number(poId);
      if (isNaN(parsedPoId)) {
        return res.status(400).json({ error: 'Invalid PO ID' });
      }
      results = await db.execute(sql`SELECT * FROM document_distribution_logs WHERE po_id = ${parsedPoId} ORDER BY printed_at DESC LIMIT 100`);
    } else if (departmentName) {
      results = await db.execute(sql`SELECT * FROM document_distribution_logs WHERE department_name = ${String(departmentName)} ORDER BY printed_at DESC LIMIT 100`);
    } else {
      results = await db.execute(sql`SELECT * FROM document_distribution_logs ORDER BY printed_at DESC LIMIT 100`);
    }
    
    const rows = (results as any)?.rows || results || [];
    res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error('Error fetching distribution logs:', error);
    res.json([]);
  }
});

// Routing document links by routing ID - MUST be before /:id
router.get('/routing-links/:partRoutingId', async (req: Request, res: Response) => {
  try {
    const results = await db.execute(sql`SELECT * FROM routing_document_links WHERE part_routing_id = ${req.params.partRoutingId} ORDER BY sort_order ASC`);
    const links = (results as any)?.rows || results || [];
    
    // Get the actual documents
    const enrichedLinks = await Promise.all(links.map(async (link: any) => {
      let document = null;
      try {
        if (link.document_type === 'work_instruction' || link.document_type === 'procedure' || link.document_type === 'traveler_template') {
          const docResult = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${link.document_id} LIMIT 1`);
          const docRows = (docResult as any)?.rows || docResult || [];
          document = docRows[0] || null;
        } else if (link.document_type === 'spec_sheet') {
          const docResult = await db.execute(sql`SELECT * FROM spec_sheets WHERE id = ${link.document_id} LIMIT 1`);
          const docRows = (docResult as any)?.rows || docResult || [];
          document = docRows[0] || null;
        }
      } catch (e) {
        console.warn('Error fetching linked document:', e);
      }
      return { ...link, document };
    }));
    
    res.json(enrichedLinks);
  } catch (error) {
    console.error('Error fetching routing document links:', error);
    res.json([]);
  }
});

// Certification task links - MUST be before /:id
router.get('/certification-links/:certificationId', async (req: Request, res: Response) => {
  try {
    const certId = Number(req.params.certificationId);
    if (isNaN(certId)) {
      return res.status(400).json({ error: 'Invalid certification ID' });
    }
    const results = await db.execute(sql`SELECT * FROM certification_task_links WHERE certification_id = ${certId}`);
    const rows = (results as any)?.rows || results || [];
    res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error('Error fetching certification task links:', error);
    res.json([]);
  }
});

// Get single routing document - This MUST come after all other GET routes with path segments
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Validate UUID format to avoid invalid queries
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }
    
    const results = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${req.params.id} LIMIT 1`);
    const rows = (results as any)?.rows || results || [];
    if (!rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(rows[0]);
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
    
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      
      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (storageError: any) {
      // Object Storage not available - provide alternative response
      console.warn('Object Storage unavailable, using metadata-only mode:', storageError.message);
      res.json({
        uploadURL: null,
        objectPath: null,
        metadata: { name, size, contentType },
        fallbackMode: true,
        message: 'File storage temporarily unavailable. Document will be created with metadata only.',
      });
    }
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Extract text from file (for AI analysis)
router.post('/extract-text', async (req: Request, res: Response) => {
  try {
    const { fileContent, fileName, mimeType } = req.body;
    
    if (!fileContent || !fileName) {
      return res.status(400).json({ error: 'File content and fileName are required' });
    }
    
    // Decode base64 file content
    const fileBuffer = Buffer.from(fileContent, 'base64');
    let extractedText = '';
    
    // Extract text based on file type
    if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      extractedText = await extractPdfText(fileBuffer);
      console.log(`Extracted ${extractedText.length} characters from PDF: ${fileName}`);
    } else if (mimeType?.startsWith('text/') || fileName.match(/\.(txt|md|csv|json|xml)$/i)) {
      extractedText = fileBuffer.toString('utf-8');
    }
    
    res.json({
      extractedText,
      extractedLength: extractedText.length,
      fileName,
    });
  } catch (error) {
    console.error('Error extracting text:', error);
    res.status(500).json({ error: 'Failed to extract text from file' });
  }
});

// Create document without file (metadata only)
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { title, partNumber, departmentName, documentType, isTemplate, description } = req.body;
    const user = (req as any).user;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const [document] = await db.insert(routingDocuments).values({
      title,
      partNumber: partNumber || null,
      departmentName: departmentName || null,
      documentType: documentType || 'work_instruction',
      sourceType: 'uploaded',
      description: description || null,
      isTemplate: isTemplate === true || isTemplate === 'true',
      createdBy: user?.username || 'system',
    }).returning();
    
    res.status(201).json(document);
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Upload file with content extraction - accepts base64 file content
router.post('/upload-with-extraction', async (req: Request, res: Response) => {
  try {
    const { fileContent, fileName, mimeType, title, partNumber, departmentName, documentType, isTemplate, autoAnalyze } = req.body;
    const user = (req as any).user;
    
    if (!fileContent || !fileName) {
      return res.status(400).json({ error: 'File content and fileName are required' });
    }
    
    // Decode base64 file content
    const fileBuffer = Buffer.from(fileContent, 'base64');
    let extractedText = '';
    
    // Extract text based on file type
    if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      extractedText = await extractPdfText(fileBuffer);
      console.log(`Extracted ${extractedText.length} characters from PDF: ${fileName}`);
    } else if (mimeType?.startsWith('text/') || fileName.match(/\.(txt|md|csv|json|xml)$/i)) {
      extractedText = fileBuffer.toString('utf-8');
    }
    
    // Create the document with extracted content
    const [document] = await db.insert(routingDocuments).values({
      title: title || fileName,
      partNumber: partNumber || null,
      departmentName: departmentName || null,
      documentType: documentType || 'work_instruction',
      sourceType: 'uploaded',
      fileName: fileName,
      fileType: mimeType || 'application/octet-stream',
      fileSize: fileBuffer.length,
      description: extractedText ? `Extracted ${extractedText.length} characters from file` : `Original file: ${fileName}`,
      isTemplate: isTemplate === true || isTemplate === 'true',
      createdBy: user?.username || 'system',
    }).returning();
    
    // If autoAnalyze is true and we have extracted text, run AI analysis
    let aiResult = null;
    if (autoAnalyze && extractedText.trim()) {
      try {
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
            { role: 'user', content: `Please analyze this document and extract the routing information:\n\n${extractedText.substring(0, 50000)}` }
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 4096,
        });
        
        aiResult = JSON.parse(response.choices[0]?.message?.content || '{}');
        
        // Update document with AI extracted content
        await db.update(routingDocuments)
          .set({
            aiExtractedContent: aiResult,
            aiExtractedFields: aiResult.dataFields || [],
            aiProcessedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(routingDocuments.id, document.id));
      } catch (aiError) {
        console.error('Error during auto AI analysis:', aiError);
      }
    }
    
    res.status(201).json({
      document,
      extractedText: extractedText.substring(0, 1000) + (extractedText.length > 1000 ? '...' : ''),
      extractedLength: extractedText.length,
      aiAnalysis: aiResult,
    });
  } catch (error) {
    console.error('Error uploading document with extraction:', error);
    res.status(500).json({ error: 'Failed to upload document' });
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
    const results = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${req.params.id} LIMIT 1`);
    const rows = (results as any)?.rows || results || [];
    const document = rows[0];
    
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
      // Build individual queries for each document ID to avoid SQL injection
      const refDocs: any[] = [];
      for (const docId of referenceDocumentIds) {
        const result = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${docId}`);
        const rows = (result as any)?.rows || result || [];
        if (rows.length > 0) refDocs.push(rows[0]);
      }
      
      // Validate that all referenced documents exist
      if (refDocs.length !== referenceDocumentIds.length) {
        const foundIds = refDocs.map((d: any) => d.id);
        const missingIds = referenceDocumentIds.filter((id: string) => !foundIds.includes(id));
        return res.status(400).json({ error: `Referenced documents not found: ${missingIds.join(', ')}` });
      }
      
      referenceContent = refDocs.map((doc: any) => {
        return `Document: ${doc.title}\nExtracted Content: ${JSON.stringify(doc.ai_extracted_content || {})}`;
      }).join('\n\n---\n\n');
    }
    
    // Validate and get template if provided
    let templateContent = '';
    if (templateId) {
      const templateResult = await db.execute(sql`SELECT * FROM document_templates WHERE id = ${templateId} LIMIT 1`);
      const templates = ((templateResult as any)?.rows || templateResult || []) as any[];
      const template = templates[0];
      if (!template) {
        return res.status(400).json({ error: `Template not found: ${templateId}` });
      }
      const fieldsResult = await db.execute(sql`SELECT * FROM template_fields WHERE template_id = ${templateId}`);
      const fields = ((fieldsResult as any)?.rows || fieldsResult || []) as any[];
      templateContent = `Template: ${template.template_name}\nStructure: ${JSON.stringify(template.structure)}\nSections: ${JSON.stringify(template.sections)}\nFields: ${JSON.stringify(fields)}`;
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
    const refDocs: any[] = [];
    for (const docId of referenceDocumentIds) {
      const result = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${docId}`);
      const rows = (result as any)?.rows || result || [];
      if (rows.length > 0) refDocs.push(rows[0]);
    }
    
    if (refDocs.length === 0) {
      return res.status(404).json({ error: 'No reference documents found' });
    }
    
    // Validate that all referenced documents exist
    if (refDocs.length !== referenceDocumentIds.length) {
      const foundIds = refDocs.map((d: any) => d.id);
      const missingIds = referenceDocumentIds.filter((id: string) => !foundIds.includes(id));
      return res.status(400).json({ error: `Referenced documents not found: ${missingIds.join(', ')}` });
    }
    
    // Analyze patterns across documents - using snake_case for raw SQL result columns
    const documentAnalysis = refDocs.map((doc: any) => ({
      title: doc.title,
      documentType: doc.document_type,
      extractedContent: doc.ai_extracted_content,
      extractedFields: doc.ai_extracted_fields,
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
    
    const fieldsResult = await db.execute(sql`SELECT * FROM template_fields WHERE template_id = ${template.id} ORDER BY sort_order ASC`);
    const fields = ((fieldsResult as any)?.rows || fieldsResult || []) as any[];
    
    res.status(201).json({ template, fields, learnedContent });
  } catch (error) {
    console.error('Error learning template:', error);
    res.status(500).json({ error: 'Failed to learn template from documents' });
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

// Create Distribution Log
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

export default router;
