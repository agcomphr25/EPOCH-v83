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
      // Check if employee exists
      const existingEmployee = employees.find(e => e.employeeId === updatedEmp.employeeId);
      
      if (existingEmployee) {
        // Update existing employee
        const response = await apiRequest(`/api/employees/layup-settings/${updatedEmp.employeeId}`, {
          method: 'PUT',
          body: updatedEmp,
        });
        
        setEmployees(es =>
          es.map(e => (e.employeeId === updatedEmp.employeeId ? { ...e, ...updatedEmp } : e))
        );
      } else {
        // Create new employee
        const response = await apiRequest('/api/employees/layup-settings', {
          method: 'POST',
          body: updatedEmp,
        });
        
        const newEmployee = await response;
        setEmployees(es => [...es, newEmployee]);
      }
    } catch (error) {
      console.error('Failed to save employee settings:', error);
    }
  };

  return { employees, saveEmployee, loading, refetch: fetchEmployees };
}