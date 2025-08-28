
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SecureVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  operation: string;
  itemName: string;
  operationType: 'delete' | 'add' | 'modify';
}

export default function SecureVerificationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  operation, 
  itemName, 
  operationType 
}: SecureVerificationModalProps) {
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  // Generate a random 6-digit confirmation code
  const [generatedCode] = useState(() => 
    Math.floor(100000 + Math.random() * 900000).toString()
  );

  const handlePasswordVerification = async () => {
    setIsVerifying(true);
    setError('');

    try {
      // Verify admin password with backend
      const response = await fetch('/api/auth/verify-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` || document.cookie.includes('sessionToken') ? `Bearer ${document.cookie.split('sessionToken=')[1]?.split(';')[0]}` : ''
        },
        body: JSON.stringify({ password })
      });

      if (response.ok) {
        setStep(2);
        toast({
          title: "Step 1 Complete",
          description: `Please enter the confirmation code: ${generatedCode}`
        });
      } else {
        setError('Invalid admin password');
      }
    } catch (error) {
      setError('Authentication failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleConfirmationVerification = () => {
    if (confirmationCode === generatedCode) {
      toast({
        title: "Verification Complete",
        description: "Proceeding with secure operation"
      });
      onConfirm();
      handleClose();
    } else {
      setError('Invalid confirmation code');
    }
  };

  const handleClose = () => {
    setStep(1);
    setPassword('');
    setConfirmationCode('');
    setError('');
    onClose();
  };

  const getOperationColor = () => {
    switch (operationType) {
      case 'delete': return 'text-red-600';
      case 'add': return 'text-green-600';
      case 'modify': return 'text-yellow-600';
      default: return 'text-blue-600';
    }
  };

  const getOperationIcon = () => {
    switch (operationType) {
      case 'delete': return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'add': return <Shield className="h-5 w-5 text-green-500" />;
      case 'modify': return <Lock className="h-5 w-5 text-yellow-500" />;
      default: return <Shield className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getOperationIcon()}
            Secure Verification Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className={getOperationColor()}>
                {operation}: "{itemName}"
              </span>
              <br />
              This is a secure operation that requires 2-step verification.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">Step 1: Admin Password</h3>
                <p className="text-sm text-gray-600">Enter your admin password to proceed</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="admin-password">Admin Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  onKeyPress={(e) => e.key === 'Enter' && handlePasswordVerification()}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={handlePasswordVerification} 
                  disabled={!password || isVerifying}
                  className="flex-1"
                >
                  {isVerifying ? 'Verifying...' : 'Verify Password'}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">Step 2: Confirmation Code</h3>
                <p className="text-sm text-gray-600">
                  Enter the confirmation code displayed above
                </p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-xl font-mono font-bold text-blue-800">
                    {generatedCode}
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmation-code">Confirmation Code</Label>
                <Input
                  id="confirmation-code"
                  type="text"
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  onKeyPress={(e) => e.key === 'Enter' && handleConfirmationVerification()}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmationVerification}
                  disabled={confirmationCode.length !== 6}
                  className="flex-1"
                  variant={operationType === 'delete' ? 'destructive' : 'default'}
                >
                  Confirm {operation}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
