import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? process.cwd());
const outDir = path.resolve(
  process.argv[3] ?? path.join(root, 'docs/audits/generated')
);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (
      ['node_modules', '.git', 'dist', 'attached_assets'].includes(entry.name)
    )
      return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const writeCsv = (name, rows) => {
  const headers = Object.keys(rows[0] ?? { finding: '' });
  fs.writeFileSync(
    path.join(outDir, name),
    [
      headers.map(quote).join(','),
      ...rows.map((r) => headers.map((h) => quote(r[h])).join(',')),
    ].join('\n') + '\n'
  );
};

fs.mkdirSync(outDir, { recursive: true });
const sourceFiles = walk(root).filter((f) => /\.(ts|tsx|sql)$/.test(f));
const capabilityPattern = /['"]([a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+)['"]/g;
const capabilityRows = [];
const enforcementRows = [];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    for (const match of line.matchAll(capabilityPattern)) {
      if (/^(api|http|https|text|application)\./.test(match[1])) continue;
      capabilityRows.push({
        capability: match[1],
        source: relative(file),
        line: index + 1,
      });
    }
    if (
      /(requirePermission|requireAnyPermission|requireScopedCapability|userHasScopedCapability|requireApplicableAuthorization|requireRole|allowedRoles|role\s*===\s*['"](?:ADMIN|OWNER)|\.includes\([^)]*role)/.test(
        line
      )
    ) {
      enforcementRows.push({
        source: relative(file),
        line: index + 1,
        evidence: line.trim().slice(0, 500),
      });
    }
  }
}
const uniqueCaps = [
  ...new Map(
    capabilityRows.map((r) => [`${r.capability}|${r.source}|${r.line}`, r])
  ).values(),
].sort(
  (a, b) =>
    a.capability.localeCompare(b.capability) ||
    a.source.localeCompare(b.source) ||
    a.line - b.line
);
writeCsv('capability-inventory.csv', uniqueCaps);
writeCsv(
  'server-enforcement-inventory.csv',
  enforcementRows.filter((r) => r.source.startsWith('server/'))
);

const migrationDir = path.join(root, 'migrations');
const migrationFiles = fs
  .readdirSync(migrationDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const safeBoot = fs.readFileSync(
  path.join(root, 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8'
);
const safeBootArray =
  safeBoot.match(/export const safeMigrationFiles = \[([\s\S]*?)\n\];/)?.[1] ??
  '';
const registrations = [...safeBootArray.matchAll(/'([^']+\.sql)'/g)].map(
  (m) => m[1]
);
const byPrefix = new Map();
for (const file of migrationFiles) {
  const prefix = file.match(/^(\d+)/)?.[1] ?? 'NON_NUMERIC';
  byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
}
const duplicatePrefixes = [...byPrefix.entries()].filter(
  ([, files]) => files.length > 1
);
const duplicateComplete = migrationFiles.filter(
  (f, i) => migrationFiles.indexOf(f) !== i
);
const duplicateRegistrations = registrations.filter(
  (f, i) => registrations.indexOf(f) !== i
);
const unregistered = migrationFiles.filter(
  (f) =>
    !registrations.includes(f) &&
    f !== '0267_reconcile_p18380_persisted_shipment.sql'
);
const missingFiles = registrations.filter((f) => !migrationFiles.includes(f));
const disposition = {
  generatedFrom: relative(root),
  migrationFiles: migrationFiles.length,
  duplicateNumericPrefixes: duplicatePrefixes.map(([prefix, files]) => ({
    prefix,
    files,
  })),
  duplicateCompleteFilenames: duplicateComplete,
  duplicateSafeBootRegistrations: duplicateRegistrations,
  unregisteredSafeBootFiles: unregistered,
  registeredButMissingFiles: missingFiles,
  preDeployIdentity:
    'complete filename stem stored in drizzle.__drizzle_migrations.hash',
  preDeployOrder: 'lexicographic complete filename order',
  safeBootIdentity:
    'complete filename entry in explicit safeMigrationFiles array; no tracking table',
  safeBootOrder: 'explicit array order',
};
fs.writeFileSync(
  path.join(outDir, 'migration-disposition.json'),
  JSON.stringify(disposition, null, 2) + '\n'
);
console.log(
  `Generated ${uniqueCaps.length} capability references, ${enforcementRows.length} enforcement references, and migration disposition.`
);
