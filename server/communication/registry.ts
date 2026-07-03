import { sql } from 'drizzle-orm';
import type { EmailTemplate } from './types';
import { enforceTemplateEditCapability, logTemplateEdit } from './capabilities';

export const VENDOR_CONTACT_EMAIL = 'glenn@agadvanced.com';
export const LEGACY_VENDOR_CONTACT_EMAILS = ['laurie.tandy@agadvanced.com'];

export function normalizeVendorTemplateContactText(value: string | null | undefined): string {
  if (!value) return value ?? '';
  let normalized = value;
  for (const legacyEmail of LEGACY_VENDOR_CONTACT_EMAILS) {
    normalized = normalized.replace(new RegExp(escapeRegExp(legacyEmail), 'gi'), VENDOR_CONTACT_EMAIL);
  }
  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function getTemplateByKey(
  db: any,
  key: string
): Promise<EmailTemplate | null> {
  const rows = await db.execute(
    sql`SELECT * FROM email_templates WHERE key = ${key} AND is_active = TRUE LIMIT 1`
  );
  const row = rows.rows?.[0] ?? rows[0];
  if (!row) return null;
  return rowToTemplate(row);
}

export async function getAllTemplates(db: any): Promise<EmailTemplate[]> {
  const rows = await db.execute(
    sql`SELECT * FROM email_templates ORDER BY key ASC`
  );
  const data = rows.rows ?? rows;
  return data.map(rowToTemplate);
}

export async function upsertTemplate(
  db: any,
  template: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'> & { updatedBy?: string }
): Promise<void> {
  await db.execute(sql`
    INSERT INTO email_templates (key, name, subject, body_html, body_text, allowed_variables, attachment_rules, version, is_active, updated_by, updated_at)
    VALUES (
      ${template.key},
      ${template.name},
      ${template.subject},
      ${template.bodyHtml},
      ${template.bodyText ?? null},
      ${JSON.stringify(template.allowedVariables ?? [])},
      ${JSON.stringify(template.attachmentRules ?? {})},
      ${template.version},
      ${template.isActive ?? true},
      ${template.updatedBy ?? null},
      NOW()
    )
    ON CONFLICT (key) DO UPDATE SET
      name = EXCLUDED.name,
      subject = EXCLUDED.subject,
      body_html = EXCLUDED.body_html,
      body_text = EXCLUDED.body_text,
      allowed_variables = EXCLUDED.allowed_variables,
      attachment_rules = EXCLUDED.attachment_rules,
      version = EXCLUDED.version,
      current_version = EXCLUDED.version,
      is_active = EXCLUDED.is_active,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `);
}

function rowToTemplate(row: any): EmailTemplate {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text ?? null,
    allowedVariables: Array.isArray(row.allowed_variables)
      ? row.allowed_variables
      : JSON.parse(row.allowed_variables ?? '[]'),
    attachmentRules: typeof row.attachment_rules === 'object'
      ? row.attachment_rules ?? {}
      : JSON.parse(row.attachment_rules ?? '{}'),
    version: row.version ?? 1,
    currentVersion: row.current_version ?? 1,
    isActive: row.is_active ?? true,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    updatedBy: row.updated_by ?? null,
  };
}

export interface UpdateTemplateWithVersioningOptions {
  templateId: string;
  updates: {
    name?: string;
    subject?: string;
    bodyHtml?: string;
    bodyText?: string | null;
    allowedVariables?: string[];
    attachmentRules?: Record<string, unknown>;
    isActive?: boolean;
  };
  updatedBy?: string;
  changeNote?: string;
}

