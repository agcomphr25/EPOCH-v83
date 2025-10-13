import { useState, useEffect } from 'react';
import { fetchAnalytics } from '../utils/nonconformanceUtils';

export default function useNonconformanceAnalytics(filters) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    fetchAnalytics(filters)
      .then(analyticsData => {
        setData(analyticsData);
      })
      .catch(err => {
        console.error('Error fetching analytics:', err);
        setError(err.message || 'Failed to fetch analytics');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);

  return { data, loading, error };
}