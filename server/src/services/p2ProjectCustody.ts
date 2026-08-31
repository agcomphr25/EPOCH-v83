export interface P2ReceiptCustodyContext {
  isP2: boolean;
  poLineProjectId: string | null;
  targetProjectId: string | null;
}

const normalizedId = (value: unknown): string | null => {
  const result = String(value ?? '')
    .trim()
    .toLowerCase();
  return result || null;
};

export function getP2ReceiptCustodyError(
  context: P2ReceiptCustodyContext
): string | null {
  if (!context.isP2) return null;

  const poLineProjectId = normalizedId(context.poLineProjectId);
  const targetProjectId = normalizedId(context.targetProjectId);
  if (!poLineProjectId) {
    return 'P2 receiving is blocked because the vendor PO line does not have a project assigned.';
  }
  if (!targetProjectId) {
    return 'P2 receiving is blocked because the received unit does not have a project assigned.';
  }
  if (poLineProjectId !== targetProjectId) {
    return 'P2 receiving is blocked because the received unit project does not match the vendor PO line project.';
  }
  return null;
}

export function canAdministerP2ProjectCustody(role: unknown): boolean {
  return (
    String(role ?? '')
      .trim()
      .toUpperCase() === 'ADMIN'
  );
}
