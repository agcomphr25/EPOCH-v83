import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import SignatureCanvas from 'react-signature-canvas';
import {
  FileSignature,
  Check,
  X,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

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
  onSuccess,
}: SigningInterfaceProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sigCanvasRef = useRef<SignatureCanvas>(null);
  const [notes, setNotes] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

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
      onSuccess?.();
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Sign Document
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">{documentTitle}</p>
              <p className="text-sm text-muted-foreground">
                Signing as: {employeeName}
              </p>
            </div>

            <div>
              <Label>Your Signature</Label>
              <div className="border-2 border-dashed rounded-lg mt-1 bg-white">
                <SignatureCanvas
                  ref={sigCanvasRef}
                  canvasProps={{
                    width: 450,
                    height: 150,
                    className: 'signature-canvas',
                    style: { width: '100%', height: '150px', backgroundColor: 'white' },
                  }}
                  penColor="black"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={clearSignature}
                data-testid="clear-signature"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>

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
          </div>

          <DialogFooter className="flex justify-between">
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
