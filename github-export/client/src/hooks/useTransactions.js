import { useState, useEffect, useCallback } from 'react';
import { fetchAPTransactions, fetchARTransactions, fetchCOGS } from '../utils/financeUtils';
import toast from 'react-hot-toast';

/**
 * Hook to fetch Accounts Payable transactions
 * @param {Object} dateRange - Date range object with dateFrom and dateTo
 * @returns {Object} { data, loading, error, refresh }
 */
export function useAPTransactions(dateRange) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!dateRange.dateFrom || !dateRange.dateTo) return;
    
    try {
      setLoading(true);
      setError(null);
      const transactions = await fetchAPTransactions(dateRange);
      setData(transactions);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to fetch AP transactions');
    } finally {
      setLoading(false);
    }
  }, [dateRange.dateFrom, dateRange.dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData
  };
}

/**
 * Hook to fetch Accounts Receivable transactions
 * @param {Object} dateRange - Date range object with dateFrom and dateTo
 * @returns {Object} { data, loading, error, refresh }
 */
export function useARTransactions(dateRange) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!dateRange.dateFrom || !dateRange.dateTo) return;
    
    try {
      setLoading(true);
      setError(null);
      const transactions = await fetchARTransactions(dateRange);
      setData(transactions);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to fetch AR transactions');
    } finally {
      setLoading(false);
    }
  }, [dateRange.dateFrom, dateRange.dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData
  };
}

/**
 * Hook to fetch Cost of Goods Sold (COGS) data
 * @param {Object} dateRange - Date range object with dateFrom and dateTo
 * @returns {Object} { data, loading, error, refresh }
 */
export function useCOGS(dateRange) {
  const [data, setData] = useState({ standardCost: 0, actualCost: 0, breakdown: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!dateRange.dateFrom || !dateRange.dateTo) return;
    
    try {
      setLoading(true);
      setError(null);
      const cogsData = await fetchCOGS(dateRange);
      setData(cogsData);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to fetch COGS data');
    } finally {
      setLoading(false);
    }
  }, [dateRange.dateFrom, dateRange.dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData
  };
}