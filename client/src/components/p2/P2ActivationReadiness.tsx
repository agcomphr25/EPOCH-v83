import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, LockKeyhole } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type ActivationState = {
  key: string;
  label: string;
  phase: number;
  mode: string;
  serverEnabled: boolean;
  clientEnabled: boolean;
  mismatch: boolean;
  missingDependencies: string[];
  ready: boolean;
};

type ActivationReadiness = {
  environment: string;
  productionActivationAutomatic: false;
  ready: boolean;
  enabledCount: number;
  totalCount: number;
  blockers: Array<{ key: string; reason: string; correction: string }>;
  states: ActivationState[];
};

export default function P2ActivationReadiness() {
  const { data, isLoading, error } = useQuery<ActivationReadiness>({
    queryKey: ['/api/p2-activation/readiness'],
  });

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-6">
          Checking controlled-pilot readiness…
        </CardContent>
      </Card>
    );
  if (error || !data)
    return (
      <Card className="border-red-300">
        <CardContent className="p-6 text-red-700">
          Activation readiness is unavailable. No production feature was
          enabled.
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-4" data-testid="p2-activation-readiness">
      <Card className={data.ready ? 'border-green-300' : 'border-amber-300'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {data.ready ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            Controlled pilot readiness
          </CardTitle>
          <CardDescription>
            Read-only dependency review. This screen cannot enable production
            features.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Configuration</p>
            <p className="font-medium">{data.environment}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Enabled controls</p>
            <p className="font-medium">
              {data.enabledCount} of {data.totalCount}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Automatic activation
            </p>
            <p className="font-medium">Never</p>
          </div>
        </CardContent>
      </Card>

      {data.blockers.length > 0 && (
        <Card className="border-red-300">
          <CardHeader>
            <CardTitle>Activation blockers</CardTitle>
            <CardDescription>
              Correct these settings before an authorized synthetic pilot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.blockers.map((blocker) => (
              <div
                key={blocker.key}
                className="rounded border border-red-200 p-3 text-sm"
              >
                <p className="font-medium">{blocker.reason}</p>
                <p className="text-muted-foreground">
                  Where to correct: controlled server and client pilot
                  configuration. {blocker.correction}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Workflow controls</CardTitle>
          <CardDescription>
            Read controls may be piloted before dependent write and release
            controls. Every setting requires exact opt-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.states.map((state) => (
            <div
              key={state.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
            >
              <div>
                <p className="font-medium">{state.label}</p>
                <p className="text-sm text-muted-foreground">
                  Stage {state.phase} · {state.mode.toLowerCase()} control
                </p>
              </div>
              <div className="flex items-center gap-2">
                {state.mismatch && (
                  <Badge variant="destructive">Settings disagree</Badge>
                )}
                {state.missingDependencies.length > 0 && (
                  <Badge variant="destructive">Prerequisite missing</Badge>
                )}
                <Badge variant={state.serverEnabled ? 'default' : 'outline'}>
                  {state.serverEnabled ? 'Pilot enabled' : 'Disabled'}
                </Badge>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
            <LockKeyhole className="h-4 w-4" />
            Server authorization remains authoritative for every operation.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
