/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export class EslintInfrastructureError extends Error {}
export class EslintRegressionError extends Error {}

function readDiagnosticFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '<missing>';
  const contents = fs.readFileSync(filePath, 'utf8');
  return contents.length === 0 ? '<empty>' : contents;
}

export function formatInfrastructureFailure({
  label,
  command,
  exitCode,
  reportPath,
  stderrPath,
  reason,
}) {
  return [
    `${label} ESLint infrastructure failure: ${reason}`,
    `command: ${command}`,
    `exit_code: ${exitCode}`,
    `stdout (${reportPath}):`,
    readDiagnosticFile(reportPath),
    `stderr (${stderrPath}):`,
    readDiagnosticFile(stderrPath),
  ].join('\n');
}

export function validateEslintExecution({
  label,
  command,
  exitCode,
  reportPath,
  stderrPath,
}) {
  const fail = (reason) => {
    throw new EslintInfrastructureError(
      formatInfrastructureFailure({
        label,
        command,
        exitCode,
        reportPath,
        stderrPath,
        reason,
      })
    );
  };

  if (exitCode !== 0 && exitCode !== 1) {
    fail('ESLint must exit 0 (clean) or 1 (lint findings) to be comparable');
  }
  if (!fs.existsSync(reportPath)) fail('expected JSON output file is missing');
  if (fs.statSync(reportPath).size === 0)
    fail('expected JSON output file is empty');

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (error) {
    fail(`expected valid JSON output: ${error.message}`);
  }
  if (!Array.isArray(report))
    fail('expected ESLint JSON output to be an array');
  return report;
}

export function diagnosticCounts(report, root) {
  const counts = new Map();

  for (const result of report) {
    const relativePath = path
      .relative(root, result.filePath)
      .replaceAll(path.sep, '/');
    for (const message of result.messages) {
      const key = JSON.stringify([
        relativePath,
        message.ruleId ?? 'fatal',
        message.severity,
        message.message,
      ]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

export function compareDiagnosticCounts(head, base) {
  const introduced = [];
  let removedCount = 0;

  for (const [key, count] of head) {
    const added = count - (base.get(key) ?? 0);
    if (added > 0)
      introduced.push({ diagnostic: JSON.parse(key), count: added });
  }

  for (const [key, count] of base) {
    removedCount += Math.max(0, count - (head.get(key) ?? 0));
  }

  return { introduced, removedCount };
}

export function certifyEslintComparison({ headExecution, baseExecution }) {
  const headReport = validateEslintExecution(headExecution);
  const baseReport = validateEslintExecution(baseExecution);
  const { introduced, removedCount } = compareDiagnosticCounts(
    diagnosticCounts(headReport, headExecution.root),
    diagnosticCounts(baseReport, baseExecution.root)
  );

  if (introduced.length > 0) {
    const lines = [
      'Corrective branch introduces ESLint diagnostics beyond exact main:',
    ];
    for (const { diagnostic, count } of introduced) {
      const [file, rule, severity, message] = diagnostic;
      lines.push(
        `${file}: ${rule} severity=${severity} count=${count}: ${message}`
      );
    }
    throw new EslintRegressionError(lines.join('\n'));
  }

  return removedCount;
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || process.argv[index + 1] === undefined) {
    throw new Error(`Missing required option ${name}`);
  }
  return process.argv[index + 1];
}

function execution(prefix) {
  return {
    label: prefix === 'head' ? 'Head' : 'Exact-main baseline',
    command: option(`--${prefix}-command`),
    exitCode: Number(option(`--${prefix}-exit`)),
    reportPath: option(`--${prefix}-report`),
    stderrPath: option(`--${prefix}-stderr`),
    root: option(`--${prefix}-root`),
  };
}

function main() {
  const removedCount = certifyEslintComparison({
    headExecution: execution('head'),
    baseExecution: execution('base'),
  });
  console.log(
    `Corrective branch introduces no ESLint diagnostic beyond exact main and removes ${removedCount}.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(error instanceof EslintRegressionError ? 1 : 2);
  }
}
