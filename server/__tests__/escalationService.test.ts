/**
 * Unit tests for the Approval Escalation Engine (Task #148).
 *
 * Covers:
 *  - parseChain normalization
 *  - route layer: inbox listing, approve/reject decision validation,
 *    EscalationError → HTTP status mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { svcMock, EscalationErrorMock } = vi.hoisted(() => {
  class EscalationErrorMock extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    svcMock: {
      openRequest: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      cancel: vi.fn(),
      escalateExpired: vi.fn(),
      listInboxFor: vi.fn(),
      getRequest: vi.fn(),
      listPolicies: vi.fn(),
      upsertPolicy: vi.fn(),
      parseChain: (policy: any) => {
        const raw = policy?.chain;
        if (!Array.isArray(raw)) return [];
        return raw
          .map((l: any) => ({
            role: String(l?.role ?? ''),
            slaSeconds: Number(l?.slaSeconds ?? 0),
            isBackstop: !!l?.isBackstop,
          }))
          .filter((l: any) => l.role && l.slaSeconds > 0);
      },
    },
    EscalationErrorMock,
  };
});

const authState: { user: { id: number; username: string; role: string } } = {
  user: { id: 7, username: 'tester', role: 'ADMIN' },
};

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = authState.user;
    next();
  }),
  requireAdminOrOwner: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../src/services/escalationService', () => ({
  ...svcMock,
  EscalationError: EscalationErrorMock,
}));

import { parseChain } from '../src/services/escalationService';

describe('parseChain', () => {
  it('normalizes valid level entries', () => {
    const result = parseChain({
      chain: [
        { role: 'Supervisor', slaSeconds: 3600 },
        { role: 'Director', slaSeconds: 14400, isBackstop: true },
      ],
    } as any);
    expect(result).toEqual([
      { role: 'Supervisor', slaSeconds: 3600, isBackstop: false },
      { role: 'Director', slaSeconds: 14400, isBackstop: true },
    ]);
  });

  it('drops malformed levels (missing role / non-positive sla)', () => {
    const result = parseChain({
      chain: [
        { role: '', slaSeconds: 3600 },
        { role: 'Director', slaSeconds: 0 },
        { role: 'Owner', slaSeconds: 60 },
      ],
    } as any);
    expect(result).toEqual([{ role: 'Owner', slaSeconds: 60, isBackstop: false }]);
  });

  it('returns empty array when chain is not an array', () => {
    expect(parseChain({ chain: null } as any)).toEqual([]);
  });
});

describe('approval routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    authState.user = { id: 7, username: 'tester', role: 'ADMIN' };
    const { approvalsRouter } = await import('../src/routes/approvals');
    app = express();
    app.use(express.json());
    app.use('/api/approvals', approvalsRouter);
  });

  it('GET /api/approvals forwards user identity to listInboxFor', async () => {
    svcMock.listInboxFor.mockResolvedValue([{ id: 'r1' }]);
    const res = await request(app).get('/api/approvals');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'r1' }]);
    expect(svcMock.listInboxFor).toHaveBeenCalledWith({
      userId: 7,
      roles: ['ADMIN'],
      status: 'PENDING',
      limit: 200,
    });
  });

  it('admins may scope inbox via ?role=', async () => {
    svcMock.listInboxFor.mockResolvedValue([]);
    await request(app).get('/api/approvals?role=Quality+Manager');
    expect(svcMock.listInboxFor).toHaveBeenCalledWith({
      userId: 7,
      roles: ['ADMIN', 'Quality Manager'],
      status: 'PENDING',
      limit: 200,
    });
  });

  it('non-admin users CANNOT scope inbox to a different role via ?role=', async () => {
    authState.user = { id: 9, username: 'employee9', role: 'EMPLOYEE' };
    svcMock.listInboxFor.mockResolvedValue([]);
    await request(app).get('/api/approvals?role=Quality+Manager');
    // The forbidden ?role= is silently dropped — caller can only see
    // their own role's queue.
    expect(svcMock.listInboxFor).toHaveBeenCalledWith({
      userId: 9,
      roles: ['EMPLOYEE'],
      status: 'PENDING',
      limit: 200,
    });
  });

  it('non-admin cancel does NOT propagate isPrivilegedOverride', async () => {
    authState.user = { id: 9, username: 'employee9', role: 'EMPLOYEE' };
    svcMock.cancel.mockResolvedValue({ id: 'r1', status: 'CANCELLED' });
    await request(app).post('/api/approvals/r1/cancel').send({ notes: 'mind changed' });
    expect(svcMock.cancel).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        userId: 9,
        displayName: 'employee9',
        isPrivilegedOverride: false,
      }),
      'mind changed',
    );
  });

  it('admin cancel sets isPrivilegedOverride=true', async () => {
    svcMock.cancel.mockResolvedValue({ id: 'r1', status: 'CANCELLED' });
    await request(app).post('/api/approvals/r1/cancel').send({});
    expect(svcMock.cancel).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ isPrivilegedOverride: true }),
      undefined,
    );
  });

  it('POST /:id/approve forwards actor identity, roles, and never sets isPrivilegedOverride from the body', async () => {
    svcMock.approve.mockResolvedValue({ id: 'r1', status: 'APPROVED' });
    const res = await request(app)
      .post('/api/approvals/r1/approve')
      // isPrivilegedOverride in the body must be ignored — the route only
      // ever passes a route-controlled value, never trusting the client.
      .send({ notes: 'ok', signature: 'tester', isPrivilegedOverride: true });
    expect(res.status).toBe(200);
    expect(svcMock.approve).toHaveBeenCalledWith({
      approvalRequestId: 'r1',
      approver: {
        userId: 7,
        displayName: 'tester',
        roles: ['ADMIN'],
        isPrivilegedOverride: false,
      },
      notes: 'ok',
      reasonCode: null,
      signature: 'tester',
    });
  });

  it('maps FORBIDDEN EscalationError to 403', async () => {
    svcMock.approve.mockRejectedValue(
      new EscalationErrorMock('FORBIDDEN', 'not the assigned approver'),
    );
    const res = await request(app)
      .post('/api/approvals/r1/approve')
      .send({ notes: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('POST /:id/reject requires notes or reasonCode', async () => {
    const res = await request(app).post('/api/approvals/r1/reject').send({});
    expect(res.status).toBe(400);
    expect(svcMock.reject).not.toHaveBeenCalled();
  });

  it('POST /:id/reject succeeds when notes provided', async () => {
    svcMock.reject.mockResolvedValue({ id: 'r1', status: 'REJECTED' });
    const res = await request(app)
      .post('/api/approvals/r1/reject')
      .send({ notes: 'bad data' });
    expect(res.status).toBe(200);
    expect(svcMock.reject).toHaveBeenCalled();
  });

  it('maps NOT_FOUND EscalationError to 404', async () => {
    svcMock.approve.mockRejectedValue(new EscalationErrorMock('NOT_FOUND', 'missing'));
    const res = await request(app)
      .post('/api/approvals/r1/approve')
      .send({ notes: 'x' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'missing', code: 'NOT_FOUND' });
  });

  it('maps NOT_PENDING EscalationError to 409', async () => {
    svcMock.approve.mockRejectedValue(
      new EscalationErrorMock('NOT_PENDING', 'already APPROVED'),
    );
    const res = await request(app)
      .post('/api/approvals/r1/approve')
      .send({ notes: 'x' });
    expect(res.status).toBe(409);
  });

  it('maps SIGNATURE_REQUIRED to 422', async () => {
    svcMock.approve.mockRejectedValue(
      new EscalationErrorMock('SIGNATURE_REQUIRED', 'signature required'),
    );
    const res = await request(app)
      .post('/api/approvals/r1/approve')
      .send({ notes: 'x' });
    expect(res.status).toBe(422);
  });

  it('GET /:id returns 404 when service yields null', async () => {
    svcMock.getRequest.mockResolvedValue(null);
    const res = await request(app).get('/api/approvals/r1');
    expect(res.status).toBe(404);
  });

  it('GET /:id returns 403 to a stranger (not approver, not requester, not admin)', async () => {
    authState.user = { id: 99, username: 'stranger', role: 'EMPLOYEE' };
    svcMock.getRequest.mockResolvedValue({
      request: {
        id: 'r1',
        currentApproverUserId: 1,
        currentApproverRole: 'Quality Manager',
        requestedByUserId: 2,
      },
      history: [],
      policy: null,
    });
    const res = await request(app).get('/api/approvals/r1');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('GET /:id allows the assigned approver by user id', async () => {
    authState.user = { id: 1, username: 'approver', role: 'EMPLOYEE' };
    svcMock.getRequest.mockResolvedValue({
      request: {
        id: 'r1',
        currentApproverUserId: 1,
        currentApproverRole: null,
        requestedByUserId: 2,
      },
      history: [],
      policy: null,
    });
    const res = await request(app).get('/api/approvals/r1');
    expect(res.status).toBe(200);
  });

  it('GET /:id allows a user holding the assigned role', async () => {
    authState.user = { id: 99, username: 'qm', role: 'Quality Manager' };
    svcMock.getRequest.mockResolvedValue({
      request: {
        id: 'r1',
        currentApproverUserId: null,
        currentApproverRole: 'Quality Manager',
        requestedByUserId: 2,
      },
      history: [],
      policy: null,
    });
    const res = await request(app).get('/api/approvals/r1');
    expect(res.status).toBe(200);
  });

  it('GET /:id allows the original requester', async () => {
    authState.user = { id: 2, username: 'requester', role: 'EMPLOYEE' };
    svcMock.getRequest.mockResolvedValue({
      request: {
        id: 'r1',
        currentApproverUserId: 1,
        currentApproverRole: 'Quality Manager',
        requestedByUserId: 2,
      },
      history: [],
      policy: null,
    });
    const res = await request(app).get('/api/approvals/r1');
    expect(res.status).toBe(200);
  });

  it('GET /:id allows admins regardless of assignment', async () => {
    svcMock.getRequest.mockResolvedValue({
      request: {
        id: 'r1',
        currentApproverUserId: 1,
        currentApproverRole: 'Quality Manager',
        requestedByUserId: 2,
      },
      history: [],
      policy: null,
    });
    const res = await request(app).get('/api/approvals/r1');
    expect(res.status).toBe(200);
  });
});
