import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Activity,
  Play,
  Settings,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SkipForward,
  Plus,
  Trash2,
  Mail,
  Database,
  FileCheck,
  Loader2,
  RefreshCw,
  History,
  MessageSquare,
  Globe,
  Link2,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'wouter';

interface HealthCheckType {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  category: string;
  isBuiltIn: boolean;
  isEnabled: boolean;
  checkFunction: string | null;
  testEmailAddress: string | null;
  testSmsPhone: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface HealthCheckConfig {
  id: number;
  scheduledTime: string;
  notificationEmail: string | null;
  testSmsPhone: string | null;
  timezone: string | null;
  isScheduleEnabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HealthCheckResult {
  id: number;
  checkTypeId: number | null;
  checkName: string;
  status: 'pass' | 'fail' | 'warning' | 'skipped';
  message: string | null;
  details: any;
  executionTimeMs: number | null;
  runType: string;
  runBatchId: string | null;
  createdAt: string;
}

const statusIcons = {
  pass: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  fail: <XCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  skipped: <SkipForward className="h-5 w-5 text-gray-400" />,
};

const statusColors = {
  pass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  fail: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  skipped: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const categoryIcons: Record<string, JSX.Element> = {
  email: <Mail className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  system: <Activity className="h-4 w-4" />,
  custom: <FileCheck className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  link: <Link2 className="h-4 w-4" />,
};

export default function SystemHealthChecksPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCheck, setNewCheck] = useState({
    displayName: '',
    description: '',
    checkFunction: '',
  });
  const [editingEmailId, setEditingEmailId] = useState<number | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [editingSmsId, setEditingSmsId] = useState<number | null>(null);
  const [smsInput, setSmsInput] = useState('');

  const { data: checkTypes = [], isLoading: typesLoading } = useQuery<HealthCheckType[]>({
    queryKey: ['/api/health-checks/types'],
  });

  const { data: config, isLoading: configLoading } = useQuery<HealthCheckConfig>({
    queryKey: ['/api/health-checks/config'],
  });

  const { data: results = [], isLoading: resultsLoading, refetch: refetchResults } = useQuery<HealthCheckResult[]>({
    queryKey: ['/api/health-checks/results'],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
      return apiRequest(`/api/health-checks/types/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-checks/types'] });
      toast({ title: 'Check updated', description: 'Health check status has been updated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update health check.', variant: 'destructive' });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Partial<HealthCheckConfig>) => {
      return apiRequest('/api/health-checks/config', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-checks/config'] });
      toast({ title: 'Settings saved', description: 'Schedule settings have been updated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update settings.', variant: 'destructive' });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async ({ id, testEmailAddress }: { id: number; testEmailAddress: string }) => {
      return apiRequest(`/api/health-checks/types/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ testEmailAddress }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-checks/types'] });
      setEditingEmailId(null);
      toast({ title: 'Email updated', description: 'Test email address has been saved.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update email address.', variant: 'destructive' });
    },
  });

