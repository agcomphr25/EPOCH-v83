export function formatP2CustomerSerialNumber(serialNumber: string | null | undefined): string {
  const trimmed = String(serialNumber ?? '').trim();
  if (!trimmed) return '';

  return trimmed.replace(/-(?:rma-\d+|r\d+)$/i, '');
}

export function formatP2CustomerSerialNumbers(serialNumbers: unknown): string[] {
  if (!Array.isArray(serialNumbers)) return [];

  return serialNumbers
    .map((serialNumber) =>
      typeof serialNumber === 'string'
        ? formatP2CustomerSerialNumber(serialNumber)
        : ''
    )
    .filter((serialNumber) => serialNumber.length > 0);
}
