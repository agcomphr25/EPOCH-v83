import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { EmployeeLayupSettings } from '../../../shared/schema';

export default function useEmployeeSettings() {
  const [employees, setEmployees] = useState<(EmployeeLayupSettings & { name: string })[]>([]);
  const [loading, setLoading] = useState(true);

  // Debug state changes
  useEffect(() => {
    console.log('🔧 useEmployeeSettings: Employees state changed:', employees);
  }, [employees]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      console.log('🔧 useEmployeeSettings: Fetching employees from /api/layup-employee-settings...');
      const data = await apiRequest('/api/layup-employee-settings');
      console.log('🔧 useEmployeeSettings: Received employees data:', data);
      console.log('🔧 useEmployeeSettings: Data type:', typeof data, 'Array?', Array.isArray(data));
      setEmployees(data);
      console.log('🔧 useEmployeeSettings: Set employees state to:', data);
    } catch (error) {
      console.error('🔧 useEmployeeSettings: Failed to fetch employees:', error);
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
          body: { ...employee, isActive, updatedAt: new Date() },
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