import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { Timesheet } from '../src/services/timekeeping/timesheets.service';

const TIMESHEET_ID = 42;

vi.mock('../src/services/timekeeping/timesheets.service', () => ({
  updateTimesheet: vi.fn(),
  getTimesheet: vi.fn(),
  listTimesheets: vi.fn().mockResolvedValue([]),
  createTimesheet: vi.fn(),
  exportApprovedTimesheetsForGusto: vi.fn(),
  attestTimesheet: vi.fn(),
  submitTimesheet: vi.fn(),
  approveTimesheet: vi.fn(),
  rejectTimesheet: vi.fn(),
  recalculateTimesheetHours: vi.fn(),
}));

vi.mock('../src/services/timekeeping/punches.service', () => ({
  listPunches: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/services/timekeeping/leave.service', () => ({
  getLeaveHoursForPeriod: vi.fn().mockResolvedValue({ totalLeaveHours: 0, entries: [] }),
}));

vi.mock('../src/services/timekeeping/settings.service', () => ({
  getOrCreateSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/services/timekeeping/audit.service', () => ({
  actorFromUser: vi.fn().mockReturnValue({ id: 1, name: 'Test User', ip: null }),
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireRole: vi.fn((..._roles: string[]) =>
    (_req: Request, _res: Response, next: NextFunction) => next()
  ),
}));

import { updateTimesheet } from '../src/services/timekeeping/timesheets.service';
import { requireRole } from '../middleware/auth';

function makeTimesheet(overrides: Partial<Timesheet> = {}): Timesheet {
  return {
    id: TIMESHEET_ID,
    employeeId: 1,
    periodStart: '2026-01-01',
    periodEnd: '2026-01-14',
    status: 'draft',
    totalHours: 0,
    regularHours: 0,
    overtimeHours: 0,
    rejectionNote: null,
    employeeAttested: false,
    attestedAt: null,
    submittedAt: null,
    submittedBy: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewerEmail: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function allowTimesheetEdit(): void {
  vi.mocked(requireRole).mockReturnValue(
    (_req: Request, _res: Response, next: NextFunction) => next()
  );
}

function denyTimesheetEdit(): void {
  vi.mocked(requireRole).mockReturnValue(
    (_req: Request, res: Response, _next: NextFunction) => {
      res.status(403).json({ error: 'Forbidden', requiredCapability: 'time.edit_entry' });
    }
  );
}

describe('Permission enforcement — timesheets PATCH (time.edit_entry)', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user: { id: number; role: string; username: string } }).user = {
        id: 1,
        role: 'employee',
        username: 'op1',
      };
      next();
    });
    const router = (await import('../src/routes/timekeeping/timesheets')).default;
    app.use('/api', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 403 with correct shape when user lacks time.edit_entry', async () => {
    denyTimesheetEdit();

    const res = await request(app)
      .patch(`/api/timesheets/${TIMESHEET_ID}`)
      .send({ periodStart: '2026-01-01' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.requiredCapability).toBe('time.edit_entry');
  });

  it('proceeds past permission gate when user has time.edit_entry', async () => {
    allowTimesheetEdit();

    vi.mocked(updateTimesheet).mockResolvedValue(
      makeTimesheet({ periodStart: '2026-01-01' })
    );

    const res = await request(app)
      .patch(`/api/timesheets/${TIMESHEET_ID}`)
      .send({ periodStart: '2026-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TIMESHEET_ID);
  });
});
