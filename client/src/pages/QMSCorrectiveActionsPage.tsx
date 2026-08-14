import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  RefreshCw,
  Save,
} from 'lucide-react';
import { useLocation } from 'wouter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';

type FormData = {
  requestedBy: string;
  initiationDate: string;
  projectActivityName: string;
  partDescription: string;
  partNumber: string;
  customerSupplier: string;
  orderPoNumber: string;
  miscInfo: string;
  teamMembers: string;
  additionalImpact: 'YES' | 'NO' | 'UNKNOWN';
  affectedPartNumbers: string;
  containmentRequired: 'YES' | 'NO';
  containmentDueDate: string;
  correction: string;
  correctiveActionDueDate: string;
  effectivenessDueDate: string;
  effectivenessReviewer: string;
  closeoutReviewer: string;
  closeoutDate: string;
  humanFactorsConsidered: string;
  consequencesAndCommunication: string;
  qmsChangesRequired: string;
};

type CarRecord = {
  id: string;
  capaNumber: string;
  title: string;
  problemStatement: string;
  containmentAction?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
  recurrenceCheckPlan?: string | null;
  effectivenessCriteria?: string | null;
  effectivenessReview?: string | null;
  effectivenessStatus: string;
  status: string;
  dueDate?: string | null;
  carFormData?: Partial<FormData> | null;
  createdAt: string;
};

const emptyForm = (): FormData => ({
  requestedBy: '',
  initiationDate: new Date().toISOString().slice(0, 10),
  projectActivityName: '',
  partDescription: '',
  partNumber: '',
  customerSupplier: '',
  orderPoNumber: '',
  miscInfo: '',
  teamMembers: '',
  additionalImpact: 'UNKNOWN',
  affectedPartNumbers: '',
  containmentRequired: 'YES',
  containmentDueDate: '',
  correction: '',
  correctiveActionDueDate: '',
  effectivenessDueDate: '',
  effectivenessReviewer: '',
  closeoutReviewer: '',
  closeoutDate: '',
  humanFactorsConsidered: '',
  consequencesAndCommunication: '',
  qmsChangesRequired: '',
});

const api = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'CAR operation failed');
  return payload;
};

