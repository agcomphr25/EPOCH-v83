import { useState, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import SignaturePad from 'signature_pad';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  Check, 
  X, 
  Shield, 
  Ruler, 
  PenLine,
  User
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ToleranceCheck {
  dimension: string;
  nominal: number;
  tolerance: string;
  measured: number;
  result: 'PASS' | 'FAIL';
}

interface P2ToleranceGateProps {
  serializedItemId: string;
  barcode: string;
  partNumber: string;
  toleranceChecks: ToleranceCheck[];
  poToleranceAuthorizerId?: number;
  poToleranceAuthorizerName?: string;
  inspectionId?: string;
  onComplete: (approved: boolean) => void;
  onCancel: () => void;
}

export default function P2ToleranceGate({
  serializedItemId,
  barcode,
  partNumber,
  toleranceChecks,
  poToleranceAuthorizerId,
  poToleranceAuthorizerName,
  inspectionId,
  onComplete,
  onCancel,
}: P2ToleranceGateProps) {
  const { toast } = useToast();
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [signaturePad, setSignaturePad] = useState<SignaturePad | null>(null);
  const [deviationReason, setDeviationReason] = useState('');
  const [authorizerVerified, setAuthorizerVerified] = useState(false);

  const failedChecks = toleranceChecks.filter(check => check.result === 'FAIL');
  const passedChecks = toleranceChecks.filter(check => check.result === 'PASS');

  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/auth/session'],
  });

  const isAuthorizedUser = currentUser && poToleranceAuthorizerId && 
    currentUser.id === poToleranceAuthorizerId;

  const initSignaturePad = () => {
    if (signatureCanvasRef.current && !signaturePad) {
      const canvas = signatureCanvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = 150;
      const pad = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
      });
      setSignaturePad(pad);
    }
  };

  const clearSignature = () => {
    signaturePad?.clear();
  };

  const approveDeviationMutation = useMutation({
    mutationFn: async (data: {
      signature: string;
      reason: string;
    }) => {
      return apiRequest(`/api/p2/final-inspection/${inspectionId}/approve-deviation`, {
        method: 'POST',
        body: {
          serializedItemId,
          toleranceAuthorizerId: currentUser?.id,
          toleranceAuthorizerName: `${currentUser?.firstName} ${currentUser?.lastName}`,
          toleranceAuthorizerSignature: data.signature,
          toleranceDeviationReason: data.reason,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/final-inspection'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items'] });
      toast({
        title: 'Deviation Approved',
        description: 'The tolerance deviation has been approved and the item can proceed.',
      });
      onComplete(true);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve tolerance deviation',
        variant: 'destructive',
      });
    },
  });

  const rejectDeviationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/p2/final-inspection/${inspectionId}/reject-deviation`, {
        method: 'POST',
        body: {
          serializedItemId,
          rejectedBy: currentUser?.id,
          rejectedByName: `${currentUser?.firstName} ${currentUser?.lastName}`,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/final-inspection'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/production-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/po-statuses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items/scrapped'] });
      toast({
        title: 'Deviation Rejected',
        description: 'The item has been moved to NCR/Scrap open disposition.',
        variant: 'destructive',
      });
      onComplete(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject tolerance deviation',
        variant: 'destructive',
      });
    },
  });

  const handleApprove = () => {
    if (!signaturePad || signaturePad.isEmpty()) {
      toast({
        title: 'Signature Required',
        description: 'Please provide your signature to approve the deviation',
        variant: 'destructive',
      });
      return;
    }

    if (!deviationReason.trim()) {
      toast({
        title: 'Reason Required',
        description: 'Please provide a reason for approving the tolerance deviation',
        variant: 'destructive',
      });
      return;
    }

    const signature = signaturePad.toDataURL();
    approveDeviationMutation.mutate({
      signature,
      reason: deviationReason,
    });
  };

  const handleReject = () => {
    rejectDeviationMutation.mutate();
  };

  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle>Tolerance Deviation Gate</CardTitle>
            <CardDescription>
              Authorization required for out-of-tolerance measurements
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Part Number</p>
            <p className="font-mono font-medium">{partNumber}</p>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Barcode</p>
            <p className="font-mono font-medium">{barcode}</p>
          </div>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Tolerance Checks Failed</AlertTitle>
          <AlertDescription>
            {failedChecks.length} of {toleranceChecks.length} tolerance checks failed.
            This item cannot proceed without authorization from the designated approver.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <Ruler className="h-4 w-4" />
            Tolerance Check Results
          </h3>
          
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium">Dimension</th>
                  <th className="px-4 py-2 text-right text-sm font-medium">Nominal</th>
                  <th className="px-4 py-2 text-right text-sm font-medium">Tolerance</th>
                  <th className="px-4 py-2 text-right text-sm font-medium">Measured</th>
                  <th className="px-4 py-2 text-center text-sm font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {toleranceChecks.map((check, index) => (
                  <tr 
                    key={index} 
                    className={check.result === 'FAIL' ? 'bg-red-50 dark:bg-red-900/20' : ''}
                  >
                    <td className="px-4 py-3 text-sm">{check.dimension}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">{check.nominal}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">{check.tolerance}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-medium">
                      {check.measured}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge 
                        variant={check.result === 'PASS' ? 'default' : 'destructive'}
                        className="gap-1"
                      >
                        {check.result === 'PASS' ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                        {check.result}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="gap-1">
                <Check className="h-3 w-3" /> {passedChecks.length} Passed
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive" className="gap-1">
                <X className="h-3 w-3" /> {failedChecks.length} Failed
              </Badge>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Authorization
          </h3>

          {poToleranceAuthorizerId ? (
            <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Designated Authorizer:</span>
                <span className="text-sm">{poToleranceAuthorizerName}</span>
              </div>
              {!isAuthorizedUser && (
                <p className="text-sm text-muted-foreground mt-2">
                  Only the designated authorizer can approve this deviation.
                  Current user is not authorized.
                </p>
              )}
            </div>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Authorizer Assigned</AlertTitle>
              <AlertDescription>
                This PO does not have a designated tolerance authorizer. 
                An admin must approve this deviation.
              </AlertDescription>
            </Alert>
          )}

          {(isAuthorizedUser || !poToleranceAuthorizerId) && (
            <>
              <div className="space-y-2">
                <Label htmlFor="deviation-reason">Reason for Approval</Label>
                <Textarea
                  id="deviation-reason"
                  value={deviationReason}
                  onChange={(e) => setDeviationReason(e.target.value)}
                  placeholder="Explain why this tolerance deviation is acceptable..."
                  className="min-h-[100px]"
                  data-testid="textarea-deviation-reason"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <PenLine className="h-4 w-4" />
                  Authorizer Signature
                </Label>
                <div className="border rounded-lg p-2 bg-white">
                  <canvas
                    ref={signatureCanvasRef}
                    className="w-full h-[150px] cursor-crosshair"
                    onMouseEnter={initSignaturePad}
                    onTouchStart={initSignaturePad}
                    data-testid="canvas-signature"
                  />
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={clearSignature}
                  data-testid="button-clear-signature"
                >
                  Clear Signature
                </Button>
              </div>
            </>
          )}
        </div>

        <Separator />

        <div className="flex justify-between gap-4">
          <Button variant="outline" onClick={onCancel} data-testid="button-cancel">
            Cancel
          </Button>
          
          <div className="flex gap-2">
            {(isAuthorizedUser || !poToleranceAuthorizerId) && (
              <>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={rejectDeviationMutation.isPending}
                  data-testid="button-reject"
                >
                  <X className="mr-2 h-4 w-4" />
                  {rejectDeviationMutation.isPending ? 'Rejecting...' : 'Reject to NCR/Scrap'}
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approveDeviationMutation.isPending}
                  data-testid="button-approve"
                >
                  <Check className="mr-2 h-4 w-4" />
                  {approveDeviationMutation.isPending ? 'Approving...' : 'Approve Deviation'}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