export async function updateTemplateWithVersioning(
  db: any,
  opts: UpdateTemplateWithVersioningOptions
): Promise<{ template: EmailTemplate | null; error?: string; statusCode?: number }> {
  const capCheck = await enforceTemplateEditCapability(db, opts.updatedBy);
  if (!capCheck.allowed) {
    return { template: null, error: capCheck.reason, statusCode: 403 };
  }

  const current = await db.execute(
    sql`SELECT * FROM email_templates WHERE id = ${opts.templateId} LIMIT 1`
  );
  const row = current.rows?.[0] ?? current[0];
  if (!row) return { template: null, error: 'Template not found', statusCode: 404 };

  const oldVersion = row.current_version ?? row.version ?? 1;

  await db.execute(sql`
    INSERT INTO email_template_versions (template_id, version, subject, body_html, body_text, attachment_rules, allowed_variables, created_by, change_note)
    VALUES (
      ${row.id},
      ${oldVersion},
      ${row.subject},
      ${row.body_html},
      ${row.body_text ?? null},
      ${JSON.stringify(typeof row.attachment_rules === 'object' ? row.attachment_rules ?? {} : JSON.parse(row.attachment_rules ?? '{}'))},
      ${JSON.stringify(Array.isArray(row.allowed_variables) ? row.allowed_variables : JSON.parse(row.allowed_variables ?? '[]'))},
      ${opts.updatedBy ?? null},
      ${opts.changeNote ?? null}
    )
  `);

  const newVersion = oldVersion + 1;
  const u = opts.updates;

  await db.execute(sql`
    UPDATE email_templates SET
      name = ${u.name ?? row.name},
      subject = ${u.subject ?? row.subject},
      body_html = ${u.bodyHtml ?? row.body_html},
      body_text = ${u.bodyText !== undefined ? u.bodyText : (row.body_text ?? null)},
      allowed_variables = ${JSON.stringify(u.allowedVariables ?? (Array.isArray(row.allowed_variables) ? row.allowed_variables : JSON.parse(row.allowed_variables ?? '[]')))},
      attachment_rules = ${JSON.stringify(u.attachmentRules ?? (typeof row.attachment_rules === 'object' ? row.attachment_rules ?? {} : JSON.parse(row.attachment_rules ?? '{}')))},
      is_active = ${u.isActive ?? row.is_active ?? true},
      version = ${newVersion},
      current_version = ${newVersion},
      updated_at = NOW(),
      updated_by = ${opts.updatedBy ?? null}
    WHERE id = ${opts.templateId}
  `);

  await logTemplateEdit(db, {
    templateId: opts.templateId,
    editedBy: opts.updatedBy,
    previousVersion: oldVersion,
    newVersion,
    changeNote: opts.changeNote,
  });

  const updated = await db.execute(
    sql`SELECT * FROM email_templates WHERE id = ${opts.templateId} LIMIT 1`
  );
  const updatedRow = updated.rows?.[0] ?? updated[0];
  return { template: updatedRow ? rowToTemplate(updatedRow) : null };
}

export async function getTemplateVersionHistory(
  db: any,
  templateId: string
): Promise<any[]> {
  const rows = await db.execute(
    sql`SELECT * FROM email_template_versions WHERE template_id = ${templateId} ORDER BY version DESC`
  );
  return (rows.rows ?? rows).map((r: any) => ({
    id: r.id,
    templateId: r.template_id,
    version: r.version,
    subject: r.subject,
    bodyHtml: r.body_html,
    bodyText: r.body_text,
    attachmentRules: typeof r.attachment_rules === 'object' ? r.attachment_rules : JSON.parse(r.attachment_rules ?? '{}'),
    allowedVariables: Array.isArray(r.allowed_variables) ? r.allowed_variables : JSON.parse(r.allowed_variables ?? '[]'),
    createdAt: r.created_at ? new Date(r.created_at) : null,
    createdBy: r.created_by,
    changeNote: r.change_note,
  }));
}

// ─── Seed: Vendor Email Templates (Version 1) ─────────────────────────────────
// Copies subject + body exactly from vendorPOs.ts hardcoded strings.
// Runtime JS interpolations converted to {{variable}} placeholders.
// Idempotent — only inserts rows that don't already exist.

