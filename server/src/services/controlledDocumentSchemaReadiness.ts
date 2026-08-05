import { sql } from 'drizzle-orm';

import { db } from '../../db';

export const requiredControlledDocumentMigration =
  '0209_master_document_control_hardening.sql';
export const requiredControlledDocumentReconciliationMigration =
  '0245_controlled_document_legacy_reconciliation.sql';
export const requiredControlledDocumentReconciliationCorrectiveMigration =
  '0254_controlled_document_reconciliation_certification_controls.sql';
export const requiredControlledDocumentPhase2Migration =
  '0256_controlled_document_atomic_approval_release.sql';
export const requiredControlledDocumentTables = [
  'controlled_documents',
  'document_version_history',
  'controlled_document_number_registry',
  'controlled_document_revision_approvals',
] as const;

export class ControlledDocumentSchemaNotReadyError extends Error {
  code = 'CONTROLLED_DOCUMENT_SCHEMA_NOT_READY';
  constructor(public missingObjects: string[]) {
    super(
      'Required Master Document Register lifecycle migration has not completed.'
    );
  }
}

export async function assertControlledDocumentSchemaReady(
  client: Pick<typeof db, 'execute'> = db
) {
  const result = await client.execute(sql`
    SELECT table_name AS object_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'controlled_documents', 'document_version_history',
        'controlled_document_number_registry', 'controlled_document_revision_approvals'
      )
    UNION ALL
    SELECT table_name || '.' || column_name AS object_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'controlled_documents' AND column_name IN (
          'lifecycle_status', 'current_revision_id', 'current_released_revision_id',
          'working_draft_revision_id', 'number_control_status'
        ))
        OR
        (table_name = 'document_version_history' AND column_name IN (
          'revision_sequence', 'lifecycle_status', 'file_checksum', 'checksum_status'
        ))
      )
  `);
  const rows = (((result as any)?.rows ?? result) || []) as Array<{
    object_name?: string;
  }>;
  const present = new Set(rows.map((row) => row.object_name));
  const required = [
    ...requiredControlledDocumentTables,
    'controlled_documents.lifecycle_status',
    'controlled_documents.current_revision_id',
    'controlled_documents.current_released_revision_id',
    'controlled_documents.working_draft_revision_id',
    'controlled_documents.number_control_status',
    'document_version_history.revision_sequence',
    'document_version_history.lifecycle_status',
    'document_version_history.file_checksum',
    'document_version_history.checksum_status',
  ];
  const missing = required.filter((object) => !present.has(object));
  if (missing.length) throw new ControlledDocumentSchemaNotReadyError(missing);
}

