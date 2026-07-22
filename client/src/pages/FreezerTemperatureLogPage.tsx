import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Snowflake,
  Thermometer,
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

type TemperatureField =
  | 'freezer1Temperature'
  | 'freezer2Temperature'
  | 'freezer3Temperature'
  | 'freezer4Temperature'
  | 'layupRoomTemperature'
  | 'refrigeratorContainerTemperature';

type FormState = Record<TemperatureField, string> & {
  recordedAt: string;
  notes: string;
};

type FreezerTemperatureLog = Record<TemperatureField, string> & {
  id: number;
  recordedAt: string;
  notes: string | null;
  recordedByDisplayName: string;
  createdAt: string;
};

const temperatureFields: Array<{
  key: TemperatureField;
  label: string;
  shortLabel: string;
}> = [
  { key: 'freezer1Temperature', label: 'Freezer 1', shortLabel: 'F1' },
  { key: 'freezer2Temperature', label: 'Freezer 2', shortLabel: 'F2' },
  { key: 'freezer3Temperature', label: 'Freezer 3', shortLabel: 'F3' },
  { key: 'freezer4Temperature', label: 'Freezer 4', shortLabel: 'F4' },
  { key: 'layupRoomTemperature', label: 'Lay-Up Room', shortLabel: 'Lay-Up' },
  {
    key: 'refrigeratorContainerTemperature',
    label: 'Refrigerator Container',
    shortLabel: 'Refrig. Container',
  },
];

function currentLocalDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialFormState(): FormState {
  return {
    recordedAt: currentLocalDateTime(),
    freezer1Temperature: '',
    freezer2Temperature: '',
    freezer3Temperature: '',
    freezer4Temperature: '',
    layupRoomTemperature: '',
    refrigeratorContainerTemperature: '',
    notes: '',
  };
}

function formatTemperature(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)} deg F` : '--';
}

export default function FreezerTemperatureLogPage() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: logs = [],
    isLoading,
    isError,
  } = useQuery<FreezerTemperatureLog[]>({
    queryKey: ['/api/quality/freezer-temperature-logs'],
    queryFn: () =>
      apiRequest('/api/quality/freezer-temperature-logs?limit=250'),
  });

  const createLog = useMutation({
    mutationFn: () =>
      apiRequest('/api/quality/freezer-temperature-logs', {
        method: 'POST',
        body: {
          ...form,
          recordedAt: new Date(form.recordedAt).toISOString(),
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/quality/freezer-temperature-logs'],
      });
      setForm(initialFormState());
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

  const allTemperaturesEntered = temperatureFields.every(
    ({ key }) => form[key].trim() !== '' && Number.isFinite(Number(form[key]))
  );
  const latest = logs[0];

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
            <Snowflake className="h-8 w-8 text-blue-600" />
            Freezer Temperature Log
          </h1>
          <p className="mt-2 text-gray-600">
            Digital replacement for the handwritten freezer check sheet.
          </p>
        </div>
        <Badge variant="outline" className="w-fit px-3 py-1 text-sm">
          All readings in degrees Fahrenheit
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            Record a temperature check
          </CardTitle>
          <CardDescription>
            Enter all six readings from the current check. Your employee name is
            attached automatically when the record is saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (allTemperaturesEntered) createLog.mutate();
            }}
          >
            <div className="max-w-sm space-y-2">
              <Label htmlFor="recorded-at">Date and time</Label>
              <Input
                id="recorded-at"
                type="datetime-local"
                required
                value={form.recordedAt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    recordedAt: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {temperatureFields.map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <div className="relative">
                    <Input
                      id={key}
                      type="number"
                      inputMode="decimal"
                      min="-200"
                      max="200"
                      step="0.1"
                      required
                      className="pr-10 text-lg font-medium"
                      placeholder="0.0"
                      value={form[key]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                    <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-gray-500">
                      deg F
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">
                Notes or corrective action (optional)
              </Label>
              <Textarea
                id="notes"
                maxLength={2000}
                placeholder="Add details if a reading needs attention."
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                size="lg"
                disabled={
                  !allTemperaturesEntered ||
                  !form.recordedAt ||
                  createLog.isPending
                }
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
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {temperatureFields.map(({ key, shortLabel }) => (
              <div key={key} className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {shortLabel}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {formatTemperature(latest[key])}
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
          {isLoading ? (
            <p className="py-8 text-center text-gray-500">
              Loading temperature history...
            </p>
          ) : isError ? (
            <div className="flex items-center justify-center gap-2 py-8 text-red-700">
              <AlertCircle className="h-5 w-5" />
              Temperature history could not be loaded.
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
                  {temperatureFields.map(({ key, shortLabel }) => (
                    <TableHead key={key} className="text-right">
                      {shortLabel}
                    </TableHead>
                  ))}
                  <TableHead>Employee</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {new Date(log.recordedAt).toLocaleString()}
                    </TableCell>
                    {temperatureFields.map(({ key }) => (
                      <TableCell
                        key={key}
                        className="whitespace-nowrap text-right"
                      >
                        {formatTemperature(log[key])}
                      </TableCell>
                    ))}
                    <TableCell className="whitespace-nowrap">
                      {log.recordedByDisplayName}
                    </TableCell>
                    <TableCell className="min-w-48">
                      {log.notes || '--'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
