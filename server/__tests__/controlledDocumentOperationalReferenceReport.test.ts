import { describe, expect, it, vi } from 'vitest';

import {
  operationalReferenceDefinitions,
  reportParentOnlyOperationalReferences,
} from '../src/services/controlledDocumentOperationalReferenceReport';

describe('controlled document operational-reference coverage', () => {
  it('audits every real source and reports exact, parent, number, text, and missing linkage', async () => {
    const schemaRows = operationalReferenceDefinitions.flatMap((definition) =>
      definition.columns.map((column_name) => ({
        table_name: definition.table,
        column_name,
      }))
    );
    const query = vi.fn(async (sql: string) =>
      sql.includes('information_schema.columns')
        ? { rows: schemaRows }
        : {
            rows: [
              {
                total: 10,
                exact_revision: 2,
                parent_document: 1,
                document_number: 3,
                text_path: 1,
              },
            ],
          }
    );
    const coverage = await reportParentOnlyOperationalReferences({ query });
    expect(coverage).toHaveLength(operationalReferenceDefinitions.length);
    expect(coverage.map((row) => row.category)).toEqual(
      expect.arrayContaining([
        'travelers',
        'production_work_orders',
        'p1_production_orders',
        'p2_production_records',
        'routing_documents',
        'projects',
        'project_form_instances',
        'specification_sheets',
        'work_instructions',
        'sampling_plans',
        'packaging_instructions',
        'design_control_manufacturing_evidence',
      ])
    );
    expect(coverage[0]).toMatchObject({
      sourceStatus: 'INSPECTED',
      exactRevisionReferences: 2,
      parentDocumentReferences: 1,
      documentNumberReferences: 3,
      textOrPathReferences: 1,
      noControlledDocumentLinkage: 3,
      action: 'REPORT_ONLY_NO_REWRITE',
    });
    expect(
      query.mock.calls.every(
        ([sql]) => !/\b(UPDATE|DELETE|INSERT)\b/i.test(sql)
      )
    ).toBe(true);
  });

  it('reports missing exact-link mechanisms instead of silently skipping a category', async () => {
    const coverage = await reportParentOnlyOperationalReferences({
      query: async (sql) =>
        sql.includes('information_schema.columns')
          ? { rows: [] }
          : { rows: [] },
    });
    expect(coverage).toHaveLength(operationalReferenceDefinitions.length);
    expect(
      coverage.every((row) => row.sourceStatus === 'SOURCE_NOT_READY')
    ).toBe(true);
  });
});
