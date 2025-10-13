import { useState, useEffect } from 'react';
import { fetchRecords } from '../utils/nonconformanceUtils';

export default function useNonconformance(filters) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    fetchRecords(filters)
      .then(data => {
        setRecords(data || []);
      })
      .catch(err => {
        console.error('Error fetching nonconformance records:', err);
        setError(err.message || 'Failed to fetch records');
        setRecords([]);
      })
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);

  return { records, loading, error, setRecords };
}