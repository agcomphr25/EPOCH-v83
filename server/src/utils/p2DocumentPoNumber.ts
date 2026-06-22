export function formatP2DocumentPoNumber(poNumber: string | null | undefined): string | null {
  if (!poNumber) return null;
  const trimmed = poNumber.trim();
  if (!trimmed) return null;
  return trimmed.replace(/(?:[-\s]+R[A-Z]+)$/i, '');
}
