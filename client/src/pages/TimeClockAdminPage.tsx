import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Clock, CheckCircle, Trash2, Pencil, Download, Search, Briefcase, PieChart, Plus, X, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PunchRow {
  id: string;
  punchType: string;
  punchTime: string;
  approved: boolean;
}

interface AdminEmployeeData {
  punches: PunchRow[];
  totalHours: number;
  payPeriod: { start: string; end: string; label: string };
}


interface JobLaborEmployee {
  employeeId: number;
  employeeName: string | null;
  hours: number;
  laborRate: number;
  cost: number;
}

interface ProjectAllocationRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  allocationUnits: number;
  hours: number;
  cost: number;
}

interface JobLaborBreakdown {
  jobId: number;
  totalHours: number;
  totalCost: number;
  breakdown: JobLaborEmployee[];
  projectAllocation: ProjectAllocationRow[];
}

interface Project {
  id: string;
  projectCode: string;
  projectName: string;
}

interface AllocationInputRow {
  projectId: string;
  units: number;
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentBiweeklyPeriod(): { start: string; end: string } {
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const anchor = new Date(2024, 0, 1);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceAnchor = Math.floor((localToday.getTime() - anchor.getTime()) / msPerDay);
  const periodIndex = Math.floor(daysSinceAnchor / 14);
  const startDate = new Date(anchor.getTime() + periodIndex * 14 * msPerDay);
  const endDate = new Date(startDate.getTime() + 13 * msPerDay);
  return {
    start: toLocalDateString(startDate),
    end: toLocalDateString(endDate),
  };
}

const PUNCH_LABELS: Record<string, string> = {
  clock_in: 'Clock In',
  clock_out: 'Clock Out',
  break_start: 'Break Start',
  break_end: 'Break End',
};

const PUNCH_COLORS: Record<string, string> = {
  clock_in: 'border-green-400 text-green-700',
  clock_out: 'border-slate-400 text-slate-600',
  break_start: 'border-amber-400 text-amber-700',
  break_end: 'border-blue-400 text-blue-700',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatHours(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export default function TimeClockAdminPage() {
  const { toast } = useToast();
  const [employeeIdInput, setEmployeeIdInput] = useState('');
  const [activeEmployeeId, setActiveEmployeeId] = useState<number | null>(null);
  const [editingPunch, setEditingPunch] = useState<{ id: string; punchTime: string } | null>(null);

  const [jobIdInput, setJobIdInput] = useState('');
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery<AdminEmployeeData>({
    queryKey: ['/api/timekeeping/admin/employee', activeEmployeeId],
    enabled: activeEmployeeId !== null,
  });

  const [isExporting, setIsExporting] = useState(false);

  const defaultPeriod = getCurrentBiweeklyPeriod();
  const [periodStart, setPeriodStart] = useState(defaultPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.end);

  const handleGustoExport = async () => {
    if (!periodStart || !periodEnd) return;
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ periodStart, periodEnd });
      const response = await fetch(`/api/timekeeping/export/gusto?${params}`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gusto-export-${periodStart}-to-${periodEnd}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'CSV download started' });
    } catch {
      toast({ title: 'Failed to export CSV', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const {
    data: jobLaborData,
    isLoading: jobLaborLoading,
    refetch: refetchJobLabor,
    isFetching: jobLaborFetching,
  } = useQuery<JobLaborBreakdown>({
    queryKey: ['/api/timekeeping/admin/job-labor-breakdown', activeJobId],
    enabled: activeJobId !== null,
  });

  const [allocRows, setAllocRows] = useState<AllocationInputRow[]>([{ projectId: '', units: 0 }]);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ['/api/timekeeping/admin/projects'],
  });

  const allocateMutation = useMutation({
    mutationFn: (payload: { jobId: number; allocations: { projectId: string; units: number }[] }) =>
      apiRequest('/api/timekeeping/admin/job-allocate', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({ title: 'Allocations saved' });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/admin/job-labor-breakdown', activeJobId] });
    },
    onError: (err: any) =>
      toast({ title: err?.message ?? 'Failed to save allocations', variant: 'destructive' }),
  });

  const handleJobSearch = () => {
    const id = parseInt(jobIdInput.trim(), 10);
    if (isNaN(id)) {
      toast({ title: 'Enter a valid numeric job ID', variant: 'destructive' });
      return;
    }
    setActiveJobId(id);
    setAllocRows([{ projectId: '', units: 0 }]);
  };

  const handleAllocate = () => {
    if (!activeJobId) return;
    const valid = allocRows.filter(r => r.projectId && r.units > 0);
    if (valid.length === 0) {
      toast({ title: 'Add at least one project with a positive units value', variant: 'destructive' });
      return;
    }
    allocateMutation.mutate({ jobId: activeJobId, allocations: valid });
  };

  const approveMutation = useMutation({
    mutationFn: (empId: number) =>
      apiRequest(`/api/timekeeping/admin/approve/${empId}`, { method: 'POST' }),
    onSuccess: (result: any) => {
      toast({ title: `Pay period approved — ${result.approvedCount} punch(es) locked` });
      refetch();
    },
    onError: () => toast({ title: 'Failed to approve pay period', variant: 'destructive' }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, punchTime }: { id: string; punchTime: string }) =>
      apiRequest(`/api/timekeeping/admin/punch/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ punchTime }),
      }),
    onSuccess: () => {
      toast({ title: 'Punch time updated' });
      setEditingPunch(null);
      refetch();
    },
    onError: (err: any) =>
      toast({ title: err?.message ?? 'Failed to update punch', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/timekeeping/admin/punch/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Punch deleted' });
      refetch();
    },
    onError: (err: any) =>
      toast({ title: err?.message ?? 'Failed to delete punch', variant: 'destructive' }),
  });

  const handleSearch = () => {
    const id = parseInt(employeeIdInput.trim(), 10);
    if (isNaN(id)) {
      toast({ title: 'Enter a valid numeric employee ID', variant: 'destructive' });
      return;
    }
    setActiveEmployeeId(id);
    setEditingPunch(null);
  };

  const handleSaveEdit = () => {
    if (!editingPunch) return;
    editMutation.mutate(editingPunch);
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Clock className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Time Clock Admin</h1>
      </div>

      {/* Employee lookup */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Employee Punch Review</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Employee ID (numeric)"
              value={employeeIdInput}
              onChange={e => setEmployeeIdInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="max-w-xs"
            />
            <Button onClick={handleSearch} disabled={isLoading}>
              <Search className="w-4 h-4 mr-2" />
              Load Punches
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Employee punch table */}
      {activeEmployeeId !== null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>
                Employee #{activeEmployeeId}
                {data?.payPeriod && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    — Pay period: {data.payPeriod.label}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {data && (
                  <span className="text-sm font-normal">
                    Total: <strong>{formatHours(data.totalHours)}</strong>
                  </span>
                )}
                <Button
                  size="sm"
                  onClick={() => approveMutation.mutate(activeEmployeeId)}
                  disabled={approveMutation.isPending || !data?.punches.length}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Approve Pay Period
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : !data?.punches.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No punch records found for this pay period.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.punches.map(punch => (
                    <TableRow key={punch.id}>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${PUNCH_COLORS[punch.punchType] ?? ''}`}>
                          {PUNCH_LABELS[punch.punchType] ?? punch.punchType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {editingPunch?.id === punch.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="datetime-local"
                              value={editingPunch.punchTime.slice(0, 16)}
                              onChange={e =>
                                setEditingPunch({ id: punch.id, punchTime: e.target.value + ':00Z' })
                              }
                              className="h-7 text-xs w-44"
                            />
                            <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit}
                              disabled={editMutation.isPending}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs"
                              onClick={() => setEditingPunch(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm">{formatDateTime(punch.punchTime)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {punch.approved ? (
                          <Badge className="bg-green-100 text-green-800 text-xs">Approved</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!punch.approved && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              disabled={editMutation.isPending}
                              onClick={() =>
                                setEditingPunch({
                                  id: punch.id,
                                  punchTime: punch.punchTime,
                                })
                              }
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              disabled={deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate(punch.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Job Labor Analysis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" />
            Job Labor Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Job ID (numeric)"
              value={jobIdInput}
              onChange={e => setJobIdInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJobSearch()}
              className="max-w-xs"
            />
            <Button onClick={handleJobSearch} disabled={jobLaborLoading || jobLaborFetching}>
              <Search className="w-4 h-4 mr-2" />
              {jobLaborLoading || jobLaborFetching ? 'Loading…' : 'Load Job Labor'}
            </Button>
            {activeJobId !== null && (
              <Button variant="ghost" size="sm" onClick={() => refetchJobLabor()}>
                Refresh
              </Button>
            )}
          </div>

          {activeJobId !== null && (jobLaborLoading || jobLaborFetching) && (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          )}

          {jobLaborData && (
            <div className="space-y-3">
              <div className="flex gap-6 text-sm font-medium pb-2 border-b">
                <span>Job #{jobLaborData.jobId}</span>
                <span>Total hours: <strong>{formatHours(jobLaborData.totalHours)}</strong></span>
                <span>
                  Estimated cost:{' '}
                  <strong>
                    ${jobLaborData.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </span>
              </div>

              {jobLaborData.breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No completed punch intervals found for this job.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Rate ($/hr)</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobLaborData.breakdown.map(row => (
                      <TableRow key={row.employeeId}>
                        <TableCell className="text-sm">
                          {row.employeeName || `Employee #${row.employeeId}`}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatHours(row.hours)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {row.laborRate > 0
                            ? `$${row.laborRate.toFixed(2)}`
                            : <span className="italic">not set</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {row.cost > 0
                            ? `$${row.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatHours(jobLaborData.totalHours)}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        ${jobLaborData.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job Cost Allocation */}
      {activeJobId !== null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary" />
              Job Cost Allocation — Job #{activeJobId}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Distribute this job's labor cost across projects using relative units (e.g. 6 + 4 = 60% / 40%).
            </p>

            {/* Input rows */}
            <div className="space-y-2">
              {allocRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={row.projectId}
                    onValueChange={val =>
                      setAllocRows(prev => prev.map((r, idx) => idx === i ? { ...r, projectId: val } : r))
                    }
                  >
                    <SelectTrigger className="flex-1 max-w-xs h-8 text-sm">
                      <SelectValue placeholder="Select project…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(projects ?? []).map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.projectCode} — {p.projectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="Units"
                    value={row.units || ''}
                    onChange={e =>
                      setAllocRows(prev =>
                        prev.map((r, idx) => idx === i ? { ...r, units: parseFloat(e.target.value) || 0 } : r)
                      )
                    }
                    className="w-24 h-8 text-sm"
                  />
                  {allocRows.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground"
                      onClick={() => setAllocRows(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAllocRows(prev => [...prev, { projectId: '', units: 0 }])}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Project
              </Button>
              <Button
                size="sm"
                onClick={handleAllocate}
                disabled={allocateMutation.isPending}
                className="bg-primary"
              >
                {allocateMutation.isPending ? 'Saving…' : 'Save Allocations'}
              </Button>
            </div>

            {/* Current allocation distribution */}
            {jobLaborData?.projectAllocation && jobLaborData.projectAllocation.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2">Current Allocation Distribution</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobLaborData.projectAllocation.map(alloc => (
                      <TableRow key={alloc.projectId}>
                        <TableCell className="text-sm font-medium">
                          {alloc.projectCode} — {alloc.projectName}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {alloc.allocationUnits}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatHours(alloc.hours)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {alloc.cost > 0
                            ? `$${alloc.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payroll export */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            Payroll Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Period Start</label>
              <input
                type="date"
                value={periodStart}
                onChange={e => setPeriodStart(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Period End</label>
              <input
                type="date"
                value={periodEnd}
                onChange={e => setPeriodEnd(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button
              onClick={handleGustoExport}
              disabled={isExporting || !periodStart || !periodEnd}
            >
              {isExporting
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Download className="w-4 h-4 mr-2" />}
              {isExporting ? 'Exporting…' : 'Export Approved Hours (Gusto)'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
