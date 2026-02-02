import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, FileSignature, Shield, AlertCircle, Loader2 } from 'lucide-react';

interface SignatureAuthorizationStepProps {
  sessionId: string;
  employeeName?: string;
  isCompleted?: boolean;
  onComplete?: () => void;
}

interface SignatureAuthData {
  signatureAuthCompleted: boolean;
  signatureAuthData?: {
    signedName: string;
    acknowledged: boolean;
    signedAt: string;
  };
}

export default function SignatureAuthorizationStep({
  sessionId,
  employeeName = '',
  isCompleted = false,
  onComplete,
}: SignatureAuthorizationStepProps) {
  const { toast } = useToast();
  const [acknowledged, setAcknowledged] = useState(false);
  const [signedName, setSignedName] = useState('');

  const { data: authStatus, isLoading: isLoadingStatus } = useQuery<SignatureAuthData>({
    queryKey: ['/api/onboarding/sessions', sessionId, 'signature-auth'],
    enabled: !!sessionId,
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/onboarding/sessions/${sessionId}/signature-auth`, {
        method: 'PATCH',
        body: JSON.stringify({
          signedName: signedName.trim(),
          acknowledged: true,
          signedAt: new Date().toISOString(),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', sessionId, 'signature-auth'] });
      toast({
        title: 'Authorization Complete',
        description: 'Your electronic signature authorization has been saved.',
      });
      onComplete?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save authorization',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const isAlreadyCompleted = isCompleted || authStatus?.signatureAuthCompleted;
  const canSign = acknowledged && signedName.trim().length > 2;

  const handleSign = async () => {
    if (!canSign) return;
    signMutation.mutate();
  };

  useEffect(() => {
    if (authStatus?.signatureAuthCompleted && !isCompleted) {
      onComplete?.();
    }
  }, [authStatus?.signatureAuthCompleted, isCompleted, onComplete]);

  if (isLoadingStatus) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isAlreadyCompleted) {
    const savedName = authStatus?.signatureAuthData?.signedName || employeeName || 'Employee';
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Electronic Signature Authorized</p>
              <p className="text-sm text-green-600">
                {savedName} has authorized electronic signatures for this session.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            <CardTitle>Electronic Signature Authorization</CardTitle>
          </div>
          <CardDescription>
            Before signing any documents, please authorize the use of electronic signatures.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg border text-sm space-y-3">
            <p className="font-medium">By signing below, I acknowledge and agree that:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>I consent to use electronic signatures for all onboarding documents</li>
              <li>My electronic signature is legally binding and equivalent to a handwritten signature</li>
              <li>I understand that all signed documents will be stored securely</li>
              <li>I may request paper copies of any documents I sign electronically</li>
            </ul>
          </div>

          <div className="flex items-start gap-3 p-4 border rounded-lg">
            <Checkbox
              id="acknowledge"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="acknowledge" className="text-sm leading-relaxed cursor-pointer">
              I have read and understand the electronic signature authorization terms above,
              and I consent to use electronic signatures for this onboarding session.
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signedName">Type your full legal name to sign</Label>
            <Input
              id="signedName"
              placeholder="Enter your full name"
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              className="max-w-md h-12"
            />
            {signedName && (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <FileSignature className="h-3 w-3" />
                Your signature: <span className="italic font-medium">{signedName}</span>
              </p>
            )}
          </div>

          {!acknowledged && (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              Please acknowledge the terms above to continue
            </div>
          )}

          <Button
            onClick={handleSign}
            disabled={!canSign || signMutation.isPending}
            size="lg"
            className="w-full max-w-md h-14"
          >
            {signMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Signing...
              </>
            ) : (
              'Sign Authorization'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
