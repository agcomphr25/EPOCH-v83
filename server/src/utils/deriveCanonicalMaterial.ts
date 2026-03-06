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

  return '';
}
