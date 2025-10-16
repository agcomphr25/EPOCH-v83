import { useState } from 'react';
import { useLocation } from 'wouter';
import { Upload, CheckCircle, XCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
  details: Array<{
    employee: string;
    certification: string;
    action: 'created' | 'updated';
    date: string | null;
  }>;
}

export default function ImportCertifications() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = ['application/pdf', 'text/csv', 'application/vnd.ms-excel'];
      if (!validTypes.includes(file.type) && !file.name.endsWith('.csv')) {
        toast({
          title: 'Invalid File',
          description: 'Please select a PDF or CSV file',
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    // Determine endpoint based on file type
    const isCSV = selectedFile.name.endsWith('.csv') || selectedFile.type === 'text/csv';
    const endpoint = isCSV 
      ? '/api/employees/import-certifications-csv'
      : '/api/employees/import-certifications-pdf';

    try {
      const result = await apiRequest(
        endpoint,
        {
          method: 'POST',
          body: formData,
        }
      ) as ImportResult;

      setImportResult(result);
      
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${result.imported} certifications`,
      });
    } catch (error) {
      toast({
        title: 'Import Failed',
        description: (error as Error).message || 'Failed to import certifications',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/training-matrix')}
          className="mb-4"
          data-testid="button-back-to-matrix"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Training Matrix
        </Button>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Import Employee Certifications
        </h1>
        <p className="text-muted-foreground mt-2" data-testid="text-page-description">
          Upload a PDF training matrix to automatically import employee certifications
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Upload Training Matrix</CardTitle>
            <CardDescription>
              Select a CSV or PDF file containing your employee certification matrix. CSV format is recommended for best compatibility.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground mb-2">
                      {selectedFile ? selectedFile.name : 'Click to select CSV or PDF file'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      CSV format: Employee, Certification, Date
                    </p>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".csv,.pdf"
                      onChange={handleFileSelect}
                      className="hidden"
                      data-testid="input-file-upload"
                    />
                  </div>
                </label>
              </div>
            </div>

            {selectedFile && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedFile(null);
                    setImportResult(null);
                  }}
                  data-testid="button-clear-file"
                >
                  Clear
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  data-testid="button-import"
                >
                  {isUploading ? 'Importing...' : 'Import Certifications'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {importResult && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Import Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-total-count">
                      {importResult.total}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Entries</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-imported-count">
                      {importResult.imported}
                    </div>
                    <div className="text-sm text-muted-foreground">Imported</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-skipped-count">
                      {importResult.skipped}
                    </div>
                    <div className="text-sm text-muted-foreground">Skipped</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {importResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-semibold mb-2">Import Errors:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {importResult.errors.slice(0, 10).map((error, idx) => (
                      <li key={idx} className="text-sm" data-testid={`text-error-${idx}`}>
                        {error}
                      </li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li className="text-sm text-muted-foreground">
                        ...and {importResult.errors.length - 10} more errors
                      </li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {importResult.details.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Import Details</CardTitle>
                  <CardDescription>
                    {importResult.details.length} certifications processed
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {importResult.details.map((detail, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                        data-testid={`row-detail-${idx}`}
                      >
                        {detail.action === 'created' ? (
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <div className="font-medium" data-testid={`text-employee-${idx}`}>
                            {detail.employee}
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`text-certification-${idx}`}>
                            {detail.certification}
                            {detail.date && ` - ${new Date(detail.date).toLocaleDateString()}`}
                          </div>
                        </div>
                        <div className="text-xs font-medium px-2 py-1 bg-background rounded" data-testid={`text-action-${idx}`}>
                          {detail.action}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-center">
              <Button
                onClick={() => navigate('/training-matrix')}
                data-testid="button-view-matrix"
              >
                View Training Matrix
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
