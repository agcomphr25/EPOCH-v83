import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { AlertTriangle, CheckCircle, PauseCircle, Play, RotateCcw, ScanLine, ShieldAlert, User } from 'lucide-react';

type StationPayload = {
  type: 'cnc_operation_batch';
  canViewFullTraveler: boolean;
  employee: { id: number; name: string; employeeCode: string };
  batch: {
    id: number;
    batchCode: string;
    batchQty: number;
    qtyCompleted: number;
    qtyScrapped: number;
    qtyRemaining: number;
    status: string;
    assignedMachineName: string | null;
    notes: string | null;
  };
  workOrder: { id: string; number: string; partNumber: string | null; partName: string | null };
  step: { id: string; travelerId: string; travelerNumber: string; stepNumber: number; department: string };
  operation: {
    opName: string | null;
    opDescription: string | null;
    ncProgramRef: string | null;
    fixture: string | null;
    workRefPoint: string | null;
    rawStockOrientation: string | null;
    datumNotes: string | null;
    warmupNotes: string | null;
    qcPlan: string | null;
  } | null;
  programs: Array<{ id: number; programName: string; programNumber: string | null; version: string | null; notes: string | null }>;
  tools: Array<{ id: number; toolNumber: string; holderPosition: string | null; toolName: string; diameter: number | null; offsetNotes: string | null; replacementNotes: string | null; imageUrl: string | null }>;
  setupPhotos: Array<{ id: number; category: string; url: string; caption: string | null }>;
  inspectionRequirements: Array<{ id: number; name: string; characteristic: string | null; nominal: string | null; tolerance: string | null; method: string | null; frequency: string | null; required: boolean }>;
};

function getErrorMessage(error: unknown): string {
  const err = error as { body?: { error?: string }; message?: string };
  return err?.body?.error ?? err?.message ?? 'Action failed';
}

