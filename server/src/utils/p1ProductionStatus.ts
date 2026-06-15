export type P1ProductionStatus = 'PENDING' | 'LAID_UP' | 'SHIPPED' | 'CANCELLED';

type DeriveP1ProductionStatusInput = {
  currentDepartment?: string | null;
  isFulfilled?: boolean | null;
  currentStatus?: string | null;
  preserveCancelled?: boolean;
};

const CLOSED_PO_STATUSES = new Set(['CLOSED', 'COMPLETE', 'COMPLETED']);

function normalizeStatus(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

function normalizeDepartment(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

export function deriveP1ProductionStatus({
  currentDepartment,
  isFulfilled,
  currentStatus,
  preserveCancelled = true,
}: DeriveP1ProductionStatusInput): P1ProductionStatus {
  if (preserveCancelled && normalizeStatus(currentStatus) === 'CANCELLED') {
    return 'CANCELLED';
  }

  const department = normalizeDepartment(currentDepartment);

  if (department === 'p1 production queue') {
    return 'PENDING';
  }

  if (!department) {
    return isFulfilled ? 'SHIPPED' : 'PENDING';
  }

  if (department === 'fulfilled' || department === 'shipped') {
    return 'SHIPPED';
  }

  return 'LAID_UP';
}

export function isClosedP1PurchaseOrderStatus(status?: string | null): boolean {
  return CLOSED_PO_STATUSES.has(normalizeStatus(status));
}

export function isActiveP1ProductionStatus(status?: string | null): boolean {
  const normalized = normalizeStatus(status);
  return normalized !== '' && !['SHIPPED', 'CANCELLED', 'CANCELED', 'SCRAPPED'].includes(normalized);
}
