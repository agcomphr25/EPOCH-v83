import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { FileSpreadsheet, Trash2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface GoogleSheet {
  id: string;
  name: string;
  modifiedTime: string;
}

export default function TrainingMatrixImport() {
  const [selectedSheetId, setSelectedSheetId] = useState<string>("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const { toast } = useToast();

  const { data: sheets = [], isLoading: sheetsLoading } = useQuery<GoogleSheet[]>({
    queryKey: ["/api/training/google-sheets"],
  });

  const { data: previewData, isLoading: previewLoading } = useQuery<{ data: string[][] }>({
    queryKey: ["/api/training/google-sheets", selectedSheetId, "preview"],
    enabled: !!selectedSheetId,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/training/matrix", {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Training matrix data has been deleted",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/training/matrix"] });
      setShowDeleteDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete training matrix",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/training/import-from-sheets", {
        method: "POST",
        body: JSON.stringify({
          spreadsheetId: selectedSheetId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success",
        description: `Successfully imported ${data.imported} training records`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/training/matrix"] });
      setShowImportDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to import training matrix",
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  const handleImport = () => {
    importMutation.mutate();
  };

  return (
    <div className="p-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6" />
            Import Training Matrix from Google Sheets
          </CardTitle>
          <CardDescription>
            Connect to your Google Drive and import training matrix data from a Google Sheet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Before importing new data, you should delete the existing incorrect training matrix data.
              This will ensure a clean import without duplicates.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="flex gap-4">
              <Button
                onClick={() => setShowDeleteDialog(true)}
                variant="destructive"
                disabled={deleteMutation.isPending}
                data-testid="button-delete-matrix"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleteMutation.isPending ? "Deleting..." : "Delete Current Training Matrix"}
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Select Google Sheet
                </label>
                <Select
                  value={selectedSheetId}
                  onValueChange={setSelectedSheetId}
                  disabled={sheetsLoading}
                >
                  <SelectTrigger data-testid="select-sheet">
                    <SelectValue placeholder={sheetsLoading ? "Loading sheets..." : "Choose a spreadsheet"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((sheet) => (
                      <SelectItem key={sheet.id} value={sheet.id}>
                        {sheet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSheetId && (
                <div className="space-y-4">
                  <Button
                    onClick={() => setShowImportDialog(true)}
                    disabled={importMutation.isPending || !selectedSheetId}
                    data-testid="button-import-sheet"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {importMutation.isPending ? "Importing..." : "Import Training Matrix"}
                  </Button>

                  {previewLoading ? (
                    <div className="text-sm text-muted-foreground">Loading preview...</div>
                  ) : previewData?.data && (
                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium mb-2">Preview</h3>
                      <div className="overflow-x-auto max-h-96">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {previewData.data[0]?.map((header: string, idx: number) => (
                                <TableHead key={idx}>{header}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewData.data.slice(1, 6).map((row: string[], rowIdx: number) => (
                              <TableRow key={rowIdx}>
                                {row.map((cell: string, cellIdx: number) => (
                                  <TableCell key={cellIdx}>{cell}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Showing first 5 rows of data
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training Matrix Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all existing training matrix entries from the database.
              This action cannot be undone. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Training Matrix?</AlertDialogTitle>
            <AlertDialogDescription>
              This will import all training data from the selected Google Sheet into the database.
              Each employee's training completion dates will be imported and converted to training matrix entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-import">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleImport}
              data-testid="button-confirm-import"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Import Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
