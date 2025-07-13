import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

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

/**
 * useTimeClock(employeeId: string)
 * - Fetches current clock status from GET /api/timeclock?employeeId={employeeId}
 * - Exposes: { clockedIn, clockInTime, clockOutTime, clockIn(), clockOut() }
 */
export default function useTimeClock(employeeId: string): UseTimeClockReturn {
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [clockOutTime, setClockOutTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch current status
  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get<TimeClockStatus>(`/api/timeclock?employeeId=${employeeId}`);
      const { status, clockIn, clockOut } = res.data;
      console.log('TimeClock status response:', { status, clockIn, clockOut });
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

  // Clock In
  const clockIn = async () => {
    try {
      await axios.post('/api/timeclock', {
        employeeId,
        action: 'IN',
        timestamp: new Date().toISOString(),
      });
      await refreshStatus(); // refresh after action
    } catch (err) {
      throw err;
    }
  };

  // Clock Out
  const clockOut = async () => {
    try {
      await axios.post('/api/timeclock', {
        employeeId,
        action: 'OUT',
        timestamp: new Date().toISOString(),
      });
      await refreshStatus(); // refresh after action
    } catch (err) {
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