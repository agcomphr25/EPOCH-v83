import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  Download,
  ExternalLink,
  FileInput,
  History,
  Lock,
  PackageCheck,
  Plus,
  Printer,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

type QmsTab = {
  key: string;
  sheetName: string;
  label: string;
  assetType: string;
  count?: number;
};

type CalibrationAsset = {
  id: string;
  assetTag: string;
  name: string;
  assetType: string;
  serialNumber?: string | null;
  location?: string | null;
  ownerDepartment?: string | null;
  status: 'active' | 'due_soon' | 'expired' | 'locked_out' | 'retired';
  lastCalibrationDate?: string | null;
  calibrationDueDate?: string | null;
  evidenceUrl?: string | null;
  lockoutReason?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CalibrationEvent = {
  id: string;
  assetId: string;
  eventType: string;
  eventDate: string;
  result: 'pass' | 'fail' | 'limited_use';
  performedBy?: string | null;
  vendorName?: string | null;
  certificateNumber?: string | null;
  nextDueDate?: string | null;
  notes?: string | null;
  createdAt: string;
};

type Summary = {
  tabs: QmsTab[];
  assets: CalibrationAsset[];
  events: CalibrationEvent[];
  upcoming: CalibrationAsset[];
  overdue: CalibrationAsset[];
  cleanup?: {
    missingEvidence: CalibrationAsset[];
    needsReview: CalibrationAsset[];
    multiSourceAssets: CalibrationAsset[];
  };
  stats: {
    totalAssets: number;
    dueSoon: number;
    overdue: number;
    lockedOut: number;
    missingEvidence?: number;
    needsReview?: number;
    multiSourceRecords?: number;
  };
};

const fallbackTabs: QmsTab[] = [
  { key: 'equipment', sheetName: 'Equipment TAB 1', label: 'Equipment', assetType: 'equipment' },
  { key: 'measuring-devices', sheetName: 'Measuring Device List', label: 'Measuring Devices', assetType: 'measuring_device' },
  { key: 'as9100-calibration', sheetName: 'AS9100 Calibration TAB 2', label: 'AS9100 Calibration', assetType: 'calibration_gage' },
  { key: 'as9100-validation', sheetName: 'AS9100 Validation TAB 3', label: 'AS9100 Validation', assetType: 'validation_asset' },
  { key: 'customer-property', sheetName: 'Customer Property TAB 4', label: 'Customer Property', assetType: 'customer_property' },
  { key: 'serialized-items', sheetName: 'Serialized Items TAB 5', label: 'Serialized Items', assetType: 'serialized_item' },
  { key: 'returned-items', sheetName: 'Returned Items TAB 6', label: 'Returned Items', assetType: 'returned_item' },
  { key: 'calibration-archive', sheetName: 'Calibration Register (ARCHIVE)', label: 'Calibration Archive', assetType: 'calibration_archive' },
];

const unifiedTab: QmsTab = {
  key: 'all',
  sheetName: 'Unified Register',
  label: 'Unified Register',
  assetType: 'all',
};

const statusClasses: Record<CalibrationAsset['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  due_soon: 'bg-amber-50 text-amber-700 border-amber-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
  locked_out: 'bg-red-100 text-red-800 border-red-300',
  retired: 'bg-gray-100 text-gray-700 border-gray-200',
};

function dateOnly(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function readWorkbookTabs(file: File, allowedTabs: QmsTab[]) {
  return new Promise<Array<{ sheetName: string; rows: Record<string, unknown>[] }>>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read workbook'));
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: 'array', cellDates: true });
        const tabs = allowedTabs
          .filter((tab) => workbook.SheetNames.includes(tab.sheetName))
          .map((tab) => ({
            sheetName: tab.sheetName,
            rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[tab.sheetName], {
              defval: null,
              raw: false,
            }),
          }));
        resolve(tabs);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Unable to parse workbook'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function assetsForTab(assets: CalibrationAsset[], tab: QmsTab) {
  if (tab.key === 'all') return assets;
  return assets.filter((asset) => asset.assetType === tab.assetType || asset.metadata?.qmsSheetName === tab.sheetName);
}

