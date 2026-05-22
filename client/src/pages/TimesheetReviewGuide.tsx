import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileCheck,
  Info,
  ShieldCheck,
} from 'lucide-react';

export default function TimesheetReviewGuide() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/help">
            <span className="hover:text-foreground cursor-pointer">Help Center</span>
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>View and Certify Timesheets</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <FileCheck className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            How to View and Certify Timesheets
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Review recorded time, complete daily sign-offs, and certify pay-period timesheets.
        </p>
      </div>

      <Card className="mb-6 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Timesheets are reviewed in <strong>Employee Portal</strong> on the <strong>Timesheets</strong> tab. Hourly employees see a running pay-period view, daily sign-off, needs-certification items, and history. Salaried employees review their weekly salaried timesheet and certify it after review.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 1: Open Timesheets</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Go to <strong>Employee Portal</strong>, then select the <strong>Timesheets</strong> tab.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              Step 2: Review the Pay Period
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>Use <strong>Previous</strong>, <strong>Current</strong>, and <strong>Next</strong> to move between pay periods.</p>
            <p>Review the daily rows for clock-in, clock-out, break, charge code, traveler, regular hours, overtime, and total hours.</p>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md border p-3"><strong>Total</strong><br /><span className="text-muted-foreground">All hours</span></div>
              <div className="rounded-md border p-3"><strong>Regular</strong><br /><span className="text-muted-foreground">Regular time</span></div>
              <div className="rounded-md border p-3"><strong>OT</strong><br /><span className="text-muted-foreground">Overtime</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Step 3: Complete Daily Sign-Off
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>Select the date, review that day's activity, then click <strong>Sign Off for This Day</strong> when the record is complete and accurate.</p>
            <div className="rounded-md border bg-muted/30 p-3 text-sm italic">
              "I certify that today's recorded time is complete, accurate, and represents work I actually performed."
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 4: Prepare and Certify the Pay Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 mt-1 shrink-0" /><span>If the period does not yet have a saved timesheet, click <strong>Prepare for Certification</strong>.</span></li>
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 mt-1 shrink-0" /><span>Open items listed under <strong>Needs Certification</strong>.</span></li>
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 mt-1 shrink-0" /><span>Review the certification statement and submit only when the time is complete and accurate.</span></li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 5: Use History for Prior Timesheets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>Use <strong>History</strong> to view prior timesheets and confirm what has already been submitted or certified.</p>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>If a certified or locked timesheet is wrong, follow the punch correction process or contact your supervisor. Do not ignore an incorrect labor record.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-blue-600" />
            Quick Reference
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Where:</strong> Employee Portal &gt; Timesheets</p>
          <p><strong>Daily action:</strong> Sign Off for This Day</p>
          <p><strong>Pay-period action:</strong> Prepare for Certification, then certify any Needs Certification item</p>
          <p><strong>Past records:</strong> History</p>
          <p><strong>Status signal:</strong> The Timesheets tab may show a count when items need certification.</p>
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
