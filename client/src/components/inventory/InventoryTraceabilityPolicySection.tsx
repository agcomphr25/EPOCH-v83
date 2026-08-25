import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiRequest } from '@/lib/queryClient';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  itemId?: number | null;
  itemType?: string | null;
  manufacturedCategory?: string | null;
  manufacturingLevel?: string | null;
  unitOfMeasure?: string | null;
  shelfLifeControlled?: boolean;
  requiresSds?: boolean;
  requiresTds?: boolean;
  requiresCoc?: boolean;
  requiresTestReport?: boolean;
};

const policyLabels: Record<string, string> = {
  SERIAL: 'Each unit has its own controlled identity',
  LOT: 'Quantity is linked to a material lot',
  BATCH: 'Quantity is linked to a controlled batch',
  STANDARD_QUANTITY: 'Quantity is controlled without individual barcodes',
  CUSTOMER_SUPPLIED: 'Customer ownership and custody are controlled',
  NONE_APPROVED: 'No traceability, with approved justification',
};

function suggestedClassification(props: Props) {
  if (props.itemType === 'MANUFACTURED') {
    if (props.manufacturingLevel === 'FINAL') return 'ASSEMBLY';
    if (props.manufacturingLevel === 'INTERMEDIATE' || props.manufacturedCategory === 'SUB_ASSEMBLY') return 'SUBASSEMBLY';
    return 'MANUFACTURED_COMPONENT';
  }
  return 'PURCHASED_COMPONENT';
}