function metadataList<T = Record<string, unknown>>(asset: CalibrationAsset | undefined, key: string): T[] {
  const value = asset?.metadata?.[key];
  return Array.isArray(value) ? value as T[] : [];
}

function sourceCount(asset: CalibrationAsset) {
  return Array.isArray(asset.metadata?.qmsSourceTabs)
    ? asset.metadata.qmsSourceTabs.length
    : asset.metadata?.qmsSheetName
      ? 1
      : 0;
}

export default function QMSPartsEquipmentPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState(unifiedTab.key);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [newAsset, setNewAsset] = useState({
    assetTag: '',
    name: '',
    serialNumber: '',
    location: '',
    ownerDepartment: '',
    calibrationDueDate: '',
    notes: '',
  });
  const [audit, setAudit] = useState({
    assetId: '',
    eventDate: new Date().toISOString().slice(0, 10),
    result: 'pass',
    performedBy: '',
    certificateNumber: '',
    nextDueDate: '',
    checklist: {
      identityVerified: false,
      conditionChecked: false,
      standardRecorded: false,
      evidenceAttached: false,
    },
    notes: '',
  });
  const [evidence, setEvidence] = useState({
    label: '',
    evidenceUrl: '',
    attachedBy: '',
    notes: '',
  });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [review, setReview] = useState({
    action: 'approve',
    reviewedBy: '',
    reason: '',
    nextDueDate: '',
    evidenceUrl: '',
  });

  const { data: summary, isLoading } = useQuery<Summary>({
    queryKey: ['/api/quality/qms/parts-equipment/summary'],
  });

  const assets = summary?.assets ?? [];
  const sourceTabs = summary?.tabs?.length ? summary.tabs : fallbackTabs;
  const tabs = [{ ...unifiedTab, count: assets.length }, ...sourceTabs];

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && tabs.some((item) => item.key === tab)) {
      setSelectedTab(tab);
    }
  }, [tabs]);

  const activeTab = tabs.find((tab) => tab.key === selectedTab) ?? tabs[0];
  const createTab = activeTab.key === 'all' ? sourceTabs[0] : activeTab;
  const visibleAssets = useMemo(() => assetsForTab(assets, activeTab), [assets, activeTab]);
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? visibleAssets[0];
  const selectedEvidence = metadataList<{
    id?: string;
    label?: string;
    evidenceUrl?: string;
    attachedBy?: string;
    attachedAt?: string;
    notes?: string;
    originalFileName?: string;
    fileSizeBytes?: number;
  }>(selectedAsset, 'evidenceItems');
  const selectedReviews = metadataList<{ id?: string; action?: string; reviewedBy?: string; reviewedAt?: string; reason?: string; status?: string }>(selectedAsset, 'reviewActions');
  const auditAssetOptions = useMemo(
    () => assets.filter((asset) => ['measuring_device', 'calibration_gage', 'validation_asset', 'calibration_archive'].includes(asset.assetType)),
    [assets]
  );

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const workbookTabs = await readWorkbookTabs(file, tabs);
      if (workbookTabs.length === 0) throw new Error('No matching QMS tabs were found in this workbook.');
      return apiRequest('/api/quality/qms/parts-equipment/import', {
        method: 'POST',
        body: { sourceName: file.name, tabs: workbookTabs },
      });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/qms/parts-equipment/summary'] });
      toast({
        title: 'Import complete',
        description: `${result.created} created, ${result.updated} updated, ${result.eventsCreated} audit events added.`,
      });
    },
    onError: (error: any) => {
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
    },
  });

  const createAssetMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/quality/calibration/assets', {
        method: 'POST',
        body: {
          assetTag: newAsset.assetTag,
          name: newAsset.name,
          assetType: createTab.assetType,
          serialNumber: newAsset.serialNumber || newAsset.assetTag,
          location: newAsset.location || null,
          ownerDepartment: newAsset.ownerDepartment || null,
          calibrationDueDate: newAsset.calibrationDueDate || null,
          status: 'active',
          metadata: {
            qmsSheetName: createTab.sheetName,
            qmsTabKey: createTab.key,
            qmsSourceTabs: [createTab.sheetName],
            manualEntry: true,
            notes: newAsset.notes,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/qms/parts-equipment/summary'] });
      setNewAsset({ assetTag: '', name: '', serialNumber: '', location: '', ownerDepartment: '', calibrationDueDate: '', notes: '' });
      toast({ title: `${createTab.label} item created` });
    },
    onError: (error: any) => toast({ title: 'Create failed', description: error.message, variant: 'destructive' }),
  });

  const auditMutation = useMutation({
    mutationFn: () => {
      const checklist = Object.entries(audit.checklist)
        .map(([key, checked]) => `${key}: ${checked ? 'yes' : 'no'}`)
        .join('; ');
      return apiRequest(`/api/quality/calibration/assets/${audit.assetId}/events`, {
        method: 'POST',
        body: {
          eventType: 'calibration_audit',
          eventDate: audit.eventDate,
          result: audit.result,
          performedBy: audit.performedBy || null,
          certificateNumber: audit.certificateNumber || null,
          nextDueDate: audit.nextDueDate || null,
          notes: `${audit.notes}\nChecklist: ${checklist}`.trim(),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/qms/parts-equipment/summary'] });
      toast({ title: 'Calibration audit recorded' });
    },
    onError: (error: any) => toast({ title: 'Audit failed', description: error.message, variant: 'destructive' }),
  });

  const evidenceMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/quality/qms/parts-equipment/assets/${selectedAsset?.id}/evidence`, {
        method: 'POST',
        body: evidence,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/qms/parts-equipment/summary'] });
      setEvidence({ label: '', evidenceUrl: '', attachedBy: '', notes: '' });
      toast({ title: 'Evidence attached' });
    },
    onError: (error: any) => toast({ title: 'Evidence failed', description: error.message, variant: 'destructive' }),
  });

  const evidenceUploadMutation = useMutation({
    mutationFn: () => {
      if (!evidenceFile) throw new Error('Select an evidence file first.');
      const formData = new FormData();
      formData.append('file', evidenceFile);
      formData.append('label', evidence.label || evidenceFile.name);
      formData.append('attachedBy', evidence.attachedBy);
      formData.append('notes', evidence.notes);
      return apiRequest(`/api/quality/qms/parts-equipment/assets/${selectedAsset?.id}/evidence/upload`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/qms/parts-equipment/summary'] });
      setEvidence({ label: '', evidenceUrl: '', attachedBy: '', notes: '' });
      setEvidenceFile(null);
      toast({ title: 'Evidence file uploaded' });
    },
    onError: (error: any) => toast({ title: 'Upload failed', description: error.message, variant: 'destructive' }),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/quality/qms/parts-equipment/assets/${selectedAsset?.id}/review`, {
        method: 'POST',
        body: review,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/qms/parts-equipment/summary'] });
      setReview({ action: 'approve', reviewedBy: '', reason: '', nextDueDate: '', evidenceUrl: '' });
      toast({ title: 'Review action recorded' });
    },
    onError: (error: any) => toast({ title: 'Review failed', description: error.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <style>{`
        .qms-print-packet { display: none; }
        @media print {
          .qms-screen-only { display: none !important; }
          .qms-print-packet { display: block !important; color: #111827; }
          .qms-print-packet table { width: 100%; border-collapse: collapse; }
          .qms-print-packet th, .qms-print-packet td { border: 1px solid #d1d5db; padding: 6px; text-align: left; }
        }
      `}</style>
      <div className="qms-print-packet space-y-4">
        <h1 className="text-2xl font-bold">QMS Calibration Audit Packet</h1>
        {selectedAsset ? (
          <>
            <table>
              <tbody>
                <tr><th>Asset tag</th><td>{selectedAsset.assetTag}</td></tr>
                <tr><th>Name</th><td>{selectedAsset.name}</td></tr>
                <tr><th>Location</th><td>{selectedAsset.location || selectedAsset.ownerDepartment || '-'}</td></tr>
                <tr><th>Status</th><td>{selectedAsset.status.replace('_', ' ')}</td></tr>
                <tr><th>Calibration due</th><td>{dateOnly(selectedAsset.calibrationDueDate) || '-'}</td></tr>
                <tr><th>Evidence</th><td>{selectedAsset.evidenceUrl || '-'}</td></tr>
              </tbody>
            </table>
            <h2 className="text-lg font-semibold">Checklist</h2>
            <table>
              <tbody>
                {Object.entries(audit.checklist).map(([key, checked]) => (
                  <tr key={key}><td>{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</td><td>{checked ? 'Yes' : 'No'}</td></tr>
                ))}
              </tbody>
            </table>
            <h2 className="text-lg font-semibold">Latest notes</h2>
            <p>{audit.notes || review.reason || '-'}</p>
          </>
        ) : (
          <p>No QMS asset selected.</p>
        )}
      </div>

      <div className="qms-screen-only flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Badge variant="outline" className="w-fit">QMS</Badge>
          <h1 className="text-3xl font-bold tracking-normal">Parts and Equipment</h1>
          <p className="max-w-3xl text-muted-foreground">
            Controlled register for equipment, measuring devices, AS9100 calibration and validation records, customer property, serialized items, returns, and archive calibration history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print Audit
          </Button>
          <Label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
            <Upload className="mr-2 h-4 w-4" />
            Import Workbook
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setImportFileName(file.name);
                importMutation.mutate(file);
                event.currentTarget.value = '';
              }}
            />
          </Label>
        </div>
      </div>

      {importFileName && (
        <Alert>
          <FileInput className="h-4 w-4" />
          <AlertTitle>Last import source</AlertTitle>
          <AlertDescription>{importFileName}</AlertDescription>
        </Alert>
      )}

      <div className="qms-screen-only grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total controlled items</CardDescription>
            <CardTitle className="text-2xl">{summary?.stats.totalAssets ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Due within 30 days</CardDescription>
            <CardTitle className="text-2xl text-amber-700">{summary?.stats.dueSoon ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expired calibration</CardDescription>
            <CardTitle className="text-2xl text-red-700">{summary?.stats.overdue ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Locked out</CardDescription>
            <CardTitle className="text-2xl text-red-800">{summary?.stats.lockedOut ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Missing evidence</CardDescription>
            <CardTitle className="text-2xl text-amber-700">{summary?.stats.missingEvidence ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Needs review</CardDescription>
            <CardTitle className="text-2xl text-red-700">{summary?.stats.needsReview ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Multi-source</CardDescription>
            <CardTitle className="text-2xl">{summary?.stats.multiSourceRecords ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="qms-screen-only">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5" />
            Register Cleanup Queue
          </CardTitle>
          <CardDescription>Focused review lists for evidence gaps, lockouts, expired calibrations, and records that were merged from more than one spreadsheet tab.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          {[
            { title: 'Evidence Gaps', items: summary?.cleanup?.missingEvidence ?? [] },
            { title: 'Review Required', items: summary?.cleanup?.needsReview ?? [] },
            { title: 'Merged Sources', items: summary?.cleanup?.multiSourceAssets ?? [] },
          ].map((group) => (
            <div key={group.title} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium">{group.title}</p>
                <Badge variant="secondary">{group.items.length}</Badge>
              </div>
              <div className="space-y-2">
                {group.items.slice(0, 5).map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      setAudit((prev) => ({ ...prev, assetId: asset.id }));
                    }}
                  >
                    <span className="block font-medium">{asset.assetTag} - {asset.name}</span>
                    <span className="block text-muted-foreground">
                      {asset.location || asset.ownerDepartment || 'No location'} - {dateOnly(asset.calibrationDueDate) || 'no due date'}
                    </span>
                  </button>
                ))}
                {group.items.length === 0 && <p className="text-sm text-muted-foreground">Nothing needs attention here.</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs
        className="qms-screen-only"
        value={selectedTab}
        onValueChange={(value) => {
          setSelectedTab(value);
          window.history.replaceState(null, '', `/qms/parts-equipment?tab=${encodeURIComponent(value)}`);
        }}
      >
        <TabsList className="flex h-auto flex-wrap justify-start">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="gap-2">
              <PackageCheck className="h-4 w-4" />
              {tab.label}
              <Badge variant="secondary">{tab.count ?? assetsForTab(assets, tab).length}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ClipboardList className="h-5 w-5" />
                    {tab.label}
                  </CardTitle>
                  <CardDescription>
                    {tab.key === 'all' ? 'Deduped view across every imported spreadsheet tab.' : tab.sheetName}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tag</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Sources</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoading ? (
                          <TableRow><TableCell colSpan={7}>Loading QMS records...</TableCell></TableRow>
                        ) : assetsForTab(assets, tab).length === 0 ? (
                          <TableRow><TableCell colSpan={7}>No records in this tab yet.</TableCell></TableRow>
                        ) : (
                          assetsForTab(assets, tab).slice(0, 80).map((asset) => (
                            <TableRow key={asset.id}>
                              <TableCell className="font-medium">{asset.assetTag}</TableCell>
                              <TableCell>{asset.name}</TableCell>
                              <TableCell>{asset.location || asset.ownerDepartment || '-'}</TableCell>
                              <TableCell>
                                {sourceCount(asset) || '-'}
                              </TableCell>
                              <TableCell>{dateOnly(asset.calibrationDueDate) || '-'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={statusClasses[asset.status] ?? ''}>
                                  {asset.status.replace('_', ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedAssetId(asset.id);
                                    setAudit((prev) => ({ ...prev, assetId: asset.id }));
                                  }}
                                >
                                  Manage
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Plus className="h-5 w-5" />
                    New {createTab.label} Component
                  </CardTitle>
                  <CardDescription>{createTab.sheetName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label>Asset tag or serial</Label>
                    <Input value={newAsset.assetTag} onChange={(e) => setNewAsset((prev) => ({ ...prev, assetTag: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Name or description</Label>
                    <Input value={newAsset.name} onChange={(e) => setNewAsset((prev) => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Input value={newAsset.location} onChange={(e) => setNewAsset((prev) => ({ ...prev, location: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Owner or department</Label>
                      <Input value={newAsset.ownerDepartment} onChange={(e) => setNewAsset((prev) => ({ ...prev, ownerDepartment: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Next calibration or validation due</Label>
                    <Input type="date" value={newAsset.calibrationDueDate} onChange={(e) => setNewAsset((prev) => ({ ...prev, calibrationDueDate: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={newAsset.notes} onChange={(e) => setNewAsset((prev) => ({ ...prev, notes: e.target.value }))} />
                  </div>
                  <Button
                    className="w-full"
                    disabled={!newAsset.assetTag || !newAsset.name || createAssetMutation.isPending}
                    onClick={() => createAssetMutation.mutate()}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create {createTab.label} Item
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="qms-screen-only grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PackageCheck className="h-5 w-5" />
              Selected Record
            </CardTitle>
            <CardDescription>Review the item before attaching evidence or changing status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedAsset ? (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Asset</p>
                  <p className="font-medium">{selectedAsset.assetTag} - {selectedAsset.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant="outline" className={statusClasses[selectedAsset.status] ?? ''}>{selectedAsset.status.replace('_', ' ')}</Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Due</p>
                    <p>{dateOnly(selectedAsset.calibrationDueDate) || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sources</p>
                    <p>{sourceCount(selectedAsset) || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Evidence</p>
                    <p>{selectedEvidence.length}</p>
                  </div>
                </div>
                {selectedAsset.lockoutReason && (
                  <Alert variant="destructive">
                    <Lock className="h-4 w-4" />
                    <AlertTitle>Lockout reason</AlertTitle>
                    <AlertDescription>{selectedAsset.lockoutReason}</AlertDescription>
                  </Alert>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a record from the register to manage it.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ExternalLink className="h-5 w-5" />
              Evidence Attachments
            </CardTitle>
            <CardDescription>Attach certificate, report, or storage reference evidence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Label</Label>
                <Input value={evidence.label} onChange={(e) => setEvidence((prev) => ({ ...prev, label: e.target.value }))} placeholder="Calibration cert" />
              </div>
              <div className="space-y-2">
                <Label>Attached by</Label>
                <Input value={evidence.attachedBy} onChange={(e) => setEvidence((prev) => ({ ...prev, attachedBy: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Upload certificate or report</Label>
              <Label className="flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted">
                <span className="truncate">{evidenceFile?.name ?? 'Select PDF, image, Excel, Word, or CSV file'}</span>
                <Upload className="ml-2 h-4 w-4 shrink-0" />
                <Input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xls,.xlsx,.docx"
                  className="hidden"
                  onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                />
              </Label>
            </div>
            <div className="space-y-2">
              <Label>URL or storage reference</Label>
              <Input value={evidence.evidenceUrl} onChange={(e) => setEvidence((prev) => ({ ...prev, evidenceUrl: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Evidence notes</Label>
              <Textarea value={evidence.notes} onChange={(e) => setEvidence((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                disabled={!selectedAsset || !evidenceFile || evidenceUploadMutation.isPending}
                onClick={() => evidenceUploadMutation.mutate()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </Button>
              <Button
                disabled={!selectedAsset || !evidence.evidenceUrl || evidenceMutation.isPending}
                onClick={() => evidenceMutation.mutate()}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Attach Link
              </Button>
            </div>
            <div className="space-y-2">
              {selectedEvidence.slice(-3).map((item, index) => (
                <div key={item.id ?? index} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{item.label || item.originalFileName || 'Evidence'}</p>
                      <p className="break-all text-muted-foreground">{item.originalFileName || item.evidenceUrl}</p>
                    </div>
                    {item.evidenceUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(item.evidenceUrl, '_blank', 'noopener,noreferrer')}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" />
              Review and Lockout
            </CardTitle>
            <CardDescription>Approve, limit, lock out, or retire the selected item.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={review.action} onValueChange={(value) => setReview((prev) => ({ ...prev, action: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">Approve / release</SelectItem>
                  <SelectItem value="limited_use">Limited use</SelectItem>
                  <SelectItem value="lock_out">Lock out</SelectItem>
                  <SelectItem value="retire">Retire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Reviewed by</Label>
                <Input value={review.reviewedBy} onChange={(e) => setReview((prev) => ({ ...prev, reviewedBy: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Next due</Label>
                <Input type="date" value={review.nextDueDate} onChange={(e) => setReview((prev) => ({ ...prev, nextDueDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Evidence reference</Label>
              <Input value={review.evidenceUrl} onChange={(e) => setReview((prev) => ({ ...prev, evidenceUrl: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={review.reason} onChange={(e) => setReview((prev) => ({ ...prev, reason: e.target.value }))} />
            </div>
            <Button
              className="w-full"
              disabled={!selectedAsset || !review.reviewedBy || reviewMutation.isPending}
              onClick={() => reviewMutation.mutate()}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Record Review
            </Button>
            <div className="space-y-2">
              {selectedReviews.slice(-3).map((item, index) => (
                <div key={item.id ?? index} className="rounded-md border px-3 py-2 text-sm">
                  <p className="font-medium">{(item.action || 'review').replace('_', ' ')}</p>
                  <p className="text-muted-foreground">{item.reviewedBy || 'Unknown'} - {dateOnly(item.reviewedAt) || '-'}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="qms-screen-only grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="h-5 w-5 text-amber-600" />
              Upcoming Calibration Reminders
            </CardTitle>
            <CardDescription>Items due in the next 30 days and items already overdue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...(summary?.overdue ?? []), ...(summary?.upcoming ?? [])].slice(0, 12).map((asset) => (
              <div key={asset.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="font-medium">{asset.assetTag} - {asset.name}</p>
                  <p className="text-sm text-muted-foreground">{asset.location || asset.ownerDepartment || 'No location'} - due {dateOnly(asset.calibrationDueDate) || 'not set'}</p>
                </div>
                <Badge variant="outline" className={statusClasses[asset.status] ?? ''}>{asset.status.replace('_', ' ')}</Badge>
              </div>
            ))}
            {(summary?.overdue.length ?? 0) + (summary?.upcoming.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No calibration reminders due in the next 30 days.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckSquare className="h-5 w-5 text-primary" />
              Calibration Schedule Checklist
            </CardTitle>
            <CardDescription>Fill out the audit, print it, or save it to the calibration audit trail.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Asset</Label>
              <Select
                value={audit.assetId}
                onValueChange={(value) => {
                  setSelectedAssetId(value);
                  setAudit((prev) => ({ ...prev, assetId: value }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select calibrated item" /></SelectTrigger>
                <SelectContent>
                  {auditAssetOptions.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>{asset.assetTag} - {asset.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Audit date</Label>
                <Input type="date" value={audit.eventDate} onChange={(e) => setAudit((prev) => ({ ...prev, eventDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Result</Label>
                <Select value={audit.result} onValueChange={(value) => setAudit((prev) => ({ ...prev, result: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="limited_use">Limited use</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Next due</Label>
                <Input type="date" value={audit.nextDueDate} onChange={(e) => setAudit((prev) => ({ ...prev, nextDueDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(audit.checklist).map(([key, checked]) => (
                <Label key={key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => setAudit((prev) => ({ ...prev, checklist: { ...prev.checklist, [key]: Boolean(value) } }))}
                  />
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </Label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Performed by</Label>
                <Input value={audit.performedBy} onChange={(e) => setAudit((prev) => ({ ...prev, performedBy: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Certificate or report</Label>
                <Input value={audit.certificateNumber} onChange={(e) => setAudit((prev) => ({ ...prev, certificateNumber: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Audit notes</Label>
              <Textarea value={audit.notes} onChange={(e) => setAudit((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!audit.assetId || auditMutation.isPending} onClick={() => auditMutation.mutate()}>
                <CheckSquare className="mr-2 h-4 w-4" />
                Save Audit
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print Checklist
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="qms-screen-only">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" />
            Calibration Audit Trail
          </CardTitle>
          <CardDescription>Most recent calibration, validation, import, and checklist events.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Performed by</TableHead>
                  <TableHead>Next due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.events ?? []).slice(0, 80).map((event) => {
                  const asset = assets.find((item) => item.id === event.assetId);
                  return (
                    <TableRow key={event.id}>
                      <TableCell>{dateOnly(event.eventDate)}</TableCell>
                      <TableCell>{asset ? `${asset.assetTag} - ${asset.name}` : event.assetId}</TableCell>
                      <TableCell>{event.eventType.replaceAll('_', ' ')}</TableCell>
                      <TableCell>
                        <Badge variant={event.result === 'pass' ? 'secondary' : 'destructive'}>{event.result.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell>{event.performedBy || '-'}</TableCell>
                      <TableCell>{dateOnly(event.nextDueDate) || '-'}</TableCell>
                    </TableRow>
                  );
                })}
                {(summary?.events.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={6}>No calibration events recorded yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {(summary?.stats.overdue ?? 0) > 0 && (
        <Alert variant="destructive" className="qms-screen-only">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Expired calibration exists</AlertTitle>
          <AlertDescription>Review overdue items before releasing equipment for production or inspection use.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
