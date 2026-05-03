import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

export type PunchType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';

interface TimeClockStatus {
  status: PunchType | null;
  lastPunch: { punchType: PunchType; punchTime: string } | null;
  clockIn: string | null;
  clockOut: string | null;
  activeJobId: number | null;
  activeJobLabel: string | null;
  activeChargeCode: string | null;
}

export interface UseTimeClockReturn {
  clockedIn: boolean;
  onBreak: boolean;
  status: PunchType | null;
  clockInTime: string | null;
  clockOutTime: string | null;
  lastPunchTime: string | null;
  activeJobId: number | null;
  activeJobLabel: string | null;
  activeChargeCode: string | null;
  clockIn: (jobId: string) => Promise<void>;
  clockOut: () => Promise<void>;
  startBreak: () => Promise<void>;
  endBreak: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  loading: boolean;
}

export default function useTimeClock(_employeeId: string): UseTimeClockReturn {
  const [status, setStatus] = useState<PunchType | null>(null);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [clockOutTime, setClockOutTime] = useState<string | null>(null);
  const [lastPunchTime, setLastPunchTime] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [activeJobLabel, setActiveJobLabel] = useState<string | null>(null);
  const [activeChargeCode, setActiveChargeCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/timekeeping/status') as TimeClockStatus;
      setStatus(data.status);
      setClockInTime(data.clockIn);
      setClockOutTime(data.clockOut);
      setLastPunchTime(data.lastPunch?.punchTime ?? null);
      setActiveJobId(data.activeJobId ?? null);
      setActiveJobLabel(data.activeJobLabel ?? null);
      setActiveChargeCode(data.activeChargeCode ?? null);
    } catch (err) {
      console.error('[useTimeClock] Failed to fetch status', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const punch = async (type: PunchType, jobId?: string) => {
    await apiRequest('/api/timekeeping/punch', {
      method: 'POST',
      body: JSON.stringify({ type, ...(jobId ? { jobId } : {}) }),
    });
    await refreshStatus();
  };

  const clockIn = async (jobId: string) => {
    const ts = new Date().toISOString();
    setStatus('clock_in');
    setClockInTime(ts);
    setClockOutTime(null);
    try {
      await punch('clock_in', jobId);
    } catch (err) {
      console.error('[useTimeClock] Clock-in failed', err);
      await refreshStatus();
      throw err;
    }
  };

  const clockOut = async () => {
    const ts = new Date().toISOString();
    setStatus('clock_out');
    setClockOutTime(ts);
    setActiveJobId(null);
    setActiveJobLabel(null);
    setActiveChargeCode(null);
    try {
      await punch('clock_out');
    } catch (err) {
      console.error('[useTimeClock] Clock-out failed', err);
      await refreshStatus();
      throw err;
    }
  };

  const startBreak = async () => {
    setStatus('break_start');
    try {
      await punch('break_start');
    } catch (err) {
      console.error('[useTimeClock] Break start failed', err);
      await refreshStatus();
      throw err;
    }
  };

  const endBreak = async () => {
    setStatus('break_end');
    try {
      await punch('break_end');
    } catch (err) {
      console.error('[useTimeClock] Break end failed', err);
      await refreshStatus();
      throw err;
    }
  };

  const clockedIn = status === 'clock_in' || status === 'break_start' || status === 'break_end';
  const onBreak = status === 'break_start';

  return {
    clockedIn,
    onBreak,
    status,
    clockInTime,
    clockOutTime,
    lastPunchTime,
    activeJobId,
    activeJobLabel,
    activeChargeCode,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    refreshStatus,
    loading,
  };
}
