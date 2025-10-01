import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { List, Package, LogOut, Calendar, ClipboardList } from "lucide-react";

export default function TANDYDTestDashboard() {
  const handleLogout = () => {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('jwtToken');
    window.location.href = '/login';
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome, TANDYD</h1>
          <p className="text-gray-600 mt-1">Your Personalized Manufacturing Dashboard</p>
        </div>
        <Button onClick={handleLogout} variant="outline" size="sm" className="flex items-center gap-2" data-testid="button-logout">
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-lg transition-shadow" data-testid="card-production">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-green-600" />Production</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link href="/production-queue"><Button className="w-full justify-start" variant="outline" data-testid="button-production-queue"><ClipboardList className="h-4 w-4 mr-2" />Production Queue</Button></Link>
              <Link href="/layup-scheduler"><Button className="w-full justify-start" variant="outline" data-testid="button-layup-scheduler"><Calendar className="h-4 w-4 mr-2" />Layup Scheduler</Button></Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow" data-testid="card-orders">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><List className="h-5 w-5 text-blue-600" />Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link href="/orders"><Button className="w-full justify-start" variant="outline" data-testid="button-view-orders"><List className="h-4 w-4 mr-2" />View All Orders</Button></Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow" data-testid="card-inventory">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-purple-600" />Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link href="/inventory/dashboard"><Button className="w-full justify-start" variant="outline" data-testid="button-inventory"><Package className="h-4 w-4 mr-2" />Inventory Dashboard</Button></Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/production-queue"><Button className="w-full h-12" variant="default" data-testid="button-quick-production"><ClipboardList className="h-4 w-4 mr-2" />Production Queue</Button></Link>
          <Link href="/orders"><Button className="w-full h-12" variant="outline" data-testid="button-quick-orders"><List className="h-4 w-4 mr-2" />View Orders</Button></Link>
        </div>
      </div>
    </div>
  );
}
