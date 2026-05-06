/**
 * Component-level tests for the In/Out Board row highlight feature in
 * TimeClockAdminPage.
 *
 * The component listens for a `punch_recorded` CustomEvent on window and
 * highlights the matching employee row for ~1500 ms (using a setTimeout).
 * These tests guard against regressions where:
 *   - the event listener is accidentally removed
 *   - the employeeId comparison breaks
 *   - the timeout-based clear is disconnected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
  queryClient: {
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn().mockReturnValue(undefined),
  },
}));

vi.mock('@/lib/addPunchHandler', () => ({
  runCreatePunch: vi.fn(),
  buildAddPunchFetchDep: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('@/lib/editPunchHandler', () => ({
  runEditPunch: vi.fn(),
  buildEditPunchFetchDep: vi.fn().mockReturnValue(vi.fn()),
}));

const ALICE: {
  employee: {
    id: number;
    epochEmployeeId?: number | null;
    firstName: string;
    lastName: string;
    employeeNumber: string | null;
    department: string | null;
    jobTitle: string | null;
    status: 'active' | 'inactive';
    pin: string | null;
    timezone: string;
  };
  status: 'clocked_in' | 'on_break' | 'clocked_out';
  clockedInAt?: string;
  hoursToday?: number;
} = {
  employee: {
    id: 7,
    epochEmployeeId: 20,
    firstName: 'Alice',
    lastName: 'Nguyen',
    employeeNumber: 'E007',
    department: 'Machining',
    jobTitle: 'Operator',
    status: 'active',
    pin: null,
    timezone: 'America/Los_Angeles',
  },
  status: 'clocked_in',
  clockedInAt: new Date().toISOString(),
  hoursToday: 2.5,
};

const BOB: typeof ALICE = {
  employee: {
    id: 12,
    epochEmployeeId: 31,
    firstName: 'Bob',
    lastName: 'Kastner',
    employeeNumber: 'E012',
    department: 'Assembly',
    jobTitle: 'Technician',
    status: 'active',
    pin: null,
    timezone: 'America/Los_Angeles',
  },
  status: 'clocked_in',
  clockedInAt: new Date().toISOString(),
  hoursToday: 4.0,
};

function buildQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        queryFn: () => new Promise(() => {}),
      },
      mutations: { retry: false },
    },
  });
}

async function renderPage() {
  const { default: TimeClockAdminPage } = await import(
    '../pages/timekeeping/TimeClockAdminPage'
  );

  const qc = buildQueryClient();
  qc.setQueryData(['/api/timekeeping/dashboard/employee-status'], [ALICE, BOB]);
  qc.setQueryData(['/api/timekeeping/dashboard/summary'], {
    totalEmployees: 2,
    activeEmployees: 2,
    clockedInNow: 2,
    onBreakNow: 0,
    pendingTimesheets: 0,
    pendingTimeOffRequests: 0,
    hoursThisWeek: 10,
    overtimeHoursThisWeek: 0,
    expiringCertifications: 0,
    missingPunchCount: 0,
  });
  qc.setQueryData(['/api/timekeeping/dashboard/recent-punches'], []);
  qc.setQueryData(['/api/timekeeping/employees'], [ALICE.employee, BOB.employee]);

  render(
    <QueryClientProvider client={qc}>
      <TimeClockAdminPage />
    </QueryClientProvider>,
  );
}

function dispatchPunchRecorded(employeeId: number, action = 'clock_in') {
  window.dispatchEvent(
    new CustomEvent('punch_recorded', {
      detail: { employeeId, action },
    }),
  );
}

function getRow(employee: typeof ALICE | typeof BOB) {
  return screen.getByTestId(`employee-row-${employee.employee.id}`);
}

async function renderAndShowOverview() {
  await act(async () => {
    await renderPage();
  });
  // The Compliance tab is now the default. Navigate to Overview so the In/Out Board rows are in the DOM.
  // Radix UI Tabs switches on mouseDown, not click.
  await act(async () => {
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^overview$/i }));
  });
}

describe('In/Out Board — row highlight on punch_recorded', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('applies a green highlight class to the matching employee row when a clock_in punch is recorded', async () => {
    await renderAndShowOverview();

    const aliceRow = getRow(ALICE);
    expect(aliceRow.className).not.toContain('bg-green-100');

    act(() => {
      dispatchPunchRecorded(ALICE.employee.id, 'clock_in');
    });

    expect(aliceRow.className).toContain('bg-green-100');
  });

  it('applies an amber highlight class when the action is clock_out', async () => {
    await renderAndShowOverview();

    const aliceRow = getRow(ALICE);

    act(() => {
      dispatchPunchRecorded(ALICE.employee.id, 'clock_out');
    });

    expect(aliceRow.className).toContain('bg-amber-100');
  });

  it('applies an amber highlight class when the action is break_start', async () => {
    await renderAndShowOverview();

    const aliceRow = getRow(ALICE);

    act(() => {
      dispatchPunchRecorded(ALICE.employee.id, 'break_start');
    });

    expect(aliceRow.className).toContain('bg-amber-100');
  });

  it('only highlights the row whose employeeId matches — other rows are unaffected', async () => {
    await renderAndShowOverview();

    const bobRow = getRow(BOB);
    expect(bobRow.className).not.toContain('bg-green-100');
    expect(bobRow.className).not.toContain('bg-amber-100');

    act(() => {
      dispatchPunchRecorded(ALICE.employee.id, 'clock_in');
    });

    expect(bobRow.className).not.toContain('bg-green-100');
    expect(bobRow.className).not.toContain('bg-amber-100');
  });

  it('clears the highlight after ~1500 ms using fake timers', async () => {
    await renderAndShowOverview();

    const aliceRow = getRow(ALICE);

    act(() => {
      dispatchPunchRecorded(ALICE.employee.id, 'clock_in');
    });

    expect(aliceRow.className).toContain('bg-green-100');

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(aliceRow.className).not.toContain('bg-green-100');
    expect(aliceRow.className).not.toContain('bg-amber-100');
  });

  it('highlight does NOT clear before the 1500 ms timeout elapses', async () => {
    await renderAndShowOverview();

    const aliceRow = getRow(ALICE);

    act(() => {
      dispatchPunchRecorded(ALICE.employee.id, 'clock_in');
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(aliceRow.className).toContain('bg-green-100');
  });

  it('resolves punch review employee names from canonical employee ids', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/timekeeping/punches')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 101,
              sessionId: 101,
              employeeId: 20,
              type: 'clock_in',
              punchedAt: new Date('2026-05-05T13:00:00.000Z').toISOString(),
              source: 'PORTAL',
              isEdited: false,
              editNote: null,
              costCode: null,
              note: null,
              hasMissingClockOut: false,
            },
          ]),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    });

    await act(async () => {
      await renderPage();
    });

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: /^punch review$/i }));
    });

    expect(await screen.findByText('Alice Nguyen')).toBeInTheDocument();
    expect(screen.queryByText('Employee #20')).not.toBeInTheDocument();
  });
});
