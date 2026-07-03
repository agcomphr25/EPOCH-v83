import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FilePenLine,
  Info,
  MousePointerClick,
} from 'lucide-react';

export default function PunchEditRequestGuide() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/help">
            <span className="hover:text-foreground cursor-pointer">Help Center</span>
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>Request a Punch Edit</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <FilePenLine className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            How to Request a Punch Edit
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Submit missed or incorrect punch changes for supervisor review.
        </p>
      </div>

      <Card className="mb-6 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Punch correction requests are created in <strong>Employee Portal</strong> on the <strong>Time Clock</strong> tab. They do not silently change a record; the request and reason are preserved for review.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 1: Open the Time Clock Tab</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Go to <strong>Employee Portal</strong>, then select <strong>Time Clock</strong>. The correction form is below the clock-in and clock-out controls.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 2: Choose Edit or Add</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <Badge className="mb-2 bg-blue-100 text-blue-800 hover:bg-blue-100">Edit</Badge>
                <p className="text-sm">Tap a punch under <strong>Active Shift Punches</strong> when a recorded punch time or type is wrong.</p>
              </div>
              <div className="rounded-md border p-3">
                <Badge className="mb-2 bg-amber-100 text-amber-800 hover:bg-amber-100">Add</Badge>
                <p className="text-sm">Click <strong>Add</strong> when a punch is missing and needs to be created.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 3: Enter the Correct Punch Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 mt-1 shrink-0" /><span>Select the correct punch type, such as Clock in, Clock out, Meal out, or Meal in.</span></li>
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 mt-1 shrink-0" /><span>Enter the corrected date and time in the appropriate field.</span></li>
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 mt-1 shrink-0" /><span>For an edited session, include the correct clock-in or clock-out value that applies.</span></li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 4: Write a Clear Reason</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>The <strong>Reason</strong> field is required. Be specific enough that a supervisor can understand what happened.</p>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium mb-1">Good examples</p>
              <p>Forgot to clock out at 3:30 PM after finishing shift.</p>
              <p>Selected break start instead of clock out by mistake.</p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Punch edits are audit-relevant. Do not submit a correction unless the request is accurate to the best of your knowledge.</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Step 5: Submit the Request</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Click <strong>Submit Correction Request</strong>. A supervisor or authorized reviewer will review the request before the record is corrected.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <MousePointerClick className="h-5 w-5 text-blue-600" />
            Quick Reference
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Where:</strong> Employee Portal &gt; Time Clock &gt; Request Punch Correction</p>
          <p><strong>Edit an existing punch:</strong> Tap a punch under Active Shift Punches.</p>
          <p><strong>Add a missing punch:</strong> Click Add.</p>
          <p><strong>Required:</strong> Correct time details and a written reason.</p>
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
