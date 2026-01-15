import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Calendar,
  Plus,
  Trash2,
  Edit2,
  GraduationCap,
  ClipboardList,
  Play,
  Users,
  CheckCircle,
  Clock,
  Target,
  BookOpen,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

interface FacilityTopic {
  id: number;
  code: string;
  title: string;
  description: string;
  category: string;
  isActive: boolean;
}

interface TrainingPlanDay {
  id: number;
  dayNumber: number;
  title: string;
  objectives: string;
  createdAt: string;
  topics?: FacilityTopic[];
}

interface TraineeProgress {
  employeeId: number;
  employeeName: string;
  currentDay: number;
  status: string;
  startedAt: string;
}

const defaultDays = [
  {
    dayNumber: 1,
    title: "Foundation Day",
    objectives: "Introduction to facility processes, safety overview, and critical equipment orientation. Cover PPE requirements, FOD awareness, and basic chemical handling."
  },
  {
    dayNumber: 2,
    title: "Core Skills Day",
    objectives: "Hands-on practice with supervised instruction. Focus on work instruction comprehension, ITAR awareness, and basic production tasks."
  },
  {
    dayNumber: 3,
    title: "Application Day",
    objectives: "Trainee demonstrates skills under coaching. Apply learned concepts, practice S-O-A feedback techniques, and refine techniques."
  },
  {
    dayNumber: 4,
    title: "Validation Day",
    objectives: "Independent task completion with observation. Final competency verification and certification signoff."
  }
];

export default function TrainingPlans() {
  const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addTopicDialogOpen, setAddTopicDialogOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [editingDay, setEditingDay] = useState<TrainingPlanDay | null>(null);

  const { data: planDays = [], isLoading: daysLoading } = useQuery<TrainingPlanDay[]>({
    queryKey: ['/api/training/plan-days'],
  });

  const { data: facilityTopics = [] } = useQuery<FacilityTopic[]>({
    queryKey: ['/api/training/facility-topics'],
  });

  const initializePlanMutation = useMutation({
    mutationFn: () => apiRequest('/api/training/plan-days/initialize', { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Training plan initialized', description: '4-day training plan created' });
      queryClient.invalidateQueries({ queryKey: ['/api/training/plan-days'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateDayMutation = useMutation({
    mutationFn: (data: { id: number; title: string; objectives: string }) =>
      apiRequest(`/api/training/plan-days/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: data.title, objectives: data.objectives }),
      }),
    onSuccess: () => {
      toast({ title: 'Day updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/training/plan-days'] });
      setEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const addTopicToDayMutation = useMutation({
    mutationFn: (data: { dayId: number; topicId: number }) =>
      apiRequest(`/api/training/plan-days/${data.dayId}/topics`, {
        method: 'POST',
        body: JSON.stringify({ topicId: data.topicId }),
      }),
    onSuccess: () => {
      toast({ title: 'Topic added to day' });
      queryClient.invalidateQueries({ queryKey: ['/api/training/plan-days'] });
      setAddTopicDialogOpen(false);
      setSelectedTopicId('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const removeTopicFromDayMutation = useMutation({
    mutationFn: (data: { dayId: number; topicId: number }) =>
      apiRequest(`/api/training/plan-days/${data.dayId}/topics/${data.topicId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({ title: 'Topic removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/training/plan-days'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleEditDay = (day: TrainingPlanDay) => {
    setEditingDay(day);
    setEditDialogOpen(true);
  };

  const handleAddTopic = (dayId: number) => {
    setSelectedDay(dayId);
    setAddTopicDialogOpen(true);
  };

  const dayIcons = [Target, BookOpen, ClipboardList, CheckCircle];
  const dayColors = ['blue', 'teal', 'orange', 'green'];

  if (daysLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/3 mx-auto"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-8 w-8 text-primary" />
            Training Plans
          </h1>
          <p className="text-muted-foreground">
            Configure the 4-day competency training program structure
          </p>
        </div>
        {planDays.length === 0 && (
          <Button onClick={() => initializePlanMutation.mutate()} disabled={initializePlanMutation.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            Initialize 4-Day Plan
          </Button>
        )}
      </div>

      {planDays.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Training Plan Configured</h3>
            <p className="text-muted-foreground mb-4">
              Initialize the 4-day competency training structure to get started.
            </p>
            <div className="grid md:grid-cols-4 gap-4 mt-8 max-w-4xl mx-auto">
              {defaultDays.map((day, index) => {
                const Icon = dayIcons[index];
                return (
                  <Card key={index} className="text-left">
                    <CardHeader className="pb-2">
                      <div className={`w-10 h-10 rounded-full bg-${dayColors[index]}-100 dark:bg-${dayColors[index]}-900 flex items-center justify-center mb-2`}>
                        <Icon className={`h-5 w-5 text-${dayColors[index]}-600`} />
                      </div>
                      <CardTitle className="text-base">Day {day.dayNumber}</CardTitle>
                      <CardDescription>{day.title}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">{day.objectives}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {planDays.sort((a, b) => a.dayNumber - b.dayNumber).map((day, index) => {
            const Icon = dayIcons[index] || Target;
            const color = dayColors[index] || 'gray';
            return (
              <Card key={day.id} className={`border-l-4 border-l-${color}-500`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full bg-${color}-100 dark:bg-${color}-900 flex items-center justify-center font-bold text-${color}-700 dark:text-${color}-300 text-xl`}>
                        {day.dayNumber}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{day.title}</CardTitle>
                        <CardDescription className="max-w-2xl">{day.objectives}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditDay(day)}>
                        <Edit2 className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleAddTopic(day.id)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add Topic
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Facility Topics</p>
                    {day.topics && day.topics.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {day.topics.map((topic) => (
                          <Badge key={topic.id} variant="secondary" className="flex items-center gap-2">
                            <span>{topic.code}</span>
                            <span className="text-muted-foreground">-</span>
                            <span>{topic.title}</span>
                            <button
                              onClick={() => removeTopicFromDayMutation.mutate({ dayId: day.id, topicId: topic.id })}
                              className="ml-1 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No topics assigned to this day</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Training Day</DialogTitle>
            <DialogDescription>Update the title and objectives for this training day</DialogDescription>
          </DialogHeader>
          {editingDay && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={editingDay.title}
                  onChange={(e) => setEditingDay({ ...editingDay, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="objectives">Objectives</Label>
                <Textarea
                  id="objectives"
                  value={editingDay.objectives}
                  onChange={(e) => setEditingDay({ ...editingDay, objectives: e.target.value })}
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => editingDay && updateDayMutation.mutate({
                id: editingDay.id,
                title: editingDay.title,
                objectives: editingDay.objectives,
              })}
              disabled={updateDayMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addTopicDialogOpen} onOpenChange={setAddTopicDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Facility Topic</DialogTitle>
            <DialogDescription>Select a topic to add to this training day</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a topic" />
              </SelectTrigger>
              <SelectContent>
                {facilityTopics.filter(t => t.isActive).map((topic) => (
                  <SelectItem key={topic.id} value={topic.id.toString()}>
                    {topic.code} - {topic.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTopicDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedDay && selectedTopicId && addTopicToDayMutation.mutate({
                dayId: selectedDay,
                topicId: parseInt(selectedTopicId),
              })}
              disabled={!selectedTopicId || addTopicToDayMutation.isPending}
            >
              Add Topic
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
