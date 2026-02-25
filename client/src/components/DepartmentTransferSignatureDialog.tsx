import { useState, useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Pen, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  FileText,
  Shield,
  ClipboardCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface DepartmentTransferSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignatureComplete: () => void;
  serializedItemId: string;
  barcode: string;
  partNumber: string;
  partName: string;
  fromDepartment: string;
  toDepartment: string;
  workInstructionRef?: string;
  workInstructionVersion?: string;
  currentUser: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
  };
}

const AS9100_DECLARATION = `I certify that the work performed on this item in the ${'{fromDepartment}'} department has been completed in accordance with the applicable work instructions, specifications, and quality requirements. By signing below, I acknowledge:

1. All required operations have been performed as specified in the work instructions
2. The work has been inspected and meets the required quality standards
3. All necessary documentation has been completed
4. The item is ready for transfer to the next department

This electronic signature is legally binding and serves as verification of work completion per AS9100 quality standards.`;

export default function DepartmentTransferSignatureDialog({
  open,
  onOpenChange,
  onSignatureComplete,
  serializedItemId,
  barcode,
  partNumber,
  partName,
  fromDepartment,
  toDepartment,
  workInstructionRef,
  workInstructionVersion,
  currentUser,
}: DepartmentTransferSignatureDialogProps) {
  const { toast } = useToast();
  const signatureRef = useRef<SignatureCanvas>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  const declarationText = AS9100_DECLARATION.replace('{fromDepartment}', fromDepartment);

  const signerName = currentUser.firstName && currentUser.lastName
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : currentUser.username;

  useEffect(() => {
    if (open) {
      setSignatureEmpty(true);
      setDeclarationAccepted(false);
      signatureRef.current?.clear();
    }
  }, [open]);

  const signatureMutation = useMutation({
    mutationFn: async () => {
      if (!signatureRef.current || signatureEmpty) {
        throw new Error('Please provide a signature');
      }

      if (!declarationAccepted) {
        throw new Error('Please accept the declaration to proceed');
      }

      const signatureData = signatureRef.current.toDataURL();

      return await apiRequest('/api/p2-traveler-viewer/signatures', {
        method: 'POST',
        body: {
          serializedItemId,
          barcode,
          partNumber,
          fromDepartment,
          toDepartment,
          workInstructionRef: workInstructionRef || null,
          workInstructionVersion: workInstructionVersion || null,
          signatureData,
          signedByEmployeeId: currentUser.id,
          signedByName: signerName,
          signedByUsername: currentUser.username,
          declarationText,
          declarationAccepted: true,
        },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Signature Captured',
        description: `Work completion verified for ${partNumber} in ${fromDepartment}`,
      });
      onOpenChange(false);
      onSignatureComplete();
    },
    onError: (error: Error) => {
      toast({
        title: 'Signature Failed',
        description: error.message || 'Failed to capture signature',
        variant: 'destructive',
      });
    },
  });

  const handleClearSignature = () => {
    signatureRef.current?.clear();
    setSignatureEmpty(true);
  };

  const handleSignatureEnd = () => {
    setSignatureEmpty(signatureRef.current?.isEmpty() || false);
  };

  const canSubmit = !signatureEmpty && declarationAccepted && !signatureMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Department Transfer Signature
          </DialogTitle>
          <DialogDescription>
            AS9100 Work Completion Verification
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Part Number:</span>
                  <p className="font-semibold" data-testid="text-signature-part-number">{partNumber}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Barcode:</span>
                  <p className="font-semibold font-mono" data-testid="text-signature-barcode">{barcode}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">From Department:</span>
                  <Badge variant="outline" className="mt-1" data-testid="badge-from-department">
                    {fromDepartment}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">To Department:</span>
                  <Badge variant="default" className="mt-1" data-testid="badge-to-department">
                    {toDepartment}
                  </Badge>
                </div>
                {workInstructionRef && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      Work Instruction:
                    </span>
                    <p className="font-semibold" data-testid="text-work-instruction">
                      {workInstructionRef}
                      {workInstructionVersion && <span className="text-muted-foreground ml-1">(v{workInstructionVersion})</span>}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          <div>
            <Label className="flex items-center gap-2 mb-3 text-base font-semibold">
              <ClipboardCheck className="h-4 w-4" />
              AS9100 Declaration
            </Label>
            <Alert className="bg-gray-50 dark:bg-gray-900">
              <AlertDescription className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-declaration">
                {declarationText}
              </AlertDescription>
            </Alert>
            
            <div className="flex items-start space-x-3 mt-4 p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
              <Checkbox
                id="declaration-accepted"
                checked={declarationAccepted}
                onCheckedChange={(checked) => setDeclarationAccepted(checked === true)}
                className="mt-0.5"
                data-testid="checkbox-declaration"
              />
              <Label 
                htmlFor="declaration-accepted" 
                className="text-sm font-medium cursor-pointer leading-relaxed"
              >
                I have read and understand the above declaration. I confirm that all work has been completed according to the specified work instructions and quality standards.
              </Label>
            </div>
          </div>

          <Separator />

          <div>
            <Label className="flex items-center gap-2 mb-3 text-base font-semibold">
              <Pen className="h-4 w-4" />
              Electronic Signature
            </Label>
            
            <p className="text-sm text-muted-foreground mb-2">
              Signing as: <span className="font-semibold text-foreground" data-testid="text-signer-name">{signerName}</span>
            </p>
            
            <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
              <SignatureCanvas
                ref={signatureRef}
                penColor="black"
                clearOnResize={false}
                canvasProps={{
                  className: 'w-full h-40 cursor-crosshair',
                  style: { width: '100%', height: '160px', touchAction: 'none' }
                }}
                onEnd={handleSignatureEnd}
                data-testid="canvas-signature"
              />
            </div>
            
            <div className="flex justify-between items-center mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSignature}
                className="text-muted-foreground"
                data-testid="button-clear-signature"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Clear Signature
              </Button>
              
              {signatureEmpty ? (
                <span className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Signature required
                </span>
              ) : (
                <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Signature captured
                </span>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={signatureMutation.isPending}
              data-testid="button-cancel-signature"
            >
              Cancel
            </Button>
            <Button
              onClick={() => signatureMutation.mutate()}
              disabled={!canSubmit}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-submit-signature"
            >
              {signatureMutation.isPending ? (
                <>Processing...</>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Sign & Complete Transfer
                </>
              )}
            </Button>
          </div>
          
          {!canSubmit && !signatureMutation.isPending && (
            <p className="text-sm text-center text-muted-foreground">
              {!declarationAccepted && !signatureEmpty && 'Please accept the declaration to continue'}
              {declarationAccepted && signatureEmpty && 'Please provide your signature to continue'}
              {!declarationAccepted && signatureEmpty && 'Please accept the declaration and provide your signature'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
