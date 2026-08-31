import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, ChevronRight, CircleAlert, ClipboardPlus, PackageSearch, Plus, Search } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

// apiRequest already parses JSON responses; callers receive the response body.
const json = async (url: string, options?: any) => apiRequest(url, options);
const blankProduct = { productName: '', modelNumber: '', productPartNumber: '', revision: '', customer: '', notes: '' };
const blankItem = {
  itemName: '', enteredPartNumber: '', quantity: 1, quantityBasis: '',
  assemblyName: '', parentAssemblyName: '', physicalLocation: '',
  observationKind: 'part', characteristicName: '', characteristicValue: '', characteristicUnit: '',
  classification: 'unclassified', includeInBomComparison: true,
  threadSize: '', length: '', headStyle: '', driveStyle: '', materialFinish: '',
  additionalDetails: '', notes: '',
};
const classificationLabels: Record<string, string> = {
  unclassified: 'Unclassified', manufactured: 'Manufactured', purchased: 'Purchased', feature: 'Feature only',
};

function SuggestionField({ id, label, value, onChange, placeholder, options }: any) {
  const listId = `${id}-suggestions`;
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} list={listId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><datalist id={listId}>{options.map((option: string) => <option key={option} value={option} />)}</datalist></div>;
}

export default function ProductTeardown() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const firstCaptureFieldRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [beginCaptureAfterCreate, setBeginCaptureAfterCreate] = useState(false);
  const [product, setProduct] = useState(blankProduct);
  const [item, setItem] = useState(blankItem);
  const [assemblyFilter, setAssemblyFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [verifyItem, setVerifyItem] = useState<any>(null);
  const [matchOptions, setMatchOptions] = useState<any[]>([]);

  const { data: sessions = [] } = useQuery<any[]>({ queryKey: ['/api/product-teardowns'], queryFn: () => json('/api/product-teardowns') });
  const { data: details, isLoading, isError: detailsFailed, error: detailsError } = useQuery<any>({ queryKey: ['/api/product-teardowns', selectedId], queryFn: () => json(`/api/product-teardowns/${selectedId}`), enabled: Boolean(selectedId) });
  const { data: suggestions = {} } = useQuery<any>({ queryKey: ['/api/product-teardowns/suggestions'], queryFn: () => json('/api/product-teardowns/suggestions') });
  const { data: comparison } = useQuery<any>({ queryKey: ['/api/product-teardowns', selectedId, 'bom-comparison'], queryFn: () => json(`/api/product-teardowns/${selectedId}/bom-comparison`), enabled: Boolean(selectedId) });
  const values = (key: string) => (suggestions[key] ?? []).map((row: any) => row.value).filter(Boolean);

  useEffect(() => {
    if (captureOpen) window.setTimeout(() => firstCaptureFieldRef.current?.focus(), 50);
  }, [captureOpen]);
  useEffect(() => {
    setItem(blankItem);
  }, [selectedId]);
  useEffect(() => {
    if (beginCaptureAfterCreate && details) {
      setCaptureOpen(true);
      setBeginCaptureAfterCreate(false);
    }
  }, [beginCaptureAfterCreate, details]);

  const refreshTeardown = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/product-teardowns', selectedId] });
    queryClient.invalidateQueries({ queryKey: ['/api/product-teardowns', selectedId, 'bom-comparison'] });
  };
  const createSession = useMutation({
    mutationFn: async () => {
      const created = await json('/api/product-teardowns', { method: 'POST', body: product });
      if (!created?.id) throw new Error('The server did not return the new teardown record.');
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['/api/product-teardowns'] });
      setBeginCaptureAfterCreate(true); setSelectedId(created.id); setShowNew(false); setProduct(blankProduct);
      toast({ title: 'Product teardown created', description: 'Opening the first observation now.' });
    },
    onError: (error: any) => toast({
      title: 'Could not create the teardown',
      description: error?.message || 'The request failed. Please try again or contact an administrator.',
      variant: 'destructive',
    }),
  });
  const addItem = useMutation({
    mutationFn: ({ payload }: { payload: typeof blankItem; keepOpen: boolean }) => json(`/api/product-teardowns/${selectedId}/items`, { method: 'POST', body: payload }),
    onSuccess: (result, variables) => {
      refreshTeardown(); queryClient.invalidateQueries({ queryKey: ['/api/product-teardowns/suggestions'] });
      setItem({ ...blankItem, physicalLocation: variables.payload.physicalLocation, assemblyName: variables.payload.assemblyName, parentAssemblyName: variables.payload.parentAssemblyName });
      setCaptureOpen(variables.keepOpen);
      if (variables.keepOpen) window.setTimeout(() => firstCaptureFieldRef.current?.focus(), 50);
      toast({ title: result.item.inventory_match_state === 'found' ? `Captured and matched to ${result.item.inventory_part_number}` : result.item.inventory_match_state === 'possible' ? 'Captured — possible inventory match needs verification' : 'Observation captured' });
    },
  });
  const updateItem = useMutation({ mutationFn: ({ row, patch }: any) => json(`/api/product-teardowns/${selectedId}/items/${row.id}`, { method: 'PATCH', body: patch }), onSuccess: refreshTeardown });
  const toggleMatch = useMutation({ mutationFn: ({ row, checked }: any) => json(`/api/product-teardowns/${selectedId}/items/${row.id}/match`, { method: 'PATCH', body: { inventoryItemId: checked ? row.inventory_item_id : null, confirmed: checked } }), onSuccess: refreshTeardown });
  const uploadPhoto = async (file: File, itemId?: string) => { const body = new FormData(); body.append('photo', file); if (itemId) body.append('itemId', itemId); await json(`/api/product-teardowns/${selectedId}/photos`, { method: 'POST', body }); refreshTeardown(); toast({ title: 'Photo attached' }); };
  const openVerification = async (row: any) => { setVerifyItem(row); setMatchOptions(await json(`/api/product-teardowns/${selectedId}/items/${row.id}/matches`)); };

  const items = details?.items ?? [];
  const assemblies = [...new Set(items.map((row: any) => row.assembly_name).filter(Boolean))] as string[];
  const locations = [...new Set(items.map((row: any) => row.physical_location).filter(Boolean))] as string[];
  const filtered = items.filter((row: any) => (assemblyFilter === 'all' || row.assembly_name === assemblyFilter) && (locationFilter === 'all' || row.physical_location === locationFilter) && (classificationFilter === 'all' || row.classification === classificationFilter) && (!search || `${row.item_name} ${row.entered_part_number ?? ''} ${row.characteristic_name ?? ''} ${row.characteristic_value ?? ''}`.toLowerCase().includes(search.toLowerCase())));
  const consolidated = useMemo(() => {
    const groups = new Map<string, any>();
    for (const row of filtered.filter((entry: any) => entry.include_in_bom_comparison)) {
      const key = `${row.inventory_part_number || row.entered_part_number || ''}|${row.item_name}`.trim().toLowerCase();
      const current = groups.get(key) ?? { ...row, total: 0, occurrences: [] };
      current.total += Number(row.quantity); current.occurrences.push(row); groups.set(key, current);
    }
    return [...groups.values()].sort((left, right) => left.item_name.localeCompare(right.item_name));
  }, [filtered]);
  const setObservationKind = (kind: string) => setItem({ ...item, observationKind: kind, classification: kind === 'characteristic' ? 'feature' : 'unclassified', includeInBomComparison: kind !== 'characteristic' });

  if (!selectedId) return <div className="mx-auto max-w-6xl space-y-6 p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-semibold">Product Teardown</h1><p className="text-muted-foreground">Create a product, rapidly capture what you observe, then organize and compare it later.</p></div><Button className="cursor-pointer" onClick={() => setShowNew(!showNew)}><Plus className="mr-2 h-4 w-4" />New teardown</Button></div>
    {showNew && <Card><CardHeader><CardTitle>New product</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">
      <Input aria-label="Product name" placeholder="Product name * (e.g. Composite Alligator)" value={product.productName} onChange={(event) => setProduct({ ...product, productName: event.target.value })} />
      <Input aria-label="Model number" placeholder="Model number" value={product.modelNumber} onChange={(event) => setProduct({ ...product, modelNumber: event.target.value })} />
      <Input aria-label="Product or AG part number" placeholder="Product / AG part number" value={product.productPartNumber} onChange={(event) => setProduct({ ...product, productPartNumber: event.target.value })} />
      <Input aria-label="Revision" placeholder="Revision" value={product.revision} onChange={(event) => setProduct({ ...product, revision: event.target.value })} />
      <Input aria-label="Customer" placeholder="Customer" value={product.customer} onChange={(event) => setProduct({ ...product, customer: event.target.value })} />
      <Textarea aria-label="Product notes" placeholder="Notes" value={product.notes} onChange={(event) => setProduct({ ...product, notes: event.target.value })} />
      <Button disabled={!product.productName.trim() || createSession.isPending} onClick={() => createSession.mutate()}><ClipboardPlus className="mr-2 h-4 w-4" />{createSession.isPending ? 'Creating teardown…' : 'Create and begin teardown'}</Button>
    </CardContent></Card>}
    <div className="grid gap-4 md:grid-cols-2">{sessions.map((session: any) => <Card key={session.id} className="cursor-pointer transition-colors hover:border-primary" onClick={() => setSelectedId(session.id)}><CardContent className="flex items-center justify-between p-5"><div><div className="font-semibold">{session.product_name}</div><div className="text-sm text-muted-foreground">{session.model_number || 'No model'} {session.revision ? `• Rev ${session.revision}` : ''}</div></div><ChevronRight /></CardContent></Card>)}</div>
  </div>;

  if (isLoading) return <div className="p-8">Creating teardown workspace…</div>;
  if (detailsFailed || !details) return <div className="mx-auto max-w-xl space-y-4 p-8"><h1 className="text-xl font-semibold">The teardown was created, but its workspace could not be opened.</h1><p className="text-sm text-muted-foreground">{(detailsError as any)?.message || 'Refresh the page or return to the teardown list and open it again.'}</p><Button variant="outline" onClick={() => { setBeginCaptureAfterCreate(false); setSelectedId(null); }}>Return to teardown list</Button></div>;
  return <div className="mx-auto max-w-[1500px] space-y-5 p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Button variant="ghost" className="mb-2 px-0" onClick={() => setSelectedId(null)}>← All teardowns</Button><h1 className="text-3xl font-semibold">{details.product_name}</h1><p className="text-muted-foreground">{[details.model_number, details.product_part_number, details.revision && `Rev ${details.revision}`].filter(Boolean).join(' • ')}</p><div className="mt-3 flex gap-2">{details.photos?.map((photo: any) => <img key={photo.id} src={photo.file_url} alt={`${details.product_name} teardown`} className="h-20 w-20 rounded-md border object-cover" />)}</div></div><div className="flex flex-wrap gap-2"><label className="cursor-pointer"><Input className="hidden" type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadPhoto(event.target.files[0])} /><Button asChild variant="outline"><span><Camera className="mr-2 h-4 w-4" />Product photo</span></Button></label><Button onClick={() => setCaptureOpen(true)}><Plus className="mr-2 h-4 w-4" />Capture next observation</Button></div></div>
    <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-muted-foreground">Captured</p><p className="text-xl font-semibold">{items.length}</p></div><div><p className="text-xs text-muted-foreground">Locations</p><p className="text-xl font-semibold">{locations.length}</p></div><div><p className="text-xs text-muted-foreground">Components</p><p className="text-xl font-semibold">{assemblies.length}</p></div><div><p className="text-xs text-muted-foreground">Parts/BOM candidates</p><p className="text-xl font-semibold">{items.filter((row: any) => row.include_in_bom_comparison).length}</p></div></CardContent></Card>
    <div className="flex flex-wrap gap-3"><div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search captured observations" placeholder="Search observations" value={search} onChange={(event) => setSearch(event.target.value)} /></div><Select value={locationFilter} onValueChange={setLocationFilter}><SelectTrigger className="w-52"><SelectValue placeholder="All locations" /></SelectTrigger><SelectContent><SelectItem value="all">All locations</SelectItem>{locations.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Select value={assemblyFilter} onValueChange={setAssemblyFilter}><SelectTrigger className="w-52"><SelectValue placeholder="All components" /></SelectTrigger><SelectContent><SelectItem value="all">All components</SelectItem>{assemblies.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Select value={classificationFilter} onValueChange={setClassificationFilter}><SelectTrigger className="w-52"><SelectValue placeholder="All classifications" /></SelectTrigger><SelectContent><SelectItem value="all">All classifications</SelectItem>{Object.entries(classificationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    <Tabs defaultValue="occurrences"><TabsList><TabsTrigger value="occurrences">Observation log ({filtered.length})</TabsTrigger><TabsTrigger value="consolidated">Consolidated parts ({consolidated.length})</TabsTrigger><TabsTrigger value="bom">Latest BOM check</TabsTrigger></TabsList>
      <TabsContent value="occurrences"><Card className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Location</TableHead><TableHead>Component</TableHead><TableHead>Observation</TableHead><TableHead>Characteristic</TableHead><TableHead>Qty</TableHead><TableHead>Classify later</TableHead><TableHead>BOM?</TableHead><TableHead>Inventory</TableHead><TableHead>Photos</TableHead></TableRow></TableHeader><TableBody>{filtered.map((row: any) => <TableRow key={row.id}>
        <TableCell>{row.physical_location || '—'}</TableCell><TableCell>{row.parent_assembly_name && <span className="text-muted-foreground">{row.parent_assembly_name} › </span>}{row.assembly_name || '—'}</TableCell><TableCell className="font-medium">{row.item_name}<div className="text-xs text-muted-foreground">{row.entered_part_number}</div></TableCell><TableCell className="max-w-72 text-sm">{[row.characteristic_name, row.characteristic_value, row.characteristic_unit].filter(Boolean).join(' · ') || row.additional_details || '—'}</TableCell><TableCell>{Number(row.quantity)}{row.quantity_basis ? <div className="text-xs text-muted-foreground">{row.quantity_basis}</div> : null}</TableCell>
        <TableCell><Select value={row.classification || 'unclassified'} onValueChange={(classification) => updateItem.mutate({ row, patch: { classification } })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(classificationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></TableCell>
        <TableCell><Checkbox aria-label={`Include ${row.item_name} in BOM comparison`} checked={Boolean(row.include_in_bom_comparison)} onCheckedChange={(checked) => updateItem.mutate({ row, patch: { includeInBomComparison: Boolean(checked) } })} /></TableCell>
        <TableCell>{!row.include_in_bom_comparison ? <Badge variant="outline">Not checked</Badge> : row.inventory_match_state === 'found' ? <div className="flex items-center gap-2"><Checkbox checked={row.inventory_match_confirmed} onCheckedChange={(checked) => toggleMatch.mutate({ row, checked: Boolean(checked) })} /><div><Badge className="bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" />Found</Badge><div className="mt-1 text-xs font-medium">{row.inventory_part_number}</div></div></div> : row.inventory_match_state === 'possible' ? <Button size="sm" variant="outline" className="border-amber-500 text-amber-700" onClick={() => openVerification(row)}><CircleAlert className="mr-1 h-3 w-3" />Possible—verify</Button> : <Badge variant="secondary">Not found</Badge>}</TableCell>
        <TableCell><div className="flex items-center gap-2">{row.photos?.slice(0, 3).map((photo: any) => <img key={photo.id} src={photo.file_url} alt={row.item_name} className="h-10 w-10 rounded object-cover" />)}<label className="cursor-pointer" title={`Attach photo to ${row.item_name}`}><Input type="file" accept="image/*" className="hidden" onChange={(event) => event.target.files?.[0] && uploadPhoto(event.target.files[0], row.id)} /><Camera className="h-5 w-5 text-muted-foreground" /></label></div></TableCell>
      </TableRow>)}</TableBody></Table></Card></TabsContent>
      <TabsContent value="consolidated"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{consolidated.map((row: any) => <Card key={`${row.item_name}-${row.entered_part_number}`}><CardContent className="p-5"><div className="flex justify-between gap-3"><div><div className="font-semibold">{row.item_name}</div><div className="text-xs text-muted-foreground">{row.inventory_part_number || row.entered_part_number}</div></div><Badge>{row.total} total</Badge></div><div className="mt-3 space-y-2 text-sm">{row.occurrences.map((occurrence: any) => <div key={occurrence.id} className="rounded-md bg-muted p-2">{Number(occurrence.quantity)} × {occurrence.assembly_name || 'No component'} · {occurrence.physical_location || 'No location'}</div>)}</div></CardContent></Card>)}</div></TabsContent>
      <TabsContent value="bom"><Card><CardHeader><CardTitle className="flex items-center gap-2"><PackageSearch className="h-5 w-5" />Latest released BOM {comparison?.revision && <Badge>Rev {comparison.revision}</Badge>}</CardTitle></CardHeader><CardContent>{!comparison?.revision ? <p className="text-muted-foreground">No latest released BOM was found for product part number “{details.product_part_number || 'not entered'}”.</p> : <div className="grid gap-5 md:grid-cols-3"><Comparison title="Observed, missing from BOM" items={comparison.missingFromBom} render={(value: any) => value.item_name} /><Comparison title="BOM item not observed" items={comparison.bomOnly} render={(value: any) => `${value.child_name_snapshot || value.child_part_ag_number} (${value.child_part_ag_number})`} /><Comparison title="Possible match—verify" items={comparison.possible} render={(value: any) => `${value.item.item_name} ↔ ${value.bomLine.child_name_snapshot || value.bomLine.child_part_ag_number}`} /></div>}</CardContent></Card></TabsContent>
    </Tabs>
    <CaptureDialog open={captureOpen} onOpenChange={setCaptureOpen} item={item} setItem={setItem} values={values} firstFieldRef={firstCaptureFieldRef} setObservationKind={setObservationKind} pending={addItem.isPending} capture={(keepOpen: boolean) => addItem.mutate({ payload: item, keepOpen })} />
    <Dialog open={Boolean(verifyItem)} onOpenChange={(open) => !open && setVerifyItem(null)}><DialogContent><DialogHeader><DialogTitle>Verify inventory match</DialogTitle><DialogDescription>Choose the inventory item matching “{verifyItem?.item_name}”.</DialogDescription></DialogHeader><div className="space-y-2">{matchOptions.map((option: any) => <button key={option.id} className="flex w-full cursor-pointer items-center justify-between rounded-md border p-3 text-left transition-colors hover:border-primary" onClick={() => { toggleMatch.mutate({ row: { ...verifyItem, inventory_item_id: option.id }, checked: true }); setVerifyItem(null); }}><span><span className="font-medium">{option.name}</span><span className="block text-xs text-muted-foreground">{option.description}</span></span><Badge variant="outline">{option.ag_part_number}</Badge></button>)}</div></DialogContent></Dialog>
  </div>;
}

function CaptureDialog({ open, onOpenChange, item, setItem, values, firstFieldRef, setObservationKind, pending, capture }: any) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Capture an observation</DialogTitle><DialogDescription>Tab through the fields. Saving and continuing keeps the location and component ready for the next entry.</DialogDescription></DialogHeader>
    <div className="grid gap-4 py-2 md:grid-cols-3">
      <div className="space-y-1.5"><Label htmlFor="capture-location">1. Physical location</Label><Input ref={firstFieldRef} id="capture-location" list="capture-location-suggestions" value={item.physicalLocation} onChange={(event) => setItem({ ...item, physicalLocation: event.target.value })} placeholder="Front, middle, underside…" /><datalist id="capture-location-suggestions">{values('locations').map((option: string) => <option key={option} value={option} />)}</datalist></div>
      <SuggestionField id="capture-component" label="2. Component / assembly" placeholder="Nose, leg, housing…" options={values('assemblies')} value={item.assemblyName} onChange={(value: string) => setItem({ ...item, assemblyName: value })} />
      <SuggestionField id="capture-parent" label="3. Parent component (optional)" placeholder="Body, front assembly…" options={values('assemblies')} value={item.parentAssemblyName} onChange={(value: string) => setItem({ ...item, parentAssemblyName: value })} />
      <SuggestionField id="capture-item" label="4. Observed item / feature" placeholder="Nostril, toes, screw…" options={values('names')} value={item.itemName} onChange={(value: string) => setItem({ ...item, itemName: value })} />
      <div className="space-y-1.5"><Label>5. Observation type</Label><Select value={item.observationKind} onValueChange={setObservationKind}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="part">Part or component</SelectItem><SelectItem value="characteristic">Feature or characteristic</SelectItem></SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-2"><div className="space-y-1.5"><Label htmlFor="capture-quantity">6. Quantity</Label><Input id="capture-quantity" type="number" min="0.001" step="any" value={item.quantity} onChange={(event) => setItem({ ...item, quantity: Number(event.target.value) })} /></div><div className="space-y-1.5"><Label htmlFor="capture-basis">Basis</Label><Input id="capture-basis" value={item.quantityBasis} onChange={(event) => setItem({ ...item, quantityBasis: event.target.value })} placeholder="legs, per side…" /></div></div>
      <SuggestionField id="capture-characteristic" label="7. Characteristic" placeholder="Diameter, count, size…" options={values('characteristics')} value={item.characteristicName} onChange={(value: string) => setItem({ ...item, characteristicName: value })} />
      <div className="space-y-1.5"><Label htmlFor="capture-value">8. Value</Label><Input id="capture-value" value={item.characteristicValue} onChange={(event) => setItem({ ...item, characteristicValue: event.target.value })} placeholder="2, 5, large…" /></div>
      <SuggestionField id="capture-unit" label="9. Unit / qualifier" placeholder="in, per leg, each…" options={values('units')} value={item.characteristicUnit} onChange={(value: string) => setItem({ ...item, characteristicUnit: value })} />
      <div className="space-y-1.5"><Label>Classification (can be sorted later)</Label><Select value={item.classification} onValueChange={(classification) => setItem({ ...item, classification })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(classificationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <SuggestionField id="capture-part-number" label="Observed part number (optional)" placeholder="Use as a last resort" options={values('partNumbers')} value={item.enteredPartNumber} onChange={(value: string) => setItem({ ...item, enteredPartNumber: value })} />
      <div className="flex items-end pb-2"><label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={item.includeInBomComparison} onCheckedChange={(checked) => setItem({ ...item, includeInBomComparison: Boolean(checked) })} />Include in inventory/BOM comparison</label></div>
      <div className="space-y-1.5"><Label htmlFor="capture-thread">Thread size (optional)</Label><Input id="capture-thread" value={item.threadSize} onChange={(event) => setItem({ ...item, threadSize: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="capture-length">Length (optional)</Label><Input id="capture-length" value={item.length} onChange={(event) => setItem({ ...item, length: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="capture-head">Head / drive style (optional)</Label><Input id="capture-head" value={item.headStyle} onChange={(event) => setItem({ ...item, headStyle: event.target.value })} /></div>
      <div className="space-y-1.5 md:col-span-2"><Label htmlFor="capture-details">Additional details</Label><Input id="capture-details" value={item.additionalDetails} onChange={(event) => setItem({ ...item, additionalDetails: event.target.value })} placeholder="Shape, finish, material, identifying details…" /></div>
      <div className="space-y-1.5"><Label htmlFor="capture-material">Material / finish</Label><Input id="capture-material" value={item.materialFinish} onChange={(event) => setItem({ ...item, materialFinish: event.target.value })} /></div>
      <div className="space-y-1.5 md:col-span-3"><Label htmlFor="capture-notes">Notes</Label><Textarea id="capture-notes" value={item.notes} onChange={(event) => setItem({ ...item, notes: event.target.value })} placeholder="Anything else observed at this occurrence" /></div>
    </div>
    <DialogFooter className="gap-2 sm:justify-between"><p className="mr-auto text-xs text-muted-foreground">Location and component stay filled after “Capture & next.”</p><Button variant="outline" disabled={!item.itemName || pending} onClick={() => capture(false)}>Capture & close</Button><Button disabled={!item.itemName || pending} onClick={() => capture(true)}><Plus className="mr-2 h-4 w-4" />Capture & next</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function Comparison({ title, items, render }: any) {
  return <div><h3 className="mb-2 font-semibold">{title} <Badge variant="secondary">{items?.length ?? 0}</Badge></h3><div className="space-y-2">{(items ?? []).map((item: any, index: number) => <div key={index} className="rounded-md border p-3 text-sm">{render(item)}</div>)}{!items?.length && <p className="text-sm text-muted-foreground">None</p>}</div></div>;
}
