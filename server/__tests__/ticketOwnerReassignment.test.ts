/**
 * Tests for PATCH /api/tickets/:id ownerUserId validation.
 *
 * Covers three scenarios per task #1650:
 *  1. Valid active user — resolves successfully, activity log uses full name.
 *  2. Nonexistent user — returns 400.
 *  3. Inactive user (is_active = false) — returns 400.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Module mocks (hoisted before any subject-module imports)
// ---------------------------------------------------------------------------

const mockPoolQuery = vi.fn();

vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  },
  pool: { query: mockPoolQuery },
}));

const mockGetTicketById = vi.fn();
const mockUpdateTicket = vi.fn();
const mockCreateTicketActivity = vi.fn();

vi.mock('../storage', () => ({
  storage: {
    getTicketById: mockGetTicketById,
    updateTicket: mockUpdateTicket,
    createTicketActivity: mockCreateTicketActivity,
  },
}));

vi.mock('../middleware/auth', () => ({
  sessionAwareAuth: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, role: 'ADMIN', username: 'adminuser' };
    next();
  }),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
  authenticateToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../src/services/auditService', () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../src/services/notificationManager', () => ({
  notificationManager: {
    notify: vi.fn().mockResolvedValue(undefined),
    broadcastTicketUpdate: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TICKET_ID = 'ticket-uuid-001';

const baseTicket = {
  id: TICKET_ID,
  status: 'new',
  priority: 'normal',
  ownerUserId: 10,
  assignedUserId: null,
  assignedUserIds: [],
  title: 'Test Ticket',
  description: null,
  category: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/tickets/:id — ownerUserId validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTicketById.mockResolvedValue({ ...baseTicket });
    mockUpdateTicket.mockResolvedValue({ ...baseTicket });
    mockCreateTicketActivity.mockResolvedValue({});
  });

  it('accepts a valid active user and logs activity with resolved names', async () => {
    // Call 1: resolve new owner (active user found)
    // Call 2: resolve previous owner name
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 20, username: 'jdoe', first_name: 'Jane', last_name: 'Doe' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, username: 'prevuser', first_name: 'Prev', last_name: 'User' }] });

    const ticketRouter = (await import('../src/routes/tickets')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/tickets', ticketRouter);

    const res = await request(app)
      .patch(`/api/tickets/${TICKET_ID}`)
      .send({ ownerUserId: 20 });

    expect(res.status).toBe(200);
    expect(mockCreateTicketActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'assignment',
        message: 'Ticket owner changed from Prev User to Jane Doe',
      })
    );
  });

  it('rejects a nonexistent user with 400', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const ticketRouter = (await import('../src/routes/tickets')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/tickets', ticketRouter);

    const res = await request(app)
      .patch(`/api/tickets/${TICKET_ID}`)
      .send({ ownerUserId: 9999 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('active user') });
    expect(mockCreateTicketActivity).not.toHaveBeenCalled();
  });

  it('rejects ownerUserId 0 with 400 (schema-level positive integer constraint)', async () => {
    const ticketRouter = (await import('../src/routes/tickets')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/tickets', ticketRouter);

    const res = await request(app)
      .patch(`/api/tickets/${TICKET_ID}`)
      .send({ ownerUserId: 0 });

    expect(res.status).toBe(400);
    expect(mockCreateTicketActivity).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('rejects an inactive user with 400 and uses is_active = true in SQL', async () => {
    // is_active = true filter causes no rows for inactive user
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const ticketRouter = (await import('../src/routes/tickets')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/tickets', ticketRouter);

    const res = await request(app)
      .patch(`/api/tickets/${TICKET_ID}`)
      .send({ ownerUserId: 42 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('active user') });
    expect(mockCreateTicketActivity).not.toHaveBeenCalled();

    // Confirm the SQL executed against the DB enforces is_active = true
    const firstCall = mockPoolQuery.mock.calls[0];
    expect(firstCall[0]).toContain('is_active = true');
    expect(firstCall[1]).toContain(42);
  });
});
