import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../auth', () => ({
  AuthService: {
    verifyJWT: vi.fn(),
    getUserById: vi.fn(),
    getUserBySession: vi.fn(),
  },
}));

import { AuthService } from '../auth';
import { authenticateToken } from '../middleware/auth';

describe('authenticateToken Express session support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts an active user from the server-side login session without a token cookie', async () => {
    const sessionUser = {
      id: 2,
      username: 'glennj',
      role: 'ADMIN',
      employeeId: null,
      canOverridePrices: true,
      isActive: true,
    };
    const req = {
      headers: {},
      cookies: {},
      session: { user: sessionUser },
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    await authenticateToken(req, res, next);

    expect(req.user).toBe(sessionUser);
    expect(next).toHaveBeenCalledOnce();
    expect(AuthService.getUserBySession).not.toHaveBeenCalled();
  });

  it('does not accept a disabled user from the server-side session', async () => {
    const req = {
      headers: {},
      cookies: {},
      session: {
        user: {
          id: 2,
          username: 'disabled',
          role: 'ADMIN',
          employeeId: null,
          canOverridePrices: false,
          isActive: false,
        },
      },
    } as unknown as Request;
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const res = { status, json } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'No session token' });
  });
});
