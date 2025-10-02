import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Plus, List, Users, BarChart3, LogOut, DollarSign } from "lucide-react";
import { isProductionEnvironment } from "@/lib/env";

export default function LAURIETTestDashboard() {
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

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome, LAURIET</h1>
          <p className="text-gray-600 mt-1">Your Personalized Manufacturing Dashboard</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-lg transition-shadow" data-testid="card-orders">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><List className="h-5 w-5 text-blue-600" />Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link href="/order-entry"><Button className="w-full justify-start" variant="outline" data-testid="button-new-order"><Plus className="h-4 w-4 mr-2" />New Order</Button></Link>
              <Link href="/orders"><Button className="w-full justify-start" variant="outline" data-testid="button-view-orders"><List className="h-4 w-4 mr-2" />View All Orders</Button></Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow" data-testid="card-customers">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-orange-600" />Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link href="/customer-management"><Button className="w-full justify-start" variant="outline" data-testid="button-customer-management"><Users className="h-4 w-4 mr-2" />Customer Management</Button></Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow" data-testid="card-finance">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-green-600" />Finance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link href="/finance/dashboard"><Button className="w-full justify-start" variant="outline" data-testid="button-finance-dashboard"><BarChart3 className="h-4 w-4 mr-2" />Finance Dashboard</Button></Link>
              <Link href="/payment-management"><Button className="w-full justify-start" variant="outline" data-testid="button-payment-management"><DollarSign className="h-4 w-4 mr-2" />Payment Management</Button></Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/order-entry"><Button className="w-full h-12" variant="default" data-testid="button-quick-new-order"><Plus className="h-4 w-4 mr-2" />Create New Order</Button></Link>
          <Link href="/customer-management"><Button className="w-full h-12" variant="outline" data-testid="button-quick-customers"><Users className="h-4 w-4 mr-2" />Customers</Button></Link>
          <Link href="/payment-management"><Button className="w-full h-12" variant="outline" data-testid="button-quick-payments"><DollarSign className="h-4 w-4 mr-2" />Payments</Button></Link>
        </div>
      </div>
    </div>
  );
}
