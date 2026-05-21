import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  BookOpen,
  Award,
  FileText,
  Clock,
  CheckSquare,
  Calendar,
  Building,
  Mail,
  Phone,
  Shield,
  ExternalLink,
  AlertCircle,
  Loader2,
  Send,
  CalendarOff,
  ClipboardList,
  Info,
  Lock,
  Plus,
  Trash2,
  Pencil,
  X,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import DailyChecklistModal from '@/components/employee/DailyChecklistModal';
import HandbookModal from '@/components/employee/HandbookModal';

interface Employee {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  employmentType: string;
  hireDate: string;
  payType?: string | null;
}

interface SalariedTimesheetLine {
  id: number;
  timesheetId: number;
  date: string;
  lineType: string;
  hours: number;
  source: string;
  note: string | null;
  isLocked: boolean;
  chargeCodeId: number | null;
  indirectCodeId: number | null;
  travelerId: string | null;
  originalNarrative: string | null;
}

interface IndirectCode {
  id: number;
  code: string;
  label: string;
  isActive: boolean;
  chargeCodeId: number;
}

interface TravelerSuggestion {
  travelerId: string;
  travelerNumber: string;
  chargeCodeId: number | null;
  chargeCodeLabel: string | null;
  projectName: string | null;
}

interface SalariedTimesheet {
  id: number;
  employeeId: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalActualHours: number;
  certifiedAt?: string | null;
  certifiedBy?: number | null;
  certificationStatement?: string | null;
  certificationVersion?: number | null;
}

interface SalariedTimesheetView {
  timesheet: SalariedTimesheet;
  lines: SalariedTimesheetLine[];
}

interface Certification {
  id: number;
  certification: {
    name: string;
    category: string;
  };
  dateObtained: string;
  dateExpiry: string;
  status: string;
}

interface Evaluation {
  id: number;
  evaluationPeriodStart: string;
  evaluationPeriodEnd: string;
  overallRating: number;
  status: string;
}

interface PunchAwareness {
  state: 'looks_good' | 'possible_missed_punch' | 'open_punch_today';
  message: string | null;
  actionText: string | null;
  openPunchTime: string | null;
  hoursOpen: number | null;
}

