import { createHash } from 'crypto';

export const CONTROLLED_DOCUMENT_RECOVERY_POLICY_VERSION =
  'MDR_SOURCE_RECOVERY_V1';
export const CONTROLLED_DOCUMENT_RECOVERY_MAX_FILE_SIZE = 50 * 1024 * 1024;

export function isControlledDocumentRecoveryExplicitlyEnabledValue(
  value: string | undefined
) {
  return value === 'true';
}

export type RecoverySourceRow = {
  documentCode: string;
  title: string;
  sourceType:
    | 'DIRECT_UPLOAD'
    | 'GOOGLE_DRIVE_PROVENANCE'
    | 'LEGACY_EPOCH_REFERENCE'
    | 'OTHER_VERIFIED_SOURCE';
  sourceUrl?: string | null;
  driveFileId?: string | null;
};

export type RecoveryDocumentFacts = {
  id: string;
  documentNumber: string;
  documentName: string;
  lifecycleStatus: string | null;
  status: string | null;
  currentRevisionId: string | null;
  currentReleasedRevisionId: string | null;
  workingDraftRevisionId: string | null;
  filePath: string | null;
};

export type RecoveryRevisionFacts = {
  id: string;
  documentId: string;
  versionNumber: string;
  lifecycleStatus: string | null;
  filePath: string | null;
  fileChecksum: string | null;
  checksumStatus: string | null;
};

export type RecoveryInventoryRow = {
  documentId: string | null;
  documentCode: string;
  normalizedDocumentCode: string;
  title: string;
  sourceTitle: string | null;
  currentRevisionId: string | null;
  lifecycleStatus: string | null;
  compatibilityStatus: string | null;
  currentReleasedRevisionId: string | null;
  existingFileClassification: string;
  sourceProvenanceUrl: string | null;
  proposedManagedFile: string | null;
  observedChecksum: string | null;
  storedChecksum: string | null;
  checksumResult: 'MATCH' | 'MISMATCH' | 'NOT_CHECKED';
  blockers: string[];
  recommendedAction: string;
  category:
    | 'READY_TO_IMPORT'
    | 'MISSING_SOURCE'
    | 'DUPLICATE_CODE'
    | 'LEGACY_FILE_INACCESSIBLE'
    | 'CHECKSUM_MISMATCH'
    | 'AWAITING_APPROVAL'
    | 'RELEASED_VIEWABLE'
    | 'MANUAL_REVIEW_REQUIRED';
};

const sha256 = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