export async function seedVendorEmailTemplates(db: any): Promise<void> {
  const existing = await db.execute(
    sql`SELECT key FROM email_templates WHERE key IN ('vendor_rfq', 'vendor_po_issue', 'vendor_po_resend')`
  );
  const existingKeys = new Set(
    (existing.rows ?? existing).map((r: any) => r.key)
  );

  const templates = [VENDOR_RFQ_TEMPLATE, VENDOR_PO_ISSUE_TEMPLATE, VENDOR_PO_RESEND_TEMPLATE];

  for (const tpl of templates) {
    if (!existingKeys.has(tpl.key)) {
      await db.execute(sql`
        INSERT INTO email_templates (key, name, subject, body_html, body_text, allowed_variables, attachment_rules, version, is_active)
        VALUES (
          ${tpl.key},
          ${tpl.name},
          ${tpl.subject},
          ${tpl.bodyHtml},
          ${tpl.bodyText},
          ${JSON.stringify(tpl.allowedVariables)},
          ${JSON.stringify(tpl.attachmentRules)},
          1,
          TRUE
        )
      `);
      console.log(`  📧 Seeded email template: ${tpl.key}`);
    }
  }
}

// ─── One-time patch: ensure vendor email templates have PDF attachment rule ──────
// The seed above is insert-only (skips existing rows), so if these templates
// were seeded before attachVendorPOPDF was added they never got the flag.
// This function is idempotent — it only updates rows that are still missing it.
export async function ensureVendorPOAttachmentRules(db: any): Promise<void> {
  try {
    const rules = JSON.stringify({ attachVendorPOPDF: true, systemNotice: true });
    const result = await db.execute(sql`
      UPDATE email_templates
      SET attachment_rules = ${rules}::jsonb
      WHERE key IN ('vendor_rfq', 'vendor_po_issue', 'vendor_po_resend')
        AND (attachment_rules->>'attachVendorPOPDF') IS DISTINCT FROM 'true'
    `);
    const count = result.rowCount ?? result.count ?? 0;
    if (count > 0) {
      console.log(`  ✅ Patched ${count} vendor email template(s) to include PDF attachment rule`);
    }
  } catch (err: any) {
    console.warn('[ensureVendorPOAttachmentRules] Failed to patch attachment rules:', err.message);
  }
}

// ─── Template Definitions ─────────────────────────────────────────────────────

export async function ensureVendorRFQContactEmail(db: any): Promise<void> {
  try {
    const oldEmail = LEGACY_VENDOR_CONTACT_EMAILS[0];
    const newEmail = VENDOR_CONTACT_EMAIL;
    const result = await db.execute(sql`
      UPDATE email_templates
      SET body_html = REPLACE(body_html, ${oldEmail}, ${newEmail}),
          body_text = REPLACE(body_text, ${oldEmail}, ${newEmail}),
          updated_at = NOW()
      WHERE key IN ('vendor_rfq', 'vendor_po_issue', 'vendor_po_resend')
        AND (
          body_html LIKE ${`%${oldEmail}%`}
          OR body_text LIKE ${`%${oldEmail}%`}
        )
    `);
    const count = result.rowCount ?? result.count ?? 0;
    if (count > 0) {
      console.log(`  Patched ${count} vendor email template(s) to use ${newEmail}`);
    }
  } catch (err: any) {
    console.warn('[ensureVendorRFQContactEmail] Failed to patch RFQ contact email:', err.message);
  }
}

export async function ensureVendorPONoMagicLinkTemplates(db: any): Promise<void> {
  try {
    const templates = [VENDOR_PO_ISSUE_TEMPLATE, VENDOR_PO_RESEND_TEMPLATE];
    for (const tpl of templates) {
      await db.execute(sql`
        UPDATE email_templates
        SET name = ${tpl.name},
            subject = ${tpl.subject},
            body_html = ${tpl.bodyHtml},
            body_text = ${tpl.bodyText},
            allowed_variables = ${JSON.stringify(tpl.allowedVariables)}::jsonb,
            attachment_rules = ${JSON.stringify(tpl.attachmentRules)}::jsonb,
            updated_at = NOW()
        WHERE key = ${tpl.key}
      `);
    }
    console.log('  Patched vendor PO email templates to remove vendor confirmation workflow');
  } catch (err: any) {
    console.warn('[ensureVendorPONoMagicLinkTemplates] Failed to patch vendor PO templates:', err.message);
  }
}