/* eslint-disable prettier/prettier, @typescript-eslint/no-explicit-any */
export async function assertControlledDocumentPhase2SchemaReady(client: Pick<typeof db, 'execute'> = db) {
  await assertControlledDocumentSchemaReady(client);
  const result = await client.execute(sql`
    WITH expected_columns(name, data_type, nullable, default_fragment) AS (
      VALUES
        ('id', 'uuid', 'NO', 'gen_random_uuid'), ('controlled_document_id', 'uuid', 'NO', NULL),
        ('revision_id', 'uuid', 'NO', NULL), ('approval_id', 'uuid', 'NO', NULL),
        ('idempotency_key', 'text', 'NO', NULL), ('request_identity_hash', 'text', 'NO', NULL),
        ('file_checksum', 'text', 'NO', NULL), ('document_number_snapshot', 'text', 'NO', NULL),
        ('revision_snapshot', 'text', 'NO', NULL), ('actor_user_id', 'integer', 'NO', NULL),
        ('actor_snapshot', 'jsonb', 'NO', NULL), ('authority_snapshot', 'jsonb', 'NO', NULL),
        ('reason', 'text', 'NO', NULL), ('before_lifecycle', 'text', 'NO', NULL),
        ('after_lifecycle', 'text', 'NO', NULL), ('effective_date', 'date', 'NO', NULL),
        ('created_at', 'timestamp with time zone', 'NO', 'now()')
    ), column_issues AS (
      SELECT 'column:' || expected.name AS issue FROM expected_columns expected
      LEFT JOIN information_schema.columns actual ON actual.table_schema = 'public'
        AND actual.table_name = 'controlled_document_approval_release_events' AND actual.column_name = expected.name
      WHERE actual.column_name IS NULL OR actual.data_type <> expected.data_type OR actual.is_nullable <> expected.nullable
        OR (expected.default_fragment IS NOT NULL AND COALESCE(actual.column_default, '') NOT ILIKE '%' || expected.default_fragment || '%')
    ), required_constraints(name, kind, fragments) AS (
      VALUES
        ('events.primary_key', 'p', ARRAY['PRIMARY KEY (id)']),
        ('events.idempotency_unique', 'u', ARRAY['UNIQUE (idempotency_key)']),
        ('events.revision_unique', 'u', ARRAY['UNIQUE (revision_id)']),
        ('events.document_fk', 'f', ARRAY['FOREIGN KEY (controlled_document_id)', 'REFERENCES controlled_documents(id)', 'ON DELETE RESTRICT']),
        ('events.revision_fk', 'f', ARRAY['FOREIGN KEY (revision_id)', 'REFERENCES document_version_history(id)', 'ON DELETE RESTRICT']),
        ('events.approval_fk', 'f', ARRAY['FOREIGN KEY (approval_id)', 'REFERENCES controlled_document_revision_approvals(id)', 'ON DELETE RESTRICT']),
        ('events.actor_fk', 'f', ARRAY['FOREIGN KEY (actor_user_id)', 'REFERENCES users(id)', 'ON DELETE RESTRICT']),
        ('events.checksum_check', 'c', ARRAY['file_checksum', '[0-9a-f]{64}']),
        ('events.request_identity_check', 'c', ARRAY['request_identity_hash', '[0-9a-f]{64}']),
        ('events.reason_check', 'c', ARRAY['btrim(reason)', '<>']),
        ('events.lifecycle_check', 'c', ARRAY['after_lifecycle', 'RELEASED'])
    ), constraint_defs AS (
      SELECT contype, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = to_regclass('public.controlled_document_approval_release_events')
    ), constraint_issues AS (
      SELECT 'constraint:' || required.name AS issue FROM required_constraints required
      WHERE NOT EXISTS (SELECT 1 FROM constraint_defs actual WHERE actual.contype = required.kind::"char"
        AND NOT EXISTS (SELECT 1 FROM unnest(required.fragments) fragment WHERE actual.definition NOT ILIKE '%' || fragment || '%'))
    ), trigger_issue AS (
      SELECT 'trigger:controlled_document_approval_release_events_append_only' AS issue WHERE NOT EXISTS (
        SELECT 1 FROM pg_trigger trigger JOIN pg_proc function ON function.oid = trigger.tgfoid
        WHERE trigger.tgrelid = to_regclass('public.controlled_document_approval_release_events')
          AND trigger.tgname = 'controlled_document_approval_release_events_append_only'
          AND NOT trigger.tgisinternal AND trigger.tgenabled = 'O' AND trigger.tgtype = 27
          AND function.proname = 'reject_controlled_document_approval_release_event_mutation'
          AND function.prosrc ILIKE '%RAISE EXCEPTION%')
    ), index_issue AS (
      SELECT 'index:controlled_document_approval_release_document_idx' AS issue WHERE NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
          AND tablename = 'controlled_document_approval_release_events'
          AND indexname = 'controlled_document_approval_release_document_idx'
          AND indexdef ILIKE '%(controlled_document_id, created_at)%')
    )
    SELECT issue FROM column_issues UNION ALL SELECT issue FROM constraint_issues
    UNION ALL SELECT issue FROM trigger_issue UNION ALL SELECT issue FROM index_issue
    UNION ALL SELECT 'table:controlled_document_approval_release_events'
      WHERE to_regclass('public.controlled_document_approval_release_events') IS NULL
    UNION ALL SELECT 'column:controlled_document_revision_approvals.checksum_verification_status'
      WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'controlled_document_revision_approvals' AND column_name = 'checksum_verification_status'
        AND data_type = 'text' AND is_nullable = 'YES')
  `);
  const rows = (((result as any)?.rows ?? result) || []) as Array<{ issue?: string }>;
  const issues = rows.flatMap((row) => row.issue ? [row.issue] : []);
  if (issues.length) throw new ControlledDocumentSchemaNotReadyError(issues);
}
/* eslint-enable prettier/prettier, @typescript-eslint/no-explicit-any */

