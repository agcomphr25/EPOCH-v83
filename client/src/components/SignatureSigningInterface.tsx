import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SignatureCanvas from 'react-signature-canvas';
import {
  FileSignature,
  Check,
  X,
  Trash2,
  RefreshCw,
  AlertTriangle,
  FileText,
  Download,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface SignatureRequest {
  id: string;
  title: string;
  description?: string;
  currentDocumentPath?: string;
  originalDocumentPath?: string;
  mediaId?: string;
  status: string;
}

interface SigningInterfaceProps {
  open: boolean;
  onClose: () => void;
  requestId: string;
  signerId?: string;
  employeeId: number;
  employeeName: string;
  documentTitle: string;
  onSuccess?: () => void;
}

export default function SignatureSigningInterface({
  open,
  onClose,
  requestId,
  signerId,
  employeeId,
  employeeName,
  documentTitle,
}: SigningInterfaceProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sigCanvasRef = useRef<SignatureCanvas>(null);
  const [notes, setNotes] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [activeTab, setActiveTab] = useState('document');
  const [pdfScale, setPdfScale] = useState(1);

  const { data: request, isLoading: requestLoading } = useQuery<SignatureRequest>({
    queryKey: ['/api/signature-workflow', requestId],
    queryFn: () => apiRequest(`/api/signature-workflow/${requestId}`),
    enabled: open && !!requestId,
  });

  const documentUrl = request?.currentDocumentPath || request?.originalDocumentPath;

  const signMutation = useMutation({
    mutationFn: (data: { signatureData: string; notes: string }) =>
      apiRequest(`/api/signature-workflow/${requestId}/sign`, {
        method: 'POST',
        body: {
          signerId,
          signatureData: data.signatureData,
          notes: data.notes,
          employeeId,
          signerName: employeeName,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/signature-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['/api/signature-workflow/pending', employeeId] });
      toast({ title: 'Document signed successfully' });
      onClose();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to sign', description: error.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      apiRequest(`/api/signature-workflow/${requestId}/reject`, {
        method: 'POST',
        body: {
          signerId,
          reason,
          employeeId,
          signerName: employeeName,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/signature-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['/api/signature-workflow/pending', employeeId] });
      toast({ title: 'Document rejected' });
      setShowRejectDialog(false);
      onClose();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to reject', description: error.message, variant: 'destructive' });
    },
  });

  const clearSignature = () => {
    sigCanvasRef.current?.clear();
  };

  const handleSign = () => {
    if (sigCanvasRef.current?.isEmpty()) {
      toast({ title: 'Please provide your signature', variant: 'destructive' });
      return;
    }

    const signatureData = sigCanvasRef.current?.getTrimmedCanvas().toDataURL('image/png');
    if (!signatureData) {
      toast({ title: 'Failed to capture signature', variant: 'destructive' });
      return;
    }

    signMutation.mutate({ signatureData, notes });
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast({ title: 'Please provide a reason for rejection', variant: 'destructive' });
      return;
    }
    rejectMutation.mutate(rejectReason);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Sign Document: {documentTitle}
            </DialogTitle>
            <DialogDescription>
              Signing as: {employeeName}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="document" data-testid="tab-document">
                <FileText className="h-4 w-4 mr-2" />
                View Document
              </TabsTrigger>
              <TabsTrigger value="sign" data-testid="tab-sign">
                <FileSignature className="h-4 w-4 mr-2" />
                Sign Document
              </TabsTrigger>
            </TabsList>

            <TabsContent value="document" className="flex-1 overflow-hidden">
              {requestLoading ? (
                <div className="flex items-center justify-center h-96">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading document...
                </div>
              ) : documentUrl ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPdfScale(s => Math.max(0.5, s - 0.25))}
                      >
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">{Math.round(pdfScale * 100)}%</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPdfScale(s => Math.min(2, s + 0.25))}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/${documentUrl}`, '_blank')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Open Full Screen
                    </Button>
                  </div>
                  <div className="flex-1 border rounded-lg overflow-auto bg-gray-100">
                    <iframe
                      src={`/${documentUrl}#toolbar=0&navpanes=0`}
                      className="w-full h-full min-h-[400px]"
                      style={{ transform: `scale(${pdfScale})`, transformOrigin: 'top left' }}
                      title="Document to sign"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                  <FileText className="h-12 w-12 mb-4 opacity-50" />
                  <p>No document attached to this signature request</p>
                  <p className="text-sm mt-2">You can still provide your signature on the Sign tab</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="sign" className="space-y-4 overflow-auto">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Your Signature</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed rounded-lg bg-white">
                    <SignatureCanvas
                      ref={sigCanvasRef}
                      clearOnResize={false}
                      canvasProps={{
                        width: 600,
                        height: 150,
                        className: 'signature-canvas',
                        style: { width: '100%', height: '150px', backgroundColor: 'white', touchAction: 'none' },
                      }}
                      penColor="black"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={clearSignature}
                    data-testid="clear-signature"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear Signature
                  </Button>
                </CardContent>
              </Card>

              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any comments or notes..."
                  className="mt-1"
                  data-testid="input-signing-notes"
                />
              </div>

              {documentUrl && (
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                  <p className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    By signing, you acknowledge that you have reviewed the document on the "View Document" tab.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="flex justify-between border-t pt-4 mt-4">
            <Button
              variant="destructive"
              onClick={() => setShowRejectDialog(true)}
              data-testid="reject-signature"
            >
              <X className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSign}
                disabled={signMutation.isPending}
                data-testid="submit-signature"
              >
                {signMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Sign & Submit
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Reject Document
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to reject this document? This will cancel the entire signing workflow.
          </p>
          <div>
            <Label htmlFor="rejectReason">Reason for rejection *</Label>
            <Textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Please explain why you are rejecting this document..."
              className="mt-1"
              data-testid="input-reject-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
              data-testid="confirm-reject"
            >
              {rejectMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject Document'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
