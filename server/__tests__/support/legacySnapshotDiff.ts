import { createHash } from 'node:crypto';

export type SnapshotRow = Record<string, unknown>;
export type SnapshotTable = Record<string, SnapshotRow>;
export type StructuredSnapshot = Record<string, SnapshotTable>;

export type SnapshotDifference = {
  table: string;
  operation: 'insert' | 'delete' | 'update';
  identity: string;
  field: string;
  before: unknown;
  after: unknown;
};

const sensitiveFieldPattern =
  /(password|secret|token|credential|session|cookie|authorization|api[_-]?key|private[_-]?key|signature|file[_-]?(bytes|content)|document[_-]?content|base64|cipher|encrypted|hash)$/i;
const sensitiveTablePattern =
  /^(action_tokens|api_integration_keys|user_sessions|user_signing_keys|vault_documents)$/i;

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function stableIdentity(row: SnapshotRow, fallback: number | string) {
  const candidates = [
    'id',
    'project_id',
    'po_number',
    'order_id',
    'work_order_number',
    'traveler_number',
    'reference',
    'serial_number',
    'quote_number',
  ];
  const values = candidates
    .filter((field) => row[field] !== undefined && row[field] !== null)
    .map((field) => `${field}=${String(row[field])}`);
  return values.length > 0 ? values.join('|') : `row=${fallback}`;
}

export function structuredSnapshot(
  rowsByTable: Record<string, SnapshotRow[]>
): StructuredSnapshot {
  return Object.fromEntries(
    Object.entries(rowsByTable)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([table, rows]) => [
        table,
        Object.fromEntries(
          rows
            .map((row, index) => [stableIdentity(row, index), row] as const)
            .sort(([left], [right]) => left.localeCompare(right))
        ),
      ])
  );
}

export function diffSnapshots(
  before: StructuredSnapshot,
  after: StructuredSnapshot
): SnapshotDifference[] {
  const differences: SnapshotDifference[] = [];
  const tables = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const table of [...tables].sort()) {
    const left = before[table] ?? {};
    const right = after[table] ?? {};
    const identities = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const identity of [...identities].sort()) {
      const beforeRow = left[identity];
      const afterRow = right[identity];
      if (!beforeRow) {
        for (const field of Object.keys(afterRow).sort()) {
          differences.push({
            table,
            operation: 'insert',
            identity,
            field,
            before: null,
            after: afterRow[field],
          });
        }
        continue;
      }
      if (!afterRow) {
        for (const field of Object.keys(beforeRow).sort()) {
          differences.push({
            table,
            operation: 'delete',
            identity,
            field,
            before: beforeRow[field],
            after: null,
          });
        }
        continue;
      }
      const fields = new Set([
        ...Object.keys(beforeRow),
        ...Object.keys(afterRow),
      ]);
      for (const field of [...fields].sort()) {
        if (canonical(beforeRow[field]) === canonical(afterRow[field]))
          continue;
        differences.push({
          table,
          operation: 'update',
          identity,
          field,
          before: beforeRow[field],
          after: afterRow[field],
        });
      }
    }
  }
  return differences;
}

function safeValue(table: string, field: string, value: unknown) {
  if (
    !sensitiveTablePattern.test(table) &&
    !sensitiveFieldPattern.test(field)
  ) {
    return canonical(value);
  }
  const serialized = canonical(value);
  return canonical({
    redacted: true,
    type:
      value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    null: value === null,
    length: value === null ? 0 : serialized.length,
    sha256: hash(serialized),
  });
}

export function formatSnapshotDifferences(
  differences: SnapshotDifference[],
  limit = 20
) {
  const shown = differences
    .slice(0, limit)
    .map((difference) =>
      [
        `table=${difference.table}`,
        `operation=${difference.operation}`,
        `identity=${difference.identity}`,
        `field=${difference.field}`,
        `before=${safeValue(
          difference.table,
          difference.field,
          difference.before
        )}`,
        `after=${safeValue(
          difference.table,
          difference.field,
          difference.after
        )}`,
      ].join(' ')
    );
  return `Legacy snapshot differences total=${differences.length} shown=${shown.length}\n${shown.join('\n')}`;
}
