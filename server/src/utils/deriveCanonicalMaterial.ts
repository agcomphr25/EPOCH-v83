const MATERIAL_PREFIX_MAP: Record<string, string> = {
  'cf_': 'Carbon Fiber',
  'fg_': 'Fiberglass',
  'm1a_carbon': 'Carbon Fiber',
  'm1a_fiberglass': 'Fiberglass',
  'apr_': 'APR',
};

export function deriveCanonicalMaterial(stockModelId: string): string {
  if (!stockModelId) return '';

  const lower = stockModelId.toLowerCase();

  // Metal accessory SKU prefixes — always return Metal Accessory
  if (/^ag[-_]m5/i.test(stockModelId))  return 'Metal Accessory';
  if (/^ag[-_]bdl/i.test(stockModelId)) return 'Metal Accessory';
  if (/^ag[-_]bm/i.test(stockModelId))  return 'Metal Accessory';
  if (/^agm5/i.test(stockModelId)) return 'Metal Accessory';
  if (/^agbdl/i.test(stockModelId)) return 'Metal Accessory';
  if (/^agbm/i.test(stockModelId)) return 'Metal Accessory';
  if (/^agpic/i.test(stockModelId)) return 'Metal Accessory';
  if (/^agarca/i.test(stockModelId)) return 'Metal Accessory';

  if (lower.startsWith('cf_')) return 'Carbon Fiber';
  if (lower.startsWith('fg_')) return 'Fiberglass';
  if (lower === 'm1a_carbon') return 'Carbon Fiber';
  if (lower === 'm1a_fiberglass') return 'Fiberglass';
  if (lower.startsWith('m1a_')) return 'M1A';
  if (lower.startsWith('apr_')) return 'APR';
  if (lower.includes('carbon')) return 'Carbon Fiber';
  if (lower.includes('fiberglass') || lower.includes('_fg')) return 'Fiberglass';
  if (lower.startsWith('mesa_')) return 'Fiberglass';

  // Tikka variants without a cf_/fg_ prefix: if they end with _fg they're Fiberglass (caught above).
  // All other bare Tikka models (privateer-tikka, alpine_hunter_tikka, etc.) are Carbon Fiber.
  if (lower.includes('tikka') && !lower.startsWith('mesa_')) return 'Carbon Fiber';

  // AG Composites part-number conventions (e.g. AG-FG-AHV105-CDN, AG-CRB-P105-SR)
  // AG-FG-* → Fiberglass; AG-CRB-* (Carbon Rifle Blank) → Carbon Fiber; AG-CF-* → Carbon Fiber
  if (lower.includes('-fg-') || lower.startsWith('ag-fg')) return 'Fiberglass';
  if (lower.includes('-crb-') || lower.startsWith('ag-crb')) return 'Carbon Fiber';
  if (lower.includes('-cf-') || lower.startsWith('ag-cf')) return 'Carbon Fiber';

  return '';
}
