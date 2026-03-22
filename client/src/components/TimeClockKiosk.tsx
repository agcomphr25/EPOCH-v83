import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, LogIn, LogOut, UserCheck, Coffee, PlayCircle, ArrowLeft } from 'lucide-react';

interface WorkBucket {
  id: string;
  name: string;
  type: string;
}

type PunchStatus = 'clock_in' | 'clock_out' | 'break_start' | 'break_end' | null;

interface KioskStatus {
  status: PunchStatus;
  lastPunch: { punchType: string; punchTime: string } | null;
  clockIn: string | null;
  clockOut: string | null;
}

const GROUP_LABELS: Record<string, string> = {
  DIRECT: 'Direct Labor',
  INDIRECT: 'Indirect',
  NON_WORK: 'Non-Work',
};

async function kioskFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api/timekeeping${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export default function TimeClockKiosk() {
  const [step, setStep] = useState<'entry' | 'clock' | 'done'>('entry');
  const [idInput, setIdInput] = useState('');
  const [employeeId, setEmployeeId] = useState<number | null>(null);

  const [kioskStatus, setKioskStatus] = useState<KioskStatus | null>(null);
  const [buckets, setBuckets] = useState<WorkBucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const bucketGroups = buckets.reduce<Record<string, WorkBucket[]>>((acc, b) => {
    if (!acc[b.type]) acc[b.type] = [];
    acc[b.type].push(b);
    return acc;
  }, {});

  // Load buckets once
  useEffect(() => {
    kioskFetch('/kiosk/buckets').then(setBuckets).catch(console.error);
  }, []);

  const loadStatus = useCallback(async (empId: number) => {
    const data = await kioskFetch(`/kiosk/status/${empId}`);
    setKioskStatus(data);
  }, []);

  const handleConfirmId = async () => {
    const id = parseInt(idInput.trim(), 10);
    if (isNaN(id) || id <= 0) {
      setError('Enter a valid employee number');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await loadStatus(id);
      setEmployeeId(id);
      setStep('clock');
    } catch (err: any) {
      setError(err.message ?? 'Could not load status');
    } finally {
      setLoading(false);
    }
  };

  const handlePunch = async (type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end') => {
    if (type === 'clock_in' && !selectedBucket) {
      setError('Select a work bucket first');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await kioskFetch('/kiosk/punch', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          type,
          workBucketId: type === 'clock_in' ? selectedBucket : undefined,
        }),
      });

      const labels: Record<string, string> = {
        clock_in: 'Clocked in successfully!',
        clock_out: 'Clocked out. Have a great day!',
        break_start: 'Break started.',
        break_end: 'Break ended — back to it!',
      };

      setSuccessMsg(labels[type] ?? 'Done!');
      setStep('done');

      // Reset to entry screen after 4 seconds
      setTimeout(() => {
        setStep('entry');
        setIdInput('');
        setEmployeeId(null);
        setKioskStatus(null);
        setSelectedBucket('');
        setSuccessMsg('');
        setError('');
      }, 4000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to record punch');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('entry');
    setIdInput('');
    setEmployeeId(null);
    setKioskStatus(null);
    setSelectedBucket('');
    setError('');
  };

  const clockedIn =
    kioskStatus?.status === 'clock_in' ||
    kioskStatus?.status === 'break_start' ||
    kioskStatus?.status === 'break_end';
  const onBreak = kioskStatus?.status === 'break_start';

  const fmt = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ── DONE / SUCCESS ──────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="text-center space-y-4 py-6">
        <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
        <p className="text-lg font-semibold text-green-700">{successMsg}</p>
        <p className="text-sm text-muted-foreground">Employee #{employeeId}</p>
        <p className="text-xs text-muted-foreground">Screen resets in a few seconds…</p>
      </div>
    );
  }

  // ── STEP 2: CLOCK UI ────────────────────────────────────────────────────────
  if (step === 'clock') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-green-600" />
            <span className="font-semibold">Employee #{employeeId}</span>
          </div>
          {onBreak && <Badge variant="outline" className="border-amber-400 text-amber-700">On Break</Badge>}
          {clockedIn && !onBreak && <Badge variant="outline" className="border-green-500 text-green-700">Clocked In</Badge>}
          {!clockedIn && kioskStatus?.status && <Badge variant="outline" className="text-muted-foreground">Clocked Out</Badge>}
        </div>

        {clockedIn && !onBreak && kioskStatus?.clockIn && (
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm font-medium text-green-800">Clocked in since</p>
            <p className="text-xl font-bold text-green-900">{fmt(kioskStatus.clockIn)}</p>
          </div>
        )}

        {onBreak && (
          <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm font-medium text-amber-800">On break since</p>
            <p className="text-xl font-bold text-amber-900">{fmt(kioskStatus?.lastPunch?.punchTime ?? null)}</p>
          </div>
        )}

        {!clockedIn && (
          <>
            {kioskStatus?.clockOut && (
              <div className="text-center p-2 text-sm text-muted-foreground">
                Last clocked out at {fmt(kioskStatus.clockOut)}
              </div>
            )}
            {buckets.length > 0 && (
              <Select value={selectedBucket} onValueChange={setSelectedBucket}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select work bucket…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(bucketGroups).map(([type, items]) => (
                    <SelectGroup key={type}>
                      <SelectLabel>{GROUP_LABELS[type] ?? type}</SelectLabel>
                      {items.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        {!clockedIn && (
          <Button
            className="w-full h-14 text-base bg-green-500 hover:bg-green-600 disabled:opacity-50"
            disabled={loading || !selectedBucket}
            onClick={() => handlePunch('clock_in')}
          >
            <LogIn className="w-5 h-5 mr-2" />
            {loading ? 'Recording…' : 'Clock In'}
          </Button>
        )}

        {clockedIn && !onBreak && (
          <div className="space-y-2">
            <Button
              className="w-full h-14 text-base bg-red-500 hover:bg-red-600"
              disabled={loading}
              onClick={() => handlePunch('clock_out')}
            >
              <LogOut className="w-5 h-5 mr-2" />
              {loading ? 'Recording…' : 'Clock Out'}
            </Button>
            <Button
              variant="outline"
              className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
              disabled={loading}
              onClick={() => handlePunch('break_start')}
            >
              <Coffee className="w-4 h-4 mr-2" />
              Start Break
            </Button>
          </div>
        )}

        {onBreak && (
          <Button
            className="w-full h-14 text-base bg-amber-500 hover:bg-amber-600"
            disabled={loading}
            onClick={() => handlePunch('break_end')}
          >
            <PlayCircle className="w-5 h-5 mr-2" />
            {loading ? 'Recording…' : 'End Break'}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={handleBack}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Different employee
        </Button>
      </div>
    );
  }

  // ── STEP 1: EMPLOYEE ID ENTRY ───────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="kioskEmployeeId" className="flex items-center gap-2">
          <UserCheck className="w-4 h-4" />
          Employee ID Number
        </Label>
        <div className="flex gap-2">
          <Input
            id="kioskEmployeeId"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Enter your employee #"
            value={idInput}
            onChange={e => { setIdInput(e.target.value); setError(''); }}
            onKeyDown={e => {
              if (e.key === 'Enter' && idInput.trim()) handleConfirmId();
            }}
            disabled={loading}
            autoFocus
            className="flex-1"
          />
          <Button
            onClick={handleConfirmId}
            disabled={loading || !idInput.trim()}
            className="h-10"
          >
            {loading ? '…' : 'Go'}
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-muted-foreground">Enter your numeric employee ID to clock in or out</p>
      </div>
    </div>
  );
}
