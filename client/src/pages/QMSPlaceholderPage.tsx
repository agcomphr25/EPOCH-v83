import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, FileCheck, ShieldCheck } from 'lucide-react';

const qmsSections: Record<string, { title: string; summary: string; focus: string[] }> = {
  'change-control': {
    title: 'Change Control',
    summary: 'Controlled intake, review, approval, implementation, and verification for process and product changes.',
    focus: ['Change request intake', 'Impact review', 'Approval routing', 'Implementation evidence'],
  },
  cars: {
    title: 'CARs (Corrective Action Reports)',
    summary: 'Corrective action workflow for root cause analysis, containment, corrective action, and effectiveness checks.',
    focus: ['Issue statement', 'Root cause', 'Corrective action plan', 'Effectiveness review'],
  },
  'ncr-central-record': {
    title: 'NCR (Nonconformance) Central Record',
    summary: 'Central QMS register for nonconformance records, dispositions, related RMAs, and closure evidence.',
    focus: ['NCR register', 'Disposition history', 'RMA linkage', 'Closure records'],
  },
  'nsia-registrar': {
    title: 'NSIA Registrar',
    summary: 'Registrar placeholder for NSIA records, status tracking, supporting evidence, and audit readiness.',
    focus: ['Registration records', 'Renewal dates', 'Evidence links', 'Responsible owner'],
  },
  'design-control': {
    title: 'Design Control',
    summary: 'Design history and approval controls for requirements, reviews, verification, validation, and release.',
    focus: ['Design inputs', 'Review gates', 'Verification and validation', 'Release approval'],
  },
  'parts-equipment': {
    title: 'Parts and Equipment',
    summary: 'Quality-facing register for controlled parts, equipment records, calibration references, and lifecycle status.',
    focus: ['Controlled part list', 'Equipment records', 'Calibration status', 'Lifecycle history'],
  },
};

type QMSPlaceholderPageProps = {
  params?: {
    section?: string;
  };
};

export default function QMSPlaceholderPage({ params }: QMSPlaceholderPageProps) {
  const section = qmsSections[params?.section ?? ''] ?? {
    title: 'QMS',
    summary: 'Quality Management System workspace for controlled records and quality workflows.',
    focus: ['Change Control', 'CARs', 'NCR Central Record', 'NSIA Registrar', 'Design Control', 'Parts and Equipment'],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Badge variant="outline" className="w-fit">QMS Placeholder</Badge>
        <h1 className="text-3xl font-bold tracking-normal">{section.title}</h1>
        <p className="max-w-3xl text-muted-foreground">{section.summary}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-5 w-5 text-primary" />
              Record Intake
            </CardTitle>
            <CardDescription>Capture the core record and owner.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Intake forms, numbering rules, and required fields will be added here.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Review Controls
            </CardTitle>
            <CardDescription>Route records through quality review.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Assigned reviewers, approval steps, and escalation rules will be wired into this area.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck className="h-5 w-5 text-primary" />
              Evidence
            </CardTitle>
            <CardDescription>Attach proof and closure records.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Document links, audit evidence, and closure packages will live with each record.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Planned Focus</CardTitle>
          <CardDescription>Initial placeholders for the QMS module surface.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {section.focus.map((item) => (
              <div key={item} className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
                {item}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
