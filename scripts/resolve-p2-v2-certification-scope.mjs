import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const eslintPattern = /\.(?:js|jsx|mjs|cjs|ts|tsx)$/;
const prettierPattern = /\.(?:js|jsx|mjs|cjs|ts|tsx|json|css|md|ya?ml)$/;

export function filterCertificationPaths(paths, kind) {
  const pattern = kind === 'eslint' ? eslintPattern : prettierPattern;
  return [...new Set(paths.filter((file) => pattern.test(file)))].sort();
}

export function resolveCertificationPaths({
  eventName,
  kind,
  dispatchPaths,
  changedPaths,
}) {
  if (!['eslint', 'prettier'].includes(kind)) {
    throw new Error(`Unsupported certification scope kind: ${kind}`);
  }
  const sourcePaths =
    eventName === 'workflow_dispatch'
      ? dispatchPaths
      : eventName === 'pull_request'
        ? changedPaths
        : null;
  if (!sourcePaths) {
    throw new Error(`Unsupported certification event: ${eventName}`);
  }
  const resolved = filterCertificationPaths(sourcePaths, kind);
  if (resolved.length === 0) {
    throw new Error(
      `${eventName} resolved an empty ${kind} certification scope; refusing a repository-wide fallback`
    );
  }
  return resolved;
}

export function assertCertificationFilesExist(root, files) {
  const missing = files.filter((file) => !fs.existsSync(path.join(root, file)));
  if (missing.length > 0) {
    throw new Error(
      `Missing required certification file(s): ${missing.join(', ')}`
    );
  }
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required option ${name}`);
  }
  return process.argv[index + 1];
}

function main() {
  const eventName = option('--event');
  const kind = option('--kind');
  const baseSha = option('--base');
  const root = process.cwd();
  const manifestPath = path.join(
    root,
    '.github/p2-v2-workflow-dispatch-certification-manifest.json'
  );
  const dispatchPaths = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assertCertificationFilesExist(root, dispatchPaths);
  const changedPaths =
    eventName === 'pull_request'
      ? execFileSync('git', ['diff', '--name-only', `${baseSha}...HEAD`], {
          cwd: root,
          encoding: 'utf8',
        })
          .split(/\r?\n/)
          .filter(Boolean)
      : [];
  const resolved = resolveCertificationPaths({
    eventName,
    kind,
    dispatchPaths,
    changedPaths,
  });
  process.stdout.write(`${resolved.join('\n')}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
