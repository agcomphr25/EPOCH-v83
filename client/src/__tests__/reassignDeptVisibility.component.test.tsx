/**
 * Component-level tests verifying the "Reassign Department" (Shuffle) button
 * renders for ADMIN/OWNER users and is absent for non-admin roles.
 *
 * Covers: ProductionQueueManager, ShippingQueuePage, OrdersList,
 *         BarcodeQueuePage, CNCQueuePage, PaintQueuePage, FinishQueuePage,
 *         FinishQCQueuePage, GunsmithQueuePage, LayupPluggingQueuePage,
 *         QCShippingQueuePage
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { UnifiedLayupOrder } from '@/hooks/useUnifiedLayupOrders';

vi.setConfig({ testTimeout: 20000 });

const mockSetLocation = vi.fn();

vi.mock('wouter', () => ({
  useLocation: vi.fn(() => ['/', mockSetLocation]),
  useSearch: vi.fn(() => ''),
  useParams: vi.fn(() => ({})),
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Route: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockApiRequest = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: mockApiRequest,
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
  getQueryFn: vi.fn(),
  generateIdempotencyKey: vi.fn().mockReturnValue('test-key'),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useActionAuth', () => ({
  useActionAuth: () => ({ getAuthHeaders: () => ({}) }),
}));

vi.mock('@/components/CameraScanner', () => ({ CameraScanner: () => null }));
vi.mock('@/components/BarcodeScanner', () => ({ BarcodeScanner: () => null }));
vi.mock('@/components/ShippingActions', () => ({ ShippingActions: () => null }));
vi.mock('@/components/BulkShippingActions', () => ({ BulkShippingActions: () => null }));
vi.mock('@/components/UPSLabelCreator', () => ({ default: () => null }));
vi.mock('@/components/OrderCardErrorBoundary', () => ({
  default: ({ children }: any) => <>{children}</>,
}));
vi.mock('@/components/StartProductionTimerModal', () => ({ default: () => null }));
vi.mock('@/components/FabricInventoryPicker', () => ({ default: () => null }));
vi.mock('@/components/ReorderModal', () => ({ default: () => null }));
vi.mock('@/components/KickbackReportModal', () => ({
  default: () => null,
  KickbackReportModal: () => null,
}));
vi.mock('@/components/OEMPrioritySettings', () => ({ default: () => null }));
vi.mock('@/hooks/useOrderTicketCounts', () => ({
  useOrderTicketCounts: () => ({ data: {} }),
}));
vi.mock('jsbarcode', () => ({ default: vi.fn() }));

vi.mock('@/components/SalesOrderModal', () => ({ SalesOrderModal: () => null }));
vi.mock('@/components/OrderSearchBox', () => ({ OrderSearchBox: () => null }));
vi.mock('@/components/TicketBadge', () => ({
  default: () => null,
  useOrderTicketCounts: vi.fn(() => ({ data: {} })),
}));
vi.mock('@/components/OrderTooltip', () => ({ OrderTooltip: () => null }));
vi.mock('@/utils/deriveOrderLabels', () => ({
  deriveOrderLabels: vi.fn(() => ({})),
  logBarcodeDebug: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: vi.fn(),
}));
vi.mock('@/components/ShipmentDialog', () => ({ ShipmentDialog: () => null }));
vi.mock('@/hooks/useRepairOrders', () => ({
  useRepairOrders: () => ({
    isRepairOrder: () => false,
    getRepairNotes: () => null,
    repairOrders: [],
    repairNotesMap: new Map(),
  }),
}));
vi.mock('@/hooks/useUnifiedLayupOrders', () => ({
  useUnifiedLayupOrders: vi.fn(() => ({
    orders: [],
    loading: false,
    error: null,
    reloadOrders: vi.fn(),
  })),
}));

const ADMIN_USER = { id: 1, username: 'testadmin', role: 'ADMIN' };
const OWNER_USER = { id: 2, username: 'testowner', role: 'OWNER' };
const MANAGER_USER = { id: 3, username: 'testmanager', role: 'MANAGER' };
const SUPERVISOR_USER = { id: 4, username: 'testsupervisor', role: 'SUPERVISOR' };
const FLOOR_OPERATOR_USER = { id: 5, username: 'testoperator', role: 'FLOOR_OPERATOR' };

const SAMPLE_PRODUCTION_ORDER = {
  orderId: 'ORD-001',
  fbOrderNumber: 'FB-001',
  modelId: 'model1',
  stockModelId: 'stock1',
  dueDate: '2026-12-01',
  orderDate: '2026-01-01',
  currentDepartment: 'P1 Production Queue',
  status: 'IN_PROGRESS',
  customerId: 'cust1',
  customerName: 'Test Customer',
  priorityScore: 10,
  queuePosition: 1,
  daysToDue: 30,
  isOverdue: false,
  urgencyLevel: 'normal',
};

const SAMPLE_SHIPPING_ORDER = {
  orderId: 'ORD-SHIP-001',
  orderNumber: 'FB-SHIP-001',
  customerName: 'Ship Customer',
  status: 'IN_PROGRESS',
  currentDepartment: 'Shipping',
  dueDate: '2026-12-01',
  paymentStatus: 'PAID',
  totalAmount: '100',
  balance: '0',
};

const SAMPLE_ORDER_LIST_ORDER = {
  orderId: 'ORD-LIST-001',
  orderNumber: 'FB-LIST-001',
  customerName: 'List Customer',
  status: 'IN_PROGRESS',
  currentDepartment: 'P1 Production Queue',
  dueDate: '2026-12-01',
  orderDate: '2026-01-01',
  customerId: 'cust-list-1',
  totalAmount: '200',
};

const EMPTY_PAGINATED = { orders: [], total: 0, page: 1, limit: 25, totalPages: 0 };
const PAGINATED_WITH_ORDER = { orders: [SAMPLE_ORDER_LIST_ORDER], total: 1, page: 1, limit: 25, totalPages: 1 };

const SAMPLE_BARCODE_ORDER = {
  orderId: 'ORD-BARCODE-001',
  fbOrderNumber: 'FB-BARCODE-001',
  customerName: 'Barcode Customer',
  currentDepartment: 'Barcode',
  status: 'IN_PROGRESS',
  dueDate: '2027-12-01',
  modelId: 'model1',
  stockModelId: null,
  priorityScore: 5,
};

const SAMPLE_CNC_ORDER = {
  orderId: 'ORD-CNC-001',
  fbOrderNumber: 'FB-CNC-001',
  customerName: 'CNC Customer',
  currentDepartment: 'CNC',
  status: 'IN_PROGRESS',
  dueDate: '2027-12-01',
  modelId: 'model1',
  stockModelId: null,
  priorityScore: 5,
};

const SAMPLE_PAINT_ORDER = {
  orderId: 'ORD-PAINT-001',
  fbOrderNumber: 'FB-PAINT-001',
  customerName: 'Paint Customer',
  currentDepartment: 'Paint',
  status: 'IN_PROGRESS',
  dueDate: '2027-12-01',
  modelId: 'model1',
  stockModelId: null,
  priorityScore: 5,
};

const SAMPLE_FINISH_ORDER = {
  orderId: 'ORD-FINISH-001',
  fbOrderNumber: 'FB-FINISH-001',
  customerName: 'Finish Customer',
  currentDepartment: 'Finish',
  status: 'IN_PROGRESS',
  dueDate: '2027-12-01',
  modelId: 'model1',
  stockModelId: null,
  priorityScore: 5,
};

const SAMPLE_FINISHQC_ORDER = {
  orderId: 'ORD-FQC-001',
  fbOrderNumber: 'FB-FQC-001',
  customerName: 'Finish QC Customer',
  currentDepartment: 'Finish QC',
  status: 'IN_PROGRESS',
  dueDate: '2027-12-01',
  modelId: 'model1',
  stockModelId: null,
  priorityScore: 5,
};

const SAMPLE_GUNSMITH_ORDER = {
  orderId: 'ORD-GUN-001',
  fbOrderNumber: 'FB-GUN-001',
  customerName: 'Gunsmith Customer',
  currentDepartment: 'Gunsmith',
  status: 'IN_PROGRESS',
  dueDate: '2027-12-01',
  modelId: 'model1',
  stockModelId: null,
  priorityScore: 5,
};

const SAMPLE_LAYUP_ORDER: UnifiedLayupOrder = {
  id: 'layup-001',
  orderId: 'ORD-LAYUP-001',
  orderDate: '2026-01-01',
  customer: 'Layup Customer',
  product: 'Test Bow',
  quantity: 1,
  status: 'IN_PROGRESS',
  department: 'Layup/Plugging',
  currentDepartment: 'Layup/Plugging',
  priorityScore: 5,
  dueDate: '2027-12-01',
  source: 'main_orders',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  modelId: 'model1',
};

const SAMPLE_QCSHIP_ORDER = {
  orderId: 'ORD-QCSHIP-001',
  fbOrderNumber: 'FB-QCSHIP-001',
  customerName: 'QC Ship Customer',
  currentDepartment: 'Shipping QC',
  status: 'IN_PROGRESS',
  dueDate: '2027-12-01',
  modelId: 'model1',
  stockModelId: null,
  priorityScore: 5,
};

function defaultApiRequestImpl(url: string) {
  if (url.includes('paginated')) return Promise.resolve(EMPTY_PAGINATED);
  return Promise.resolve([]);
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async ({ queryKey }) => {
          const key = Array.isArray(queryKey) ? String(queryKey[0]) : String(queryKey);
          if (key.includes('paginated')) return EMPTY_PAGINATED;
          return [];
        },
        retry: false,
        gcTime: 300_000,
        staleTime: Infinity,
      },
      mutations: { retry: false },
    },
  });
}

function wrap(ui: React.ReactElement, qc: QueryClient) {
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// ─────────────────────────────────────────────
// ProductionQueueManager
// ─────────────────────────────────────────────

describe('ProductionQueueManager — Reassign Department button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the Reassign Department button for ADMIN users when orders are present', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('production-queue/prioritized')) return Promise.resolve([SAMPLE_PRODUCTION_ORDER]);
      if (url.includes('paginated')) return Promise.resolve(EMPTY_PAGINATED);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], ADMIN_USER);

    const { default: ProductionQueueManager } = await import('../components/ProductionQueueManager');
    wrap(<ProductionQueueManager />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department button for OWNER users when orders are present', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('production-queue/prioritized')) return Promise.resolve([SAMPLE_PRODUCTION_ORDER]);
      if (url.includes('paginated')) return Promise.resolve(EMPTY_PAGINATED);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], OWNER_USER);

    const { default: ProductionQueueManager } = await import('../components/ProductionQueueManager');
    wrap(<ProductionQueueManager />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for MANAGER users', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('production-queue/prioritized')) return Promise.resolve([SAMPLE_PRODUCTION_ORDER]);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], MANAGER_USER);

    const { default: ProductionQueueManager } = await import('../components/ProductionQueueManager');
    wrap(<ProductionQueueManager />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for SUPERVISOR users', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('production-queue/prioritized')) return Promise.resolve([SAMPLE_PRODUCTION_ORDER]);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], SUPERVISOR_USER);

    const { default: ProductionQueueManager } = await import('../components/ProductionQueueManager');
    wrap(<ProductionQueueManager />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for FLOOR_OPERATOR users', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('production-queue/prioritized')) return Promise.resolve([SAMPLE_PRODUCTION_ORDER]);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], FLOOR_OPERATOR_USER);

    const { default: ProductionQueueManager } = await import('../components/ProductionQueueManager');
    wrap(<ProductionQueueManager />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button when there is no logged-in user', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('production-queue/prioritized')) return Promise.resolve([SAMPLE_PRODUCTION_ORDER]);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], null);

    const { default: ProductionQueueManager } = await import('../components/ProductionQueueManager');
    wrap(<ProductionQueueManager />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});

// ─────────────────────────────────────────────
// ShippingQueuePage
// ─────────────────────────────────────────────

describe('ShippingQueuePage — Reassign Department button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedShipping(qc: QueryClient, user: object) {
    qc.setQueryData(['currentUser'], user);
    qc.setQueryData(['/api/orders/with-payment-status', 'Shipping QC'], []);
    qc.setQueryData(['/api/kickbacks'], []);
    qc.setQueryData(['/api/rts-inventory/in-shipping'], []);
    qc.setQueryData(['/api/nonconformance/ready-to-ship'], []);
  }

  it('shows the Reassign Department button for ADMIN users when orders are present', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('with-payment-status')) return Promise.resolve([SAMPLE_SHIPPING_ORDER]);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    seedShipping(qc, ADMIN_USER);

    const { default: ShippingQueuePage } = await import('../pages/ShippingQueuePage');
    wrap(<ShippingQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department button for OWNER users when orders are present', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('with-payment-status')) return Promise.resolve([SAMPLE_SHIPPING_ORDER]);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    seedShipping(qc, OWNER_USER);

    const { default: ShippingQueuePage } = await import('../pages/ShippingQueuePage');
    wrap(<ShippingQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for MANAGER users', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('with-payment-status')) return Promise.resolve([SAMPLE_SHIPPING_ORDER]);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    seedShipping(qc, MANAGER_USER);

    const { default: ShippingQueuePage } = await import('../pages/ShippingQueuePage');
    wrap(<ShippingQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for SUPERVISOR users', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('with-payment-status')) return Promise.resolve([SAMPLE_SHIPPING_ORDER]);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    seedShipping(qc, SUPERVISOR_USER);

    const { default: ShippingQueuePage } = await import('../pages/ShippingQueuePage');
    wrap(<ShippingQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for FLOOR_OPERATOR users', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('with-payment-status')) return Promise.resolve([SAMPLE_SHIPPING_ORDER]);
      return Promise.resolve([]);
    });

    const qc = makeQueryClient();
    seedShipping(qc, FLOOR_OPERATOR_USER);

    const { default: ShippingQueuePage } = await import('../pages/ShippingQueuePage');
    wrap(<ShippingQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});

// ─────────────────────────────────────────────
// OrdersList
// ─────────────────────────────────────────────

describe('OrdersList — Reassign Department visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedOrdersList(qc: QueryClient, user: object) {
    qc.setQueryData(['/api/auth/session'], user);
    qc.setQueryData(['/api/customers'], []);
    qc.setQueryData(['/api/kickbacks'], []);
    qc.setQueryData(['/api/stock-models'], []);
    qc.setQueryData(['/api/orders/pipeline-counts'], {});
  }

  it('shows the Reassign Department Transfer Tool link for ADMIN users when search yields no results', async () => {
    const qc = makeQueryClient();
    seedOrdersList(qc, ADMIN_USER);

    const { default: OrdersList } = await import('../pages/OrdersList');
    wrap(<OrdersList />, qc);

    const searchInput = await screen.findByTestId('input-search-orders', undefined, { timeout: 4000 });
    fireEvent.change(searchInput, { target: { value: 'nonexistent-order-xyz' } });

    await waitFor(
      () => {
        expect(screen.queryByText(/transfer tool/i)).not.toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department Transfer Tool link for MANAGER users even when search yields no results', async () => {
    const qc = makeQueryClient();
    seedOrdersList(qc, MANAGER_USER);

    const { default: OrdersList } = await import('../pages/OrdersList');
    wrap(<OrdersList />, qc);

    const searchInput = await screen.findByTestId('input-search-orders', undefined, { timeout: 4000 });
    fireEvent.change(searchInput, { target: { value: 'nonexistent-order-xyz' } });

    await waitFor(
      () => {
        expect(screen.queryByText(/transfer tool/i)).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department Transfer Tool link for FLOOR_OPERATOR users', async () => {
    const qc = makeQueryClient();
    seedOrdersList(qc, FLOOR_OPERATOR_USER);

    const { default: OrdersList } = await import('../pages/OrdersList');
    wrap(<OrdersList />, qc);

    const searchInput = await screen.findByTestId('input-search-orders', undefined, { timeout: 4000 });
    fireEvent.change(searchInput, { target: { value: 'nonexistent-order-xyz' } });

    await waitFor(
      () => {
        expect(screen.queryByText(/transfer tool/i)).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department Transfer Tool link for OWNER users when search yields no results', async () => {
    const qc = makeQueryClient();
    seedOrdersList(qc, OWNER_USER);

    const { default: OrdersList } = await import('../pages/OrdersList');
    wrap(<OrdersList />, qc);

    const searchInput = await screen.findByTestId('input-search-orders', undefined, { timeout: 4000 });
    fireEvent.change(searchInput, { target: { value: 'nonexistent-order-xyz' } });

    await waitFor(
      () => {
        expect(screen.queryByText(/transfer tool/i)).not.toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department Transfer Tool link for SUPERVISOR users', async () => {
    const qc = makeQueryClient();
    seedOrdersList(qc, SUPERVISOR_USER);

    const { default: OrdersList } = await import('../pages/OrdersList');
    wrap(<OrdersList />, qc);

    const searchInput = await screen.findByTestId('input-search-orders', undefined, { timeout: 4000 });
    fireEvent.change(searchInput, { target: { value: 'nonexistent-order-xyz' } });

    await waitFor(
      () => {
        expect(screen.queryByText(/transfer tool/i)).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});

// ─────────────────────────────────────────────
// BarcodeQueuePage
// ─────────────────────────────────────────────

describe('BarcodeQueuePage — Reassign Department button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedBarcode(qc: QueryClient, user: object, orders: any[] = []) {
    qc.setQueryData(['currentUser'], user);
    qc.setQueryData(['/api/orders/all'], orders);
    qc.setQueryData(['/api/kickbacks'], []);
    qc.setQueryData(['/api/stock-models'], []);
  }

  it('shows the Reassign Department button for ADMIN users when orders are present', async () => {
    const qc = makeQueryClient();
    seedBarcode(qc, ADMIN_USER, [SAMPLE_BARCODE_ORDER]);

    const { default: BarcodeQueuePage } = await import('../pages/BarcodeQueuePage');
    wrap(<BarcodeQueuePage />, qc);

    const allOrdersBtn = await waitFor(() => screen.getByText('All Orders'), { timeout: 4000 });
    fireEvent.click(allOrdersBtn);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department button for OWNER users when orders are present', async () => {
    const qc = makeQueryClient();
    seedBarcode(qc, OWNER_USER, [SAMPLE_BARCODE_ORDER]);

    const { default: BarcodeQueuePage } = await import('../pages/BarcodeQueuePage');
    wrap(<BarcodeQueuePage />, qc);

    const allOrdersBtn = await waitFor(() => screen.getByText('All Orders'), { timeout: 4000 });
    fireEvent.click(allOrdersBtn);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for MANAGER users', async () => {
    const qc = makeQueryClient();
    seedBarcode(qc, MANAGER_USER, [SAMPLE_BARCODE_ORDER]);

    const { default: BarcodeQueuePage } = await import('../pages/BarcodeQueuePage');
    wrap(<BarcodeQueuePage />, qc);

    const allOrdersBtn = await waitFor(() => screen.getByText('All Orders'), { timeout: 4000 });
    fireEvent.click(allOrdersBtn);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for SUPERVISOR users', async () => {
    const qc = makeQueryClient();
    seedBarcode(qc, SUPERVISOR_USER, [SAMPLE_BARCODE_ORDER]);

    const { default: BarcodeQueuePage } = await import('../pages/BarcodeQueuePage');
    wrap(<BarcodeQueuePage />, qc);

    const allOrdersBtn = await waitFor(() => screen.getByText('All Orders'), { timeout: 4000 });
    fireEvent.click(allOrdersBtn);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for FLOOR_OPERATOR users', async () => {
    const qc = makeQueryClient();
    seedBarcode(qc, FLOOR_OPERATOR_USER, [SAMPLE_BARCODE_ORDER]);

    const { default: BarcodeQueuePage } = await import('../pages/BarcodeQueuePage');
    wrap(<BarcodeQueuePage />, qc);

    const allOrdersBtn = await waitFor(() => screen.getByText('All Orders'), { timeout: 4000 });
    fireEvent.click(allOrdersBtn);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});

// ─────────────────────────────────────────────
// CNCQueuePage
// ─────────────────────────────────────────────

describe('CNCQueuePage — Reassign Department button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedCNC(qc: QueryClient, user: object, orders: any[] = []) {
    qc.setQueryData(['currentUser'], user);
    qc.setQueryData(['/api/orders/all'], orders);
    qc.setQueryData(['/api/kickbacks'], []);
  }

  it('shows the Reassign Department button for ADMIN users when orders are present', async () => {
    const qc = makeQueryClient();
    seedCNC(qc, ADMIN_USER, [SAMPLE_CNC_ORDER]);

    const { default: CNCQueuePage } = await import('../pages/CNCQueuePage');
    wrap(<CNCQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department button for OWNER users when orders are present', async () => {
    const qc = makeQueryClient();
    seedCNC(qc, OWNER_USER, [SAMPLE_CNC_ORDER]);

    const { default: CNCQueuePage } = await import('../pages/CNCQueuePage');
    wrap(<CNCQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for MANAGER users', async () => {
    const qc = makeQueryClient();
    seedCNC(qc, MANAGER_USER, [SAMPLE_CNC_ORDER]);

    const { default: CNCQueuePage } = await import('../pages/CNCQueuePage');
    wrap(<CNCQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for SUPERVISOR users', async () => {
    const qc = makeQueryClient();
    seedCNC(qc, SUPERVISOR_USER, [SAMPLE_CNC_ORDER]);

    const { default: CNCQueuePage } = await import('../pages/CNCQueuePage');
    wrap(<CNCQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for FLOOR_OPERATOR users', async () => {
    const qc = makeQueryClient();
    seedCNC(qc, FLOOR_OPERATOR_USER, [SAMPLE_CNC_ORDER]);

    const { default: CNCQueuePage } = await import('../pages/CNCQueuePage');
    wrap(<CNCQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});

// ─────────────────────────────────────────────
// PaintQueuePage
// ─────────────────────────────────────────────

describe('PaintQueuePage — Reassign Department button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedPaint(qc: QueryClient, user: object, orders: any[] = []) {
    qc.setQueryData(['currentUser'], user);
    qc.setQueryData(['/api/orders/all'], orders);
    qc.setQueryData(['/api/kickbacks'], []);
  }

  it('shows the Reassign Department button for ADMIN users when orders are present', async () => {
    const qc = makeQueryClient();
    seedPaint(qc, ADMIN_USER, [SAMPLE_PAINT_ORDER]);

    const { default: PaintQueuePage } = await import('../pages/PaintQueuePage');
    wrap(<PaintQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department button for OWNER users when orders are present', async () => {
    const qc = makeQueryClient();
    seedPaint(qc, OWNER_USER, [SAMPLE_PAINT_ORDER]);

    const { default: PaintQueuePage } = await import('../pages/PaintQueuePage');
    wrap(<PaintQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for MANAGER users', async () => {
    const qc = makeQueryClient();
    seedPaint(qc, MANAGER_USER, [SAMPLE_PAINT_ORDER]);

    const { default: PaintQueuePage } = await import('../pages/PaintQueuePage');
    wrap(<PaintQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for SUPERVISOR users', async () => {
    const qc = makeQueryClient();
    seedPaint(qc, SUPERVISOR_USER, [SAMPLE_PAINT_ORDER]);

    const { default: PaintQueuePage } = await import('../pages/PaintQueuePage');
    wrap(<PaintQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for FLOOR_OPERATOR users', async () => {
    const qc = makeQueryClient();
    seedPaint(qc, FLOOR_OPERATOR_USER, [SAMPLE_PAINT_ORDER]);

    const { default: PaintQueuePage } = await import('../pages/PaintQueuePage');
    wrap(<PaintQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});

// ─────────────────────────────────────────────
// FinishQueuePage
// ─────────────────────────────────────────────

describe('FinishQueuePage — Reassign Department button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedFinish(qc: QueryClient, user: object, orders: any[] = []) {
    qc.setQueryData(['currentUser'], user);
    qc.setQueryData(['/api/orders/department/Finish'], orders);
    qc.setQueryData(['/api/kickbacks'], []);
    qc.setQueryData(['/api/employees/finish-technicians'], []);
    qc.setQueryData(['/api/stock-models'], []);
  }

  it('shows the Reassign Department button for ADMIN users when orders are present', async () => {
    const qc = makeQueryClient();
    seedFinish(qc, ADMIN_USER, [SAMPLE_FINISH_ORDER]);

    const { default: FinishQueuePage } = await import('../pages/FinishQueuePage');
    wrap(<FinishQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department button for OWNER users when orders are present', async () => {
    const qc = makeQueryClient();
    seedFinish(qc, OWNER_USER, [SAMPLE_FINISH_ORDER]);

    const { default: FinishQueuePage } = await import('../pages/FinishQueuePage');
    wrap(<FinishQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for MANAGER users', async () => {
    const qc = makeQueryClient();
    seedFinish(qc, MANAGER_USER, [SAMPLE_FINISH_ORDER]);

    const { default: FinishQueuePage } = await import('../pages/FinishQueuePage');
    wrap(<FinishQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for SUPERVISOR users', async () => {
    const qc = makeQueryClient();
    seedFinish(qc, SUPERVISOR_USER, [SAMPLE_FINISH_ORDER]);

    const { default: FinishQueuePage } = await import('../pages/FinishQueuePage');
    wrap(<FinishQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for FLOOR_OPERATOR users', async () => {
    const qc = makeQueryClient();
    seedFinish(qc, FLOOR_OPERATOR_USER, [SAMPLE_FINISH_ORDER]);

    const { default: FinishQueuePage } = await import('../pages/FinishQueuePage');
    wrap(<FinishQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});

// ─────────────────────────────────────────────
// FinishQCQueuePage
// ─────────────────────────────────────────────

describe('FinishQCQueuePage — Reassign Department button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedFinishQC(qc: QueryClient, user: object, orders: any[] = []) {
    qc.setQueryData(['currentUser'], user);
    qc.setQueryData(['/api/orders/department/Finish QC'], orders);
    qc.setQueryData(['/api/orders/all'], []);
  }

  it('shows the Reassign Department button for ADMIN users when orders are present', async () => {
    const qc = makeQueryClient();
    seedFinishQC(qc, ADMIN_USER, [SAMPLE_FINISHQC_ORDER]);

    const { default: FinishQCQueuePage } = await import('../pages/FinishQCQueuePage');
    wrap(<FinishQCQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department button for OWNER users when orders are present', async () => {
    const qc = makeQueryClient();
    seedFinishQC(qc, OWNER_USER, [SAMPLE_FINISHQC_ORDER]);

    const { default: FinishQCQueuePage } = await import('../pages/FinishQCQueuePage');
    wrap(<FinishQCQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for MANAGER users', async () => {
    const qc = makeQueryClient();
    seedFinishQC(qc, MANAGER_USER, [SAMPLE_FINISHQC_ORDER]);

    const { default: FinishQCQueuePage } = await import('../pages/FinishQCQueuePage');
    wrap(<FinishQCQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for SUPERVISOR users', async () => {
    const qc = makeQueryClient();
    seedFinishQC(qc, SUPERVISOR_USER, [SAMPLE_FINISHQC_ORDER]);

    const { default: FinishQCQueuePage } = await import('../pages/FinishQCQueuePage');
    wrap(<FinishQCQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for FLOOR_OPERATOR users', async () => {
    const qc = makeQueryClient();
    seedFinishQC(qc, FLOOR_OPERATOR_USER, [SAMPLE_FINISHQC_ORDER]);

    const { default: FinishQCQueuePage } = await import('../pages/FinishQCQueuePage');
    wrap(<FinishQCQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});

// ─────────────────────────────────────────────
// GunsmithQueuePage (GunsimthQueuePage)
// ─────────────────────────────────────────────

describe('GunsmithQueuePage — Reassign Department button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedGunsmith(qc: QueryClient, user: object, orders: any[] = []) {
    qc.setQueryData(['currentUser'], user);
    qc.setQueryData(['/api/orders/all'], orders);
    qc.setQueryData(['/api/kickbacks'], []);
    qc.setQueryData(['/api/nonconformance'], []);
  }

  it('shows the Reassign Department button for ADMIN users when orders are present', async () => {
    const qc = makeQueryClient();
    seedGunsmith(qc, ADMIN_USER, [SAMPLE_GUNSMITH_ORDER]);

    const { default: GunsmithQueuePage } = await import('../pages/GunsimthQueuePage');
    wrap(<GunsmithQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department button for OWNER users when orders are present', async () => {
    const qc = makeQueryClient();
    seedGunsmith(qc, OWNER_USER, [SAMPLE_GUNSMITH_ORDER]);

    const { default: GunsmithQueuePage } = await import('../pages/GunsimthQueuePage');
    wrap(<GunsmithQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for MANAGER users', async () => {
    const qc = makeQueryClient();
    seedGunsmith(qc, MANAGER_USER, [SAMPLE_GUNSMITH_ORDER]);

    const { default: GunsmithQueuePage } = await import('../pages/GunsimthQueuePage');
    wrap(<GunsmithQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for SUPERVISOR users', async () => {
    const qc = makeQueryClient();
    seedGunsmith(qc, SUPERVISOR_USER, [SAMPLE_GUNSMITH_ORDER]);

    const { default: GunsmithQueuePage } = await import('../pages/GunsimthQueuePage');
    wrap(<GunsmithQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for FLOOR_OPERATOR users', async () => {
    const qc = makeQueryClient();
    seedGunsmith(qc, FLOOR_OPERATOR_USER, [SAMPLE_GUNSMITH_ORDER]);

    const { default: GunsmithQueuePage } = await import('../pages/GunsimthQueuePage');
    wrap(<GunsmithQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});

// ─────────────────────────────────────────────
// LayupPluggingQueuePage
// ─────────────────────────────────────────────

describe('LayupPluggingQueuePage — Reassign Department button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setLayupOrders(orders: UnifiedLayupOrder[]) {
    const { useUnifiedLayupOrders } = await import('@/hooks/useUnifiedLayupOrders');
    vi.mocked(useUnifiedLayupOrders).mockReturnValue({
      orders,
      loading: false,
      error: null,
      reloadOrders: vi.fn(),
    });
  }

  it('shows the Reassign Department button for ADMIN users when orders are present', async () => {
    await setLayupOrders([SAMPLE_LAYUP_ORDER]);
    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], ADMIN_USER);

    const { default: LayupPluggingQueuePage } = await import('../pages/LayupPluggingQueuePage');
    wrap(<LayupPluggingQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department button for OWNER users when orders are present', async () => {
    await setLayupOrders([SAMPLE_LAYUP_ORDER]);
    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], OWNER_USER);

    const { default: LayupPluggingQueuePage } = await import('../pages/LayupPluggingQueuePage');
    wrap(<LayupPluggingQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for MANAGER users', async () => {
    await setLayupOrders([SAMPLE_LAYUP_ORDER]);
    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], MANAGER_USER);

    const { default: LayupPluggingQueuePage } = await import('../pages/LayupPluggingQueuePage');
    wrap(<LayupPluggingQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for SUPERVISOR users', async () => {
    await setLayupOrders([SAMPLE_LAYUP_ORDER]);
    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], SUPERVISOR_USER);

    const { default: LayupPluggingQueuePage } = await import('../pages/LayupPluggingQueuePage');
    wrap(<LayupPluggingQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for FLOOR_OPERATOR users', async () => {
    await setLayupOrders([SAMPLE_LAYUP_ORDER]);
    const qc = makeQueryClient();
    qc.setQueryData(['currentUser'], FLOOR_OPERATOR_USER);

    const { default: LayupPluggingQueuePage } = await import('../pages/LayupPluggingQueuePage');
    wrap(<LayupPluggingQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});

// ─────────────────────────────────────────────
// QCShippingQueuePage
// ─────────────────────────────────────────────

describe('QCShippingQueuePage — Reassign Department button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(defaultApiRequestImpl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedQCShipping(qc: QueryClient, user: object, orders: any[] = []) {
    qc.setQueryData(['currentUser'], user);
    qc.setQueryData(['/api/orders/all'], orders);
    qc.setQueryData(['/api/po-orders/all-p1-with-status'], []);
    qc.setQueryData(['/api/kickbacks'], []);
    qc.setQueryData(['/api/features'], []);
  }

  it('shows the Reassign Department button for ADMIN users when orders are present', async () => {
    const qc = makeQueryClient();
    seedQCShipping(qc, ADMIN_USER, [SAMPLE_QCSHIP_ORDER]);

    const { default: QCShippingQueuePage } = await import('../pages/QCShippingQueuePage');
    wrap(<QCShippingQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('shows the Reassign Department button for OWNER users when orders are present', async () => {
    const qc = makeQueryClient();
    seedQCShipping(qc, OWNER_USER, [SAMPLE_QCSHIP_ORDER]);

    const { default: QCShippingQueuePage } = await import('../pages/QCShippingQueuePage');
    wrap(<QCShippingQueuePage />, qc);

    await waitFor(
      () => {
        const buttons = screen.queryAllByTitle('Reassign Department');
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for MANAGER users', async () => {
    const qc = makeQueryClient();
    seedQCShipping(qc, MANAGER_USER, [SAMPLE_QCSHIP_ORDER]);

    const { default: QCShippingQueuePage } = await import('../pages/QCShippingQueuePage');
    wrap(<QCShippingQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for SUPERVISOR users', async () => {
    const qc = makeQueryClient();
    seedQCShipping(qc, SUPERVISOR_USER, [SAMPLE_QCSHIP_ORDER]);

    const { default: QCShippingQueuePage } = await import('../pages/QCShippingQueuePage');
    wrap(<QCShippingQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });

  it('hides the Reassign Department button for FLOOR_OPERATOR users', async () => {
    const qc = makeQueryClient();
    seedQCShipping(qc, FLOOR_OPERATOR_USER, [SAMPLE_QCSHIP_ORDER]);

    const { default: QCShippingQueuePage } = await import('../pages/QCShippingQueuePage');
    wrap(<QCShippingQueuePage />, qc);

    await waitFor(
      () => {
        expect(screen.queryByTitle('Reassign Department')).toBeNull();
      },
      { timeout: 4000 },
    );
  });
});
