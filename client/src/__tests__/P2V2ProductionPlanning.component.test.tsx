import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2ProductionPlanning from '../components/projects/P2V2ProductionPlanning';

const model = {
  plan: {
    id: 'plan-1',
    revision_number: 2,
    status: 'PENDING_APPROVAL',
    po_number: 'PO-100',
    po_revision_number: 3,
    effectivity_reference: 'PO PO-100 Rev 3',
  },
  items: [
    {
      id: 'root',
      assembly_path: 'root:1',
      part_number: 'MAKE-100',
      part_name: 'Final assembly',
      is_manufactured: true,
      make_buy: 'MAKE',
      quantity_per_parent: '1',
      extended_project_quantity: '2',
      bom_revision: 'B',
      bom_release_status: 'RELEASED',
      routing_id: 'routing-100-rev-4',
      routing_revision: '4',
      routing_release_status: 'RELEASED',
      tooling_requirements: ['Assembly fixture AF-100'],
      cnc_program_requirements: [],
      special_process_source: 'EXTERNAL_APPROVED_SUPPLIER',
      special_process_requirements: ['Type II anodize'],
      inspection_extent: 'APPROVED_SAMPLING',
      sampling_plan_id: 'SP-100',
      sampling_plan_status: 'APPROVED',
      fai_requirement: 'PARTIAL',
      traceability_level: 'SERIAL',
      required_certifications: ['Certificate of Conformance'],
      required_test_records: ['Final inspection report'],
      drawing_number: 'DWG-100',
      drawing_revision: 'C',
      specification_references: ['AMS-STD-100'],
      specification_sheet_requirement: 'REQUIRED',
      work_instruction_requirement: 'REQUIRED',
      work_instruction_references: ['WI-100 Rev B'],
      packaging_instruction_requirement: 'REQUIRED',
      packaging_instruction_reference: 'PKG-100 Rev A',
      effectivity_reference: 'PO PO-100 Rev 3',
    },
    {
      id: 'leaf',
      inventory_item_id: 20,
      assembly_path: 'root:1/line:2',
      part_number: 'BUY-20',
      part_name: 'Purchased fastener',
      is_manufactured: false,
      make_buy: 'BUY',
      parent_part_number: 'MAKE-100',
      quantity_per_parent: '4',
      extended_project_quantity: '8',
      bom_release_status: 'NOT_REQUIRED_APPROVED',
      routing_release_status: 'NOT_REQUIRED_APPROVED',
      specification_references: ['AMS-QQ-A-200'],
    },
  ],
  history: [
    {
      id: 'plan-1',
      revision_number: 2,
      status: 'DRAFT',
      configuration_revision: 'PO PO-100 Rev 3',
      effectivity_reference: 'PO PO-100 Rev 3',
    },
    {
      id: 'plan-0',
      revision_number: 1,
      status: 'SUPERSEDED',
      configuration_revision: 'PO PO-100 Rev 2',
      effectivity_reference: 'PO PO-100 Rev 2',
    },
  ],
  approvalHistory: [],
  orderConfirmation: {
    projectCode: 'PRJ-100',
    projectName: 'Customer Assembly',
    customer: 'Example Aerospace',
    rfq: 'RFQ-100',
    acceptedQuote: 'Q-100',
    acceptedQuoteStatus: 'ACCEPTED',
    customerPurchaseOrder: 'PO-100',
    customerPurchaseOrderRevision: 3,
    customerPurchaseOrderStatus: 'OPEN',
    requiredDeliveryDate: '2026-10-01',
    lines: [
      {
        id: 10,
        customer_part_number: 'CUST-100',
        ag_part_number: 'MAKE-100',
        description: 'Final assembly',
        quantity: 2,
        due_date: '2026-10-01',
      },
    ],
    technicalBaseline: { status: 'COMPLETE', sourceRevision: 'technical-3' },
    sources: [
      {
        name: 'rfq risk assessment',
        status: 'COMPLETE',
        revision: 'rfq-2',
      },
      {
        name: 'estimate quote',
        status: 'COMPLETE',
        revision: 'quote-4',
      },
    ],
  },
  readiness: {
    ready: false,
    stale: true,
    blockers: ['MAKE-100: traveler decision required.'],
    differences: ['MAKE-100: BOM revision/release changed.'],
  },
};
const preview = {
  mode: 'PREVIEW_ONLY',
  createsRecords: false,
  generatedAt: '2026-08-11T20:00:00.000Z',
  sourceChecksum: 'source-checksum',
  resultChecksum: 'result-checksum',
  totals: {
    manufactured: { lineCount: 2, grossQuantity: 4 },
    purchased: { lineCount: 1, grossQuantity: 8 },
    rawMaterial: { lineCount: 0, grossQuantity: 0 },
    customerSupplied: { lineCount: 0, grossQuantity: 0 },
  },
  blockers: ['MAKE-100 needs a released first production department.'],
  nodes: [],
};

function renderPlanning() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const body = url.includes('/api/permissions/me')
        ? {
            permissions: [
              'projects.production_planning.manage',
              'projects.production_planning.engineering_decide',
              'projects.production_planning.quality_decide',
              'projects.production_planning.operations_decide',
            ],
          }
        : url.endsWith('/launch-preview')
          ? preview
          : model;
      return { ok: true, json: async () => body } as Response;
    })
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <P2V2ProductionPlanning projectId="p1" />
    </QueryClientProvider>
  );
}

