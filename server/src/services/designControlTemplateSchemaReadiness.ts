import { sql } from 'drizzle-orm';

import { db } from '../../db';

export const requiredDesignControlTemplateMigration =
  '0259_design_control_form_template_database_artifacts.sql';

export class DesignControlTemplateSchemaNotReadyError extends Error {
  code = 'DESIGN_CONTROL_TEMPLATE_SCHEMA_NOT_READY';
  constructor(public missingObjects: string[]) {
    super('Required Design Control form-template migration has not completed.');
  }
}

let ready = false;

export async function assertDesignControlTemplateSchemaReady(
  client: Pick<typeof db, 'execute'> = db
) {
  if (client === db && ready) return;
  const result = await client.execute(sql`
    SELECT table_name AS object_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (
         'design_control_form_templates',
         'design_control_form_template_revisions',
         'design_control_form_template_reconciliation'
       )
    UNION ALL
    SELECT table_name || '.' || column_name AS object_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'design_control_form_template_revisions'
       AND column_name = 'blank_pdf_base64'
  `);
  const rows = (((result as any)?.rows ?? result) || []) as Array<{
    object_name?: string;
  }>;
  const present = new Set(rows.map((row) => row.object_name));
  const required = [
    'design_control_form_templates',
    'design_control_form_template_revisions',
    'design_control_form_template_reconciliation',
    'design_control_form_template_revisions.blank_pdf_base64',
  ];
  const missing = required.filter((object) => !present.has(object));
  if (missing.length)
    throw new DesignControlTemplateSchemaNotReadyError(missing);
  if (client === db) ready = true;
}
