import { describe, expect, it } from 'vitest';

import {
  diffSnapshots,
  formatSnapshotDifferences,
  structuredSnapshot,
} from './support/legacySnapshotDiff';

describe('safe deterministic legacy snapshot differences', () => {
  it('reports inserted, deleted, and ordinary updated values deterministically', () => {
    const before = structuredSnapshot({
      projects: [
        { id: 'A', status: 'active', revision: 2 },
        { id: 'DELETED', status: 'active' },
      ],
    });
    const after = structuredSnapshot({
      projects: [
        { id: 'A', status: 'completed', revision: 3 },
        { id: 'INSERTED', status: 'active' },
      ],
    });
    const differences = diffSnapshots(before, after);
    expect(
      differences.map(({ operation, identity, field }) => [
        operation,
        identity,
        field,
      ])
    ).toEqual([
      ['update', 'id=A', 'revision'],
      ['update', 'id=A', 'status'],
      ['delete', 'id=DELETED', 'id'],
      ['delete', 'id=DELETED', 'status'],
      ['insert', 'id=INSERTED', 'id'],
      ['insert', 'id=INSERTED', 'status'],
    ]);
    const output = formatSnapshotDifferences(differences);
    expect(output).toContain('before="active" after="completed"');
    expect(output).toContain('operation=insert identity=id=INSERTED');
    expect(output).toContain('operation=delete identity=id=DELETED');
  });

  it('redacts sensitive values with type, null state, length, and hash', () => {
    const differences = diffSnapshots(
      structuredSnapshot({
        users: [{ id: 1, password_hash: 'before-secret' }],
      }),
      structuredSnapshot({ users: [{ id: 1, password_hash: 'after-secret' }] })
    );
    const output = formatSnapshotDifferences(differences);
    expect(output).toContain('"redacted":true');
    expect(output).toContain('"type":"string"');
    expect(output).toContain('"null":false');
    expect(output).toContain('"sha256":');
    expect(output).not.toContain('before-secret');
    expect(output).not.toContain('after-secret');
  });

  it('limits output while retaining the total difference count', () => {
    const differences = diffSnapshots(
      structuredSnapshot({ projects: [{ id: 'A', a: 1, b: 2, c: 3 }] }),
      structuredSnapshot({ projects: [{ id: 'A', a: 2, b: 3, c: 4 }] })
    );
    expect(formatSnapshotDifferences(differences, 2)).toContain(
      'total=3 shown=2'
    );
  });
});
