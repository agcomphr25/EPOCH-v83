import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ShieldX, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getDashboardRoute } from '@/config/dashboardMapping';

interface UserData {
  id: number;
  username: string;
  role: string;
}

export default function AccessDenied() {
  const [, setLocation] = useLocation();

  const { data: currentUser } = useQuery<UserData | null>({
    queryKey: ['currentUser'],
    staleTime: 5 * 60 * 1000,
  });

  const handleGoHome = () => {
    if (currentUser?.username) {
      const dashboardRoute = getDashboardRoute(currentUser.username);
      setLocation(dashboardRoute || '/');
    } else {
      setLocation('/');
    }
  };

  const handleGoBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4" data-testid="access-denied-page">
      <Card className="max-w-md w-full text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <ShieldX className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-600" data-testid="text-access-denied-title">
            Access Denied
          </CardTitle>
          <CardDescription className="text-base mt-2" data-testid="text-access-denied-description">
            You don't have permission to access this page. If you believe this is an error, please contact your administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentUser && (
            <p className="text-sm text-gray-500" data-testid="text-logged-in-as">
              Logged in as: <span className="font-medium">{currentUser.username}</span>
              {currentUser.role && (
                <span className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                  {currentUser.role}
                </span>
              )}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              onClick={handleGoBack}
              className="flex items-center gap-2"
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
            <Button
              onClick={handleGoHome}
              className="flex items-center gap-2"
              data-testid="button-go-home"
            >
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