export const VENDOR_RFQ_TEMPLATE = {
  key: 'vendor_rfq',
  name: 'Vendor RFQ',
  subject: 'Request for Quote from AG Composites',
  allowedVariables: [
    'vendor_name',
    'vendor_contact_person',
    'desired_delivery_date',
    'items_table',
    'items_list',
  ],
  attachmentRules: { attachVendorPOPDF: true, systemNotice: true },
  bodyHtml: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Request for Quote from AG Composites</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #e67e22;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #1a1a1a;
      font-size: 24px;
      margin: 0;
    }
    .content { margin-bottom: 30px; }
    .rfq-details {
      background-color: #fef9e7;
      border-radius: 6px;
      padding: 20px;
      margin: 20px 0;
    }
    .rfq-details p { margin: 5px 0; }
    .notice {
      background-color: #fef9e7;
      border-left: 4px solid #e67e22;
      padding: 12px;
      margin: 20px 0;
      font-size: 14px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 14px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Request for Quote</h1>
    </div>
    <div class="content">
      <p>Hello{{vendor_contact_person}},</p>
      <p>AG Composites is requesting a quote for the following items. <strong>This is not a purchase order</strong> — we are seeking pricing and availability information.</p>
      <div class="rfq-details">
        <p><strong>Vendor:</strong> {{vendor_name}}</p>
        <p><strong>Desired Delivery Date:</strong> {{desired_delivery_date}}</p>
      </div>
      {{items_table}}
      <div class="notice">
        <strong>Note:</strong> This is a Request for Quote only. No commitment to purchase is implied. Please reply to this email with your pricing and availability.
      </div>
      <p>If you have any questions, please contact us at glenn@agadvanced.com or call 256-723-8381.</p>
    </div>
    <div class="footer">
      <p>
        <strong>AG Composites</strong><br>
        230 Hamer Road<br>
        Owens Cross Roads, AL 35763<br>
        Phone: 256-723-8381<br>
        Email: glenn@agadvanced.com
      </p>
    </div>
  </div>
</body>
</html>`,
  bodyText: `Request for Quote

Hello{{vendor_contact_person}},

AG Composites is requesting a quote for the following items. This is NOT a purchase order — we are seeking pricing and availability information.

Vendor: {{vendor_name}}
Desired Delivery Date: {{desired_delivery_date}}

{{items_list}}

Note: This is a Request for Quote only. No commitment to purchase is implied.
Please reply to this email with your pricing and availability.

If you have any questions, please contact us at glenn@agadvanced.com or call 256-723-8381.

---
AG Composites
230 Hamer Road
Owens Cross Roads, AL 35763
Phone: 256-723-8381
Email: glenn@agadvanced.com`,
};

export const VENDOR_PO_ISSUE_TEMPLATE = {
  key: 'vendor_po_issue',
  name: 'Vendor PO Issue',
  subject: 'PO {{po_number}} from AG Composites',
  allowedVariables: [
    'vendor_name',
    'vendor_contact_person',
    'po_number',
    'requested_delivery_date',
    'vendor_message_html',
    'vendor_message_text',
  ],
  attachmentRules: { attachVendorPOPDF: true, systemNotice: true },
  bodyHtml: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PO {{po_number}} from AG Composites</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #0066cc;
      padding-bottom: 20px;
    }
    .header h1 { color: #1a1a1a; font-size: 24px; margin: 0; }
    .content { margin-bottom: 30px; }
    .po-details {
      background-color: #f5f5f5;
      border-radius: 6px;
      padding: 20px;
      margin: 20px 0;
    }
    .po-details p { margin: 5px 0; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 14px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Purchase Order</h1>
    </div>
    <div class="content">
      <p>Hello{{vendor_contact_person}},</p>
      {{vendor_message_html}}
      <div class="po-details">
        <p><strong>PO Number:</strong> {{po_number}}</p>
        <p><strong>Vendor:</strong> {{vendor_name}}</p>
        <p><strong>Requested Delivery Date:</strong> {{requested_delivery_date}}</p>
      </div>
      <p>If you have any questions about this order, please contact us at glenn@agadvanced.com or call 256-723-8381.</p>
    </div>
    <div class="footer">
      <p>
        <strong>AG Composites</strong><br>
        230 Hamer Road<br>
        Owens Cross Roads, AL 35763<br>
        Phone: 256-723-8381<br>
        Email: glenn@agadvanced.com
      </p>
    </div>
  </div>
</body>
</html>`,
  bodyText: `Purchase Order

Hello{{vendor_contact_person}},

{{vendor_message_text}}

PO Number: {{po_number}}
Vendor: {{vendor_name}}
Requested Delivery Date: {{requested_delivery_date}}

If you have any questions about this order, please contact us at glenn@agadvanced.com or call 256-723-8381.

---
AG Composites
230 Hamer Road
Owens Cross Roads, AL 35763
Phone: 256-723-8381
Email: glenn@agadvanced.com`,
};

