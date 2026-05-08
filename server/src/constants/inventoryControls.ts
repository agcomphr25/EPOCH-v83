export const CONTROLLED_INVENTORY_STATUSES = [
  'QUARANTINE',
  'REJECTED',
  'SCRAPPED',
  'EXPIRED',
  'HOLD',
] as const;

export type ControlledInventoryStatus = typeof CONTROLLED_INVENTORY_STATUSES[number];

export type InventoryStatusAction =
  | 'view'
  | 'move'
  | 'issue'
  | 'return'
  | 'reserve'
  | 'consume'
  | 'scrap'
  | 'mrb'
  | 'split'
  | 'adjust'
  | 'status_change';

export const INVENTORY_STATUS_ACTION_POLICY: Record<
  ControlledInventoryStatus,
  {
    allowedActions: InventoryStatusAction[];
    requiresApproval?: boolean;
    auditRule: string;
  }
> = {
  QUARANTINE: {
    allowedActions: ['view', 'status_change'],
    auditRule: 'Quarantined material is view-only until Quality changes disposition.',
  },
  REJECTED: {
    allowedActions: ['view', 'scrap', 'mrb'],
    auditRule: 'Rejected material can only move through scrap or MRB disposition.',
  },
  SCRAPPED: {
    allowedActions: ['view'],
    auditRule: 'Scrapped material is final and cannot move or be allocated.',
  },
  EXPIRED: {
    allowedActions: ['view', 'move', 'return', 'scrap', 'mrb', 'adjust', 'status_change'],
    auditRule: 'Expired material cannot be allocated, reserved, issued, or consumed.',
  },
  HOLD: {
    allowedActions: ['view', 'move', 'issue', 'return', 'reserve', 'consume', 'scrap', 'mrb', 'split', 'adjust', 'status_change'],
    requiresApproval: true,
    auditRule: 'Held material requires an approval reference for every non-view action.',
  },
};

export function normalizeInventoryStatus(status: unknown): string {
  return String(status ?? '').trim().toUpperCase();
}

export function isControlledInventoryStatus(status: unknown): status is ControlledInventoryStatus {
  return (CONTROLLED_INVENTORY_STATUSES as readonly string[]).includes(normalizeInventoryStatus(status));
}

export function getInventoryStatusPolicy(status: unknown) {
  const normalized = normalizeInventoryStatus(status);
  return isControlledInventoryStatus(normalized)
    ? INVENTORY_STATUS_ACTION_POLICY[normalized]
    : null;
}

export function validateInventoryStatusAction(
  status: unknown,
  action: InventoryStatusAction,
  approvalReference?: unknown,
): { ok: true } | { ok: false; code: 'ACTION_BLOCKED' | 'APPROVAL_REQUIRED'; message: string } {
  const normalized = normalizeInventoryStatus(status);
  const policy = getInventoryStatusPolicy(normalized);
  if (!policy) return { ok: true };

  if (!policy.allowedActions.includes(action)) {
    return {
      ok: false,
      code: 'ACTION_BLOCKED',
      message: `${action} is not allowed while inventory status is ${normalized}. ${policy.auditRule}`,
    };
  }

  if (policy.requiresApproval && action !== 'view' && !approvalReference) {
    return {
      ok: false,
      code: 'APPROVAL_REQUIRED',
      message: `${normalized} inventory requires an approval reference before ${action}.`,
    };
  }

  return { ok: true };
}

export type TraceabilityField = 'ICN' | 'lot' | 'expiration' | 'out-time' | 'serial' | 'batch number' | 'cert package';

export const MATERIAL_TRACEABILITY_REQUIREMENTS: Array<{
  department: string;
  requiredTraceability: TraceabilityField[];
}> = [
  { department: 'Layup', requiredTraceability: ['ICN', 'lot', 'expiration', 'out-time'] },
  { department: 'CNC', requiredTraceability: ['serial'] },
  { department: 'Finish', requiredTraceability: ['batch number'] },
  { department: 'QC', requiredTraceability: ['cert package'] },
];
