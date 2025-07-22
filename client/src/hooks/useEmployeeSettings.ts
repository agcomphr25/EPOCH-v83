import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { EmployeeLayupSettings } from '../../../shared/schema';

export default function useEmployeeSettings() {
  const [employees, setEmployees] = useState<(EmployeeLayupSettings & { name: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/api/employees/layup-settings');
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
        const newEmployee = await apiRequest('/api/employees/layup-settings', {
          method: 'POST',
          body: updatedEmp,
        });
        setEmployees(es => [...es, newEmployee]);
      }
    } catch (error) {
      console.error('Failed to save employee settings:', error);
    }
  };

  const deleteEmployee = async (employeeId: string) => {
    try {
      await apiRequest(`/api/employees/layup-settings/${employeeId}`, {
        method: 'DELETE',
      });
      setEmployees(employees.filter(e => e.employeeId !== employeeId));
    } catch (error) {
      console.error('Failed to delete employee:', error);
    }
  };

  const toggleEmployeeStatus = async (employeeId: string, isActive: boolean) => {
    try {
      const employee = employees.find(e => e.employeeId === employeeId);
      if (employee) {
        await apiRequest(`/api/employees/layup-settings/${employeeId}`, {
          method: 'PUT',
          body: { ...employee, isActive },
        });
        setEmployees(es =>
          es.map(e => (e.employeeId === employeeId ? { ...e, isActive } : e))
        );
      }
    } catch (error) {
      console.error('Failed to toggle employee status:', error);
    }
  };

  return { employees, saveEmployee, deleteEmployee, toggleEmployeeStatus, loading, refetch: fetchEmployees };
}