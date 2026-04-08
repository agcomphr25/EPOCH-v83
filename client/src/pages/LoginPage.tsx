import { useState } from 'react';
import { useLocation } from 'wouter';
import { Eye, EyeOff, Scan, Settings, LogIn, Timer, Clock, CreditCard, ArrowLeft } from 'lucide-react';

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
import { queryClient } from '@/lib/queryClient';
import TimeClockKiosk from '@/components/TimeClockKiosk';

type LoginMode = 'regular' | 'p2-traveler' | 'timer-station' | 'badge' | 'time-clock';

const LOGIN_MODES: { key: LoginMode; label: string; icon: typeof LogIn; description: string; color: string }[] = [
  { key: 'regular', label: 'Login', icon: LogIn, description: 'Sign in with your username and password', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400' },
  { key: 'p2-traveler', label: 'P2 Traveler', icon: Scan, description: 'Production tracking with AS9100 traceability', color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/40 dark:text-purple-400' },
  { key: 'timer-station', label: 'Timer Station', icon: Timer, description: 'Production timers for tracking cycle times', color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-400' },
  { key: 'badge', label: 'Badge Login', icon: CreditCard, description: 'Scan your employee badge to log in', color: 'text-green-600 bg-green-100 dark:bg-green-900/40 dark:text-green-400' },
  { key: 'time-clock', label: 'Time Clock', icon: Clock, description: 'Employee clock in and clock out', color: 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400' },
];

export default function LoginPage() {
  const [activeMode, setActiveMode] = useState<LoginMode | null>(null);
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
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.sessionToken) {
          localStorage.setItem('sessionToken', data.sessionToken);
        }
        
        localStorage.setItem('dev_username', username.toLowerCase());

        toast({
          title: 'Success',
          description: 'Login successful!',
        });
        
        queryClient.setQueryData(['currentUser'], data.user);

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

      if (!response.ok) {
        toast({
          title: 'Badge Login Failed',
          description: data.error || 'Invalid employee badge code',
          variant: 'destructive',
        });
        return;
      }

      if (data.sessionToken) {
        localStorage.setItem('sessionToken', data.sessionToken);
      }

      const sessionResponse = await fetch('/api/auth/session', {
        credentials: 'include',
      });

      if (!sessionResponse.ok) {
        console.error('Badge login: Session validation failed after successful login');
        toast({
          title: 'Login Error',
          description: 'Session could not be validated. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      const sessionData = await sessionResponse.json();

      if (sessionData.username) {
        localStorage.setItem('dev_username', sessionData.username.toLowerCase());
      }

      toast({
        title: 'Welcome!',
        description: `Logged in as ${data.employee?.name || badgeCode}`,
      });
      
      queryClient.setQueryData(['currentUser'], sessionData);

      const redirectUrl = data.redirectUrl || getDashboardRoute(sessionData.username);
      setLocation(redirectUrl);
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

  const renderRegularLogin = () => (
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
          autoFocus
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
        className="w-full h-12 text-base"
        disabled={isLoading}
        data-testid="button-login"
      >
        {isLoading ? 'Logging in...' : 'Login'}
      </Button>
    </form>
  );

  const renderP2Traveler = () => (
    <div className="space-y-4">
      <Button
        type="button"
        className="w-full h-14 text-lg"
        onClick={() => setLocation('/p2-traveler')}
        data-testid="button-p2-traveler"
      >
        <Scan className="w-5 h-5 mr-2" />
        Open P2 Traveler
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="w-full h-12"
        onClick={() => setLocation('/p2-control-center')}
        data-testid="button-p2-control-center"
      >
        <Settings className="w-4 h-4 mr-2" />
        P2 Control Center
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Control Center requires login credentials
      </p>
    </div>
  );

  const renderTimerStation = () => (
    <div className="space-y-4">
      <Button
        type="button"
        className="w-full h-14 text-lg"
        onClick={() => setLocation('/app/production/stations')}
        data-testid="button-timer-station"
      >
        <Timer className="w-5 h-5 mr-2" />
        Open Timer Station
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full h-12"
        onClick={() => setLocation('/app/production/timer-history')}
      >
        <Clock className="w-4 h-4 mr-2" />
        Timer History
      </Button>
    </div>
  );

  const renderBadgeLogin = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="badgeCode" className="flex items-center gap-2">
          <Scan className="w-4 h-4" />
          Badge Code
        </Label>
        <div className="flex gap-2">
          <Input
            id="badgeCode"
            type="password"
            placeholder="Scan badge..."
            value={badgeCode}
            onChange={(e) => setBadgeCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && badgeCode.trim()) {
                handleBadgeLogin();
              }
            }}
            disabled={isBadgeLoading}
            data-testid="input-badge-code"
            autoComplete="new-password"
            autoFocus
            className="flex-1"
          />
          <Button
            type="button"
            onClick={() => handleBadgeLogin()}
            disabled={isBadgeLoading || !badgeCode.trim()}
            data-testid="button-badge-login"
            className="h-10"
          >
            {isBadgeLoading ? 'Loading...' : 'Scan'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Scan your employee badge or enter your code
        </p>
      </div>
    </div>
  );

  const renderTimeClock = () => <TimeClockKiosk />;

  const renderContent = () => {
    switch (activeMode) {
      case 'regular':
        return renderRegularLogin();
      case 'p2-traveler':
        return renderP2Traveler();
      case 'timer-station':
        return renderTimerStation();
      case 'badge':
        return renderBadgeLogin();
      case 'time-clock':
        return renderTimeClock();
      default:
        return null;
    }
  };

  if (activeMode === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
        <div className="text-center mb-8">
          <div className="text-5xl font-bold text-blue-600 mb-2">EPOCH</div>
          <p className="text-muted-foreground text-lg">Select a station to get started</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
          {LOGIN_MODES.map((mode) => {
            const Icon = mode.icon;
            const colorClasses = mode.color.split(' ');
            const textColor = colorClasses[0];
            const bgColor = colorClasses.slice(1).join(' ');
            return (
              <Card
                key={mode.key}
                onClick={() => setActiveMode(mode.key)}
                className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] border-2 border-transparent hover:border-blue-200 dark:hover:border-blue-800"
                data-testid={`shelf-${mode.key}`}
              >
                <CardContent className="flex flex-col items-center text-center gap-3 p-6">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${bgColor}`}>
                    <Icon className={`w-7 h-7 ${textColor}`} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{mode.label}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{mode.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  const activeConfig = LOGIN_MODES.find(m => m.key === activeMode)!;
  const ActiveIcon = activeConfig.icon;
  const activeColorClasses = activeConfig.color.split(' ');
  const activeTextColor = activeColorClasses[0];
  const activeBgColor = activeColorClasses.slice(1).join(' ');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveMode(null)}
            className="w-fit -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to stations
          </Button>
          <div className="flex flex-col items-center gap-3">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${activeBgColor}`}>
              <ActiveIcon className={`w-7 h-7 ${activeTextColor}`} />
            </div>
            <div className="text-center">
              <CardTitle className="text-2xl">{activeConfig.label}</CardTitle>
              <CardDescription className="mt-1">{activeConfig.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
}
