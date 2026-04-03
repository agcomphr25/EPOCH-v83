import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import EmployeePortal from '@/components/EmployeePortal';

interface CurrentUser {
  id: number;
  username: string;
  role: string;
  employeeId: number | null;
}

interface Employee {
  id: number;
  employeeCode: string;
  name: string;
}

function fetchWithToken(url: string) {
  const token =
    localStorage.getItem('sessionToken') ||
    localStorage.getItem('jwtToken');
  return fetch(url, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
      <Card className="max-w-md border-red-200 bg-red-50">
        <CardContent className="pt-6 text-center">
          <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-red-700 mb-2">
            Access Unavailable
          </h2>
          <p className="text-red-600">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EmployeePortalPage() {
  const {
    data: currentUser,
    isLoading: userLoading,
    error: userError,
  } = useQuery<CurrentUser>({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const response = await fetchWithToken('/api/auth/session');
      if (!response.ok) throw new Error('Not authenticated');
      return response.json();
    },
  });

  const {
    data: employee,
    isLoading: employeeLoading,
    error: employeeError,
  } = useQuery<Employee>({
    queryKey: ['/api/employees', currentUser?.employeeId],
    queryFn: async () => {
      const response = await fetchWithToken(
        `/api/employees/${currentUser!.employeeId}`
      );
      if (!response.ok) throw new Error('Failed to load employee record');
      return response.json();
    },
    enabled: !!currentUser?.employeeId,
  });

  if (userLoading || (currentUser?.employeeId && employeeLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (userError) {
    return (
      <ErrorCard message="Your session could not be verified. Please log in again." />
    );
  }

  if (!currentUser?.employeeId) {
    return (
      <ErrorCard message="Your account is not linked to an employee record. Please contact HR or an administrator." />
    );
  }

  if (employeeError || !employee?.employeeCode) {
    return (
      <ErrorCard message="We could not load your employee record. Please contact HR or an administrator for assistance." />
    );
  }

  return <EmployeePortal employeeId={employee.employeeCode} />;
}
