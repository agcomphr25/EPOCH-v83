import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { EmployeeLayupSettings } from '../../../shared/schema';

export default function useEmployeeSettings() {
  const [employees, setEmployees] = useState<(EmployeeLayupSettings & { name: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/api/employees/layup-settings');
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error('Failed to fetch employee layup settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const saveEmployee = async (updatedEmp: Partial<EmployeeLayupSettings> & { employeeId: string }) => {
    try {
      const response = await apiRequest(`/api/employees/layup-settings/${updatedEmp.employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedEmp),
      });
      
      if (response.ok) {
        setEmployees(es =>
          es.map(e => (e.employeeId === updatedEmp.employeeId ? { ...e, ...updatedEmp } : e))
        );
      }
    } catch (error) {
      console.error('Failed to update employee settings:', error);
    }
  };

  return { employees, saveEmployee, loading, refetch: fetchEmployees };
}