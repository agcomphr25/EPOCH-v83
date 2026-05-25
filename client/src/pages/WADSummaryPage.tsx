import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  FileText,
  FolderOpen,
  Loader2,
  Package,
  PenLine,
  Printer,
  Route,
  ShieldCheck,
  Users,
  Wand2,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const REQUIRED_APPROVAL_ROLES = [
  { key: 'project_manager', label: 'Project Manager' },
  { key: 'engineering', label: 'Engineering' },
  { key: 'quality', label: 'Quality' },
  { key: 'operations', label: 'Operations' },
  { key: 'executive', label: 'Executive' },
];

type Decision = 'APPROVED' | 'REJECTED';

type ApprovalRecord = {
  role: string;
  userId: number | string | null;
  displayName: string;
  decision: Decision;
  comments: string | null;
  signature?: string | null;
  signatureMeaning?: string | null;
  signedAt?: string | null;
  timestamp: string;
};

type WizardData = {
  currentRevision?: number;
  revisionStatus?: string;
  step1?: Record<string, any>;
  step2?: Record<string, any>;
  step3?: { rows?: Array<Record<string, any>> };
  step4?: { chargeCodes?: Array<Record<string, any>> };
  step5?: Record<string, any>;
  step6?: Record<string, any>;
  step7?: Record<string, any>;
  step8?: Record<string, any>;
  step9?: { risks?: Array<Record<string, any>>; itarFlag?: boolean; customerFlowDowns?: string; specialProcessControls?: string };
  step10?: { documents?: Array<Record<string, any>> };
  approvals?: ApprovalRecord[];
};

type WizardContext = {
  wad: {
    id: string;
    workOrderNumber: string;
    partNumber: string | null;
    description: string | null;
    quantity: number | null;
    status: string;
    wadStatus: string;
    dueDate: string | null;
    updatedAt: string | null;
    wizardData: WizardData | null;
  };
  project: Record<string, any> | null;
  po: Record<string, any> | null;
};

type WADSummaryPageProps = {
  params: { id: string };
};

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
  return String(value);
}

