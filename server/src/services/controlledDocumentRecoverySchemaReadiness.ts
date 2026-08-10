import { pool } from '../../db';

export const requiredControlledDocumentRecoveryMigration =
  '0260_controlled_document_source_recovery.sql';

export const controlledDocumentRecoverySchemaManifest = {
  tables: [
    'controlled_document_recovery_previews',
    'controlled_document_recovery_imports',
    'controlled_document_recovery_events',
    'controlled_document_recovery_dispositions',
  ],
  columns: {
    controlled_document_recovery_previews: [
      'id:uuid:NO',
      'preview_hash:text:NO',
      'policy_version:text:NO',
      'normalized_document_code:text:NO',
      'controlled_document_id:uuid:NO',
      'revision_id:uuid:YES',
      'source_snapshot:jsonb:NO',
      'document_snapshot:jsonb:NO',
      'blockers:jsonb:NO',
      'recommended_action:text:NO',
      'actor_user_id:integer:NO',
      'actor_snapshot:jsonb:NO',
      'expires_at:timestamp with time zone:NO',
      'created_at:timestamp with time zone:NO',
    ],
    controlled_document_recovery_imports: [
      'id:uuid:NO',
      'preview_id:uuid:NO',
      'controlled_document_id:uuid:NO',
      'revision_id:uuid:YES',
      'idempotency_key:text:NO',
      'request_identity_hash:text:NO',
      'storage_object_path:text:YES',
      'storage_provider:text:YES',
      'original_filename:text:NO',
      'media_type:text:NO',
      'file_size:bigint:NO',
      'file_checksum:text:NO',
      'expected_checksum:text:YES',
      'source_type:text:NO',
      'source_provenance:jsonb:NO',
      'status:text:NO',
      'failure_code:text:YES',
      'actor_user_id:integer:NO',
      'actor_snapshot:jsonb:NO',
      'reason:text:NO',
      'created_at:timestamp with time zone:NO',
      'staged_at:timestamp with time zone:YES',
      'consumed_at:timestamp with time zone:YES',
    ],
    controlled_document_recovery_events: [
      'id:uuid:NO',
      'preview_id:uuid:YES',
      'import_id:uuid:YES',
      'controlled_document_id:uuid:NO',
      'revision_id:uuid:YES',
      'idempotency_key:text:NO',
      'event_type:text:NO',
      'policy_version:text:NO',
      'evidence_snapshot:jsonb:NO',
      'checksum:text:YES',
      'actor_user_id:integer:NO',
      'actor_snapshot:jsonb:NO',
      'reason:text:NO',
      'created_at:timestamp with time zone:NO',
    ],
    controlled_document_recovery_dispositions: [
      'id:uuid:NO',
      'normalized_document_code:text:NO',
      'authoritative_document_id:uuid:NO',
      'related_document_ids:jsonb:NO',
      'disposition:text:NO',
      'supporting_evidence:jsonb:NO',
      'actor_user_id:integer:NO',
      'actor_snapshot:jsonb:NO',
      'reason:text:NO',
      'created_at:timestamp with time zone:NO',
    ],
  },
  indexes: {
    controlled_document_recovery_imports_idempotency_uidx: {
      table: 'controlled_document_recovery_imports',
      columns: ['idempotency_key'],
      unique: true,
    },
    controlled_document_recovery_events_idempotency_uidx: {
      table: 'controlled_document_recovery_events',
      columns: ['idempotency_key'],
      unique: true,
    },
    controlled_document_recovery_previews_document_idx: {
      table: 'controlled_document_recovery_previews',
      columns: ['controlled_document_id', 'created_at'],
      unique: false,
    },
    controlled_document_recovery_imports_document_idx: {
      table: 'controlled_document_recovery_imports',
      columns: ['controlled_document_id', 'created_at'],
      unique: false,
    },
    controlled_document_recovery_imports_status_idx: {
      table: 'controlled_document_recovery_imports',
      columns: ['status', 'created_at'],
      unique: false,
    },
    controlled_document_recovery_events_document_idx: {
      table: 'controlled_document_recovery_events',
      columns: ['controlled_document_id', 'created_at'],
      unique: false,
    },
    controlled_document_recovery_dispositions_code_idx: {
      table: 'controlled_document_recovery_dispositions',
      columns: ['normalized_document_code', 'created_at'],
      unique: false,
    },
  },
  foreignKeys: {
    controlled_document_recovery_previews: {
      controlled_document_id: 'controlled_documents(id)',
      revision_id: 'document_version_history(id)',
      actor_user_id: 'users(id)',
    },
    controlled_document_recovery_imports: {
      preview_id: 'controlled_document_recovery_previews(id)',
      controlled_document_id: 'controlled_documents(id)',
      revision_id: 'document_version_history(id)',
      actor_user_id: 'users(id)',
    },
    controlled_document_recovery_events: {
      preview_id: 'controlled_document_recovery_previews(id)',
      import_id: 'controlled_document_recovery_imports(id)',
      controlled_document_id: 'controlled_documents(id)',
      revision_id: 'document_version_history(id)',
      actor_user_id: 'users(id)',
    },
    controlled_document_recovery_dispositions: {
      authoritative_document_id: 'controlled_documents(id)',
      actor_user_id: 'users(id)',
    },
  },
  checks: {
    controlled_document_recovery_preview_hash_format: [
      'CHECK',
      'PREVIEW_HASH',
      '^[0-9A-F]{64}$',
    ],
    controlled_document_recovery_import_checksum_format: [
      'CHECK',
      'FILE_CHECKSUM',
      '^[0-9A-F]{64}$',
    ],
    controlled_document_recovery_import_expected_checksum_format: [
      'CHECK',
      'EXPECTED_CHECKSUM IS NULL',
      '^[0-9A-F]{64}$',
    ],
    controlled_document_recovery_import_size_positive: [
      'FILE_SIZE > 0',
      'FILE_SIZE <= 52428800',
    ],
    controlled_document_recovery_import_status_allowed: [
      'RESERVED',
      'STAGED',
      'CONSUMED',
      'STAGING_FAILED',
      'CLEANUP_REQUIRED',
    ],
    controlled_document_recovery_import_source_type_allowed: [
      'DIRECT_UPLOAD',
      'GOOGLE_DRIVE_PROVENANCE',
      'LEGACY_EPOCH_REFERENCE',
      'OTHER_VERIFIED_SOURCE',
    ],
    controlled_document_recovery_event_checksum_format: [
      'CHECKSUM IS NULL',
      '^[0-9A-F]{64}$',
    ],
    controlled_document_recovery_disposition_allowed: [
      'AUTHORITATIVE_RECORD_SELECTED',
      'REFERENCE_ONLY',
      'OBSOLETE',
      'VOID',
      'MANUAL_REVIEW_REQUIRED',
    ],
  },
  triggers: [
    'controlled_document_recovery_previews_append_only',
    'controlled_document_recovery_events_append_only',
    'controlled_document_recovery_dispositions_append_only',
  ],
  triggerFunction: 'reject_controlled_document_recovery_history_mutation',
} as const;