const reconciliationTables = [
  'controlled_document_reconciliation_previews',
  'controlled_document_reconciliation_events',
  'controlled_document_reconciliation_evidence',
] as const;

const reconciliationColumns: Record<string, string[]> = {
  controlled_document_reconciliation_previews: [
    'id:uuid',
    'preview_hash:text',
    'policy_version:text',
    'selected_document_ids:jsonb',
    'assessment_snapshot:jsonb',
    'actor_user_id:integer',
    'actor_snapshot:jsonb',
    'expires_at:timestamp with time zone',
    'created_at:timestamp with time zone',
  ],
  controlled_document_reconciliation_events: [
    'id:uuid',
    'preview_id:uuid',
    'controlled_document_id:uuid',
    'revision_id:uuid',
    'idempotency_key:text',
    'event_type:text',
    'provenance:text',
    'policy_version:text',
    'original_snapshot:jsonb',
    'proposed_changes:jsonb',
    'completed_changes:jsonb',
    'before_snapshot:jsonb',
    'after_snapshot:jsonb',
    'actor_user_id:integer',
    'actor_snapshot:jsonb',
    'reason:text',
    'checksum:text',
    'file_identity:text',
    'created_at:timestamp with time zone',
  ],
  controlled_document_reconciliation_evidence: [
    'id:uuid',
    'controlled_document_id:uuid',
    'revision_id:uuid',
    'evidence_type:text',
    'evidence_payload:jsonb',
    'immutable_file_path:text',
    'immutable_file_checksum:text',
    'immutable_file_media_type:text',
    'immutable_file_size:bigint',
    'immutable_file_provenance:jsonb',
    'confirmed_at:timestamp with time zone',
    'confirmed_by_user_id:integer',
    'confirmation_reason:text',
    'actor_user_id:integer',
    'actor_snapshot:jsonb',
    'reason:text',
    'created_at:timestamp with time zone',
  ],
};

