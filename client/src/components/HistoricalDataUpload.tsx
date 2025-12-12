import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';
import Papa from 'papaparse';

interface HistoricalRecord {
  model: string;
  orderDate: string;
  dueDate: string;
  fulfilledDate: string;
}

interface ParsedData {
  records: HistoricalRecord[];
  errors: string[];
  warnings: string[];
}

function parseCSVData(csvText: string): ParsedData {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const records: HistoricalRecord[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (result.errors.length > 0) {
    result.errors.forEach((err) => {
      errors.push(`Row ${err.row}: ${err.message}`);
    });
  }

  const fieldMapping: Record<string, string> = {
    model: 'model',
    model_id: 'model',
    modelid: 'model',
    stock_model: 'model',
    stockmodel: 'model',
    order_date: 'orderDate',
    orderdate: 'orderDate',
    ordered: 'orderDate',
    due_date: 'dueDate',
    duedate: 'dueDate',
    due: 'dueDate',
    fulfilled_date: 'fulfilledDate',
    fulfilleddate: 'fulfilledDate',
    shipped_date: 'fulfilledDate',
    shippeddate: 'fulfilledDate',
    completed_date: 'fulfilledDate',
    completeddate: 'fulfilledDate',
    shipped: 'fulfilledDate',
    fulfilled: 'fulfilledDate',
    completed: 'fulfilledDate',
  };

  (result.data as Record<string, string>[]).forEach((row, index) => {
    const record: Partial<HistoricalRecord> = {};

    Object.entries(row).forEach(([key, value]) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const mappedField = fieldMapping[normalizedKey];
      if (mappedField && value) {
        (record as any)[mappedField] = value.trim();
      }
    });

    if (!record.model) {
      warnings.push(`Row ${index + 2}: Missing model name`);
      return;
    }
    if (!record.orderDate) {
      warnings.push(`Row ${index + 2}: Missing order date`);
      return;
    }
    if (!record.fulfilledDate) {
      warnings.push(`Row ${index + 2}: Missing fulfilled date`);
      return;
    }

    records.push(record as HistoricalRecord);
  });

  return { records, errors, warnings };
}

export default function HistoricalDataUpload() {
  const [isOpen, setIsOpen] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (data: HistoricalRecord[]) => {
      return apiRequest('/api/model-analytics/historical-data', {
        method: 'POST',
        body: JSON.stringify({ data }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (result: any) => {
      toast.success(`Successfully processed ${result.recordsProcessed} historical records`);
      queryClient.invalidateQueries({ queryKey: ['/api/model-analytics'] });
      setIsOpen(false);
      setParsedData(null);
      setFileName('');
    },
    onError: () => {
      toast.error('Failed to upload historical data');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const csvText = event.target?.result as string;
      const parsed = parseCSVData(csvText);
      setParsedData(parsed);
    };
    reader.readAsText(file);
  };

  const handleUpload = () => {
    if (parsedData && parsedData.records.length > 0) {
      uploadMutation.mutate(parsedData.records);
    }
  };

  const resetForm = () => {
    setParsedData(null);
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" data-testid="button-upload-historical">
          <Upload className="w-4 h-4" />
          Upload Historical Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Upload Historical Production Data
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file with historical order data to improve due date predictions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
                <Info className="w-4 h-4" />
                Expected CSV Format
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <p className="text-sm text-blue-600 mb-2">
                Your CSV should include columns for:
              </p>
              <ul className="text-sm text-blue-600 list-disc list-inside space-y-1">
                <li><strong>Model</strong> - Stock model name (e.g., "Alpine Hunter", "Chalk Branch")</li>
                <li><strong>Order Date</strong> - When the order was placed</li>
                <li><strong>Due Date</strong> - Original due date (optional)</li>
                <li><strong>Fulfilled Date</strong> - When the order was shipped/completed</li>
              </ul>
              <p className="text-xs text-blue-500 mt-2">
                Column names are flexible - we'll try to match common variations like "order_date", "orderDate", "shipped", etc.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="csv-file">Select CSV File</Label>
            <Input
              ref={fileInputRef}
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              data-testid="input-csv-file"
            />
          </div>

          {parsedData && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  {parsedData.records.length} valid records
                </Badge>
                {parsedData.warnings.length > 0 && (
                  <Badge variant="outline" className="gap-1 text-yellow-600">
                    <AlertCircle className="w-3 h-3" />
                    {parsedData.warnings.length} warnings
                  </Badge>
                )}
                {parsedData.errors.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {parsedData.errors.length} errors
                  </Badge>
                )}
              </div>

              {parsedData.warnings.length > 0 && (
                <Card className="bg-yellow-50 border-yellow-200">
                  <CardHeader className="py-2">
                    <CardTitle className="text-sm text-yellow-700">Warnings</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <ul className="text-xs text-yellow-600 space-y-1 max-h-20 overflow-y-auto">
                      {parsedData.warnings.slice(0, 5).map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                      {parsedData.warnings.length > 5 && (
                        <li>... and {parsedData.warnings.length - 5} more</li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {parsedData.records.length > 0 && (
                <div>
                  <Label className="mb-2 block">Preview (first 5 records)</Label>
                  <div className="rounded-md border max-h-48 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Model</TableHead>
                          <TableHead>Order Date</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Fulfilled Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.records.slice(0, 5).map((record, i) => (
                          <TableRow key={i}>
                            <TableCell>{record.model}</TableCell>
                            <TableCell>{record.orderDate}</TableCell>
                            <TableCell>{record.dueDate || '-'}</TableCell>
                            <TableCell>{record.fulfilledDate}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-reset">
                  Reset
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={parsedData.records.length === 0 || uploadMutation.isPending}
                  data-testid="button-confirm-upload"
                >
                  {uploadMutation.isPending ? 'Uploading...' : `Upload ${parsedData.records.length} Records`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
