import fs from 'fs/promises';
import path from 'path';

export class ReconciliationFileReferenceError extends Error {
  code = 'RECONCILIATION_FILE_REFERENCE_REJECTED';
}

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ReconciliationFileReferenceError(
      'Malformed file reference encoding'
    );
  }
};

export async function resolveContainedReconciliationFile(
  reference: string,
  cwd = process.cwd()
): Promise<{ path: string; identity: { kind: string; relativePath: string } }> {
  if (!reference || reference.includes('\0'))
    throw new ReconciliationFileReferenceError('Invalid file reference');
  const decoded = decode(reference).replace(/\\/g, '/');
  if (
    decoded.includes('\0') ||
    decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    /^[a-zA-Z]:/.test(decoded) ||
    decoded.split('/').some((part) => part === '..' || part === '.')
  )
    throw new ReconciliationFileReferenceError(
      'File reference escapes its allowed root'
    );

  const roots = [
    {
      prefix: 'uploads/media-library/',
      root: path.resolve(cwd, 'uploads/media-library'),
    },
    {
      prefix: 'assets/documents/',
      root: path.resolve(cwd, 'server/src/assets/documents'),
    },
  ];
  const match = roots.find((entry) => decoded.startsWith(entry.prefix));
  if (!match)
    throw new ReconciliationFileReferenceError(
      'Unsupported authoritative file reference'
    );
  const relative = decoded.slice(match.prefix.length);
  if (!relative)
    throw new ReconciliationFileReferenceError('A file path is required');

  const realRoot = await fs.realpath(match.root);
  const candidate = path.resolve(realRoot, relative);
  const realCandidate = await fs.realpath(candidate);
  const prefix = `${realRoot}${path.sep}`;
  if (!realCandidate.startsWith(prefix))
    throw new ReconciliationFileReferenceError(
      'File reference escapes its allowed root'
    );
  return {
    path: realCandidate,
    identity: {
      kind: match.prefix.slice(0, -1),
      relativePath: relative.replace(/\\/g, '/'),
    },
  };
}

export async function readContainedReconciliationFile(reference: string) {
  const resolved = await resolveContainedReconciliationFile(reference);
  return {
    bytes: await fs.readFile(resolved.path),
    identity: resolved.identity,
  };
}
