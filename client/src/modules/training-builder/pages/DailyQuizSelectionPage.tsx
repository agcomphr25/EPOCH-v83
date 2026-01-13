import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CalendarDays, Plus, Trash2, ClipboardCheck, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface Quiz {
  id: number;
  title: string;
  description: string | null;
  passingScore: number;
}

interface DailyQuizSelection {
  id: number;
  quizId: number;
  scheduledDate: string;
  department: string | null;
  notes: string | null;
  isActive: boolean;
}

export default function DailyQuizSelectionPage() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedQuizId, setSelectedQuizId] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const { data: quizzes = [] } = useQuery<Quiz[]>({
    queryKey: ['/api/training/quizzes'],
  });

  const { data: dailySelections = [], isLoading } = useQuery<DailyQuizSelection[]>({
    queryKey: ['/api/training/daily-quizzes'],
  });

  const addSelectionMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/training/daily-quizzes', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-quizzes'] });
      setSelectedQuizId('');
      setNotes('');
      toast({ title: 'Quiz scheduled for the day' });
    },
    onError: () => toast({ title: 'Failed to schedule quiz', variant: 'destructive' }),
  });

  const removeSelectionMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/training/daily-quizzes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-quizzes'] });
      toast({ title: 'Quiz removed from schedule' });
    },
  });

  const handleAddQuiz = () => {
    if (!selectedQuizId) {
      toast({ title: 'Please select a quiz', variant: 'destructive' });
      return;
    }
    addSelectionMutation.mutate({
      quizId: parseInt(selectedQuizId),
      scheduledDate: selectedDate.toISOString(),
      department: department || null,
      notes: notes || null,
    });
  };

  const selectionsForDate = dailySelections.filter((s) => {
    if (!s.scheduledDate) return false;
    const selDate = new Date(s.scheduledDate);
    return selDate.toDateString() === selectedDate.toDateString();
  });

  const departments = ['Manufacturing', 'Assembly', 'Quality Control', 'Shipping', 'All Departments'];

  if (isLoading) {
    return <div className="p-6 text-center">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Daily Quiz Selection
        </h1>
        <p className="text-muted-foreground">Select which quizzes to administer each day</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Date</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                className="rounded-md border"
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Quizzes for {format(selectedDate, 'MMMM d, yyyy')}
              </CardTitle>
              <CardDescription>
                {selectionsForDate.length === 0 ? 'No quizzes scheduled' : `${selectionsForDate.length} quiz(es) scheduled`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectionsForDate.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No quizzes scheduled for this day</p>
                  <p className="text-sm">Add a quiz below</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectionsForDate.map((selection) => {
                    const quiz = quizzes.find((q) => q.id === selection.quizId);
                    return (
                      <div key={selection.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{quiz?.title || 'Unknown Quiz'}</p>
                          <div className="flex gap-2 mt-1">
                            {selection.department && <Badge variant="outline">{selection.department}</Badge>}
                            {quiz && <Badge variant="secondary">Pass: {quiz.passingScore}%</Badge>}
                          </div>
                          {selection.notes && <p className="text-sm text-muted-foreground mt-1">{selection.notes}</p>}
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => removeSelectionMutation.mutate(selection.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Quiz to Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Quiz</Label>
                <Select value={selectedQuizId} onValueChange={setSelectedQuizId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a quiz..." />
                  </SelectTrigger>
                  <SelectContent>
                    {quizzes.map((quiz) => (
                      <SelectItem key={quiz.id} value={String(quiz.id)}>
                        {quiz.title} ({quiz.passingScore}% to pass)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Department (optional)</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions..." />
              </div>
              <Button onClick={handleAddQuiz} disabled={addSelectionMutation.isPending || !selectedQuizId} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {addSelectionMutation.isPending ? 'Adding...' : 'Add Quiz to Schedule'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
