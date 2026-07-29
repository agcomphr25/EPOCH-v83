import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  calculateQcLimits,
  checksumSnapshot,
  CNC_OPERATION_COLUMNS,
  INVENTORY_ITEM_COLUMNS,
  PART_SPECIFICATION_TEMPLATE_SEED,
  QC_STANDARD_COLUMNS,
  REQUIRED_SPEC_APPROVALS,
  SPEC_SHEET_TABLE_TYPES,
  validateQcRows,
} from '../src/lib/partSpecificationSheets';

const root = path.resolve(__dirname, '../..');
const route = fs.readFileSync(
  path.join(root, 'server/src/routes/routingDocuments.ts'),
  'utf8'
);
const client = fs.readFileSync(
  path.join(root, 'client/src/pages/RoutingDocumentManagement.tsx'),
  'utf8'
);
const migration = fs.readFileSync(
  path.join(root, 'migrations/0232_part_specification_sheet_control.sql'),
  'utf8'
);

describe('Part Specification Sheet typed template framework', () => {
  it('keeps existing text field types and adds all requested structured types', () => {
    expect(route).toContain("'text', 'textarea', 'number', 'date'");
    expect([...SPEC_SHEET_TABLE_TYPES]).toEqual(
      expect.arrayContaining([
        'repeatable_table',
        'qc_standards_table',
        'cnc_operations_table',
        'inventory_items_table',
        'controlled_document_references',
        'approval_block',
      ])
    );
  });

  it('seeds the thirteen controlled specification sections', () => {
    expect(PART_SPECIFICATION_TEMPLATE_SEED.sections).toHaveLength(13);
    expect(PART_SPECIFICATION_TEMPLATE_SEED.sections[0].name).toBe(
      'Specification Header'
    );
    expect(PART_SPECIFICATION_TEMPLATE_SEED.sections.at(-1)?.name).toBe(
      'Approval Block'
    );
  });

  it('defines compatible QC, CNC, and inventory columns', () => {
    expect(QC_STANDARD_COLUMNS.map((column) => column.key)).toEqual(
      expect.arrayContaining([
        'standard',
        'requirement',
        'tolerance',
        'hardQcStop',
        'referenceLink',
        'inspectionCoveragePercent',
        'sampleSize',
        'lowerLimit',
        'upperLimit',
      ])
    );
    expect(CNC_OPERATION_COLUMNS.map((column) => column.key)).toEqual(
      expect.arrayContaining([
        'stepNumber',
        'programId',
        'machineClass',
        'fixture',
        'proveOutRequired',
      ])
    );
    expect(INVENTORY_ITEM_COLUMNS.map((column) => column.key)).toEqual(
      expect.arrayContaining([
        'inventoryItemId',
        'quantity',
        'materialSpecification',
        'lotTraceabilityRequired',
      ])
    );
  });
});

describe('QC acceptance criteria', () => {
  it('calculates symmetric limits from numeric nominal and tolerance', () => {
    expect(
      calculateQcLimits({ requirement: '10', tolerance: '0.25' })
    ).toMatchObject({
      lowerLimit: 9.75,
      upperLimit: 10.25,
    });
  });

  it('preserves explicit asymmetric limits', () => {
    expect(
      calculateQcLimits({
        requirement: '10',
        tolerance: '1',
        lowerLimit: 9.8,
        upperLimit: 10.4,
      })
    ).toMatchObject({
      lowerLimit: 9.8,
      upperLimit: 10.4,
    });
  });

  it('accepts pass-fail and controlled-reference criteria', () => {
    expect(
      validateQcRows([{ standard: 'Threads', requirement: 'Pass/Fail' }])
    ).toEqual([]);
    expect(
      validateQcRows([{ standard: 'Profile', referenceLink: 'DWG-100 Rev C' }])
    ).toEqual([]);
  });

  it('rejects missing and vague acceptance criteria', () => {
    expect(validateQcRows([{ standard: 'Diameter' }])[0]).toContain(
      'requires acceptance criteria'
    );
    expect(validateQcRows([{ standard: 'center ± .03' }]).join(' ')).toContain(
      'vague tolerance'
    );
  });
});

