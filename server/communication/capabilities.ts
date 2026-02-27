import { sql } from 'drizzle-orm';

export const TEMPLATE_CAPABILITIES = {
  EDIT_EMAIL_TEMPLATES: 'edit_email_templates',
} as const;

const ALLOWED_ROLES = ['ADMIN', 'OWNER'];

export async function enforceTemplateEditCapability(
  db: any,
  userId: string | number | undefined
): Promise<{ allowed: boolean; reason?: string }> {
  if (!userId) {
    return { allowed: false, reason: 'Authentication required to edit email templates' };
  }

  const result = await db.execute(
    sql`SELECT id, username, role FROM users WHERE id = ${Number(userId)} AND is_active = TRUE LIMIT 1`
  );
  const user = result.rows?.[0] ?? result[0];

  if (!user) {
    return { allowed: false, reason: 'User not found or inactive' };
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    console.warn(
      `[Capability] "${TEMPLATE_CAPABILITIES.EDIT_EMAIL_TEMPLATES}" DENIED for user "${user.username}" (role: ${user.role})`
    );
    return {
      allowed: false,
      reason: `Role "${user.role}" does not have the "${TEMPLATE_CAPABILITIES.EDIT_EMAIL_TEMPLATES}" capability. Required: ${ALLOWED_ROLES.join(' or ')}.`,
    };
  }

  console.log(
    `[Capability] "${TEMPLATE_CAPABILITIES.EDIT_EMAIL_TEMPLATES}" GRANTED for user "${user.username}" (role: ${user.role})`
  );
  return { allowed: true };
}

export async function logTemplateEdit(
  db: any,
  opts: {
    templateId: string;
    editedBy: string | number | undefined;
    previousVersion: number;
    newVersion: number;
    changeNote?: string;
  }
): Promise<void> {
  await db.execute(sql`
    INSERT INTO email_template_edit_logs (template_id, edited_by, previous_version, new_version, change_note)
    VALUES (
      ${opts.templateId},
      ${opts.editedBy != null ? String(opts.editedBy) : null},
      ${opts.previousVersion},
      ${opts.newVersion},
      ${opts.changeNote ?? null}
    )
  `);
}
