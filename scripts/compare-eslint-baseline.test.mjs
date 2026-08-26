import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EslintInfrastructureError,
  EslintRegressionError,
  certifyEslintComparison,
  validateEslintExecution,
} from './compare-eslint-baseline.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-baseline-'));
  const reportPath = path.join(root, 'report.json');
  const stderrPath = path.join(root, 'stderr.log');
  fs.writeFileSync(stderrPath, '');
  return {
    root,
    reportPath,
    stderrPath,
    command: 'eslint --format json source.ts',
    label: 'Head',
    exitCode: 0,
  };
}

function report(root, messages = []) {
  return [{ filePath: path.join(root, 'source.ts'), messages }];
}

function finding(message = 'Unexpected any.') {
  return { ruleId: '@typescript-eslint/no-explicit-any', severity: 1, message };
}

function writeReport(execution, contents) {
  fs.writeFileSync(
    execution.reportPath,
    typeof contents === 'string' ? contents : JSON.stringify(contents)
  );
  return execution;
}

test('accepts exit 0 with valid empty JSON', () => {
  const execution = writeReport(fixture(), []);
  assert.deepEqual(validateEslintExecution(execution), []);
});

test('accepts exit 1 with valid lint JSON', () => {
  const execution = fixture();
  execution.exitCode = 1;
  writeReport(execution, report(execution.root, [finding()]));
  assert.equal(validateEslintExecution(execution)[0].messages.length, 1);
});

test('rejects exit 2 with no output', () => {
  const execution = fixture();
  execution.exitCode = 2;
  assert.throws(
    () => validateEslintExecution(execution),
    EslintInfrastructureError
  );
});

test('rejects a missing output file', () => {
  assert.throws(
    () => validateEslintExecution(fixture()),
    /JSON output file is missing/
  );
});

test('rejects an empty output file', () => {
  const execution = writeReport(fixture(), '');
  assert.throws(
    () => validateEslintExecution(execution),
    /JSON output file is empty/
  );
});

test('rejects malformed JSON', () => {
  const execution = writeReport(fixture(), '{invalid');
  assert.throws(
    () => validateEslintExecution(execution),
    /expected valid JSON output/
  );
});

test('equal baseline and head findings pass', () => {
  const head = fixture();
  const base = fixture();
  head.exitCode = 1;
  base.exitCode = 1;
  writeReport(head, report(head.root, [finding()]));
  writeReport(base, report(base.root, [finding()]));
  assert.equal(
    certifyEslintComparison({ headExecution: head, baseExecution: base }),
    0
  );
});

test('new head findings fail certification', () => {
  const head = fixture();
  const base = fixture();
  head.exitCode = 1;
  writeReport(head, report(head.root, [finding()]));
  writeReport(base, report(base.root));
  assert.throws(
    () => certifyEslintComparison({ headExecution: head, baseExecution: base }),
    EslintRegressionError
  );
});

test('removed head findings pass certification', () => {
  const head = fixture();
  const base = fixture();
  base.exitCode = 1;
  writeReport(head, report(head.root));
  writeReport(base, report(base.root, [finding()]));
  assert.equal(
    certifyEslintComparison({ headExecution: head, baseExecution: base }),
    1
  );
});

test('infrastructure diagnostics include command, exit, stdout, and stderr', () => {
  const execution = fixture();
  execution.exitCode = 2;
  fs.writeFileSync(execution.stderrPath, 'Cannot resolve ESLint configuration');
  assert.throws(
    () => validateEslintExecution(execution),
    (error) =>
      error.message.includes('command: eslint --format json source.ts') &&
      error.message.includes('exit_code: 2') &&
      error.message.includes('stdout') &&
      error.message.includes('<missing>') &&
      error.message.includes('stderr') &&
      error.message.includes('Cannot resolve ESLint configuration')
  );
});
