import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
} from 'lucide-react';

export default function PTORequestGuide() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/help">
            <span className="hover:text-foreground cursor-pointer">Help Center</span>
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>Submit a PTO Request</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <CalendarCheck className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            How to Submit a PTO Request
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Use the Employee Portal to request full-day, half-day, hourly, or multi-day time off.
        </p>
      </div>

      <Card className="mb-6 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              PTO requests are submitted from <strong>Employee Portal</strong> on the <strong>Time Off</strong> tab. After submission, the request appears in <strong>My Time-Off Requests</strong> with its current approval status.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 1: Open Time Off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>Go to <strong>Employee Portal</strong>, then select the <strong>Time Off</strong> tab.</p>
            <p className="text-sm text-muted-foreground">The request form is labeled <strong>Request Time Off</strong>. The history panel is labeled <strong>My Time-Off Requests</strong>.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 2: Choose the Request Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>Select the request type that matches the time you need away.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {['Full Day', 'Half Day', 'Hourly', 'Multi-Day'].map((type) => (
                <div key={type} className="rounded-md border p-3">
                  <Badge variant="outline">{type}</Badge>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">If you choose <strong>Hourly</strong>, enter the number of hours requested.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 3: Enter Dates and Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 mt-1 shrink-0" /><span>Choose the start date.</span></li>
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 mt-1 shrink-0" /><span>Choose the end date if this is a multi-day request.</span></li>
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 mt-1 shrink-0" /><span>Add an optional note for your supervisor, HR, or payroll.</span></li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 4: Submit and Track</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>Click <strong>Submit PTO Request</strong>. The request moves into the PTO approval queue.</p>
            <p>Watch <strong>My Time-Off Requests</strong> for the current status and any denial note if the request is rejected.</p>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Submit PTO as early as possible. Future company policy may define exact advance notice requirements.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Quick Reference
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Where:</strong> Employee Portal &gt; Time Off</p>
          <p><strong>Button:</strong> Submit PTO Request</p>
          <p><strong>History:</strong> My Time-Off Requests</p>
          <p><strong>Records:</strong> Approved PTO may be used in timesheet and payroll workflows.</p>
        </CardContent>
      </Card>

      <div className="mt-8 flex gap-3">
        <Link href="/help/timeclock-training-program">
          <Button variant="outline">Training Program</Button>
        </Link>
        <Link href="/help">
          <Button variant="ghost">Back to Help Center</Button>
        </Link>
      </div>
    </div>
  );
}
