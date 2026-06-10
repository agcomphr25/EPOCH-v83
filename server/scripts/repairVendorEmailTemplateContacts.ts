import { Pool } from 'pg';

const LEGACY_EMAIL = 'laurie.tandy@agadvanced.com';
const CURRENT_EMAIL = 'glenn@agadvanced.com';
const TEMPLATE_KEYS = ['vendor_rfq', 'vendor_po_issue', 'vendor_po_resend'];

const apply = process.argv.includes('--apply');
const connectionString = process.env.FORCE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Cannot inspect vendor email templates.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function main() {
  console.log(`Vendor email contact repair (${apply ? 'APPLY' : 'DRY RUN'})`);

  const before = await inspect();
  printRows('Before', before);

  if (apply) {
    await pool.query(
      `
        UPDATE email_templates
        SET body_html = REPLACE(body_html, $1, $2),
            body_text = REPLACE(body_text, $1, $2),
            updated_at = NOW(),
            updated_by = 'script:repairVendorEmailTemplateContacts'
        WHERE key = ANY($3)
          AND (
            body_html LIKE '%' || $1 || '%'
            OR body_text LIKE '%' || $1 || '%'
          )
      `,
      [LEGACY_EMAIL, CURRENT_EMAIL, TEMPLATE_KEYS]
    );

    await pool.query(
      `
        UPDATE vendor_po_settings
        SET contact_email = $1,
            updated_at = NOW()
        WHERE contact_email IS NULL
           OR LOWER(contact_email) = $2
      `,
      [CURRENT_EMAIL, LEGACY_EMAIL]
    );
  }

  const after = await inspect();
  printRows(apply ? 'After' : 'Dry-run verification target', after);

  const remainingLegacy = after.some((row) => row.has_legacy_contact);
  if (remainingLegacy) {
    console.error(`Legacy contact still present. Run with --apply against the correct database.`);
    process.exitCode = 1;
  } else if (apply) {
    console.log('Verified: no vendor email template still contains the legacy contact.');
  } else {
    console.log('Dry run complete. Re-run with --apply to update the database.');
  }
}

async function inspect() {
  const result = await pool.query(
    `
      SELECT
        key,
        version,
        current_version,
        updated_at,
        body_html LIKE '%' || $1 || '%' OR body_text LIKE '%' || $1 || '%' AS has_legacy_contact,
        body_html LIKE '%' || $2 || '%' OR body_text LIKE '%' || $2 || '%' AS has_current_contact
      FROM email_templates
      WHERE key = ANY($3)
      ORDER BY key
    `,
    [LEGACY_EMAIL, CURRENT_EMAIL, TEMPLATE_KEYS]
  );
  return result.rows;
}

function printRows(label: string, rows: any[]) {
  console.log(`\n${label}:`);
  if (rows.length === 0) {
    console.log('  No vendor email templates found.');
    return;
  }
  console.table(rows);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
