export const DEFAULT_VENDOR_PO_RETURN_EMAIL = 'glenn@agadvanced.com';
export const DEFAULT_VENDOR_PO_CONTACT_NAME = 'Glenn Jones';
const LEGACY_VENDOR_PO_RETURN_EMAILS = new Set(['laurie.tandy@agadvanced.com']);
const LEGACY_VENDOR_PO_CONTACT_NAMES = new Set(['laurie tandy']);

export function resolveVendorPoReturnEmail(settings?: { contactEmail?: string | null }): string {
  const configuredEmail = settings?.contactEmail?.trim();
  if (!configuredEmail) return DEFAULT_VENDOR_PO_RETURN_EMAIL;
  if (LEGACY_VENDOR_PO_RETURN_EMAILS.has(configuredEmail.toLowerCase())) {
    return DEFAULT_VENDOR_PO_RETURN_EMAIL;
  }
  return configuredEmail;
}

export function resolveVendorPoContactName(settings?: { contactName?: string | null }): string {
  const configuredName = settings?.contactName?.trim();
  if (!configuredName) return DEFAULT_VENDOR_PO_CONTACT_NAME;
  if (LEGACY_VENDOR_PO_CONTACT_NAMES.has(configuredName.toLowerCase())) {
    return DEFAULT_VENDOR_PO_CONTACT_NAME;
  }
  return configuredName;
}

export function appendUniqueEmail(recipients: string[], email?: string | null): string[] {
  const normalized = email?.trim();
  if (!normalized) return recipients;
  if (recipients.some((recipient) => recipient.toLowerCase() === normalized.toLowerCase())) {
    return recipients;
  }
  return [...recipients, normalized];
}
