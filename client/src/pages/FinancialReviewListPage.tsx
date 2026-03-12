import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, ChevronRight, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';

interface FinancialReviewSession {
  id: number;
  month_key: string;
  review_date: string | null;
  created_at: string;
  updated_at: string;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return format(d, 'MMMM yyyy');
}

export default function FinancialReviewListPage() {
  const [, navigate] = useLocation();
  const [showNew, setShowNew] = useState(false);
  const [newMonth, setNewMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const { data: sessions = [], isLoading } = useQuery<FinancialReviewSession[]>({
    queryKey: ['/api/financial-review'],
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('PUT', `/api/financial-review/${newMonth}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financial-review'] });
      navigate(`/finance/review/${newMonth}`);
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Monthly Business Reviews</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Slide-format monthly financial and operational reviews
            </p>
          </div>
          <Button onClick={() => setShowNew(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            New Month
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <CalendarDays className="h-12 w-12 text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">No reviews yet</p>
              <p className="text-gray-400 text-sm mt-1">Start your first monthly business review</p>
              <Button className="mt-4" onClick={() => setShowNew(true)}>
                <PlusCircle className="h-4 w-4 mr-2" />
                Create First Review
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card
                key={session.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/finance/review/${session.month_key}`)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {monthLabel(session.month_key)}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {session.review_date
                          ? `Review date: ${session.review_date}`
                          : 'No review date set'}
                        {' · '}
                        Last updated {format(new Date(session.updated_at), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start New Monthly Review</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="month-key">Month (YYYY-MM)</Label>
            <Input
              id="month-key"
              type="month"
              value={newMonth}
              onChange={(e) => setNewMonth(e.target.value)}
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newMonth}
            >
              {createMutation.isPending ? 'Creating…' : 'Open Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
