import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Settings, FileText, Clock } from 'lucide-react';

export default function OnboardingDashboard() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Employee Onboarding</h1>
        <p className="text-gray-500 mt-2">
          Admin-driven employee onboarding configuration and session management
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-6">
            Employee onboarding configuration coming soon.
          </p>
          
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>Onboarding Paths</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>Intake Forms</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Active Sessions</span>
            </div>
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>Document Signing</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