export default function CNCOperationBatchStation() {
  const { toast } = useToast();
  const badgeRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const params = new URLSearchParams(window.location.search);
  const [employeeBadge, setEmployeeBadge] = useState(params.get('badge') ?? '');
  const [batchBarcode, setBatchBarcode] = useState(params.get('barcode') ?? '');
  const [payload, setPayload] = useState<StationPayload | null>(null);
  const [qtyCompleted, setQtyCompleted] = useState('0');
  const [qtyScrapped, setQtyScrapped] = useState('0');
  const [comments, setComments] = useState('');

  const loadBatch = useMutation<StationPayload, unknown, void>({
    mutationFn: () => apiRequest('/api/cnc/operation-batches/station/scan', {
      method: 'POST',
      body: { employeeBadge, barcode: batchBarcode },
    }),
    onSuccess: (data) => {
      setPayload(data);
      setQtyCompleted(String(data.batch.qtyCompleted));
      setQtyScrapped(String(data.batch.qtyScrapped));
      setComments('');
      toast({ title: 'Batch loaded', description: `${data.batch.batchCode} ready for ${data.employee.name}` });
    },
    onError: (error) => toast({ title: 'Scan blocked', description: getErrorMessage(error), variant: 'destructive' }),
  });

  const action = useMutation<StationPayload, unknown, { action: string }>({
    mutationFn: ({ action: actionName }) => apiRequest(`/api/cnc/operation-batches/station/${payload?.batch.id}/action`, {
      method: 'POST',
      body: {
        employeeBadge,
        action: actionName,
        qtyCompleted: Number(qtyCompleted || 0),
        qtyScrapped: Number(qtyScrapped || 0),
        comments: comments || null,
      },
    }),
    onSuccess: (data) => {
      setPayload(data);
      setQtyCompleted(String(data.batch.qtyCompleted));
      setQtyScrapped(String(data.batch.qtyScrapped));
      setComments('');
      toast({ title: 'Batch updated', description: `${data.batch.batchCode} is ${data.batch.status}` });
    },
    onError: (error) => toast({ title: 'Action blocked', description: getErrorMessage(error), variant: 'destructive' }),
  });

  useEffect(() => {
    if (employeeBadge && batchBarcode) loadBatch.mutate();
    else if (!employeeBadge) badgeRef.current?.focus();
    else barcodeRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primaryProgram = payload?.programs[0];
  const canAct = !!payload && !action.isPending;
  const statusClass = useMemo(() => {
    switch (payload?.batch.status) {
      case 'completed': return 'bg-emerald-100 text-emerald-800';
      case 'in_progress': return 'bg-green-100 text-green-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      case 'hold': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  }, [payload?.batch.status]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!employeeBadge || !batchBarcode) {
      toast({ title: 'Badge and batch barcode required', variant: 'destructive' });
      return;
    }
    loadBatch.mutate();
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="border-b bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-blue-600" />
            <div>
              <h1 className="text-lg font-bold">CNC Batch Station</h1>
              <p className="text-xs text-gray-500">Badge scan plus OPB batch barcode</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setPayload(null); setBatchBarcode(''); setComments(''); barcodeRef.current?.focus(); }}>
            <RotateCcw className="mr-1 h-4 w-4" />Reset Batch
          </Button>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <form onSubmit={handleSubmit} className="grid gap-3 rounded border bg-white p-3 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label className="text-xs">Employee badge</Label>
            <Input ref={badgeRef} value={employeeBadge} onChange={e => setEmployeeBadge(e.target.value)} className="mt-1 h-10 font-mono" placeholder="Scan employee badge" />
          </div>
          <div>
            <Label className="text-xs">Operation batch barcode</Label>
            <Input ref={barcodeRef} value={batchBarcode} onChange={e => setBatchBarcode(e.target.value)} className="mt-1 h-10 font-mono" placeholder="OPB-10045-20-001" />
          </div>
          <Button className="mt-5 h-10" disabled={loadBatch.isPending}>
            {loadBatch.isPending ? 'Loading...' : 'Load Batch'}
          </Button>
        </form>

        {!payload ? (
          <div className="rounded border border-dashed bg-white p-8 text-center text-gray-500">
            <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            Scan an employee badge and an OPB batch barcode to load the CNC batch.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-4">
              <div className="rounded border bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xl font-bold text-blue-700">{payload.batch.batchCode}</p>
                    <p className="text-sm text-gray-600">{payload.workOrder.number} | {payload.workOrder.partNumber ?? 'No part'} | {payload.workOrder.partName ?? 'No part name'}</p>
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${statusClass}`}>{payload.batch.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div className="rounded bg-gray-50 p-2"><p className="text-xs text-gray-500">Step</p><p className="font-semibold">{payload.step.stepNumber} {payload.step.department}</p></div>
                  <div className="rounded bg-gray-50 p-2"><p className="text-xs text-gray-500">Batch qty</p><p className="font-semibold">{payload.batch.batchQty}</p></div>
                  <div className="rounded bg-gray-50 p-2"><p className="text-xs text-gray-500">Remaining</p><p className="font-semibold">{payload.batch.qtyRemaining}</p></div>
                  <div className="rounded bg-gray-50 p-2"><p className="text-xs text-gray-500">Machine</p><p className="font-semibold">{payload.batch.assignedMachineName ?? 'Unassigned'}</p></div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                  <User className="h-4 w-4" />{payload.employee.name}
                  {payload.canViewFullTraveler && (
                    <Link href={`/travelers/${payload.step.travelerId}/execute?badge=${encodeURIComponent(employeeBadge)}`} className="ml-auto text-xs text-blue-600 underline">
                      Open traveler
                    </Link>
                  )}
                </div>
              </div>

              <div className="rounded border bg-white p-3">
                <h2 className="mb-2 text-sm font-semibold">Program / Fixture</h2>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <div><p className="text-xs text-gray-500">Program</p><p className="font-semibold">{primaryProgram?.programName ?? payload.operation?.ncProgramRef ?? 'Not specified'}</p></div>
                  <div><p className="text-xs text-gray-500">Program revision</p><p className="font-semibold">{primaryProgram?.version ?? 'Not specified'}</p></div>
                  <div><p className="text-xs text-gray-500">Fixture</p><p className="font-semibold">{payload.operation?.fixture ?? 'Not specified'}</p></div>
                  <div><p className="text-xs text-gray-500">Fixture revision</p><p className="font-semibold">{payload.operation?.workRefPoint ?? 'Not specified'}</p></div>
                </div>
                <Separator className="my-3" />
                <div className="space-y-2 text-sm">
                  {payload.operation?.opDescription && <p><span className="font-semibold">Setup:</span> {payload.operation.opDescription}</p>}
                  {payload.operation?.rawStockOrientation && <p><span className="font-semibold">Stock:</span> {payload.operation.rawStockOrientation}</p>}
                  {payload.operation?.datumNotes && <p><span className="font-semibold">Datum:</span> {payload.operation.datumNotes}</p>}
                  {payload.operation?.warmupNotes && <p><span className="font-semibold">Warmup:</span> {payload.operation.warmupNotes}</p>}
                </div>
              </div>

              <div className="rounded border bg-white p-3">
                <h2 className="mb-2 text-sm font-semibold">Batch Actions</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs">Qty completed</Label>
                    <Input type="number" min="0" value={qtyCompleted} onChange={e => setQtyCompleted(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Qty scrapped</Label>
                    <Input type="number" min="0" value={qtyScrapped} onChange={e => setQtyScrapped(e.target.value)} className="mt-1" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Comments</Label>
                    <Textarea value={comments} onChange={e => setComments(e.target.value)} className="mt-1 min-h-[72px]" placeholder="Add production notes, pause reason, or hold problem..." />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button disabled={!canAct} onClick={() => action.mutate({ action: 'start' })}><Play className="mr-1 h-4 w-4" />Start Batch</Button>
                  <Button disabled={!canAct} variant="outline" onClick={() => action.mutate({ action: 'pause' })}><PauseCircle className="mr-1 h-4 w-4" />Pause</Button>
                  <Button disabled={!canAct} variant="outline" onClick={() => action.mutate({ action: 'resume' })}><Play className="mr-1 h-4 w-4" />Resume</Button>
                  <Button disabled={!canAct} variant="outline" onClick={() => action.mutate({ action: 'comment' })}>Add Comments</Button>
                  <Button disabled={!canAct} variant="destructive" onClick={() => action.mutate({ action: 'hold' })}><AlertTriangle className="mr-1 h-4 w-4" />Flag Problem / Hold</Button>
                  <Button disabled={!canAct} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => action.mutate({ action: 'complete' })}><CheckCircle className="mr-1 h-4 w-4" />Complete Batch</Button>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded border bg-white p-3">
                <h2 className="mb-2 text-sm font-semibold">Tool List</h2>
                {payload.tools.length === 0 ? <p className="text-sm text-gray-400">No tools listed</p> : payload.tools.map(tool => (
                  <div key={tool.id} className="border-b py-2 text-sm last:border-0">
                    <p className="font-semibold">{tool.toolNumber} - {tool.toolName}</p>
                    <p className="text-xs text-gray-500">{tool.holderPosition ?? 'No holder'} {tool.diameter ? `| Dia ${tool.diameter}` : ''}</p>
                    {tool.offsetNotes && <p className="text-xs text-gray-600">{tool.offsetNotes}</p>}
                  </div>
                ))}
              </div>

              <div className="rounded border bg-white p-3">
                <h2 className="mb-2 text-sm font-semibold">Inspection Requirements</h2>
                {payload.inspectionRequirements.length === 0 ? <p className="text-sm text-gray-400">No inspection requirements listed</p> : payload.inspectionRequirements.map(item => (
                  <div key={item.id} className="border-b py-2 text-sm last:border-0">
                    <p className="font-semibold">{item.name}{item.required ? ' *' : ''}</p>
                    <p className="text-xs text-gray-500">{item.characteristic ?? 'Characteristic not specified'}</p>
                    <p className="text-xs text-gray-500">{[item.nominal, item.tolerance, item.method, item.frequency].filter(Boolean).join(' | ')}</p>
                  </div>
                ))}
              </div>

              <div className="rounded border bg-white p-3">
                <h2 className="mb-2 text-sm font-semibold">Setup Photos</h2>
                {payload.setupPhotos.length === 0 ? <p className="text-sm text-gray-400">No setup photos</p> : (
                  <div className="grid grid-cols-2 gap-2">
                    {payload.setupPhotos.map(photo => (
                      <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded border bg-gray-100">
                        <img src={photo.url} alt={photo.caption ?? photo.category} className="h-28 w-full object-cover" />
                        <p className="truncate px-2 py-1 text-xs">{photo.caption ?? photo.category}</p>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
