import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Route, FileText, ClipboardList, ArrowRight, Play, Pause, Eye, Plus, Loader2, Users, Pencil, PenTool } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

interface OnboardingPath {
  id: string;
  name: string;
  pathType: string;
  pathPurpose: string;
  isActive: boolean;
}

interface InactiveEmployee {
  id: number;
  name: string;
  email: string | null;
  department: string | null;
}

interface OnboardingSession {
  id: string;
  employeeId: number | null;
  pathId: string;
  adminId: number;
  status: 'in_progress' | 'paused' | 'completed';
  pathName: string;
  pathType: string;
  employeeName: string | null;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  documents: any[];
  captures: any[];
}

export default function OnboardingDashboard() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPathId, setSelectedPathId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [showSessionDetail, setShowSessionDetail] = useState<OnboardingSession | null>(null);
  const [employeeDraft, setEmployeeDraft] = useState({
    name: '',
    preferredName: '',
    email: '',
    phone: '',
    jobTitle: '',
    department: '',
    hireDate: '',
    payType: 'HOURLY',
  });
  const [noCellPhoneAvailable, setNoCellPhoneAvailable] = useState(false);
  const [noCellPhoneReason, setNoCellPhoneReason] = useState('');
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<OnboardingSession[]>({
    queryKey: ['/api/onboarding/sessions'],
  });

  const { data: paths = [] } = useQuery<OnboardingPath[]>({
    queryKey: ['/api/onboarding/paths'],
  });

  const { data: inactiveEmployees = [] } = useQuery<InactiveEmployee[]>({
    queryKey: ['/api/employees', { isActive: false }],
    queryFn: async () => {
      const res = await fetch('/api/employees?isActive=false');
      if (!res.ok) throw new Error('Failed to fetch inactive employees');
      return res.json();
    },
  });

  const activePaths = paths.filter(p => p.isActive);
  const selectedPath = activePaths.find(p => p.id === selectedPathId);
  const isRehirePath = selectedPath?.pathPurpose === 'REHIRE';

  const createSessionMutation = useMutation({
    mutationFn: async (data: { onboardingPathId: string; employeeId?: number; employeeDraft?: typeof employeeDraft }) => {
      const session = await apiRequest('/api/onboarding/sessions', {
        method: 'POST',
        body: data,
      });

      if (!isRehirePath) {
        const invitation = await apiRequest(`/api/onboarding/sessions/${session.id}/invitation`, {
          method: 'POST',
          body: {
            deliveryMode: 'in_person',
            noCellPhoneAvailable,
            noCellPhoneReason,
          },
        });

        return { session, invitation };
      }

      return { session, invitation: null };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions'] });
      if (data.invitation?.inviteUrl) {
        setCreatedInviteUrl(data.invitation.inviteUrl);
        toast({ title: 'Session and invite created', description: 'Use the in-person link to start paperwork.' });
      } else {
        setShowCreateDialog(false);
        setSelectedPathId('');
        setSelectedEmployeeId('');
        toast({ title: 'Session started', description: 'New onboarding session created successfully' });
      }
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create session', 
        variant: 'destructive' 
      });
    },
  });

  const pauseSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest(`/api/onboarding/sessions/${sessionId}/pause`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions'] });
      toast({ title: 'Session paused' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to pause session', variant: 'destructive' });
    },
  });

  const resumeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest(`/api/onboarding/sessions/${sessionId}/resume`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions'] });
      toast({ title: 'Session resumed' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to resume session', variant: 'destructive' });
    },
  });

  const handleCreateSession = () => {
    if (!selectedPathId) return;
    
    // For REHIRE paths, require employee selection
    if (isRehirePath && !selectedEmployeeId) {
      toast({ 
        title: 'Employee required', 
        description: 'Please select an inactive employee to re-hire',
        variant: 'destructive'
      });
      return;
    }

    if (!isRehirePath) {
      if (!employeeDraft.name.trim() || !employeeDraft.email.trim()) {
        toast({
          title: 'Employee details required',
          description: 'Name and email are required to create the inactive employee and invite.',
          variant: 'destructive',
        });
        return;
      }

      if (!employeeDraft.phone.trim() && !noCellPhoneAvailable) {
        toast({
          title: 'Cell phone required',
          description: 'Enter a cell phone or mark no cell phone available.',
          variant: 'destructive',
        });
        return;
      }

      if (noCellPhoneAvailable && noCellPhoneReason.trim().length < 3) {
        toast({
          title: 'Reason required',
          description: 'Add a reason for the no-cell-phone override.',
          variant: 'destructive',
        });
        return;
      }
    }
    
    const payload: { onboardingPathId: string; employeeId?: number; employeeDraft?: typeof employeeDraft } = {
      onboardingPathId: selectedPathId,
    };
    
    if (isRehirePath && selectedEmployeeId) {
      payload.employeeId = parseInt(selectedEmployeeId, 10);
    } else if (!isRehirePath) {
      payload.employeeDraft = {
        ...employeeDraft,
        name: employeeDraft.name.trim(),
        email: employeeDraft.email.trim(),
        phone: noCellPhoneAvailable ? '' : employeeDraft.phone.trim(),
      };
    }
    
    createSessionMutation.mutate(payload);
  };

  const inProgressSessions = sessions.filter(s => s.status === 'in_progress');
  const pausedSessions = sessions.filter(s => s.status === 'paused');
  const completedSessions = sessions.filter(s => s.status === 'completed');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return <Badge className="bg-green-100 text-green-800">In Progress</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-100 text-yellow-800">Paused</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Employee Onboarding</h1>
        <p className="text-gray-500 mt-2">
          Admin-led onboarding sessions for new and returning employees
        </p>
      </div>

      <div className="flex gap-4 mb-8">
        <Button 
          size="lg"
          onClick={() => setShowCreateDialog(true)}
          disabled={activePaths.length === 0}
          className="flex-1 max-w-xs"
        >
          <Plus className="h-5 w-5 mr-2" />
          Start New Session
        </Button>
        <Link href="/onboarding/paths">
          <Button variant="outline" size="lg">
            <Route className="h-5 w-5 mr-2" />
            Configure Paths
          </Button>
        </Link>
        <Link href="/onboarding/employer-signatures">
          <Button variant="outline" size="lg">
            <PenTool className="h-5 w-5 mr-2" />
            Employer Signatures
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">In Progress</p>
                <p className="text-2xl font-bold text-green-700">{inProgressSessions.length}</p>
              </div>
              <Play className="h-8 w-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Paused</p>
                <p className="text-2xl font-bold text-yellow-700">{pausedSessions.length}</p>
              </div>
              <Pause className="h-8 w-8 text-yellow-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-blue-700">{completedSessions.length}</p>
              </div>
              <ClipboardList className="h-8 w-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Onboarding Sessions</h2>
        </div>

        {sessionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No onboarding sessions yet</p>
              <p className="text-gray-400 text-sm mt-1">Start a new session to begin onboarding an employee</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {inProgressSessions.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-green-700 mb-2">In Progress ({inProgressSessions.length})</h3>
                <div className="space-y-2">
                  {inProgressSessions.map(session => (
                    <Card key={session.id} className="border-l-4 border-l-green-500">
                      <CardContent className="py-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{session.pathName}</span>
                            {getStatusBadge(session.status)}
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            {session.employeeName || 'No employee linked'}
                            <span className="mx-2">·</span>
                            Started {formatDate(session.startedAt)}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {session.documents.length} documents · {session.captures.length} captures
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => navigate(`/onboarding/session/${session.id}`)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Open Wizard
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => pauseSessionMutation.mutate(session.id)}
                            disabled={pauseSessionMutation.isPending}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {pausedSessions.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-yellow-700 mb-2">Paused ({pausedSessions.length})</h3>
                <div className="space-y-2">
                  {pausedSessions.map(session => (
                    <Card key={session.id} className="border-l-4 border-l-yellow-500">
                      <CardContent className="py-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{session.pathName}</span>
                            {getStatusBadge(session.status)}
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            {session.employeeName || 'No employee linked'}
                            <span className="mx-2">·</span>
                            Paused {session.pausedAt ? formatDate(session.pausedAt) : ''}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/onboarding/session/${session.id}`)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => resumeSessionMutation.mutate(session.id)}
                            disabled={resumeSessionMutation.isPending}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Resume
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {completedSessions.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-blue-700 mb-2">Completed ({completedSessions.length})</h3>
                <div className="space-y-2">
                  {completedSessions.map(session => (
                    <Card key={session.id} className="border-l-4 border-l-blue-500 opacity-80">
                      <CardContent className="py-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{session.pathName}</span>
                            {getStatusBadge(session.status)}
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            {session.employeeName || 'No employee linked'}
                            <span className="mx-2">·</span>
                            Completed {session.completedAt ? formatDate(session.completedAt) : ''}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/onboarding/session/${session.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setSelectedPathId('');
          setSelectedEmployeeId('');
          setEmployeeDraft({
            name: '',
            preferredName: '',
            email: '',
            phone: '',
            jobTitle: '',
            department: '',
            hireDate: '',
            payType: 'HOURLY',
          });
          setNoCellPhoneAvailable(false);
          setNoCellPhoneReason('');
          setCreatedInviteUrl(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isRehirePath ? 'Start Re-Hire Session' : 'Start New Onboarding Session'}
            </DialogTitle>
            <DialogDescription>
              {isRehirePath 
                ? 'Select an inactive employee to re-hire and complete their re-onboarding process.'
                : 'Select an onboarding path to begin a new employee onboarding session.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="path-select">Onboarding Path</Label>
              <Select value={selectedPathId} onValueChange={(value) => {
                setSelectedPathId(value);
                setSelectedEmployeeId(''); // Reset employee when path changes
              }}>
                <SelectTrigger id="path-select" className="mt-2">
                  <SelectValue placeholder="Select a path..." />
                </SelectTrigger>
                <SelectContent>
                  {activePaths.map(path => (
                    <SelectItem key={path.id} value={path.id}>
                      {path.name} ({path.pathType}) {path.pathPurpose === 'REHIRE' && '- Re-Hire'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isRehirePath && (
              <div>
                <Label htmlFor="employee-select">Select Inactive Employee to Re-Hire</Label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger id="employee-select" className="mt-2">
                    <SelectValue placeholder="Select an inactive employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {inactiveEmployees.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">
                        No inactive employees available
                      </div>
                    ) : (
                      inactiveEmployees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id.toString()}>
                          {emp.name} {emp.department && `(${emp.department})`}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Only inactive employees can be re-hired. This will reactivate their employee record and user account.
                </p>
              </div>
            )}

            {!isRehirePath && selectedPathId && (
              <div className="space-y-4 border-t pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="employee-name">Legal Name</Label>
                    <Input
                      id="employee-name"
                      className="mt-2"
                      value={employeeDraft.name}
                      onChange={(event) => setEmployeeDraft((current) => ({ ...current, name: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="preferred-name">Preferred Name</Label>
                    <Input
                      id="preferred-name"
                      className="mt-2"
                      value={employeeDraft.preferredName}
                      onChange={(event) => setEmployeeDraft((current) => ({ ...current, preferredName: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="employee-email">Email</Label>
                    <Input
                      id="employee-email"
                      className="mt-2"
                      type="email"
                      value={employeeDraft.email}
                      onChange={(event) => setEmployeeDraft((current) => ({ ...current, email: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="employee-phone">Cell Phone</Label>
                    <Input
                      id="employee-phone"
                      className="mt-2"
                      value={employeeDraft.phone}
                      disabled={noCellPhoneAvailable}
                      onChange={(event) => setEmployeeDraft((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="employee-job-title">Job Title</Label>
                    <Input
                      id="employee-job-title"
                      className="mt-2"
                      value={employeeDraft.jobTitle}
                      onChange={(event) => setEmployeeDraft((current) => ({ ...current, jobTitle: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="employee-department">Department</Label>
                    <Input
                      id="employee-department"
                      className="mt-2"
                      value={employeeDraft.department}
                      onChange={(event) => setEmployeeDraft((current) => ({ ...current, department: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="employee-hire-date">Expected Hire Date</Label>
                    <Input
                      id="employee-hire-date"
                      className="mt-2"
                      type="date"
                      value={employeeDraft.hireDate}
                      onChange={(event) => setEmployeeDraft((current) => ({ ...current, hireDate: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pay-type-select">Pay Type</Label>
                    <Select
                      value={employeeDraft.payType}
                      onValueChange={(value) => setEmployeeDraft((current) => ({ ...current, payType: value }))}
                    >
                      <SelectTrigger id="pay-type-select" className="mt-2">
                        <SelectValue placeholder="Select pay type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HOURLY">Full-time Hourly</SelectItem>
                        <SelectItem value="SALARY">Full-time Salaried</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={noCellPhoneAvailable}
                    onCheckedChange={(checked) => setNoCellPhoneAvailable(checked === true)}
                  />
                  <span>No cell phone available for verification</span>
                </label>

                {noCellPhoneAvailable && (
                  <div>
                    <Label htmlFor="no-cell-reason">No Cell Phone Reason</Label>
                    <Textarea
                      id="no-cell-reason"
                      className="mt-2"
                      value={noCellPhoneReason}
                      onChange={(event) => setNoCellPhoneReason(event.target.value)}
                      placeholder="Example: employee does not own a cell phone and is completing paperwork in person"
                    />
                  </div>
                )}
              </div>
            )}

            {createdInviteUrl && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
                <div>
                  <div className="font-medium text-green-900">In-person invite link ready</div>
                  <div className="text-sm text-green-800">Open this on the orientation device to verify contact information and complete paperwork.</div>
                </div>
                <div className="flex gap-2">
                  <Input value={`${window.location.origin}${createdInviteUrl}`} readOnly />
                  <Button onClick={() => window.open(createdInviteUrl, '_blank')}>Open</Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateSession} 
              disabled={!!createdInviteUrl || !selectedPathId || (isRehirePath && !selectedEmployeeId) || createSessionMutation.isPending}
            >
              {createSessionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isRehirePath ? 'Start Re-Hire' : 'Start Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showSessionDetail} onOpenChange={() => setShowSessionDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
          </DialogHeader>
          {showSessionDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Path:</span>
                  <p className="font-medium">{showSessionDetail.pathName}</p>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>
                  <p>{getStatusBadge(showSessionDetail.status)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Started:</span>
                  <p className="font-medium">{formatDate(showSessionDetail.startedAt)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Employee:</span>
                  <p className="font-medium">
                    {showSessionDetail.employeeName || 'Not linked'}
                  </p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Documents ({showSessionDetail.documents.length})</h4>
                {showSessionDetail.documents.length === 0 ? (
                  <p className="text-sm text-gray-500">No documents configured</p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {showSessionDetail.documents.map((doc: any, idx: number) => (
                      <li key={doc.id} className="flex items-center gap-2">
                        <span className="text-gray-400">{idx + 1}.</span>
                        <Badge variant={doc.status === 'signed' ? 'default' : 'outline'} className="text-xs">
                          {doc.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Captures ({showSessionDetail.captures.length})</h4>
                {showSessionDetail.captures.length === 0 ? (
                  <p className="text-sm text-gray-500">No captures configured</p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {showSessionDetail.captures.map((cap: any) => (
                      <li key={cap.id} className="flex items-center gap-2">
                        <span className="capitalize">{cap.captureType.replace('_', ' ')}</span>
                        <Badge variant={cap.mediaItemId ? 'default' : 'outline'} className="text-xs">
                          {cap.mediaItemId ? 'Captured' : 'Pending'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSessionDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
