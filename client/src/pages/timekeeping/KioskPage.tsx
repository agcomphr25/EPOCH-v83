import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle, XCircle, ShieldAlert, Delete, Lock, Search, Coffee, LogOut, Play, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

type KioskStep = 'idle' | 'pin-entry' | 'loading' | 'confirm' | 'punching' | 'correction' | 'success' | 'error' | 'locked-out';

interface DcaaPolicyViolation {
  ruleId: string;
  reason: string;
  remediation: string;
}

interface EmployeeInfo {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
}

interface PunchStatus {
  employeeId: number;
  status: string;
  clockedInAt: string | null;
  hoursToday: number;
  openEntry?: { id?: number; clockIn?: string; clockOut?: string | null; chargeCode?: string | null } | null;
}

interface ChargeCode {
  id: number;
  code: string;
  description: string | null;
  type: string;
}

type PunchEventType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';

interface PunchEvent {
  id: number;
  sessionId: number;
  type: PunchEventType;
  punchedAt: string;
  costCode: string | null;
  hasMissingClockOut?: boolean;
}

interface ShiftRow {
  sessionId: number;
  label: string;
  startAt: string | null;
  endAt: string | null;
  costCode: string | null;
  isOpen: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  DIRECT: 'Direct Labor',
  OVERHEAD: 'Overhead',
  G_AND_A: 'G&A',
  IR_AND_D: 'IR&D',
  B_AND_P: 'B&P',
  INDIRECT: 'Indirect',
};

