import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileText, Upload, FolderOpen, AlertCircle, CheckCircle, Info, Play } from "lucide-react";
import { useCSVContext } from "@/contexts/CSVContext";

export function CSVImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasHeaders, setHasHeaders] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const { data, isLoading, error, fileName, rowCount, parseCSV, processData } = useCSVContext();

  const handleFileSelect = (file: File) => {
    if (file && file.type === 'text/csv') {
      parseCSV(file, hasHeaders);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
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

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleProcessCSV = () => {
    console.log('Process Data clicked', { fileName, hasHeaders });
    if (fileName) {
      // Process the raw data with current header settings
      processData(hasHeaders);
    }
  };

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-accent" />
          CSV Data Import
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Upload Area */}
        <div 
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 ${
            isDragOver ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
          <p className="text-sm font-medium text-gray-700 mb-2">Drop CSV file here or click to browse</p>
          <p className="text-xs text-gray-500 mb-4">Supported formats: .csv (Max 10MB)</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <Button
            variant="outline"
            onClick={handleBrowseClick}
            className="bg-gray-100 hover:bg-gray-200"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Browse Files
          </Button>
        </div>

        {/* Import Status */}
        {isLoading && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center">
              <Info className="h-4 w-4 text-blue-500 mr-2" />
              <span className="text-sm font-medium text-blue-800">Processing CSV file...</span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex items-start">
              <AlertCircle className="h-4 w-4 text-red-500 mr-2 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 mb-1">Import Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success Display */}
        {fileName && !error && !isLoading && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
              <div>
                <p className="text-sm font-medium text-green-800">Import Successful</p>
                <p className="text-sm text-green-700">
                  Successfully loaded {fileName} - {rowCount} rows processed
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CSV Preview Controls */}
        {fileName && !error && !isLoading && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="has-headers"
                checked={hasHeaders}
                onCheckedChange={(checked) => setHasHeaders(checked === true)}
              />
              <Label htmlFor="has-headers" className="text-sm font-medium text-gray-700">
                First row contains headers
              </Label>
            </div>
            <Button
              onClick={handleProcessCSV}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="h-4 w-4 mr-2" />
              Process Data
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