export class ControlledDocumentRecoverySchemaNotReadyError extends Error {
  code = 'CONTROLLED_DOCUMENT_RECOVERY_SCHEMA_NOT_READY';
  constructor(public missingObjects: string[]) {
    super('Document File Recovery schema certification has not completed.');
  }
}

type Queryable = {
  query(
    sql: string,
    values?: unknown[]
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
};

export async function assertControlledDocumentRecoverySchemaReady(
  client: Queryable = pool
) {
  const result = await client.query(`
    SELECT 'table'::text object_kind, table_name::text object_name, table_name::text parent_name,
      NULL::text definition, NULL::text data_type, NULL::text nullable, NULL::text enabled
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name LIKE 'controlled_document_recovery_%'
    UNION ALL
    SELECT 'column', (table_name || '.' || column_name)::text, table_name::text, NULL,
      data_type, is_nullable, NULL
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name LIKE 'controlled_document_recovery_%'
    UNION ALL
    SELECT 'index', indexname::text, tablename::text, indexdef, NULL, NULL, NULL
    FROM pg_indexes
    WHERE schemaname='public' AND tablename LIKE 'controlled_document_recovery_%'
    UNION ALL
    SELECT 'constraint', con.conname::text, rel.relname::text, pg_get_constraintdef(con.oid),
      NULL, NULL, NULL
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid
    JOIN pg_namespace ns ON ns.oid=rel.relnamespace
    WHERE ns.nspname='public' AND rel.relname LIKE 'controlled_document_recovery_%'
    UNION ALL
    SELECT 'trigger', trg.tgname::text, rel.relname::text, pg_get_triggerdef(trg.oid),
      NULL, NULL, trg.tgenabled::text
    FROM pg_trigger trg
    JOIN pg_class rel ON rel.oid=trg.tgrelid
    JOIN pg_namespace ns ON ns.oid=rel.relnamespace
    WHERE ns.nspname='public' AND NOT trg.tgisinternal
      AND rel.relname LIKE 'controlled_document_recovery_%'
    UNION ALL
    SELECT 'function', proc.proname::text, NULL, pg_get_functiondef(proc.oid),
      NULL, NULL, NULL
    FROM pg_proc proc
    JOIN pg_namespace ns ON ns.oid=proc.pronamespace
    WHERE ns.nspname='public'
      AND proc.proname='reject_controlled_document_recovery_history_mutation'
  `);
  const facts = new Map(
    result.rows.map((row) => [`${row.object_kind}:${row.object_name}`, row])
  );
  const missing: string[] = [];
  for (const table of controlledDocumentRecoverySchemaManifest.tables) {
    if (!facts.has(`table:${table}`)) missing.push(table);
  }
  for (const [table, requirements] of Object.entries(
    controlledDocumentRecoverySchemaManifest.columns
  )) {
    for (const requirement of requirements) {
      const [column, type, nullable] = requirement.split(':');
      const fact = facts.get(`column:${table}.${column}`);
      if (!fact) missing.push(`${table}.${column}`);
      else {
        if (String(fact.data_type).toLowerCase() !== type)
          missing.push(`${table}.${column}:invalid_type`);
        if (String(fact.nullable).toUpperCase() !== nullable)
          missing.push(`${table}.${column}:invalid_nullability`);
      }
    }
  }
  for (const [index, requirement] of Object.entries(
    controlledDocumentRecoverySchemaManifest.indexes
  )) {
    const fact = facts.get(`index:${index}`);
    if (!fact) missing.push(index);
    if (fact) {
      const definition = String(fact.definition || '')
        .replace(/["\s]/g, '')
        .toUpperCase();
      const columns = `(${requirement.columns.join(',')})`.toUpperCase();
      const unique = definition.startsWith('CREATEUNIQUEINDEX');
      if (
        fact.parent_name !== requirement.table ||
        !definition.includes(columns) ||
        unique !== requirement.unique
      )
        missing.push(`${index}:invalid_definition`);
    }
  }
  for (const table of controlledDocumentRecoverySchemaManifest.tables) {
    const tableConstraints = result.rows.filter(
      (row) => row.object_kind === 'constraint' && row.parent_name === table
    );
    if (
      !tableConstraints.some(
        (row) =>
          String(row.definition || '').toUpperCase() === 'PRIMARY KEY (ID)'
      )
    ) {
      missing.push(`${table}.id:primary_key_missing`);
    }
    for (const [column, target] of Object.entries(
      controlledDocumentRecoverySchemaManifest.foreignKeys[
        table as keyof typeof controlledDocumentRecoverySchemaManifest.foreignKeys
      ]
    )) {
      const definition = tableConstraints
        .map((row) => String(row.definition || '').toUpperCase())
        .find((value) =>
          value.includes(`FOREIGN KEY (${column.toUpperCase()})`)
        );
      if (!definition) missing.push(`${table}.${column}:foreign_key_missing`);
      else if (
        !definition.includes(`REFERENCES ${target.toUpperCase()}`) ||
        !definition.includes('ON DELETE RESTRICT')
      )
        missing.push(`${table}.${column}:foreign_key_invalid`);
    }
  }
  for (const trigger of controlledDocumentRecoverySchemaManifest.triggers) {
    const fact = facts.get(`trigger:${trigger}`);
    const definition = String(fact?.definition || '').toUpperCase();
    if (!fact) missing.push(trigger);
    else if (
      fact.enabled !== 'O' ||
      !definition.includes('BEFORE') ||
      !definition.includes('UPDATE') ||
      !definition.includes('DELETE') ||
      !definition.includes(
        controlledDocumentRecoverySchemaManifest.triggerFunction.toUpperCase()
      )
    )
      missing.push(`${trigger}:invalid_definition`);
  }
  const fn = facts.get(
    `function:${controlledDocumentRecoverySchemaManifest.triggerFunction}`
  );
  if (
    !fn ||
    ![
      'RETURNS TRIGGER',
      'LANGUAGE PLPGSQL',
      'RAISE EXCEPTION',
      'CONTROLLED_DOCUMENT_RECOVERY_HISTORY_IS_APPEND_ONLY',
    ].every((fragment) =>
      String(fn.definition || '')
        .toUpperCase()
        .includes(fragment)
    )
  )
    missing.push(
      `${controlledDocumentRecoverySchemaManifest.triggerFunction}:invalid_definition`
    );
  for (const [constraint, fragments] of Object.entries(
    controlledDocumentRecoverySchemaManifest.checks
  )) {
    const definition = String(
      facts.get(`constraint:${constraint}`)?.definition || ''
    ).toUpperCase();
    if (
      !definition ||
      !fragments.every((fragment) => definition.includes(fragment))
    )
      missing.push(`constraint:${constraint}:invalid_definition`);
  }
  if (missing.length)
    throw new ControlledDocumentRecoverySchemaNotReadyError(
      Array.from(new Set(missing))
    );
}
