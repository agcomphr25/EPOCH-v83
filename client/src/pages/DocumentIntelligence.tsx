import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

type DocumentType =
  | 'invoice'
  | 'receipt'
  | 'document'
  | 'layout'
  | 'businessCard'
  | 'idDocument';

interface AnalysisResult {
  documentType: DocumentType;
  content: string;
  fields?: Record<string, { value: any; confidence: number }>;
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

export default function DocumentIntelligence() {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>('document');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const analyzeDocument = async () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select a file to analyze',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);

      const response = await fetch('/api/document-intelligence/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to analyze document');
      }

      const data = await response.json();
      setResult(data);

      toast({
        title: 'Analysis complete',
        description: 'Document has been successfully analyzed',
      });
    } catch (error: any) {
      toast({
        title: 'Analysis failed',
        description: error.message || 'Failed to analyze document',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const extractInvoice = async () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select an invoice to analyze',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        '/api/document-intelligence/extract-invoice',
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error('Failed to extract invoice data');
      }

      const data = await response.json();
      setResult(data);

      toast({
        title: 'Invoice extracted',
        description: 'Invoice data has been successfully extracted',
      });
    } catch (error: any) {
      toast({
        title: 'Extraction failed',
        description: error.message || 'Failed to extract invoice data',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const extractReceipt = async () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select a receipt to analyze',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        '/api/document-intelligence/extract-receipt',
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error('Failed to extract receipt data');
      }

      const data = await response.json();
      setResult(data);

      toast({
        title: 'Receipt extracted',
        description: 'Receipt data has been successfully extracted',
      });
    } catch (error: any) {
      toast({
        title: 'Extraction failed',
        description: error.message || 'Failed to extract receipt data',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Azure Document Intelligence</h1>
          <p className="text-muted-foreground mt-2">
            Extract data from documents using AI-powered analysis
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Upload Document</CardTitle>
            <CardDescription>
              Select a document to analyze (PDF, JPG, PNG supported)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">Document File</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                data-testid="input-document-file"
              />
            </div>

            {file && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span data-testid="text-selected-file">{file.name}</span>
              </div>
            )}

            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general" data-testid="tab-general">
                  General
                </TabsTrigger>
                <TabsTrigger value="invoice" data-testid="tab-invoice">
                  Invoice
                </TabsTrigger>
                <TabsTrigger value="receipt" data-testid="tab-receipt">
                  Receipt
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="documentType">Document Type</Label>
                  <Select
                    value={documentType}
                    onValueChange={(value) =>
                      setDocumentType(value as DocumentType)
                    }
                  >
                    <SelectTrigger
                      id="documentType"
                      data-testid="select-document-type"
                    >
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="document">General Document</SelectItem>
                      <SelectItem value="layout">Layout Analysis</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="receipt">Receipt</SelectItem>
                      <SelectItem value="businessCard">
                        Business Card
                      </SelectItem>
                      <SelectItem value="idDocument">ID Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={analyzeDocument}
                  disabled={!file || isAnalyzing}
                  className="w-full"
                  data-testid="button-analyze-general"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Analyze Document
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="invoice" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Extract structured invoice data including vendor, customer,
                  amounts, and line items.
                </p>
                <Button
                  onClick={extractInvoice}
                  disabled={!file || isAnalyzing}
                  className="w-full"
                  data-testid="button-extract-invoice"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Extract Invoice Data
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="receipt" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Extract receipt data including merchant, items, totals, and
                  transaction details.
                </p>
                <Button
                  onClick={extractReceipt}
                  disabled={!file || isAnalyzing}
                  className="w-full"
                  data-testid="button-extract-receipt"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Extract Receipt Data
                    </>
                  )}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
            <CardDescription>
              Extracted data and insights from your document
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4" />
                <p>Upload and analyze a document to see results</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold">Document Type</h3>
                  <p
                    className="text-sm capitalize"
                    data-testid="text-result-type"
                  >
                    {result.documentType}
                  </p>
                </div>

                {result.fields && Object.keys(result.fields).length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold">Extracted Fields</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {Object.entries(result.fields).map(([key, field]) => (
                        <div
                          key={key}
                          className="border rounded p-2"
                          data-testid={`field-${key}`}
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-medium text-sm">{key}:</span>
                            <span className="text-xs text-muted-foreground">
                              {(field.confidence * 100).toFixed(0)}% confident
                            </span>
                          </div>
                          <p className="text-sm mt-1">{String(field.value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.tables && result.tables.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold">
                      Tables ({result.tables.length})
                    </h3>
                    {result.tables.map((table, idx) => (
                      <div key={idx} className="border rounded p-2">
                        <p className="text-sm text-muted-foreground">
                          {table.rowCount} rows × {table.columnCount} columns
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {result.keyValuePairs && result.keyValuePairs.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold">
                      Key-Value Pairs ({result.keyValuePairs.length})
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {result.keyValuePairs.map((pair, idx) => (
                        <div key={idx} className="border rounded p-2">
                          <span className="font-medium text-sm">
                            {pair.key}:
                          </span>
                          <p className="text-sm mt-1">{pair.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.content && (
                  <div className="space-y-2">
                    <h3 className="font-semibold">Extracted Text</h3>
                    <div className="border rounded p-3 max-h-64 overflow-y-auto">
                      <pre
                        className="text-xs whitespace-pre-wrap"
                        data-testid="text-extracted-content"
                      >
                        {result.content}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