const reconciliationConstraints = [
  {
    name: 'previews.primary_key',
    table: reconciliationTables[0],
    fragments: ['PRIMARY KEY', '(id)'],
  },
  {
    name: 'events.primary_key',
    table: reconciliationTables[1],
    fragments: ['PRIMARY KEY', '(id)'],
  },
  {
    name: 'evidence.primary_key',
    table: reconciliationTables[2],
    fragments: ['PRIMARY KEY', '(id)'],
  },
  {
    name: 'events.idempotency_unique',
    table: reconciliationTables[1],
    fragments: ['UNIQUE', '(idempotency_key)'],
  },
  {
    name: 'previews.actor_user_fk',
    table: reconciliationTables[0],
    fragments: ['FOREIGN KEY', '(actor_user_id)', 'REFERENCES users(id)'],
  },
  {
    name: 'events.preview_fk',
    table: reconciliationTables[1],
    fragments: [
      'FOREIGN KEY',
      '(preview_id)',
      'REFERENCES controlled_document_reconciliation_previews(id)',
    ],
  },
  {
    name: 'events.document_fk',
    table: reconciliationTables[1],
    fragments: [
      'FOREIGN KEY',
      '(controlled_document_id)',
      'REFERENCES controlled_documents(id)',
    ],
  },
  {
    name: 'events.revision_fk',
    table: reconciliationTables[1],
    fragments: [
      'FOREIGN KEY',
      '(revision_id)',
      'REFERENCES document_version_history(id)',
    ],
  },
  {
    name: 'events.actor_user_fk',
    table: reconciliationTables[1],
    fragments: ['FOREIGN KEY', '(actor_user_id)', 'REFERENCES users(id)'],
  },
  {
    name: 'evidence.document_fk',
    table: reconciliationTables[2],
    fragments: [
      'FOREIGN KEY',
      '(controlled_document_id)',
      'REFERENCES controlled_documents(id)',
    ],
  },
  {
    name: 'evidence.revision_fk',
    table: reconciliationTables[2],
    fragments: [
      'FOREIGN KEY',
      '(revision_id)',
      'REFERENCES document_version_history(id)',
    ],
  },
  {
    name: 'evidence.actor_user_fk',
    table: reconciliationTables[2],
    fragments: ['FOREIGN KEY', '(actor_user_id)', 'REFERENCES users(id)'],
  },
  {
    name: 'evidence.confirmed_by_user_fk',
    table: reconciliationTables[2],
    fragments: [
      'FOREIGN KEY',
      '(confirmed_by_user_id)',
      'REFERENCES users(id)',
    ],
  },
] as const;

const reconciliationIndexes = [
  'controlled_document_reconciliation_events_document_idx',
  'controlled_document_reconciliation_evidence_document_idx',
  'controlled_document_reconciliation_events_idempotency_uidx',
] as const;

export const controlledDocumentReconciliationSchemaManifest = {
  migrations: [
    requiredControlledDocumentReconciliationMigration,
    requiredControlledDocumentReconciliationCorrectiveMigration,
  ],
  tables: reconciliationTables,
  columns: reconciliationColumns,
  constraints: reconciliationConstraints,
  checkConstraints: [] as string[],
  indexes: reconciliationIndexes,
  triggers: [
    'controlled_document_reconciliation_events_append_only',
    'controlled_document_reconciliation_evidence_append_only',
  ],
  triggerFunction: 'reject_controlled_document_reconciliation_history_mutation',
} as const;

export const requiredControlledDocumentReconciliationObjects = [
  ...reconciliationTables,
  ...Object.entries(reconciliationColumns).flatMap(([table, columns]) =>
    columns.map((column) => `${table}.${column.split(':')[0]}`)
  ),
  ...reconciliationConstraints.map((value) => value.name),
  ...reconciliationIndexes,
  ...controlledDocumentReconciliationSchemaManifest.triggers,
  controlledDocumentReconciliationSchemaManifest.triggerFunction,
] as const;

