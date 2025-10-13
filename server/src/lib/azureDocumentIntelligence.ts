import { DocumentAnalysisClient, AzureKeyCredential, AnalyzeResult } from "@azure/ai-form-recognizer";

let client: DocumentAnalysisClient | null = null;

function getClient(): DocumentAnalysisClient {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !apiKey) {
    throw new Error("Azure Document Intelligence credentials not configured. Please set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY environment variables.");
  }

  if (!client) {
    client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
  }

  return client;
}

export type DocumentType = 'invoice' | 'receipt' | 'document' | 'layout' | 'businessCard' | 'idDocument';

export interface AnalysisResult {
  documentType: DocumentType;
  content: string;
  fields?: Record<string, any>;
  tables?: Array<{
    rowCount: number;
    columnCount: number;
    cells: Array<{
      rowIndex: number;
      columnIndex: number;
      content: string;
    }>;
  }>;
  keyValuePairs?: Array<{
    key: string;
    value: string;
  }>;
}

export async function analyzeDocument(
  fileBuffer: Buffer,
  documentType: DocumentType = 'document'
): Promise<AnalysisResult> {
  const modelId = getModelId(documentType);
  const azureClient = getClient();
  
  const poller = await azureClient.beginAnalyzeDocument(modelId, fileBuffer);
  const result: AnalyzeResult = await poller.pollUntilDone();

  return formatAnalysisResult(result, documentType);
}

export async function analyzeDocumentFromUrl(
  documentUrl: string,
  documentType: DocumentType = 'document'
): Promise<AnalysisResult> {
  const modelId = getModelId(documentType);
  const azureClient = getClient();
  
  const poller = await azureClient.beginAnalyzeDocumentFromUrl(modelId, documentUrl);
  const result: AnalyzeResult = await poller.pollUntilDone();

  return formatAnalysisResult(result, documentType);
}

function getModelId(documentType: DocumentType): string {
  const modelMap: Record<DocumentType, string> = {
    invoice: 'prebuilt-invoice',
    receipt: 'prebuilt-receipt',
    document: 'prebuilt-document',
    layout: 'prebuilt-layout',
    businessCard: 'prebuilt-businessCard',
    idDocument: 'prebuilt-idDocument'
  };
  
  return modelMap[documentType] || 'prebuilt-document';
}

function formatAnalysisResult(result: AnalyzeResult, documentType: DocumentType): AnalysisResult {
  const formattedResult: AnalysisResult = {
    documentType,
    content: result.content || '',
    fields: {},
    tables: [],
    keyValuePairs: []
  };

  if (result.documents && result.documents.length > 0) {
    const document = result.documents[0];
    
    if (document.fields) {
      formattedResult.fields = {};
      for (const [key, field] of Object.entries(document.fields)) {
        const fieldValue = field.kind === 'string' || field.kind === 'number' || field.kind === 'date' 
          ? field.value 
          : field.content;
        
        formattedResult.fields[key] = {
          value: fieldValue,
          confidence: field.confidence
        };
      }
    }
  }

  if (result.tables) {
    formattedResult.tables = result.tables.map(table => ({
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      cells: table.cells.map(cell => ({
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        content: cell.content
      }))
    }));
  }

  if (result.keyValuePairs) {
    formattedResult.keyValuePairs = result.keyValuePairs.map(pair => ({
      key: pair.key?.content || '',
      value: pair.value?.content || ''
    }));
  }

  return formattedResult;
}

export async function extractInvoiceData(fileBuffer: Buffer) {
  const result = await analyzeDocument(fileBuffer, 'invoice');
  
  return {
    vendorName: result.fields?.VendorName?.value || '',
    vendorAddress: result.fields?.VendorAddress?.value || '',
    customerName: result.fields?.CustomerName?.value || '',
    customerAddress: result.fields?.CustomerAddress?.value || '',
    invoiceId: result.fields?.InvoiceId?.value || '',
    invoiceDate: result.fields?.InvoiceDate?.value || '',
    invoiceTotal: result.fields?.InvoiceTotal?.value || 0,
    amountDue: result.fields?.AmountDue?.value || 0,
    items: result.fields?.Items?.value || [],
    ...result
  };
}

