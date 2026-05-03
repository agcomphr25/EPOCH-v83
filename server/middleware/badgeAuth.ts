import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { employees, users } from '../schema';
import { eq, sql } from 'drizzle-orm';
import { AuthService } from '../auth';

/**
 * Soft authentication middleware for production-floor public routes.
 *
 * Tries three strategies in order and populates `req.user` on the first match:
 *   1. JWT Bearer token   — full user record from DB
 *   2. Session cookie     — full user record via session lookup
 *   3. Badge scan code    — looks up employee by badge scan code / employee code;
 *                          sets req.user with role FLOOR_OPERATOR (id: 0 sentinel)
 *
 * The middleware NEVER returns 401/403 — it is "soft" by design so that
 * unauthenticated GET requests on public floor routes continue to work.
 * Routes that require a populated req.user (e.g. via requirePermission) will
 * still enforce their own 401 if req.user remains unset.
 *
 * When a badge code is present in the request but no matching employee is found,
 * `req.badgeLookupFailed` is set to `true` so that downstream middleware (e.g.
 * requirePermission) can return a more helpful "Badge not recognised" error
 * instead of the generic "Authentication required" message.
 *
 * Badge code resolution order (first non-empty value wins):
 *   - X-Badge-Code request header        (preferred for new floor device apps)
 *   - req.body.badgeScanCode             (explicit badge field)
 *   - req.body.badgeScan                 (used by the step-sign payload)
 *   - req.body.startedBy                 (used by the traveler start payload)
 *   - req.body.completedBy               (used by the traveler complete payload)
 *   - req.body.signedBy                  (used by the step-sign payload as fallback)
 */
export async function attemptBadgeOrTokenAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    // 1. Try JWT Bearer token
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader?.split(' ')[1];
    if (bearerToken) {
      const jwtPayload = AuthService.verifyJWT(bearerToken);
      if (jwtPayload) {
        const dbUser = await AuthService.getUserById(jwtPayload.userId);
        if (dbUser?.isActive) {
          req.user = dbUser;
          return next();
        }
      }
      // Intentional fallthrough for kiosk contexts: if the bearer token is
      // present but invalid or expired (e.g. stale token from a previous admin
      // session on a shared kiosk device), we do NOT short-circuit here.
      // Instead we continue to badge-code resolution below so that a valid
      // X-Badge-Code header or body field can still authenticate the request.
      console.log('[badgeAuth] Bearer token present but did not resolve a user — falling through to badge-code resolution');
    }

    // 2. Try session cookie (cookie-parser adds cookies to req.cookies)
    const cookieToken = req.cookies?.sessionToken;
    if (cookieToken) {
      const sessionUser = await AuthService.getUserBySession(cookieToken);
      if (sessionUser) {
        req.user = sessionUser;
        return next();
      }
    }

    // 3. Try badge scan code from header or well-known body fields
    //    Trim whitespace to handle copy-paste or keyboard-entry quirks.
    const rawBadgeUntrimmed: string | undefined =
      (req.headers['x-badge-code'] as string | undefined) ||
      req.body?.badgeScanCode ||
      req.body?.badgeScan ||
      req.body?.startedBy ||
      req.body?.completedBy ||
      req.body?.signedBy;

    const rawBadge = rawBadgeUntrimmed ? String(rawBadgeUntrimmed).trim() : undefined;

    if (rawBadge) {
      const normalized = rawBadge.replace(/-/g, '');

      // Strategy A: badge_scan_code UUID match (what physical badges encode)
      //   Strip dashes from both sides for comparison to handle UUID formatting variance.
      let employee = await db.query.employees.findFirst({
        where: sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalized}`,
      });

      // Strategy B: case-insensitive employee_code exact match
      //   Operators type codes in various cases — use LOWER() to avoid mismatches.
      if (!employee) {
        employee = await db.query.employees.findFirst({
          where: sql`LOWER(${employees.employeeCode}) = LOWER(${rawBadge})`,
        });
      }

      if (employee) {
        // Check whether this employee has a linked user account with an elevated role.
        // If so, carry over that user's real id and role so permission checks (e.g.
        // the ADMIN bypass in userHasScopedCapability) fire correctly for badge scans.
        // employeeId is always set to the resolved employee's real DB id for audit / training gates.
        const linkedUser = await db.query.users.findFirst({
          where: eq(users.employeeId, employee.id),
        });

        if (linkedUser?.isActive) {
          // Elevated user — honour their real role and id while preserving employeeId.
          console.log(
            `[badgeAuth] Badge resolved to linked user id=${linkedUser.id} role=${linkedUser.role} ` +
            `(employee id=${employee.id} code=${employee.employeeCode})`
          );
          req.user = {
            id: linkedUser.id,
            username: linkedUser.username,
            role: linkedUser.role,
            employeeId: employee.id,
            canOverridePrices: linkedUser.canOverridePrices ?? false,
            isActive: true,
          };
        } else {
          // No linked user account — synthetic floor-user contract:
          //   id: 0            — sentinel; no real users row.
          //   role: 'FLOOR_OPERATOR' — seeded role with traveler execution capabilities.
          //   employeeId       — real employees.id for traceability and audit purposes.
          req.user = {
            id: 0,
            username: employee.employeeCode || rawBadge,
            role: 'FLOOR_OPERATOR',
            employeeId: employee.id,
            canOverridePrices: false,
            isActive: true,
          };
        }
      } else {
        // Badge code was provided but no employee matched — flag for downstream middleware
        // so requirePermission can return a descriptive "Badge not recognised" error.
        console.warn(
          `[badgeAuth] Badge lookup failed — no employee matched raw="${rawBadge}" normalized="${normalized}". ` +
          `Method=${req.method} Path=${req.path}`
        );
        req.badgeLookupFailed = true;
      }
    }
  } catch (err) {
    // Log but never block — this is a soft auth path
    console.error('[badgeAuth] Soft auth error:', err);
  }

  return next();
}
