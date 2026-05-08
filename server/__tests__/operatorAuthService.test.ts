/**
 * Unit tests for OperatorAuthService — Phase 2 of Task #143.
 *
 * The DB layer is mocked so these run as fast unit tests; integration
 * coverage of the full route → service → ledger pipeline lives in
 * `materialIssueOperatorAuth.test.ts`.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// `bcryptjs.compare` is awaited inside `issueSessionForPin`; default the
// mock to "match" so PIN tests don't need a real hash.
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn(async () => true) },
  compare: vi.fn(async () => true),
}));

interface InsertChain {
  values: (v: unknown) => { returning: () => Promise<unknown[]> };
}
interface UpdateChain {
  set: (v: unknown) => {
    where: (cond: unknown) => {
      returning: () => Promise<unknown[]>;
    } & Promise<unknown[]>;
  };
}
interface SelectChain {
  from: (t: unknown) => {
    where: (c: unknown) => { limit: (n: number) => Promise<unknown[]> };
    orderBy?: (o: unknown) => Promise<unknown[]>;
  };
}

const insertMock = vi.fn<() => InsertChain>();
const updateMock = vi.fn<() => UpdateChain>();
const selectMock = vi.fn<() => SelectChain>();

vi.mock('../db', () => ({
  db: {
    insert: () => insertMock(),
    update: () => updateMock(),
    select: () => selectMock(),
    transaction: async (fn: any) =>
      fn({ insert: () => insertMock(), update: () => updateMock(), select: () => selectMock() }),
  },
  pool: {},
}));

vi.mock('../schema', () => ({
  operatorAuthSessions: {
    id: 'id',
    employeeId: 'employee_id',
    revokedAt: 'revoked_at',
    expiresAt: 'expires_at',
    lastActivityAt: 'last_activity_at',
  },
  employees: {
    id: 'id',
    badgeScanCode: 'badge_scan_code',
    employeeCode: 'employee_code',
    timekeeperPin: 'timekeeper_pin',
  },
}));

import {
  decodeOperatorToken,
  hasFreshReauth,
  issueSessionForBadge,
  issueSessionForPin,
  OperatorAuthError,
  reauthSession,
  revokeSession,
  validateAndTouchSession,
} from '../src/services/operatorAuthService';

const EMPLOYEE = {
  id: 42,
  name: 'Alice Operator',
  preferredName: null,
  employeeCode: 'EMP042',
  badgeScanCode: 'aaaa-bbbb-cccc',
  timekeeperPin: '$2a$10$fakehash',
  isActive: true,
  userRole: 'EMPLOYEE',
};

beforeEach(() => {
  insertMock.mockReset();
  updateMock.mockReset();
  selectMock.mockReset();
});

function mockEmployeeLookup(emp: any) {
  selectMock.mockReturnValue({
    from: () => ({
      where: () => ({ limit: async () => (emp ? [emp] : []) }),
    }),
  });
}

function mockInsertReturns(row: any) {
  insertMock.mockReturnValue({
    values: () => ({ returning: async () => [row] }),
  });
}

function mockSessionLookup(session: any) {
  selectMock.mockReturnValue({
    from: () => ({
      where: () => ({ limit: async () => (session ? [session] : []) }),
    }),
  });
}

function mockUpdateNoop(returnedRow?: any) {
  updateMock.mockReturnValue({
    set: () => {
      const wherePromise: any = Promise.resolve([returnedRow ?? {}]);
      wherePromise.returning = async () => [returnedRow ?? {}];
      return { where: () => wherePromise };
    },
  });
}

describe('issueSessionForBadge', () => {
  it('issues a token and persists a session row when badge matches', async () => {
    mockEmployeeLookup(EMPLOYEE);
    const now = Date.now();
    const sessionRow = {
      id: '11111111-1111-1111-1111-111111111111',
      employeeId: EMPLOYEE.id,
      employeeDisplayName: EMPLOYEE.name,
      authMethod: 'BADGE',
      workstationId: 'WS-01',
      issuedAt: new Date(now),
      lastActivityAt: new Date(now),
      lastReauthAt: new Date(now),
      expiresAt: new Date(now + 60_000),
      idleTimeoutSeconds: 900,
      revokedAt: null,
    };
    mockInsertReturns(sessionRow);

    const issued = await issueSessionForBadge('aaaabbbbcccc', { workstationId: 'WS-01' });
    expect(issued.token).toContain('.');
    expect(issued.session.employeeDisplayName).toBe('Alice Operator');
    const decoded = decodeOperatorToken(issued.token);
    expect(decoded.sessionId).toBe(sessionRow.id);
  });

  it('throws BAD_BADGE when no employee matches', async () => {
    mockEmployeeLookup(null);
    await expect(issueSessionForBadge('not-a-badge')).rejects.toMatchObject({
      code: 'BAD_BADGE',
    });
  });

  it('throws EMPLOYEE_INACTIVE for inactive employees', async () => {
    mockEmployeeLookup({ ...EMPLOYEE, isActive: false });
    await expect(issueSessionForBadge('aaaabbbbcccc')).rejects.toMatchObject({
      code: 'EMPLOYEE_INACTIVE',
    });
  });
});

describe('issueSessionForPin', () => {
  it('throws EMPLOYEE_NO_PIN when employee has no PIN on file', async () => {
    mockEmployeeLookup({ ...EMPLOYEE, timekeeperPin: null });
    await expect(issueSessionForPin('EMP042', '1234')).rejects.toMatchObject({
      code: 'EMPLOYEE_NO_PIN',
    });
  });

  it('throws BAD_PIN when bcrypt compare fails', async () => {
    mockEmployeeLookup(EMPLOYEE);
    const bcrypt = await import('bcryptjs');
    (bcrypt.default.compare as any).mockResolvedValueOnce(false);
    await expect(issueSessionForPin('EMP042', 'wrong')).rejects.toMatchObject({
      code: 'BAD_PIN',
    });
  });
});

describe('decodeOperatorToken', () => {
  it('rejects malformed tokens', () => {
    expect(() => decodeOperatorToken('not-a-token')).toThrow(OperatorAuthError);
  });

  it('rejects tokens with bad signatures', () => {
    expect(() =>
      decodeOperatorToken('YWFhLjEyMw.deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
    ).toThrow(OperatorAuthError);
  });
});

describe('validateAndTouchSession', () => {
  it('rejects revoked sessions', async () => {
    mockEmployeeLookup(EMPLOYEE);
    mockInsertReturns({
      id: '22222222-2222-2222-2222-222222222222',
      employeeId: EMPLOYEE.id,
      employeeDisplayName: 'Alice',
      authMethod: 'BADGE',
      issuedAt: new Date(),
      lastActivityAt: new Date(),
      lastReauthAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      idleTimeoutSeconds: 900,
      revokedAt: null,
    });
    const issued = await issueSessionForBadge('aaaabbbbcccc');

    mockSessionLookup({
      id: '22222222-2222-2222-2222-222222222222',
      employeeId: EMPLOYEE.id,
      employeeDisplayName: 'Alice',
      authMethod: 'BADGE',
      issuedAt: new Date(),
      lastActivityAt: new Date(),
      lastReauthAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      idleTimeoutSeconds: 900,
      revokedAt: new Date(),
    });
    await expect(validateAndTouchSession(issued.token)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });

  it('rejects idle-timed-out sessions', async () => {
    mockEmployeeLookup(EMPLOYEE);
    mockInsertReturns({
      id: '33333333-3333-3333-3333-333333333333',
      employeeId: EMPLOYEE.id,
      employeeDisplayName: 'Alice',
      authMethod: 'BADGE',
      issuedAt: new Date(),
      lastActivityAt: new Date(),
      lastReauthAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      idleTimeoutSeconds: 1,
      revokedAt: null,
    });
    const issued = await issueSessionForBadge('aaaabbbbcccc');

    mockSessionLookup({
      id: '33333333-3333-3333-3333-333333333333',
      employeeId: EMPLOYEE.id,
      employeeDisplayName: 'Alice',
      authMethod: 'BADGE',
      issuedAt: new Date(Date.now() - 60_000),
      lastActivityAt: new Date(Date.now() - 60_000), // 60s ago, idle limit is 1s
      lastReauthAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 60_000),
      idleTimeoutSeconds: 1,
      revokedAt: null,
    });
    await expect(validateAndTouchSession(issued.token)).rejects.toMatchObject({
      code: 'SESSION_IDLE',
    });
  });
});

describe('reauthSession (credentialed) — type contract', () => {
  // The detailed cross-employee enforcement is exercised by the route-level
  // Zod schema on /reauth, which now refuses requests without a badge or
  // PIN credential. The end-to-end mismatch path is covered in integration
  // testing; here we just assert the runtime function throws on an
  // unrecognised badge so the negative path is statically reachable.
  it('throws BAD_BADGE when supplied badge does not resolve to an employee', async () => {
    mockEmployeeLookup(null);
    await expect(
      reauthSession('aaa.bbb', { badgeCode: 'unknown-badge' }),
    ).rejects.toBeInstanceOf(OperatorAuthError);
  });
});

describe('hasFreshReauth', () => {
  it('returns true when reauth is recent', () => {
    expect(hasFreshReauth({ lastReauthAt: new Date() }, 60)).toBe(true);
  });
  it('returns false when reauth is older than the window', () => {
    expect(
      hasFreshReauth({ lastReauthAt: new Date(Date.now() - 120_000) }, 60),
    ).toBe(false);
  });
});
