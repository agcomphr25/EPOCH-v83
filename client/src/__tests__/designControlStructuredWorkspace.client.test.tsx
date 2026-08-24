// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESIGN_CONTROL_WORKFLOW } from '@shared/designControlWorkflow';

import { DesignControlStepEditor } from '../features/design-control/DesignControlStepEditor';
import { FinalDesignReviewPanel } from '../features/design-control/FinalDesignReviewPanel';
import { EngineeringReleaseGatePanel } from '../features/design-control/EngineeringReleaseGatePanel';
import { ProjectTeamPanel } from '../features/design-control/ProjectTeamPanel';
import { StructuredRecordsWorkspace } from '../features/design-control/StructuredRecordsWorkspace';
import { TraceabilityMatrix } from '../features/design-control/TraceabilityMatrix';

function renderWithQuery(ui: ReactElement) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: {
              retry: false,
              queryFn: async ({ queryKey }) => {
                const response = await fetch(String(queryKey[0]), {
                  credentials: 'include',
                });
                if (!response.ok) throw new Error('Query failed');
                return response.json();
              },
            },
          },
        })
      }
    >
      {ui}
    </QueryClientProvider>
  );
}

describe('Design Control structured workspaces', () => {
  let failDraftSave = false;
  let projectTeamAssignments: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    failDraftSave = false;
    projectTeamAssignments = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: globalThis.RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/auth/session'))
          return new Response(
            JSON.stringify({ id: 1, username: 'synthetic-admin' }),
            { status: 200 }
          );
        if (url.endsWith('/api/permissions/me'))
          return new Response(
            JSON.stringify({
              permissions: [
                'design.assignment.admin',
                'design.control.edit',
                'design.control.submit',
                'design.control.approve',
                'design.release',
              ],
            }),
            { status: 200 }
          );
        if (url.includes('/steps/') && url.endsWith('/approvals'))
          return new Response(
            JSON.stringify({
              currentContentVersion: null,
              versions: [],
              approvals: [],
              approvalSlots: [],
            }),
            { status: 200 }
          );
        if (
          failDraftSave &&
          init?.method === 'PATCH' &&
          url.endsWith('/steps/1')
        )
          return new Response(
            JSON.stringify({
              message: 'Synthetic save rejected: stale version',
            }),
            { status: 409 }
          );
        if (init?.method === 'PATCH' && url.endsWith('/steps/1')) {
          const body = JSON.parse(String(init.body));
          return new Response(
            JSON.stringify({
              step: {
                stepKey: '1',
                status: 'draft',
                formData: body.formData,
                checklist: body.checklist,
                currentContentVersionId: 'version-2',
                updatedAt: '2026-08-12T12:00:00.000Z',
              },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/structured/REQUIREMENT'))
          return new Response(JSON.stringify({ records: [] }), { status: 200 });
        if (url.endsWith('/structured/VALIDATION'))
          return new Response(JSON.stringify({ records: [] }), { status: 200 });
        if (url.endsWith('/structured/REVIEW'))
          return new Response(
            JSON.stringify({
              records: [
                {
                  id: 'privateer-review-1',
                  title: 'Privateer Unmanned Aircraft System Design Review',
                  status: 'draft',
                  currentVersion: {
                    id: 'privateer-review-version-1',
                    version: 1,
                    lifecycleStatus: 'DRAFT',
                    contentSnapshot: {
                      reviewNumber: '',
                      reviewType: '',
                      reviewPurpose:
                        'Evaluate design maturity and readiness for tooling and first articles.',
                      attendees: [
                        {
                          name: 'Synthetic Engineering Lead',
                          role: 'Engineering Lead',
                        },
                      ],
                      productDescription: 'Privateer Unmanned Aircraft System',
                      sourceMappingStatus: 'PENDING_AUTHORIZED_CONFIRMATION',
                    },
                  },
                  reviewActions: [],
                },
              ],
            }),
            { status: 200 }
          );
        if (url.endsWith('/engineering-release-preview'))
          return new Response(
            JSON.stringify({
              preview: {
                ready: false,
                proposedReleaseNumber: 'ER-SYNTHETIC-001',
                proposedReleaseRevision: 'A',
                effectiveDate: '2026-08-06',
                missingEvidence: ['Validation evidence is incomplete.'],
                baselineItems: [],
                changedSinceReleaseWarnings: [],
                existingRelease: null,
              },
            }),
            { status: 200 }
          );
        if (url.endsWith('/traceability'))
          return new Response(
            JSON.stringify({
              source: 'PERSISTED_DESIGN_CONTROL_RELATIONSHIPS',
              calculatedAt: '2026-08-05T00:00:00Z',
              rows: [
                {
                  requirementId: 'req-1',
                  requirementNumber: 'REQ-1',
                  statement: 'Synthetic requirement',
                  owner: 'Engineer',
                  lifecycleStatus: 'APPROVED',
                  statuses: ['MISSING_VERIFICATION'],
                  primaryStatus: 'MISSING_VERIFICATION',
                  links: [],
                  remediation: {
                    reason: 'missing verification',
                    owner: 'Engineer',
                    href: '/fix',
                  },
                },
              ],
              totals: {
                requirements: 1,
                fullyTraced: 0,
                releaseReady: false,
                byStatus: { MISSING_VERIFICATION: 1 },
              },
            }),
            { status: 200 }
          );
        if (url.endsWith('/final-review/readiness'))
          return new Response(
            JSON.stringify({
              status: 'BLOCKED',
              calculatedAt: '2026-08-05T00:00:00Z',
              source: 'AUTHORITATIVE_PERSISTED_RECORDS',
              blocking: [
                {
                  key: 'verification',
                  label: 'Verification results',
                  status: 'BLOCKED',
                  reason: 'Failed verification remains visible.',
                  owner: 'Quality',
                  recordId: 'record-1',
                  href: '/fix-verification',
                },
              ],
              categories: [
                {
                  key: 'verification',
                  label: 'Verification results',
                  status: 'BLOCKED',
                  reason: 'Failed verification remains visible.',
                  owner: 'Quality',
                  recordId: 'record-1',
                  href: '/fix-verification',
                },
              ],
            }),
            { status: 200 }
          );
        if (url.endsWith('/project-team'))
          return new Response(
            JSON.stringify({
              activated: false,
              assignments: projectTeamAssignments,
              history: [],
            }),
            { status: 200 }
          );
        return new Response(JSON.stringify({ message: 'Unexpected request' }), {
          status: 500,
        });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a plain-language empty state and Add action for authoritative requirements', async () => {
    renderWithQuery(
      <StructuredRecordsWorkspace recordId="record-1" readOnly={false} />
    );
    expect(
      await screen.findByText(/No design inputs and requirements yet/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Add requirement/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/State one clear, testable requirement/i)
    ).toBeInTheDocument();
  });

  it('renders usable inputs and both draft actions for every controlled step', async () => {
    for (let index = 0; index < DESIGN_CONTROL_WORKFLOW.length; index += 1) {
      const definition = DESIGN_CONTROL_WORKFLOW[index];
      const view = renderWithQuery(
        <DesignControlStepEditor
          definition={definition}
          hasNext={index < DESIGN_CONTROL_WORKFLOW.length - 1}
          hasPrevious={index > 0}
          onChanged={vi.fn(async () => undefined)}
          onNext={vi.fn()}
          onPrevious={vi.fn()}
          readOnly={false}
          recordId="record-1"
          step={{ stepKey: definition.key, status: 'draft' }}
        />
      );

      expect(
        screen.getByLabelText(definition.fields[0].label, { exact: false })
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: 'Save Draft' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Save and Continue' })
      ).toBeInTheDocument();
      view.unmount();
    }
  });

  it('keeps unsaved data visible and displays an actionable server save error', async () => {
    failDraftSave = true;
    const definition = DESIGN_CONTROL_WORKFLOW[0];
    renderWithQuery(
      <DesignControlStepEditor
        definition={definition}
        hasNext
        hasPrevious={false}
        onChanged={vi.fn(async () => undefined)}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        readOnly={false}
        recordId="record-1"
        step={{ stepKey: definition.key, status: 'draft' }}
      />
    );

    const field = await screen.findByLabelText(definition.fields[0].label, {
      exact: false,
    });
    const saveButton = await screen.findByRole('button', {
      name: 'Save Draft',
    });
    fireEvent.change(field, { target: { value: 'SYNTHETIC-PROJECT-1' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(saveButton);
    expect(
      await screen.findByText('Synthetic save rejected: stale version')
    ).toBeInTheDocument();
    expect(field).toHaveValue('SYNTHETIC-PROJECT-1');
  });

  it('hydrates the workspace from the committed PATCH row after saving', async () => {
    const definition = DESIGN_CONTROL_WORKFLOW[0];
    const onChanged = vi.fn(async () => undefined);
    renderWithQuery(
      <DesignControlStepEditor
        definition={definition}
        hasNext
        hasPrevious={false}
        onChanged={onChanged}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        readOnly={false}
        recordId="record-1"
        step={{ stepKey: definition.key, status: 'draft' }}
      />
    );

    const field = await screen.findByLabelText(definition.fields[0].label, {
      exact: false,
    });
    fireEvent.change(field, { target: { value: 'PERSISTED-PROJECT-1' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save Draft' }));

    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          currentContentVersionId: 'version-2',
          formData: expect.objectContaining({
            [definition.fields[0].key]: 'PERSISTED-PROJECT-1',
          }),
        })
      )
    );
  });

  it('suggests authoritative project and team values only for blank fields', async () => {
    projectTeamAssignments = [
      {
        userId: 42,
        username: 'heated-pitot-engineer',
        firstName: 'Heated',
        lastName: 'Engineer',
        projectRole: 'RESPONSIBLE_ENGINEER',
        status: 'ACTIVE',
      },
    ];
    const definition = DESIGN_CONTROL_WORKFLOW[0];
    renderWithQuery(
      <DesignControlStepEditor
        definition={definition}
        hasNext
        hasPrevious={false}
        onChanged={vi.fn(async () => undefined)}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        projectId="heated-pitot-project"
        readOnly={false}
        recordId="record-1"
        step={{ stepKey: definition.key, status: 'draft' }}
      />
    );

    expect(
      await screen.findByLabelText('Project / customer / order link', {
        exact: false,
      })
    ).toHaveValue('heated-pitot-project');
    await waitFor(() =>
      expect(
        screen.getByLabelText('Responsible engineer', { exact: false })
      ).toHaveValue('Heated Engineer')
    );
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(
      screen.getByTestId('design-control-missing-summary')
    ).toHaveTextContent(/required item/i);
    expect(
      screen.queryByText(/Authenticated approval is recorded/i)
    ).not.toBeInTheDocument();
  });

  it('never overwrites existing saved values with authoritative suggestions', async () => {
    projectTeamAssignments = [
      {
        userId: 42,
        username: 'new-engineer',
        firstName: 'New',
        lastName: 'Engineer',
        projectRole: 'RESPONSIBLE_ENGINEER',
        status: 'ACTIVE',
      },
    ];
    const definition = DESIGN_CONTROL_WORKFLOW[0];
    const projectField = definition.fields.find((field) =>
      field.label.includes('Project / customer')
    )!;
    const engineerField = definition.fields.find((field) =>
      field.label.includes('Responsible engineer')
    )!;
    renderWithQuery(
      <DesignControlStepEditor
        definition={definition}
        hasNext
        hasPrevious={false}
        onChanged={vi.fn(async () => undefined)}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        projectId="new-project"
        readOnly={false}
        recordId="record-1"
        step={{
          stepKey: definition.key,
          status: 'draft',
          formData: {
            [projectField.key]: 'saved-project',
            [engineerField.key]: 'Saved Engineer',
          },
        }}
      />
    );

    expect(
      await screen.findByLabelText('Project / customer / order link', {
        exact: false,
      })
    ).toHaveValue('saved-project');
    expect(
      screen.getByLabelText('Responsible engineer', { exact: false })
    ).toHaveValue('Saved Engineer');
  });

  it('can focus the stage workspace on the matching authoritative register', async () => {
    renderWithQuery(
      <StructuredRecordsWorkspace
        allowedTypes={['VALIDATION']}
        initialType="VALIDATION"
        readOnly={false}
        recordId="record-1"
      />
    );
    expect(
      await screen.findByRole('button', { name: /Add validation record/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Design Inputs / Requirements')
    ).not.toBeInTheDocument();
  });

  it('continues the existing Privateer Design Review draft without creating a duplicate', async () => {
    renderWithQuery(
      <StructuredRecordsWorkspace
        allowedTypes={['REVIEW']}
        initialType="REVIEW"
        readOnly={false}
        recordId="record-1"
      />
    );

    const continueButton = await screen.findByRole('button', {
      name: 'Continue Design Review',
    });
    expect(
      screen.getAllByText(/Privateer Unmanned Aircraft System/)
    ).not.toHaveLength(0);
    fireEvent.click(continueButton);
    expect(
      screen.getByDisplayValue(
        'Evaluate design maturity and readiness for tooling and first articles.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/complete Review number/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create draft' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/design-maturity evidence only/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/DR \(Design Review\)/i)).toBeInTheDocument();
  });

  it('requires a reason when a Design Review assessment uses N/A (Not Applicable)', async () => {
    renderWithQuery(
      <StructuredRecordsWorkspace
        allowedTypes={['REVIEW']}
        initialType="REVIEW"
        readOnly={false}
        recordId="record-1"
      />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Continue Design Review' })
    );
    fireEvent.change(
      screen.getByLabelText('Manufacturing-readiness assessment', {
        exact: false,
      }),
      { target: { value: 'N/A' } }
    );
    expect(
      screen.getByText(/complete .*N\/A \(Not Applicable\) justification/i)
    ).toBeInTheDocument();
  });

  it('shows server-calculated Engineering Release blockers and keeps release disabled', async () => {
    renderWithQuery(
      <EngineeringReleaseGatePanel readOnly={false} recordId="record-1" />
    );
    expect(await screen.findByText('ER-SYNTHETIC-001')).toBeInTheDocument();
    expect(
      screen.getByText('Validation evidence is incomplete.')
    ).toBeInTheDocument();
    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', {
        name: /Create authoritative Engineering Release/i,
      })
    ).toBeDisabled();
  });

  it('renders server-calculated traceability and direct remediation', async () => {
    renderWithQuery(<TraceabilityMatrix recordId="record-1" />);
    expect(await screen.findByText('REQ-1')).toBeInTheDocument();
    expect(screen.getByText(/^MISSING VERIFICATION$/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Fix missing verification/i })
    ).toHaveAttribute('href', '/fix');
    expect(
      screen.getByText(/Text similarity is never treated as evidence/i)
    ).toBeInTheDocument();
  });

  it('shows authoritative Final Design Review blockers with owner and fix link', async () => {
    renderWithQuery(
      <FinalDesignReviewPanel recordId="record-1" readOnly={false} />
    );
    expect(
      await screen.findByText('Verification results', { selector: 'strong' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Failed verification remains visible/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Owner: Quality/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open evidence/i })
    ).toHaveAttribute('href', '/fix-verification');
  });

  it('makes project assignment enforcement explicitly prospective', async () => {
    renderWithQuery(<ProjectTeamPanel recordId="record-1" readOnly={false} />);
    expect(
      await screen.findByText(/Assignment enforcement is not activated/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Activate and assign me as Design Authority/i,
      })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/qms/design-control/record-1/project-team',
        expect.anything()
      )
    );
  });
});
