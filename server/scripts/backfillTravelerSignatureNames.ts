/**
 * Backfill Traveler Signature Names (Task #203)
 *
 * Historical traveler signatures were stored with `signed_by_name = NULL`
 * (or with the raw badge code) because the sign-step endpoint did not persist
 * the resolved employee name. This script finds those rows and fills in the
 * employee's name by matching the badge scan / employee code against the
 * `employees` table — using the same dash-stripped REPLACE() match used in
 * badgeAuth and the traveler sign endpoint.
 *
 * Behavior:
 *   - Resolves a real human name where possible and writes it to
 *     `signed_by_name`.
 *   - For rows whose `signed_by_name` currently holds a raw badge / UUID /
 *     EMP-style identifier and cannot be matched to any employee, the field
 *     is set to NULL so the UI surfaces a friendly "Unknown signer" label
 *     instead of leaking the badge code.
 *   - Rows with a real human name are left untouched.
 *
 * Idempotent: re-runs are no-ops once names have been backfilled.
 *
 * Usage:
 *   npx tsx server/scripts/backfillTravelerSignatureNames.ts [--dry-run]
 */

import { sql } from 'drizzle-orm';
import { db } from '../db';
import { travelerSignatures, employees } from '../schema';

interface CliArgs {
  dryRun: boolean;
}

const HEX_BADGE_PATTERN = /^[0-9a-f-]{16,}$/i;
const EMP_CODE_PATTERN = /^EMP\d+$/i;
const ADMIN_FORCE_SIGN = /^ADMIN_FORCE_SIGN$/i;

function looksLikeRawIdentifier(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  if (ADMIN_FORCE_SIGN.test(trimmed)) return true;
  const compact = trimmed.replace(/-/g, '');
  if (HEX_BADGE_PATTERN.test(trimmed) || HEX_BADGE_PATTERN.test(compact)) return true;
  if (EMP_CODE_PATTERN.test(trimmed)) return true;
  return false;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function lookupEmployeeName(candidate: string): Promise<string | null> {
  const stripped = candidate.replace(/-/g, '');
  if (!stripped) return null;

  const byBadge = await db
    .select({ name: employees.name })
    .from(employees)
    .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${stripped}`)
    .limit(1);
  if (byBadge.length > 0 && byBadge[0].name) return byBadge[0].name;

  const byCode = await db
    .select({ name: employees.name })
    .from(employees)
    .where(sql`LOWER(${employees.employeeCode}) = LOWER(${candidate})`)
    .limit(1);
  if (byCode.length > 0 && byCode[0].name) return byCode[0].name;

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`[backfill-signature-names] starting (dry-run=${args.dryRun})`);

  // Pull every signature where the stored name is missing, equal to the raw
  // badge / signed_by identifier, or itself looks like a raw identifier
  // (hex/UUID/EMP code/ADMIN_FORCE_SIGN). Real human names are skipped.
  const rows = await db
    .select({
      id: travelerSignatures.id,
      signedBy: travelerSignatures.signedBy,
      signedByName: travelerSignatures.signedByName,
      badgeScan: travelerSignatures.badgeScan,
    })
    .from(travelerSignatures);

  const candidateRows = rows.filter((row) => {
    const n = row.signedByName?.trim() || '';
    if (!n) return true;
    if (n === row.signedBy) return true;
    if (n === row.badgeScan) return true;
    if (looksLikeRawIdentifier(n)) return true;
    return false;
  });

  console.log(`[backfill-signature-names] scanned ${rows.length} row(s); ${candidateRows.length} candidate(s)`);

  let updated = 0;
  let nulled = 0;
  let unmatchedLeftAsIs = 0;
  const unmatchedSamples: string[] = [];

  for (const row of candidateRows) {
    const candidates: string[] = [];
    if (row.badgeScan && row.badgeScan !== 'ADMIN_FORCE_SIGN') candidates.push(row.badgeScan);
    if (row.signedBy && row.signedBy !== row.badgeScan) candidates.push(row.signedBy);
    if (row.signedByName && !candidates.includes(row.signedByName) && !looksLikeRawIdentifier(row.signedByName)) {
      // unlikely path, but try the stored name as a code
      candidates.push(row.signedByName);
    }

    let resolved: string | null = null;
    for (const c of candidates) {
      resolved = await lookupEmployeeName(c);
      if (resolved) break;
    }

    if (resolved) {
      if (!args.dryRun) {
        await db
          .update(travelerSignatures)
          .set({ signedByName: resolved })
          .where(sql`${travelerSignatures.id} = ${row.id}`);
      }
      updated++;
      continue;
    }

    // No employee match. If the current signed_by_name leaks a raw
    // identifier, null it so the UI shows "Unknown signer" instead.
    const currentName = row.signedByName?.trim() || '';
    if (currentName && looksLikeRawIdentifier(currentName)) {
      if (!args.dryRun) {
        await db
          .update(travelerSignatures)
          .set({ signedByName: null })
          .where(sql`${travelerSignatures.id} = ${row.id}`);
      }
      nulled++;
      if (unmatchedSamples.length < 10) {
        unmatchedSamples.push(`${row.id} (badge=${row.badgeScan ?? '∅'}, signedBy=${row.signedBy})`);
      }
    } else {
      unmatchedLeftAsIs++;
    }
  }

  console.log(`[backfill-signature-names] summary:`);
  console.log(`  scanned             : ${rows.length}`);
  console.log(`  candidates          : ${candidateRows.length}`);
  console.log(`  resolved & updated  : ${updated}${args.dryRun ? ' (dry-run, no writes)' : ''}`);
  console.log(`  raw-name → NULL     : ${nulled}${args.dryRun ? ' (dry-run, no writes)' : ''}`);
  console.log(`  unmatched (no-op)   : ${unmatchedLeftAsIs}`);
  if (unmatchedSamples.length > 0) {
    console.log(`  unmatched samples:`);
    for (const s of unmatchedSamples) console.log(`    - ${s}`);
  }
}

main()
  .then(() => {
    console.log('[backfill-signature-names] done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[backfill-signature-names] failed:', err);
    process.exit(1);
  });
