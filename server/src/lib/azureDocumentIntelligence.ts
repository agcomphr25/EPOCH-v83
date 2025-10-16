import {
  DocumentAnalysisClient,
  AzureKeyCredential,
  AnalyzeResult,
} from '@azure/ai-form-recognizer';

let client: DocumentAnalysisClient | null = null;

function getClient(): DocumentAnalysisClient {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !apiKey) {
    throw new Error(
      'Azure Document Intelligence credentials not configured. Please set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY environment variables.'
    );
  }

  if (!client) {
    client = new DocumentAnalysisClient(
      endpoint,
      new AzureKeyCredential(apiKey)
    );
  }

  return client;
}

export type DocumentType =
  | 'invoice'
  | 'receipt'
  | 'document'
  | 'layout'
  | 'businessCard'
  | 'idDocument';

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

  const poller = await azureClient.beginAnalyzeDocumentFromUrl(
    modelId,
    documentUrl
  );
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
    idDocument: 'prebuilt-idDocument',
  };

  return modelMap[documentType] || 'prebuilt-document';
}

function formatAnalysisResult(
  result: AnalyzeResult,
  documentType: DocumentType
): AnalysisResult {
  const formattedResult: AnalysisResult = {
    documentType,
    content: result.content || '',
    fields: {},
    tables: [],
    keyValuePairs: [],
  };

  if (result.documents && result.documents.length > 0) {
    const document = result.documents[0];

    if (document.fields) {
      formattedResult.fields = {};
      for (const [key, field] of Object.entries(document.fields)) {
        const fieldValue =
          field.kind === 'string' ||
          field.kind === 'number' ||
          field.kind === 'date'
            ? field.value
            : field.content;

        formattedResult.fields[key] = {
          value: fieldValue,
          confidence: field.confidence,
        };
      }
    }
  }

  if (result.tables) {
    formattedResult.tables = result.tables.map((table) => ({
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      cells: table.cells.map((cell) => ({
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        content: cell.content,
      })),
    }));
  }

  if (result.keyValuePairs) {
    formattedResult.keyValuePairs = result.keyValuePairs.map((pair) => ({
      key: pair.key?.content || '',
      value: pair.value?.content || '',
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
    ...result,
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
    ...result,
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

export async function extractTrainingContent(
  fileBuffer: Buffer
): Promise<TrainingContent> {
  const result = await analyzeDocument(fileBuffer, 'layout');

  const content = result.content || '';
  const lines = content.split('\n').filter((line) => line.trim());

  const title = lines[0]?.trim() || 'Untitled Training Module';

  const descriptionMatch = content.match(
    /(?:description|summary|overview):?\s*([^\n]+)/i
  );
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';

  const categoryMatch = content.match(
    /(?:category|topic|subject):?\s*([^\n]+)/i
  );
  const category = categoryMatch ? categoryMatch[1].trim() : null;

  const wordCount = content.split(/\s+/).length;
  const estimatedMinutes = Math.max(5, Math.ceil(wordCount / 200));

  const contentHtml = `<div class="training-content">${lines.map((line) => `<p>${line}</p>`).join('')}</div>`;

  const questions = parseQuestions(content);

  return {
    title,
    description,
    content,
    contentHtml,
    category,
    estimatedMinutes,
    questions,
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
    const nextQuestionIndex =
      i < matches.length - 1
        ? matches[i + 1].index || content.length
        : content.length;

    // Extract just this question's block
    const questionBlock = content.substring(
      questionStartIndex,
      nextQuestionIndex
    );

    // Check if it's a true/false question
    if (
      questionText.toLowerCase().includes('true or false') ||
      questionBlock.toLowerCase().includes('true or false')
    ) {
      questions.push({
        questionText: questionText.replace(/\s*\(true or false\)/i, '').trim(),
        questionType: 'TRUE_FALSE',
        correctAnswer: null,
        explanation: null,
        options: [
          { optionText: 'True', isCorrect: false },
          { optionText: 'False', isCorrect: false },
        ],
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
          options: optionMatches.slice(0, 4).map((opt) => ({
            optionText: opt[1].trim(),
            isCorrect: false,
          })),
        });
      } else {
        // Short answer question
        questions.push({
          questionText,
          questionType: 'SHORT_ANSWER',
          correctAnswer: null,
          explanation: null,
        });
      }
    }
  }

  return questions;
}

export interface CertificationContent {
  name: string;
  description: string;
  issuingOrganization: string | null;
  validityPeriod: number | null;
  category: string | null;
  requirements: string;
  jobPosition: string | null;
  workInstructions: string[];
}

export async function extractCertificationContent(
  fileBuffer: Buffer
): Promise<CertificationContent> {
  const result = await analyzeDocument(fileBuffer, 'document');

  const content = result.content || '';
  const lines = content.split('\n').filter((line) => line.trim());

  const name = lines[0]?.trim() || 'Untitled Certification';

  const descriptionMatch = content.match(
    /(?:description|summary|overview|purpose):?\s*([^\n]+)/i
  );
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';

  const orgMatch = content.match(
    /(?:issuing organization|issued by|certifying body):?\s*([^\n]+)/i
  );
  const issuingOrganization = orgMatch ? orgMatch[1].trim() : null;

  const validityMatch = content.match(
    /(?:validity|valid for|expiry period):?\s*(\d+)\s*(?:months?|years?)/i
  );
  let validityPeriod: number | null = null;
  if (validityMatch) {
    validityPeriod = parseInt(validityMatch[1]);
    if (validityMatch[0].toLowerCase().includes('year')) {
      validityPeriod = validityPeriod * 12;
    }
  }

  const categoryMatch = content.match(
    /(?:category|type|certification type):?\s*([^\n]+)/i
  );
  const category = categoryMatch
    ? categoryMatch[1].trim().toUpperCase()
    : 'TECHNICAL';

  const positionMatch = content.match(
    /(?:job position|position|role|job title):?\s*([^\n]+)/i
  );
  const jobPosition = positionMatch ? positionMatch[1].trim() : null;

  const requirementsMatch = content.match(
    /(?:requirements|prerequisites|qualifications):?\s*([\s\S]*?)(?:\n\n|work instructions|$)/i
  );
  const requirements = requirementsMatch
    ? requirementsMatch[1].trim()
    : content.substring(0, 500);

  const workInstructions: string[] = [];
  const instructionsPattern =
    /(?:work instructions?|procedure|steps?|tasks?):?\s*([\s\S]*?)(?:\n\n|$)/gi;
  const instructionsMatches = Array.from(content.matchAll(instructionsPattern));

  instructionsMatches.forEach((match) => {
    const instructionText = match[1].trim();
    const steps = instructionText.split(/\n/).filter((s) => s.trim());
    workInstructions.push(...steps);
  });

  if (workInstructions.length === 0 && lines.length > 3) {
    const startIdx = lines.findIndex(
      (line) =>
        line.toLowerCase().includes('instruction') ||
        line.toLowerCase().includes('procedure') ||
        line.toLowerCase().includes('step')
    );
    if (startIdx > 0 && startIdx < lines.length - 1) {
      workInstructions.push(
        ...lines.slice(startIdx + 1, Math.min(startIdx + 10, lines.length))
      );
    }
  }

  return {
    name,
    description,
    issuingOrganization,
    validityPeriod,
    category,
    requirements,
    jobPosition,
    workInstructions,
  };
}

export interface TrainingMatrixData {
  entries: Array<{
    employeeName: string | null;
    jobTitle: string | null;
    department: string | null;
    trainingName: string;
    requiredBy: string | null;
    frequency: string | null;
    lastCompleted: Date | null;
    nextDue: Date | null;
    status: 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'NOT_REQUIRED';
    notes: string | null;
  }>;
}

export async function extractTrainingMatrixData(
  fileBuffer: Buffer
): Promise<TrainingMatrixData> {
  const result = await analyzeDocument(fileBuffer, 'layout');

  const content = result.content || '';
  const entries: TrainingMatrixData['entries'] = [];

  // Try to extract table data if available
  if (result.tables && result.tables.length > 0) {
    const table = result.tables[0];

    // Find header row to identify columns
    const headerCells = table.cells.filter((cell) => cell.rowIndex === 0);
    const headers = headerCells.map((cell) =>
      cell.content.toLowerCase().trim()
    );

    // Check if this is a matrix-style table (employees as columns, trainings as rows)
    const isMatrixStyle =
      headers.length > 3 &&
      !headers.some((h) => h.includes('training') && h.includes('name'));

    if (isMatrixStyle) {
      // Matrix-style: Detect which column has training names dynamically
      const maxRow = Math.max(...table.cells.map((c) => c.rowIndex));
      const maxCol = Math.max(...table.cells.map((c) => c.columnIndex));

      // Analyze each column to find the one with training names
      const columnStats: Array<{
        colIdx: number;
        textCount: number;
        dateCount: number;
        hasEmptyHeader: boolean;
      }> = [];

      for (let colIdx = 0; colIdx <= maxCol; colIdx++) {
        let textCount = 0;
        let dateCount = 0;
        const headerCell = headerCells.find((c) => c.columnIndex === colIdx);
        const hasEmptyHeader = !headerCell || !headerCell.content.trim();

        // Analyze data rows for this column
        for (let rowIdx = 1; rowIdx <= maxRow; rowIdx++) {
          const cell = table.cells.find(
            (c) => c.rowIndex === rowIdx && c.columnIndex === colIdx
          );
          const value = cell?.content.trim() || '';

          if (value) {
            // Check if it looks like a date
            if (
              /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(value) ||
              value === ':unselected:'
            ) {
              dateCount++;
            } else if (value.length > 3) {
              textCount++;
            }
          }
        }

        columnStats.push({ colIdx, textCount, dateCount, hasEmptyHeader });
      }

      // Find training column: highest text count with low date count, or empty header
      const trainingColIdx = columnStats.reduce((best, curr) => {
        const currScore =
          curr.textCount * 10 - curr.dateCount + (curr.hasEmptyHeader ? 5 : 0);
        const bestScore =
          best.textCount * 10 - best.dateCount + (best.hasEmptyHeader ? 5 : 0);
        return currScore > bestScore ? curr : best;
      }).colIdx;

      // Extract employee names from headers (excluding training column)
      const employeeColumns: Array<{ colIdx: number; name: string }> = [];
      for (let colIdx = 0; colIdx <= maxCol; colIdx++) {
        if (colIdx !== trainingColIdx) {
          const headerCell = headerCells.find((c) => c.columnIndex === colIdx);
          const name = headerCell?.content.trim() || '';
          if (name && !name.toLowerCase().includes('training')) {
            employeeColumns.push({ colIdx, name });
          }
        }
      }

      // Extract training data
      const processedRows = new Set<number>();

      for (let rowIdx = 1; rowIdx <= maxRow; rowIdx++) {
        if (processedRows.has(rowIdx)) continue;

        const trainingCell = table.cells.find(
          (c) => c.rowIndex === rowIdx && c.columnIndex === trainingColIdx
        );
        const trainingName = trainingCell?.content.trim() || '';

        // Skip empty or header-like training names
        if (
          !trainingName ||
          trainingName.toLowerCase().includes('employee') ||
          trainingName === ':unselected:'
        ) {
          continue;
        }

        processedRows.add(rowIdx);

        // Process each employee column
        employeeColumns.forEach(({ colIdx, name }) => {
          const cell = table.cells.find(
            (c) => c.rowIndex === rowIdx && c.columnIndex === colIdx
          );
          const cellValue = cell?.content.trim() || '';

          // Only create entry if there's meaningful data
          if (cellValue && cellValue !== ':unselected:' && cellValue !== '-') {
            let lastCompleted: Date | null = null;
            let status: 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'NOT_REQUIRED' =
              'PENDING';

            // Try to parse date
            const dateMatch = cellValue.match(
              /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/
            );
            if (dateMatch) {
              try {
                lastCompleted = new Date(dateMatch[1]);
                status = 'COMPLETED';
              } catch (e) {
                // Date parsing failed
              }
            } else if (cellValue.toLowerCase().includes('complete')) {
              status = 'COMPLETED';
            } else if (cellValue.toLowerCase().includes('pending')) {
              status = 'PENDING';
            } else if (cellValue.toLowerCase().includes('overdue')) {
              status = 'OVERDUE';
            }

            entries.push({
              employeeName: name,
              jobTitle: null,
              department: null,
              trainingName,
              requiredBy: null,
              frequency: null,
              lastCompleted,
              nextDue: null,
              status,
              notes:
                cellValue !== lastCompleted?.toLocaleDateString()
                  ? cellValue
                  : null,
            });
          }
        });
      }
    } else {
      // Traditional table format: columns for each field
      const colMap: Record<string, number> = {};
      headers.forEach((header, idx) => {
        if (header.includes('employee') || header.includes('name'))
          colMap.employeeName = idx;
        if (
          header.includes('job') ||
          header.includes('title') ||
          header.includes('position')
        )
          colMap.jobTitle = idx;
        if (header.includes('department') || header.includes('dept'))
          colMap.department = idx;
        if (header.includes('training') || header.includes('course'))
          colMap.trainingName = idx;
        if (header.includes('required') || header.includes('requirement'))
          colMap.requiredBy = idx;
        if (header.includes('frequency') || header.includes('recurring'))
          colMap.frequency = idx;
        if (header.includes('last') || header.includes('completed'))
          colMap.lastCompleted = idx;
        if (header.includes('next') || header.includes('due'))
          colMap.nextDue = idx;
        if (header.includes('status')) colMap.status = idx;
        if (header.includes('note')) colMap.notes = idx;
      });

      // Extract data rows
      const maxRow = Math.max(...table.cells.map((c) => c.rowIndex));
      for (let rowIdx = 1; rowIdx <= maxRow; rowIdx++) {
        const rowCells = table.cells.filter((cell) => cell.rowIndex === rowIdx);

        const entry: any = {
          employeeName: null,
          jobTitle: null,
          department: null,
          trainingName: 'Unknown Training',
          requiredBy: null,
          frequency: null,
          lastCompleted: null,
          nextDue: null,
          status: 'PENDING',
          notes: null,
        };

        rowCells.forEach((cell) => {
          const colIdx = cell.columnIndex;
          const value = cell.content.trim();

          if (colMap.employeeName === colIdx && value)
            entry.employeeName = value;
          if (colMap.jobTitle === colIdx && value) entry.jobTitle = value;
          if (colMap.department === colIdx && value) entry.department = value;
          if (colMap.trainingName === colIdx && value)
            entry.trainingName = value;
          if (colMap.requiredBy === colIdx && value) entry.requiredBy = value;
          if (colMap.frequency === colIdx && value) entry.frequency = value;
          if (colMap.lastCompleted === colIdx && value) {
            try {
              entry.lastCompleted = new Date(value);
            } catch (e) {
              entry.lastCompleted = null;
            }
          }
          if (colMap.nextDue === colIdx && value) {
            try {
              entry.nextDue = new Date(value);
            } catch (e) {
              entry.nextDue = null;
            }
          }
          if (colMap.status === colIdx && value) {
            const statusUpper = value.toUpperCase();
            if (
              ['PENDING', 'COMPLETED', 'OVERDUE', 'NOT_REQUIRED'].includes(
                statusUpper
              )
            ) {
              entry.status = statusUpper as any;
            }
          }
          if (colMap.notes === colIdx && value) entry.notes = value;
        });

        // Only add if we have at least a training name
        if (entry.trainingName && entry.trainingName !== 'Unknown Training') {
          entries.push(entry);
        }
      }
    }
  } else {
    // Fallback: Parse text-based format
    const lines = content.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      // Skip header-like lines
      if (
        line.toLowerCase().includes('employee') &&
        line.toLowerCase().includes('training')
      ) {
        continue;
      }

      // Try to extract training info from line
      const trainingMatch = line.match(
        /([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+)/
      );
      if (trainingMatch) {
        entries.push({
          employeeName: trainingMatch[1]?.trim() || null,
          jobTitle: null,
          department: trainingMatch[2]?.trim() || null,
          trainingName: trainingMatch[3]?.trim() || 'Unknown Training',
          requiredBy: null,
          frequency: trainingMatch[4]?.trim() || null,
          lastCompleted: null,
          nextDue: null,
          status: 'PENDING',
          notes: null,
        });
      }
    }
  }

  return { entries };
}
