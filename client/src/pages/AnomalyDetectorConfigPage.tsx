import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Settings } from 'lucide-react';

type DetectorRow = {
  key: string;
  description: string;
  defaultSeverity: string;
  defaultConfig: Record<string, unknown>;
  enabled: boolean;
  config: Record<string, unknown>;
  notificationRecipientUserIds: number[];
  notifyOnHigh: boolean;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
};

function DetectorEditor({ row }: { row: DetectorRow }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(row.enabled);
  const [notifyOnHigh, setNotifyOnHigh] = useState(row.notifyOnHigh);
  const [recipients, setRecipients] = useState((row.notificationRecipientUserIds ?? []).join(','));
  const [configText, setConfigText] = useState(JSON.stringify(row.config ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(row.enabled);
    setNotifyOnHigh(row.notifyOnHigh);
    setRecipients((row.notificationRecipientUserIds ?? []).join(','));
    setConfigText(JSON.stringify(row.config ?? {}, null, 2));
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(configText);
      } catch {
        throw new Error('Config must be valid JSON');
      }
      const recipientIds = recipients
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      return apiRequest('PATCH', `/api/inventory-anomalies/detectors/${row.key}`, {
        enabled,
        config: parsed,
        notifyOnHigh,
        notificationRecipientUserIds: recipientIds,
      });
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-anomalies/detectors'] });
      toast({ title: 'Detector updated' });
    },
    onError: (err: any) => {
      setError(err?.message ?? 'Failed');
      toast({ title: 'Save failed', description: err?.message ?? '', variant: 'destructive' });
    },
  });

  return (
    <Card data-testid={`card-detector-${row.key}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="font-mono text-base">{row.key}</span>
          <div className="flex items-center gap-2">
            <Label htmlFor={`enabled-${row.key}`} className="text-sm">Enabled</Label>
            <Switch
              id={`enabled-${row.key}`}
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid={`switch-enabled-${row.key}`}
            />
          </div>
        </CardTitle>
        <CardDescription>{row.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-sm">Threshold config (JSON)</Label>
          <Textarea
            rows={5}
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            className="font-mono text-xs"
            data-testid={`input-config-${row.key}`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm">Notify recipient user IDs (comma-sep)</Label>
            <Input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="1,2,3"
              data-testid={`input-recipients-${row.key}`}
            />
          </div>
          <div className="flex items-end gap-2">
            <Switch
              checked={notifyOnHigh}
              onCheckedChange={setNotifyOnHigh}
              data-testid={`switch-notify-${row.key}`}
            />
            <Label className="text-sm">Notify on HIGH/CRITICAL</Label>
          </div>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex justify-between items-center">
          <div className="text-xs text-muted-foreground">
            {row.updatedAt
              ? `Updated ${new Date(row.updatedAt).toLocaleString()} by ${row.updatedByDisplayName ?? 'system'}`
              : 'Defaults'}
          </div>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            data-testid={`button-save-${row.key}`}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnomalyDetectorConfigPage() {
  const { data, isLoading } = useQuery<DetectorRow[]>({
    queryKey: ['/api/inventory-anomalies/detectors'],
    queryFn: async () => {
      const res = await fetch('/api/inventory-anomalies/detectors', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
        <Settings className="w-7 h-7" />
        Anomaly Detector Configuration
      </h1>
      {isLoading ? (
        <div>Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(data ?? []).map((row) => (
            <DetectorEditor key={row.key} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
