import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectsPage from '../pages/ProjectsPage';

const mockToast = vi.fn();
const mockApiRequest = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  queryClient: {
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  generateIdempotencyKey: () => 'test-idempotency-key',
  getQueryFn: () => async () => [],
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href?: string }) => (
    <a href={href}>{children}</a>
  ),
  Route: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const TEST_CUSTOMERS = [
  { id: 1, customerId: 'CUST-001', customerName: 'Acme Corp' },
];

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        queryFn: ({ queryKey }: { queryKey: readonly unknown[] }) => {
          const key = queryKey[0] as string;
          if (key === '/api/p2-customers-bypass') return Promise.resolve(TEST_CUSTOMERS);
          return Promise.resolve([]);
        },
      },
      mutations: { retry: false },
    },
  });
}

function renderPage() {
  const client = createTestClient();
  return render(
    <QueryClientProvider client={client}>
      <ProjectsPage />
    </QueryClientProvider>,
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('button-new-project'));
  await screen.findByText('Create New Project');
}

async function fillProjectName(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByTestId('input-project-name'), name);
}

async function pickFirstCustomer(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByTestId('select-customer');
  await user.click(trigger);
  const option = await screen.findByText('Acme Corp');
  await user.click(option);
}

describe('ProjectsPage — Create Project dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults the project status filter to Active', () => {
    renderPage();

    expect(screen.getByTestId('select-status-filter')).toHaveTextContent('Active');
  });

  it('opens the Create New Project dialog when "New Project" is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('button-new-project'));

    expect(await screen.findByText('Create New Project')).toBeInTheDocument();
  });

  it('Create Project button starts disabled when required fields are empty', async () => {
    const user = userEvent.setup();
    renderPage();

    await openDialog(user);

    expect(screen.getByTestId('button-create-project')).toBeDisabled();
  });

  it('Create Project button becomes enabled once project name and customer are filled', async () => {
    const user = userEvent.setup();
    renderPage();

    await openDialog(user);
    await fillProjectName(user, 'My Project');
    await pickFirstCustomer(user);

    expect(screen.getByTestId('button-create-project')).not.toBeDisabled();
  });

  it('Create Project button is disabled while the mutation is in flight (isPending)', async () => {
    const user = userEvent.setup();
    let resolveMutation!: () => void;
    mockApiRequest.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      }),
    );

    renderPage();

    await openDialog(user);
    await fillProjectName(user, 'My Project');
    await pickFirstCustomer(user);

    await user.click(screen.getByTestId('button-create-project'));

    await waitFor(() => {
      expect(screen.getByTestId('button-create-project')).toBeDisabled();
    });

    expect(screen.getByTestId('button-create-project')).toHaveTextContent('Creating...');

    await act(async () => {
      resolveMutation();
    });
  });

  it('shows a destructive toast when the POST to /api/projects fails', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockRejectedValue(new Error('Internal Server Error'));

    renderPage();

    await openDialog(user);
    await fillProjectName(user, 'My Project');
    await pickFirstCustomer(user);
    await user.click(screen.getByTestId('button-create-project'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          title: 'Failed to create project',
          description: 'Internal Server Error',
        }),
      );
    });
  });

  it('includes the server error message in the toast description', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockRejectedValue(new Error('Duplicate project name'));

    renderPage();

    await openDialog(user);
    await fillProjectName(user, 'Duplicate Project');
    await pickFirstCustomer(user);
    await user.click(screen.getByTestId('button-create-project'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Duplicate project name' }),
      );
    });
  });

  it('sends reminderDays: 3 in the request body when the field is cleared', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ project_id: 'proj-1' });

    renderPage();

    await openDialog(user);
    await fillProjectName(user, 'My Project');
    await pickFirstCustomer(user);

    const reminderInput = screen.getByTestId('input-reminder-days');
    await user.clear(reminderInput);

    await user.click(screen.getByTestId('button-create-project'));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          body: expect.objectContaining({ reminderDays: 3 }),
        }),
      );
    });
  });

  it('button label resets to "Create Project" when the dialog is closed and reopened while a mutation was pending', async () => {
    const user = userEvent.setup();
    // Never resolve so the mutation stays in-flight (simulates slow network)
    mockApiRequest.mockReturnValue(new Promise(() => {}));

    renderPage();

    await openDialog(user);
    await fillProjectName(user, 'Slow Project');
    await pickFirstCustomer(user);

    // Submit — mutation goes pending
    await user.click(screen.getByTestId('button-create-project'));

    await waitFor(() => {
      expect(screen.getByTestId('button-create-project')).toHaveTextContent('Creating...');
    });

    // Close the dialog via the Cancel button
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Reopen the dialog
    await openDialog(user);

    // The button should show the original label, not the stale 'Creating...'
    expect(screen.getByTestId('button-create-project')).toHaveTextContent('Create Project');
  });

  it('sends the entered reminderDays value when it is a valid integer', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ project_id: 'proj-2' });

    renderPage();

    await openDialog(user);
    await fillProjectName(user, 'My Project');
    await pickFirstCustomer(user);

    const reminderInput = screen.getByTestId('input-reminder-days');
    fireEvent.change(reminderInput, { target: { value: '7' } });

    await user.click(screen.getByTestId('button-create-project'));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          body: expect.objectContaining({ reminderDays: 7 }),
        }),
      );
    });
  });
});
