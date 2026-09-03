import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2TechnicalConfigurationReview from '../components/projects/P2V2TechnicalConfigurationReview';

const reviewEndpoint =
  '/api/projects/project-1/workflow-v2/technical-configuration-review';
const linkEndpoint =
  '/api/projects/project-1/p2-hub/source-parts/inventory-item';

const response = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
});

const baseModel = {
  currentSource: {
    po: { id: 42, po_number: 'PO-14332', revision_number: 3 },
    items: [
      {
        id: 11,
        part_number: 'CUSTOMER-100',
        part_name: 'Completed internal part',
        quantity: 2,
        specifications: 'BAC 5034',
        ag_part_number: 'AG-100',
        manufactured_category: 'MACHINED_PART',
      },
    ],
    configurations: [
      {
        po_item_id: 11,
        part_number: 'AG-100',
        bom_id: 'bom-1',
        bom_revision_id: 'revision-1',
        bom_revision: 'C',
        bom_is_released: true,
      },
    ],
    revision: 'source-checksum-1',
  },
  review: null,
  history: [],
  approvals: [],
  requiredApprovals: ['PROJECT_MANAGEMENT', 'ENGINEERING', 'QUALITY'],
  readiness: { ready: false, stale: false, blockers: [], differences: [] },
};

function renderReview(fetchImplementation: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchImplementation);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <P2V2TechnicalConfigurationReview projectId="project-1" />
    </QueryClientProvider>
  );
}

async function openReview() {
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Open Technical & Configuration Review',
    })
  );
  return screen.findByTestId('load-current-technical-source');
}

describe('P2V2TechnicalConfigurationReview', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('loads current PO/internal-part facts and links an exact AG part without copying review state', async () => {
    const fetchImplementation = vi.fn(
      async (input: unknown, init?: { method?: string; body?: unknown }) => {
        const url = String(input);
        if (url === '/api/permissions/me') {
          return response({
            permissions: ['projects.technical_configuration.manage'],
          });
        }
        if (url === reviewEndpoint) return response(baseModel);
        if (url === linkEndpoint && init?.method === 'POST') {
          return response({
            inventoryItem: { id: 200, agPartNumber: 'AG-200' },
            linkedPoItemIds: [11],
            created: false,
          });
        }
        throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
      }
    );
    renderReview(fetchImplementation);

    await openReview();
    expect(screen.queryByText(/\(JSON\)/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('load-current-technical-source'));

    expect(
      within(screen.getByTestId('part-requirements-editor')).getByDisplayValue(
        'AG-100'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/Robust BOM bom-1, revision C/)
    ).toBeInTheDocument();
    expect(screen.getByTestId('technical-source-notice')).toHaveTextContent(
      'Review status and approvals were not copied or changed.'
    );

    fireEvent.change(screen.getByTestId('technical-internal-part-11'), {
      target: { value: ' AG-200 ' },
    });
    fireEvent.click(screen.getByTestId('link-technical-internal-part-11'));

    await waitFor(() =>
      expect(fetchImplementation).toHaveBeenCalledWith(
        linkEndpoint,
        expect.objectContaining({ method: 'POST' })
      )
    );
    const linkCall = fetchImplementation.mock.calls.find(
      ([input, init]) =>
        String(input) === linkEndpoint && init?.method === 'POST'
    );
    expect(JSON.parse(String(linkCall?.[1]?.body))).toMatchObject({
      poItemId: 11,
      partNumber: 'CUSTOMER-100',
      internalPartNumber: 'AG-200',
      manufacturedCategory: 'MACHINED_PART',
    });
  });

  it('preserves existing structured list values when a draft is saved', async () => {
    const model = {
      ...baseModel,
      review: {
        id: 'review-1',
        revision_number: 2,
        lock_version: 7,
        status: 'DRAFT',
        effectivity_reference: 'PO-14332 line 1',
        sufficiently_defined: false,
        supply_chain_required: false,
        technical_baseline: {
          partRequirements: [
            {
              partNumber: 'AG-100',
              quantity: 2,
              drawingNumber: 'DWG-100',
              drawingRevision: 'C',
              specifications: [{ code: 'BAC 5034', revision: 'B' }],
              technicalDataException: '',
            },
          ],
          qualityClauses: [{ code: 'Q-101', revision: 'A' }],
        },
        released_evidence: [],
        conflicts: [],
        missing_information: [],
        risks: [],
      },
    };
    const fetchImplementation = vi.fn(
      async (input: unknown, init?: { method?: string; body?: unknown }) => {
        const url = String(input);
        if (url === '/api/permissions/me') {
          return response({
            permissions: ['projects.technical_configuration.manage'],
          });
        }
        if (url === reviewEndpoint && (init?.method ?? 'GET') === 'GET') {
          return response(model);
        }
        if (url === `${reviewEndpoint}/review-1` && init?.method === 'PATCH') {
          return response(model);
        }
        throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
      }
    );
    renderReview(fetchImplementation);

    await openReview();
    expect(
      await screen.findByLabelText('Customer-specific quality clauses item 1')
    ).toHaveValue('{"code":"Q-101","revision":"A"}');
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() =>
      expect(fetchImplementation).toHaveBeenCalledWith(
        `${reviewEndpoint}/review-1`,
        expect.objectContaining({ method: 'PATCH' })
      )
    );
    const saveCall = fetchImplementation.mock.calls.find(
      ([input, init]) =>
        String(input) === `${reviewEndpoint}/review-1` &&
        init?.method === 'PATCH'
    );
    const saved = JSON.parse(String(saveCall?.[1]?.body));
    expect(saved.expectedRevision).toBe(7);
    expect(saved.technicalBaseline.qualityClauses).toEqual([
      { code: 'Q-101', revision: 'A' },
    ]);
    expect(saved.technicalBaseline.partRequirements[0].specifications).toEqual([
      { code: 'BAC 5034', revision: 'B' },
    ]);
  });
});