export const VENDOR_PO_RESEND_TEMPLATE = {
  key: 'vendor_po_resend',
  name: 'Vendor PO Resend',
  subject: 'RESEND: PO {{po_number}} from AG Composites',
  allowedVariables: [
    'vendor_name',
    'vendor_contact_person',
    'po_number',
    'requested_delivery_date',
    'vendor_message_html',
    'vendor_message_text',
  ],
  attachmentRules: { attachVendorPOPDF: true, systemNotice: true },
  bodyHtml: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RESEND: PO {{po_number}} from AG Composites</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #0066cc;
      padding-bottom: 20px;
    }
    .header h1 { color: #1a1a1a; font-size: 24px; margin: 0; }
    .content { margin-bottom: 30px; }
    .po-details {
      background-color: #f5f5f5;
      border-radius: 6px;
      padding: 20px;
      margin: 20px 0;
    }
    .po-details p { margin: 5px 0; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 14px;
      color: #666;
    }
    .resend-notice {
      background-color: #e8f4fd;
      border-left: 4px solid #0066cc;
      padding: 12px;
      margin: 20px 0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Purchase Order</h1>
    </div>
    <div class="content">
      <p>Hello{{vendor_contact_person}},</p>
      <div class="resend-notice">
        <strong>Note:</strong> This is a resend of a previously issued Purchase Order.
      </div>
      {{vendor_message_html}}
      <div class="po-details">
        <p><strong>PO Number:</strong> {{po_number}}</p>
        <p><strong>Vendor:</strong> {{vendor_name}}</p>
        <p><strong>Requested Delivery Date:</strong> {{requested_delivery_date}}</p>
      </div>
      <p>If you have any questions about this order, please contact us at glenn@agadvanced.com or call 256-723-8381.</p>
    </div>
    <div class="footer">
      <p>
        <strong>AG Composites</strong><br>
        230 Hamer Road<br>
        Owens Cross Roads, AL 35763<br>
        Phone: 256-723-8381<br>
        Email: glenn@agadvanced.com
      </p>
    </div>
  </div>
</body>
</html>`,
  bodyText: `RESEND: Purchase Order

Hello{{vendor_contact_person}},

Note: This is a resend of a previously issued Purchase Order.

{{vendor_message_text}}

PO Number: {{po_number}}
Vendor: {{vendor_name}}
Requested Delivery Date: {{requested_delivery_date}}

If you have any questions about this order, please contact us at glenn@agadvanced.com or call 256-723-8381.

---
AG Composites
230 Hamer Road
Owens Cross Roads, AL 35763
Phone: 256-723-8381
Email: glenn@agadvanced.com`,
};
