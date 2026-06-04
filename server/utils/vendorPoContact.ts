export const DEFAULT_VENDOR_PO_RETURN_EMAIL = 'glenn@agadvanced.com';

export function resolveVendorPoReturnEmail(settings?: { contactEmail?: string | null }): string {
  const configuredEmail = settings?.contactEmail?.trim();
  return configuredEmail || DEFAULT_VENDOR_PO_RETURN_EMAIL;
}

export function appendUniqueEmail(recipients: string[], email?: string | null): string[] {
  const normalized = email?.trim();
  if (!normalized) return recipients;
  if (recipients.some((recipient) => recipient.toLowerCase() === normalized.toLowerCase())) {
    return recipients;
  }
  return [...recipients, normalized];
}
