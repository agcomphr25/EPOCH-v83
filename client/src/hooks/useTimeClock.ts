import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { performMutation } from '@/offline/performMutation';

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

export default function useTimeClock(employeeId: string): UseTimeClockReturn {
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [clockOutTime, setClockOutTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get<TimeClockStatus>(
        `/api/timeclock?employeeId=${employeeId}`
      );
      const { status, clockIn, clockOut } = res.data;
      setClockedIn(status === 'IN');
      setClockInTime(clockIn || null);
      setClockOutTime(clockOut || null);
    } catch (err) {
      console.error('Failed to fetch timeclock status', err);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const clockIn = async () => {
    const timestamp = new Date().toISOString();
    const result = await performMutation('CLOCK_IN', { employeeId, timestamp }, {
      onOfflineOptimistic: () => {
        setClockedIn(true);
        setClockInTime(timestamp);
        setClockOutTime(null);
      },
    });
    if (!result?.queued) {
      await refreshStatus();
    }
  };

  const clockOut = async () => {
    const timestamp = new Date().toISOString();
    const result = await performMutation('CLOCK_OUT', { employeeId, timestamp }, {
      onOfflineOptimistic: () => {
        setClockedIn(false);
        setClockOutTime(timestamp);
      },
    });
    if (!result?.queued) {
      await refreshStatus();
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