export default function InventoryTraceabilityPolicySection(props: Props) {
  const enabled = import.meta.env.VITE_INVENTORY_TRACEABILITY_POLICY_READS_ENABLED === 'true';
  const writesEnabled = import.meta.env.VITE_INVENTORY_TRACEABILITY_POLICY_WRITES_ENABLED === 'true';
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [form, setForm] = useState({
    policyType: 'STANDARD_QUANTITY',
    itemClassification: suggestedClassification(props),
    partConfigurationRevision: '',
    unitOfMeasure: props.unitOfMeasure || 'EA',
    outputSerializationRequired: false,
    individualInputScanRequired: false,
    lotScanRequired: false,
    batchScanRequired: false,
    quantityEntryRequired: true,
    divisibleInventoryPermitted: false,
    shelfLifeControlled: Boolean(props.shelfLifeControlled),
    heatLotRequired: false,
    dateCodeRequired: false,
    cocRequired: Boolean(props.requiresCoc),
    materialCertificationRequired: false,
    testReportRequired: Boolean(props.requiresTestReport),
    sdsRequired: Boolean(props.requiresSds),
    tdsRequired: Boolean(props.requiresTds),
    receivingInspectionRequired: false,
    customerCustodyRequired: false,
    storageInstructions: '',
    noTraceabilityJustification: '',
  });
  const queryKey = ['/api/configuration-control/inventory-items', props.itemId, 'traceability-policies'];
  const policies = useQuery({
    queryKey,
    queryFn: () => apiRequest(`/api/configuration-control/inventory-items/${props.itemId}/traceability-policies`),
    enabled: enabled && Boolean(props.itemId),
  });
  const history = Array.isArray((policies.data as any)?.policies) ? (policies.data as any).policies : [];
  const current = history[0];

  useEffect(() => {
    setForm((previous) => ({
      ...previous,
      itemClassification: suggestedClassification(props),
      unitOfMeasure: props.unitOfMeasure || previous.unitOfMeasure || 'EA',
      shelfLifeControlled: Boolean(props.shelfLifeControlled),
      cocRequired: Boolean(props.requiresCoc),
      testReportRequired: Boolean(props.requiresTestReport),
      sdsRequired: Boolean(props.requiresSds),
      tdsRequired: Boolean(props.requiresTds),
    }));
    setConfirmed(false);
  }, [props.itemId, props.itemType, props.manufacturedCategory, props.manufacturingLevel,
    props.unitOfMeasure, props.shelfLifeControlled, props.requiresCoc, props.requiresTestReport,
    props.requiresSds, props.requiresTds]);

  const missing = useMemo(() => {
    const values: string[] = [];
    if (!form.partConfigurationRevision.trim()) values.push('part/configuration revision');
    if (!form.unitOfMeasure.trim()) values.push('unit of measure');
    if (form.policyType === 'NONE_APPROVED' && !form.noTraceabilityJustification.trim()) values.push('approved no-traceability justification');
    return values;
  }, [form]);

  const createDraft = useMutation({
    mutationFn: () => {
      const { storageInstructions, ...policy } = form;
      return apiRequest(`/api/configuration-control/inventory-items/${props.itemId}/traceability-policies`, {
        method: 'POST',
        body: {
          ...policy,
          storageRequirements: storageInstructions.trim() ? { instructions: storageInstructions.trim() } : {},
          configurationEffectivity: { type: 'PART_CONFIGURATION_REVISION', revision: form.partConfigurationRevision.trim() },
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setConfirmed(false);
      toast.success('Traceability policy draft created. It is not released.');
    },
    onError: (error: any) => toast.error(error?.message || 'Could not create traceability policy draft.'),
  });

  if (!enabled) return null;
  return (
    <section className="space-y-4 rounded-lg border p-4" data-testid="inventory-traceability-policy-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold">Traceability policy</h4>
          <p className="text-sm text-muted-foreground">Define how this Inventory Item must be identified and received. Suggested values are never saved without confirmation.</p>
        </div>
        <Badge variant={current?.status === 'RELEASED' ? 'default' : 'secondary'}>
          {current ? `${current.status} · Revision ${current.revision_number}` : 'Missing'}
        </Badge>
      </div>
      {!props.itemId && <Alert><AlertTitle>Save the Inventory Item first</AlertTitle><AlertDescription>A stable Inventory Item ID is required before a controlled policy draft can be created.</AlertDescription></Alert>}
      {props.itemId && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>How is this item tracked?</Label><Select value={form.policyType} onValueChange={(value) => setForm((p) => ({ ...p, policyType: value, outputSerializationRequired: value === 'SERIAL', lotScanRequired: value === 'LOT', batchScanRequired: value === 'BATCH', quantityEntryRequired: value === 'STANDARD_QUANTITY', customerCustodyRequired: value === 'CUSTOMER_SUPPLIED' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(policyLabels).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Item classification</Label><Select value={form.itemClassification} onValueChange={(value) => setForm((p) => ({ ...p, itemClassification: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['RAW_MATERIAL','PURCHASED_COMPONENT','MANUFACTURED_COMPONENT','SUBASSEMBLY','ASSEMBLY','CUSTOMER_SUPPLIED','CONSUMABLE','TOOLING','NON_INVENTORY_SERVICE'].map((value) => <SelectItem key={value} value={value}>{value.replaceAll('_',' ')}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Part/configuration revision</Label><Input value={form.partConfigurationRevision} onChange={(event) => setForm((p) => ({ ...p, partConfigurationRevision: event.target.value }))} placeholder="Example: A" /></div>
            <div><Label>Unit of measure</Label><Input value={form.unitOfMeasure} onChange={(event) => setForm((p) => ({ ...p, unitOfMeasure: event.target.value }))} /></div>
          </div>
          <div><Label>Storage requirements</Label><Textarea value={form.storageInstructions} onChange={(event) => setForm((p) => ({ ...p, storageInstructions: event.target.value }))} placeholder="Optional handling, temperature, humidity, or segregation instructions" /></div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['outputSerializationRequired','Does each unit need its own barcode?'],
              ['individualInputScanRequired','Must each input unit be scanned?'],
              ['lotScanRequired','Must a lot be scanned?'],
              ['batchScanRequired','Must a batch be scanned?'],
              ['quantityEntryRequired','Must quantity be entered?'],
              ['divisibleInventoryPermitted','Can partial quantities be used?'],
              ['shelfLifeControlled','Does it expire?'],
              ['heatLotRequired','Is a heat lot required?'],
              ['dateCodeRequired','Is a date code required?'],
              ['cocRequired','Certificate of Conformance required?'],
              ['materialCertificationRequired','Material certification required?'],
              ['testReportRequired','Test report required?'],
              ['sdsRequired','SDS required?'],['tdsRequired','TDS required?'],
              ['receivingInspectionRequired','Is receiving inspection required?'],
              ['customerCustodyRequired','Is customer custody tracking required?'],
            ].map(([key,label]) => <label key={key} className="flex items-center gap-2 text-sm"><Checkbox checked={Boolean((form as any)[key])} onCheckedChange={(checked) => setForm((p) => ({ ...p, [key]: checked === true }))} />{label}</label>)}
          </div>
          {form.policyType === 'NONE_APPROVED' && <div><Label>Why is no traceability acceptable?</Label><Textarea value={form.noTraceabilityJustification} onChange={(event) => setForm((p) => ({ ...p, noTraceabilityJustification: event.target.value }))} /></div>}
          {missing.length > 0 && <Alert variant="destructive"><AlertTitle>Information missing</AlertTitle><AlertDescription>Add {missing.join(' and ')} before creating the draft.</AlertDescription></Alert>}
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} /><span>I reviewed these suggested values. Create a controlled draft only; do not release it.</span></label>
          <Button type="button" disabled={!writesEnabled || !confirmed || missing.length > 0 || createDraft.isPending} onClick={() => createDraft.mutate()}>Create traceability policy draft</Button>
          {!writesEnabled && <p className="text-xs text-muted-foreground">Policy authoring is disabled by configuration.</p>}
        </>
      )}
    </section>
  );
}
