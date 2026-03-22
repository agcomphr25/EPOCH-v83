import { AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function TimeClockAdminPage() {
  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card className="border-amber-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5 text-amber-500" />
            Time Clock Admin
            <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs ml-1">
              Migration in Progress
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <p className="font-medium">Timekeeping system is being migrated.</p>
              <p className="mt-1 text-amber-700 dark:text-amber-400">
                The legacy <code className="text-xs bg-amber-100 dark:bg-amber-900 px-1 rounded">time_clock_entries</code> table
                has been retired. All punch data now flows through <code className="text-xs bg-amber-100 dark:bg-amber-900 px-1 rounded">punch_events</code>.
              </p>
              <p className="mt-1 text-amber-700 dark:text-amber-400">
                A new admin interface for viewing and correcting punch records will be available here in the next phase.
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground space-y-1 pt-1">
            <p>Employee clock-in/out: working via the Employee Portal.</p>
            <p>Labor summaries: available at <code className="bg-muted px-1 rounded">/api/labor/summary/employee/:canonicalId</code></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