describe('P2V2ProductionPlanning', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('renders assembly hierarchy, purchased leaves, blockers, stale changes, decisions, approvals and revision history', async () => {
    renderPlanning();
    fireEvent.click(screen.getByTestId('open-production-planning'));
    expect(
      await screen.findByTestId('production-planning-dialog')
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Page 2: Review Parts and Assemblies',
      })
    );
    expect(await screen.findByTestId('assembly-review')).toHaveTextContent(
      'MAKE-100'
    );
    expect(screen.getByTestId('assembly-review')).toHaveTextContent('BUY-20');
    expect(screen.getByText('MAKE')).toBeInTheDocument();
    expect(screen.getByText('BUY')).toBeInTheDocument();
    expect(screen.getByTestId('assembly-review')).toHaveTextContent(
      'Controlled assembly structure'
    );
    expect(screen.getAllByTestId('assembly-review-item')).toHaveLength(2);
    expect(screen.getByText('Parent: MAKE-100')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getAllByText(/traveler decision required/i)).not.toHaveLength(
      0
    );
    expect(screen.getByTestId('production-plan-stale')).toHaveTextContent(
      'BOM revision/release changed'
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Page 3: Review How Each Part Is Made',
      })
    );
    expect(screen.getByTestId('routing-review')).toHaveTextContent(
      'Controlled routing review'
    );
    expect(screen.getByTestId('routing-review')).toHaveTextContent(
      'routing-100-rev-4'
    );
    expect(screen.getByTestId('routing-review')).toHaveTextContent('Released');
    expect(screen.getAllByTestId('routing-review-item')).toHaveLength(1);
    expect(screen.getAllByTestId('production-plan-item')).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Page 4: Check Materials' })
    );
    expect(screen.getByTestId('material-review')).toHaveTextContent(
      'Controlled material definition'
    );
    expect(screen.getByTestId('material-review')).toHaveTextContent('BUY-20');
    expect(screen.getByTestId('material-review')).toHaveTextContent(
      'AMS-QQ-A-200'
    );
    expect(screen.getByText('Inventory linked')).toBeInTheDocument();
    expect(screen.getAllByTestId('material-review-item')).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Page 5: Check Tooling and Resources',
      })
    );
    expect(screen.getByTestId('tooling-resource-review')).toHaveTextContent(
      'Tooling and resource requirements'
    );
    expect(screen.getByTestId('tooling-resource-review')).toHaveTextContent(
      'Assembly fixture AF-100'
    );
    expect(screen.getByTestId('tooling-resource-review')).toHaveTextContent(
      'Type II anodize'
    );
    expect(screen.getByText('Requirements recorded')).toBeInTheDocument();
    expect(screen.getAllByTestId('tooling-resource-review-item')).toHaveLength(
      1
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Page 6: Check Quality Requirements',
      })
    );
    expect(screen.getByTestId('quality-requirement-review')).toHaveTextContent(
      'Controlled quality requirements'
    );
    expect(screen.getByTestId('quality-requirement-review')).toHaveTextContent(
      'SP-100'
    );
    expect(screen.getByTestId('quality-requirement-review')).toHaveTextContent(
      'Certificate of Conformance'
    );
    expect(screen.getByTestId('quality-requirement-review')).toHaveTextContent(
      'Final inspection report'
    );
    expect(
      screen.getAllByTestId('quality-requirement-review-item')
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Page 7: Review Controlled Documents',
      })
    );
    expect(screen.getByTestId('controlled-document-review')).toHaveTextContent(
      'Controlled document requirements'
    );
    expect(screen.getByTestId('controlled-document-review')).toHaveTextContent(
      'DWG-100'
    );
    expect(screen.getByTestId('controlled-document-review')).toHaveTextContent(
      'WI-100 Rev B'
    );
    expect(screen.getByTestId('controlled-document-review')).toHaveTextContent(
      'PKG-100 Rev A'
    );
    expect(
      screen.getAllByTestId('controlled-document-review-item')
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Page 10: Review and Approve' })
    );
    expect(screen.getByText(/engineering approval/i)).toBeInTheDocument();
    expect(screen.getByText(/quality approval/i)).toBeInTheDocument();
    expect(screen.getByText(/operations approval/i)).toBeInTheDocument();
    expect(screen.getByText(/Revision 1/)).toBeInTheDocument();
  });

  it('starts the ten-page guided workflow and provides simple navigation', async () => {
    renderPlanning();
    fireEvent.click(screen.getByTestId('open-production-planning'));

    expect(
      await screen.findByTestId('production-planning-progress')
    ).toHaveTextContent('Page 1 of 10');
    expect(screen.getByText('Confirm the Order')).toBeInTheDocument();
    expect(
      await screen.findByTestId('confirm-order-summary')
    ).toHaveTextContent('Example Aerospace');
    expect(screen.getByTestId('confirm-order-summary')).toHaveTextContent(
      'RFQ-100'
    );
    expect(screen.getByTestId('confirm-order-summary')).toHaveTextContent(
      'CUST-100'
    );
    expect(
      screen.getByRole('button', {
        name: 'Page 9: Preview Production Demand',
      })
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Back' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByTestId('production-planning-progress')
    ).toHaveTextContent('Page 2 of 10');
    expect(screen.getByText('Review Parts and Assemblies')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save and Exit' })).toBeEnabled();
  });

  it('loads the shared read-only demand preview only on page nine', async () => {
    renderPlanning();
    fireEvent.click(screen.getByTestId('open-production-planning'));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Page 9: Preview Production Demand',
      })
    );

    expect(
      await screen.findByTestId('production-demand-preview')
    ).toHaveTextContent('Read-only release preview');
    expect(await screen.findByText('2 demand lines')).toBeInTheDocument();
    expect(screen.getByText('Gross quantity 4')).toBeInTheDocument();
    expect(
      screen.getByText(/needs a released first production department/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('production-demand-preview')).toHaveTextContent(
      'does not create work orders'
    );
  });
});
