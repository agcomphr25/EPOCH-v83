import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Circle, ArrowUpDown, Calendar, Plus, Edit, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';

type TrainingMatrixEntry = {
  id: number;
  employeeId: number | null;
  employeeName: string | null;
  jobTitle: string | null;
  department: string | null;
  trainingName: string;
  lastCompleted: string | null;
  lastScore: number | null;
  status: string;
  notes: string | null;
};

type Certification = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
};

type EmployeeCertification = {
  id: number;
  employeeId: number;
  employeeName: string;
  jobTitle: string | null;
  department: string | null;
  certificationId: number;
  certificationName: string;
  dateEarned: string | null;
  expiryDate: string | null;
  isActive: boolean;
  notes: string | null;
};

type Evaluation = {
  id: number;
  employeeId: number;
  employeeName: string;
  jobTitle: string | null;
  department: string | null;
  evaluationType: string;
  evaluationPeriodStart: string;
  evaluationPeriodEnd: string;
  overallRating: number | null;
  strengths: string | null;
  areasForImprovement: string | null;
  goals: string | null;
  evaluatedBy: string | null;
  evaluatedAt: string | null;
  status: string;
};

export default function TrainingMatrixView() {
  const [activeTab, setActiveTab] = useState('standards');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'employee' | 'training'>('employee');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Dialog states for CRUD
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);

  const { data: matrixData, isLoading: matrixLoading } = useQuery<
    TrainingMatrixEntry[]
  >({
    queryKey: ['/api/training/matrix'],
  });

  const { data: certificationsData, isLoading: certsLoading } = useQuery<
    EmployeeCertification[]
  >({
    queryKey: ['/api/employees/certifications-matrix'],
  });

  const { data: evaluationsData, isLoading: evalsLoading } = useQuery<
    Evaluation[]
  >({
    queryKey: ['/api/employees/evaluations'],
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const renderStandardsTrainingTab = () => {
    if (matrixLoading) {
      return (
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      );
    }

    if (!matrixData || matrixData.length === 0) {
      return (
        <p className="text-muted-foreground">No training data available.</p>
      );
    }

    // Extract unique employees with their details
    const employeeMap = new Map<
      string,
      { name: string; jobTitle: string | null; department: string | null }
    >();
    matrixData.forEach((entry) => {
      if (entry.employeeName && !employeeMap.has(entry.employeeName)) {
        employeeMap.set(entry.employeeName, {
          name: entry.employeeName,
          jobTitle: entry.jobTitle,
          department: entry.department,
        });
      }
    });

    // Owners list - these should appear at the bottom
    const owners = ['Dave', 'Angie', 'Matt', 'Laurie'];
    const isOwner = (name: string) =>
      owners.some((owner) => name.toLowerCase().includes(owner.toLowerCase()));

    // Sort employees based on sortOrder, with owners always at the bottom
    const employees = Array.from(employeeMap.values()).sort((a, b) => {
      const aIsOwner = isOwner(a.name);
      const bIsOwner = isOwner(b.name);

      if (aIsOwner && !bIsOwner) return 1;
      if (!aIsOwner && bIsOwner) return -1;

      return sortOrder === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });

    const trainings = Array.from(
      new Set(matrixData.map((e) => e.trainingName))
    ).sort((a, b) =>
      sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
    );

    const filteredEmployees =
      viewMode === 'employee'
        ? searchTerm
          ? employees.filter((emp) =>
              emp.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
          : employees
        : employees;

    const filteredTrainings =
      viewMode === 'training'
        ? searchTerm
          ? trainings.filter((training) =>
              training.toLowerCase().includes(searchTerm.toLowerCase())
            )
          : trainings
        : trainings;

    const matrixMap = new Map<string, TrainingMatrixEntry>();
    matrixData.forEach((entry) => {
      const key = `${entry.employeeName}-${entry.trainingName}`;
      matrixMap.set(key, entry);
    });

    const getEntry = (employeeName: string, training: string) => {
      return matrixMap.get(`${employeeName}-${training}`);
    };

    const completedCount = (employeeName: string) => {
      return trainings.filter((training) => {
        const entry = getEntry(employeeName, training);
        return entry?.status === 'COMPLETED';
      }).length;
    };

    const trainingCompletedCount = (trainingName: string) => {
      return employees.filter((employee) => {
        const entry = getEntry(employee.name, trainingName);
        return entry?.status === 'COMPLETED';
      }).length;
    };

    const totalTrainings = trainings.length;
    const totalEmployees = employees.length;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-sm">
            {totalEmployees} Employees × {totalTrainings} Trainings
          </Badge>
          <div className="flex items-center gap-4">
            <Select
              value={viewMode}
              onValueChange={(value: 'employee' | 'training') =>
                setViewMode(value)
              }
            >
              <SelectTrigger className="w-48" data-testid="select-view-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Sort by Employee</SelectItem>
                <SelectItem value="training">Sort by Training</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              data-testid="button-toggle-sort"
            >
              <ArrowUpDown className="h-4 w-4 mr-2" />
              {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
            </Button>
            <Input
              placeholder={
                viewMode === 'employee'
                  ? 'Search employees...'
                  : 'Search trainings...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
              data-testid="input-search"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {viewMode === 'employee' ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 bg-background z-10 p-3 text-left font-semibold min-w-[200px]">
                    Employee
                  </th>
                  <th className="p-3 text-center font-semibold min-w-[100px]">
                    Progress
                  </th>
                  {trainings.map((training) => (
                    <th
                      key={training}
                      className="p-3 text-left font-bold min-w-[140px] border-l h-40 bg-muted/50"
                      data-testid={`header-training-${training.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <div className="transform -rotate-45 origin-left text-sm whitespace-nowrap font-bold">
                        {training}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const completed = completedCount(employee.name);
                  const percentage = Math.round(
                    (completed / totalTrainings) * 100
                  );

                  return (
                    <tr
                      key={employee.name}
                      className="border-b hover:bg-muted/50"
                      data-testid={`row-employee-${employee.name.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <td className="sticky left-0 bg-background z-10 p-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{employee.name}</span>
                          {employee.jobTitle && (
                            <span className="text-xs text-muted-foreground">
                              {employee.jobTitle}
                            </span>
                          )}
                          {employee.department && (
                            <span className="text-xs text-blue-600">
                              {employee.department}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Badge
                            variant={
                              percentage === 100
                                ? 'default'
                                : percentage > 50
                                  ? 'secondary'
                                  : 'destructive'
                            }
                            className="w-16"
                          >
                            {percentage}%
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {completed}/{totalTrainings}
                          </span>
                        </div>
                      </td>
                      {trainings.map((training) => {
                        const entry = getEntry(employee.name, training);
                        const isCompleted = entry?.status === 'COMPLETED';
                        const date = formatDate(entry?.lastCompleted || null);
                        const score = entry?.lastScore;

                        return (
                          <td
                            key={training}
                            className="p-3 text-center border-l"
                            data-testid={`cell-${employee.name.replace(/\s+/g, '-').toLowerCase()}-${training.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            {isCompleted ? (
                              <div className="flex flex-col items-center gap-1">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                {score !== null && score !== undefined && (
                                  <span className="text-xs font-semibold text-green-700">
                                    {score}%
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {date}
                                </span>
                                {entry?.notes && (
                                  <span className="text-xs text-blue-600">
                                    ({entry.notes})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <Circle className="h-5 w-5 text-red-400 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 bg-background z-10 p-3 text-left font-semibold min-w-[200px]">
                    Training
                  </th>
                  <th className="p-3 text-center font-semibold min-w-[100px]">
                    Completion
                  </th>
                  {employees.map((employee) => (
                    <th
                      key={employee.name}
                      className="p-3 text-left font-bold min-w-[140px] border-l h-40 bg-muted/50"
                      data-testid={`header-employee-${employee.name.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <div className="transform -rotate-45 origin-left text-sm whitespace-nowrap font-bold">
                        {employee.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTrainings.map((training) => {
                  const completed = trainingCompletedCount(training);
                  const percentage = Math.round(
                    (completed / totalEmployees) * 100
                  );

                  return (
                    <tr
                      key={training}
                      className="border-b hover:bg-muted/50"
                      data-testid={`row-training-${training.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <td className="sticky left-0 bg-background z-10 p-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{training}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Badge
                            variant={
                              percentage === 100
                                ? 'default'
                                : percentage > 50
                                  ? 'secondary'
                                  : 'destructive'
                            }
                            className="w-16"
                          >
                            {percentage}%
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {completed}/{totalEmployees}
                          </span>
                        </div>
                      </td>
                      {employees.map((employee) => {
                        const entry = getEntry(employee.name, training);
                        const isCompleted = entry?.status === 'COMPLETED';
                        const date = formatDate(entry?.lastCompleted || null);
                        const score = entry?.lastScore;

                        return (
                          <td
                            key={employee.name}
                            className="p-3 text-center border-l"
                            data-testid={`cell-${training.replace(/\s+/g, '-').toLowerCase()}-${employee.name.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            {isCompleted ? (
                              <div className="flex flex-col items-center gap-1">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                {score !== null && score !== undefined && (
                                  <span className="text-xs font-semibold text-green-700">
                                    {score}%
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {date}
                                </span>
                                {entry?.notes && (
                                  <span className="text-xs text-blue-600">
                                    ({entry.notes})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <Circle className="h-5 w-5 text-red-400 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-red-400" />
            <span>Pending</span>
          </div>
        </div>
      </div>
    );
  };

  const renderCertificationsTab = () => {
    if (certsLoading) {
      return (
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      );
    }

    if (!certificationsData || certificationsData.length === 0) {
      return (
        <p className="text-muted-foreground">
          No certification data available.
        </p>
      );
    }

    // Extract unique employees
    const employeeMap = new Map<
      string,
      { name: string; jobTitle: string | null; department: string | null }
    >();
    certificationsData.forEach((cert) => {
      if (cert.employeeName && !employeeMap.has(cert.employeeName)) {
        employeeMap.set(cert.employeeName, {
          name: cert.employeeName,
          jobTitle: cert.jobTitle,
          department: cert.department,
        });
      }
    });

    const employees = Array.from(employeeMap.values()).sort((a, b) =>
      sortOrder === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    );

    // Extract unique certifications (filter out nulls)
    const certifications = Array.from(
      new Set(certificationsData.map((c) => c.certificationName))
    )
      .filter((name) => name !== null && name !== undefined)
      .sort((a, b) =>
        sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
      );

    const filteredEmployees = searchTerm
      ? employees.filter((emp) =>
          emp.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : employees;

    // Create lookup map
    const certMap = new Map<string, EmployeeCertification>();
    certificationsData.forEach((cert) => {
      const key = `${cert.employeeName}-${cert.certificationName}`;
      certMap.set(key, cert);
    });

    const getCert = (employeeName: string, certName: string) => {
      return certMap.get(`${employeeName}-${certName}`);
    };

    const completedCertCount = (employeeName: string) => {
      return certifications.filter((cert) => {
        const entry = getCert(employeeName, cert);
        return entry?.isActive || entry?.dateEarned;
      }).length;
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-sm">
            {filteredEmployees.length} Employees × {certifications.length}{' '}
            Certifications
          </Badge>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              data-testid="button-toggle-sort-certs"
            >
              <ArrowUpDown className="h-4 w-4 mr-2" />
              {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
            </Button>
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
              data-testid="input-search-certs"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 bg-background z-10 p-3 text-left font-semibold min-w-[200px]">
                  Employee
                </th>
                <th className="p-3 text-center font-semibold min-w-[100px]">
                  Progress
                </th>
                {certifications.map((cert) => (
                  <th
                    key={cert}
                    className="p-3 text-left font-bold min-w-[140px] border-l h-40 bg-muted/50"
                    data-testid={`header-cert-${cert.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <div className="transform -rotate-45 origin-left text-sm whitespace-nowrap font-bold">
                      {cert}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => {
                const completed = completedCertCount(employee.name);
                const percentage =
                  certifications.length > 0
                    ? Math.round((completed / certifications.length) * 100)
                    : 0;

                return (
                  <tr
                    key={employee.name}
                    className="border-b hover:bg-muted/50"
                    data-testid={`row-cert-employee-${employee.name.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <td className="sticky left-0 bg-background z-10 p-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{employee.name}</span>
                        {employee.jobTitle && (
                          <span className="text-xs text-muted-foreground">
                            {employee.jobTitle}
                          </span>
                        )}
                        {employee.department && (
                          <span className="text-xs text-blue-600">
                            {employee.department}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Badge
                          variant={
                            percentage === 100
                              ? 'default'
                              : percentage > 50
                                ? 'secondary'
                                : 'destructive'
                          }
                          className="w-16"
                        >
                          {percentage}%
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {completed}/{certifications.length}
                        </span>
                      </div>
                    </td>
                    {certifications.map((cert) => {
                      const entry = getCert(employee.name, cert);
                      const isEarned =
                        entry?.isActive || entry?.dateEarned;
                      const date = formatDate(entry?.dateEarned || null);
                      const expiryDate = formatDate(entry?.expiryDate || null);

                      return (
                        <td
                          key={cert}
                          className="p-3 text-center border-l"
                          data-testid={`cell-cert-${employee.name.replace(/\s+/g, '-').toLowerCase()}-${cert.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          {isEarned ? (
                            <div className="flex flex-col items-center gap-1">
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                              {date && (
                                <span className="text-xs text-muted-foreground">
                                  Earned: {date}
                                </span>
                              )}
                              {expiryDate && (
                                <span className="text-xs text-orange-600">
                                  Expires: {expiryDate}
                                </span>
                              )}
                              {entry?.notes && (
                                <span className="text-xs text-blue-600">
                                  ({entry.notes})
                                </span>
                              )}
                            </div>
                          ) : (
                            <Circle className="h-5 w-5 text-red-400 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>Certified</span>
          </div>
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-red-400" />
            <span>Not Certified</span>
          </div>
        </div>
      </div>
    );
  };

  const renderEvaluationsTab = () => {
    if (evalsLoading) {
      return (
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      );
    }

    if (!evaluationsData || evaluationsData.length === 0) {
      return (
        <p className="text-muted-foreground">No evaluation data available.</p>
      );
    }

    const filteredEvaluations = searchTerm
      ? evaluationsData.filter((evaluation) =>
          evaluation.employeeName
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        )
      : evaluationsData;

    const sortedEvaluations = [...filteredEvaluations].sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.employeeName.localeCompare(b.employeeName);
      }
      return b.employeeName.localeCompare(a.employeeName);
    });

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-sm">
            {sortedEvaluations.length} Evaluations
          </Badge>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              data-testid="button-toggle-sort-evals"
            >
              <ArrowUpDown className="h-4 w-4 mr-2" />
              {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
            </Button>
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
              data-testid="input-search-evals"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-semibold">Employee</th>
                <th className="p-3 text-left font-semibold">Type</th>
                <th className="p-3 text-left font-semibold">Period</th>
                <th className="p-3 text-center font-semibold">Rating</th>
                <th className="p-3 text-left font-semibold">Evaluated By</th>
                <th className="p-3 text-left font-semibold">Date</th>
                <th className="p-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedEvaluations.map((evaluation) => (
                <tr
                  key={evaluation.id}
                  className="border-b hover:bg-muted/50"
                  data-testid={`row-eval-${evaluation.id}`}
                >
                  <td className="p-3">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {evaluation.employeeName}
                      </span>
                      {evaluation.jobTitle && (
                        <span className="text-xs text-muted-foreground">
                          {evaluation.jobTitle}
                        </span>
                      )}
                      {evaluation.department && (
                        <span className="text-xs text-blue-600">
                          {evaluation.department}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline">{evaluation.evaluationType}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col text-xs">
                      <span>
                        {formatDate(evaluation.evaluationPeriodStart)}
                      </span>
                      <span className="text-muted-foreground">to</span>
                      <span>{formatDate(evaluation.evaluationPeriodEnd)}</span>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    {evaluation.overallRating !== null ? (
                      <Badge
                        variant={
                          evaluation.overallRating >= 4
                            ? 'default'
                            : evaluation.overallRating >= 3
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {evaluation.overallRating}/5
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </td>
                  <td className="p-3">
                    {evaluation.evaluatedBy || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="h-3 w-3" />
                      {evaluation.evaluatedAt ? (
                        formatDate(evaluation.evaluatedAt)
                      ) : (
                        <span className="text-muted-foreground">Pending</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={
                        evaluation.status === 'COMPLETED'
                          ? 'default'
                          : evaluation.status === 'IN_PROGRESS'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {evaluation.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Training Matrix</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation('/import-certifications')}
                data-testid="button-import-certifications"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Certifications
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setLocation('/certification-backlog')}
                data-testid="button-manage-certifications"
              >
                <Plus className="h-4 w-4 mr-2" />
                Manage Certifications
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList
              className="grid w-full grid-cols-3"
              data-testid="tabs-training-matrix"
            >
              <TabsTrigger value="standards" data-testid="tab-standards">
                Standards Training
              </TabsTrigger>
              <TabsTrigger
                value="certifications"
                data-testid="tab-certifications"
              >
                Certifications
              </TabsTrigger>
              <TabsTrigger value="evaluations" data-testid="tab-evaluations">
                Evaluations
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="standards"
              className="mt-6"
              data-testid="content-standards"
            >
              {renderStandardsTrainingTab()}
            </TabsContent>

            <TabsContent
              value="certifications"
              className="mt-6"
              data-testid="content-certifications"
            >
              {renderCertificationsTab()}
            </TabsContent>

            <TabsContent
              value="evaluations"
              className="mt-6"
              data-testid="content-evaluations"
            >
              {renderEvaluationsTab()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
