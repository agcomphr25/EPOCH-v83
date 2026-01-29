import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { Route, FileText, ClipboardList, ArrowRight } from 'lucide-react';

export default function OnboardingDashboard() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Employee Onboarding</h1>
        <p className="text-gray-500 mt-2">
          Configure onboarding workflows, intake forms, and manage onboarding sessions
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5 text-blue-600" />
              Onboarding Paths
            </CardTitle>
            <CardDescription>
              Configure different onboarding workflows for full-time and contract employees
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/onboarding/paths">
              <Button className="w-full">
                Manage Paths
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-600" />
              Intake Forms
            </CardTitle>
            <CardDescription>
              Design forms to collect employee information during the onboarding process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/onboarding/forms">
              <Button className="w-full">
                Manage Forms
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-purple-600" />
              Active Sessions
            </CardTitle>
            <CardDescription>
              View and manage in-progress onboarding sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" disabled variant="outline">
              Coming Soon
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
