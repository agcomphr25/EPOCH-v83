export const ALL_ORDERS_STATUS = {
  FINALIZED: 'FINALIZED',
  IN_PROGRESS: 'IN_PROGRESS',
  READY_TO_SHIP: 'READY_TO_SHIP',
  CANCELLED: 'CANCELLED',
  FULFILLED: 'FULFILLED',
  PENDING_SIGNATURE: 'PENDING_SIGNATURE',
} as const;

export const ALL_ORDERS_DEPARTMENT = {
  P1_PRODUCTION_QUEUE: 'P1 Production Queue',
  SHIPPING: 'Shipping',
  CANCELLED: 'Cancelled',
  SHIPPING_MANAGEMENT: 'Shipping Management',
  AWAITING_CUSTOMER_SIGNATURE: 'Awaiting Customer Signature',
} as const;

export type AllOrdersStatus =
  (typeof ALL_ORDERS_STATUS)[keyof typeof ALL_ORDERS_STATUS];

export type CanonicalAllOrdersState = {
  status: AllOrdersStatus;
  currentDepartment: string;
};

export type AllOrdersStateInput = {
  status?: string | null;
  currentDepartment?: string | null;
  isCancelled?: boolean | null;
};

const FULFILLED_STATUS_ALIASES = new Set(['FULFILLED', 'SHIPPED']);
const CANCELLED_STATUS_ALIASES = new Set(['CANCELLED', 'SCRAPPED']);

export function normalizeAllOrdersStatus(status: string | null | undefined): string {
  return String(status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function deriveCanonicalAllOrdersState(
  input: AllOrdersStateInput
): CanonicalAllOrdersState {
  const status = normalizeAllOrdersStatus(input.status);
  const currentDepartment = String(input.currentDepartment || '').trim();

  if (input.isCancelled || CANCELLED_STATUS_ALIASES.has(status) || currentDepartment === ALL_ORDERS_DEPARTMENT.CANCELLED) {
    return {
      status: ALL_ORDERS_STATUS.CANCELLED,
      currentDepartment: ALL_ORDERS_DEPARTMENT.CANCELLED,
    };
  }

  if (
    FULFILLED_STATUS_ALIASES.has(status) ||
    currentDepartment === ALL_ORDERS_DEPARTMENT.SHIPPING_MANAGEMENT ||
    currentDepartment === 'Fulfilled'
  ) {
    return {
      status: ALL_ORDERS_STATUS.FULFILLED,
      currentDepartment: ALL_ORDERS_DEPARTMENT.SHIPPING_MANAGEMENT,
    };
  }

  if (status === ALL_ORDERS_STATUS.PENDING_SIGNATURE) {
    return {
      status: ALL_ORDERS_STATUS.PENDING_SIGNATURE,
      currentDepartment: ALL_ORDERS_DEPARTMENT.AWAITING_CUSTOMER_SIGNATURE,
    };
  }

  if (currentDepartment === ALL_ORDERS_DEPARTMENT.SHIPPING) {
    return {
      status: ALL_ORDERS_STATUS.READY_TO_SHIP,
      currentDepartment,
    };
  }

  if (!currentDepartment || currentDepartment === ALL_ORDERS_DEPARTMENT.P1_PRODUCTION_QUEUE) {
    return {
      status: ALL_ORDERS_STATUS.FINALIZED,
      currentDepartment: ALL_ORDERS_DEPARTMENT.P1_PRODUCTION_QUEUE,
    };
  }

  return {
    status: ALL_ORDERS_STATUS.IN_PROGRESS,
    currentDepartment,
  };
}

export function canonicalizeAllOrdersUpdate<T extends AllOrdersStateInput>(
  currentState: AllOrdersStateInput,
  updates: T
): T & CanonicalAllOrdersState {
  const mergedState = {
    ...currentState,
    ...updates,
  };

  return {
    ...updates,
    ...deriveCanonicalAllOrdersState(mergedState),
  };
}
