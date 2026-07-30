/* global console, process */
import fs from 'node:fs';
import path from 'node:path';

const [headPath, basePath, headRoot, baseRoot] = process.argv.slice(2);

if (!headPath || !basePath || !headRoot || !baseRoot) {
  throw new Error(
    'Usage: compare-eslint-baseline.mjs <head.json> <base.json> <head-root> <base-root>'
  );
}

function diagnosticCounts(reportPath, root) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
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

const head = diagnosticCounts(headPath, headRoot);
const base = diagnosticCounts(basePath, baseRoot);
const introduced = [];
let removedCount = 0;

for (const [key, count] of head) {
  const added = count - (base.get(key) ?? 0);
  if (added > 0) introduced.push({ diagnostic: JSON.parse(key), count: added });
}

for (const [key, count] of base) {
  removedCount += Math.max(0, count - (head.get(key) ?? 0));
}

if (introduced.length > 0) {
  console.error(
    'Corrective branch introduces ESLint diagnostics beyond exact main:'
  );
  for (const { diagnostic, count } of introduced) {
    const [file, rule, severity, message] = diagnostic;
    console.error(
      `${file}: ${rule} severity=${severity} count=${count}: ${message}`
    );
  }
  process.exit(1);
}

console.log(
  `Corrective branch introduces no ESLint diagnostic beyond exact main and removes ${removedCount}.`
);
