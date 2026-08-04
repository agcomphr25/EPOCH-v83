type Queryable = {
  query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

const candidateReferences = [
  {
    category: 'travelers',
    table: 'travelers',
    columns: ['controlled_document_id', 'document_number'],
  },
  {
    category: 'work_orders',
    table: 'work_orders',
    columns: ['controlled_document_id', 'document_number'],
  },
  {
    category: 'production_records',
    table: 'production_records',
    columns: ['controlled_document_id', 'document_number'],
  },
  {
    category: 'routing_records',
    table: 'routing_documents',
    columns: ['controlled_document_id', 'document_number'],
  },
  {
    category: 'projects',
    table: 'projects',
    columns: ['controlled_document_id', 'document_number'],
  },
  {
    category: 'forms',
    table: 'project_form_instances',
    columns: ['controlled_document_id', 'template_document_number_snapshot'],
  },
] as const;

export async function reportParentOnlyOperationalReferences(client: Queryable) {
  const schema = await client.query(
    `SELECT table_name,column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [candidateReferences.map((item) => item.table)]
  );
  const available = new Map<string, Set<string>>();
  for (const row of schema.rows) {
    const columns = available.get(row.table_name) || new Set<string>();
    columns.add(row.column_name);
    available.set(row.table_name, columns);
  }
  const report = [];
  for (const candidate of candidateReferences) {
    const columns = available.get(candidate.table);
    if (!columns) continue;
    const referenceColumn = candidate.columns.find((column) =>
      columns.has(column)
    );
    if (!referenceColumn) continue;
    const hasRevision =
      columns.has('document_version_history_id') ||
      columns.has('controlled_document_revision_id');
    if (hasRevision) continue;
    const count = await client.query(
      `SELECT count(*)::integer AS count FROM ${candidate.table} WHERE ${referenceColumn} IS NOT NULL`
    );
    report.push({
      category: candidate.category,
      table: candidate.table,
      count: count.rows[0]?.count || 0,
      classification: 'EXACT_REVISION_RECONCILIATION_REQUIRED',
      action: 'REPORT_ONLY_NO_REWRITE',
    });
  }
  return report;
}