function dateText(value: unknown): string {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function roleLabel(role: string): string {
  return REQUIRED_APPROVAL_ROLES.find((r) => r.key === role)?.label ?? role.replace(/_/g, ' ');
}

function FieldGrid({ rows }: { rows: Array<[string, unknown]> }) {
  return (
    <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded border bg-white px-3 py-2">
          <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
          <div className="mt-1 break-words font-medium">{valueText(value)}</div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 break-inside-avoid">
      <div className="flex items-center gap-2 border-b pb-2">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function WADSummaryPage({ params }: WADSummaryPageProps) {
  const wadId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const query = new URLSearchParams(window.location.search);
  const initialRole = query.get('role') ?? REQUIRED_APPROVAL_ROLES[0].key;
  const [role, setRole] = useState(initialRole);
  const [decision, setDecision] = useState<Decision>('APPROVED');
  const [comments, setComments] = useState('');
  const [signature, setSignature] = useState('');

  const { data, isLoading, isError, error } = useQuery<WizardContext>({
    queryKey: ['/api/work-orders/production', wadId, 'wizard'],
    queryFn: () => apiRequest(`/api/work-orders/production/${wadId}/wizard`),
  });

  const wizardData = (data?.wad?.wizardData ?? {}) as WizardData;
  const approvals = Array.isArray(wizardData.approvals) ? wizardData.approvals : [];
  const approvedRoles = useMemo(
    () => new Set(approvals.filter((a) => a.decision === 'APPROVED').map((a) => a.role)),
    [approvals],
  );
  const selectedApproval = approvals.find((a) => a.role === role);
  const isApproved = data?.wad?.wadStatus === 'APPROVED';

  const decideMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/work-orders/production/${wadId}/wizard/approve`, {
        method: 'POST',
        body: JSON.stringify({
          role,
          decision,
          comments: comments.trim() || null,
          signature: signature.trim(),
        }),
      }),
    onSuccess: (result) => {
      const updatedWizardData = result?.wad?.wizardData as WizardData | undefined;
      queryClient.setQueryData(['/api/work-orders/production', wadId, 'wizard'], (current: WizardContext | undefined) => ({
        ...((current ?? data) as WizardContext),
        wad: {
          ...((current ?? data)?.wad ?? result.wad),
          ...(result.wad ?? {}),
          wizardData: updatedWizardData ?? result?.wad?.wizardData,
        },
      }) as WizardContext);
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/production', wadId, 'wizard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/production/wad-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/production'] });
      toast({
        title: decision === 'APPROVED' ? 'Approval signed' : 'Denial signed',
        description: result?.allApproved ? 'All WAD approvals are complete.' : `${roleLabel(role)} decision recorded.`,
      });
      setComments('');
      setSignature('');
    },
    onError: (err: Error) => {
      toast({ title: 'Could not record decision', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading WAD summary...
      </div>
    );
  }

  if (isError || !data?.wad) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load WAD summary: {(error as Error)?.message ?? 'Unknown error'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const step1 = wizardData.step1 ?? {};
  const step2 = wizardData.step2 ?? {};
  const step3Rows = wizardData.step3?.rows ?? [];
  const chargeCodes = wizardData.step4?.chargeCodes ?? [];
  const step5 = wizardData.step5 ?? {};
  const step6 = wizardData.step6 ?? {};
  const step7 = wizardData.step7 ?? {};
  const step8 = wizardData.step8 ?? {};
  const risks = wizardData.step9?.risks ?? [];
  const documents = wizardData.step10?.documents ?? [];

  const canSubmit = signature.trim().length >= 2 && (decision === 'APPROVED' || comments.trim().length > 0);

  return (
    <div className="min-h-screen bg-muted/30">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; max-width: none !important; }
          .break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
      <div className="no-print border-b bg-white">
        <div className="container mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button variant="outline" size="sm" onClick={() => navigate('/wad-status')}>
              WAD Status
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/work-orders/${wadId}/wizard`)}>
              <Wand2 className="mr-1 h-3.5 w-3.5" />
              Wizard
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-3.5 w-3.5" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      <main className="container mx-auto max-w-6xl px-4 py-6">
        <Card className="print-sheet rounded-md">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">Work Authorization Document Summary</CardTitle>
                <CardDescription className="mt-1">
                  {data.wad.workOrderNumber} - {data.project?.projectName ?? data.project?.projectCode ?? 'Project not linked'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{data.wad.status}</Badge>
                <Badge className={isApproved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                  {data.wad.wadStatus}
                </Badge>
                {wizardData.currentRevision && <Badge variant="outline">Rev {wizardData.currentRevision}</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-8 p-6">
            <Section title="Contract Context" icon={<FileText className="h-4 w-4 text-blue-600" />}>
              <FieldGrid
                rows={[
                  ['Project', step1.projectNumber ?? data.project?.projectCode],
                  ['Customer', step1.customer ?? data.project?.customerName],
                  ['PO Number', step1.poNumber ?? data.po?.poNumber],
                  ['Customer Part', step1.customerPartNumber ?? step1.partNumber],
                  ['Internal Part', step1.internalPartNumber ?? data.wad.partNumber],
                  ['Revision', step1.revision],
                  ['Quantity', step1.quantity ?? data.wad.quantity],
                  ['Ship Date', step1.shipDate ?? data.wad.dueDate],
                  ['PO Review Approved', step1.poReviewApproved],
                ]}
              />
            </Section>

            <Section title="Scope Of Work" icon={<ClipboardList className="h-4 w-4 text-blue-600" />}>
              <FieldGrid
                rows={[
                  ['Build Type', step2.buildType],
                  ['Departments', step2.departments],
                  ['Deliverables', step2.deliverables],
                ]}
              />
              <div className="rounded border bg-white p-3 text-sm">
                <div className="text-[11px] font-medium uppercase text-muted-foreground">Scope Description</div>
                <p className="mt-1 whitespace-pre-wrap">{valueText(step2.scopeDescription)}</p>
              </div>
            </Section>

            <Section title="Work Breakdown" icon={<Users className="h-4 w-4 text-blue-600" />}>
              <DataTable
                emptyText="No work breakdown rows entered."
                headers={['Department', 'Operation', 'Lead', 'Hours', 'Certs', 'Traveler', 'QC']}
                rows={step3Rows.map((row) => [
                  row.department,
                  row.operation,
                  row.responsibleLead,
                  row.estimatedHours,
                  row.requiredCerts,
                  row.isTravelerStep ? 'Yes' : 'No',
                  row.requiresQCSignoff ? 'Yes' : 'No',
                ])}
              />
            </Section>

            <Section title="Charge Codes And Budgets" icon={<DollarSign className="h-4 w-4 text-blue-600" />}>
              <DataTable
                emptyText="No charge codes entered."
                headers={['Department', 'Operation', 'Charge Code', 'Category', 'Class', 'Hours', 'Overrun Rule']}
                rows={chargeCodes.map((row) => [
                  row.department,
                  row.operation,
                  row.chargeCode,
                  row.laborCategory,
                  row.classification,
                  row.budgetedHours,
                  row.overrunRule,
                ])}
              />
            </Section>

            <Section title="Material Authorization" icon={<Package className="h-4 w-4 text-blue-600" />}>
              <FieldGrid
                rows={[
                  ['BOM Linked', step5.bomLinked],
                  ['Material Lots Required', step5.materialLotsRequired],
                  ['Serialized Material', step5.serializedMaterial],
                  ['ICN Scan Required', step5.icnScanRequired],
                  ['Expiration Blocking', step5.expirationBlocking],
                  ['Out-Time Tracking', step5.outTimeTracking],
                  ['Customer Supplied Material', step5.customerSuppliedMaterial],
                  ['Certs Required', step5.certsRequired],
                  ['Material Spend Cap', step5.materialSpendCap],
                  ['Outside Processing Cap', step5.outsideProcessingCap],
                  ['Material Overrun Rule', step5.materialOverrunRule],
                  ['Outside Processing Rule', step5.outsideProcessingRule],
                ]}
              />
              {step5.notes && <p className="rounded border bg-white p-3 text-sm">{step5.notes}</p>}
            </Section>

            <Section title="Routing, Traveler, And Quality" icon={<Route className="h-4 w-4 text-blue-600" />}>
              <FieldGrid
                rows={[
                  ['Routing Required', step6.routingRequired],
                  ['Traveler Required', step6.travelerRequired],
                  ['Work Instruction Required', step6.workInstructionRequired],
                  ['Spec Sheet Required', step6.specSheetRequired],
                  ['In-Process Inspection', step6.inProcessInspectionRequired],
                  ['Final QC Only', step6.finalQCOnly],
                  ['Inspection Level', step7.inspectionLevel],
                  ['FAI Required', step7.faiRequired],
                  ['Final QC', step7.finalQC],
                  ['Customer Source Inspection', step7.customerSourceInspection],
                  ['Cert Package Required', step7.certPackageRequired],
                  ['Dimensional Report Required', step7.dimensionalReportRequired],
                ]}
              />
              {(step6.spotCheckPlan || step7.ncrProcess) && (
                <div className="grid gap-3 md:grid-cols-2">
                  <p className="rounded border bg-white p-3 text-sm">Spot check: {valueText(step6.spotCheckPlan)}</p>
                  <p className="rounded border bg-white p-3 text-sm">NCR process: {valueText(step7.ncrProcess)}</p>
                </div>
              )}
            </Section>

            <Section title="Schedule" icon={<Calendar className="h-4 w-4 text-blue-600" />}>
              <FieldGrid
                rows={[
                  ['Authorized Start', step8.authorizedStartDate],
                  ['Required Completion', step8.requiredCompletionDate],
                  ['Priority', step8.priority],
                  ['Daily Target Qty', step8.dailyTargetQty],
                  ['Capacity Risk', step8.capacityRisk],
                  ['Bottleneck Department', step8.bottleneckDepartment],
                ]}
              />
            </Section>

            <Section title="Risks And Flowdowns" icon={<AlertTriangle className="h-4 w-4 text-blue-600" />}>
              <FieldGrid
                rows={[
                  ['ITAR Flag', wizardData.step9?.itarFlag],
                  ['Customer Flowdowns', wizardData.step9?.customerFlowDowns],
                  ['Special Process Controls', wizardData.step9?.specialProcessControls],
                ]}
              />
              <DataTable
                emptyText="No risk entries entered."
                headers={['Type', 'Description', 'Owner', 'Mitigation', 'Due', 'Status']}
                rows={risks.map((row) => [row.type, row.description, row.owner, row.mitigation, row.dueDate, row.approvalStatus])}
              />
            </Section>

            <Section title="Documents" icon={<FolderOpen className="h-4 w-4 text-blue-600" />}>
              <DataTable
                emptyText="No document checklist entered."
                headers={['Document', 'Status', 'Notes']}
                rows={documents.map((row) => [row.name, row.status, row.notes])}
              />
            </Section>

            <Section title="Approval Signatures" icon={<ShieldCheck className="h-4 w-4 text-blue-600" />}>
              <div className="grid gap-3 md:grid-cols-5">
                {REQUIRED_APPROVAL_ROLES.map((requiredRole) => {
                  const approval = approvals.find((a) => a.role === requiredRole.key);
                  const approved = approval?.decision === 'APPROVED';
                  const rejected = approval?.decision === 'REJECTED';
                  return (
                    <div key={requiredRole.key} className="rounded border bg-white p-3 text-sm">
                      <div className="flex items-center gap-1 font-medium">
                        {approved ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : rejected ? <XCircle className="h-4 w-4 text-red-600" /> : <PenLine className="h-4 w-4 text-muted-foreground" />}
                        {requiredRole.label}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {approval ? (
                          <>
                            <div className={approved ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>{approval.decision}</div>
                            <div>{approval.displayName}</div>
                            <div>{dateText(approval.signedAt ?? approval.timestamp)}</div>
                            {approval.signature && <div>Signed: {approval.signature}</div>}
                            {approval.comments && <div className="mt-1 italic">"{approval.comments}"</div>}
                          </>
                        ) : (
                          'Pending'
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Separator className="no-print" />

            <section className="no-print space-y-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <PenLine className="h-4 w-4 text-blue-600" />
                  Approve Or Deny From Summary
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review the PDF-style summary above, add notes, and type your signature to record the decision.
                </p>
              </div>
              {selectedApproval && (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>
                    {roleLabel(role)} already recorded {selectedApproval.decision} by {selectedApproval.displayName} on {dateText(selectedApproval.signedAt ?? selectedApproval.timestamp)}.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-3 rounded-md border bg-white p-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Approval role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger data-testid="select-wad-summary-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REQUIRED_APPROVAL_ROLES.map((requiredRole) => (
                        <SelectItem key={requiredRole.key} value={requiredRole.key}>
                          {requiredRole.label}{approvedRoles.has(requiredRole.key) ? ' - approved' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Decision</Label>
                  <Select value={decision} onValueChange={(value) => setDecision(value as Decision)}>
                    <SelectTrigger data-testid="select-wad-summary-decision">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="APPROVED">Approve</SelectItem>
                      <SelectItem value="REJECTED">Deny</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={comments}
                    onChange={(event) => setComments(event.target.value)}
                    placeholder={decision === 'REJECTED' ? 'Required for denial' : 'Optional approval notes'}
                    data-testid="textarea-wad-summary-notes"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Typed signature</Label>
                  <Input
                    value={signature}
                    onChange={(event) => setSignature(event.target.value)}
                    placeholder="Type your full name to sign"
                    data-testid="input-wad-summary-signature"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your authenticated account, typed signature, decision, notes, and timestamp are recorded with this WAD.
                  </p>
                </div>
                <div className="flex justify-end gap-2 md:col-span-2">
                  <Button
                    onClick={() => decideMutation.mutate()}
                    disabled={!canSubmit || decideMutation.isPending}
                    className={decision === 'REJECTED' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'}
                    data-testid="button-wad-summary-submit-decision"
                  >
                    {decideMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
                    Sign And {decision === 'APPROVED' ? 'Approve' : 'Deny'}
                  </Button>
                </div>
              </div>
            </section>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  emptyText,
}: {
  headers: string[];
  rows: unknown[][];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <div className="rounded border border-dashed bg-white p-4 text-sm text-muted-foreground">{emptyText}</div>;
  }

  return (
    <div className="overflow-x-auto rounded border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex} className="align-top text-sm">
                  {valueText(cell)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
