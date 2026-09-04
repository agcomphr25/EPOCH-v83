import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(here, '../src/routes/timekeeping/myTasks.ts'),
  'utf8'
);

test('P1 billing reminders ignore shipments before the operational cutover', () => {
  assert.match(
    source,
    /P1_BILLING_REMINDER_CUTOVER_DATE\s*=\s*["']2026-09-03["']/
  );
  assert.match(source, /spg\.shipped_at\s*>=\s*\$3::date/);
  assert.match(source, /P1_BILLING_REMINDER_CUTOVER_DATE[\s\S]*?\],/);
});

test('a matching non-void invoice resolves the P1 sending reminder', () => {
  assert.match(source, /AS has_non_void_invoice/);
  assert.match(source, /NOT invoice_match\.has_non_void_invoice/);
  assert.doesNotMatch(source, /NOT invoice_match\.has_posted_invoice/);
});
