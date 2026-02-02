import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, FileSignature, Shield, AlertCircle } from 'lucide-react';

interface SignatureAuthorizationStepProps {
  sessionId: string;
  employeeName?: string;
  isCompleted?: boolean;
  onComplete?: () => void;
}

export default function SignatureAuthorizationStep({
  sessionId,
  employeeName = '',
  isCompleted = false,
  onComplete,
}: SignatureAuthorizationStepProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [signedName, setSignedName] = useState('');
  const [isSigning, setIsSigning] = useState(false);

  const canSign = acknowledged && signedName.trim().length > 2;

  const handleSign = async () => {
    if (!canSign) return;
    setIsSigning(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSigning(false);
    onComplete?.();
  };

  if (isCompleted) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Electronic Signature Authorized</p>
              <p className="text-sm text-green-600">
                {employeeName || 'Employee'} has authorized electronic signatures for this session.
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
              className="max-w-md"
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
            disabled={!canSign || isSigning}
            size="lg"
            className="w-full max-w-md"
          >
            {isSigning ? 'Signing...' : 'Sign Authorization'}
          </Button>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-gray-400">
        Session ID: {sessionId}
      </div>
    </div>
  );
}
