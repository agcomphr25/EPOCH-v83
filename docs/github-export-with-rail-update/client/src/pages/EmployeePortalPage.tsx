import React from 'react';
import EmployeePortal from '@/components/EmployeePortal';

export default function EmployeePortalPage() {
  // For now, using a hardcoded employee ID
  // In a real app, this would come from authentication context
  const employeeId = "EMP001";
  
  return <EmployeePortal employeeId={employeeId} />;
}