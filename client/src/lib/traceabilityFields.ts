export interface TraceabilityFieldDescriptor {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number';
  required: boolean;
}

const FIELD_MAP: Record<string, TraceabilityFieldDescriptor> = {
  lotNumber: { key: 'lotNumber', label: 'Lot Number', type: 'text', required: false },
  batchNumber: { key: 'batchNumber', label: 'Batch Number', type: 'text', required: false },
  serialNumber: { key: 'serialNumber', label: 'Serial Number', type: 'text', required: false },
  internalControlNumber: { key: 'internalControlNumber', label: 'Internal Control Number (ICN)', type: 'text', required: false },
  rollNumber: { key: 'rollNumber', label: 'Roll Number', type: 'text', required: false },
  heatLot: { key: 'heatLot', label: 'Heat Lot', type: 'text', required: false },
  manufactureDate: { key: 'manufactureDate', label: 'Manufacture Date', type: 'date', required: false },
  expirationDate: { key: 'expirationDate', label: 'Expiration Date', type: 'date', required: false },
  shelfLifeDays: { key: 'shelfLifeDays', label: 'Shelf Life (days)', type: 'number', required: false },
  certReference: { key: 'certReference', label: 'Cert Reference', type: 'text', required: false },
  // Legacy key mappings
  batchLotNumber: { key: 'batchNumber', label: 'Batch/Lot Number', type: 'text', required: false },
  aluminumHeat: { key: 'heatLot', label: 'Aluminum Heat #', type: 'text', required: false },
  supplierBatchLotC: { key: 'batchNumber', label: 'Batch/Lot Number', type: 'text', required: false },
  manufactureRoll: { key: 'rollNumber', label: 'Roll Number', type: 'text', required: false },
};

// Item type → default traceability field set
const ITEM_TYPE_DEFAULTS: Record<string, string[]> = {
  prepreg: ['lotNumber', 'batchNumber', 'manufactureDate', 'expirationDate', 'rollNumber'],
  fabric: ['lotNumber', 'batchNumber', 'manufactureDate', 'expirationDate', 'rollNumber'],
  resin: ['lotNumber', 'batchNumber', 'expirationDate', 'shelfLifeDays'],
  aluminum: ['heatLot', 'certReference', 'serialNumber'],
  steel: ['heatLot', 'certReference'],
  chemical: ['lotNumber', 'batchNumber', 'expirationDate', 'shelfLifeDays'],
  adhesive: ['lotNumber', 'batchNumber', 'expirationDate', 'shelfLifeDays'],
  fastener: ['lotNumber', 'certReference'],
  purchased_part: ['serialNumber', 'certReference'],
  hardware: ['lotNumber', 'certReference'],
};

const DEFAULT_FIELDS = ['lotNumber', 'batchNumber', 'expirationDate'];

export function getTraceabilityFields(
  itemType?: string | null,
  configuredFields?: string[] | null,
  traceabilityRequired?: boolean
): TraceabilityFieldDescriptor[] {
  let fieldKeys: string[] = [];

  if (configuredFields && configuredFields.length > 0) {
    fieldKeys = configuredFields;
  } else if (itemType) {
    const normalized = itemType.toLowerCase().replace(/[^a-z_]/g, '_');
    // Try exact match first
    fieldKeys = ITEM_TYPE_DEFAULTS[normalized] ??
      ITEM_TYPE_DEFAULTS[Object.keys(ITEM_TYPE_DEFAULTS).find(k => normalized.includes(k)) ?? ''] ??
      (traceabilityRequired ? DEFAULT_FIELDS : []);
  } else if (traceabilityRequired) {
    fieldKeys = DEFAULT_FIELDS;
  }

  // Deduplicate while preserving canonical key
  const seen = new Set<string>();
  const result: TraceabilityFieldDescriptor[] = [];
  for (const key of fieldKeys) {
    const desc = FIELD_MAP[key];
    if (!desc || seen.has(desc.key)) continue;
    seen.add(desc.key);
    result.push({ ...desc, required: traceabilityRequired ?? false });
  }

  return result;
}

export const ALL_TRACEABILITY_FIELDS = Object.values(FIELD_MAP).filter(
  (f, i, arr) => arr.findIndex(x => x.key === f.key) === i
);
