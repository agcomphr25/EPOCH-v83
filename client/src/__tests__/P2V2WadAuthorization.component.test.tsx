// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2WadAuthorization from '../components/projects/P2V2WadAuthorization';

const model = {
  authorization: {
    id: 'auth-1',
    status: 'RELEASED',
    wad_number: 'WAD-P2-1',
    wad_revision: 2,
    production_plan_revision: 4,
    configuration_revision: 'PO-10 Rev 3',
    effectivity_reference: 'PO-10 Rev 3',
    wad_work_order_id: 'wad-1',
    inherited_requirements_snapshot: {
      manufacturedItems: [
        {
          id: 'part-1',
          part_number: 'MAKE-100',
          extended_project_quantity: 4,
          routing_requirement: 'REQUIRED',
          traveler_requirement: 'REQUIRED',
          traveler_type: 'BATCH',
          work_instruction_requirement: 'DRAWING_SPEC_SUFFICIENT',
          inspection_extent: 'APPROVED_SAMPLING',
          sampling_plan_id: 'SP-1',
          fai_requirement: 'PARTIAL',
          traceability_level: 'LOT',
          special_process_source: 'NONE',
          required_certifications: ['C of C'],
          required_test_records: ['Final test'],
          packaging_instruction_requirement: 'REQUIRED',
        },
      ],
    },
    budget_snapshot: {
      departments: [{ department: 'Assembly', hours: 20, chargeCodeId: 7 }],
      materialBudget: 1000,
      outsideProcessingBudget: 250,
      startDate: '2026-07-23',
      dueDate: '2026-08-01',
      risks: [
        { description: 'Capacity', owner: 'Pat', control: 'Weekly review' },
      ],
    },
  },
  wad: { id: 'wad-1' },
  readiness: {
    ready: false,
    stale: true,
    blockers: ['WAD source Production Plan is no longer current.'],
    differences: ['Production Plan revision changed.'],
  },
  approvals: [
    {
      approval_type: 'WAD_PROJECT_MANAGEMENT',
      decision: 'APPROVED',
      actor_display_name: 'PM',
    },
  ],
  requiredApprovals: [
    'PROJECT_MANAGEMENT',
    'ENGINEERING',
    'QUALITY',
    'OPERATIONS',
    'FINANCE',
    'EXECUTIVE',
  ],
  history: [
    {
      id: 'auth-1',
      wad_revision: 2,
      status: 'RELEASED',
      production_plan_revision: 4,
    },
    {
      id: 'auth-0',
      wad_revision: 1,
      status: 'SUPERSEDED',
      production_plan_revision: 3,
    },
  ],
};

describe('P2V2WadAuthorization', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(cleanup);
  it('renders inherited requirements, budgets, approvals, blockers and history without Launch Production', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => ({
        ok: true,
        json: async () =>
          String(input).includes('/api/permissions/me')
            ? { permissions: [] }
            : model,
      }))
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <P2V2WadAuthorization projectId="p1" />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByTestId('open-wad-authorization'));
    expect(await screen.findByText('MAKE-100')).toBeInTheDocument();
    expect(screen.getByText(/Assembly: 20 hours/)).toBeInTheDocument();
    expect(screen.getByText(/PROJECT_MANAGEMENT approval/)).toBeInTheDocument();
    expect(screen.getByText(/EXECUTIVE approval/)).toBeInTheDocument();
    expect(screen.getByTestId('wad-authorization-stale')).toHaveTextContent(
      'Production Plan revision changed'
    );
    expect(screen.getByText(/WAD source Production Plan/)).toBeInTheDocument();
    expect(screen.getByText(/WAD Rev 1/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /launch production/i })
    ).not.toBeInTheDocument();
  });

  it('explains required draft fields without sending an invalid request', async () => {
    const fetchMock = vi.fn(async (input: unknown) => ({
      ok: true,
      json: async () =>
        String(input).includes('/api/permissions/me')
          ? { permissions: ['projects.wad_authorization.manage'] }
          : { ...model, authorization: null, wad: null },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <P2V2WadAuthorization projectId="p1" />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByTestId('open-wad-authorization'));
    const create = await screen.findByRole('button', {
      name: 'Create WAD Draft',
    });
    const callsBeforeCreate = fetchMock.mock.calls.length;
    fireEvent.click(create);
    expect(
      screen.getByText(/Complete the required WAD fields: department/)
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeCreate);
    expect(
      screen.getByLabelText('Existing WAD number or ID')
    ).toBeInTheDocument();
  });
});
