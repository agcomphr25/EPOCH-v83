import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, LogIn, Building } from 'lucide-react';

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const loginMutation = useMutation({
    mutationFn: async (credentials: typeof formData) => {
      console.log('🔐 Starting login attempt for:', credentials.username);
      
      // Ultra-aggressive timeout for deployment environments
      const isDeployment = window.location.hostname.includes('.replit.app') || 
                          window.location.hostname.includes('.repl.co') ||
                          window.location.hostname.includes('agcompepoch.xyz');
      
      const timeoutDuration = isDeployment ? 6000 : 30000; // 6 seconds for deployment
      console.log(`🌐 Login timeout set to ${timeoutDuration}ms (deployment: ${isDeployment})`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('🚨 LOGIN TIMEOUT: Request cancelled after', timeoutDuration, 'ms');
        controller.abort();
      }, timeoutDuration);

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(credentials),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        console.log('✅ Login response received:', response.status);

        if (!response.ok) {
          const error = await response.json();
          console.error('❌ Login failed:', error);
          // Ensure error message is properly extracted
          const errorMessage = error.error || error.message || 'Login failed';
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log('✅ Login successful for user:', data.user?.username);
        console.log('🔍 Login response data:', data);
        return data;
      } catch (error: any) {
        clearTimeout(timeoutId);
        console.error('💥 Login error:', error);
        
        if (error.name === 'AbortError') {
          throw new Error(isDeployment 
            ? 'Login timed out after 6 seconds. There may be database connectivity issues on the deployed site.' 
            : 'Login request timed out. Please try again.'
          );
        }
        
        throw error;
      }
    },
    onSuccess: (data) => {
      // Store both session token and JWT token
      if (data.sessionToken) {
        localStorage.setItem('sessionToken', data.sessionToken);
      }
      if (data.token) {
        localStorage.setItem('jwtToken', data.token);
      }
      
      toast({
        title: "Login Successful",
        description: `Welcome back, ${data.user?.username || 'User'}!`,
      });
      
      // Determine redirect URL based on user role and username
      let redirectUrl = '/';
      
      if (data.user?.role === 'ADMIN' || data.user?.role === 'HR Manager') {
        redirectUrl = '/employee';
      } else {
        // Redirect to user-specific dashboard based on username
        const username = data.user?.username?.toLowerCase();
        switch (username) {
          case 'agtest':
            redirectUrl = '/agtest-dashboard';
            break;
          case 'glenn':
          case 'admin':
            redirectUrl = '/admintest-dashboard';
            break;
          case 'johnl':
            redirectUrl = '/johnltest-dashboard';
            break;
          case 'jens':
            redirectUrl = '/jenstest-dashboard';
            break;
          case 'staciw':
            redirectUrl = '/staciwtest-dashboard';
            break;
          case 'darleneb':
            redirectUrl = '/darlenebtest-dashboard';
            break;
          case 'tims':
            redirectUrl = '/timstest-dashboard';
            break;
          case 'bradw':
            redirectUrl = '/bradwtest-dashboard';
            break;
          case 'faleeshah':
            redirectUrl = '/faleeshahtest-dashboard';
            break;
          case 'joeyb':
            redirectUrl = '/joeybtest-dashboard';
            break;
          default:
            // Fall back to main dashboard for users without specific dashboards
            redirectUrl = '/';
            break;
        }
      }
      
      console.log('🎯 About to redirect to:', redirectUrl);
      
      // Force page reload to trigger authentication re-check
      setTimeout(() => {
        console.log('🚀 EXECUTING REDIRECT NOW to:', redirectUrl);
        window.location.href = redirectUrl;
      }, 1000);
    },
    onError: (error: Error) => {
      console.error('Login error:', error);
      
      // Enhanced error message handling with timeout detection
      let errorMessage = error.message;
      if (errorMessage === 'Account is deactivated') {
        errorMessage = 'Your account has been deactivated. Please contact an administrator.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorMessage = 'Login is taking too long. There may be connectivity issues. Please try again.';
      } else if (errorMessage.includes('fetch') || error.name === 'AbortError') {
        errorMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
      } else if (!errorMessage || errorMessage === 'Failed to fetch') {
        errorMessage = 'Login failed. Please check your credentials and try again.';
      }
      
      toast({
        title: "Login Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password) {
      toast({
        title: "Validation Error",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }

    loginMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">EPOCH ERP</h1>
          <p className="text-gray-600">Employee Management System</p>
        </div>

        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-center">Sign In</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Signing In...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-600">
              <p>Forgot your password? Contact your administrator.</p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6 text-sm text-gray-500">
          <p>EPOCH v8 Manufacturing ERP System</p>
          <p className="mt-1">© 2025 All rights reserved</p>
        </div>
      </div>
    </div>
  );
}