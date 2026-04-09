import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus, Trash2, Edit2, ChevronDown, ChevronUp, Link as LinkIcon,
  Wrench, ClipboardList, Settings, Camera, Lightbulb, Search, BookOpen,
  GripVertical, X, Check,
} from 'lucide-react';
import type { MachinedPartRouting, MachinedPartRoutingOp, CncMachine } from './types';
import { CNC_MACHINE_TYPES } from './types';

interface InventoryItem {
  id: string;
  agPartNumber: string;
  name: string;
  category?: string;
}

const EMPTY_OP: Omit<MachinedPartRoutingOp, 'id' | 'routingId' | 'sortOrder' | 'createdAt'> = {
  opNumber: 10,
  opName: '',
  machineType: null,
  preferredMachineId: null,
  programNames: [],
  toolList: [],
  fixtureInstructions: null,
  workOriginNotes: null,
  qcTolerances: [],
  referencePhotoLinks: [],
  tips: null,
};

export default function MachinedPartRoutingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [routingDialogOpen, setRoutingDialogOpen] = useState(false);
  const [editingRouting, setEditingRouting] = useState<MachinedPartRouting | null>(null);
  const [routingForm, setRoutingForm] = useState({ inventoryItemId: '', routingName: '', partNumber: '', partName: '', notes: '' });

  const [selectedRoutingId, setSelectedRoutingId] = useState<number | null>(null);
  const [expandedOpId, setExpandedOpId] = useState<number | null>(null);

  const [addOpOpen, setAddOpOpen] = useState(false);
  const [editOpDialogOpen, setEditOpDialogOpen] = useState(false);
  const [editingOp, setEditingOp] = useState<MachinedPartRoutingOp | null>(null);
  const [opForm, setOpForm] = useState({ ...EMPTY_OP });

  const [programInput, setProgramInput] = useState('');
  const [newTool, setNewTool] = useState({ toolNumber: '', pocket: '', description: '', diameter: '', offsetNotes: '' });
  const [newQc, setNewQc] = useState({ characteristic: '', nominal: '', tolerance: '', method: '' });
  const [newPhoto, setNewPhoto] = useState({ url: '', caption: '' });

  const { data: routings = [], isLoading } = useQuery<MachinedPartRouting[]>({
    queryKey: ['/api/cnc/machined-part-routings'],
  });

  const { data: machines = [] } = useQuery<CncMachine[]>({
    queryKey: ['/api/cnc/machines'],
  });

  const { data: ops = [], isLoading: opsLoading } = useQuery<MachinedPartRoutingOp[]>({
    queryKey: ['/api/cnc/machined-part-routings', selectedRoutingId, 'ops'],
    enabled: selectedRoutingId != null,
  });

  const selectedRouting = routings.find(r => r.id === selectedRoutingId) ?? null;

  const activeMachines = machines.filter(m => m.active);

  const createRouting = useMutation({
    mutationFn: (data: typeof routingForm) => apiRequest('/api/cnc/machined-part-routings', { method: 'POST', body: data }),
    onSuccess: (r: MachinedPartRouting) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machined-part-routings'] });
      setRoutingDialogOpen(false);
      setSelectedRoutingId(r.id);
      toast({ title: 'Routing created' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateRouting = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof routingForm> }) =>
      apiRequest(`/api/cnc/machined-part-routings/${id}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machined-part-routings'] });
      setRoutingDialogOpen(false);
      toast({ title: 'Routing updated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteRouting = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/cnc/machined-part-routings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machined-part-routings'] });
      setSelectedRoutingId(null);
      toast({ title: 'Routing deleted' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createOp = useMutation({
    mutationFn: (data: Omit<MachinedPartRoutingOp, 'id' | 'routingId' | 'createdAt'>) =>
      apiRequest(`/api/cnc/machined-part-routings/${selectedRoutingId}/ops`, { method: 'POST', body: data }),
    onSuccess: (op: MachinedPartRoutingOp) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machined-part-routings', selectedRoutingId, 'ops'] });
      setAddOpOpen(false);
      setExpandedOpId(op.id);
      resetOpForm();
      toast({ title: `Op ${op.opNumber} added` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateOp = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MachinedPartRoutingOp> }) =>
      apiRequest(`/api/cnc/machined-part-routings/${selectedRoutingId}/ops/${id}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machined-part-routings', selectedRoutingId, 'ops'] });
      setEditOpDialogOpen(false);
      toast({ title: 'Op saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteOp = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/cnc/machined-part-routings/${selectedRoutingId}/ops/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machined-part-routings', selectedRoutingId, 'ops'] });
      toast({ title: 'Op deleted' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const reorderOps = useMutation({
    mutationFn: (updates: { id: number; sortOrder: number }[]) =>
      apiRequest(`/api/cnc/machined-part-routings/${selectedRoutingId}/ops/reorder`, { method: 'PATCH', body: updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machined-part-routings', selectedRoutingId, 'ops'] });
    },
    onError: (e: any) => toast({ title: 'Error reordering ops', description: e.message, variant: 'destructive' }),
  });

  function moveOp(op: MachinedPartRoutingOp, direction: 'up' | 'down') {
    const sorted = [...ops].sort((a, b) => a.sortOrder - b.sortOrder || a.opNumber - b.opNumber);
    const idx = sorted.findIndex(o => o.id === op.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const neighbor = sorted[swapIdx];
    reorderOps.mutate([
      { id: op.id, sortOrder: neighbor.sortOrder },
      { id: neighbor.id, sortOrder: op.sortOrder },
    ]);
  }

  function resetOpForm() {
    setOpForm({ ...EMPTY_OP });
    setProgramInput('');
    setNewTool({ toolNumber: '', pocket: '', description: '', diameter: '', offsetNotes: '' });
    setNewQc({ characteristic: '', nominal: '', tolerance: '', method: '' });
    setNewPhoto({ url: '', caption: '' });
  }

  function openAddOp() {
    resetOpForm();
    const nextNum = ops.length > 0 ? (Math.max(...ops.map(o => o.opNumber)) + 10) : 10;
    setOpForm(p => ({ ...p, opNumber: nextNum }));
    setAddOpOpen(true);
  }

  function openEditOp(op: MachinedPartRoutingOp) {
    setEditingOp(op);
    setOpForm({
      opNumber: op.opNumber,
      opName: op.opName,
      machineType: op.machineType,
      preferredMachineId: op.preferredMachineId,
      programNames: op.programNames ?? [],
      toolList: op.toolList ?? [],
      fixtureInstructions: op.fixtureInstructions,
      workOriginNotes: op.workOriginNotes,
      qcTolerances: op.qcTolerances ?? [],
      referencePhotoLinks: op.referencePhotoLinks ?? [],
      tips: op.tips,
    });
    setProgramInput('');
    setNewTool({ toolNumber: '', pocket: '', description: '', diameter: '', offsetNotes: '' });
    setNewQc({ characteristic: '', nominal: '', tolerance: '', method: '' });
    setNewPhoto({ url: '', caption: '' });
    setEditOpDialogOpen(true);
  }

  function openNewRouting() {
    setEditingRouting(null);
    setRoutingForm({ inventoryItemId: '', routingName: '', partNumber: '', partName: '', notes: '' });
    setRoutingDialogOpen(true);
  }

  function openEditRouting(r: MachinedPartRouting) {
    setEditingRouting(r);
    setRoutingForm({
      inventoryItemId: r.inventoryItemId,
      routingName: r.routingName,
      partNumber: r.partNumber ?? '',
      partName: r.partName ?? '',
      notes: r.notes ?? '',
    });
    setRoutingDialogOpen(true);
  }

  function saveRouting() {
    if (editingRouting) {
      updateRouting.mutate({ id: editingRouting.id, data: routingForm });
    } else {
      createRouting.mutate(routingForm);
    }
  }

  function saveOp(isEdit: boolean) {
    const payload = {
      opNumber: opForm.opNumber,
      opName: opForm.opName.trim(),
      machineType: opForm.machineType || null,
      preferredMachineId: opForm.preferredMachineId || null,
      programNames: opForm.programNames,
      toolList: opForm.toolList,
      fixtureInstructions: opForm.fixtureInstructions || null,
      workOriginNotes: opForm.workOriginNotes || null,
      qcTolerances: opForm.qcTolerances,
      referencePhotoLinks: opForm.referencePhotoLinks,
      tips: opForm.tips || null,
      sortOrder: isEdit && editingOp ? editingOp.sortOrder : (ops.length),
    };
    if (isEdit && editingOp) {
      updateOp.mutate({ id: editingOp.id, data: payload });
    } else {
      createOp.mutate(payload);
    }
  }

  function addProgram() {
    const name = programInput.trim();
    if (!name) return;
    setOpForm(p => ({ ...p, programNames: [...(p.programNames ?? []), name] }));
    setProgramInput('');
  }

  function addTool() {
    if (!newTool.toolNumber) return;
    setOpForm(p => ({ ...p, toolList: [...(p.toolList ?? []), { ...newTool }] }));
    setNewTool({ toolNumber: '', pocket: '', description: '', diameter: '', offsetNotes: '' });
  }

  function addQc() {
    if (!newQc.characteristic) return;
    setOpForm(p => ({ ...p, qcTolerances: [...(p.qcTolerances ?? []), { ...newQc }] }));
    setNewQc({ characteristic: '', nominal: '', tolerance: '', method: '' });
  }

  function addPhoto() {
    if (!newPhoto.url) return;
    setOpForm(p => ({ ...p, referencePhotoLinks: [...(p.referencePhotoLinks ?? []), { ...newPhoto }] }));
    setNewPhoto({ url: '', caption: '' });
  }

  const filteredRoutings = routings.filter(r =>
    !search || r.routingName.toLowerCase().includes(search.toLowerCase()) ||
    (r.partNumber ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.partName ?? '').toLowerCase().includes(search.toLowerCase())
  );

  function getMachineLabel(id: number | null) {
    if (!id) return null;
    const m = machines.find(m => m.id === id);
    return m ? `${m.machineName}${m.machineNumber ? ` #${m.machineNumber}` : ''}` : null;
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── Left: Routing List ──────────────────────────────────────────────── */}
      <div className="w-72 border-r flex flex-col bg-gray-50">
        <div className="p-3 border-b bg-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-500" />
              Part Routings
            </h2>
            <Button size="sm" className="h-7 text-xs px-2 gap-1" onClick={openNewRouting}>
              <Plus className="w-3 h-3" /> New
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <Input
              className="h-7 text-xs pl-6"
              placeholder="Search routings…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 text-xs text-gray-400 text-center">Loading…</div>
          ) : filteredRoutings.length === 0 ? (
            <div className="p-4 text-xs text-gray-400 text-center">No routings found</div>
          ) : (
            <div className="divide-y">
              {filteredRoutings.map(r => (
                <button
                  key={r.id}
                  className={`w-full text-left px-3 py-2.5 text-xs hover:bg-blue-50 transition-colors ${selectedRoutingId === r.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
                  onClick={() => setSelectedRoutingId(r.id)}
                >
                  <p className="font-semibold text-gray-800 truncate">{r.routingName}</p>
                  {r.partNumber && <p className="text-gray-500 truncate">{r.partNumber}{r.partName ? ` — ${r.partName}` : ''}</p>}
                  {r.createdByDisplayName && <p className="text-gray-400 mt-0.5">by {r.createdByDisplayName}</p>}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Right: Routing Editor ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!selectedRouting ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            <div className="text-center">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>Select a routing or create a new one</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{selectedRouting.routingName}</h3>
                <p className="text-xs text-gray-500">
                  {selectedRouting.partNumber && <span className="font-mono">{selectedRouting.partNumber}</span>}
                  {selectedRouting.partName && <span className="ml-1">— {selectedRouting.partName}</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openEditRouting(selectedRouting)}>
                  <Edit2 className="w-3 h-3" /> Edit
                </Button>
                <Button
                  size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-500 hover:text-red-700"
                  onClick={() => { if (confirm('Delete this routing?')) deleteRouting.mutate(selectedRouting.id); }}
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            </div>

            {selectedRouting.notes && (
              <div className="px-4 py-2 bg-amber-50 border-b text-xs text-amber-800">
                <strong>Notes:</strong> {selectedRouting.notes}
              </div>
            )}

            {/* Operations List */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">Operations</h4>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={openAddOp}>
                    <Plus className="w-3 h-3" /> Add Op
                  </Button>
                </div>

                {opsLoading ? (
                  <div className="text-xs text-gray-400">Loading ops…</div>
                ) : ops.length === 0 ? (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded p-4 text-center border border-dashed">
                    No operations yet — add your first op above
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ops.map((op, idx) => (
                      <OpCard
                        key={op.id}
                        op={op}
                        expanded={expandedOpId === op.id}
                        onToggle={() => setExpandedOpId(expandedOpId === op.id ? null : op.id)}
                        onEdit={() => openEditOp(op)}
                        onDelete={() => { if (confirm(`Delete Op ${op.opNumber}?`)) deleteOp.mutate(op.id); }}
                        getMachineLabel={getMachineLabel}
                        onMoveUp={() => moveOp(op, 'up')}
                        onMoveDown={() => moveOp(op, 'down')}
                        isFirst={idx === 0}
                        isLast={idx === ops.length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {/* ── Routing Create/Edit Dialog ───────────────────────────────────────── */}
      <Dialog open={routingDialogOpen} onOpenChange={setRoutingDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingRouting ? 'Edit Routing' : 'New Machined Part Routing'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Routing Name *</Label>
              <Input className="h-8 text-sm mt-1" placeholder="e.g. Receiver Machining v1" value={routingForm.routingName}
                onChange={e => setRoutingForm(p => ({ ...p, routingName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Part Number</Label>
              <Input className="h-8 text-sm mt-1" placeholder="e.g. AG-1234" value={routingForm.partNumber}
                onChange={e => setRoutingForm(p => ({ ...p, partNumber: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Part Name</Label>
              <Input className="h-8 text-sm mt-1" value={routingForm.partName}
                onChange={e => setRoutingForm(p => ({ ...p, partName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Inventory Item ID *</Label>
              <Input className="h-8 text-sm mt-1" placeholder="Inventory item UUID (from inventory)" value={routingForm.inventoryItemId}
                onChange={e => setRoutingForm(p => ({ ...p, inventoryItemId: e.target.value }))} />
              <p className="text-[10px] text-gray-400 mt-0.5">Link to a MACHINED_PART inventory item</p>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm mt-1 resize-none" rows={2} value={routingForm.notes}
                onChange={e => setRoutingForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoutingDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!routingForm.routingName.trim() || !routingForm.inventoryItemId.trim() || createRouting.isPending || updateRouting.isPending}
              onClick={saveRouting}
            >
              {createRouting.isPending || updateRouting.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Op Add/Edit Dialog ───────────────────────────────────────────────── */}
      <Dialog open={addOpOpen || editOpDialogOpen} onOpenChange={open => { if (!open) { setAddOpOpen(false); setEditOpDialogOpen(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editOpDialogOpen ? `Edit Op ${editingOp?.opNumber}` : 'Add Operation'}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4 py-2">

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Op Number *</Label>
                  <Input type="number" className="h-8 text-sm mt-1" value={opForm.opNumber}
                    onChange={e => setOpForm(p => ({ ...p, opNumber: parseInt(e.target.value) || 10 }))} />
                  <p className="text-[10px] text-gray-400 mt-0.5">Industry convention: 10, 20, 30…</p>
                </div>
                <div>
                  <Label className="text-xs">Op Name *</Label>
                  <Input className="h-8 text-sm mt-1" placeholder="e.g. Rough Mill, Finish Profile" value={opForm.opName}
                    onChange={e => setOpForm(p => ({ ...p, opName: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Machine Type Required</Label>
                  <Select
                    value={opForm.machineType ?? '__ANY__'}
                    onValueChange={v => setOpForm(p => ({ ...p, machineType: v === '__ANY__' ? null : v }))}
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue placeholder="Any / Not specified" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ANY__">Any / Not specified</SelectItem>
                      {CNC_MACHINE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Preferred Machine</Label>
                  <Select
                    value={opForm.preferredMachineId != null ? String(opForm.preferredMachineId) : '__NONE__'}
                    onValueChange={v => setOpForm(p => ({ ...p, preferredMachineId: v === '__NONE__' ? null : parseInt(v) }))}
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue placeholder="No preference" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__NONE__">No preference</SelectItem>
                      {activeMachines.map(m => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.machineName}{m.machineNumber ? ` #${m.machineNumber}` : ''}{m.machineType ? ` (${m.machineType})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* NC Programs */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1"><Settings className="w-3 h-3" />NC Program Names</Label>
                <div className="mt-1 space-y-1">
                  {(opForm.programNames ?? []).map((name, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs bg-gray-50 rounded px-2 py-1">
                      <span className="flex-1 font-mono">{name}</span>
                      <button onClick={() => setOpForm(p => ({ ...p, programNames: p.programNames!.filter((_, j) => j !== i) }))}
                        className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <Input className="h-7 text-xs flex-1 font-mono" placeholder="e.g. OP10_MAIN.NC" value={programInput}
                      onChange={e => setProgramInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProgram(); } }} />
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={addProgram}><Plus className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Tool List */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1"><Wrench className="w-3 h-3" />Tool List</Label>
                <div className="mt-1 space-y-1">
                  {(opForm.toolList ?? []).length > 0 && (
                    <div className="grid text-[10px] text-gray-500 px-2 gap-1" style={{ gridTemplateColumns: '44px 48px 1fr 52px 1fr 20px' }}>
                      <span>Tool #</span><span>Pocket</span><span>Description</span><span>Dia.</span><span>Offset Notes</span><span />
                    </div>
                  )}
                  {(opForm.toolList ?? []).map((t, i) => (
                    <div key={i} className="grid items-center text-xs bg-gray-50 rounded px-2 py-1 gap-1" style={{ gridTemplateColumns: '44px 48px 1fr 52px 1fr 20px' }}>
                      <span className="font-mono font-medium">{t.toolNumber}</span>
                      <span className="text-gray-500">{t.pocket}</span>
                      <span className="truncate">{t.description}</span>
                      <span className="text-gray-500">{t.diameter}</span>
                      <span className="text-gray-400 truncate text-[10px]">{t.offsetNotes}</span>
                      <button onClick={() => setOpForm(p => ({ ...p, toolList: p.toolList!.filter((_, j) => j !== i) }))}
                        className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <div className="grid gap-1 mt-1" style={{ gridTemplateColumns: '44px 48px 1fr 52px 1fr auto' }}>
                    <Input className="h-7 text-xs font-mono" placeholder="T01" value={newTool.toolNumber}
                      onChange={e => setNewTool(p => ({ ...p, toolNumber: e.target.value }))} />
                    <Input className="h-7 text-xs" placeholder="H1" value={newTool.pocket}
                      onChange={e => setNewTool(p => ({ ...p, pocket: e.target.value }))} />
                    <Input className="h-7 text-xs" placeholder="1/2 EM" value={newTool.description}
                      onChange={e => setNewTool(p => ({ ...p, description: e.target.value }))} />
                    <Input className="h-7 text-xs" placeholder="0.500" value={newTool.diameter}
                      onChange={e => setNewTool(p => ({ ...p, diameter: e.target.value }))} />
                    <Input className="h-7 text-xs" placeholder="Offset notes" value={newTool.offsetNotes}
                      onChange={e => setNewTool(p => ({ ...p, offsetNotes: e.target.value }))} />
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={addTool}><Plus className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Fixture Instructions */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1"><GripVertical className="w-3 h-3" />Fixture Installation Instructions</Label>
                <Textarea className="text-xs mt-1 resize-none" rows={3}
                  placeholder="How to install in fixture: jaw orientation, soft jaw notes, clamp positions, datum alignment…"
                  value={opForm.fixtureInstructions ?? ''}
                  onChange={e => setOpForm(p => ({ ...p, fixtureInstructions: e.target.value || null }))} />
              </div>

              {/* Work Origin */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1"><Settings className="w-3 h-3" />Work Origin / Datum Notes</Label>
                <Textarea className="text-xs mt-1 resize-none" rows={2}
                  placeholder="e.g. G54 — top-left corner of part, Z0 at stock top…"
                  value={opForm.workOriginNotes ?? ''}
                  onChange={e => setOpForm(p => ({ ...p, workOriginNotes: e.target.value || null }))} />
              </div>

              <Separator />

              {/* QC Tolerances */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1"><ClipboardList className="w-3 h-3" />QC Tolerances</Label>
                <div className="mt-1 space-y-1">
                  {(opForm.qcTolerances ?? []).length > 0 && (
                    <div className="grid text-[10px] text-gray-500 px-2 gap-1" style={{ gridTemplateColumns: '1fr 64px 72px 1fr 20px' }}>
                      <span>Characteristic</span><span>Nominal</span><span>Tolerance</span><span>Method</span><span />
                    </div>
                  )}
                  {(opForm.qcTolerances ?? []).map((q, i) => (
                    <div key={i} className="grid items-center text-xs bg-gray-50 rounded px-2 py-1 gap-1" style={{ gridTemplateColumns: '1fr 64px 72px 1fr 20px' }}>
                      <span className="font-medium truncate">{q.characteristic}</span>
                      <span className="text-gray-500">{q.nominal}</span>
                      <span className="text-orange-600">{q.tolerance}</span>
                      <span className="text-gray-400 truncate text-[10px]">{q.method}</span>
                      <button onClick={() => setOpForm(p => ({ ...p, qcTolerances: p.qcTolerances!.filter((_, j) => j !== i) }))}
                        className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <div className="grid gap-1 mt-1" style={{ gridTemplateColumns: '1fr 64px 72px 1fr auto' }}>
                    <Input className="h-7 text-xs" placeholder="Bore diameter" value={newQc.characteristic}
                      onChange={e => setNewQc(p => ({ ...p, characteristic: e.target.value }))} />
                    <Input className="h-7 text-xs" placeholder="1.500" value={newQc.nominal}
                      onChange={e => setNewQc(p => ({ ...p, nominal: e.target.value }))} />
                    <Input className="h-7 text-xs" placeholder="±0.002" value={newQc.tolerance}
                      onChange={e => setNewQc(p => ({ ...p, tolerance: e.target.value }))} />
                    <Input className="h-7 text-xs" placeholder="Bore gauge" value={newQc.method}
                      onChange={e => setNewQc(p => ({ ...p, method: e.target.value }))} />
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={addQc}><Plus className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Reference Photo Links */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1"><Camera className="w-3 h-3" />Reference Photo Links</Label>
                <div className="mt-1 space-y-1">
                  {(opForm.referencePhotoLinks ?? []).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1">
                      <LinkIcon className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600 underline truncate flex-1">{p.caption || p.url}</a>
                      <button onClick={() => setOpForm(f => ({ ...f, referencePhotoLinks: f.referencePhotoLinks!.filter((_, j) => j !== i) }))}
                        className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <Input className="h-7 text-xs flex-1" placeholder="URL" value={newPhoto.url}
                      onChange={e => setNewPhoto(p => ({ ...p, url: e.target.value }))} />
                    <Input className="h-7 text-xs w-32" placeholder="Caption (opt.)" value={newPhoto.caption}
                      onChange={e => setNewPhoto(p => ({ ...p, caption: e.target.value }))} />
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={addPhoto}><Plus className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Tips / Notes */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1"><Lightbulb className="w-3 h-3 text-amber-500" />Tips / Notes (Tribal Knowledge)</Label>
                <Textarea className="text-xs mt-1 resize-none" rows={3}
                  placeholder="Watch for chatter on Op20 corner… Tool life on T3 is ~80 parts… Always warm up spindle 5 min first…"
                  value={opForm.tips ?? ''}
                  onChange={e => setOpForm(p => ({ ...p, tips: e.target.value || null }))} />
              </div>

            </div>
          </ScrollArea>
          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => { setAddOpOpen(false); setEditOpDialogOpen(false); }}>Cancel</Button>
            <Button
              disabled={!opForm.opName.trim() || createOp.isPending || updateOp.isPending}
              onClick={() => saveOp(editOpDialogOpen)}
            >
              {createOp.isPending || updateOp.isPending ? 'Saving…' : 'Save Op'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OpCard({
  op, expanded, onToggle, onEdit, onDelete, getMachineLabel,
  onMoveUp, onMoveDown, isFirst, isLast,
}: {
  op: MachinedPartRoutingOp;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  getMachineLabel: (id: number | null) => string | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const machineLabel = getMachineLabel(op.preferredMachineId);
  return (
    <div className="border rounded bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Badge variant="outline" className="text-xs px-1.5 h-5 font-mono flex-shrink-0">Op {op.opNumber}</Badge>
          <span className="font-medium text-sm text-gray-800 truncate">{op.opName}</span>
          {op.machineType && (
            <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded flex-shrink-0">{op.machineType}</span>
          )}
          {machineLabel && (
            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded flex-shrink-0 truncate max-w-24">{machineLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {op.programNames?.length > 0 && (
            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{op.programNames.length} prog</span>
          )}
          {op.toolList?.length > 0 && (
            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{op.toolList.length} tools</span>
          )}
          {op.qcTolerances?.length > 0 && (
            <span className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{op.qcTolerances.length} QC</span>
          )}
          <button
            className={`p-0.5 transition-colors ${isFirst ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-blue-600'}`}
            disabled={isFirst}
            title="Move up"
            onClick={e => { e.stopPropagation(); if (!isFirst) onMoveUp(); }}
          ><ChevronUp className="w-3.5 h-3.5" /></button>
          <button
            className={`p-0.5 transition-colors ${isLast ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-blue-600'}`}
            disabled={isLast}
            title="Move down"
            onClick={e => { e.stopPropagation(); if (!isLast) onMoveDown(); }}
          ><ChevronDown className="w-3.5 h-3.5" /></button>
          <button className="p-0.5 text-gray-400 hover:text-blue-600" onClick={e => { e.stopPropagation(); onEdit(); }}><Edit2 className="w-3.5 h-3.5" /></button>
          <button className="p-0.5 text-gray-400 hover:text-red-600" onClick={e => { e.stopPropagation(); onDelete(); }}><Trash2 className="w-3.5 h-3.5" /></button>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-300" /> : <ChevronDown className="w-4 h-4 text-gray-300" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-3 text-xs">
          {/* Programs */}
          {op.programNames?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Settings className="w-3 h-3" />NC Programs</p>
              <div className="flex flex-wrap gap-1">
                {op.programNames.map((n, i) => <span key={i} className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{n}</span>)}
              </div>
            </div>
          )}

          {/* Tool List */}
          {op.toolList?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Wrench className="w-3 h-3" />Tool List</p>
              <div className="space-y-0.5">
                {op.toolList.map((t, i) => (
                  <div key={i} className="flex gap-2 text-[10px] leading-4">
                    <span className="font-mono font-medium w-8 flex-shrink-0">{t.toolNumber}</span>
                    {t.pocket && <span className="text-gray-400 flex-shrink-0">[{t.pocket}]</span>}
                    <span className="text-gray-700 flex-1">{t.description}</span>
                    {t.diameter && <span className="text-gray-500 flex-shrink-0">∅{t.diameter}</span>}
                    {t.offsetNotes && <span className="text-gray-400 italic">{t.offsetNotes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fixture */}
          {op.fixtureInstructions && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><GripVertical className="w-3 h-3" />Fixture Instructions</p>
              <p className="text-gray-700 whitespace-pre-wrap">{op.fixtureInstructions}</p>
            </div>
          )}

          {/* Work Origin */}
          {op.workOriginNotes && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Work Origin / Datum</p>
              <p className="text-gray-700">{op.workOriginNotes}</p>
            </div>
          )}

          {/* QC Tolerances */}
          {op.qcTolerances?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><ClipboardList className="w-3 h-3" />QC Tolerances</p>
              <div className="space-y-0.5">
                {op.qcTolerances.map((q, i) => (
                  <div key={i} className="flex gap-2 text-[10px]">
                    <span className="font-medium flex-1">{q.characteristic}</span>
                    <span className="text-gray-500">{q.nominal}</span>
                    <span className="text-orange-600 font-mono">{q.tolerance}</span>
                    <span className="text-gray-400">{q.method}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Photo Links */}
          {op.referencePhotoLinks?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Camera className="w-3 h-3" />Reference Photos</p>
              <div className="flex flex-wrap gap-1">
                {op.referencePhotoLinks.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer"
                    className="text-blue-600 underline text-[10px] flex items-center gap-0.5">
                    <LinkIcon className="w-2.5 h-2.5" />{p.caption || `Photo ${i + 1}`}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          {op.tips && (
            <div>
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1 flex items-center gap-1"><Lightbulb className="w-3 h-3" />Tips</p>
              <p className="text-gray-700 whitespace-pre-wrap">{op.tips}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
