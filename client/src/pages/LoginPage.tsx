import { useState } from 'react';
import { useLocation } from 'wouter';
import { Eye, EyeOff, Scan, Settings, LogIn, Timer, Clock, CreditCard, Construction } from 'lucide-react';

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

type LoginMode = 'regular' | 'p2-traveler' | 'timer-station' | 'badge' | 'time-clock';

const LOGIN_MODES: { key: LoginMode; label: string; icon: typeof LogIn; description: string }[] = [
  { key: 'regular', label: 'Login', icon: LogIn, description: 'Username & password' },
  { key: 'p2-traveler', label: 'P2 Traveler', icon: Scan, description: 'Production tracking' },
  { key: 'timer-station', label: 'Timer Station', icon: Timer, description: 'Production timers' },
  { key: 'badge', label: 'Badge Login', icon: CreditCard, description: 'Employee badge scan' },
  { key: 'time-clock', label: 'Time Clock', icon: Clock, description: 'Clock in / out' },
];

export default function LoginPage() {
  const [activeMode, setActiveMode] = useState<LoginMode>('regular');
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
        
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });

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
      
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });

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
    </form>
  );

  const renderP2Traveler = () => (
    <div className="space-y-4">
      <div className="text-center space-y-2 mb-6">
        <Scan className="w-12 h-12 mx-auto text-blue-600" />
        <p className="text-sm text-muted-foreground">
          Production tracking with AS9100 traceability
        </p>
      </div>
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
        className="w-full"
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
      <div className="text-center space-y-2 mb-6">
        <Timer className="w-12 h-12 mx-auto text-orange-600" />
        <p className="text-sm text-muted-foreground">
          Production timer station for tracking cycle times
        </p>
      </div>
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
        className="w-full"
        onClick={() => setLocation('/app/production/timer-history')}
      >
        <Clock className="w-4 h-4 mr-2" />
        Timer History
      </Button>
    </div>
  );

  const renderBadgeLogin = () => (
    <div className="space-y-4">
      <div className="text-center space-y-2 mb-4">
        <CreditCard className="w-12 h-12 mx-auto text-green-600" />
        <p className="text-sm text-muted-foreground">
          Scan your employee badge to log in
        </p>
      </div>
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
          >
            {isBadgeLoading ? 'Loading...' : 'Scan'}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderTimeClock = () => (
    <div className="space-y-4">
      <div className="text-center space-y-3 py-8">
        <Clock className="w-16 h-16 mx-auto text-gray-400" />
        <Construction className="w-8 h-8 mx-auto text-yellow-500" />
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-300">
          Time Clock
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Time clock functionality is coming soon. This station will allow employees to clock in and out directly from the tablet.
        </p>
      </div>
    </div>
  );

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
    }
  };

  const activeConfig = LOGIN_MODES.find(m => m.key === activeMode)!;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="flex items-center justify-center mb-6">
        <div className="text-4xl font-bold text-blue-600">EPOCH</div>
      </div>

      <div className="grid grid-cols-5 gap-2 w-full max-w-2xl mb-4">
        {LOGIN_MODES.map((mode) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.key;
          return (
            <Card
              key={mode.key}
              onClick={() => setActiveMode(mode.key)}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isActive
                  ? 'ring-2 ring-blue-600 bg-blue-50 dark:bg-blue-950 shadow-md'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              data-testid={`shelf-${mode.key}`}
            >
              <CardContent className="flex flex-col items-center gap-1.5 p-3">
                <Icon className={`w-6 h-6 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
                <span className={`text-xs font-medium text-center leading-tight ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'}`}>
                  {mode.label}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-2xl text-center">{activeConfig.label}</CardTitle>
          <CardDescription className="text-center">
            {activeConfig.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
}
