const HEX_BADGE_PATTERN = /^[0-9a-f-]{16,}$/i;
const EMP_CODE_PATTERN = /^EMP\d+$/i;
const ADMIN_FORCE_SIGN = /^ADMIN_FORCE_SIGN$/i;

export function isUnresolvedSignerValue(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  if (ADMIN_FORCE_SIGN.test(trimmed)) return true;
  const compact = trimmed.replace(/-/g, '');
  if (HEX_BADGE_PATTERN.test(trimmed) || HEX_BADGE_PATTERN.test(compact)) return true;
  if (EMP_CODE_PATTERN.test(trimmed)) return true;
  return false;
}

export function displaySignerName(
  signedByName: string | null | undefined,
  signedBy?: string | null | undefined,
  fallback: string = 'Unknown signer',
): string {
  if (!isUnresolvedSignerValue(signedByName)) return String(signedByName).trim();
  if (!isUnresolvedSignerValue(signedBy)) return String(signedBy).trim();
  return fallback;
}