function labelForType(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

interface ChargeCodePickerProps {
  chargeCodes: ChargeCode[];
  value: string;
  onChange: (code: string) => void;
  onInteraction: () => void;
}

function ChargeCodePicker({ chargeCodes, value, onChange, onInteraction }: ChargeCodePickerProps) {
  const [search, setSearch] = useState('');

  const filtered = chargeCodes.filter(cc => {
    const q = search.toLowerCase();
    return (
      cc.code.toLowerCase().includes(q) ||
      (cc.description ?? '').toLowerCase().includes(q)
    );
  });

  const groups = filtered.reduce<Record<string, ChargeCode[]>>((acc, cc) => {
    if (!acc[cc.type]) acc[cc.type] = [];
    acc[cc.type].push(cc);
    return acc;
  }, {});

  const groupKeys = Object.keys(groups).sort();
  const showHeaders = groupKeys.length > 1;

  return (
    <div className="space-y-2 text-left">
      <label className="text-xs uppercase tracking-widest text-gray-400 block">
        Charge Code <span className="text-gray-300 normal-case">(optional)</span>
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by code or description…"
          value={search}
          onChange={e => { setSearch(e.target.value); onInteraction(); }}
          className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl pl-9 pr-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); onInteraction(); }}
            className="w-full text-left px-4 py-3 text-sm text-gray-400 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100"
          >
            — No charge code —
          </button>
        )}
        {filtered.length === 0 && (
          <p className="px-4 py-3 text-sm text-gray-400">No matching codes</p>
        )}
        {groupKeys.map(type => (
          <div key={type}>
            {showHeaders && (
              <div className="sticky top-0 bg-gray-50 px-4 py-1.5 border-b border-gray-100">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {labelForType(type)}
                </span>
              </div>
            )}
            {groups[type].map(cc => {
              const isSelected = cc.code === value;
              return (
                <button
                  key={cc.id}
                  type="button"
                  onClick={() => { onChange(cc.code); onInteraction(); }}
                  className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 border-b border-gray-100 last:border-b-0 active:bg-blue-50 transition-colors ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-sm font-semibold ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                    {cc.code}
                  </span>
                  {cc.description && (
                    <span className={`text-xs ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>
                      {cc.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

type KioskAction = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';

interface ActionMeta {
  currentLabel: string;
  verb: string;
  action: KioskAction;
}

function getActionMeta(status: string): ActionMeta {
  if (status === 'clocked_in') {
    return { currentLabel: 'CLOCKED IN', verb: 'Clock Out', action: 'clock_out' };
  }
  if (status === 'on_break') {
    return { currentLabel: 'ON BREAK', verb: 'Clock In from Break', action: 'break_end' };
  }
  return { currentLabel: 'CLOCKED OUT', verb: 'Clock In', action: 'clock_in' };
}

const IDLE_TIMEOUT_MS = 45_000;
const RESULT_DISPLAY_SEC = 5;
const PIN_LENGTH = 4;

const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'backspace', '0', 'submit'];

function formatKioskTime(ts: string | null): string {
  if (!ts) return 'In progress';
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatKioskHours(hours: number): string {
  return `${hours.toFixed(2)} hr${Math.abs(hours - 1) < 0.005 ? '' : 's'}`;
}

function buildShiftRows(punches: PunchEvent[]): ShiftRow[] {
  const rows = new Map<number, ShiftRow>();

  for (const punch of punches) {
    const existing = rows.get(punch.sessionId) ?? {
      sessionId: punch.sessionId,
      label: punch.type === 'break_start' || punch.type === 'break_end' ? 'Break' : 'Work',
      startAt: null,
      endAt: null,
      costCode: punch.costCode,
      isOpen: false,
    };

    if (punch.type === 'clock_in' || punch.type === 'break_start') {
      existing.startAt = punch.punchedAt;
    } else {
      existing.endAt = punch.punchedAt;
    }
    existing.costCode = existing.costCode ?? punch.costCode;
    existing.isOpen = !!punch.hasMissingClockOut || !existing.endAt;
    rows.set(punch.sessionId, existing);
  }

  return Array.from(rows.values()).sort((a, b) => (a.startAt ?? '').localeCompare(b.startAt ?? ''));
}

export default function KioskPage() {
  const [step, setStep] = useState<KioskStep>('idle');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [punchStatus, setPunchStatus] = useState<PunchStatus | null>(null);
  const [chargeCodes, setChargeCodes] = useState<ChargeCode[]>([]);
  const [selectedChargeCode, setSelectedChargeCode] = useState('');
  const [dailyCertificationConfirmed, setDailyCertificationConfirmed] = useState(false);
  const [showClockOutCertification, setShowClockOutCertification] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dcaaViolation, setDcaaViolation] = useState<DcaaPolicyViolation | null>(null);
  const [countdown, setCountdown] = useState(RESULT_DISPLAY_SEC);
  const [lockoutSecondsRemaining, setLockoutSecondsRemaining] = useState(0);
  const [certificationReviewLoading, setCertificationReviewLoading] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    requestType: 'edit_session',
    punchLedgerId: '',
    selectedPunchType: 'clock_in' as PunchEventType,
    clockIn: '',
    clockOut: '',
    reason: '',
  });
  const [activeShiftPunches, setActiveShiftPunches] = useState<PunchEvent[]>([]);
  const [correctionLoading, setCorrectionLoading] = useState(false);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const resetToIdle = useCallback(() => {
    setStep('idle');
    setPin('');
    setPinError('');
    setEmployee(null);
    setPunchStatus(null);
    setChargeCodes([]);
    setSelectedChargeCode('');
    setDailyCertificationConfirmed(false);
    setShowClockOutCertification(false);
    setResultMsg('');
    setErrorMsg('');
    setDcaaViolation(null);
    setCountdown(RESULT_DISPLAY_SEC);
    setLockoutSecondsRemaining(0);
    setCorrectionForm({ requestType: 'edit_session', punchLedgerId: '', selectedPunchType: 'clock_in', clockIn: '', clockOut: '', reason: '' });
    setActiveShiftPunches([]);
    setCorrectionLoading(false);
    setCertificationReviewLoading(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (lockoutRef.current) clearInterval(lockoutRef.current);
  }, []);

  const restartIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(resetToIdle, IDLE_TIMEOUT_MS);
  }, [resetToIdle]);

  useEffect(() => {
    if (step !== 'idle' && step !== 'success' && step !== 'error' && step !== 'locked-out') {
      restartIdleTimer();
      return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
    }
  }, [step, restartIdleTimer]);

  useEffect(() => {
    if (step === 'success' || step === 'error') {
      setCountdown(RESULT_DISPLAY_SEC);
      const iv = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { clearInterval(iv); resetToIdle(); return 0; }
          return prev - 1;
        });
      }, 1000);
      countdownRef.current = iv;
      return () => clearInterval(iv);
    }
  }, [step, resetToIdle]);

  useEffect(() => {
    if (step === 'locked-out') {
      const iv = setInterval(() => {
        setLockoutSecondsRemaining(prev => {
          if (prev <= 1) {
            clearInterval(iv);
            setStep('pin-entry');
            setPin('');
            setPinError('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      lockoutRef.current = iv;
      return () => clearInterval(iv);
    }
  }, [step]);

  const handleIdleTap = useCallback(() => {
    setStep('pin-entry');
    setPin('');
    setPinError('');
    restartIdleTimer();
  }, [restartIdleTimer]);

  const handlePinKey = useCallback((key: string) => {
    restartIdleTimer();
    setPinError('');
    if (key === 'backspace') {
      setPin(prev => prev.slice(0, -1));
    } else if (key !== 'submit') {
      setPin(prev => prev.length < PIN_LENGTH ? prev + key : prev);
    }
  }, [restartIdleTimer]);

  const handlePinSubmit = useCallback(async () => {
    if (pin.length !== PIN_LENGTH) return;
    setStep('loading');

    try {
      const identifyRes = await fetch('/api/timekeeping/kiosk/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const identifyData = await identifyRes.json();

      if (!identifyRes.ok) {
        if (identifyRes.status === 429) {
          const raw = identifyData.retryAfterSeconds;
          const retryAfter = Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 60;
          setLockoutSecondsRemaining(retryAfter);
          setPin('');
          setPinError('');
          setStep('locked-out');
          return;
        }
        // Authentication failure — stay on PIN entry screen with inline error
        setPin('');
        setPinError(identifyData.error ?? 'PIN not recognised. Please try again.');
        setStep('pin-entry');
        return;
      }

      const emp: EmployeeInfo = {
        id: identifyData.id,
        firstName: identifyData.firstName,
        lastName: identifyData.lastName,
        jobTitle: identifyData.jobTitle,
      };
      setEmployee(emp);

      // Use punch status from identify response, falling back to separate fetch if absent
      let status: PunchStatus = identifyData.punchStatus;
      if (!status) {
        const statusRes = await fetch(`/api/timekeeping/kiosk/punches/employee/${emp.id}/current`);
        status = await statusRes.json();
      }
      setPunchStatus(status);
      setSelectedChargeCode(status?.openEntry?.chargeCode ?? '');
      setDailyCertificationConfirmed(false);
      setShowClockOutCertification(false);

      // Load charge codes
      const codesRes = await fetch('/api/timekeeping/kiosk/charge-codes');
      if (codesRes.ok) {
        const codes: ChargeCode[] = await codesRes.json();
        setChargeCodes(codes);
      }

      setStep('confirm');
    } catch {
      setErrorMsg('Network error. Please try again or see an administrator.');
      setStep('error');
    }
  }, [pin]);

  const handleConfirm = useCallback(async (requestedAction?: KioskAction) => {
    if (!employee || !punchStatus) return;

    const meta = getActionMeta(punchStatus.status);
    const action = requestedAction ?? meta.action;
    if (action === 'clock_out' && !dailyCertificationConfirmed) {
      setShowClockOutCertification(true);
      restartIdleTimer();
      return;
    }

    setStep('punching');
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      const res = await fetch('/api/timekeeping/kiosk/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee.id,
          requestedAction: action,
          timezone: tz,
          ...(action === 'clock_out' ? { dailyCertificationConfirmed } : {}),
          ...(selectedChargeCode ? { costCode: selectedChargeCode } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.dcaaViolation) {
          setDcaaViolation(data.dcaaViolation);
          setErrorMsg('');
        } else {
          setErrorMsg(data.error ?? 'Punch failed. Please see an administrator.');
        }
        setStep('error');
        return;
      }

      setResultMsg(data.message ?? 'Punch recorded successfully!');
      setStep('success');
    } catch {
      setErrorMsg('Network error. Punch was not recorded.');
      setStep('error');
    }
  }, [dailyCertificationConfirmed, employee, punchStatus, restartIdleTimer, selectedChargeCode]);

  const loadActiveShiftPunches = useCallback(async () => {
    if (!employee) return [];
    const res = await fetch(`/api/timekeeping/kiosk/punches/employee/${employee.id}/active-shift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.punches) ? data.punches as PunchEvent[] : [];
  }, [employee, pin]);

  const handleClockOutIntent = useCallback(async () => {
    setShowClockOutCertification(true);
    setDailyCertificationConfirmed(false);
    restartIdleTimer();
    setCertificationReviewLoading(true);
    try {
      setActiveShiftPunches(await loadActiveShiftPunches());
    } finally {
      setCertificationReviewLoading(false);
    }
  }, [loadActiveShiftPunches, restartIdleTimer]);

  const openCorrectionForm = useCallback(async () => {
    const openEntry = punchStatus?.openEntry;
    setCorrectionForm({
      requestType: openEntry?.id ? 'edit_session' : 'add_session',
      punchLedgerId: openEntry?.id ? String(openEntry.id) : '',
      selectedPunchType: 'clock_in',
      clockIn: openEntry?.clockIn ? new Date(openEntry.clockIn).toISOString().slice(0, 16) : '',
      clockOut: '',
      reason: '',
    });
    setStep('correction');
    restartIdleTimer();
    if (!employee) return;
    setCorrectionLoading(true);
    try {
      setActiveShiftPunches(await loadActiveShiftPunches());
    } finally {
      setCorrectionLoading(false);
    }
  }, [employee, loadActiveShiftPunches, punchStatus, restartIdleTimer]);

  const selectCorrectionPunch = useCallback((punch: PunchEvent) => {
    const local = new Date(punch.punchedAt).toISOString().slice(0, 16);
    setCorrectionForm((prev) => ({
      ...prev,
      requestType: 'edit_session',
      punchLedgerId: String(punch.sessionId),
      selectedPunchType: punch.type,
      clockIn: punch.type === 'clock_in' || punch.type === 'break_start' ? local : '',
      clockOut: punch.type === 'clock_out' || punch.type === 'break_end' ? local : '',
    }));
    restartIdleTimer();
  }, [restartIdleTimer]);

  const startMissingPunchCorrection = useCallback(() => {
    setCorrectionForm((prev) => ({
      ...prev,
      requestType: 'add_session',
      punchLedgerId: '',
      selectedPunchType: 'clock_in',
      clockIn: '',
      clockOut: '',
    }));
    restartIdleTimer();
  }, [restartIdleTimer]);

  const submitCorrectionRequest = useCallback(async () => {
    if (!employee || pin.length !== PIN_LENGTH) return;
    if (correctionForm.reason.trim().length < 5) {
      setErrorMsg('Please enter a correction reason.');
      setStep('error');
      return;
    }

    setStep('punching');
    try {
      const res = await fetch('/api/timekeeping/kiosk/punch-corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee.id,
          pin,
          requestType: correctionForm.requestType,
          punchLedgerId: correctionForm.punchLedgerId ? Number(correctionForm.punchLedgerId) : null,
          reason: correctionForm.reason.trim(),
          proposedChanges: {
            punchType: correctionForm.selectedPunchType,
            laborClass: correctionForm.selectedPunchType === 'break_start' || correctionForm.selectedPunchType === 'break_end' ? 'BREAK' : 'REGULAR',
            ...(correctionForm.clockIn ? { clockIn: new Date(correctionForm.clockIn).toISOString() } : {}),
            ...(correctionForm.clockOut ? { clockOut: new Date(correctionForm.clockOut).toISOString() } : {}),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Correction request failed. Please see an administrator.');
        setStep('error');
        return;
      }
      setResultMsg('Correction request submitted for supervisor review.');
      setStep('success');
    } catch {
      setErrorMsg('Network error. Correction request was not submitted.');
      setStep('error');
    }
  }, [correctionForm, employee, pin]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (step === 'locked-out') return;

      if (step === 'loading' || step === 'punching') return;

      if (step === 'success' || step === 'error') {
        e.preventDefault();
        resetToIdle();
        return;
      }

      if (step === 'idle') {
        e.preventDefault();
        handleIdleTap();
        return;
      }

      if (step === 'pin-entry') {
        if (e.key === 'Escape') {
          e.preventDefault();
          resetToIdle();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (pin.length === PIN_LENGTH) handlePinSubmit();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          handlePinKey('backspace');
          return;
        }
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          handlePinKey(e.key);
          return;
        }
        return;
      }

      if (step === 'confirm') {
        if (e.key === 'Escape') {
          e.preventDefault();
          resetToIdle();
          return;
        }
        if (e.key === 'Enter') {
          const active = document.activeElement;
          const isTextInput =
            active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement ||
            (active instanceof HTMLElement && active.isContentEditable);
          if (isTextInput) return;
          e.preventDefault();
          if (punchStatus?.status === 'clocked_in' && !showClockOutCertification) {
            handleClockOutIntent();
            return;
          }
          handleConfirm();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, pin, punchStatus, showClockOutCertification, handleIdleTap, handlePinKey, handlePinSubmit, handleConfirm, handleClockOutIntent, resetToIdle]);

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <div
        className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center cursor-pointer select-none"
        onClick={handleIdleTap}
      >
        <div className="text-center space-y-4">
          <p className="text-base font-semibold tracking-[0.3em] text-gray-400 uppercase">AG Composites</p>
          <div className="text-9xl font-bold tabular-nums tracking-tight text-gray-900">{timeStr}</div>
          <div className="text-xl text-gray-500">{dateStr}</div>
          <div className="mt-16 flex flex-col items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            <p className="text-gray-400 text-sm">Tap anywhere to clock in or out</p>
          </div>
        </div>
      </div>
    );
  }

  // ── LOADING / PUNCHING ───────────────────────────────────────────────────
  if (step === 'loading' || step === 'punching') {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center gap-6">
        <Loader2 className="h-16 w-16 animate-spin text-blue-500" />
        <p className="text-lg text-gray-500">
          {step === 'punching' ? 'Recording your punch…' : 'Verifying PIN…'}
        </p>
      </div>
    );
  }

  // ── SUCCESS ──────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div
        className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center text-center px-8 cursor-pointer"
        onClick={resetToIdle}
      >
        <CheckCircle className="h-24 w-24 text-green-500 mb-6" />
        <p className="text-3xl font-bold text-green-700 mb-3 max-w-sm">{resultMsg}</p>
        <p className="text-gray-400">Tap to dismiss · resets in {countdown}s</p>
      </div>
    );
  }

  // ── ERROR ────────────────────────────────────────────────────────────────
  if (step === 'error') {
    if (dcaaViolation) {
      return (
        <div
          className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center text-center px-8 cursor-pointer"
          onClick={resetToIdle}
        >
          <ShieldAlert className="h-20 w-20 text-amber-500 mb-5" />
          <div className="inline-block bg-amber-50 border border-amber-300 rounded-lg px-3 py-1 mb-4">
            <span className="text-amber-600 text-xs font-mono font-bold tracking-widest">DCAA {dcaaViolation.ruleId}</span>
          </div>
          <p className="text-xl font-bold text-amber-800 mb-4 max-w-sm leading-snug">
            {dcaaViolation.reason}
          </p>
          <p className="text-gray-500 text-sm max-w-sm mb-8 leading-relaxed">
            {dcaaViolation.remediation}
          </p>
          <p className="text-gray-400 text-xs mb-6">Tap to dismiss · resets in {countdown}s</p>
          <Button
            variant="outline"
            size="lg"
            onClick={(e) => { e.stopPropagation(); resetToIdle(); }}
            className="border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            Back
          </Button>
        </div>
      );
    }
    return (
      <div
        className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center text-center px-8 cursor-pointer"
        onClick={resetToIdle}
      >
        <XCircle className="h-24 w-24 text-red-500 mb-6" />
        <p className="text-2xl font-bold text-red-700 mb-3 max-w-sm">{errorMsg}</p>
        <p className="text-gray-400 mb-8">Tap to try again · resets in {countdown}s</p>
        <Button
          variant="outline"
          size="lg"
          onClick={(e) => { e.stopPropagation(); resetToIdle(); }}
          className="border-gray-300 text-gray-700 hover:bg-gray-100"
        >
          Try Again
        </Button>
      </div>
    );
  }

  // ── LOCKED OUT ───────────────────────────────────────────────────────────
  if (step === 'locked-out') {
    const mins = Math.floor(lockoutSecondsRemaining / 60);
    const secs = lockoutSecondsRemaining % 60;
    const timeLabel = mins > 0
      ? `${mins}m ${secs.toString().padStart(2, '0')}s`
      : `${secs}s`;
    return (
      <div className="min-h-screen bg-amber-50 text-gray-900 flex flex-col items-center justify-center text-center px-8">
        <Lock className="h-20 w-20 text-amber-500 mb-6" />
        <p className="text-3xl font-bold text-amber-800 mb-3">Too many attempts</p>
        <p className="text-gray-600 text-lg mb-8 max-w-sm leading-snug">
          This kiosk is temporarily locked. Please wait before trying again.
        </p>
        <div className="bg-white border border-amber-200 rounded-2xl px-10 py-6 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-amber-400 mb-1">Try again in</p>
          <p className="text-5xl font-bold tabular-nums text-amber-700">{timeLabel}</p>
        </div>
      </div>
    );
  }

  // ── PIN ENTRY ────────────────────────────────────────────────────────────
  if (step === 'pin-entry') {
    return (
      <div
        className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center px-6"
        onMouseMove={restartIdleTimer}
      >
        <div className="w-full max-w-xs space-y-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 mb-1">Enter Your PIN</p>
            <p className="text-sm text-gray-400">Type your 4-digit kiosk PIN</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-4 h-12">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    i < pin.length
                      ? pinError ? 'bg-red-500 border-red-500' : 'bg-blue-500 border-blue-500'
                      : pinError ? 'bg-transparent border-red-300' : 'bg-transparent border-gray-300'
                  }`}
                />
              ))}
            </div>
            {pinError && (
              <p className="text-red-600 text-sm font-medium mt-2">{pinError}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {PIN_KEYS.map(key => {
              if (key === 'backspace') {
                return (
                  <button
                    key={key}
                    onClick={() => handlePinKey('backspace')}
                    className="h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 active:scale-95 transition-all shadow-sm"
                  >
                    <Delete className="h-5 w-5" />
                  </button>
                );
              }
              if (key === 'submit') {
                return (
                  <button
                    key={key}
                    onClick={handlePinSubmit}
                    disabled={pin.length !== PIN_LENGTH}
                    className="h-16 rounded-2xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-30 shadow-sm"
                  >
                    OK
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  onClick={() => handlePinKey(key)}
                  className="h-16 rounded-2xl bg-white border border-gray-200 text-gray-900 text-2xl font-semibold hover:bg-gray-100 active:scale-95 transition-all shadow-sm"
                >
                  {key}
                </button>
              );
            })}
          </div>

          <button
            onClick={resetToIdle}
            className="w-full text-center text-gray-400 hover:text-gray-600 text-sm"
          >
            ← Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── CONFIRM ──────────────────────────────────────────────────────────────
  if (step === 'confirm' && employee && punchStatus) {
    const meta = getActionMeta(punchStatus.status);
    const isClockIn = meta.action === 'clock_in';
    const isClockedIn = punchStatus.status === 'clocked_in';
    const isOnBreak = punchStatus.status === 'on_break';
    const isClockOut = meta.action === 'clock_out';
    const showPrimaryActions = !showClockOutCertification;
    const showChargeCodePicker = (isClockIn || isOnBreak) && chargeCodes.length > 0;
    const shiftRows = buildShiftRows(activeShiftPunches);
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center px-8">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div>
            <p className="text-3xl font-bold text-gray-900">{employee.firstName} {employee.lastName}</p>
            {employee.jobTitle && (
              <p className="text-gray-400 mt-1">{employee.jobTitle}</p>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-2 shadow-sm">
            <p className="text-xs uppercase tracking-widest text-gray-400">Current Status</p>
            <p className="text-2xl font-semibold text-blue-600">{meta.currentLabel}</p>
            {punchStatus.hoursToday > 0 && (
              <p className="text-gray-400 text-sm">
                {punchStatus.hoursToday.toFixed(2)} hours worked today
              </p>
            )}
          </div>

          {showChargeCodePicker && (
            <ChargeCodePicker
              chargeCodes={chargeCodes}
              value={selectedChargeCode}
              onChange={setSelectedChargeCode}
              onInteraction={restartIdleTimer}
            />
          )}

          {showPrimaryActions && (
            <div className="space-y-3">
              {isClockIn && (
                <Button
                  size="lg"
                  onClick={() => handleConfirm('clock_in')}
                  className="w-full h-16 text-xl font-bold bg-blue-600 hover:bg-blue-700 rounded-2xl text-white gap-3"
                >
                  <LogIn className="h-6 w-6" />
                  Clock In
                </Button>
              )}

              {isClockedIn && (
                <>
                  <Button
                    size="lg"
                    onClick={() => handleConfirm('break_start')}
                    className="w-full h-16 text-xl font-bold bg-amber-600 hover:bg-amber-700 rounded-2xl text-white gap-3"
                  >
                    <Coffee className="h-6 w-6" />
                    Clock Out for Break
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleClockOutIntent}
                    className="w-full h-16 text-xl font-bold rounded-2xl border-red-300 text-red-700 hover:bg-red-50 gap-3"
                  >
                    <LogOut className="h-6 w-6" />
                    Clock Out
                  </Button>
                </>
              )}

              {isOnBreak && (
                <Button
                  size="lg"
                  onClick={() => handleConfirm('break_end')}
                  className="w-full h-16 text-xl font-bold bg-amber-600 hover:bg-amber-700 rounded-2xl text-white gap-3"
                >
                  <Play className="h-6 w-6" />
                  Clock In from Break
                </Button>
              )}
            </div>
          )}

          {isClockOut && showClockOutCertification && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 px-6">
              <div className="w-full max-w-lg rounded-3xl bg-white p-6 text-left shadow-2xl">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Review Today</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900">{formatKioskHours(punchStatus.hoursToday)}</p>
                  <p className="mt-1 text-sm text-gray-500">Worked today before this clock-out</p>
                </div>

                <div className="mt-5 max-h-64 space-y-2 overflow-y-auto">
                  {certificationReviewLoading ? (
                    <div className="rounded-2xl border border-gray-200 p-4 text-center text-sm text-gray-500">Loading today&apos;s punches...</div>
                  ) : shiftRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">No punch breakdown available.</div>
                  ) : (
                    shiftRows.map((row) => {
                      const startMs = row.startAt ? new Date(row.startAt).getTime() : null;
                      const endMs = row.endAt ? new Date(row.endAt).getTime() : (row.isOpen ? now.getTime() : null);
                      const rowHours = startMs && endMs && endMs > startMs ? (endMs - startMs) / 3_600_000 : 0;
                      return (
                        <div key={row.sessionId} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                              {row.costCode && <p className="mt-0.5 text-xs text-gray-500">CC {row.costCode}</p>}
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">{formatKioskHours(rowHours)}</p>
                              <p className="text-xs text-gray-500">
                                {formatKioskTime(row.startAt)} - {formatKioskTime(row.endAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <label className="mt-5 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <input
                    type="checkbox"
                    checked={dailyCertificationConfirmed}
                    onChange={(event) => {
                      setDailyCertificationConfirmed(event.target.checked);
                      restartIdleTimer();
                    }}
                    className="mt-1 h-5 w-5 rounded border-blue-300 text-blue-600"
                  />
                  <span className="text-sm text-blue-900">
                    I certify that today&apos;s recorded time is complete, accurate, and represents work I actually performed.
                  </span>
                </label>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowClockOutCertification(false);
                      setDailyCertificationConfirmed(false);
                      restartIdleTimer();
                    }}
                    className="h-14 rounded-2xl"
                  >
                    Back
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => handleConfirm('clock_out')}
                    disabled={!dailyCertificationConfirmed}
                    className="h-14 rounded-2xl bg-blue-600 text-lg font-bold text-white hover:bg-blue-700"
                  >
                    Clock Out
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={openCorrectionForm}
            className="w-full rounded-2xl border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            Request punch correction
          </Button>

          <button
            onClick={resetToIdle}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ← Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === 'correction' && employee) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center px-8">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold">Request Punch Correction</p>
            <p className="text-sm text-gray-500">{employee.firstName} {employee.lastName}</p>
          </div>

          <div className="rounded-2xl border bg-white p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label className="block text-xs uppercase tracking-widest text-gray-400">Active Shift Punches</label>
                <p className="text-xs text-gray-500">Tap a punch to edit it.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={startMissingPunchCorrection}>
                Add
              </Button>
            </div>

            <div className="space-y-2 max-h-44 overflow-y-auto">
              {correctionLoading ? (
                <div className="rounded-xl border border-gray-200 p-3 text-sm text-gray-500">Loading punches...</div>
              ) : activeShiftPunches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-3 text-sm text-gray-500">No punches found for this active shift.</div>
              ) : (
                activeShiftPunches.map((punch) => {
                  const selected = correctionForm.requestType === 'edit_session' && correctionForm.punchLedgerId === String(punch.sessionId) && correctionForm.selectedPunchType === punch.type;
                  return (
                    <button
                      key={`${punch.sessionId}-${punch.type}-${punch.punchedAt}`}
                      type="button"
                      onClick={() => selectCorrectionPunch(punch)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold capitalize">{punch.type.replace(/_/g, ' ')}</span>
                        <span className="text-sm font-medium text-gray-700">
                          {new Date(punch.punchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {punch.costCode && <p className="text-xs text-gray-500 mt-1">CC {punch.costCode}</p>}
                    </button>
                  );
                })
              )}
            </div>

            <label className="block text-xs uppercase tracking-widest text-gray-400">
              {correctionForm.requestType === 'add_session' ? 'Missing Punch Type' : 'Correct Punch Type'}
            </label>
            <select
              value={correctionForm.selectedPunchType}
              onChange={(event) => {
                setCorrectionForm((prev) => ({ ...prev, selectedPunchType: event.target.value as PunchEventType }));
                restartIdleTimer();
              }}
              className="w-full rounded-xl border border-gray-200 p-3"
            >
              <option value="clock_in">Clock in</option>
              <option value="break_start">Meal out</option>
              {correctionForm.requestType === 'edit_session' && (
                <>
                  <option value="clock_out">Clock out</option>
                  <option value="break_end">Meal in</option>
                </>
              )}
            </select>

            <label className="block text-xs uppercase tracking-widest text-gray-400">Correct Clock In</label>
            <input
              type="datetime-local"
              value={correctionForm.clockIn}
              onChange={(event) => {
                setCorrectionForm((prev) => ({ ...prev, clockIn: event.target.value }));
                restartIdleTimer();
              }}
              className="w-full rounded-xl border border-gray-200 p-3"
            />

            {correctionForm.requestType === 'edit_session' && (
              <>
                <label className="block text-xs uppercase tracking-widest text-gray-400">Correct Clock Out</label>
                <input
                  type="datetime-local"
                  value={correctionForm.clockOut}
                  onChange={(event) => {
                    setCorrectionForm((prev) => ({ ...prev, clockOut: event.target.value }));
                    restartIdleTimer();
                  }}
                  className="w-full rounded-xl border border-gray-200 p-3"
                />
              </>
            )}

            <label className="block text-xs uppercase tracking-widest text-gray-400">Reason</label>
            <textarea
              value={correctionForm.reason}
              onChange={(event) => {
                setCorrectionForm((prev) => ({ ...prev, reason: event.target.value }));
                restartIdleTimer();
              }}
              rows={3}
              placeholder="Explain what needs to be fixed..."
              className="w-full rounded-xl border border-gray-200 p-3"
            />
          </div>

          <Button
            onClick={submitCorrectionRequest}
            disabled={correctionForm.reason.trim().length < 5 || (correctionForm.requestType === 'add_session' && !correctionForm.clockIn) || (correctionForm.requestType === 'edit_session' && !correctionForm.punchLedgerId)}
            className="w-full h-14 rounded-2xl"
          >
            Submit for Approval
          </Button>
          <button onClick={() => setStep('confirm')} className="w-full text-center text-gray-400 hover:text-gray-600 text-sm">
            Back
          </button>
        </div>
      </div>
    );
  }

  return null;
}