const Field = ({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <Input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>
);

export default function QMSCorrectiveActionsPage() {
  const { can } = usePermissions();
  const canCreate =
    can('quality.manage_capa') || can('qms.quality_action.car_create');
  const [, navigate] = useLocation();
  const [records, setRecords] = useState<CarRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canSave = can('quality.manage_capa') || (!selectedId && canCreate);
  const [title, setTitle] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [containmentAction, setContainmentAction] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [effectivenessCriteria, setEffectivenessCriteria] = useState('');
  const [effectivenessReview, setEffectivenessReview] = useState('');
  const [status, setStatus] = useState('open');
  const [effectivenessStatus, setEffectivenessStatus] = useState('not_started');
  const [dueDate, setDueDate] = useState('');
  const [form, setForm] = useState<FormData>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (keepId?: string | null) => {
    setError('');
    try {
      const rows = await api('/api/quality/capa');
      const next = Array.isArray(rows) ? rows : [];
      setRecords(next);
      if (keepId)
        selectRecord(next.find((row: CarRecord) => row.id === keepId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load CARs'
      );
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectRecord = (record?: CarRecord) => {
    if (!record) return;
    setSelectedId(record.id);
    setTitle(record.title ?? '');
    setProblemStatement(record.problemStatement ?? '');
    setContainmentAction(record.containmentAction ?? '');
    setRootCause(record.rootCause ?? '');
    setCorrectiveAction(record.correctiveAction ?? '');
    setEffectivenessCriteria(record.effectivenessCriteria ?? '');
    setEffectivenessReview(record.effectivenessReview ?? '');
    setStatus(record.status ?? 'open');
    setEffectivenessStatus(record.effectivenessStatus ?? 'not_started');
    setDueDate(record.dueDate?.slice(0, 10) ?? '');
    setForm({ ...emptyForm(), ...(record.carFormData ?? {}) });
  };

  const startNew = () => {
    setSelectedId(null);
    setTitle('');
    setProblemStatement('');
    setContainmentAction('');
    setRootCause('');
    setCorrectiveAction('');
    setEffectivenessCriteria('');
    setEffectivenessReview('');
    setStatus('open');
    setEffectivenessStatus('not_started');
    setDueDate('');
    setForm(emptyForm());
  };

  const updateForm = (key: keyof FormData, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!title.trim() || !problemStatement.trim()) {
      setError('CAR title and problem description are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        sourceType: 'CAR',
        title,
        problemStatement,
        containmentAction:
          form.containmentRequired === 'YES'
            ? containmentAction
            : 'Not required',
        rootCause,
        correctiveAction,
        recurrenceCheckPlan: effectivenessCriteria,
        effectivenessCriteria,
        effectivenessReview,
        effectivenessStatus,
        status,
        dueDate: dueDate || null,
        carFormData: form,
      };
      const saved = await api(
        selectedId ? `/api/quality/capa/${selectedId}` : '/api/quality/capa',
        {
          method: selectedId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      );
      setSelectedId(saved.id);
      await load(saved.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save CAR');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Corrective Action Reports</h1>
          <p className="text-muted-foreground">
            Template-based CARs with containment, root cause, corrective action,
            and effectiveness verification.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load(selectedId)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/qms/change-control')}
          >
            Quality Action &amp; Change Control
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          {canCreate && (
            <Button onClick={startNew}>
              <FilePlus2 className="mr-2 h-4 w-4" />
              New CAR
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>CAR register</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {records.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => selectRecord(record)}
                className={`w-full rounded-md border p-3 text-left hover:bg-muted ${selectedId === record.id ? 'border-primary bg-muted' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{record.capaNumber}</span>
                  <Badge
                    variant={
                      record.status === 'closed' ? 'secondary' : 'outline'
                    }
                  >
                    {record.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{record.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Due {record.dueDate?.slice(0, 10) || 'not set'}
                </p>
              </button>
            ))}
            {!records.length && (
              <p className="text-sm text-muted-foreground">
                No CARs have been created.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>
                Corrective Action Report{' '}
                {selectedId
                  ? records.find((row) => row.id === selectedId)?.capaNumber
                  : '(new)'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <Field
                  label="Requested by"
                  value={form.requestedBy}
                  onChange={(v) => updateForm('requestedBy', v)}
                />
                <Field
                  label="Initiation date"
                  type="date"
                  value={form.initiationDate}
                  onChange={(v) => updateForm('initiationDate', v)}
                />
                <Field
                  label="CAR due date"
                  type="date"
                  value={dueDate}
                  onChange={setDueDate}
                />
                <Field
                  label="Project / activity name"
                  value={form.projectActivityName}
                  onChange={(v) => updateForm('projectActivityName', v)}
                />
                <Field
                  label="Part description"
                  value={form.partDescription}
                  onChange={(v) => updateForm('partDescription', v)}
                />
                <Field
                  label="Part number"
                  value={form.partNumber}
                  onChange={(v) => updateForm('partNumber', v)}
                />
                <Field
                  label="Customer / supplier"
                  value={form.customerSupplier}
                  onChange={(v) => updateForm('customerSupplier', v)}
                />
                <Field
                  label="Order / PO number"
                  value={form.orderPoNumber}
                  onChange={(v) => updateForm('orderPoNumber', v)}
                />
                <Field
                  label="Misc. information"
                  value={form.miscInfo}
                  onChange={(v) => updateForm('miscInfo', v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Team members</Label>
                <Textarea
                  value={form.teamMembers}
                  onChange={(e) => updateForm('teamMembers', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>1. Problem and scope</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="CAR title" value={title} onChange={setTitle} />
              <div className="space-y-1.5">
                <Label>
                  Problem description (quantify the nonconformity and include
                  relevant evidence)
                </Label>
                <Textarea
                  className="min-h-28"
                  value={problemStatement}
                  onChange={(e) => setProblemStatement(e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Could other product or processes be affected?</Label>
                  <Select
                    value={form.additionalImpact}
                    onValueChange={(v) => updateForm('additionalImpact', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['YES', 'NO', 'UNKNOWN'].map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Field
                  label="Affected part numbers / lots / serials"
                  value={form.affectedPartNumbers}
                  onChange={(v) => updateForm('affectedPartNumbers', v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Consequences, risk, and required communication</Label>
                <Textarea
                  value={form.consequencesAndCommunication}
                  onChange={(e) =>
                    updateForm('consequencesAndCommunication', e.target.value)
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Containment and correction</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Containment required?</Label>
                  <Select
                    value={form.containmentRequired}
                    onValueChange={(v) => updateForm('containmentRequired', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YES">YES</SelectItem>
                      <SelectItem value="NO">NO / N/A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field
                  label="Containment due date"
                  type="date"
                  value={form.containmentDueDate}
                  onChange={(v) => updateForm('containmentDueDate', v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Containment action or N/A rationale</Label>
                <Textarea
                  value={containmentAction}
                  onChange={(e) => setContainmentAction(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Correction (action to eliminate the detected nonconformity)
                </Label>
                <Textarea
                  value={form.correction}
                  onChange={(e) => updateForm('correction', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Root cause and corrective action</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Root cause investigation</Label>
                <Textarea
                  className="min-h-28"
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Human factors considered during causal analysis</Label>
                <Textarea
                  value={form.humanFactorsConsidered}
                  onChange={(e) =>
                    updateForm('humanFactorsConsidered', e.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Corrective action</Label>
                <Textarea
                  className="min-h-28"
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                />
              </div>
              <Field
                label="Corrective action due date"
                type="date"
                value={form.correctiveActionDueDate}
                onChange={(v) => updateForm('correctiveActionDueDate', v)}
              />
              <div className="space-y-1.5">
                <Label>Required QMS / document / process changes</Label>
                <Textarea
                  value={form.qmsChangesRequired}
                  onChange={(e) =>
                    updateForm('qmsChangesRequired', e.target.value)
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. Effectiveness and closeout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Effectiveness criteria and recurrence check plan</Label>
                <Textarea
                  value={effectivenessCriteria}
                  onChange={(e) => setEffectivenessCriteria(e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Effectiveness review due date"
                  type="date"
                  value={form.effectivenessDueDate}
                  onChange={(v) => updateForm('effectivenessDueDate', v)}
                />
                <Field
                  label="Effectiveness reviewer"
                  value={form.effectivenessReviewer}
                  onChange={(v) => updateForm('effectivenessReviewer', v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Effectiveness review evidence</Label>
                <Textarea
                  value={effectivenessReview}
                  onChange={(e) => setEffectivenessReview(e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Effectiveness status</Label>
                  <Select
                    value={effectivenessStatus}
                    onValueChange={setEffectivenessStatus}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'not_started',
                        'pending_review',
                        'effective',
                        'ineffective',
                      ].map((v) => (
                        <SelectItem key={v} value={v}>
                          {v.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>CAR status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'open',
                        'in_progress',
                        'effectiveness_review',
                        'closed',
                        'void',
                      ].map((v) => (
                        <SelectItem key={v} value={v}>
                          {v.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Closeout reviewer"
                  value={form.closeoutReviewer}
                  onChange={(v) => updateForm('closeoutReviewer', v)}
                />
                <Field
                  label="Closeout date"
                  type="date"
                  value={form.closeoutDate}
                  onChange={(v) => updateForm('closeoutDate', v)}
                />
              </div>
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <CheckCircle2 className="mr-2 inline h-4 w-4" />
                Close only after implementation evidence demonstrates the action
                addressed the root cause and remained effective for the planned
                interval.
              </div>
            </CardContent>
          </Card>

          {canSave && (
            <div className="flex justify-end">
              <Button disabled={busy} onClick={() => void save()}>
                <Save className="mr-2 h-4 w-4" />
                {busy ? 'Saving…' : 'Save CAR'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
