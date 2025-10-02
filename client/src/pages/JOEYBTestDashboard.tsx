import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Scissors, Settings, Wrench, FileText, Users, Factory, LogOut } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import PipelineVisualization from '@/components/PipelineVisualization';
import { isProductionEnvironment } from '@/lib/env';

export default function JOEYBTestDashboard() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      if (isProductionEnvironment()) {
        const { validateSessionAsync } = await import('@/lib/env');
        const isValid = await validateSessionAsync();
        if (!isValid) {
          console.log('🔒 Session invalid - redirecting to login');
          setLocation('/login');
        }
      }
    };
    checkAuth();
  }, [setLocation]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('userData');
      setLocation('/login');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome, JOEYB</h1>
          <p className="text-gray-600 mt-1">Your Personalized Manufacturing Dashboard</p>
        </div>
        <Button onClick={handleLogout} variant="outline" size="sm" className="flex items-center gap-2" data-testid="button-logout">
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <Card className="opacity-50 cursor-not-allowed border-2 border-gray-200">
          <CardContent className="p-4 text-center">
            <Scissors className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-500">Cutting Table</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Placeholder - Coming Soon</p>
          </CardContent>
        </Card>

        <Link href="/department-queue/cnc">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-yellow-200">
            <CardContent className="p-4 text-center">
              <Settings className="w-8 h-8 text-yellow-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">CNC Queue</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">CNC department orders</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/department-queue/gunsmith">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-red-200">
            <CardContent className="p-4 text-center">
              <Wrench className="w-8 h-8 text-red-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Gunsmith Queue</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Gunsmith department orders</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/all-orders">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200">
            <CardContent className="p-4 text-center">
              <FileText className="w-8 h-8 text-green-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">All Orders</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">View all orders</p>
            </CardContent>
          </Card>
        </Link>

        <Card className="opacity-50 cursor-not-allowed border-2 border-gray-200">
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-500">Employee Portal</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Placeholder - Coming Soon</p>
          </CardContent>
        </Card>
      </div>

      {/* Production Pipeline Overview */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <div className="p-2 rounded-lg bg-blue-100">
                <Factory className="w-5 h-5 text-blue-600" />
              </div>
              <span>Production Pipeline Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PipelineVisualization />
          </CardContent>
        </Card>
      </div>

    </div>
  );
}