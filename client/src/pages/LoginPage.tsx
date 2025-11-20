import { useState } from 'react';
import { useLocation } from 'wouter';
import { Eye, EyeOff, Scan } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getDashboardRoute } from '@/config/dashboardMapping';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [badgeCode, setBadgeCode] = useState('');
  const [isBadgeLoading, setIsBadgeLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      toast({
        title: 'Error',
        description: 'Please enter both username and password',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Important for cookies
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store session token if provided (for backward compatibility)
        if (data.sessionToken) {
          localStorage.setItem('sessionToken', data.sessionToken);
        }

        toast({
          title: 'Success',
          description: 'Login successful!',
        });

        // Redirect to user's personalized dashboard
        const dashboardRoute = getDashboardRoute(username);
        setLocation(dashboardRoute);
      } else {
        toast({
          title: 'Login Failed',
          description: data.error || 'Invalid username or password',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: 'Error',
        description: 'An error occurred during login. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBadgeLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!badgeCode.trim()) {
      toast({
        title: 'Error',
        description: 'Please scan or enter your employee badge code',
        variant: 'destructive',
      });
      return;
    }

    setIsBadgeLoading(true);

    try {
      const response = await fetch('/api/auth/badge-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ employeeCode: badgeCode.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.sessionToken) {
          localStorage.setItem('sessionToken', data.sessionToken);
        }

        toast({
          title: 'Welcome!',
          description: `Logged in as ${data.employee?.name || badgeCode}`,
        });

        // Redirect to assigned task page (from badge configuration) or default dashboard
        const redirectUrl = data.redirectUrl || getDashboardRoute(data.user.username);
        setLocation(redirectUrl);
      } else {
        toast({
          title: 'Badge Login Failed',
          description: data.error || 'Invalid employee badge code',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Badge login error:', error);
      toast({
        title: 'Error',
        description: 'An error occurred during badge login. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsBadgeLoading(false);
      setBadgeCode('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="text-4xl font-bold text-blue-600">EPOCH</div>
          </div>
          <CardTitle className="text-2xl text-center">Welcome Back</CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access the ERP system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                data-testid="input-username"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-password"
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  data-testid="button-toggle-password"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
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

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-300 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
                  Or continue with
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => window.location.href = '/api/auth/microsoft/login'}
              disabled={isLoading}
              data-testid="button-microsoft-login"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 23 23" fill="currentColor">
                <path d="M0 0h11v11H0z" fill="#f35325" />
                <path d="M12 0h11v11H12z" fill="#81bc06" />
                <path d="M0 12h11v11H0z" fill="#05a6f0" />
                <path d="M12 12h11v11H12z" fill="#ffba08" />
              </svg>
              Sign in with Microsoft
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-300 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
                  Employee Badge Login
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="badgeCode" className="flex items-center gap-2">
                <Scan className="w-4 h-4" />
                Badge Code
              </Label>
              <div className="flex gap-2">
                <Input
                  id="badgeCode"
                  type="text"
                  placeholder="Scan or type badge code..."
                  value={badgeCode}
                  onChange={(e) => setBadgeCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && badgeCode.trim()) {
                      handleBadgeLogin();
                    }
                  }}
                  disabled={isBadgeLoading}
                  data-testid="input-badge-code"
                  autoComplete="off"
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={() => handleBadgeLogin()}
                  disabled={isBadgeLoading || !badgeCode.trim()}
                  data-testid="button-badge-login"
                >
                  {isBadgeLoading ? 'Loading...' : 'Scan'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Quick login for employees with badge codes (e.g., EMP001)
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
