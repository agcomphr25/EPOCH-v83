import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, AlertCircle, ScanBarcode } from 'lucide-react';

interface InlineCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: { id: number; username: string; role: string }, expiresAt: string) => void;
  actionDescription?: string;
}

interface ValidationResponse {
  success: boolean;
  token: string;
  expiresAt: string;
  user: {
    id: number;
    username: string;
    role: string;
  };
}

export default function InlineCredentialModal({
  isOpen,
  onClose,
  onSuccess,
  actionDescription = 'perform this action',
}: InlineCredentialModalProps) {
  const [mode, setMode] = useState<'badge' | 'password'>('badge');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validateMutation = useMutation({
    mutationFn: async (payload: { username: string; password: string } | { employeeCode: string }) => {
      const response = await fetch('/api/auth/validate-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid credentials');
      }

      return response.json() as Promise<ValidationResponse>;
    },
    onSuccess: (data) => {
      setError(null);
      setUsername('');
      setPassword('');
      setEmployeeCode('');
      onSuccess(data.token, data.user, data.expiresAt);
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'badge') {
      if (!employeeCode.trim()) {
        setError('Please enter your employee code');
        return;
      }
      validateMutation.mutate({ employeeCode: employeeCode.trim() });
    } else {
      if (!username.trim() || !password.trim()) {
        setError('Please enter both username and password');
        return;
      }
      validateMutation.mutate({ username: username.trim(), password });
    }
  };

  const handleClose = () => {
    setError(null);
    setUsername('');
    setPassword('');
    setEmployeeCode('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-blue-600" />
            Authentication Required
          </DialogTitle>
          <DialogDescription>
            Please authenticate to {actionDescription}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'badge' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => { setMode('badge'); setError(null); }}
          >
            <ScanBarcode className="h-4 w-4 mr-1" />
            Badge Code
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'password' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => { setMode('password'); setError(null); }}
          >
            <Lock className="h-4 w-4 mr-1" />
            Username & Password
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {mode === 'badge' ? (
            <div className="space-y-2">
              <Label htmlFor="inline-badge">Employee Badge Code</Label>
              <Input
                id="inline-badge"
                type="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="Scan or enter your badge code"
                autoComplete="off"
                autoFocus
                disabled={validateMutation.isPending}
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="inline-username">Username</Label>
                <Input
                  id="inline-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  disabled={validateMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inline-password">Password</Label>
                <Input
                  id="inline-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={validateMutation.isPending}
                />
              </div>
            </>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleClose} disabled={validateMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={validateMutation.isPending}>
              {validateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Authenticate'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
