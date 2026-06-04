import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  FileText,
  FileImage,
  File,
  Upload,
  ExternalLink,
  Trash2,
  Loader2,
  FolderOpen,
  Eye,
  Printer,
  X,
} from "lucide-react";
import { format } from "date-fns";

type CuttingDocument = {
  id: number;
  displayName: string;
  fileUrl: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ mimeType, size = "md" }: { mimeType: string; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "h-12 w-12" : "h-8 w-8";
  if (mimeType === "application/pdf") return <FileText className={`${cls} text-red-500`} />;
  if (mimeType.startsWith("image/")) return <FileImage className={`${cls} text-blue-500`} />;
  return <File className={`${cls} text-muted-foreground`} />;
}

function fileTypeBadge(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1].toUpperCase();
  const parts = mimeType.split("/");
  return (parts[1] || parts[0]).toUpperCase().slice(0, 6);
}

function getDocumentViewUrl(doc: CuttingDocument): string {
  return `/api/cutting-documents/${doc.id}/download`;
}

function DocumentPreview({ doc }: { doc: CuttingDocument }) {
  const viewUrl = getDocumentViewUrl(doc);

  if (doc.mimeType === "application/pdf") {
    return (
      <iframe
        src={viewUrl}
        title={doc.displayName}
        className="w-full rounded border"
        style={{ height: "72vh", minHeight: 400 }}
      />
    );
  }
  if (doc.mimeType.startsWith("image/")) {
    return (
      <div className="flex items-center justify-center bg-muted/30 rounded border" style={{ minHeight: 400 }}>
        <img
          src={viewUrl}
          alt={doc.displayName}
          className="max-w-full max-h-[72vh] object-contain rounded"
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-muted/30 rounded border" style={{ minHeight: 400 }}>
      <FileTypeIcon mimeType={doc.mimeType} size="lg" />
      <p className="mt-4 text-sm text-muted-foreground">Preview not available for this file type.</p>
      <p className="text-xs text-muted-foreground mt-1">Use "Open" to view in your browser or download it.</p>
    </div>
  );
}

function handlePrint(doc: CuttingDocument) {
  const viewUrl = getDocumentViewUrl(doc);

  if (doc.mimeType === "application/pdf") {
    const pw = window.open(viewUrl, "_blank");
    if (pw) {
      pw.onload = () => {
        try { pw.print(); } catch { pw.focus(); }
      };
    }
    return;
  }
  if (doc.mimeType.startsWith("image/")) {
    const pw = window.open("", "_blank");
    if (!pw) return;
    pw.document.write(`
      <html>
        <head>
          <title>${doc.displayName}</title>
          <style>
            @page { margin: 0.5in; }
            body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; }
            img { max-width: 100%; max-height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${viewUrl}" onload="window.print()" />
        </body>
      </html>
    `);
    pw.document.close();
    return;
  }
  window.open(viewUrl, "_blank");
}

export default function CuttingDocuments() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<CuttingDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: documents = [], isLoading } = useQuery<CuttingDocument[]>({
    queryKey: ["/api/cutting-documents"],
  });

  const createDocMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("displayName", file.name);
      return apiRequest("/api/cutting-documents/upload", {
        method: "POST",
        body: formData,
        timeout: 120000,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/cutting-documents"] }),
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: number) =>
      apiRequest(`/api/cutting-documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cutting-documents"] });
      toast({ title: "Deleted", description: "Document removed." });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" }),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await createDocMutation.mutateAsync(file);
      toast({ title: "Uploaded", description: `${file.name} added to documents.` });
    } catch (err) {
      const description =
        err instanceof Error ? err.message : "Could not save document record.";
      console.error("[CuttingDocuments] save failed:", err);
      toast({ title: "Upload failed", description, variant: "destructive" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reference Documents</h2>
          <p className="text-sm text-muted-foreground">
            Ply charts, work instructions, and other reference files for operators.
          </p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            data-testid="button-upload-document"
          >
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {isUploading ? "Uploading..." : "Upload Document"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 space-y-3">
                <div className="h-8 w-8 bg-muted rounded" />
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No documents yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a ply chart, work instruction, or any reference file to get started.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <Upload className="mr-2 h-4 w-4" />
            Upload First Document
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {documents.map((doc) => (
            <Card key={doc.id} className="group" data-testid={`card-document-${doc.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <FileTypeIcon mimeType={doc.mimeType} />
                  <Badge variant="secondary" className="text-xs">{fileTypeBadge(doc.mimeType)}</Badge>
                </div>
                <div>
                  <p className="font-medium text-sm leading-tight line-clamp-2" title={doc.displayName}>
                    {doc.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{formatFileSize(doc.fileSize)}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(doc.uploadedAt), "MMM d, yyyy")}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => setPreviewDoc(doc)}
                    data-testid={`button-preview-document-${doc.id}`}
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePrint(doc)}
                    data-testid={`button-print-document-${doc.id}`}
                    title="Print"
                  >
                    <Printer className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTargetId(doc.id)}
                    data-testid={`button-delete-document-${doc.id}`}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-5xl w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-3 border-b gap-0 space-y-0">
            <div className="flex items-center gap-2 min-w-0">
              {previewDoc && <FileTypeIcon mimeType={previewDoc.mimeType} />}
              <div className="min-w-0">
                <DialogTitle className="text-sm font-semibold truncate leading-tight">
                  {previewDoc?.displayName}
                </DialogTitle>
                {previewDoc && (
                  <p className="text-xs text-muted-foreground">
                    {fileTypeBadge(previewDoc.mimeType)} · {formatFileSize(previewDoc.fileSize)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {previewDoc && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePrint(previewDoc)}
                    data-testid="button-preview-print"
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    Print
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(getDocumentViewUrl(previewDoc), "_blank", "noopener,noreferrer")}
                    data-testid="button-preview-open"
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPreviewDoc(null)}
                data-testid="button-preview-close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="p-4">
            {previewDoc && <DocumentPreview doc={previewDoc} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the document from the list. The action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTargetId !== null) {
                  deleteDocMutation.mutate(deleteTargetId);
                  setDeleteTargetId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
