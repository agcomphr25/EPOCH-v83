import { sql } from 'drizzle-orm';

import { db } from '../../db';

export const requiredProjectFormMigration =
  '0212_design_control_project_form_instances.sql';
export const requiredProjectFormObjects = [
  'project_form_instances',
  'project_form_instance_revisions',
  'project_form_approvals',
  'project_form_attachments',
] as const;

export class ProjectFormSchemaNotReadyError extends Error {
  readonly code = 'PROJECT_FORM_SCHEMA_NOT_READY';

  constructor(public missingObjects: string[]) {
    super('Required Project Form Instance migration has not completed.');
  }
}

export async function assertProjectFormSchemaReady(client: any = db) {
  const result = await client.execute(sql`
    SELECT table_name AS object_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'project_form_instances',
        'project_form_instance_revisions',
        'project_form_approvals',
        'project_form_attachments'
      )
  `);
  const rows = (result as any).rows ?? result;
  const present = new Set(
    (Array.isArray(rows) ? rows : []).map((row: any) => String(row.object_name))
  );
  const missing = requiredProjectFormObjects.filter(
    (objectName) => !present.has(objectName)
  );
  if (missing.length > 0) {
    throw new ProjectFormSchemaNotReadyError([...missing]);
  }
}
