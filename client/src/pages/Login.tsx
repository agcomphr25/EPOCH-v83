import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getDashboardRoute } from '@/config/dashboardMapping';
import { Lock, User } from 'lucide-react';
import { isProductionEnvironment, isAuthenticated } from '@/lib/env';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // If already authenticated, redirect to their dashboard
    if (isAuthenticated()) {
      const currentUser = localStorage.getItem('currentUser');
      if (currentUser) {
        const dashboardRoute = getDashboardRoute(currentUser);
        console.log('🔒 Already authenticated - redirecting to dashboard:', dashboardRoute);
        setLocation(dashboardRoute);
      }
    }
  }, [setLocation]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!username || !password) {
        toast({
          title: 'Error',
          description: 'Please enter both username and password',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      // Call backend authentication API
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      console.log('Login response status:', response.status);
      console.log('Login response ok:', response.ok);
      
      const data = await response.json();
      console.log('Login response data:', data);

      if (!response.ok || !data.success) {
        console.error('Login failed - response not ok or data.success is false');
        toast({
          title: 'Login Failed',
          description: data.error || 'Invalid username or password',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      // Store only user data (session is in HTTP-only cookie)
      localStorage.setItem('currentUser', data.user.username);
      localStorage.setItem('userData', JSON.stringify(data.user));

      // Get the user's dashboard route
      const dashboardRoute = getDashboardRoute(data.user.username);

      toast({
        title: 'Login Successful',
        description: `Welcome back, ${data.user.username}!`,
      });

      // Redirect to personalized dashboard
      console.log('Redirecting to dashboard:', dashboardRoute);
      setLocation(dashboardRoute);
    } catch (error) {
      console.error('Login error caught:', error);
      toast({
        title: 'Login Failed',
        description: 'An error occurred during login',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md" data-testid="card-login">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">EPOCH v8</CardTitle>
          <CardDescription className="text-center">
            Manufacturing ERP System
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10"
                  data-testid="input-username"
                  autoComplete="username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  data-testid="input-password"
                  autoComplete="current-password"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-gray-600">
            <p>Enter your username to access your personalized dashboard</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
