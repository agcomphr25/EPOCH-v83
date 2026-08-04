type Queryable = {
  query(
    sql: string,
    values?: unknown[]
  ): Promise<{ rows: Array<Record<string, any>> }>;
};

export type OperationalReferenceCoverage = {
  category: string;
  sourceTable: string;
  sourceColumns: string[];
  sourceStatus: 'INSPECTED' | 'SOURCE_NOT_READY';
  totalRecords: number;
  exactRevisionReferences: number;
  parentDocumentReferences: number;
  documentNumberReferences: number;
  textOrPathReferences: number;
  noControlledDocumentLinkage: number;
  action: 'REPORT_ONLY_NO_REWRITE';
};

type Definition = {
  category: string;
  table: string;
  columns: string[];
  aggregateSql: string;
};

export const operationalReferenceDefinitions: Definition[] = [
  {
    category: 'travelers',
    table: 'travelers',
    columns: [
      'wad_revision_id',
      'spec_sheet_revision_id',
      'created_from_template_id',
      'created_from_template_version',
    ],
    aggregateSql: `SELECT count(*)::int total,
      count(*) FILTER (WHERE wad_revision_id IS NOT NULL OR spec_sheet_revision_id IS NOT NULL)::int exact_revision,
      0::int parent_document,0::int document_number,
      count(*) FILTER (WHERE created_from_template_id IS NOT NULL AND created_from_template_version IS NULL)::int text_path
      FROM travelers`,
  },
  {
    category: 'production_work_orders',
    table: 'production_work_orders',
    columns: ['wizard_data'],
    aggregateSql: `SELECT count(*)::int total,0::int exact_revision,0::int parent_document,0::int document_number,
      count(*) FILTER (WHERE wizard_data::text ~* '(document|instruction|spec|sampling|packaging)')::int text_path
      FROM production_work_orders`,
  },
  {
    category: 'p1_production_orders',
    table: 'production_orders',
    columns: ['specifications'],
    aggregateSql: `SELECT count(*)::int total,0::int exact_revision,0::int parent_document,0::int document_number,
      count(*) FILTER (WHERE specifications::text ~* '(document|instruction|spec|sampling|packaging)')::int text_path
      FROM production_orders`,
  },
  {
    category: 'p2_production_records',
    table: 'p2_serialized_item_events',
    columns: ['metadata'],
    aggregateSql: `SELECT count(*)::int total,0::int exact_revision,0::int parent_document,0::int document_number,
      count(*) FILTER (WHERE metadata::text ~* '(document|instruction|spec|sampling|packaging)')::int text_path
      FROM p2_serialized_item_events`,
  },
  {
    category: 'routing_documents',
    table: 'routing_documents',
    columns: ['file_url', 'version', 'part_routing_id'],
    aggregateSql: `SELECT count(*)::int total,0::int exact_revision,0::int parent_document,0::int document_number,
      count(*) FILTER (WHERE file_url IS NOT NULL)::int text_path FROM routing_documents`,
  },
  {
    category: 'projects',
    table: 'projects',
    columns: ['id', 'current_revision_number', 'current_revision_label'],
    aggregateSql: `SELECT count(*)::int total,0::int exact_revision,0::int parent_document,0::int document_number,0::int text_path FROM projects`,
  },
  {
    category: 'project_form_instances',
    table: 'project_form_instances',
    columns: [
      'document_version_history_id',
      'template_document_number_snapshot',
      'template_revision_snapshot',
      'template_checksum_snapshot',
    ],
    aggregateSql: `SELECT count(*)::int total,
      count(*) FILTER (WHERE document_version_history_id IS NOT NULL AND template_revision_snapshot IS NOT NULL AND template_checksum_snapshot IS NOT NULL)::int exact_revision,
      0::int parent_document,
      count(*) FILTER (WHERE template_document_number_snapshot IS NOT NULL AND (template_revision_snapshot IS NULL OR template_checksum_snapshot IS NULL))::int document_number,
      0::int text_path FROM project_form_instances`,
  },
  {
    category: 'specification_sheets',
    table: 'spec_sheets',
    columns: ['controlled_document_id', 'released_revision_id', 'file_url'],
    aggregateSql: `SELECT count(*)::int total,
      count(*) FILTER (WHERE controlled_document_id IS NOT NULL AND released_revision_id IS NOT NULL)::int exact_revision,
      count(*) FILTER (WHERE controlled_document_id IS NOT NULL AND released_revision_id IS NULL)::int parent_document,
      0::int document_number,count(*) FILTER (WHERE controlled_document_id IS NULL AND file_url IS NOT NULL)::int text_path FROM spec_sheets`,
  },
  {
    category: 'work_instructions',
    table: 'work_instructions',
    columns: ['document_number', 'version'],
    aggregateSql: `SELECT count(*)::int total,0::int exact_revision,0::int parent_document,
      count(*) FILTER (WHERE document_number IS NOT NULL)::int document_number,0::int text_path FROM work_instructions`,
  },
  {
    category: 'sampling_plans',
    table: 'project_production_plan_items',
    columns: ['sampling_plan_id', 'sampling_plan_status'],
    aggregateSql: `SELECT count(*)::int total,0::int exact_revision,0::int parent_document,
      count(*) FILTER (WHERE sampling_plan_id IS NOT NULL)::int document_number,0::int text_path FROM project_production_plan_items`,
  },
  {
    category: 'packaging_instructions',
    table: 'project_production_plan_items',
    columns: ['packaging_instruction_reference'],
    aggregateSql: `SELECT count(*)::int total,0::int exact_revision,0::int parent_document,0::int document_number,
      count(*) FILTER (WHERE packaging_instruction_reference IS NOT NULL)::int text_path FROM project_production_plan_items`,
  },
  {
    category: 'design_control_manufacturing_evidence',
    table: 'design_project_part_revision_artifacts',
    columns: [
      'controlled_revision_id',
      'revision_snapshot',
      'checksum_snapshot',
    ],
    aggregateSql: `SELECT count(*)::int total,
      count(*) FILTER (WHERE controlled_revision_id IS NOT NULL AND revision_snapshot IS NOT NULL AND checksum_snapshot IS NOT NULL)::int exact_revision,
      0::int parent_document,0::int document_number,0::int text_path FROM design_project_part_revision_artifacts`,
  },
  {
    category: 'routing_work_instruction_evidence',
    table: 'routing_operation_work_instruction_revisions',
    columns: [
      'work_instruction_controlled_revision_id',
      'work_instruction_number',
      'work_instruction_revision_snapshot',
      'work_instruction_checksum_snapshot',
    ],
    aggregateSql: `SELECT count(*)::int total,
      count(*) FILTER (WHERE work_instruction_controlled_revision_id IS NOT NULL AND work_instruction_revision_snapshot IS NOT NULL AND work_instruction_checksum_snapshot IS NOT NULL)::int exact_revision,
      0::int parent_document,0::int document_number,0::int text_path FROM routing_operation_work_instruction_revisions`,
  },
];

