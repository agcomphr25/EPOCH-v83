import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FilePenLine,
  Info,
  ShieldCheck,
} from 'lucide-react';

const modules = [
  {
    title: 'Use the Time Clock',
    description: 'Clock in, select the correct charge code when required, start and end breaks, and certify the day at clock-out.',
  },
  {
    title: 'Submit PTO Requests',
    description: 'Request full-day, half-day, hourly, or multi-day PTO and track the request through approval.',
  },
  {
    title: 'Request Punch Corrections',
    description: 'Ask for a missed or incorrect punch to be corrected with a clear reason for supervisor review.',
  },
  {
    title: 'Review Timesheets',
    description: 'Review the running pay-period view, complete daily sign-offs, and certify pay-period timesheets.',
  },
];

export default function TimeclockTrainingProgramGuide() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/help">
            <span className="hover:text-foreground cursor-pointer">Help Center</span>
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>Timeclock Training Program</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Timeclock Training and Certification Program
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Starter structure for training employees on EPOCH timekeeping self-service.
        </p>
      </div>

      <Card className="mb-6 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-200">Purpose</p>
              <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                This program gives employees a consistent way to learn the timeclock system and gives the company a record that employees were trained before using DCAA-relevant labor records.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="p-4">
            <Badge className="mb-3 bg-blue-100 text-blue-800 hover:bg-blue-100">Phase 1</Badge>
            <h2 className="font-semibold text-gray-900">Learn</h2>
            <p className="text-sm text-muted-foreground mt-1">Employee reads each guide and watches a supervisor or trainer demonstrate the workflow.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Badge className="mb-3 bg-amber-100 text-amber-800 hover:bg-amber-100">Phase 2</Badge>
            <h2 className="font-semibold text-gray-900">Practice</h2>
            <p className="text-sm text-muted-foreground mt-1">Employee walks through the self-service screens and asks questions before submitting live records.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Badge className="mb-3 bg-green-100 text-green-800 hover:bg-green-100">Phase 3</Badge>
            <h2 className="font-semibold text-gray-900">Certify</h2>
            <p className="text-sm text-muted-foreground mt-1">Employee acknowledges the required statements and the training completion is recorded.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-blue-600" />
            Training Modules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {modules.map((module, index) => (
            <div key={module.title} className="flex gap-3 rounded-md border p-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                {index + 1}
              </div>
              <div>
                <p className="font-medium text-gray-900">{module.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{module.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Starter Certification Statements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>Training acknowledgment:</strong> I have been trained on the EPOCH timeclock self-service workflows assigned to me and understand that my time records must be complete, accurate, and submitted promptly.
          </p>
          <p>
            <strong>Daily time certification:</strong> I certify that today's recorded time is complete, accurate, and represents work I actually performed.
          </p>
          <p>
            <strong>Correction acknowledgment:</strong> I understand that punch corrections require a written reason and may require supervisor review before the labor record is updated.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <Link href="/help/pto-request-guide">
          <Button variant="outline" className="w-full justify-between h-auto py-3">
            <span className="flex items-center gap-2"><CalendarCheck className="h-4 w-4" /> PTO Requests</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/help/punch-edit-request-guide">
          <Button variant="outline" className="w-full justify-between h-auto py-3">
            <span className="flex items-center gap-2"><FilePenLine className="h-4 w-4" /> Punch Corrections</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/help/timesheet-review-guide">
          <Button variant="outline" className="w-full justify-between h-auto py-3">
            <span className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> Timesheets</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Link href="/help">
        <Button variant="ghost">Back to Help Center</Button>
      </Link>
    </div>
  );
}
