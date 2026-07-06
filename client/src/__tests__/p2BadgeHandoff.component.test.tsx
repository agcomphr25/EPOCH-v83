/**
 * Tests for the P2 → execute badge handoff (task #1408).
 *
 * 1. P2TravelerPage navigates to /travelers/:id/execute?badge=<code> after a
 *    successful traveler-generate API call.
 * 2. TravelerExecution seeds signatureData.badgeScan from the ?badge= URL
 *    param on mount (visible in the start-step badge input).
 * 3. The sign-dialog "Sign & Complete" button is disabled and the amber badge
 *    warning is shown when signedBy is empty.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockNavigate = vi.fn();

vi.mock('wouter', () => ({
  useLocation: vi.fn(() => ['/p2-traveler', mockNavigate]),
  useParams:   vi.fn(() => ({ id: 'T-001' })),
  useSearch:   vi.fn(() => ''),
  Link:        ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest:  vi.fn(),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useActionAuth', () => ({
  useActionAuth: () => ({ getAuthHeaders: () => ({}) }),
}));

vi.mock('@/components/CameraScanner', () => ({ CameraScanner: () => null }));
vi.mock('@/components/StartProductionTimerModal', () => ({ default: () => null }));
vi.mock('@/components/FabricInventoryPicker', () => ({ default: () => null }));

vi.mock('react-signature-canvas', () => ({
  default: vi.fn().mockImplementation(({ canvasProps }: { canvasProps: Record<string, unknown> }) => (
    <canvas {...canvasProps} data-testid="sig-canvas" />
  )),
}));

import { useLocation, useParams, useSearch } from 'wouter';
import { apiRequest } from '@/lib/queryClient';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrap(ui: React.ReactElement, qc?: QueryClient) {
  const client = qc ?? makeQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeTravelerPayload(stepStatus: 'NOT_STARTED' | 'IN_PROGRESS') {
  return {
    traveler: {
      id: 'T-001',
      travelerNumber: 'TRV-001',
      status: 'IN_PROGRESS',
      workOrderId: null,
      partName: 'Widget',
      partNumber: 'WGT-001',
      customerName: 'Acme',
      currentStep: 0,
      signedOff: false,
      routingId: null,
      operatorName: null,
      notes: null,
    },
    steps: [
      {
        id: 'S-001',
        travelerId: 'T-001',
        departmentName: 'Assembly',
        status: stepStatus,
        stepNumber: 1,
        startedBy: null,
        completedBy: null,
        notes: '',
        signatures: [],
        tasks: [],
      },
    ],
    events: [],
  };
}

function setupFetch(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    for (const [pattern, response] of Object.entries(overrides)) {
      if (u.includes(pattern)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(response) });
      }
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('P2TravelerPage — badge forwarding on traveler generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLocation).mockReturnValue(['/p2-traveler', mockNavigate] as ReturnType<typeof useLocation>);
    vi.mocked(useSearch).mockReturnValue('');
  });

  it('navigates to /travelers/:id/execute?badge=<code> after successful generate', async () => {
    const scannedPartBarcode = 'PART/001%LAYUP';

    vi.mocked(apiRequest).mockImplementation(async (url: string) => {
      if (String(url).includes('badge-lookup')) {
        return { id: 1, employeeCode: 'EMP123', name: 'Alice' };
      }
      if (String(url).includes('verify-certification')) {
        return {
          serializedItem: { id: 'SI-001' },
          isCertified: true,
          routing: { id: 'R-001' },
          nextDepartment: 'Assembly',
          departmentConfig: {
            customDataFields: [],
            startCustomDataFields: [],
            finishCustomDataFields: [],
            qcStandards: [],
            startQcStandards: [],
            finishQcStandards: [],
          },
        };
      }
      if (String(url).includes('generate-traveler')) {
        return { travelerId: 'T-42', travelerNumber: 'TRV-042', created: true };
      }
      return {};
    });

    setupFetch();

    const { default: P2TravelerPage } = await import('../pages/P2TravelerPage');
    wrap(<P2TravelerPage />);

    const badgeInput = await screen.findByTestId('input-badge-code');
    fireEvent.change(badgeInput, { target: { value: 'EMP123' } });
    fireEvent.submit(screen.getByTestId('form-badge-scan'));

    const partInput = await screen.findByTestId('input-part-barcode');
    fireEvent.change(partInput, { target: { value: scannedPartBarcode } });
    fireEvent.submit(screen.getByTestId('form-part-scan'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        `/api/p2-traveler/verify-certification/${encodeURIComponent('EMP123')}/${encodeURIComponent(scannedPartBarcode)}`
      );
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/\/travelers\/T-42\/execute\?badge=EMP123/),
      );
    });
  });
});

describe('TravelerExecution — seeding from ?badge= URL param', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({ id: 'T-001' } as ReturnType<typeof useParams>);
    vi.mocked(apiRequest).mockResolvedValue({});
  });

  it('pre-fills the start-step badge scan input (badgeScan) from the ?badge= param on mount', async () => {
    vi.mocked(useSearch).mockReturnValue('?badge=EMP123');

    setupFetch({ '/api/travelers/T-001': makeTravelerPayload('NOT_STARTED') });

    const { default: TravelerExecution } = await import('../pages/TravelerExecution');
    wrap(<TravelerExecution />);

    const badgeScanInput = await screen.findByTestId('input-badge-scan');
    expect((badgeScanInput as HTMLInputElement).value).toBe('EMP123');
  });

  it('seeds signedBy into the sign dialog badge input when the step is IN_PROGRESS', async () => {
    vi.mocked(useSearch).mockReturnValue('?badge=EMP123');

    setupFetch({ '/api/travelers/T-001': makeTravelerPayload('IN_PROGRESS') });

    const { default: TravelerExecution } = await import('../pages/TravelerExecution');
    wrap(<TravelerExecution />);

    const signButton = await screen.findByTestId('button-sign-step');

    await act(async () => {
      fireEvent.click(signButton);
    });

    const signBadgeInput = await screen.findByTestId('input-sign-badge');
    expect((signBadgeInput as HTMLInputElement).value).toBe('EMP123');
  });
});

describe('TravelerExecution — sign dialog validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({ id: 'T-001' } as ReturnType<typeof useParams>);
    vi.mocked(useSearch).mockReturnValue('');
    vi.mocked(apiRequest).mockResolvedValue({});
  });

  it('disables Sign & Complete and shows the amber badge warning when signedBy is empty', async () => {
    setupFetch({ '/api/travelers/T-001': makeTravelerPayload('IN_PROGRESS') });

    const { default: TravelerExecution } = await import('../pages/TravelerExecution');
    wrap(<TravelerExecution />);

    const signButton = await screen.findByTestId('button-sign-step');

    await act(async () => {
      fireEvent.click(signButton);
    });

    const confirmButton = await screen.findByTestId('button-confirm-sign');
    expect(confirmButton).toBeDisabled();

    expect(
      screen.getByText(/scan or enter your badge \/ employee code before signing/i),
    ).toBeInTheDocument();
  });
});