const number = (value: unknown) => Number(value || 0);

export async function reportParentOnlyOperationalReferences(client: Queryable) {
  const schema = await client.query(
    `SELECT table_name,column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [
      Array.from(
        new Set(operationalReferenceDefinitions.map((item) => item.table))
      ),
    ]
  );
  const available = new Map<string, Set<string>>();
  for (const row of schema.rows) {
    const columns = available.get(String(row.table_name)) || new Set<string>();
    columns.add(String(row.column_name));
    available.set(String(row.table_name), columns);
  }

  const coverage: OperationalReferenceCoverage[] = [];
  for (const definition of operationalReferenceDefinitions) {
    const columns = available.get(definition.table);
    const missing = definition.columns.filter(
      (column) => !columns?.has(column)
    );
    if (!columns || missing.length) {
      coverage.push({
        category: definition.category,
        sourceTable: definition.table,
        sourceColumns: definition.columns,
        sourceStatus: 'SOURCE_NOT_READY',
        totalRecords: 0,
        exactRevisionReferences: 0,
        parentDocumentReferences: 0,
        documentNumberReferences: 0,
        textOrPathReferences: 0,
        noControlledDocumentLinkage: 0,
        action: 'REPORT_ONLY_NO_REWRITE',
      });
      continue;
    }
    const row = (await client.query(definition.aggregateSql)).rows[0] || {};
    const total = number(row.total);
    const exact = number(row.exact_revision);
    const parent = number(row.parent_document);
    const documentNumber = number(row.document_number);
    const textPath = number(row.text_path);
    coverage.push({
      category: definition.category,
      sourceTable: definition.table,
      sourceColumns: definition.columns,
      sourceStatus: 'INSPECTED',
      totalRecords: total,
      exactRevisionReferences: exact,
      parentDocumentReferences: parent,
      documentNumberReferences: documentNumber,
      textOrPathReferences: textPath,
      noControlledDocumentLinkage: Math.max(
        0,
        total - exact - parent - documentNumber - textPath
      ),
      action: 'REPORT_ONLY_NO_REWRITE',
    });
  }
  return coverage;
}