  const updateSmsMutation = useMutation({
    mutationFn: async ({ id, testSmsPhone }: { id: number; testSmsPhone: string }) => {
      return apiRequest(`/api/health-checks/types/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ testSmsPhone }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-checks/types'] });
      setEditingSmsId(null);
      toast({ title: 'Phone updated', description: 'Test SMS phone number has been saved.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update phone number.', variant: 'destructive' });
    },
  });

  const runAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/health-checks/run', { method: 'POST' });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-checks/results'] });
      const failed = (data as HealthCheckResult[]).filter((r) => r.status === 'fail').length;
      const passed = (data as HealthCheckResult[]).filter((r) => r.status === 'pass').length;
      toast({
        title: 'Health checks completed',
        description: `${passed} passed, ${failed} failed`,
        variant: failed > 0 ? 'destructive' : 'default',
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to run health checks.', variant: 'destructive' });
    },
  });

  const runSingleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/health-checks/run/${id}`, { method: 'POST' });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-checks/results'] });
      const result = data as HealthCheckResult;
      toast({
        title: result.status === 'pass' ? 'Check passed' : 'Check failed',
        description: result.message || 'Health check completed.',
        variant: result.status === 'fail' ? 'destructive' : 'default',
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to run health check.', variant: 'destructive' });
    },
  });

  const createCheckMutation = useMutation({
    mutationFn: async (data: { displayName: string; description: string; checkFunction: string }) => {
      return apiRequest('/api/health-checks/types', {
        method: 'POST',
        body: JSON.stringify({
          name: data.displayName.toLowerCase().replace(/\s+/g, '_'),
          ...data,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-checks/types'] });
      setIsAddDialogOpen(false);
      setNewCheck({ displayName: '', description: '', checkFunction: '' });
      toast({ title: 'Check created', description: 'New custom health check has been added.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create health check.', variant: 'destructive' });
    },
  });

  const deleteCheckMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/health-checks/types/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-checks/types'] });
      toast({ title: 'Check deleted', description: 'Custom health check has been removed.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete health check.', variant: 'destructive' });
    },
  });

  const latestResults = results.slice(0, 20);
  const lastRunResults = results.filter((r) => r.runBatchId === results[0]?.runBatchId);

  if (typesLoading || configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8" />
            System Health Checks
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor and test critical system components
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => runAllMutation.mutate()}
          disabled={runAllMutation.isPending}
          data-testid="button-run-all-checks"
        >
          {runAllMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Run All Checks Now
        </Button>
      </div>

      <Tabs defaultValue="checks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="checks" data-testid="tab-checks">
            <Settings className="h-4 w-4 mr-2" />
            Configure Checks
          </TabsTrigger>
          <TabsTrigger value="schedule" data-testid="tab-schedule">
            <Clock className="h-4 w-4 mr-2" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-2" />
            Results History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checks" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Health Check Items</CardTitle>
                <CardDescription>
                  Toggle which checks run during automated daily checks
                </CardDescription>
              </div>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-add-check">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Custom Check
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Custom Health Check</DialogTitle>
                    <DialogDescription>
                      Create a custom SQL query to check for issues in your database
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="displayName">Check Name</Label>
                      <Input
                        id="displayName"
                        value={newCheck.displayName}
                        onChange={(e) => setNewCheck({ ...newCheck, displayName: e.target.value })}
                        placeholder="e.g., Missing Customer Emails"
                        data-testid="input-check-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        value={newCheck.description}
                        onChange={(e) => setNewCheck({ ...newCheck, description: e.target.value })}
                        placeholder="What does this check look for?"
                        data-testid="input-check-description"
                      />
                    </div>
                    <div>
                      <Label htmlFor="checkFunction">SQL Query</Label>
                      <Textarea
                        id="checkFunction"
                        value={newCheck.checkFunction}
                        onChange={(e) => setNewCheck({ ...newCheck, checkFunction: e.target.value })}
                        placeholder="SELECT * FROM customers WHERE email IS NULL"
                        rows={4}
                        className="font-mono text-sm"
                        data-testid="input-check-sql"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Query returns results = warning. No results = pass.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createCheckMutation.mutate(newCheck)}
                      disabled={!newCheck.displayName || !newCheck.checkFunction || createCheckMutation.isPending}
                      data-testid="button-create-check"
                    >
                      {createCheckMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Check
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Enabled</TableHead>
                    <TableHead>Check</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Test Recipient</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkTypes.map((check) => (
                    <TableRow key={check.id} data-testid={`row-check-${check.id}`}>
                      <TableCell>
                        <Switch
                          checked={check.isEnabled}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ id: check.id, isEnabled: checked })
                          }
                          data-testid={`switch-check-${check.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {categoryIcons[check.category] || categoryIcons.custom}
                          <div>
                            <div className="font-medium">{check.displayName}</div>
                            {check.description && (
                              <div className="text-sm text-muted-foreground">
                                {check.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {check.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {check.category === 'email' ? (
                          editingEmailId === check.id ? (
                            <div className="flex gap-2">
                              <Input
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                placeholder="test@example.com"
                                className="w-48"
                                data-testid={`input-email-${check.id}`}
                              />
                              <Button
                                size="sm"
                                onClick={() =>
                                  updateEmailMutation.mutate({
                                    id: check.id,
                                    testEmailAddress: emailInput,
                                  })
                                }
                                disabled={updateEmailMutation.isPending}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingEmailId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="link"
                              className="p-0 h-auto"
                              onClick={() => {
                                setEditingEmailId(check.id);
                                setEmailInput(check.testEmailAddress || '');
                              }}
                              data-testid={`button-edit-email-${check.id}`}
                            >
                              {check.testEmailAddress || 'Set email...'}
                            </Button>
                          )
                        ) : check.category === 'sms' ? (
                          <span className="text-sm text-muted-foreground">
                            Uses phone from Schedule settings
                          </span>
                        ) : check.name === 'link_health' ? (
                          <Link href="/admin/monitored-links">
                            <Button
                              variant="link"
                              className="p-0 h-auto text-blue-600 hover:text-blue-800"
                              data-testid="button-manage-links"
                            >
                              <Link2 className="h-3 w-3 mr-1" />
                              Manage Links
                            </Button>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runSingleMutation.mutate(check.id)}
                            disabled={runSingleMutation.isPending}
                            data-testid={`button-run-${check.id}`}
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                          {!check.isBuiltIn && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteCheckMutation.mutate(check.id)}
                              disabled={deleteCheckMutation.isPending}
                              data-testid={`button-delete-${check.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {lastRunResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Latest Run Results
                </CardTitle>
                <CardDescription>
                  {lastRunResults[0]?.createdAt &&
                    format(new Date(lastRunResults[0].createdAt), 'PPp')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {lastRunResults.map((result) => (
                    <div
                      key={result.id}
                      className="p-3 rounded-lg border"
                      data-testid={`result-${result.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {statusIcons[result.status]}
                          <div>
                            <div className="font-medium">{result.checkName}</div>
                            <div className="text-sm text-muted-foreground">
                              {result.message}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={statusColors[result.status]}>
                            {result.status.toUpperCase()}
                          </Badge>
                          {result.executionTimeMs && (
                            <span className="text-sm text-muted-foreground">
                              {result.executionTimeMs}ms
                            </span>
                          )}
                        </div>
                      </div>
                      {result.details?.duplicates && result.details.duplicates.length > 0 && (
                        <div className="mt-3 pl-9">
                          <div className="text-sm font-medium text-red-600 mb-1">Duplicate Order Numbers Found:</div>
                          <div className="flex flex-wrap gap-2">
                            {result.details.duplicates.map((dup: { orderId: string; count: number }, idx: number) => (
                              <Badge key={idx} variant="destructive" className="text-xs">
                                {dup.orderId} ({dup.count}x)
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Automated Daily Checks</CardTitle>
              <CardDescription>
                Configure when the system automatically runs health checks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Enable Scheduled Checks</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically run enabled checks daily
                  </p>
                </div>
                <Switch
                  checked={config?.isScheduleEnabled ?? true}
                  onCheckedChange={(checked) =>
                    updateConfigMutation.mutate({ isScheduleEnabled: checked })
                  }
                  data-testid="switch-schedule-enabled"
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduledTime">Run Time</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="scheduledTime"
                      type="time"
                      value={config?.scheduledTime || '07:00'}
                      onChange={(e) =>
                        updateConfigMutation.mutate({ scheduledTime: e.target.value })
                      }
                      className="w-32"
                      data-testid="input-schedule-time"
                    />
                    <span className="text-muted-foreground">daily</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Timezone
                  </Label>
                  <select
                    id="timezone"
                    value={config?.timezone || 'America/Chicago'}
                    onChange={(e) =>
                      updateConfigMutation.mutate({ timezone: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    data-testid="select-timezone"
                  >
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                    <option value="America/Anchorage">Alaska (AKT)</option>
                    <option value="Pacific/Honolulu">Hawaii (HT)</option>
                  </select>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="testSmsPhone" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Daily Test SMS Phone Number
                  </Label>
                  <Input
                    id="testSmsPhone"
                    type="tel"
                    value={config?.testSmsPhone || ''}
                    onChange={(e) =>
                      updateConfigMutation.mutate({ testSmsPhone: e.target.value })
                    }
                    placeholder="+12565551234"
                    className="max-w-md"
                    data-testid="input-test-sms-phone"
                  />
                  <p className="text-sm text-muted-foreground">
                    Receive a daily test text at the scheduled time to verify SMS is working
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notificationEmail" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Notification Email
                  </Label>
                  <Input
                    id="notificationEmail"
                    type="email"
                    value={config?.notificationEmail || ''}
                    onChange={(e) =>
                      updateConfigMutation.mutate({ notificationEmail: e.target.value })
                    }
                    placeholder="admin@example.com"
                    className="max-w-md"
                    data-testid="input-notification-email"
                  />
                  <p className="text-sm text-muted-foreground">
                    Receive alerts when health checks fail
                  </p>
                </div>
              </div>

              {config?.lastRunAt && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Last automated run: {format(new Date(config.lastRunAt), 'PPp')}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Results History</CardTitle>
                <CardDescription>Recent health check results</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchResults()}
                data-testid="button-refresh-history"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {resultsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : latestResults.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No health check results yet. Run your first check!
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Check</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Run Type</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestResults.map((result) => (
                      <TableRow key={result.id} data-testid={`history-row-${result.id}`}>
                        <TableCell>
                          <Badge className={statusColors[result.status]}>
                            {result.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{result.checkName}</TableCell>
                        <TableCell className="max-w-md">
                          <div>{result.message}</div>
                          {result.details?.duplicates && result.details.duplicates.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {result.details.duplicates.slice(0, 5).map((dup: { orderId: string; count: number }, idx: number) => (
                                <Badge key={idx} variant="destructive" className="text-xs">
                                  {dup.orderId} ({dup.count}x)
                                </Badge>
                              ))}
                              {result.details.duplicates.length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{result.details.duplicates.length - 5} more
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {result.runType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(result.createdAt), 'MMM d, h:mm a')}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {result.executionTimeMs ? `${result.executionTimeMs}ms` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
