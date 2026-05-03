import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { ResolvedEmployee, SignBadgeLookupStatus } from '@/lib/signBadgeHandlers';

interface Props {
  badgeValue: string;
  signedByName: string;
  lookupStatus: SignBadgeLookupStatus;
  resolvedEmployee: ResolvedEmployee | null;
  onBadgeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit?: () => void;
}

export default function SignBadgeScanSection({
  badgeValue,
  signedByName,
  lookupStatus,
  resolvedEmployee,
  onBadgeChange,
  onNameChange,
  onSubmit,
}: Props) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
      className="space-y-2"
    >
      <Label htmlFor="sign-badge">Employee ID / Badge *</Label>
      <div className="relative">
        <Input
          id="sign-badge"
          name="sign-badge"
          type="password"
          value={badgeValue}
          onChange={(e) => onBadgeChange(e.target.value)}
          placeholder="Scan or type your badge / employee code..."
          autoComplete="new-password"
          data-testid="input-sign-badge"
          className={
            lookupStatus === 'found'
              ? 'border-green-500 pr-9'
              : lookupStatus === 'not_found'
              ? 'border-red-400 pr-9'
              : 'pr-9'
          }
        />
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {lookupStatus === 'loading' && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {lookupStatus === 'found' && (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          )}
          {lookupStatus === 'not_found' && (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
        </div>
      </div>

      {lookupStatus === 'found' && resolvedEmployee && (
        <div
          data-testid="sign-badge-found-card"
          className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
          <span className="font-medium">{resolvedEmployee.name}</span>
          {resolvedEmployee.employeeCode && (
            <span className="text-green-600">· {resolvedEmployee.employeeCode}</span>
          )}
          {resolvedEmployee.department && (
            <span className="text-green-600 text-xs">{resolvedEmployee.department}</span>
          )}
        </div>
      )}

      {lookupStatus === 'not_found' && (
        <div className="space-y-2">
          <div
            data-testid="sign-badge-not-found-message"
            className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            Badge not found. Enter your name manually to continue.
          </div>
          <div className="space-y-1">
            <Label htmlFor="sign-name">Your Name *</Label>
            <Input
              id="sign-name"
              name="sign-name"
              value={signedByName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Your full name"
              data-testid="input-sign-name"
            />
          </div>
        </div>
      )}
    </form>
  );
}
