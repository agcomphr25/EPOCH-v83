import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Save } from 'lucide-react';

interface ChainLevel {
  role: string;
  slaSeconds: number;
  isBackstop?: boolean;
}

interface Policy {
  id: number;
  requestType: string;
  displayName: string;
  description: string | null;
  chain: ChainLevel[];
  requiresSignature: boolean;
  reasonCodes: string[];
  isActive: boolean;
}

const blankPolicy: Omit<Policy, 'id'> = {
  requestType: '',
  displayName: '',
  description: '',
  chain: [{ role: '', slaSeconds: 14400 }],
  requiresSignature: false,
  reasonCodes: [],
  isActive: true,
};

export default function EscalationPoliciesPage() {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Partial<Policy>>(blankPolicy);

  const { data: policies = [], isLoading } = useQuery<Policy[]>({
    queryKey: ['/api/escalation-policies'],
  });

  const save = useMutation({
    mutationFn: async (p: Partial<Policy>) => {
      const url = p.id ? `/api/escalation-policies/${p.id}` : '/api/escalation-policies';
      const res = await apiRequest(url, {
        method: p.id ? 'PUT' : 'POST',
        body: JSON.stringify(p),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Saved', description: 'Escalation policy persisted.' });
      queryClient.invalidateQueries({ queryKey: ['/api/escalation-policies'] });
      setDraft(blankPolicy);
    },
    onError: (e: any) =>
      toast({ title: 'Save failed', description: e?.message ?? 'unknown', variant: 'destructive' }),
  });

  const editing = draft.id != null;
  const chain: ChainLevel[] = draft.chain ?? [];
  const reasonCodesText = (draft.reasonCodes ?? []).join(', ');

  return (
    <div className="container mx-auto p-4 max-w-6xl" data-testid="page-escalation-policies">
      <h1 className="text-2xl font-bold mb-4">Escalation Policies</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Each request type has one chain. Each level pins a role and an SLA in seconds; the last
        level can be marked the backstop. When the backstop SLA expires, the request becomes
        EXPIRED — never silently approved.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Policies ({policies.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
            {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {policies.map((p) => (
              <button
                key={p.id}
                onClick={() => setDraft(p)}
                className={`w-full text-left p-3 rounded border hover:bg-accent ${
                  draft.id === p.id ? 'bg-accent border-primary' : ''
                }`}
                data-testid={`button-policy-${p.requestType}`}
              >
                <div className="flex justify-between items-start">
                  <div className="font-medium text-sm">{p.displayName}</div>
                  {!p.isActive && <Badge variant="outline">inactive</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.requestType} · {p.chain?.length ?? 0} levels
                </div>
              </button>
            ))}
            <Button variant="outline" className="w-full" onClick={() => setDraft(blankPolicy)} data-testid="button-new-policy">
              <Plus className="h-4 w-4 mr-1" /> New policy
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{editing ? 'Edit policy' : 'New policy'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold">Request type</label>
                <Input
                  value={draft.requestType ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, requestType: e.target.value }))}
                  placeholder="OVERRIDE_APPROVAL"
                  disabled={editing}
                  data-testid="input-request-type"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Display name</label>
                <Input
                  value={draft.displayName ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
                  data-testid="input-display-name"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold">Description</label>
              <Textarea
                value={draft.description ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                data-testid="input-description"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold">Escalation chain</label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      chain: [...(d.chain ?? []), { role: '', slaSeconds: 86400 }],
                    }))
                  }
                  data-testid="button-add-level"
                >
                  <Plus className="h-3 w-3 mr-1" /> Level
                </Button>
              </div>
              <div className="space-y-2">
                {chain.map((lvl, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1 text-sm font-mono text-muted-foreground">L{i}</div>
                    <Input
                      className="col-span-5"
                      value={lvl.role}
                      onChange={(e) => {
                        const next = [...chain];
                        next[i] = { ...next[i], role: e.target.value };
                        setDraft((d) => ({ ...d, chain: next }));
                      }}
                      placeholder="Production Supervisor"
                      data-testid={`input-role-${i}`}
                    />
                    <Input
                      className="col-span-3"
                      type="number"
                      value={lvl.slaSeconds}
                      onChange={(e) => {
                        const next = [...chain];
                        next[i] = { ...next[i], slaSeconds: Number(e.target.value) };
                        setDraft((d) => ({ ...d, chain: next }));
                      }}
                      data-testid={`input-sla-${i}`}
                    />
                    <label className="col-span-2 flex items-center gap-1 text-xs">
                      <Switch
                        checked={!!lvl.isBackstop}
                        onCheckedChange={(v) => {
                          const next = [...chain];
                          next[i] = { ...next[i], isBackstop: v };
                          setDraft((d) => ({ ...d, chain: next }));
                        }}
                        data-testid={`switch-backstop-${i}`}
                      />
                      backstop
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="col-span-1"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          chain: (d.chain ?? []).filter((_, j) => j !== i),
                        }))
                      }
                      data-testid={`button-remove-level-${i}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold">Reason codes (comma-separated)</label>
              <Input
                value={reasonCodesText}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    reasonCodes: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                data-testid="input-reason-codes"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={!!draft.requiresSignature}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, requiresSignature: v }))}
                  data-testid="switch-requires-signature"
                />
                Requires signature
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.isActive ?? true}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
                  data-testid="switch-active"
                />
                Active
              </label>
            </div>

            <Button
              onClick={() => save.mutate(draft)}
              disabled={save.isPending || !draft.requestType || !draft.displayName || chain.length === 0}
              data-testid="button-save-policy"
            >
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