type QueryClient = {
  query(
    sql: string,
    values?: unknown[]
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
};

export async function assertControlledDocumentReconciliationSchemaReady(
  client: QueryClient
) {
  const result = await client.query(`
    SELECT 'table' AS object_kind, table_name AS object_name, NULL::text AS definition,
      NULL::text AS data_type, NULL::text AS enabled, table_name AS parent_name
    FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'controlled_document_reconciliation_%'
    UNION ALL
    SELECT 'column', table_name || '.' || column_name, NULL, data_type, NULL, table_name
    FROM information_schema.columns
      WHERE table_schema='public' AND table_name LIKE 'controlled_document_reconciliation_%'
    UNION ALL
    SELECT 'constraint', con.conname, pg_get_constraintdef(con.oid), NULL, NULL, rel.relname
    FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      WHERE ns.nspname='public' AND rel.relname LIKE 'controlled_document_reconciliation_%'
    UNION ALL
    SELECT 'index', indexname, indexdef, NULL, NULL, tablename FROM pg_indexes WHERE schemaname='public'
      AND tablename LIKE 'controlled_document_reconciliation_%'
    UNION ALL
    SELECT 'trigger', trg.tgname, pg_get_triggerdef(trg.oid), NULL, trg.tgenabled::text, rel.relname
      FROM pg_trigger trg JOIN pg_class rel ON rel.oid=trg.tgrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      WHERE ns.nspname='public' AND NOT trg.tgisinternal
        AND rel.relname LIKE 'controlled_document_reconciliation_%'
    UNION ALL
    SELECT 'function', proc.proname, pg_get_functiondef(proc.oid), NULL, NULL, NULL
      FROM pg_proc proc JOIN pg_namespace ns ON ns.oid=proc.pronamespace
      WHERE ns.nspname='public' AND proc.proname='reject_controlled_document_reconciliation_history_mutation'
  `);
  const facts = new Map(
    result.rows.map((row) => [
      `${String(row.object_kind)}:${String(row.object_name)}`,
      row,
    ])
  );
  const missing: string[] = [];
  for (const table of reconciliationTables)
    if (!facts.has(`table:${table}`)) missing.push(table);
  for (const [table, columns] of Object.entries(reconciliationColumns)) {
    for (const requirement of columns) {
      const [column, dataType] = requirement.split(':');
      const name = `${table}.${column}`;
      const fact = facts.get(`column:${name}`);
      if (!fact) missing.push(name);
      else if (String(fact.data_type).toLowerCase() !== dataType)
        missing.push(`${name}:invalid_type`);
    }
  }
  const constraintFacts = result.rows.filter(
    (row) => row.object_kind === 'constraint'
  );
  for (const requirement of reconciliationConstraints) {
    const fact = constraintFacts.find(
      (candidate) =>
        candidate.parent_name === requirement.table &&
        requirement.fragments.every((fragment) =>
          String(candidate.definition || '')
            .toUpperCase()
            .includes(fragment.toUpperCase())
        )
    );
    if (!fact) missing.push(`${requirement.name}:missing_or_invalid`);
  }
  for (const name of reconciliationIndexes) {
    const fact = facts.get(`index:${name}`);
    if (!fact) missing.push(name);
    else if (
      name.endsWith('_idempotency_uidx') &&
      !/^CREATE UNIQUE INDEX/i.test(String(fact.definition || ''))
    )
      missing.push(`${name}:not_unique`);
  }
  for (const name of controlledDocumentReconciliationSchemaManifest.triggers) {
    const fact = facts.get(`trigger:${name}`);
    const definition = String(fact?.definition || '').toUpperCase();
    const expectedTable = name.includes('_events_')
      ? 'controlled_document_reconciliation_events'
      : 'controlled_document_reconciliation_evidence';
    if (!fact) missing.push(name);
    else {
      if (fact.enabled !== 'O') missing.push(`${name}:disabled`);
      if (
        fact.parent_name !== expectedTable ||
        !definition.includes('BEFORE') ||
        !definition.includes('UPDATE') ||
        !definition.includes('DELETE') ||
        !definition.includes(
          controlledDocumentReconciliationSchemaManifest.triggerFunction.toUpperCase()
        ) ||
        !definition.includes(expectedTable.toUpperCase())
      )
        missing.push(`${name}:invalid_definition`);
    }
  }
  const triggerFunction = facts.get(
    `function:${controlledDocumentReconciliationSchemaManifest.triggerFunction}`
  );
  const functionDefinition = String(triggerFunction?.definition || '');
  if (
    !triggerFunction ||
    !functionDefinition.includes(
      'CONTROLLED_DOCUMENT_RECONCILIATION_HISTORY_IS_APPEND_ONLY'
    ) ||
    !/RAISE\s+EXCEPTION/i.test(functionDefinition)
  )
    missing.push(
      `${controlledDocumentReconciliationSchemaManifest.triggerFunction}:invalid_definition`
    );
  if (missing.length)
    throw new ControlledDocumentSchemaNotReadyError(
      Array.from(new Set(missing))
    );
}
