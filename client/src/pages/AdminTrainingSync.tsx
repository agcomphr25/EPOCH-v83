import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, CheckCircle, AlertCircle, Upload, Download } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SyncStatus {
  moduleCount: number;
  questionCount: number;
}

interface SyncResult {
  modulesInserted: number;
  questionsInserted: number;
  answersInserted: number;
}

export default function AdminTrainingSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [modulesFile, setModulesFile] = useState<File | null>(null);
  const [questionsFile, setQuestionsFile] = useState<File | null>(null);
  const [answersFile, setAnswersFile] = useState<File | null>(null);
  const { toast } = useToast();

  const { data: syncStatus, isLoading: statusLoading, error, refetch } = useQuery<SyncStatus>({
    queryKey: ['/api/admin/training-sync-status'],
    retry: 1,
    staleTime: 0,
  });

  // Log errors for debugging
  if (error) {
    console.error('Training sync status error:', error);
  }

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      const result = await apiRequest('/api/admin/sync-training-data', {
        method: 'POST',
      });

      setSyncResult(result);
      toast({
        title: "Sync Successful!",
        description: `Synced ${result.modulesInserted} modules with all quiz data`,
      });

      refetch();
    } catch (error: any) {
      console.error('Sync error:', error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync training data",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const downloadCsv = async (path: string, filename: string) => {
    const response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to download ${filename}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    
    try {
      // Download each CSV file with authenticated fetch
      await downloadCsv('/api/admin/export-training-modules-csv', 'training-modules.csv');
      await downloadCsv('/api/admin/export-training-questions-csv', 'training-questions.csv');
      await downloadCsv('/api/admin/export-training-answers-csv', 'training-answers.csv');

      toast({
        title: "Export Successful!",
        description: "3 CSV files downloaded successfully",
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export CSV data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCSVUpload = async () => {
    if (!modulesFile || !questionsFile || !answersFile) {
      toast({
        title: "Missing Files",
        description: "Please select all 3 CSV files before uploading",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    
    try {
      console.log('Creating FormData with files:', {
        modules: modulesFile.name,
        questions: questionsFile.name,
        answers: answersFile.name
      });

      const formData = new FormData();
      formData.append('modules', modulesFile);
      formData.append('questions', questionsFile);
      formData.append('answers', answersFile);

      console.log('Sending POST request to /api/admin/import-training-csv');

      const response = await fetch('/api/admin/import-training-csv', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed:', errorText);
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('Import result:', result);

      toast({
        title: "Import Successful!",
        description: `Imported ${result.modulesInserted} modules, ${result.questionsInserted} questions, ${result.answersInserted} answers`,
      });

      // Clear file selections
      setModulesFile(null);
      setQuestionsFile(null);
      setAnswersFile(null);
      refetch();
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import CSV data",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Training Data Sync</h1>
        <p className="text-muted-foreground">
          Admin tool to sync training modules from development to production database
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Current Database Status
            </CardTitle>
            <CardDescription>
              Check what training data exists in the current database
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading status...
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <div className="font-medium">Error loading training data status</div>
                  <div className="text-sm">{error instanceof Error ? error.message : 'Unknown error'}</div>
                </div>
              </div>
            ) : syncStatus ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{syncStatus.moduleCount}</div>
                    <div className="text-sm text-muted-foreground">Training Modules</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{syncStatus.questionCount}</div>
                    <div className="text-sm text-muted-foreground">Quiz Questions</div>
                  </div>
                </div>

                {syncStatus.moduleCount === 0 && (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      No training modules found in database - sync needed!
                    </span>
                  </div>
                )}

                {syncStatus.moduleCount === 9 && (
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      All 9 training modules are present
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sync Training Data</CardTitle>
            <CardDescription>
              This will insert all 9 training modules with quiz questions into the current database.
              Safe to run multiple times - won't create duplicates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              size="lg"
              className="w-full"
              data-testid="button-sync-training"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing Training Data...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Sync Training Data to Database
                </>
              )}
            </Button>

            {syncResult && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-green-900">Sync Completed Successfully!</div>
                    <div className="text-sm text-green-700 mt-2 space-y-1">
                      <div>✅ {syncResult.modulesInserted} training modules inserted</div>
                      <div>✅ {syncResult.questionsInserted} quiz questions inserted</div>
                      <div>✅ {syncResult.answersInserted} quiz answers inserted</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Training Data to CSV
            </CardTitle>
            <CardDescription>
              Download current training data as CSV files (for backup or migration)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleExportCSV}
              disabled={isExporting}
              size="lg"
              className="w-full"
              variant="outline"
              data-testid="button-export-csv"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting CSV Files...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export to CSV Files
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Training Data from CSV
            </CardTitle>
            <CardDescription>
              Upload CSV files exported from development to import training data into production
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="modules-csv">Training Modules CSV</Label>
                <Input
                  id="modules-csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setModulesFile(e.target.files?.[0] || null)}
                  data-testid="input-modules-csv"
                />
                {modulesFile && <p className="text-sm text-green-600 mt-1">✓ {modulesFile.name}</p>}
              </div>

              <div>
                <Label htmlFor="questions-csv">Quiz Questions CSV</Label>
                <Input
                  id="questions-csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setQuestionsFile(e.target.files?.[0] || null)}
                  data-testid="input-questions-csv"
                />
                {questionsFile && <p className="text-sm text-green-600 mt-1">✓ {questionsFile.name}</p>}
              </div>

              <div>
                <Label htmlFor="answers-csv">Quiz Answers CSV</Label>
                <Input
                  id="answers-csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setAnswersFile(e.target.files?.[0] || null)}
                  data-testid="input-answers-csv"
                />
                {answersFile && <p className="text-sm text-green-600 mt-1">✓ {answersFile.name}</p>}
              </div>
            </div>

            <Button
              onClick={handleCSVUpload}
              disabled={isUploading || !modulesFile || !questionsFile || !answersFile}
              size="lg"
              className="w-full"
              data-testid="button-import-csv"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing CSV Data...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import CSV Files
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-blue-800 space-y-2">
            <p>
              <strong>Development:</strong> Training data already exists in the dev database.
              This sync button does nothing in development mode.
            </p>
            <p>
              <strong>Production:</strong> When you publish the app, use this page to sync
              all 9 training modules into the production database. Just click the button once
              after publishing!
            </p>
            <p className="text-xs text-blue-600 mt-4">
              💡 Admin access required (glennj or tasham)
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
