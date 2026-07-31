import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Edit,
  Plus,
  Settings,
  Snowflake,
  Thermometer,
  Trash2,
  RotateCcw,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

type TemperatureLocation = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type TemperatureReading = {
  locationId: string;
  locationName: string;
  sortOrder: number;
  temperature: string | null;
  isNotApplicable: boolean;
};

type TemperatureLog = {
  id: number;
  recordedAt: string;
  notes: string | null;
  recordedByDisplayName: string;
  createdAt: string;
  updatedAt?: string | null;
  updatedByDisplayName?: string | null;
  voidedAt?: string | null;
  voidedByDisplayName?: string | null;
  voidReason?: string | null;
  restoredAt?: string | null;
  restoredByDisplayName?: string | null;
  readings: TemperatureReading[];
};

const EMPTY_LOCATIONS: TemperatureLocation[] = [];

function currentLocalDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatReading(
  reading?: Pick<TemperatureReading, 'temperature' | 'isNotApplicable'>
) {
  if (!reading) return '--';
  if (reading.isNotApplicable) return 'N/A';
  const number = Number(reading.temperature);
  return Number.isFinite(number) ? `${number.toFixed(1)} deg F` : '--';
}

export default function FreezerTemperatureLogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [recordedAt, setRecordedAt] = useState(currentLocalDateTime);
  const [notes, setNotes] = useState('');
  const [readingDrafts, setReadingDrafts] = useState<Record<string, string>>(
    {}
  );
  const [newLocationName, setNewLocationName] = useState('');
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null
  );
  const [editingLocationName, setEditingLocationName] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const [editingLog, setEditingLog] = useState<TemperatureLog | null>(null);
  const [editRecordedAt, setEditRecordedAt] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editReadings, setEditReadings] = useState<Record<string, string>>({});
  const [deletingLog, setDeletingLog] = useState<TemperatureLog | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const {
    data: locationsData,
    isLoading: locationsLoading,
    isError: locationsError,
  } = useQuery<TemperatureLocation[]>({
    queryKey: ['/api/quality/freezer-temperature-locations', 'all'],
    queryFn: () =>
      apiRequest(
        '/api/quality/freezer-temperature-locations?includeInactive=true'
      ),
  });

  const {
    data: logs = [],
    isLoading: logsLoading,
    isError: logsError,
  } = useQuery<TemperatureLog[]>({
    queryKey: ['/api/quality/freezer-temperature-logs', showVoided],
    queryFn: () =>
      apiRequest(`/api/quality/freezer-temperature-logs?limit=250&includeVoided=${showVoided}`),
  });

  const locations = locationsData ?? EMPTY_LOCATIONS;
  const activeLocations = useMemo(
    () => locations.filter((location) => location.isActive),
    [locations]
  );
  const todayReadings = useMemo(() => {
    const result = new Map<string, TemperatureReading>();
    const today = localDayKey(new Date());
    for (const log of logs) {
      if (log.voidedAt) continue;
      if (localDayKey(log.recordedAt) !== today) continue;
      for (const reading of log.readings) {
        if (!result.has(reading.locationId))
          result.set(reading.locationId, reading);
      }
    }
    return result;
  }, [logs]);
  const remainingLocations = activeLocations.filter(
    (location) => !todayReadings.has(location.id)
  );

  const invalidateFreezerData = () => {
    queryClient.invalidateQueries({
      queryKey: ['/api/quality/freezer-temperature-locations'],
    });
    queryClient.invalidateQueries({
      queryKey: ['/api/quality/freezer-temperature-logs'],
    });
  };

  const createLocation = useMutation({
    mutationFn: () =>
      apiRequest('/api/quality/freezer-temperature-locations', {
        method: 'POST',
        body: {
          name: newLocationName.trim(),
          sortOrder:
            Math.max(0, ...locations.map((location) => location.sortOrder)) +
            10,
          isActive: true,
        },
      }),
    onSuccess: () => {
      setNewLocationName('');
      invalidateFreezerData();
      toast({ title: 'Freezer added' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not add freezer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateLocation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<TemperatureLocation>;
    }) =>
      apiRequest(`/api/quality/freezer-temperature-locations/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      setEditingLocationId(null);
      setEditingLocationName('');
      invalidateFreezerData();
      toast({ title: 'Freezer updated' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not update freezer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteLocation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/quality/freezer-temperature-locations/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: (result) => {
      invalidateFreezerData();
      toast({
        title: result?.archived ? 'Freezer archived' : 'Freezer deleted',
        description: result?.archived
          ? 'Historical temperature readings were preserved.'
          : undefined,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not delete freezer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const submittedReadings = remainingLocations.flatMap((location) => {
    const value = readingDrafts[location.id]?.trim();
    if (!value) return [];
    return [
      {
        locationId: location.id,
        temperature: value === 'N/A' ? null : value,
        isNotApplicable: value === 'N/A',
      },
    ];
  });
  const hasInvalidTemperature = submittedReadings.some(
    (reading) =>
      !reading.isNotApplicable && !Number.isFinite(Number(reading.temperature))
  );
  const hasNotApplicable = submittedReadings.some(
    (reading) => reading.isNotApplicable
  );
  const canSave =
    submittedReadings.length > 0 &&
    !hasInvalidTemperature &&
    Boolean(recordedAt) &&
    (!hasNotApplicable || Boolean(notes.trim()));

  const createLog = useMutation({
    mutationFn: () =>
      apiRequest('/api/quality/freezer-temperature-logs', {
        method: 'POST',
        body: {
          recordedAt: new Date(recordedAt).toISOString(),
          notes: notes.trim() || null,
          readings: submittedReadings,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/quality/freezer-temperature-logs'],
      });
      setRecordedAt(currentLocalDateTime());
      setNotes('');
      setReadingDrafts({});
      toast({
        title: 'Temperature check saved',
        description: "Today's completion status has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not save temperature check',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const beginEditLog = (log: TemperatureLog) => {
    setEditingLog(log);
    setEditRecordedAt(toLocalDateTime(log.recordedAt));
    setEditNotes(log.notes ?? '');
    setEditReadings(Object.fromEntries(log.readings.map((reading) => [
      reading.locationId,
      reading.isNotApplicable ? 'N/A' : String(reading.temperature ?? ''),
    ])));
  };

  const editedReadingPayload = Object.entries(editReadings).flatMap(([locationId, raw]) => {
    const value = raw.trim();
    if (!value) return [];
    return [{ locationId, temperature: value === 'N/A' ? null : value, isNotApplicable: value === 'N/A' }];
  });
  const editHasNa = editedReadingPayload.some((reading) => reading.isNotApplicable);
  const canUpdateLog = Boolean(editRecordedAt) && editedReadingPayload.length > 0 &&
    editedReadingPayload.every((reading) => reading.isNotApplicable || Number.isFinite(Number(reading.temperature))) &&
    (!editHasNa || Boolean(editNotes.trim()));

  const updateLog = useMutation({
    mutationFn: () => apiRequest(`/api/quality/freezer-temperature-logs/${editingLog!.id}`, {
      method: 'PUT',
      body: {
        recordedAt: new Date(editRecordedAt).toISOString(),
        notes: editNotes.trim() || null,
        readings: editedReadingPayload,
      },
    }),
    onSuccess: () => {
      setEditingLog(null);
      invalidateFreezerData();
      toast({ title: 'Temperature check updated', description: 'The correction and employee identity were recorded.' });
    },
    onError: (error: Error) => toast({ title: 'Could not update temperature check', description: error.message, variant: 'destructive' }),
  });

  const voidLog = useMutation({
    mutationFn: () => apiRequest(`/api/quality/freezer-temperature-logs/${deletingLog!.id}`, {
      method: 'DELETE', body: { reason: deleteReason.trim() },
    }),
    onSuccess: () => {
      setDeletingLog(null); setDeleteReason(''); invalidateFreezerData();
      toast({ title: 'Temperature check deleted', description: 'The record was retained as voided for audit history.' });
    },
    onError: (error: Error) => toast({ title: 'Could not delete temperature check', description: error.message, variant: 'destructive' }),
  });

  const restoreLog = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/quality/freezer-temperature-logs/${id}/restore`, { method: 'POST' }),
    onSuccess: () => { invalidateFreezerData(); toast({ title: 'Temperature check restored' }); },
    onError: (error: Error) => toast({ title: 'Could not restore temperature check', description: error.message, variant: 'destructive' }),
  });

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
            <Snowflake className="h-8 w-8 text-blue-600" />
            Freezer Temperature Log
          </h1>
          <p className="mt-2 text-gray-600">
            Record daily checks and see what still needs attention.
          </p>
        </div>
        <Badge variant="outline" className="w-fit px-3 py-1 text-sm">
          All temperatures in degrees Fahrenheit
        </Badge>
      </div>

      <Tabs defaultValue="log" className="space-y-6">
        <TabsList>
          <TabsTrigger value="log" className="gap-2">
            <Thermometer className="h-4 w-4" /> Daily log
          </TabsTrigger>
          <TabsTrigger value="setup" className="gap-2">
            <Settings className="h-4 w-4" /> Freezer setup
          </TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Today&apos;s freezer checks</CardTitle>
                  <CardDescription>
                    Enter one or more remaining readings. Mark a freezer N/A and
                    explain it in notes when it is down or unavailable.
                  </CardDescription>
                </div>
                <Badge
                  variant={
                    remainingLocations.length === 0 ? 'default' : 'secondary'
                  }
                  className="w-fit"
                >
                  {activeLocations.length - remainingLocations.length} of{' '}
                  {activeLocations.length} complete today
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {remainingLocations.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-700">
                    Still needed:
                  </span>
                  {remainingLocations.map((location) => (
                    <Badge key={location.id} variant="outline">
                      {location.name}
                    </Badge>
                  ))}
                </div>
              )}

              {activeLocations.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900">
                  Add or restore a freezer on the Freezer setup tab before
                  recording a check.
                </div>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (canSave) createLog.mutate();
                  }}
                >
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-44">
                            Date / time
                          </TableHead>
                          {activeLocations.map((location) => (
                            <TableHead
                              key={location.id}
                              className="min-w-40 text-center"
                            >
                              {location.name}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="bg-blue-50/60 hover:bg-blue-50/60">
                          <TableCell className="align-top">
                            <Input
                              aria-label="Reading date and time"
                              type="datetime-local"
                              required
                              value={recordedAt}
                              onChange={(event) =>
                                setRecordedAt(event.target.value)
                              }
                            />
                          </TableCell>
                          {activeLocations.map((location) => {
                            const completed = todayReadings.get(location.id);
                            const draft = readingDrafts[location.id] ?? '';
                            return (
                              <TableCell
                                key={location.id}
                                className="align-top"
                              >
                                {completed ? (
                                  <div className="flex min-h-10 flex-col items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-center">
                                    <span className="text-xs font-medium text-emerald-700">
                                      Done today
                                    </span>
                                    <span className="text-sm font-semibold text-emerald-950">
                                      {formatReading(completed)}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <div className="relative">
                                      <Input
                                        aria-label={`${location.name} temperature`}
                                        type="number"
                                        inputMode="decimal"
                                        min="-200"
                                        max="200"
                                        step="0.1"
                                        placeholder="0.0"
                                        disabled={draft === 'N/A'}
                                        value={draft === 'N/A' ? '' : draft}
                                        onChange={(event) =>
                                          setReadingDrafts((current) => ({
                                            ...current,
                                            [location.id]: event.target.value,
                                          }))
                                        }
                                        className="pr-12"
                                      />
                                      <span className="pointer-events-none absolute right-2 top-2.5 text-xs text-gray-500">
                                        deg F
                                      </span>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={
                                        draft === 'N/A' ? 'default' : 'outline'
                                      }
                                      className="w-full"
                                      onClick={() =>
                                        setReadingDrafts((current) => ({
                                          ...current,
                                          [location.id]:
                                            draft === 'N/A' ? '' : 'N/A',
                                        }))
                                      }
                                    >
                                      {draft === 'N/A'
                                        ? 'Marked N/A'
                                        : 'Mark N/A'}
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">
                      Notes or corrective action{' '}
                      {hasNotApplicable ? '(required for N/A)' : '(optional)'}
                    </Label>
                    <Textarea
                      id="notes"
                      maxLength={2000}
                      placeholder="Example: Freezer 3 is down for maintenance."
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="lg"
                      disabled={!canSave || createLog.isPending}
                    >
                      {createLog.isPending
                        ? 'Saving...'
                        : `Save ${submittedReadings.length || ''} reading${submittedReadings.length === 1 ? '' : 's'}`}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Temperature history</CardTitle>
                  <CardDescription>Most recent 250 employee-recorded checks. Records can be corrected or voided with an audit trail.</CardDescription>
                </div>
                <Label className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox checked={showVoided} onCheckedChange={(checked) => setShowVoided(checked === true)} />
                  Show deleted records
                </Label>
              </div>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <p className="py-8 text-center text-gray-500">
                  Loading temperature history...
                </p>
              ) : logsError ? (
                <div className="flex items-center justify-center gap-2 py-8 text-red-700">
                  <AlertCircle className="h-5 w-5" /> Temperature history could
                  not be loaded.
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-gray-500">
                  <CheckCircle2 className="h-10 w-10 text-gray-300" />
                  No checks have been recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date / time</TableHead>
                        {locations.map((location) => (
                          <TableHead
                            key={location.id}
                            className="whitespace-nowrap text-right"
                          >
                            {location.name}
                          </TableHead>
                        ))}
                        <TableHead>Employee</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => {
                        const byLocation = new Map(
                          log.readings.map((reading) => [
                            reading.locationId,
                            reading,
                          ])
                        );
                        return (
                          <TableRow key={log.id} className={log.voidedAt ? 'bg-red-50/60 text-muted-foreground' : undefined}>
                            <TableCell className="whitespace-nowrap font-medium">
                              {new Date(log.recordedAt).toLocaleString()}
                            </TableCell>
                            {locations.map((location) => (
                              <TableCell
                                key={location.id}
                                className="whitespace-nowrap text-right"
                              >
                                {formatReading(byLocation.get(location.id))}
                              </TableCell>
                            ))}
                            <TableCell className="whitespace-nowrap">
                              {log.recordedByDisplayName}
                            </TableCell>
                            <TableCell className="min-w-48">
                              <div>{log.notes || '--'}</div>
                              {log.updatedAt && <div className="mt-1 text-xs text-muted-foreground">Corrected by {log.updatedByDisplayName || 'employee'} on {new Date(log.updatedAt).toLocaleString()}</div>}
                              {log.restoredAt && !log.voidedAt && <div className="mt-1 text-xs text-muted-foreground">Restored by {log.restoredByDisplayName || 'employee'} on {new Date(log.restoredAt).toLocaleString()}</div>}
                              {log.voidedAt && <div className="mt-1 text-xs text-red-700"><strong>Deleted:</strong> {log.voidReason} — {log.voidedByDisplayName || 'employee'}</div>}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right">
                              {log.voidedAt ? (
                                <Button size="sm" variant="outline" onClick={() => restoreLog.mutate(log.id)} disabled={restoreLog.isPending}>
                                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore
                                </Button>
                              ) : (
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => beginEditLog(log)}><Edit className="mr-1 h-3.5 w-3.5" /> Edit</Button>
                                  <Button size="sm" variant="destructive" onClick={() => setDeletingLog(log)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Delete</Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup">
          <Card>
            <CardHeader>
              <CardTitle>Freezer and location setup</CardTitle>
              <CardDescription>
                Add, rename, restore, or remove freezers. Freezers with
                historical readings are archived instead of permanently deleted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newLocationName}
                  onChange={(event) => setNewLocationName(event.target.value)}
                  placeholder="New freezer or room name"
                  maxLength={100}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && newLocationName.trim()) {
                      event.preventDefault();
                      createLocation.mutate();
                    }
                  }}
                />
                <Button
                  onClick={() => createLocation.mutate()}
                  disabled={!newLocationName.trim() || createLocation.isPending}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Freezer
                </Button>
              </div>

              {locationsLoading ? (
                <p className="text-sm text-gray-500">
                  Loading freezer setup...
                </p>
              ) : locationsError ? (
                <p className="text-sm text-red-700">
                  Freezer setup could not be loaded.
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {locations.map((location) => (
                    <div
                      key={location.id}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
                    >
                      {editingLocationId === location.id ? (
                        <Input
                          autoFocus
                          value={editingLocationName}
                          maxLength={100}
                          onChange={(event) =>
                            setEditingLocationName(event.target.value)
                          }
                          className="flex-1"
                        />
                      ) : (
                        <div className="flex flex-1 items-center gap-2">
                          <span className="font-medium">{location.name}</span>
                          {!location.isActive && (
                            <Badge variant="secondary">Archived</Badge>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {editingLocationId === location.id ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                updateLocation.mutate({
                                  id: location.id,
                                  data: { name: editingLocationName.trim() },
                                })
                              }
                              disabled={
                                !editingLocationName.trim() ||
                                updateLocation.isPending
                              }
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingLocationId(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingLocationId(location.id);
                                setEditingLocationName(location.name);
                              }}
                            >
                              <Edit className="mr-1 h-3.5 w-3.5" /> Edit
                            </Button>
                            {location.isActive ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Remove ${location.name} from future temperature checks?`
                                    )
                                  ) {
                                    deleteLocation.mutate(location.id);
                                  }
                                }}
                                disabled={deleteLocation.isPending}
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() =>
                                  updateLocation.mutate({
                                    id: location.id,
                                    data: { isActive: true },
                                  })
                                }
                              >
                                Restore
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editingLog !== null} onOpenChange={(open) => { if (!open) setEditingLog(null); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Edit temperature check</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Date / time</Label><Input type="datetime-local" value={editRecordedAt} onChange={(event) => setEditRecordedAt(event.target.value)} /></div>
            <div className="overflow-x-auto rounded border">
              <Table><TableHeader><TableRow><TableHead>Freezer</TableHead><TableHead>Temperature</TableHead><TableHead className="w-28">N/A</TableHead><TableHead className="w-24">Remove</TableHead></TableRow></TableHeader>
                <TableBody>{locations.map((location) => {
                  const value = editReadings[location.id] ?? '';
                  return <TableRow key={location.id}>
                    <TableCell>{location.name}{!location.isActive && <Badge variant="secondary" className="ml-2">Archived</Badge>}</TableCell>
                    <TableCell><Input type="number" inputMode="decimal" min="-200" max="200" step="0.1" disabled={value === 'N/A'} value={value === 'N/A' ? '' : value} onChange={(event) => setEditReadings((current) => ({ ...current, [location.id]: event.target.value }))} /></TableCell>
                    <TableCell><Button size="sm" type="button" variant={value === 'N/A' ? 'default' : 'outline'} onClick={() => setEditReadings((current) => ({ ...current, [location.id]: value === 'N/A' ? '' : 'N/A' }))}>{value === 'N/A' ? 'N/A' : 'Mark N/A'}</Button></TableCell>
                    <TableCell><Button size="sm" type="button" variant="ghost" disabled={!value} onClick={() => setEditReadings((current) => ({ ...current, [location.id]: '' }))}>Clear</Button></TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
            <div className="space-y-2"><Label>Notes or corrective action {editHasNa ? '(required for N/A)' : '(optional)'}</Label><Textarea maxLength={2000} value={editNotes} onChange={(event) => setEditNotes(event.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditingLog(null)}>Cancel</Button><Button onClick={() => updateLog.mutate()} disabled={!canUpdateLog || updateLog.isPending}>{updateLog.isPending ? 'Saving...' : 'Save correction'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingLog !== null} onOpenChange={(open) => { if (!open) { setDeletingLog(null); setDeleteReason(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete temperature check?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This removes the check from normal history and today&apos;s completion status, but retains it as a voided audit record.</p>
          <div className="space-y-2"><Label>Reason for deletion (required)</Label><Textarea value={deleteReason} maxLength={500} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Explain why this record must be deleted." /></div>
          <DialogFooter><Button variant="outline" onClick={() => setDeletingLog(null)}>Cancel</Button><Button variant="destructive" onClick={() => voidLog.mutate()} disabled={deleteReason.trim().length < 3 || voidLog.isPending}>{voidLog.isPending ? 'Deleting...' : 'Delete record'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