describe('immutable lifecycle and routing imports', () => {
  it('stores exact template/routing revisions and immutable snapshots additively', () => {
    expect(migration).toContain('template_revision TEXT');
    expect(migration).toContain('routing_revision TEXT');
    expect(migration).toContain('content_snapshot JSONB NOT NULL');
    expect(migration).toContain('content_checksum TEXT NOT NULL');
    expect(migration).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE\b/i);
  });

  it('captures approval actor evidence against revision and checksum', () => {
    expect(REQUIRED_SPEC_APPROVALS).toEqual([
      'ENGINEERING',
      'QUALITY',
      'PRODUCTION',
    ]);
    expect(migration).toContain('actor_user_id INTEGER NOT NULL');
    expect(migration).toContain('actor_capabilities JSONB NOT NULL');
    expect(route).toContain(
      'spec_sheets.approve.${approvalRole.toLowerCase()}'
    );
    expect(route).toContain(
      'approval.content_checksum === revision.content_checksum'
    );
  });

  it('blocks legacy editing and deletion of released records', () => {
    expect(route).toContain(
      'Released specifications are immutable; create a new revision'
    );
    expect(route).toContain('Released specifications cannot be deleted');
  });

  it('imports canonical QC/CNC rows with source identifiers without routing writes', () => {
    expect(route).toContain('sourceRoutingQcIdentifier');
    expect(route).toContain('source_routing_operation_id');
    expect(route).toContain('source_cnc_operation_id');
    const importHandler = route.slice(
      route.indexOf("router.get('/part-routings/:routingId/spec-import'"),
      route.indexOf(
        "router.post('/spec-sheets/:id/revisions/:revisionId/approve'"
      )
    );
    expect(importHandler).not.toMatch(
      /UPDATE\s+(part_routings|routing_operations|routing_cnc_operations)/i
    );
  });

  it('reserves SPEC numbers with a unique-registry conflict guard', () => {
    expect(route).toContain('ON CONFLICT (normalized_number) DO NOTHING');
    expect(route).toContain('controlled_document_number_registry');
  });

  it('keeps draft and released MDR pointers distinct', () => {
    expect(route).toContain(
      'working_draft_revision_id = ${controlledRevision.id}'
    );
    expect(route).toContain(
      'current_revision_id = ${revision.controlled_document_revision_id}'
    );
    expect(route).toContain('working_draft_revision_id = NULL');
  });

  it('exposes inventory specifications and routing source-change warnings', () => {
    expect(route).toContain(
      "router.get('/inventory-items/:inventoryItemId/specifications'"
    );
    expect(route).toContain("'REVIEW_REQUIRED'");
    expect(migration).toContain('spec_sheet_revision_id');
  });

  it('renders repeatable table headers, page breaks, and real controlled footers', () => {
    expect(route).toContain('const drawTable');
    expect(route).toContain('drawHeader();');
    expect(route).toContain('doc.addPage()');
    expect(route).toContain('Page ${index + 1} of ${pages.length}');
    expect(route).toContain("input.revision || '1.0'");
    expect(route).toContain('Uncontrolled When Printed');
  });

  it('provides the normal UI flow for typed tables, routing import, draft, and review', () => {
    expect(client).toContain("label: 'Part Specification Sheet'");
    expect(client).toContain('PART_SPECIFICATION_FIELDS');
    expect(client).toContain('Import QC / CNC');
    expect(client).toContain('Save Draft');
    expect(client).toContain('Submit for Review');
    expect(route).toContain('Required acceptance criteria missing');
  });

  it('produces stable checksums independent of object key order', () => {
    expect(checksumSnapshot({ b: 2, a: 1 })).toBe(
      checksumSnapshot({ a: 1, b: 2 })
    );
    expect(checksumSnapshot({ a: 2 })).not.toBe(checksumSnapshot({ a: 1 }));
  });
});
