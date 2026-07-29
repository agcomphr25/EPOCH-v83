import { existsSync, readFileSync, realpathSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = realpathSync(
  path.resolve(fileURLToPath(import.meta.url), '..', '..')
);
const manifestPath = path.join(
  root,
  '.github',
  'p2-v2-phase10a-static-manifest.json'
);
const files = JSON.parse(readFileSync(manifestPath, 'utf8'));
const allowedExtension = /\.(?:js|jsx|ts|tsx)$/;
const forbiddenSegment =
  /(?:^|\/)(?:node_modules|dist|build|coverage|phase10a-main-baseline)(?:\/|$)/;

if (!Array.isArray(files) || files.length === 0) {
  throw new Error('Phase 10A static manifest must be a non-empty array');
}

const duplicates = files.filter((file, index) => files.indexOf(file) !== index);
if (duplicates.length > 0) {
  throw new Error(
    `Duplicate manifest entries: ${[...new Set(duplicates)].join(', ')}`
  );
}

for (const file of files) {
  if (typeof file !== 'string' || file.length === 0) {
    throw new Error('Every manifest entry must be a non-empty string');
  }
  if (
    path.isAbsolute(file) ||
    file.includes('\\') ||
    file.split('/').includes('..')
  ) {
    throw new Error(`Manifest entry escapes the repository root: ${file}`);
  }
  if (!allowedExtension.test(file) || forbiddenSegment.test(file)) {
    throw new Error(`Manifest entry is not an eligible source file: ${file}`);
  }

  const absolute = path.join(root, file);
  if (!existsSync(absolute)) {
    throw new Error(`Manifest file does not exist: ${file}`);
  }
  const resolved = realpathSync(absolute);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Manifest file resolves outside the repository: ${file}`);
  }
}

const sorted = [...files].sort((left, right) => left.localeCompare(right));
if (files.some((file, index) => file !== sorted[index])) {
  throw new Error('Phase 10A static manifest must remain sorted');
}

const counts = files.reduce((result, file) => {
  const extension = path.extname(file);
  result[extension] = (result[extension] ?? 0) + 1;
  return result;
}, {});

console.log(
  `Validated ${files.length} unique Phase 9A-10A source files: ${JSON.stringify(counts)}`
);
