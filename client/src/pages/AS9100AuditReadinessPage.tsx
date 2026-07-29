import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, CheckCircle2, ExternalLink, FileText, Lock, Plus, Printer, Search, ShieldCheck } from 'lucide-react';

import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Assessment = {
  id: string; assessment_number: string; title: string; audit_type: string; status: string;
  planned_start_date: string; planned_end_date: string; owner_display_name: string;
  epoch_version: string; qms_scope: string; facility: string; template_version: number;
};
type Item = {
  id: string; item_key: string; section_key: string; section_title: string; action_statement: string;
  purpose: string; clause_reference: string; criticality: string; status: string; due_date?: string;
  assigned_employee_name?: string; assigned_department?: string; evidence_count: number; row_version: number;
};
type Detail = {
  assessment: Assessment & { assessment_version: number; product_design_in_scope: boolean };
  items: Item[];
  readiness: Record<string, number>;
  epochSoftwareValidation?: {
    state: string; message: string; complete: boolean; blockers: string[];
    package?: { id: string; packageNumber: string; status: string; productionVersion: string } | null;
    versionMatches?: boolean; periodicReviewCurrent?: boolean;
    readiness?: Record<string, any>;
  };
};

const statusTone = (status: string) => {
  if (['COMPLETE', 'VERIFIED', 'LOCKED', 'APPROVED'].includes(status)) return 'bg-emerald-100 text-emerald-800';
  if (status === 'NOT_APPLICABLE_APPROVED') return 'bg-slate-100 text-slate-700';
  if (['BLOCKED', 'RETURNED_FOR_CORRECTION', 'CORRECTIONS_REQUIRED'].includes(status)) return 'bg-red-100 text-red-800';
  if (['EVIDENCE_REQUIRED', 'READY_FOR_REVIEW', 'UNDER_REVIEW', 'READY_FOR_APPROVAL'].includes(status)) return 'bg-amber-100 text-amber-800';
  return 'bg-blue-100 text-blue-800';
};
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function AS9100AuditReadinessPage() {
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('ALL');
  const [auditorView, setAuditorView] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [designInScope, setDesignInScope] = useState(false);
  const [softwareInScope, setSoftwareInScope] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const list = useQuery<Assessment[]>({
    queryKey: ['/api/qms/as9100-audit-readiness'],
    queryFn: async () => (await apiRequest('/api/qms/as9100-audit-readiness')).json(),
  });
  const detail = useQuery<Detail>({
    queryKey: ['/api/qms/as9100-audit-readiness', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => (await apiRequest(`/api/qms/as9100-audit-readiness/${selectedId}`)).json(),
  });

  const filtered = useMemo(() => (detail.data?.items || []).filter(item => {
    const haystack = `${item.item_key} ${item.action_statement} ${item.clause_reference} ${item.assigned_employee_name || ''}`.toLowerCase();
    return (section === 'ALL' || item.section_key === section) && haystack.includes(search.toLowerCase());
  }), [detail.data?.items, search, section]);
  const sectionStats = useMemo(() => {
    const map = new Map<string, { title: string; total: number; done: number; critical: number }>();
    for (const item of detail.data?.items || []) {
      const value = map.get(item.section_key) || { title: item.section_title, total: 0, done: 0, critical: 0 };
      value.total++;
      if (['COMPLETE', 'VERIFIED', 'NOT_APPLICABLE_APPROVED'].includes(item.status)) value.done++;
      if (item.criticality === 'CRITICAL' && !['COMPLETE', 'VERIFIED', 'NOT_APPLICABLE_APPROVED'].includes(item.status)) value.critical++;
      map.set(item.section_key, value);
    }
    return [...map.entries()];
  }, [detail.data?.items]);

  const createAssessment = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      const body = {
        title: data.get('title'), auditType: data.get('auditType'), standard: 'AS9100D',
        certificationBody: data.get('certificationBody') || undefined, auditor: data.get('auditor') || undefined,
        plannedStartDate: data.get('plannedStartDate'), plannedEndDate: data.get('plannedEndDate'),
        ownerDisplayName: data.get('ownerDisplayName'), epochVersion: data.get('epochVersion'),
        qmsScope: data.get('qmsScope'), facility: data.get('facility'), notes: data.get('notes') || undefined,
        productDesignInScope: designInScope,
        deliverableSoftwareInScope: softwareInScope,
      };
      return (await apiRequest('/api/qms/as9100-audit-readiness', { method: 'POST', body })).json();
    },
    onSuccess: (created: Assessment) => {
      queryClient.invalidateQueries({ queryKey: ['/api/qms/as9100-audit-readiness'] });
      setSelectedId(created.id); setCreateOpen(false);
      toast({ title: `${created.assessment_number} created` });
    },
    onError: (error: Error) => toast({ title: 'Assessment was not created', description: error.message, variant: 'destructive' }),
  });

  if (selectedId && detail.data) {
    const { assessment, readiness } = detail.data;
    const days = Math.ceil((new Date(assessment.planned_start_date).getTime() - Date.now()) / 86400000);
    return <div className="container mx-auto space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" className="px-0" onClick={() => setSelectedId(undefined)}>← Assessment cycles</Button>
          <h1 className="text-2xl font-bold">{assessment.assessment_number} · {assessment.title}</h1>
          <p className="text-sm text-muted-foreground">{assessment.facility} · AS9100D · Template v{assessment.template_version} · Assessment v{assessment.assessment_version}</p>
        </div>
        <div className="flex gap-2">
          <Button variant={auditorView ? 'default' : 'outline'} onClick={() => setAuditorView(v => !v)}><ShieldCheck className="mr-2 h-4 w-4" />Auditor View</Button>
          <Button variant="outline" onClick={() => window.open(`/api/qms/as9100-audit-readiness/${assessment.id}/export?view=checklist`, '_blank')}><Printer className="mr-2 h-4 w-4" />Print Checklist</Button>
          <Button variant="outline" onClick={() => window.open(`/api/qms/as9100-audit-readiness/${assessment.id}/export?view=auditor-package`, '_blank')}>Export Auditor Package</Button>
          <Button variant="outline" onClick={() => window.open(`/api/qms/as9100-audit-readiness/${assessment.id}/export?view=open-actions`, '_blank')}>Export Open Actions</Button>
          <Button variant="outline" onClick={() => window.open(`/api/qms/as9100-audit-readiness/${assessment.id}/export?view=evidence-index`, '_blank')}>Export Evidence Index</Button>
        </div>
      </div>
      {assessment.status !== 'LOCKED' && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">DRAFT — NOT FINAL AUDIT EVIDENCE</div>}
      {assessment.status === 'LOCKED' && <div className="rounded-md border border-emerald-400 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"><Lock className="mr-2 inline h-4 w-4" />CONTROLLED AUDIT READINESS RECORD</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric title="Overall readiness" value={`${readiness.readiness_percentage || 0}%`} icon={<CheckCircle2 />} />
        <Metric title="Days until audit" value={String(days)} icon={<CalendarDays />} />
        <Metric title="Critical blockers" value={String(readiness.critical_open_items || 0)} danger icon={<AlertTriangle />} />
        <Metric title="Missing evidence" value={String(readiness.missing_evidence_items || 0)} danger icon={<FileText />} />
        <Metric title="Overdue actions" value={String(readiness.overdue_items || 0)} danger icon={<AlertTriangle />} />
      </div>
      <Card><CardHeader><CardTitle className="text-base">Scope and approval state</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-4">
        <div><span className="text-xs text-muted-foreground">Owner</span><p>{assessment.owner_display_name}</p></div>
        <div><span className="text-xs text-muted-foreground">Audit date</span><p>{assessment.planned_start_date} – {assessment.planned_end_date}</p></div>
        <div><span className="text-xs text-muted-foreground">EPOCH version</span><p>{assessment.epoch_version}</p></div>
        <div><span className="text-xs text-muted-foreground">Approval state</span><p><Badge className={statusTone(assessment.status)}>{label(assessment.status)}</Badge></p></div>
        <div className="md:col-span-4"><span className="text-xs text-muted-foreground">QMS scope</span><p>{assessment.qms_scope}</p></div>
      </CardContent></Card>
      <Card className={detail.data.epochSoftwareValidation?.complete ? 'border-emerald-400' : 'border-amber-400'}>
        <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div>
          <CardTitle className="text-base">Section 2 — EPOCH Intended-Use Validation</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{detail.data.epochSoftwareValidation?.message || 'Not validated — create or link an EPOCH Software Validation Package.'}</p>
        </div><div className="flex flex-wrap gap-2">
          <Button onClick={() => { window.location.href = '/qms/epoch-software-validation'; }}>Open EPOCH Software Validation</Button>
          {detail.data.epochSoftwareValidation?.package && <Button variant="outline" onClick={() => { window.location.href = '/qms/epoch-software-validation'; }}>View Approved Validation</Button>}
          <Button variant="outline" onClick={() => setSection('02')}>View Blockers</Button>
          <Button variant="outline" onClick={() => setSection('02')}>View Evidence</Button>
          <Button variant="outline" onClick={() => { window.location.href = '/qms/epoch-software-validation'; }}>View Validation History</Button>
        </div></div></CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Intended Use approved', detail.data.epochSoftwareValidation?.readiness?.intendedUseApproved],
              ['Software requirements approved', detail.data.epochSoftwareValidation?.readiness?.requirementsBaselineApproved],
              ['Risk assessment approved', detail.data.epochSoftwareValidation?.readiness?.riskAssessmentApproved],
              ['Validation Plan approved', detail.data.epochSoftwareValidation?.readiness?.validationPlanApproved],
              ['Critical requirements tested', detail.data.epochSoftwareValidation?.readiness && detail.data.epochSoftwareValidation.readiness.criticalRequirementsTested >= detail.data.epochSoftwareValidation.readiness.criticalRequirements],
              ['Critical tests passed', detail.data.epochSoftwareValidation?.readiness && detail.data.epochSoftwareValidation.readiness.criticalTestsPassed >= detail.data.epochSoftwareValidation.readiness.criticalTests],
              ['No open critical defects', detail.data.epochSoftwareValidation?.readiness?.openCriticalDefects === 0],
              ['No unaccepted high defects', detail.data.epochSoftwareValidation?.readiness && detail.data.epochSoftwareValidation.readiness.openHighDefects <= detail.data.epochSoftwareValidation.readiness.acceptedHighDefects],
              ['Backup verification', detail.data.epochSoftwareValidation?.readiness?.backupPassed],
              ['Restore test', detail.data.epochSoftwareValidation?.readiness?.restorePassed],
              ['Outage drill', detail.data.epochSoftwareValidation?.readiness?.outageDrillPassed],
              ['Production version approved', detail.data.epochSoftwareValidation?.versionMatches],
              ['Periodic review current', detail.data.epochSoftwareValidation?.periodicReviewCurrent],
            ].map(([name, ok]) => <div key={String(name)} className="flex items-center gap-2 rounded border p-2 text-sm">
              {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
              <span>{name}</span>
            </div>)}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card><CardHeader><CardTitle className="text-base">12 checklist sections</CardTitle></CardHeader><CardContent className="space-y-3">
          {sectionStats.map(([key, value]) => <button key={key} className="w-full rounded-md border p-2 text-left hover:bg-muted" onClick={() => setSection(key)}>
            <div className="flex justify-between text-sm font-medium"><span>{key}. {value.title}</span><span>{value.done}/{value.total}</span></div>
            <Progress className="mt-2 h-2" value={value.total ? value.done / value.total * 100 : 0} />
            <div className="mt-1 text-xs text-muted-foreground">{value.total - value.done} open · {value.critical} critical</div>
          </button>)}
        </CardContent></Card>
        <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">Checklist workspace</CardTitle>
          <div className="flex gap-2"><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" value={search} onChange={e => setSearch(e.target.value)} placeholder="Action, evidence, owner, clause" /></div>
          <Button variant="outline" onClick={() => setSection('ALL')}>All sections</Button></div></div></CardHeader>
          <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Action / clause</TableHead><TableHead>Status</TableHead><TableHead>Owner / due</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map(item => <TableRow key={item.id}>
            <TableCell className="font-medium">{item.item_key}<br/><span className={item.criticality === 'CRITICAL' ? 'text-red-700' : 'text-muted-foreground'}>{label(item.criticality)}</span></TableCell>
            <TableCell className="max-w-xl"><b>{item.action_statement}</b><p className="text-xs text-muted-foreground">{item.purpose}</p><p className="mt-1 text-xs">AS9100 {item.clause_reference}</p></TableCell>
            <TableCell><Badge className={statusTone(item.status)}>{label(item.status)}</Badge></TableCell>
            <TableCell>{item.assigned_employee_name || 'Unassigned'}<br/><span className="text-xs text-muted-foreground">{item.due_date || 'No due date'}</span></TableCell>
            <TableCell>{item.evidence_count || 0} reference(s){!auditorView && <Button variant="ghost" size="sm" title="Open item evidence"><ExternalLink className="h-4 w-4" /></Button>}</TableCell>
          </TableRow>)}</TableBody></Table></CardContent>
        </Card>
      </div>
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">This readiness checklist supports preparation and objective-evidence organization. Completion does not by itself certify conformity or guarantee AS9100 certification. The applicable standard, customer requirements, contractual requirements, and controlled QMS procedures remain authoritative.</CardContent></Card>
    </div>;
  }

  return <div className="container mx-auto space-y-5 p-4 lg:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">AS9100 Audit Readiness</h1><p className="text-muted-foreground">Persistent assessment cycles, objective evidence, review, approval, and controlled auditor packages.</p></div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New assessment</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Create audit-readiness assessment</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); createAssessment.mutate(e.currentTarget); }} className="grid gap-4 md:grid-cols-2">
        <Field name="title" labelText="Assessment title" required />
        <div><Label>Audit type</Label><Select name="auditType" defaultValue="INTERNAL_READINESS_REVIEW"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
          {['INITIAL_CERTIFICATION','SURVEILLANCE','RECERTIFICATION','INTERNAL_READINESS_REVIEW','CUSTOMER_AUDIT','SPECIAL_PROCESS_AUDIT'].map(x => <SelectItem key={x} value={x}>{label(x)}</SelectItem>)}
        </SelectContent></Select></div>
        <Field name="plannedStartDate" labelText="Planned audit start" type="date" required />
        <Field name="plannedEndDate" labelText="Planned audit end" type="date" required />
        <Field name="certificationBody" labelText="Certification body" /><Field name="auditor" labelText="Auditor, if known" />
        <Field name="ownerDisplayName" labelText="Assessment owner" required /><Field name="epochVersion" labelText="EPOCH production version" required />
        <Field name="facility" labelText="Facility / site" required />
        <div className="flex items-center gap-3 pt-6"><Switch id="design-scope" checked={designInScope} onCheckedChange={setDesignInScope} /><Label htmlFor="design-scope">Product design in scope</Label></div>
        <div className="flex items-center gap-3"><Switch id="software-scope" checked={softwareInScope} onCheckedChange={setSoftwareInScope} /><Label htmlFor="software-scope">Deliverable software in scope</Label></div>
        <div className="md:col-span-2"><Label>QMS scope</Label><Textarea name="qmsScope" required /></div>
        <div className="md:col-span-2"><Label>Notes</Label><Textarea name="notes" /></div>
        <DialogFooter className="md:col-span-2"><Button type="submit" disabled={createAssessment.isPending}>Create assessment</Button></DialogFooter>
      </form></DialogContent></Dialog></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.data?.map(item => <Card key={item.id} className="cursor-pointer hover:border-primary" onClick={() => setSelectedId(item.id)}>
      <CardHeader><div className="flex justify-between gap-2"><CardTitle className="text-lg">{item.assessment_number}</CardTitle><Badge className={statusTone(item.status)}>{label(item.status)}</Badge></div></CardHeader>
      <CardContent><h2 className="font-semibold">{item.title}</h2><p className="mt-2 text-sm text-muted-foreground">{item.planned_start_date} · {item.facility}</p><p className="text-sm text-muted-foreground">Owner: {item.owner_display_name}</p></CardContent>
    </Card>)}</div>
    {!list.isLoading && !list.data?.length && <Card><CardContent className="py-12 text-center text-muted-foreground">No assessment cycles exist. The controlled template must be reviewed and released before the first assessment can be created.</CardContent></Card>}
  </div>;
}

function Metric({ title, value, icon, danger }: { title: string; value: string; icon: React.ReactNode; danger?: boolean }) {
  return <Card><CardContent className="flex items-center gap-3 pt-5"><span className={danger && value !== '0' ? 'text-red-600' : 'text-primary'}>{icon}</span><div><p className="text-xs text-muted-foreground">{title}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card>;
}
function Field({ name, labelText, type = 'text', required = false }: { name: string; labelText: string; type?: string; required?: boolean }) {
  return <div><Label htmlFor={name}>{labelText}</Label><Input id={name} name={name} type={type} required={required} /></div>;
}
