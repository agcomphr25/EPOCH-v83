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

function ErrorCard({ title = 'Access Unavailable', message }: { title?: string; message: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
      <Card className="max-w-md border-red-200 bg-red-50">
        <CardContent className="pt-6 text-center">
          <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-red-700 mb-2">
            {title}
          </h2>
          <p className="text-red-600">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

interface ApiError extends Error {
  status?: number;
}

export default function EmployeePortalPage() {
  const {
    data: currentUser,
    isLoading: userLoading,
    error: userError,
  } = useQuery<CurrentUser, ApiError>({
    queryKey: ['/api/auth/session'],
    refetchInterval: 5 * 60 * 1000, // re-check session every 5 minutes
    refetchOnWindowFocus: true,      // re-check when the tab regains focus
    refetchIntervalInBackground: false, // only poll while the tab is visible
  });

  const {
    data: employee,
    isLoading: employeeLoading,
    error: employeeError,
  } = useQuery<Employee>({
    queryKey: ['/api/employees', currentUser?.employeeId],
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
    const isExpired = userError.status === 401;
    return (
      <ErrorCard
        title={isExpired ? 'Session Expired' : 'Access Unavailable'}
        message={
          isExpired
            ? 'Your session has expired. Please log in again to continue.'
            : 'Your session could not be verified. Please log in again.'
        }
      />
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
