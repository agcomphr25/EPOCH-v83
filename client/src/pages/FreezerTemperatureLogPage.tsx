import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Edit,
  Plus,
  Snowflake,
  Thermometer,
  Trash2,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  temperature: string;
};

type TemperatureLog = {
  id: number;
  recordedAt: string;
  notes: string | null;
  recordedByDisplayName: string;
  createdAt: string;
  readings: TemperatureReading[];
};

const EMPTY_LOCATIONS: TemperatureLocation[] = [];

function currentLocalDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatTemperature(value?: string) {
  if (value == null) return '--';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)} deg F` : '--';
}

export default function FreezerTemperatureLogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [recordedAt, setRecordedAt] = useState(currentLocalDateTime);
  const [notes, setNotes] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [temperature, setTemperature] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null
  );
  const [editingLocationName, setEditingLocationName] = useState('');

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
    queryKey: ['/api/quality/freezer-temperature-logs'],
    queryFn: () =>
      apiRequest('/api/quality/freezer-temperature-logs?limit=250'),
  });

  const locations = locationsData ?? EMPTY_LOCATIONS;

  const activeLocations = useMemo(
    () => locations.filter((location) => location.isActive),
    [locations]
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
      toast({ title: 'Temperature location updated' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not update location',
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
        title: result?.archived ? 'Location archived' : 'Location deleted',
        description: result?.archived
          ? 'Historical temperature readings were preserved.'
          : undefined,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not delete location',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createLog = useMutation({
    mutationFn: () =>
      apiRequest('/api/quality/freezer-temperature-logs', {
        method: 'POST',
        body: {
          recordedAt: new Date(recordedAt).toISOString(),
          notes: notes.trim() || null,
          readings: [{ locationId: selectedLocationId, temperature }],
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/quality/freezer-temperature-logs'],
      });
      setRecordedAt(currentLocalDateTime());
      setNotes('');
      setTemperature('');
      toast({
        title: 'Temperature check saved',
        description: 'The employee and time were recorded automatically.',
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

  const readingEntered =
    Boolean(selectedLocationId) &&
    temperature.trim() !== '' &&
    Number.isFinite(Number(temperature));
  const latest = logs[0];
  const latestByLocation = new Map(
    latest?.readings.map((reading) => [reading.locationId, reading]) ?? []
  );

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
            <Snowflake className="h-8 w-8 text-blue-600" />
            Freezer Temperature Log
          </h1>
          <p className="mt-2 text-gray-600">
            Record checks and manage the freezers or rooms that require
            readings.
          </p>
        </div>
        <Badge variant="outline" className="w-fit px-3 py-1 text-sm">
          All readings in degrees Fahrenheit
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Freezer and location setup</CardTitle>
          <CardDescription>
            Add, rename, restore, or remove temperature locations. Locations
            with historical readings are archived instead of permanently
            deleted.
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
              <Plus className="mr-2 h-4 w-4" />
              Add Freezer
            </Button>
          </div>

          {locationsLoading ? (
            <p className="text-sm text-gray-500">Loading location setup...</p>
          ) : locationsError ? (
            <p className="text-sm text-red-700">
              Location setup could not be loaded.
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" /> Record a temperature check
          </CardTitle>
          <CardDescription>
            Select a freezer and enter its reading. Your employee name is
            attached automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (readingEntered) createLog.mutate();
            }}
          >
            <div className="max-w-sm space-y-2">
              <Label htmlFor="recorded-at">Date and time</Label>
              <Input
                id="recorded-at"
                type="datetime-local"
                required
                value={recordedAt}
                onChange={(event) => setRecordedAt(event.target.value)}
              />
            </div>

            {activeLocations.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900">
                Add or restore a freezer before recording a check.
              </div>
            ) : (
              <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="freezer-select">Freezer</Label>
                  <Select
                    value={selectedLocationId}
                    onValueChange={setSelectedLocationId}
                  >
                    <SelectTrigger id="freezer-select">
                      <SelectValue placeholder="Select a freezer" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeLocations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="temperature-reading">Temperature</Label>
                  <div className="relative">
                    <Input
                      id="temperature-reading"
                      type="number"
                      inputMode="decimal"
                      min="-200"
                      max="200"
                      step="0.1"
                      required
                      className="pr-14 text-lg font-medium"
                      placeholder="0.0"
                      value={temperature}
                      onChange={(event) => setTemperature(event.target.value)}
                    />
                    <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-gray-500">
                      deg F
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">
                Notes or corrective action (optional)
              </Label>
              <Textarea
                id="notes"
                maxLength={2000}
                placeholder="Add details if a reading needs attention."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                size="lg"
                disabled={!readingEntered || !recordedAt || createLog.isPending}
              >
                {createLog.isPending ? 'Saving...' : 'Save temperature check'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {latest && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Latest readings</CardTitle>
            <CardDescription>
              {new Date(latest.recordedAt).toLocaleString()} by{' '}
              {latest.recordedByDisplayName}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {activeLocations.map((location) => (
              <div
                key={location.id}
                className="rounded-lg border bg-slate-50 p-3"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {location.name}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {formatTemperature(
                    latestByLocation.get(location.id)?.temperature
                  )}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Temperature history</CardTitle>
          <CardDescription>
            Most recent 250 employee-recorded checks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <p className="py-8 text-center text-gray-500">
              Loading temperature history...
            </p>
          ) : logsError ? (
            <div className="flex items-center justify-center gap-2 py-8 text-red-700">
              <AlertCircle className="h-5 w-5" /> Temperature history could not
              be loaded.
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-gray-500">
              <CheckCircle2 className="h-10 w-10 text-gray-300" />
              No checks have been recorded yet.
            </div>
          ) : (
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const byLocation = new Map(
                    log.readings.map((reading) => [
                      reading.locationId,
                      reading.temperature,
                    ])
                  );
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {new Date(log.recordedAt).toLocaleString()}
                      </TableCell>
                      {locations.map((location) => (
                        <TableCell
                          key={location.id}
                          className="whitespace-nowrap text-right"
                        >
                          {formatTemperature(byLocation.get(location.id))}
                        </TableCell>
                      ))}
                      <TableCell className="whitespace-nowrap">
                        {log.recordedByDisplayName}
                      </TableCell>
                      <TableCell className="min-w-48">
                        {log.notes || '--'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