const canonicalRecoveryJson = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value))
    return `[${value.map(canonicalRecoveryJson).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalRecoveryJson(object[key])}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export const hashRecoveryValue = (value: unknown) =>
  sha256(canonicalRecoveryJson(value));

export const checksumRecoveryBytes = (value: Buffer) => sha256(value);

export const normalizeRecoveryDocumentCode = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

export const normalizeRecoveryTitle = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export const titlesMateriallyConflict = (left: unknown, right: unknown) => {
  const a = normalizeRecoveryTitle(left);
  const b = normalizeRecoveryTitle(right);
  if (!a || !b) return true;
  if (a === b) return false;
  const aTokens = new Set(a.split(' '));
  const bTokens = new Set(b.split(' '));
  const common = Array.from(aTokens).filter((token) =>
    bTokens.has(token)
  ).length;
  const overlap = common / Math.max(aTokens.size, bTokens.size);
  return overlap < 0.8;
};

export function sanitizeRecoverySourceProvenance(input: {
  sourceType: RecoverySourceRow['sourceType'];
  sourceUrl?: string | null;
  driveFileId?: string | null;
}) {
  const driveFileId = String(input.driveFileId || '').trim();
  if (driveFileId && !/^[a-zA-Z0-9_-]{10,200}$/.test(driveFileId)) {
    throw Object.assign(new Error('Drive file identifier is malformed'), {
      code: 'SOURCE_PROVENANCE_REJECTED',
    });
  }
  const raw = String(input.sourceUrl || '').trim();
  if (!raw) {
    return {
      sourceType: input.sourceType,
      sourceUrl: null,
      driveFileId: driveFileId || null,
    };
  }
  if (raw.includes('\0') || raw.includes('\\')) {
    throw Object.assign(
      new Error('Source provenance contains a rejected path'),
      {
        code: 'SOURCE_PROVENANCE_REJECTED',
      }
    );
  }
  let decodedReference = raw;
  try {
    for (let pass = 0; pass < 2; pass += 1) {
      const decoded = decodeURIComponent(decodedReference);
      if (decoded === decodedReference) break;
      decodedReference = decoded;
    }
  } catch {
    throw Object.assign(new Error('Source provenance encoding is malformed'), {
      code: 'SOURCE_PROVENANCE_REJECTED',
    });
  }
  if (/(?:^|[/])\.{1,2}(?:[/]|$)/.test(decodedReference)) {
    throw Object.assign(
      new Error('Source provenance contains traversal segments'),
      { code: 'SOURCE_PROVENANCE_REJECTED' }
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(
      new Error('Source provenance must be a valid HTTPS URL'),
      {
        code: 'SOURCE_PROVENANCE_REJECTED',
      }
    );
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw Object.assign(
      new Error('Only credential-free HTTPS provenance URLs are accepted'),
      {
        code: 'SOURCE_PROVENANCE_REJECTED',
      }
    );
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw Object.assign(new Error('Source provenance encoding is malformed'), {
      code: 'SOURCE_PROVENANCE_REJECTED',
    });
  }
  if (decodedPath.split('/').some((part) => part === '..' || part === '.')) {
    throw Object.assign(
      new Error('Source provenance contains traversal segments'),
      {
        code: 'SOURCE_PROVENANCE_REJECTED',
      }
    );
  }
  url.search = '';
  url.hash = '';
  return {
    sourceType: input.sourceType,
    sourceUrl: url.toString(),
    driveFileId: driveFileId || null,
  };
}

export function sanitizeRecoveryFilename(value: unknown) {
  const input = String(value || '')
    .normalize('NFKC')
    .trim();
  let decoded = input;
  try {
    for (let pass = 0; pass < 2; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    throw Object.assign(new Error('Original filename encoding is unsafe'), {
      code: 'UNSAFE_FILENAME',
    });
  }
  if (
    !input ||
    input.includes('\0') ||
    decoded.includes('\0') ||
    decoded.includes('/') ||
    decoded.includes('\\') ||
    /^[a-zA-Z]:/.test(decoded) ||
    decoded === '.' ||
    decoded === '..'
  ) {
    throw Object.assign(new Error('Original filename is unsafe'), {
      code: 'UNSAFE_FILENAME',
    });
  }
  return input.replace(/[\r\n";]/g, '_').slice(0, 180);
}

export function sanitizeRecoverySupportingEvidence(value: unknown) {
  const visit = (item: unknown, depth: number): unknown => {
    if (depth > 6)
      throw Object.assign(
        new Error('Supporting evidence is too deeply nested'),
        {
          code: 'RECOVERY_EVIDENCE_REJECTED',
        }
      );
    if (item === null || typeof item === 'boolean' || typeof item === 'number')
      return item;
    if (typeof item === 'string') {
      const text = item.trim().slice(0, 2000);
      if (
        /(?:https?:\/\/|file:\/\/|\/objects\/|\/supabase-objects\/|^[a-zA-Z]:[\\/]|^\\\\)/i.test(
          text
        )
      )
        throw Object.assign(
          new Error('Supporting evidence must not contain file paths or URLs'),
          { code: 'RECOVERY_EVIDENCE_REJECTED' }
        );
      return text;
    }
    if (Array.isArray(item))
      return item.slice(0, 100).map((entry) => visit(entry, depth + 1));
    if (typeof item === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(
        item as Record<string, unknown>
      )) {
        if (
          /password|secret|token|cookie|authorization|signed.?url|file.?path|object.?path/i.test(
            key
          )
        )
          throw Object.assign(
            new Error('Supporting evidence contains a restricted field'),
            { code: 'RECOVERY_EVIDENCE_REJECTED' }
          );
        result[key.slice(0, 100)] = visit(entry, depth + 1);
      }
      return result;
    }
    throw Object.assign(
      new Error('Supporting evidence contains an unsupported value'),
      {
        code: 'RECOVERY_EVIDENCE_REJECTED',
      }
    );
  };
  return visit(value, 0) as Record<string, unknown>;
}

const allowedRecoveryMediaTypes = new Map([
  ['application/pdf', ['.pdf']],
  ['image/png', ['.png']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/tiff', ['.tif', '.tiff']],
]);

export function validateRecoveryUpload(input: {
  fileName: string;
  mediaType: string;
  size: number;
  bytes: Buffer;
}) {
  const fileName = sanitizeRecoveryFilename(input.fileName);
  if (
    input.size <= 0 ||
    input.size !== input.bytes.length ||
    input.size > CONTROLLED_DOCUMENT_RECOVERY_MAX_FILE_SIZE
  ) {
    throw Object.assign(
      new Error('Uploaded byte count is missing, changed, or too large'),
      {
        code: 'RECOVERY_FILE_SIZE_REJECTED',
      }
    );
  }
  const mediaType = String(input.mediaType || '')
    .toLowerCase()
    .split(';')[0];
  const allowedExtensions = allowedRecoveryMediaTypes.get(mediaType);
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (!allowedExtensions?.includes(extension)) {
    throw Object.assign(
      new Error('Recovery files must be an immutable PDF, PNG, JPEG, or TIFF'),
      { code: 'UNSUPPORTED_RECOVERY_FILE_TYPE' }
    );
  }
  if (
    mediaType === 'application/pdf' &&
    !input.bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))
  ) {
    throw Object.assign(
      new Error('PDF signature does not match the declared file type'),
      {
        code: 'RECOVERY_FILE_SIGNATURE_MISMATCH',
      }
    );
  }
  const validImageSignature =
    mediaType === 'image/png'
      ? input.bytes
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : mediaType === 'image/jpeg'
        ? input.bytes[0] === 0xff &&
          input.bytes[1] === 0xd8 &&
          input.bytes[2] === 0xff
        : mediaType === 'image/tiff'
          ? input.bytes
              .subarray(0, 4)
              .equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
            input.bytes
              .subarray(0, 4)
              .equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
          : true;
  if (!validImageSignature)
    throw Object.assign(
      new Error('Image signature does not match the declared file type'),
      { code: 'RECOVERY_FILE_SIGNATURE_MISMATCH' }
    );
  return { fileName, mediaType, checksum: checksumRecoveryBytes(input.bytes) };
}

export const classifyRecoveryFileReference = (value: unknown) => {
  const reference = String(value || '').trim();
  if (!reference) return 'MISSING';
  if (/^https?:\/\//i.test(reference)) return 'MUTABLE_EXTERNAL_REFERENCE';
  if (
    reference.startsWith('/objects/') ||
    reference.startsWith('/supabase-objects/')
  )
    return 'MANAGED_IMMUTABLE_STORAGE';
  if (/^(?:[a-zA-Z]:[\\/]|\\\\|file:\/\/)/.test(reference))
    return 'REJECTED_ABSOLUTE_PATH';
  if (/assets[\\/]documents|uploads[\\/]media-library/i.test(reference))
    return 'LEGACY_DEPLOYMENT_PATH';
  return 'UNSUPPORTED_REFERENCE';
};

export function buildRecoveryInventory(input: {
  documents: RecoveryDocumentFacts[];
  revisions: RecoveryRevisionFacts[];
  sourceRows: RecoverySourceRow[];
  dispositions?: Array<{
    normalizedDocumentCode: string;
    authoritativeDocumentId: string;
  }>;
}): RecoveryInventoryRow[] {
  const documentsByCode = new Map<string, RecoveryDocumentFacts[]>();
  const sourcesByCode = new Map<string, RecoverySourceRow[]>();
  const revisionsById = new Map(
    input.revisions.map((revision) => [revision.id, revision])
  );
  for (const document of input.documents) {
    const code = normalizeRecoveryDocumentCode(document.documentNumber);
    documentsByCode.set(code, [...(documentsByCode.get(code) || []), document]);
  }
  for (const source of input.sourceRows) {
    const code = normalizeRecoveryDocumentCode(source.documentCode);
    sourcesByCode.set(code, [...(sourcesByCode.get(code) || []), source]);
  }
  const dispositionByCode = new Map(
    (input.dispositions || []).map((item) => [
      normalizeRecoveryDocumentCode(item.normalizedDocumentCode),
      item.authoritativeDocumentId,
    ])
  );

  const rows: RecoveryInventoryRow[] = input.documents.map((document) => {
    const code = normalizeRecoveryDocumentCode(document.documentNumber);
    const matches = sourcesByCode.get(code) || [];
    const documentMatches = documentsByCode.get(code) || [];
    const disposition = dispositionByCode.get(code);
    const source = matches.length === 1 ? matches[0] : null;
    const revision = document.currentRevisionId
      ? revisionsById.get(document.currentRevisionId) || null
      : null;
    const released = document.currentReleasedRevisionId
      ? revisionsById.get(document.currentReleasedRevisionId) || null
      : null;
    const reference =
      released?.filePath || revision?.filePath || document.filePath;
    const fileClassification = classifyRecoveryFileReference(reference);
    const blockers: string[] = [];
    if (documentMatches.length > 1 && disposition !== document.id)
      blockers.push('Multiple EPOCH records use this normalized document code');
    if (matches.length > 1)
      blockers.push(
        'The source inventory contains this document code more than once'
      );
    if (!source) blockers.push('No unique source row is available');
    if (source && titlesMateriallyConflict(source.title, document.documentName))
      blockers.push(
        'The source title materially conflicts with the EPOCH title'
      );
    if (document.currentRevisionId && revision?.documentId !== document.id)
      blockers.push(
        'The current revision pointer does not belong to this document'
      );
    if (
      document.workingDraftRevisionId &&
      revisionsById.get(document.workingDraftRevisionId)?.documentId !==
        document.id
    )
      blockers.push(
        'The working draft revision pointer does not belong to this document'
      );
    if (
      document.currentReleasedRevisionId &&
      released?.documentId !== document.id
    )
      blockers.push(
        'The released revision pointer does not belong to this document'
      );

    let category: RecoveryInventoryRow['category'] = 'READY_TO_IMPORT';
    if (
      document.currentReleasedRevisionId &&
      released?.documentId === document.id &&
      fileClassification === 'MANAGED_IMMUTABLE_STORAGE'
    )
      category = 'RELEASED_VIEWABLE';
    else if (documentMatches.length > 1 || matches.length > 1)
      category = 'DUPLICATE_CODE';
    else if (!source)
      category =
        fileClassification === 'LEGACY_DEPLOYMENT_PATH'
          ? 'LEGACY_FILE_INACCESSIBLE'
          : 'MISSING_SOURCE';
    else if (blockers.length) category = 'MANUAL_REVIEW_REQUIRED';
    else if (document.workingDraftRevisionId) category = 'AWAITING_APPROVAL';

    return {
      documentId: document.id,
      documentCode: document.documentNumber,
      normalizedDocumentCode: code,
      title: document.documentName,
      sourceTitle: source?.title || null,
      currentRevisionId: document.currentRevisionId,
      lifecycleStatus: document.lifecycleStatus,
      compatibilityStatus: document.status,
      currentReleasedRevisionId: document.currentReleasedRevisionId,
      existingFileClassification: fileClassification,
      sourceProvenanceUrl: source
        ? sanitizeRecoverySourceProvenance(source).sourceUrl
        : null,
      proposedManagedFile: null,
      observedChecksum: null,
      storedChecksum: revision?.fileChecksum || null,
      checksumResult: 'NOT_CHECKED',
      blockers,
      recommendedAction:
        category === 'RELEASED_VIEWABLE'
          ? 'No recovery action required'
          : blockers.length
            ? 'Quality disposition or corrected source identity required'
            : 'Upload exact authoritative bytes and create an execution preview',
      category,
    };
  });

  for (const source of input.sourceRows) {
    if (normalizeRecoveryDocumentCode(source.documentCode)) continue;
    rows.push({
      documentId: null,
      documentCode: source.documentCode,
      normalizedDocumentCode: '',
      title: source.title,
      sourceTitle: source.title,
      currentRevisionId: null,
      lifecycleStatus: null,
      compatibilityStatus: null,
      currentReleasedRevisionId: null,
      existingFileClassification: 'MISSING',
      sourceProvenanceUrl: sanitizeRecoverySourceProvenance(source).sourceUrl,
      proposedManagedFile: null,
      observedChecksum: null,
      storedChecksum: null,
      checksumResult: 'NOT_CHECKED',
      blockers: ['The source row has no document code'],
      recommendedAction:
        'Quality must identify the correct record; no automatic match is allowed',
      category: 'MANUAL_REVIEW_REQUIRED',
    });
  }
  return rows;
}
