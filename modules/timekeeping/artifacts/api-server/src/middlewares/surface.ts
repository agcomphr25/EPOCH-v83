import type { Request, Response, NextFunction } from "express";

/**
 * Surface middleware — marks the request origin for logging and audit.
 * Auth enforcement is handled by requireAuth / requireAdmin in middlewares/auth.ts.
 */
export type Surface = "kiosk" | "employee" | "admin" | "internal";

declare global {
  namespace Express {
    interface Request {
      surface: Surface;
    }
  }
}

function attachSurface(surface: Surface) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.surface = surface;
    next();
  };
}

/**
 * Kiosk surface: PIN/name-based, no session auth required.
 * Device-level token enforcement is a future EPOCH integration point.
 */
export const kioskSurface = attachSurface("kiosk");

export const employeeSurface = attachSurface("employee");
export const adminSurface = attachSurface("admin");
export const internalSurface = attachSurface("internal");
