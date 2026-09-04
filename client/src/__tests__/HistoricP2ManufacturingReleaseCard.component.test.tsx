import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HistoricP2ManufacturingReleaseCard, {
  isHistoricP2ManufacturingReleaseProject,
} from '../components/projects/HistoricP2ManufacturingReleaseCard';

const { mockApiRequest, mockInvalidateQueries, mockToast } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  queryClient: {
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const eligibleReadiness = {
  authorityMode: 'HISTORIC_P2_COMPATIBILITY',
  projectId: 'historic-project-1',
  workflowVersion: 'legacy_v1',
  orders: [
    {
      workOrder: {
        id: 'work-order-1',
        workOrderNumber: 'WO-HIST-001',
        status: 'PENDING',
        wadStatus: 'APPROVED',
      },
      eligible: true,
      alreadyReleased: false,
      evidence: [
        {
          key: 'CUSTOMER_PO',
          label: 'Customer PO linked',
          passed: true,
          referenceIds: ['historic-po-1'],
        },
        {
          key: 'PREPRODUCTION',
          label: 'Preproduction complete',
          passed: true,
          referenceIds: ['step-3'],
        },
      ],
      blockers: [],
    },
  ],
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderCard(
  workflowVersion: string = 'legacy_v1',
  linkedP2PoId: number | null = 1
) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <HistoricP2ManufacturingReleaseCard
        projectId="historic-project-1"
        workflowVersion={workflowVersion}
        linkedP2PoId={linkedP2PoId}
      />
    </QueryClientProvider>
  );
}

describe('HistoricP2ManufacturingReleaseCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateQueries.mockResolvedValue(undefined);
  });

  it('classifies only linked legacy P2 projects for the compatibility surface', () => {
    expect(isHistoricP2ManufacturingReleaseProject('legacy_v1', 481)).toBe(
      true
    );
    expect(isHistoricP2ManufacturingReleaseProject('p2_v2', 481)).toBe(false);
    expect(isHistoricP2ManufacturingReleaseProject('legacy_v1', null)).toBe(
      false
    );
  });

  it('shows verified legacy evidence and releases an eligible existing order', async () => {
    mockApiRequest.mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (
          url ===
          '/api/work-orders/project/historic-project-1/historic-p2-release-readiness'
        ) {
          return eligibleReadiness;
        }
        if (
          url === '/api/work-orders/work-order-1/historic-p2-release' &&
          options?.method === 'POST'
        ) {
          return {
            released: true,
            alreadyReleased: false,
            eligibility: eligibleReadiness.orders[0],
            workOrder: {
              ...eligibleReadiness.orders[0].workOrder,
              status: 'RELEASED',
            },
          };
        }
        throw new Error(`Unexpected request: ${url}`);
      }
    );

    renderCard();

    expect(await screen.findByText('Historic P2 Workflow')).toBeInTheDocument();
    expect(
      screen.getByText('Historic compatibility authority')
    ).toBeInTheDocument();
    expect(screen.getByText('WO-HIST-001')).toBeInTheDocument();
    expect(screen.getByText('Ready to release')).toBeInTheDocument();
    expect(screen.getByText('Customer PO linked')).toBeInTheDocument();
    expect(screen.getByText('Preproduction complete')).toBeInTheDocument();
    expect(screen.queryByText('historic-po-1')).not.toBeInTheDocument();
    expect(screen.queryByText('step-3')).not.toBeInTheDocument();
    expect(screen.queryByText(/Production Plan/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Release Manufacturing Order' })
    );

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/work-orders/work-order-1/historic-p2-release',
        { method: 'POST', body: { projectId: 'historic-project-1' } }
      );
    });
    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: [
          '/api/work-orders/project',
          'historic-project-1',
          'historic-p2-release-readiness',
        ],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['/api/work-orders/project', 'historic-project-1'],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['/api/projects', 'historic-project-1', 'p2-hub'],
      });
    });
  });

  it('shows exact blockers and withholds release when evidence is incomplete', async () => {
    mockApiRequest.mockResolvedValue({
      ...eligibleReadiness,
      orders: [
        {
          ...eligibleReadiness.orders[0],
          eligible: false,
          evidence: [
            {
              key: 'PREPRODUCTION',
              label: 'Preproduction complete',
              passed: false,
            },
          ],
          blockers: [
            {
              code: 'HISTORIC_PREPRODUCTION_INCOMPLETE',
              message: 'Preproduction checklist is not complete.',
            },
            {
              code: 'HISTORIC_P2_RELEASE_REQUIRED',
              message: 'P2 Production Release has not been authorized.',
            },
          ],
        },
      ],
    });

    renderCard();

    expect(await screen.findByText('Blocked')).toBeInTheDocument();
    expect(
      screen.getByText('Preproduction checklist is not complete.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('P2 Production Release has not been authorized.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Release Manufacturing Order' })
    ).not.toBeInTheDocument();
  });

  it('shows an already-released order without offering a duplicate action', async () => {
    mockApiRequest.mockResolvedValue({
      ...eligibleReadiness,
      orders: [
        {
          ...eligibleReadiness.orders[0],
          workOrder: {
            ...eligibleReadiness.orders[0].workOrder,
            status: 'RELEASED',
          },
          alreadyReleased: true,
        },
      ],
    });

    renderCard();

    expect(await screen.findByText('Released')).toBeInTheDocument();
    expect(screen.getByText(/Order status: Released/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Release Manufacturing Order' })
    ).not.toBeInTheDocument();
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a P2 V2 project', () => {
    const { container } = renderCard('p2_v2');

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Production Plan/i)).not.toBeInTheDocument();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('renders nothing and makes no request for an unrelated legacy project', () => {
    const { container } = renderCard('legacy_v1', null);

    expect(container).toBeEmptyDOMElement();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});
