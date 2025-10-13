import { DocumentAnalysisClient, AzureKeyCredential, AnalyzeResult } from "@azure/ai-form-recognizer";

const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

if (!endpoint || !apiKey) {
  throw new Error("Azure Document Intelligence credentials not configured");
}

const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));

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
  
  const poller = await client.beginAnalyzeDocument(modelId, fileBuffer);
  const result: AnalyzeResult = await poller.pollUntilDone();

  return formatAnalysisResult(result, documentType);
}

export async function analyzeDocumentFromUrl(
  documentUrl: string,
  documentType: DocumentType = 'document'
): Promise<AnalysisResult> {
  const modelId = getModelId(documentType);
  
  const poller = await client.beginAnalyzeDocumentFromUrl(modelId, documentUrl);
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
