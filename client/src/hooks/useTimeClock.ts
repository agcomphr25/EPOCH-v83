import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface TimeClockStatus {
  status: 'IN' | 'OUT';
  clockIn: string | null;
  clockOut: string | null;
}

interface UseTimeClockReturn {
  clockedIn: boolean;
  clockInTime: string | null;
  clockOutTime: string | null;
  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;
  loading: boolean;
}

export default function useTimeClock(_employeeId: string): UseTimeClockReturn {
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [clockOutTime, setClockOutTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/timekeeping/status') as TimeClockStatus;
      setClockedIn(data.status === 'IN');
      setClockInTime(data.clockIn);
      setClockOutTime(data.clockOut);
    } catch (err) {
      console.error('[useTimeClock] Failed to fetch status', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const clockIn = async () => {
    const timestamp = new Date().toISOString();
    setClockedIn(true);
    setClockInTime(timestamp);
    setClockOutTime(null);
    try {
      await apiRequest('/api/timekeeping/punch', {
        method: 'POST',
        body: JSON.stringify({ type: 'clock_in' }),
      });
      await refreshStatus();
    } catch (err) {
      console.error('[useTimeClock] Clock-in failed', err);
      await refreshStatus();
      throw err;
    }
  };

  const clockOut = async () => {
    const timestamp = new Date().toISOString();
    setClockedIn(false);
    setClockOutTime(timestamp);
    try {
      await apiRequest('/api/timekeeping/punch', {
        method: 'POST',
        body: JSON.stringify({ type: 'clock_out' }),
      });
      await refreshStatus();
    } catch (err) {
      console.error('[useTimeClock] Clock-out failed', err);
      await refreshStatus();
      throw err;
    }
  };

  return {
    clockedIn,
    clockInTime,
    clockOutTime,
    clockIn,
    clockOut,
    loading,
  };
}
