import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, CheckCircle, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

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
  const { toast } = useToast();

  const { data: syncStatus, isLoading: statusLoading, refetch } = useQuery<SyncStatus>({
    queryKey: ['/api/admin/training-sync-status'],
  });

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
