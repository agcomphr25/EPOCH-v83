import { pool } from '../db.js';
import { sendEmailViaSendGrid } from './sendgrid.js';

export const TRAINING_ALERT_DAYS_DEFAULT = 30;

export function getAlertDays(): number {
  const raw = process.env.TRAINING_ALERT_DAYS;
  if (!raw) return TRAINING_ALERT_DAYS_DEFAULT;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) || parsed < 1 ? TRAINING_ALERT_DAYS_DEFAULT : parsed;
}

function getRecipients(): string[] {
  const raw = process.env.TRAINING_ALERT_RECIPIENTS;
  if (!raw || !raw.trim()) return [];
  return raw.split(',').map((r) => r.trim()).filter(Boolean);
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RecertRecord {
  recordId: number;
  employeeId: number;
  employeeName: string;
  jobTitle: string;
  department: string;
  certificationId: number;
  certificationName: string;
  certType: string;
  validityPeriodMonths: number | null;
  dateObtained: string | null;
  expiryDate: string;
  notes: string | null;
  status: 'EXPIRED' | 'EXPIRING_SOON';
}

/**
 * Shared query: returns all active employees with certifications expiring within
 * the given number of days (or already expired). Used by both the REST endpoint
 * and the daily email digest cron job.
 */
export async function fetchRecertificationRecords(days: number): Promise<RecertRecord[]> {
  const rows = await pool.query(
    `SELECT
      tm.id             AS "recordId",
      e.id              AS "employeeId",
      e.name            AS "employeeName",
      COALESCE(e.job_title, '') AS "jobTitle",
      COALESCE(tm.department, e.department, '') AS "department",
      DENSE_RANK() OVER (ORDER BY tm.training_name) AS "certificationId",
      tm.training_name  AS "certificationName",
      'General'         AS "certType",
      NULL::integer     AS "validityPeriodMonths",
      tm.last_completed AS "dateObtained",
      tm.next_due       AS "expiryDate",
      tm.notes,
      CASE
        WHEN tm.next_due < CURRENT_DATE THEN 'EXPIRED'
        ELSE 'EXPIRING_SOON'
      END AS "status"
    FROM training_matrix tm
    JOIN employees e ON tm.employee_id = e.id
    WHERE e.is_active = true
      AND tm.status = 'COMPLETED'
      AND tm.is_legacy = false
      AND tm.next_due IS NOT NULL
      AND tm.next_due <= CURRENT_DATE + ($1::text || ' days')::interval
    ORDER BY tm.next_due ASC`,
    [days]
  );
  return rows || [];
}

/**
 * Efficient COUNT(*) query for the nav badge — avoids fetching full rows
 * when only the total is needed.
 */
export async function countRecertificationRecords(days: number): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*) AS count
     FROM training_matrix tm
     JOIN employees e ON tm.employee_id = e.id
     WHERE e.is_active = true
       AND tm.status = 'COMPLETED'
       AND tm.is_legacy = false
       AND tm.next_due IS NOT NULL
       AND tm.next_due <= CURRENT_DATE + ($1::text || ' days')::interval`,
    [days]
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

export async function sendTrainingExpirationDigest(): Promise<{
  sent: number;
  skipped: number;
  failed: number;
  recordCount: number;
}> {
  const days = getAlertDays();
  const recipients = getRecipients();

  console.log(`🎓 [TRAINING ALERT] Checking for certifications expiring within ${days} days...`);

  let records: RecertRecord[] = [];
  try {
    records = await fetchRecertificationRecords(days);
  } catch (err) {
    console.error('❌ [TRAINING ALERT] Failed to query recertification records:', err);
    return { sent: 0, skipped: 0, failed: 1, recordCount: 0 };
  }

  if (records.length === 0) {
    console.log('✅ [TRAINING ALERT] No expiring certifications found — skipping digest.');
    return { sent: 0, skipped: 1, failed: 0, recordCount: 0 };
  }

  console.log(`⚠️  [TRAINING ALERT] Found ${records.length} expiring/expired certification(s).`);

  if (recipients.length === 0) {
    console.warn(
      '⚠️  [TRAINING ALERT] No recipients configured (TRAINING_ALERT_RECIPIENTS is empty). Digest not sent.'
    );
    return { sent: 0, skipped: 1, failed: 0, recordCount: records.length };
  }

  const expired = records.filter((r) => r.status === 'EXPIRED');
  const expiringSoon = records.filter((r) => r.status === 'EXPIRING_SOON');

  const formatDate = (d: string | null) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const rowsHtml = (items: RecertRecord[]) =>
    items
      .map(
        (r) =>
          `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.employeeName)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.department) || '—'}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.certificationName)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;${r.status === 'EXPIRED' ? 'color:#dc2626;font-weight:600;' : 'color:#d97706;'}">${formatDate(r.expiryDate)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;${r.status === 'EXPIRED' ? 'color:#dc2626;font-weight:600;' : 'color:#d97706;'}">${r.status === 'EXPIRED' ? 'Expired' : 'Expiring Soon'}</td>
          </tr>`
      )
      .join('');

  const tableStyle = 'width:100%;border-collapse:collapse;font-size:14px;';
  const thStyle =
    'padding:8px 12px;background:#f3f4f6;text-align:left;font-weight:600;border-bottom:2px solid #d1d5db;';

  const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#111827;">
  <h2 style="margin-bottom:4px;">Training Certification Alert</h2>
  <p style="color:#6b7280;margin-top:0;">Daily digest — certifications expiring within <strong>${days} days</strong> or already expired.</p>

  ${
    expired.length > 0
      ? `<h3 style="color:#dc2626;margin-top:24px;">Expired (${expired.length})</h3>
         <table style="${tableStyle}">
           <thead><tr>
             <th style="${thStyle}">Employee</th>
             <th style="${thStyle}">Department</th>
             <th style="${thStyle}">Certification</th>
             <th style="${thStyle}">Expiry Date</th>
             <th style="${thStyle}">Status</th>
           </tr></thead>
           <tbody>${rowsHtml(expired)}</tbody>
         </table>`
      : ''
  }

  ${
    expiringSoon.length > 0
      ? `<h3 style="color:#d97706;margin-top:24px;">Expiring Soon (${expiringSoon.length})</h3>
         <table style="${tableStyle}">
           <thead><tr>
             <th style="${thStyle}">Employee</th>
             <th style="${thStyle}">Department</th>
             <th style="${thStyle}">Certification</th>
             <th style="${thStyle}">Expiry Date</th>
             <th style="${thStyle}">Status</th>
           </tr></thead>
           <tbody>${rowsHtml(expiringSoon)}</tbody>
         </table>`
      : ''
  }

  <p style="margin-top:24px;font-size:12px;color:#9ca3af;">
    This is an automated digest from the EPOCH training management system.<br>
    Alert window: ${days} days. Configure via TRAINING_ALERT_DAYS and TRAINING_ALERT_RECIPIENTS environment variables.
  </p>
</div>`;

  const textBody = [
    `Training Certification Alert — Daily Digest`,
    `Certifications expiring within ${days} days or already expired.`,
    '',
    expired.length > 0 ? `EXPIRED (${expired.length}):` : '',
    ...expired.map((r) => `  - ${r.employeeName} | ${r.certificationName} | ${formatDate(r.expiryDate)} | EXPIRED`),
    '',
    expiringSoon.length > 0 ? `EXPIRING SOON (${expiringSoon.length}):` : '',
    ...expiringSoon.map(
      (r) => `  - ${r.employeeName} | ${r.certificationName} | ${formatDate(r.expiryDate)} | EXPIRING SOON`
    ),
    '',
    `Configure alert window via TRAINING_ALERT_DAYS (current: ${days} days).`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    try {
      const result = await sendEmailViaSendGrid({
        to: recipient,
        subject: `[EPOCH] Training Certification Digest — ${expired.length} expired, ${expiringSoon.length} expiring soon`,
        text: textBody,
        html: htmlBody,
      });
      if (result.success) {
        console.log(`✅ [TRAINING ALERT] Digest sent to ${recipient}`);
        sentCount++;
      } else {
        console.error(`❌ [TRAINING ALERT] Failed to send to ${recipient}:`, result.error);
        failedCount++;
      }
    } catch (err) {
      console.error(`❌ [TRAINING ALERT] Error sending to ${recipient}:`, err);
      failedCount++;
    }
  }

  return { sent: sentCount, skipped: 0, failed: failedCount, recordCount: records.length };
}