export async function extractReceiptData(fileBuffer: Buffer) {
  const result = await analyzeDocument(fileBuffer, 'receipt');
  
  return {
    merchantName: result.fields?.MerchantName?.value || '',
    merchantAddress: result.fields?.MerchantAddress?.value || '',
    merchantPhoneNumber: result.fields?.MerchantPhoneNumber?.value || '',
    transactionDate: result.fields?.TransactionDate?.value || '',
    transactionTime: result.fields?.TransactionTime?.value || '',
    total: result.fields?.Total?.value || 0,
    subtotal: result.fields?.Subtotal?.value || 0,
    tax: result.fields?.TotalTax?.value || 0,
    items: result.fields?.Items?.value || [],
    ...result
  };
}

export interface TrainingContent {
  title: string;
  description: string;
  content: string;
  contentHtml: string;
  category: string | null;
  estimatedMinutes: number;
  questions: Array<{
    questionText: string;
    questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
    correctAnswer: string | null;
    explanation: string | null;
    options?: Array<{
      optionText: string;
      isCorrect: boolean;
    }>;
  }>;
}

export async function extractTrainingContent(fileBuffer: Buffer): Promise<TrainingContent> {
  const result = await analyzeDocument(fileBuffer, 'layout');
  
  const content = result.content || '';
  const lines = content.split('\n').filter(line => line.trim());
  
  const title = lines[0]?.trim() || 'Untitled Training Module';
  
  const descriptionMatch = content.match(/(?:description|summary|overview):?\s*([^\n]+)/i);
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';
  
  const categoryMatch = content.match(/(?:category|topic|subject):?\s*([^\n]+)/i);
  const category = categoryMatch ? categoryMatch[1].trim() : null;
  
  const wordCount = content.split(/\s+/).length;
  const estimatedMinutes = Math.max(5, Math.ceil(wordCount / 200));
  
  const contentHtml = `<div class="training-content">${lines.map(line => `<p>${line}</p>`).join('')}</div>`;
  
  const questions = parseQuestions(content);
  
  return {
    title,
    description,
    content,
    contentHtml,
    category,
    estimatedMinutes,
    questions
  };
}

function parseQuestions(content: string): TrainingContent['questions'] {
  const questions: TrainingContent['questions'] = [];
  
  // Split content into question blocks
  const questionPattern = /(?:question|q)\s*(\d+)[:\.\)]\s*([^\n]+)/gi;
  const matches = Array.from(content.matchAll(questionPattern));
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const questionText = match[2].trim();
    const questionStartIndex = match.index || 0;
    
    // Find the end of this question block (start of next question or end of content)
    const nextQuestionIndex = i < matches.length - 1 
      ? (matches[i + 1].index || content.length)
      : content.length;
    
    // Extract just this question's block
    const questionBlock = content.substring(questionStartIndex, nextQuestionIndex);
    
    // Check if it's a true/false question
    if (questionText.toLowerCase().includes('true or false') || 
        questionBlock.toLowerCase().includes('true or false')) {
      questions.push({
        questionText: questionText.replace(/\s*\(true or false\)/i, '').trim(),
        questionType: 'TRUE_FALSE',
        correctAnswer: null,
        explanation: null,
        options: [
          { optionText: 'True', isCorrect: false },
          { optionText: 'False', isCorrect: false }
        ]
      });
    } else {
      // Look for multiple choice options only within this question block
      const optionPattern = /^[a-d][\.\)]\s*([^\n]+)/gim;
      const optionMatches = Array.from(questionBlock.matchAll(optionPattern));
      
      if (optionMatches.length >= 2) {
        // Multiple choice question
        questions.push({
          questionText,
          questionType: 'MULTIPLE_CHOICE',
          correctAnswer: null,
          explanation: null,
          options: optionMatches.slice(0, 4).map(opt => ({
            optionText: opt[1].trim(),
            isCorrect: false
          }))
        });
      } else {
        // Short answer question
        questions.push({
          questionText,
          questionType: 'SHORT_ANSWER',
          correctAnswer: null,
          explanation: null
        });
      }
    }
  }
  
  return questions;
}
