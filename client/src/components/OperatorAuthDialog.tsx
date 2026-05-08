/**
 * Phase 2 (Task #143) — operator authentication prompt.
 *
 * Used by the shop-floor material-issue UI to capture the operator's
 * badge scan or PIN entry before any material draw / reserve / scrap
 * call is made. The dialog also doubles as the high-risk re-auth
 * prompt: when `mode="reauth"` it bumps `lastReauthAt` on an existing
 * session so high-risk actions (overrides, expired-lot release,
 * quarantine release, scrap above the dollar threshold) can proceed.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOperatorAuth } from '@/hooks/useOperatorAuth';

export interface OperatorAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "signin" — full badge/PIN. "reauth" — high-risk re-scan on existing session. */
  mode?: 'signin' | 'reauth';
  workstationId?: string;
  /** Invoked after a successful sign-in or re-auth so the caller can proceed. */
  onAuthenticated?: () => void;
}

export function OperatorAuthDialog({
  open,
  onOpenChange,
  mode = 'signin',
  workstationId,
  onAuthenticated,
}: OperatorAuthDialogProps) {
  const auth = useOperatorAuth(workstationId);
  const [badgeCode, setBadgeCode] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const badgeInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the badge field on open so a scanner can fire straight in.
  useEffect(() => {
    if (open && badgeInputRef.current) {
      const t = setTimeout(() => badgeInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Reset local form state on close.
  useEffect(() => {
    if (!open) {
      setBadgeCode('');
      setEmployeeCode('');
      setPin('');
      setLocalError(null);
    }
  }, [open]);

  async function submitBadge() {
    setLocalError(null);
    try {
      if (mode === 'reauth') {
        // High-risk re-auth: forward the freshly-scanned badge to the
        // server so /reauth can verify the credential matches the same
        // employee on the existing session. Token-only reauth is rejected
        // by the server.
        await auth.reauthenticate({ badgeCode });
      } else {
        await auth.signInWithBadge(badgeCode);
      }
      onAuthenticated?.();
      onOpenChange(false);
    } catch (e: any) {
      setLocalError(e?.message ?? 'Badge authentication failed.');
    }
  }

  async function submitPin() {
    setLocalError(null);
    try {
      if (mode === 'reauth') {
        await auth.reauthenticate({ employeeCode, pin });
      } else {
        await auth.signInWithPin(employeeCode, pin);
      }
      onAuthenticated?.();
      onOpenChange(false);
    } catch (e: any) {
      setLocalError(e?.message ?? 'PIN authentication failed.');
    }
  }

  const title =
    mode === 'reauth' ? 'Re-scan badge — high-risk action' : 'Operator authentication required';
  const description =
    mode === 'reauth'
      ? 'This action requires a fresh badge scan or PIN entry to confirm operator identity. Re-scan now to continue.'
      : 'Scan your badge or enter your PIN to attribute this material draw to you.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-operator-auth" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="badge" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="badge" data-testid="tab-badge">Badge scan</TabsTrigger>
            <TabsTrigger value="pin" data-testid="tab-pin">PIN entry</TabsTrigger>
          </TabsList>

          <TabsContent value="badge" className="space-y-3 pt-3">
            <div className="space-y-1">
              <Label htmlFor="badge-input">Badge code</Label>
              <Input
                id="badge-input"
                ref={badgeInputRef}
                data-testid="input-badge-code"
                value={badgeCode}
                autoComplete="off"
                onChange={(e) => setBadgeCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && badgeCode.length > 0) submitBadge();
                }}
                placeholder="Scan badge or type code"
              />
            </div>
            <Button
              data-testid="button-submit-badge"
              className="w-full"
              disabled={auth.loading || badgeCode.length === 0}
              onClick={submitBadge}
            >
              {auth.loading ? 'Authenticating…' : mode === 'reauth' ? 'Re-authenticate' : 'Sign in'}
            </Button>
          </TabsContent>

          <TabsContent value="pin" className="space-y-3 pt-3">
            <div className="space-y-1">
              <Label htmlFor="emp-code">Employee code</Label>
              <Input
                id="emp-code"
                data-testid="input-employee-code"
                value={employeeCode}
                autoComplete="off"
                onChange={(e) => setEmployeeCode(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pin-input">PIN</Label>
              <Input
                id="pin-input"
                data-testid="input-pin"
                type="password"
                inputMode="numeric"
                value={pin}
                autoComplete="off"
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && employeeCode && pin) submitPin();
                }}
              />
            </div>
            <Button
              data-testid="button-submit-pin"
              className="w-full"
              disabled={auth.loading || !employeeCode || !pin}
              onClick={submitPin}
            >
              {auth.loading ? 'Authenticating…' : 'Sign in'}
            </Button>
          </TabsContent>
        </Tabs>

        {(localError || auth.error) && (
          <Alert variant="destructive" data-testid="alert-operator-auth-error">
            <AlertDescription>{localError ?? auth.error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            data-testid="button-cancel-operator-auth"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
