import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) =>
  fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('production audit SQL is explicitly read-only and contains no data-changing statements', () => {
  const sql = read('scripts/audit/production-access-audit.sql');
  assert.match(sql, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql, /ROLLBACK;/);
  const executable = sql.replace(/^\s*--.*$/gm, '').replace(/'[^']*'/g, "''");
  assert.doesNotMatch(
    executable,
    /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|MERGE|CALL|COPY)\b/i
  );
});

test('pre-deploy migration identity is the complete filename stem', () => {
  const source = read('server/pre-deploy-migrate.ts');
  assert.match(source, /file\.replace\(\/\\\.sql\$\/, ''\)/);
  assert.match(source, /readdirSync\(migrationsDir\)[\s\S]*?\.sort\(\)/);
});

test('safe boot registration uses complete filenames and contains the matrix migration', () => {
  const source = read('server/scripts/migrations/runSafeBootMigrations.ts');
  assert.match(source, /export const safeMigrationFiles = \[/);
  assert.match(source, /'0270_certification_authorization_matrix\.sql'/);
});

test('prospective enforcement remains default-off but has two configuration sources', () => {
  const migration = read(
    'migrations/0270_certification_authorization_matrix.sql'
  );
  const service = read(
    'server/src/services/certificationAuthorizationService.ts'
  );
  assert.match(migration, /VALUES \('prospective_enforcement', false\)/);
  assert.match(service, /CERTIFICATION_AUTHORIZATION_ENFORCEMENT === 'true'/);
  assert.doesNotMatch(service, /certification_authorization_feature_flags/);
});
