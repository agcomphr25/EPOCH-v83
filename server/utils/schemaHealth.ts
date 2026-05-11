import { pool, getDatabaseTargetInfo } from '../db';

type RequiredTable = {
  schema: string;
  table: string;
  columns?: string[];
};

export type SchemaHealthResult = {
  ok: boolean;
  checkedAt: string;
  databaseTarget: ReturnType<typeof getDatabaseTargetInfo>;
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
};

const criticalTables: RequiredTable[] = [
  {
    schema: 'public',
    table: 'vendor_pos',
    columns: [
      'archived',
      'is_current_revision',
      'requisition_id',
      'competition_method',
      'sole_source_justification',
      'direct_po_exception_approved_by_id',
      'direct_po_exception_approved_by_name',
      'direct_po_exception_reason',
      'direct_po_exception_approved_at',
      'external_po_number',
      'rfq_outcome_notes',
      'issued_without_email',
      'vendor_confirmed_at',
    ],
  },
  {
    schema: 'public',
    table: 'purchase_requisitions',
    columns: [
      'id',
      'req_number',
      'status',
      'project_id',
      'charge_code_id',
      'vendor_id',
      'estimated_total',
      'competition_method',
      'converted_to_po_id',
    ],
  },
  { schema: 'public', table: 'purchase_requisition_lines', columns: ['id', 'requisition_id', 'description', 'quantity'] },
  { schema: 'public', table: 'purchase_requisition_approvals', columns: ['id', 'requisition_id', 'stage', 'capability'] },
  { schema: 'public', table: 'purchase_requisition_approval_chain', columns: ['id', 'category', 'stage', 'capability'] },
  { schema: 'public', table: 'far_flowdown_clauses', columns: ['id', 'clause_number', 'title', 'is_active'] },
  { schema: 'public', table: 'vendor_po_far_flowdowns', columns: ['id', 'vendor_po_id', 'clause_id', 'applicable', 'reasoning'] },
  { schema: 'public', table: 'optional_settings', columns: ['id', 'name', 'statement', 'sort_order', 'is_active'] },
  { schema: 'public', table: 'po_optional_settings', columns: ['id', 'vendor_po_id', 'optional_setting_id'] },
  { schema: 'public', table: 'vendor_po_attachments', columns: ['id', 'vendor_po_id', 'file_name', 'original_file_name', 'file_path'] },
  { schema: 'public', table: 'vendor_debarment_checks', columns: ['id', 'vendor_id', 'context', 'source', 'result', 'checked_at'] },
  { schema: 'public', table: 'procurement_settings', columns: ['id', 'debarment_check_freshness_days', 'allow_direct_po'] },
  {
    schema: 'public',
    table: 'inventory_transaction_ledger',
    columns: [
      'id',
      'transaction_number',
      'transaction_type',
      'inventory_item_id',
      'ag_part_number',
      'quantity_delta',
      'quantity_before',
      'quantity_after',
      'source_module',
      'event_hash',
    ],
  },
];

export async function checkCriticalSchemaHealth(): Promise<SchemaHealthResult> {
  const tableRows = await pool.query(
    `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = ANY($1)
        AND table_name = ANY($2)
    `,
    [
      Array.from(new Set(criticalTables.map((t) => t.schema))),
      criticalTables.map((t) => t.table),
    ]
  );

  const existingTables = new Set(
    tableRows.map((row: any) => `${row.table_schema}.${row.table_name}`)
  );
  const missingTables = criticalTables
    .filter((t) => !existingTables.has(`${t.schema}.${t.table}`))
    .map((t) => `${t.schema}.${t.table}`);

  const requiredColumns = criticalTables.flatMap((t) =>
    (t.columns ?? []).map((column) => ({ ...t, column }))
  );
  const columnRows = await pool.query(
    `
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = ANY($1)
        AND table_name = ANY($2)
        AND column_name = ANY($3)
    `,
    [
      Array.from(new Set(criticalTables.map((t) => t.schema))),
      criticalTables.map((t) => t.table),
      Array.from(new Set(requiredColumns.map((c) => c.column))),
    ]
  );

  const existingColumns = new Set(
    columnRows.map((row: any) => `${row.table_schema}.${row.table_name}.${row.column_name}`)
  );
  const missingColumns = requiredColumns
    .filter((c) => existingTables.has(`${c.schema}.${c.table}`))
    .filter((c) => !existingColumns.has(`${c.schema}.${c.table}.${c.column}`))
    .map((c) => ({ table: `${c.schema}.${c.table}`, column: c.column }));

  return {
    ok: missingTables.length === 0 && missingColumns.length === 0,
    checkedAt: new Date().toISOString(),
    databaseTarget: getDatabaseTargetInfo(),
    missingTables,
    missingColumns,
  };
}

export async function logCriticalSchemaHealth() {
  try {
    const health = await checkCriticalSchemaHealth();
    if (health.ok) {
      console.log('Critical schema health OK', health.databaseTarget);
      return health;
    }

    console.warn('Critical schema health gaps detected', {
      databaseTarget: health.databaseTarget,
      missingTables: health.missingTables,
      missingColumns: health.missingColumns,
    });
    return health;
  } catch (error: any) {
    console.warn('Critical schema health check failed:', error?.message ?? error);
    return null;
  }
}
