import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, FileText, AlertCircle } from 'lucide-react';

interface CsvDataImporterProps {
  onDataParsed: (data: any[]) => void;
}

export function CsvDataImporter({ onDataParsed }: CsvDataImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setError(null);
      processFile(selectedFile);
    } else {
      setError('Please select a valid CSV file');
    }
  };

  const processFile = (file: File) => {
    setIsProcessing(true);
    setError(null);

    Papa.parse(file, {
      complete: (results) => {
        try {
          if (results.errors.length > 0) {
            setError(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`);
            return;
          }

          const rawData = results.data as string[][];
          
          if (rawData.length === 0) {
            setError('CSV file is empty');
            return;
          }

          let processedData: any[] = [];
          
          if (hasHeaders && rawData.length > 1) {
            const headers = rawData[0];
            processedData = rawData.slice(1).map(row => {
              const obj: any = {};
              headers.forEach((header, index) => {
                if (header) {
                  obj[header] = row[index] || '';
                }
              });
              return obj;
            });
          } else {
            processedData = rawData.map(row => {
              const obj: any = {};
              row.forEach((value, index) => {
                obj[`Column ${index + 1}`] = value || '';
              });
              return obj;
            });
          }

          onDataParsed(processedData);
        } catch (error) {
          setError(`Error processing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
          setIsProcessing(false);
        }
      },
      error: (error) => {
        setError(`Failed to parse CSV: ${error.message}`);
        setIsProcessing(false);
      },
      header: false,
      skipEmptyLines: true,
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          CSV Data Importer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-2">
            Drop your CSV file here, or
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={handleBrowseClick}
            className="mb-2"
          >
            Browse Files
          </Button>
          <p className="text-sm text-gray-500">
            Supports CSV files up to 10MB
          </p>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>

        {/* File Info */}
        {file && (
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>File:</strong> {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          </div>
        )}

        {/* Options */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hasHeaders"
            checked={hasHeaders}
            onCheckedChange={(checked) => {
              setHasHeaders(checked as boolean);
              if (file) {
                processFile(file);
              }
            }}
          />
          <Label htmlFor="hasHeaders" className="text-sm">
            First row contains headers
          </Label>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Error</span>
            </div>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        )}

        {/* Processing Status */}
        {isProcessing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">Processing CSV file...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}