interface TimeOffRequest {
  id: number;
  employeeId: number;
  startDate: string;
  endDate: string;
  leaveType: string;
  status: 'pending' | 'pending_supervisor' | 'pending_hr' | 'pending_vp' | 'approved' | 'rejected' | 'denied';
  requestUnit?: string | null;
  requestedHours?: number | null;
  employeeNote: string | null;
  adminNote: string | null;
  supervisorNote: string | null;
  hrNote: string | null;
  vpNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export default function EmployeePortal() {
  const { portalId } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [handbookOpen, setHandbookOpen] = useState(false);

  const [toStartDate, setToStartDate] = useState('');
  const [toEndDate, setToEndDate] = useState('');
  const [toLeaveType, setToLeaveType] = useState('pto');
  const [toRequestUnit, setToRequestUnit] = useState('full_day');
  const [toRequestedHours, setToRequestedHours] = useState('');
  const [toNote, setToNote] = useState('');

  const [showAddLineForm, setShowAddLineForm] = useState(false);
  const [addLineType, setAddLineType] = useState<'DIRECT' | 'INDIRECT'>('INDIRECT');
  const [addLineHours, setAddLineHours] = useState('');
  const [addLineDate, setAddLineDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [addLineNote, setAddLineNote] = useState('');
  const [addLineTravelerId, setAddLineTravelerId] = useState('');
  const [addLineIndirectCodeId, setAddLineIndirectCodeId] = useState('');
  const [showAllTravelers, setShowAllTravelers] = useState(false);
  const [travelerSearchFilter, setTravelerSearchFilter] = useState('');
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editLineHours, setEditLineHours] = useState('');
  const [editLineDate, setEditLineDate] = useState('');
  const [editLineNote, setEditLineNote] = useState('');
  const [showCertifyConfirm, setShowCertifyConfirm] = useState(false);
  const [certificationChecked, setCertificationChecked] = useState(false);

  // Update time every second for clock display
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const {
    data: employee,
    isLoading: employeeLoading,
    error: employeeError,
  } = useQuery({
    queryKey: ['/api/employee-portal', portalId],
    queryFn: async () => {
      const response = await fetch(`/api/employee-portal/${portalId}`);
      if (!response.ok) throw new Error('Failed to authenticate portal access');
      return response.json();
    },
    enabled: !!portalId,
  });

  const { data: certifications = [] } = useQuery({
    queryKey: ['/api/employee-certifications', { employeeId: employee?.id }],
    queryFn: async () => {
      const response = await fetch(
        `/api/employee-certifications?employeeId=${employee.id}`
      );
      if (!response.ok) throw new Error('Failed to fetch certifications');
      return response.json();
    },
    enabled: !!employee?.id,
  });

  const { data: evaluations = [] } = useQuery({
    queryKey: ['/api/evaluations', { employeeId: employee?.id }],
    queryFn: async () => {
      const response = await fetch(
        `/api/evaluations?employeeId=${employee.id}`
      );
      if (!response.ok) throw new Error('Failed to fetch evaluations');
      return response.json();
    },
    enabled: !!employee?.id,
  });

  const { data: punchAwareness } = useQuery<PunchAwareness>({
    queryKey: ['/api/labor/awareness-by-employee', employee?.id],
    queryFn: async () => {
      const response = await fetch(
        `/api/labor/awareness-by-employee/${employee.id}`
      );
      if (!response.ok) throw new Error('Failed to fetch punch awareness');
      return response.json();
    },
    enabled: !!employee?.id,
    refetchInterval: 60000,
  });

  const { data: timeOffRequests = [], refetch: refetchTimeOff } = useQuery<TimeOffRequest[]>({
    queryKey: ['/api/timekeeping/time-off/portal', portalId],
    queryFn: async () => {
      const response = await fetch(`/api/timekeeping/time-off/portal/${portalId}`);
      if (!response.ok) throw new Error('Failed to fetch time-off requests');
      return response.json();
    },
    enabled: !!portalId && !!employee?.id,
  });

  const submitTimeOffMutation = useMutation({
    mutationFn: async (data: { startDate: string; endDate: string; leaveType: string; requestUnit: string; requestedHours?: number; employeeNote?: string }) => {
      const response = await fetch(`/api/timekeeping/time-off/portal/${portalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Failed to submit request');
      return json;
    },
    onSuccess: () => {
      toast({ title: 'Request submitted', description: 'Your time-off request has been submitted for review.' });
      setToStartDate('');
      setToEndDate('');
      setToLeaveType('pto');
      setToRequestUnit('full_day');
      setToRequestedHours('');
      setToNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/time-off/portal', portalId] });
    },
    onError: (err: Error) => {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    },
  });

  const currentWeekStart = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().slice(0, 10);
  }, []);

  const isSalariedEmployee = employee?.payType?.toUpperCase() === 'SALARY';

  const { data: draftFeatureFlagData } = useQuery<{ enabled: boolean }>({
    queryKey: ['/api/timekeeping/labor-entry-drafts/feature-enabled'],
    staleTime: 5 * 60 * 1000,
  });
  const draftFeatureEnabled = draftFeatureFlagData?.enabled === true;

  const { data: salariedTimesheetView, isLoading: salariedLoading } =
    useQuery<SalariedTimesheetView>({
      queryKey: ['/api/timekeeping/salaried-timesheet', portalId, currentWeekStart],
      queryFn: async () => {
        const response = await fetch(
          `/api/timekeeping/salaried-timesheet/portal/${portalId}/my/${currentWeekStart}`
        );
        if (!response.ok) {
          if (response.status === 404 || response.status === 403) return null as any;
          throw new Error('Failed to load salaried timesheet');
        }
        return response.json();
      },
      enabled: !!portalId && !!employee?.id && isSalariedEmployee,
    });

  const { data: indirectCodes = [] } = useQuery<IndirectCode[]>({
    queryKey: ['/api/timekeeping/salaried-timesheet/indirect-codes-portal', portalId],
    queryFn: async () => {
      const response = await fetch(`/api/timekeeping/salaried-timesheet/portal/${portalId}/indirect-codes`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!portalId && isSalariedEmployee && showAddLineForm && addLineType === 'INDIRECT',
  });

  const { data: travelerSuggestions } = useQuery<{ suggestions: TravelerSuggestion[]; hasMore: boolean }>({
    queryKey: ['/api/timekeeping/travelers/suggest', portalId],
    queryFn: async () => {
      const response = await fetch(`/api/timekeeping/salaried-timesheet/portal/${portalId}/travelers/suggest`);
      if (!response.ok) return { suggestions: [], hasMore: false };
      return response.json();
    },
    enabled: !!portalId && isSalariedEmployee && showAddLineForm && addLineType === 'DIRECT',
  });

  const { data: allTravelers = [] } = useQuery<TravelerSuggestion[]>({
    queryKey: ['/api/timekeeping/travelers/all', portalId],
    queryFn: async () => {
      const response = await fetch(`/api/timekeeping/salaried-timesheet/portal/${portalId}/travelers/all`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!portalId && isSalariedEmployee && showAddLineForm && addLineType === 'DIRECT' && showAllTravelers,
  });

  const tsId = salariedTimesheetView?.timesheet?.id;
  const tsQueryKey = ['/api/timekeeping/salaried-timesheet', portalId, currentWeekStart];

  const addLineMutation = useMutation({
    mutationFn: async (data: { lineType: string; travelerId?: string | null; indirectCodeId?: number | null; hours: number; date: string; note?: string }) => {
      const response = await fetch(`/api/timekeeping/salaried-timesheet/portal/${portalId}/timesheets/${tsId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Failed to add line');
      return json;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(tsQueryKey, data);
      setShowAddLineForm(false);
      setAddLineHours('');
      setAddLineNote('');
      setAddLineTravelerId('');
      setAddLineIndirectCodeId('');
      toast({ title: 'Line added', description: 'Labor line added to your timesheet.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const updateLineMutation = useMutation({
    mutationFn: async ({ lineId, data }: { lineId: number; data: { hours?: number; date?: string; note?: string | null } }) => {
      const response = await fetch(`/api/timekeeping/salaried-timesheet/portal/${portalId}/timesheets/${tsId}/lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Failed to update line');
      return json;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(tsQueryKey, data);
      setEditingLineId(null);
      toast({ title: 'Line updated', description: 'Labor line updated.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (lineId: number) => {
      const response = await fetch(`/api/timekeeping/salaried-timesheet/portal/${portalId}/timesheets/${tsId}/lines/${lineId}`, {
        method: 'DELETE',
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Failed to delete line');
      return json;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(tsQueryKey, data);
      toast({ title: 'Line removed', description: 'Labor line removed from timesheet.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const certifyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/timekeeping/salaried-timesheet/portal/${portalId}/certify/${tsId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificationConfirmed: true }),
        }
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Failed to submit timesheet');
      return json;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(tsQueryKey, data);
      setShowCertifyConfirm(false);
      setCertificationChecked(false);
      toast({ title: 'Timesheet submitted', description: 'Your timesheet has been submitted for supervisor review.' });
    },
    onError: (err: Error) => {
      setShowCertifyConfirm(false);
      setCertificationChecked(false);
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const approvedLeaveToday = timeOffRequests.find(
    (r) => r.status === 'approved' && r.startDate <= today && r.endDate >= today
  );

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      ACTIVE: 'bg-green-100 text-green-800',
      EXPIRED: 'bg-red-100 text-red-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      DRAFT: 'bg-gray-100 text-gray-800',
      SUBMITTED: 'bg-blue-100 text-blue-800',
      COMPLETED: 'bg-green-100 text-green-800',
    };

    return (
      <Badge
        className={
          statusColors[status as keyof typeof statusColors] ||
          'bg-gray-100 text-gray-800'
        }
      >
        {status}
      </Badge>
    );
  };

  const activeCertifications = certifications.filter(
    (cert: Certification) => cert.status === 'ACTIVE'
  );
  const expiringSoon = certifications.filter((cert: Certification) => {
    if (!cert.dateExpiry || cert.status !== 'ACTIVE') return false;
    const expiryDate = new Date(cert.dateExpiry);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiryDate <= thirtyDaysFromNow;
  });

  const recentEvaluations = evaluations
    .filter((evaluation: Evaluation) => evaluation.status === 'COMPLETED')
    .slice(0, 3);

  if (employeeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (employeeError || !employee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
        <Card className="max-w-md border-red-200 bg-red-50">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-red-700 mb-2">
              Access Denied
            </h2>
            <p className="text-red-600">
              Invalid or expired portal link. Please contact HR for assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome, {employee.name}!
          </h1>
          <p className="text-gray-600">
            {employee.role} • {employee.department}
          </p>
          <p className="text-sm text-gray-500 mt-1">Employee Portal</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Certifications
              </CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {activeCertifications.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Current certifications
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Expiring Soon
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {expiringSoon.length}
              </div>
              <p className="text-xs text-muted-foreground">Next 30 days</p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Employment Type
              </CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                {employee.employmentType || 'Full-time'}
              </div>
              <p className="text-xs text-muted-foreground">
                Since {formatDate(employee.hireDate)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Current Time
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-blue-600">
                {formatTime(currentTime)}
              </div>
              <p className="text-xs text-muted-foreground">
                {currentTime.toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Portal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Employee Handbook */}
          <Card
            className="bg-white/80 backdrop-blur-sm hover:bg-white/90 transition-all cursor-pointer group"
            onClick={() => setHandbookOpen(true)}
          >
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <span>Employee Handbook</span>
                <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </CardTitle>
              <CardDescription>
                Access company policies, procedures, and guidelines
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span>Company Policies</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-green-400" />
                  <span>Safety Procedures</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Award className="w-4 h-4 text-purple-400" />
                  <span>Benefits Guide</span>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                <BookOpen className="w-4 h-4 mr-2" />
                View Handbook
              </Button>
            </CardContent>
          </Card>

          {/* Certifications */}
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Award className="w-5 h-5 text-green-600" />
                <span>My Certifications</span>
              </CardTitle>
              <CardDescription>
                View your training certificates and compliance status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                {activeCertifications.slice(0, 2).map((cert: Certification) => (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">
                      {cert.certification?.name || 'Unknown'}
                    </span>
                    {getStatusBadge(cert.status)}
                  </div>
                ))}
                {activeCertifications.length === 0 && (
                  <p className="text-sm text-gray-500">
                    No active certifications
                  </p>
                )}
              </div>
              <Link href="/training/my-training?tab=forklift">
                <Button variant="outline" className="w-full">
                  <Award className="w-4 h-4 mr-2" />
                  Open Training Center
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Performance Evaluations */}
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <span>Performance Reviews</span>
              </CardTitle>
              <CardDescription>
                Access your performance evaluations and feedback
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                {recentEvaluations.slice(0, 2).map((evaluation: Evaluation) => (
                  <div
                    key={evaluation.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>
                      {formatDate(evaluation.evaluationPeriodStart)} -{' '}
                      {formatDate(evaluation.evaluationPeriodEnd)}
                    </span>
                    <div className="flex items-center space-x-1">
                      {evaluation.overallRating && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {evaluation.overallRating}/5
                        </span>
                      )}
                      {getStatusBadge(evaluation.status)}
                    </div>
                  </div>
                ))}
                {recentEvaluations.length === 0 && (
                  <p className="text-sm text-gray-500">
                    No completed evaluations
                  </p>
                )}
              </div>
              <Button variant="outline" className="w-full" disabled>
                <FileText className="w-4 h-4 mr-2" />
                View All Evaluations
              </Button>
            </CardContent>
          </Card>

          {/* Time Clock */}
          <Card className={`bg-white/80 backdrop-blur-sm hover:bg-white/90 transition-all group ${
            punchAwareness?.state !== 'looks_good' ? 'ring-1 ring-amber-200' : ''
          }`}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <span>Time Clock</span>
                {punchAwareness?.state !== 'looks_good' && (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
              </CardTitle>
              <CardDescription>
                Clock in/out and view your timesheet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center mb-4">
                <div className="text-2xl font-bold text-indigo-600">
                  {formatTime(currentTime)}
                </div>
                <p className="text-sm text-gray-500">
                  {currentTime.toLocaleDateString()}
                </p>
              </div>
              
              {approvedLeaveToday && (
                <div className="mb-4 p-3 bg-teal-50 border border-teal-100 rounded-lg">
                  <p className="text-sm text-teal-800">
                    You have approved {approvedLeaveToday.leaveType.toUpperCase()} today. You may still clock in if needed.
                  </p>
                </div>
              )}
              {punchAwareness?.state !== 'looks_good' && punchAwareness?.message && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <p className="text-sm text-amber-800">
                    {punchAwareness.message}
                  </p>
                </div>
              )}
              
              <Button
                variant={punchAwareness?.state !== 'looks_good' ? 'default' : 'default'}
                className="w-full"
                onClick={() => {
                  const baseUrl = import.meta.env.VITE_TIME_CLOCK_URL || '';
                  if (!baseUrl) {
                    console.warn('Time Clock URL not configured');
                    return;
                  }
                  const params = new URLSearchParams();
                  if (employee?.email) {
                    params.set('email', employee.email);
                  }
                  params.set('source', 'epoch');
                  const url = `${baseUrl}/employee/login?${params.toString()}`;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                data-testid="button-open-timeclock"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {punchAwareness?.actionText || 'Open Time Clock'}
              </Button>
              <p className="text-xs text-gray-500 text-center mt-2">
                Time Clock opens in a separate system for security.
              </p>
            </CardContent>
          </Card>

          {/* Checklist */}
          <Card
            className="bg-white/80 backdrop-blur-sm hover:bg-white/90 transition-all cursor-pointer group"
            onClick={() => setChecklistOpen(true)}
          >
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CheckSquare className="w-5 h-5 text-orange-600" />
                <span>Daily Checklist</span>
                <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </CardTitle>
              <CardDescription>
                Complete your daily tasks and safety checks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                <div className="flex items-center space-x-2 text-sm">
                  <CheckSquare className="w-4 h-4 text-green-400" />
                  <span className="text-gray-600">Safety inspection</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <CheckSquare className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Equipment check</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <CheckSquare className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Quality review</span>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                <CheckSquare className="w-4 h-4 mr-2" />
                Open Checklist
              </Button>
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card className="bg-white/80 backdrop-blur-sm hover:bg-white/90 transition-all cursor-pointer group">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-red-600" />
                <span>Upcoming Events</span>
                <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </CardTitle>
              <CardDescription>
                Company events, training, and important dates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                <div className="text-sm text-gray-500">
                  No upcoming events scheduled
                </div>
              </div>
              <Button variant="outline" className="w-full" disabled>
                <Calendar className="w-4 h-4 mr-2" />
                View Calendar
              </Button>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Coming Soon
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Salaried Timesheet Section — only visible to SALARY employees */}
        {isSalariedEmployee && (
          <div className="mb-8">
            <Card className="bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <ClipboardList className="w-5 h-5 text-indigo-600" />
                      <span>Salaried Timesheet</span>
                      {salariedTimesheetView && (() => {
                        const s = salariedTimesheetView.timesheet.status;
                        const colors: Record<string, string> = {
                          OPEN: 'bg-blue-100 text-blue-700',
                          REOPENED: 'bg-orange-100 text-orange-700',
                          SUBMITTED: 'bg-yellow-100 text-yellow-800',
                          SUPERVISOR_APPROVED: 'bg-purple-100 text-purple-800',
                          PAYROLL_APPROVED: 'bg-green-100 text-green-800',
                        };
                        return (
                          <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${colors[s] ?? 'bg-gray-100 text-gray-700'}`}>
                            {s.replace('_', ' ')}
                          </span>
                        );
                      })()}
                    </CardTitle>
                    <CardDescription>
                      Week of {currentWeekStart} — {(() => {
                        const d = new Date(currentWeekStart);
                        d.setDate(d.getDate() + 6);
                        return d.toISOString().slice(0, 10);
                      })()}
                    </CardDescription>
                  </div>
                  {portalId && draftFeatureEnabled && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/employee-portal/${portalId}/drafts`}>
                        <button className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
                          <ClipboardList className="w-3 h-3" />
                          My Drafts
                        </button>
                      </Link>
                      <Link href={`/employee-portal/${portalId}/time-entry`}>
                        <button className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors">
                          <Plus className="w-3 h-3" />
                          Enter Time
                        </button>
                      </Link>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {salariedLoading ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading timesheet…</span>
                  </div>
                ) : !salariedTimesheetView ? (
                  <div className="flex items-start gap-2 text-sm text-gray-500 p-3 bg-gray-50 rounded">
                    <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                    <span>Salaried timesheet tracking is not yet enabled for your account.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Line list */}
                    <div className="space-y-1">
                      {salariedTimesheetView.lines.length === 0 && (
                        <p className="text-sm text-gray-500 py-2">No lines this week yet.</p>
                      )}
                      {salariedTimesheetView.lines.map((line) => {
                        const isEditing = editingLineId === line.id;
                        if (isEditing) {
                          return (
                            <div key={line.id} className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs font-medium text-gray-600">Hours</label>
                                  <Input
                                    type="number"
                                    min="0.5"
                                    max="24"
                                    step="0.5"
                                    value={editLineHours}
                                    onChange={e => setEditLineHours(e.target.value)}
                                    className="mt-1 h-8 text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-gray-600">Date</label>
                                  <Input
                                    type="date"
                                    value={editLineDate}
                                    onChange={e => setEditLineDate(e.target.value)}
                                    className="mt-1 h-8 text-sm"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600">Note (optional)</label>
                                <Input
                                  value={editLineNote}
                                  onChange={e => setEditLineNote(e.target.value)}
                                  className="mt-1 h-8 text-sm"
                                  placeholder="Optional note"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                  disabled={updateLineMutation.isPending || !editLineHours || !editLineDate || parseFloat(editLineHours) <= 0}
                                  onClick={() => {
                                    updateLineMutation.mutate({
                                      lineId: line.id,
                                      data: { hours: parseFloat(editLineHours), date: editLineDate, note: editLineNote || null },
                                    });
                                  }}
                                >
                                  {updateLineMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingLineId(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={line.id}
                            className={`flex items-center justify-between text-sm py-2 px-3 rounded border ${
                              line.isLocked ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {line.isLocked ? (
                                <Lock className="w-3 h-3 text-gray-400 shrink-0" />
                              ) : (
                                <span className={`w-2 h-2 rounded-full shrink-0 ${
                                  line.lineType === 'DIRECT' ? 'bg-blue-400' : 'bg-purple-400'
                                }`} />
                              )}
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${
                                line.lineType === 'HOLIDAY' ? 'bg-amber-100 text-amber-800'
                                  : line.lineType === 'PTO' ? 'bg-teal-100 text-teal-800'
                                  : line.lineType === 'DIRECT' ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}>
                                {line.lineType}
                              </span>
                              <span className="text-gray-600 shrink-0">{line.date}</span>
                              {line.note && (
                                <span className="text-gray-400 truncate max-w-40 text-xs">{line.note}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-semibold text-gray-800">{Number(line.hours).toFixed(1)}h</span>
                              {line.isLocked ? (
                                <span className="text-xs text-gray-400">locked</span>
                              ) : (salariedTimesheetView.timesheet.status === 'OPEN' || salariedTimesheetView.timesheet.status === 'REOPENED') ? (
                                <>
                                  <button
                                    className="text-gray-400 hover:text-indigo-600 transition-colors"
                                    title="Edit line"
                                    onClick={() => {
                                      setEditingLineId(line.id);
                                      setEditLineHours(String(line.hours));
                                      setEditLineDate(line.date);
                                      setEditLineNote(line.note ?? '');
                                    }}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                    title="Delete line"
                                    disabled={deleteLineMutation.isPending}
                                    onClick={() => deleteLineMutation.mutate(line.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add line form */}
                    {(salariedTimesheetView.timesheet.status === 'OPEN' || salariedTimesheetView.timesheet.status === 'REOPENED') && (
                      <div>
                        {!showAddLineForm ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50"
                            onClick={() => setShowAddLineForm(true)}
                          >
                            <Plus className="w-4 h-4 mr-1" /> Add Line
                          </Button>
                        ) : (
                          <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-indigo-800">Add Labor Line</span>
                              <button onClick={() => setShowAddLineForm(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div>
                              <label className="text-xs font-medium text-gray-600">Type</label>
                              <Select value={addLineType} onValueChange={(v) => { setAddLineType(v as 'DIRECT' | 'INDIRECT'); setAddLineTravelerId(''); setAddLineIndirectCodeId(''); setShowAllTravelers(false); setTravelerSearchFilter(''); }}>
                                <SelectTrigger className="mt-1 h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="DIRECT">Direct Labor (Traveler)</SelectItem>
                                  <SelectItem value="INDIRECT">Indirect Labor</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {addLineType === 'INDIRECT' && (
                              <div>
                                <label className="text-xs font-medium text-gray-600">Indirect Code</label>
                                <Select value={addLineIndirectCodeId} onValueChange={setAddLineIndirectCodeId}>
                                  <SelectTrigger className="mt-1 h-8 text-sm">
                                    <SelectValue placeholder="Select indirect code…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {indirectCodes.filter(c => c.isActive).map(code => (
                                      <SelectItem key={code.id} value={String(code.id)}>
                                        {code.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {addLineType === 'DIRECT' && (
                              <div>
                                <label className="text-xs font-medium text-gray-600">Traveler</label>
                                <div className="mt-1 space-y-1">
                                  {showAllTravelers && (
                                    <input
                                      type="text"
                                      value={travelerSearchFilter}
                                      onChange={e => setTravelerSearchFilter(e.target.value)}
                                      placeholder="Filter by traveler # or project…"
                                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-indigo-400"
                                    />
                                  )}
                                  {(() => {
                                    const list = showAllTravelers
                                      ? allTravelers.filter(t => {
                                          if (!travelerSearchFilter.trim()) return true;
                                          const q = travelerSearchFilter.toLowerCase();
                                          return (
                                            t.travelerNumber?.toLowerCase().includes(q) ||
                                            t.projectName?.toLowerCase().includes(q) ||
                                            t.chargeCodeLabel?.toLowerCase().includes(q)
                                          );
                                        })
                                      : (travelerSuggestions?.suggestions ?? []);
                                    return (
                                      <>
                                        {list.map(t => (
                                          <button
                                            key={t.travelerId}
                                            onClick={() => setAddLineTravelerId(t.travelerId)}
                                            className={`w-full text-left px-3 py-2 rounded text-sm border transition-colors ${
                                              addLineTravelerId === t.travelerId
                                                ? 'bg-indigo-100 border-indigo-400 text-indigo-800'
                                                : 'bg-white border-gray-200 hover:border-indigo-300'
                                            }`}
                                          >
                                            <div className="font-medium">{t.travelerNumber}</div>
                                            {(t.projectName || t.chargeCodeLabel) && (
                                              <div className="text-xs text-gray-400">
                                                {t.projectName}{t.projectName && t.chargeCodeLabel ? ' · ' : ''}{t.chargeCodeLabel}
                                              </div>
                                            )}
                                          </button>
                                        ))}
                                        {list.length === 0 && (
                                          <p className="text-xs text-gray-400 py-1">No travelers available.</p>
                                        )}
                                      </>
                                    );
                                  })()}
                                  {!showAllTravelers && travelerSuggestions?.hasMore && (
                                    <button
                                      onClick={() => { setShowAllTravelers(true); setTravelerSearchFilter(''); }}
                                      className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1"
                                    >
                                      <ChevronDown className="w-3 h-3" /> Show all travelers
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-medium text-gray-600">Hours</label>
                                <Input
                                  type="number"
                                  min="0.5"
                                  max="24"
                                  step="0.5"
                                  value={addLineHours}
                                  onChange={e => setAddLineHours(e.target.value)}
                                  className="mt-1 h-8 text-sm"
                                  placeholder="8"
                                />
                                {addLineHours !== '' && parseFloat(addLineHours) <= 0 && (
                                  <p className="text-xs text-red-500 mt-0.5">Hours must be greater than 0.</p>
                                )}
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600">Date</label>
                                <Input
                                  type="date"
                                  value={addLineDate}
                                  onChange={e => setAddLineDate(e.target.value)}
                                  className="mt-1 h-8 text-sm"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-medium text-gray-600">Description <span className="text-gray-400">(optional)</span></label>
                              <Input
                                value={addLineNote}
                                onChange={e => setAddLineNote(e.target.value)}
                                className="mt-1 h-8 text-sm"
                                placeholder="What did you work on?"
                              />
                            </div>

                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                disabled={
                                  addLineMutation.isPending ||
                                  !addLineHours ||
                                  parseFloat(addLineHours) <= 0 ||
                                  !addLineDate ||
                                  (addLineType === 'DIRECT' && !addLineTravelerId) ||
                                  (addLineType === 'INDIRECT' && !addLineIndirectCodeId)
                                }
                                onClick={() => {
                                  addLineMutation.mutate({
                                    lineType: addLineType,
                                    travelerId: addLineType === 'DIRECT' ? addLineTravelerId : null,
                                    indirectCodeId: addLineType === 'INDIRECT' ? parseInt(addLineIndirectCodeId) : null,
                                    hours: parseFloat(addLineHours),
                                    date: addLineDate,
                                    note: addLineNote || undefined,
                                  });
                                }}
                              >
                                {addLineMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                                Add Line
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setShowAddLineForm(false)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* DCAA Certification — checkbox + statement required before submit */}
                    {(salariedTimesheetView.timesheet.status === 'OPEN' || salariedTimesheetView.timesheet.status === 'REOPENED') && (
                      <div className="pt-3 border-t border-gray-100 space-y-3">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                          <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Employee Certification Required</p>
                          <p className="text-sm text-amber-800 italic leading-relaxed">
                            "I certify that the time recorded for this period is complete, accurate, and represents work I actually performed."
                          </p>
                          <label className="flex items-start gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={certificationChecked}
                              onChange={e => setCertificationChecked(e.target.checked)}
                              className="mt-0.5 w-4 h-4 rounded border-amber-400 text-indigo-600 focus:ring-indigo-500 shrink-0"
                            />
                            <span className="text-sm text-amber-800 font-medium">
                              I confirm the above certification statement is true and accurate.
                            </span>
                          </label>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-indigo-600 hover:bg-indigo-700 text-white"
                              disabled={!certificationChecked || certifyMutation.isPending}
                              onClick={() => certifyMutation.mutate()}
                            >
                              {certifyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                              Submit for Approval
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Certification block — shown after submission */}
                    {!['OPEN', 'REOPENED'].includes(salariedTimesheetView.timesheet.status) && (
                      <div className="pt-2 border-t border-gray-100 space-y-2">
                        {salariedTimesheetView.timesheet.certificationStatement && (
                          <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-1">
                            <p className="text-xs font-semibold text-green-800 uppercase tracking-wide flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Employee Certified
                            </p>
                            <p className="text-xs text-green-700">
                              <span className="font-medium">Certified By:</span> You (employee self-certification)
                            </p>
                            <p className="text-xs text-green-700">
                              <span className="font-medium">Certified At:</span>{' '}
                              {salariedTimesheetView.timesheet.certifiedAt
                                ? new Date(salariedTimesheetView.timesheet.certifiedAt).toLocaleString()
                                : '—'}
                            </p>
                            <p className="text-xs text-green-700 italic border-t border-green-200 pt-1 mt-1">
                              Statement: "{salariedTimesheetView.timesheet.certificationStatement}"
                            </p>
                            {salariedTimesheetView.timesheet.certificationVersion && (
                              <p className="text-xs text-green-600">
                                <span className="font-medium">Statement Version:</span> v{salariedTimesheetView.timesheet.certificationVersion}
                              </p>
                            )}
                          </div>
                        )}
                        <div className={`flex items-center gap-2 text-sm p-2 rounded ${
                          salariedTimesheetView.timesheet.status === 'PAYROLL_APPROVED'
                            ? 'bg-green-50 text-green-700'
                            : salariedTimesheetView.timesheet.status === 'SUPERVISOR_APPROVED'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-yellow-50 text-yellow-700'
                        }`}>
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>
                            {salariedTimesheetView.timesheet.status === 'SUBMITTED' && 'Submitted — awaiting supervisor review.'}
                            {salariedTimesheetView.timesheet.status === 'SUPERVISOR_APPROVED' && 'Supervisor approved — awaiting payroll approval.'}
                            {salariedTimesheetView.timesheet.status === 'PAYROLL_APPROVED' && 'Payroll approved. Timesheet finalized.'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Time Off Request Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Request Form */}
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CalendarOff className="w-5 h-5 text-teal-600" />
                <span>Request Time Off</span>
              </CardTitle>
              <CardDescription>
                Submit a leave request for PTO, sick time, or other leave
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {approvedLeaveToday && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
                  <p className="text-sm text-teal-800 font-medium">
                    You have approved time off today ({approvedLeaveToday.leaveType.toUpperCase()}).
                  </p>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-sm">Request Type</Label>
                <Select value={toRequestUnit} onValueChange={setToRequestUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_day">Full Day</SelectItem>
                    <SelectItem value="half_day">Half Day</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="multi_day">Multi-Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">Start Date</Label>
                  <Input
                    type="date"
                    value={toStartDate}
                    onChange={e => setToStartDate(e.target.value)}
                    min={today}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">{toRequestUnit === 'full_day' || toRequestUnit === 'half_day' || toRequestUnit === 'hourly' ? 'Date' : 'End Date'}</Label>
                  <Input
                    type="date"
                    value={toEndDate}
                    onChange={e => setToEndDate(e.target.value)}
                    min={toStartDate || today}
                  />
                </div>
              </div>
              {toRequestUnit === 'hourly' && (
                <div className="space-y-1">
                  <Label className="text-sm">Hours Requested</Label>
                  <Input
                    type="number"
                    min="0.5"
                    max="8"
                    step="0.5"
                    placeholder="e.g. 2"
                    value={toRequestedHours}
                    onChange={e => setToRequestedHours(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-sm">Note <span className="text-gray-400 text-xs">(optional)</span></Label>
                <Textarea
                  placeholder="Any additional details…"
                  value={toNote}
                  onChange={e => setToNote(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>
              <Button
                className="w-full"
                disabled={
                  !toStartDate || !toEndDate || toStartDate > toEndDate ||
                  (toRequestUnit === 'hourly' && (!toRequestedHours || parseFloat(toRequestedHours) <= 0)) ||
                  submitTimeOffMutation.isPending
                }
                onClick={() => {
                  submitTimeOffMutation.mutate({
                    startDate: toStartDate,
                    endDate: toEndDate,
                    leaveType: toLeaveType,
                    requestUnit: toRequestUnit,
                    requestedHours: toRequestUnit === 'hourly' && toRequestedHours ? parseFloat(toRequestedHours) : undefined,
                    employeeNote: toNote.trim() || undefined,
                  });
                }}
              >
                {submitTimeOffMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Request
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* My Requests List */}
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-teal-600" />
                <span>My Time-Off Requests</span>
              </CardTitle>
              <CardDescription>
                View the status of your submitted requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timeOffRequests.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No requests submitted yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {timeOffRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-start justify-between p-3 rounded-lg border bg-gray-50 text-sm"
                    >
                      <div className="space-y-0.5">
                        <div className="font-medium">
                          {req.startDate} – {req.endDate}
                        </div>
                        <div className="text-gray-500 capitalize text-xs">
                          {req.leaveType.toUpperCase()}
                          {req.requestUnit && req.requestUnit !== 'full_day' && (
                            <span className="ml-1">· {req.requestUnit.replace('_', ' ')}</span>
                          )}
                          {req.requestedHours != null && (
                            <span className="ml-1">· {req.requestedHours}h</span>
                          )}
                          {req.employeeNote && <span className="ml-1">· {req.employeeNote}</span>}
                        </div>
                        {(req.status === 'rejected' || req.status === 'denied') && (
                          <div className="text-red-500 text-xs mt-0.5">
                            {req.supervisorNote && <span>Supervisor: {req.supervisorNote}</span>}
                            {req.hrNote && <span>HR: {req.hrNote}</span>}
                            {req.vpNote && <span>VP: {req.vpNote}</span>}
                            {req.adminNote && <span>{req.adminNote}</span>}
                          </div>
                        )}
                      </div>
                      <div className="ml-3 shrink-0">
                        {(req.status === 'pending' || req.status === 'pending_supervisor') && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            Pending Supervisor
                          </span>
                        )}
                        {req.status === 'pending_hr' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            Pending HR
                          </span>
                        )}
                        {req.status === 'pending_vp' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            Pending VP
                          </span>
                        )}
                        {req.status === 'approved' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Approved
                          </span>
                        )}
                        {(req.status === 'rejected' || req.status === 'denied') && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Rejected
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Employee Information */}
        <Card className="bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>My Information</span>
            </CardTitle>
            <CardDescription>Your current employment details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-center space-x-3">
                <Mail className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-gray-600">
                    {employee.email || 'Not specified'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Phone className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Phone</p>
                  <p className="text-sm text-gray-600">
                    {employee.phone || 'Not specified'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Building className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Department</p>
                  <p className="text-sm text-gray-600">
                    {employee.department || 'Not specified'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Calendar className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Hire Date</p>
                  <p className="text-sm text-gray-600">
                    {formatDate(employee.hireDate)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>Employee Portal • EPOCH Manufacturing ERP System</p>
          <p className="mt-1">For technical support, contact IT or HR</p>
        </div>
      </div>

      {/* Modals */}
      <DailyChecklistModal
        employeeId={employee?.id || 0}
        department={employee?.department || 'General'}
        isOpen={checklistOpen}
        onClose={() => setChecklistOpen(false)}
      />

      <HandbookModal
        isOpen={handbookOpen}
        onClose={() => setHandbookOpen(false)}
      />
    </div>
  );
}
