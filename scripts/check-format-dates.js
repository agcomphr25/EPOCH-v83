#!/usr/bin/env node
/**
 * check-format-dates.js
 *
 * Enforces that every entity listed in FORMAT_DATES_REGISTRY (server/utils/formatDates.ts)
 * has a matching *_DATE_COLUMNS constant in server/storage.ts, and that every use of
 * that constant appears inside a formatDates() call.
 *
 * Also flags any *_DATE_COLUMNS constant defined in storage.ts that is missing from
 * the FORMAT_DATES_REGISTRY, so the registry stays the authoritative source of truth.
 *
 * Exit code: 0 = all good, 1 = violations found.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const STORAGE_PATH  = resolve(ROOT, 'server/storage.ts');
const REGISTRY_PATH = resolve(ROOT, 'server/utils/formatDates.ts');

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a PascalCase entity name to the UPPER_SNAKE_CASE prefix used for
 * the *_DATE_COLUMNS constant in storage.ts.
 *
 * Two-pass algorithm:
 *  1. Insert underscore before a capital that starts a capitalized word after
 *     a run of caps (e.g. "POItem" → "PO_Item").
 *  2. Insert underscore at every remaining lowercase→uppercase transition
 *     (e.g. "VendorPO" → "Vendor_PO").
 *
 * Examples:
 *   Vendor          → VENDOR
 *   VendorPO        → VENDOR_PO
 *   VendorPOItem    → VENDOR_PO_ITEM
 *   PurchaseOrder   → PURCHASE_ORDER
 *   PurchaseOrderItem → PURCHASE_ORDER_ITEM
 *   ProductionOrder → PRODUCTION_ORDER
 */
function toConstantPrefix(name) {
  return name
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase();
}

function constantName(entity) {
  return `${toConstantPrefix(entity)}_DATE_COLUMNS`;
}

// ─── read source files ───────────────────────────────────────────────────────

const registrySource = readFileSync(REGISTRY_PATH, 'utf8');
const storageSource  = readFileSync(STORAGE_PATH,  'utf8');
const storageLines   = storageSource.split('\n');

// ─── extract FORMAT_DATES_REGISTRY entity names ──────────────────────────────

const entityNames = [];
const registryBlockMatch = registrySource.match(
  /FORMAT_DATES_REGISTRY[^{]*\{([^}]+)\}/s,
);
if (!registryBlockMatch) {
  console.error('ERROR: Could not locate FORMAT_DATES_REGISTRY in', REGISTRY_PATH);
  process.exit(1);
}

const registryBlock = registryBlockMatch[1];
const entityLineRe = /^\s{1,4}(\w+)\s*:/gm;
let m;
while ((m = entityLineRe.exec(registryBlock)) !== null) {
  entityNames.push(m[1]);
}

if (entityNames.length === 0) {
  console.error('ERROR: FORMAT_DATES_REGISTRY appears empty – check parsing logic');
  process.exit(1);
}

// ─── discover all *_DATE_COLUMNS constants defined in storage.ts ──────────────

const definedConstants = new Set();
const definitionRe = /\bconst\s+([A-Z][A-Z0-9_]*_DATE_COLUMNS)\b/g;
let dm;
while ((dm = definitionRe.exec(storageSource)) !== null) {
  definedConstants.add(dm[1]);
}

// ─── run checks ──────────────────────────────────────────────────────────────

const errors = [];

// Check 1: every registry entity must have a corresponding constant defined.
for (const entity of entityNames) {
  const cname = constantName(entity);
  if (!definedConstants.has(cname)) {
    errors.push(
      `[missing-constant] Entity "${entity}" is in FORMAT_DATES_REGISTRY but ` +
      `"${cname}" is not defined in server/storage.ts.\n` +
      `  → Define the constant and add formatDates() calls for every storage method that returns ${entity} rows.`,
    );
  }
}

// Check 2: every non-definition use of a registered constant must appear on a
//           line that also calls formatDates().
const registeredConstants = new Set(entityNames.map(constantName));

for (const cname of registeredConstants) {
  const useRe = new RegExp(`\\b${cname}\\b`, 'g');
  let useMatch;

  while ((useMatch = useRe.exec(storageSource)) !== null) {
    // Find the line (1-based) containing this match.
    const beforeMatch = storageSource.slice(0, useMatch.index);
    const lineIndex   = beforeMatch.split('\n').length - 1;  // 0-based
    const lineText    = storageLines[lineIndex];

    // Skip the definition line (it has `const <NAME> =`).
    if (/\bconst\s+[A-Z][A-Z0-9_]*_DATE_COLUMNS\b/.test(lineText)) {
      continue;
    }

    // Skip comment lines.
    const trimmed = lineText.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue;
    }

    // The constant must be used as an argument to formatDates().
    // We check a small window (current line ± 1) to handle multi-line call sites.
    const context = [
      storageLines[lineIndex - 1] ?? '',
      lineText,
      storageLines[lineIndex + 1] ?? '',
    ].join('\n');

    if (!context.includes('formatDates')) {
      const lineNumber = lineIndex + 1;
      errors.push(
        `[missing-formatDates] ${cname} referenced at server/storage.ts:${lineNumber} ` +
        `without a formatDates() call:\n` +
        `  ${lineNumber}: ${lineText.trim()}`,
      );
    }
  }
}

// Check 3: every *_DATE_COLUMNS constant defined in storage.ts should be in
//           FORMAT_DATES_REGISTRY (keeps the registry from going stale).
for (const cname of definedConstants) {
  if (!registeredConstants.has(cname)) {
    const entity = cname.replace(/_DATE_COLUMNS$/, '');
    errors.push(
      `[unregistered-constant] "${cname}" is defined in server/storage.ts but its ` +
      `entity is not listed in FORMAT_DATES_REGISTRY.\n` +
      `  → Add an entry for "${entity}" (or the matching entity name) to FORMAT_DATES_REGISTRY in server/utils/formatDates.ts.`,
    );
  }
}

// ─── report ──────────────────────────────────────────────────────────────────

if (errors.length === 0) {
  console.log('✓ check-format-dates: all formatDates() coverage checks passed.');
  process.exit(0);
} else {
  console.error(`\ncheck-format-dates: ${errors.length} violation(s) found:\n`);
  for (const err of errors) {
    console.error(`  ✗ ${err}\n`);
  }
  process.exit(1);
}
