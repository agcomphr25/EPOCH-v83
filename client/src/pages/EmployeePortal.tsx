import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
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
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Employee {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  employmentType: string;
  hireDate: string;
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

export default function EmployeePortal() {
  const { portalId } = useParams();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second for clock display
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: employee, isLoading: employeeLoading, error: employeeError } = useQuery({
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
      const response = await fetch(`/api/employee-certifications?employeeId=${employee.id}`);
      if (!response.ok) throw new Error('Failed to fetch certifications');
      return response.json();
    },
    enabled: !!employee?.id,
  });

  const { data: evaluations = [] } = useQuery({
    queryKey: ['/api/evaluations', { employeeId: employee?.id }],
    queryFn: async () => {
      const response = await fetch(`/api/evaluations?employeeId=${employee.id}`);
      if (!response.ok) throw new Error('Failed to fetch evaluations');
      return response.json();
    },
    enabled: !!employee?.id,
  });

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
      <Badge className={statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'}>
        {status}
      </Badge>
    );
  };

  const activeCertifications = certifications.filter((cert: Certification) => cert.status === 'ACTIVE');
  const expiringSoon = certifications.filter((cert: Certification) => {
    if (!cert.dateExpiry || cert.status !== 'ACTIVE') return false;
    const expiryDate = new Date(cert.dateExpiry);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiryDate <= thirtyDaysFromNow;
  });

  const recentEvaluations = evaluations.filter((evaluation: Evaluation) => evaluation.status === 'COMPLETED').slice(0, 3);

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
            <h2 className="text-lg font-semibold text-red-700 mb-2">Access Denied</h2>
            <p className="text-red-600">Invalid or expired portal link. Please contact HR for assistance.</p>
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome, {employee.name}!</h1>
          <p className="text-gray-600">{employee.role} • {employee.department}</p>
          <p className="text-sm text-gray-500 mt-1">Employee Portal</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Certifications</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeCertifications.length}</div>
              <p className="text-xs text-muted-foreground">Current certifications</p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{expiringSoon.length}</div>
              <p className="text-xs text-muted-foreground">Next 30 days</p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Employment Type</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{employee.employmentType || 'Full-time'}</div>
              <p className="text-xs text-muted-foreground">Since {formatDate(employee.hireDate)}</p>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-blue-600">{formatTime(currentTime)}</div>
              <p className="text-xs text-muted-foreground">{currentTime.toLocaleDateString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Portal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Employee Handbook */}
          <Card className="bg-white/80 backdrop-blur-sm hover:bg-white/90 transition-all cursor-pointer group">
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
              <Button variant="outline" className="w-full" disabled>
                <BookOpen className="w-4 h-4 mr-2" />
                View Handbook
              </Button>
              <p className="text-xs text-gray-500 mt-2 text-center">Coming Soon</p>
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
                  <div key={cert.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{cert.certification?.name || 'Unknown'}</span>
                    {getStatusBadge(cert.status)}
                  </div>
                ))}
                {activeCertifications.length === 0 && (
                  <p className="text-sm text-gray-500">No active certifications</p>
                )}
              </div>
              <Button variant="outline" className="w-full" disabled>
                <Award className="w-4 h-4 mr-2" />
                View All Certifications
              </Button>
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
                  <div key={evaluation.id} className="flex items-center justify-between text-sm">
                    <span>
                      {formatDate(evaluation.evaluationPeriodStart)} - {formatDate(evaluation.evaluationPeriodEnd)}
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
                  <p className="text-sm text-gray-500">No completed evaluations</p>
                )}
              </div>
              <Button variant="outline" className="w-full" disabled>
                <FileText className="w-4 h-4 mr-2" />
                View All Evaluations
              </Button>
            </CardContent>
          </Card>

          {/* Time Clock */}
          <Card className="bg-white/80 backdrop-blur-sm hover:bg-white/90 transition-all cursor-pointer group">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <span>Time Clock</span>
                <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </CardTitle>
              <CardDescription>
                Clock in/out and view your timesheet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center mb-4">
                <div className="text-2xl font-bold text-indigo-600">{formatTime(currentTime)}</div>
                <p className="text-sm text-gray-500">{currentTime.toLocaleDateString()}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" disabled>
                  Clock In
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Clock Out
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">Coming Soon</p>
            </CardContent>
          </Card>

          {/* Checklist */}
          <Card className="bg-white/80 backdrop-blur-sm hover:bg-white/90 transition-all cursor-pointer group">
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
                  <CheckSquare className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Safety inspection</span>
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
              <Button variant="outline" className="w-full" disabled>
                <CheckSquare className="w-4 h-4 mr-2" />
                Open Checklist
              </Button>
              <p className="text-xs text-gray-500 mt-2 text-center">Coming Soon</p>
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
              <p className="text-xs text-gray-500 mt-2 text-center">Coming Soon</p>
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
                  <p className="text-sm text-gray-600">{employee.email || 'Not specified'}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Phone className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Phone</p>
                  <p className="text-sm text-gray-600">{employee.phone || 'Not specified'}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Building className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Department</p>
                  <p className="text-sm text-gray-600">{employee.department || 'Not specified'}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Calendar className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Hire Date</p>
                  <p className="text-sm text-gray-600">{formatDate(employee.hireDate)}</p>
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
    </div>
  );
}