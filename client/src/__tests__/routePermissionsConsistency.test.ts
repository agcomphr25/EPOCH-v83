import { describe, it, expect } from 'vitest';
import {
  VALID_NAVBAR_ROUTES,
  ROLE_ROUTE_ACCESS,
} from '../config/userPermissions';

/**
 * Route permission consistency tests
 *
 * These tests guard against the class of bug where a route is added to
 * VALID_NAVBAR_ROUTES (making it navigable) but its role entry is never
 * added to ROLE_ROUTE_ACCESS, leaving ADMIN/OWNER users silently locked out.
 *
 * The inverse is also checked: routes that appear in ROLE_ROUTE_ACCESS but
 * not in VALID_NAVBAR_ROUTES are flagged so orphaned permission entries
 * don't accumulate unnoticed.
 *
 * KNOWN EXCEPTIONS (routes intentionally in ROLE_ROUTE_ACCESS only):
 *   /finance/accounting – internal API-only route, not a navbar destination.
 */
const ROLE_ROUTE_ACCESS_EXCEPTIONS = new Set([
  '/finance/accounting',
]);

const navbarFinanceRoutes = VALID_NAVBAR_ROUTES.filter((r) =>
  r.startsWith('/finance/'),
);

const roleAccessFinanceRoutes = Object.keys(ROLE_ROUTE_ACCESS).filter((r) =>
  r.startsWith('/finance/'),
);

const roleAccessFinanceSet = new Set(roleAccessFinanceRoutes);
const navbarFinanceSet = new Set(navbarFinanceRoutes);

describe('Route permission consistency – /finance/* routes', () => {
  it('every /finance/* route in VALID_NAVBAR_ROUTES has an entry in ROLE_ROUTE_ACCESS', () => {
    const missing = navbarFinanceRoutes.filter(
      (route) => !roleAccessFinanceSet.has(route),
    );

    expect(
      missing,
      `The following /finance/* routes appear in VALID_NAVBAR_ROUTES but are ` +
        `missing from ROLE_ROUTE_ACCESS.\n` +
        `ADMIN/OWNER users will be silently denied access to them.\n` +
        `Add each route to ROLE_ROUTE_ACCESS in userPermissions.ts:\n` +
        missing.map((r) => `  - ${r}`).join('\n'),
    ).toHaveLength(0);
  });

  it('every /finance/* entry in ROLE_ROUTE_ACCESS appears in VALID_NAVBAR_ROUTES (or is a known exception)', () => {
    const orphaned = roleAccessFinanceRoutes.filter(
      (route) =>
        !navbarFinanceSet.has(route) &&
        !ROLE_ROUTE_ACCESS_EXCEPTIONS.has(route),
    );

    expect(
      orphaned,
      `The following /finance/* routes exist in ROLE_ROUTE_ACCESS but are ` +
        `missing from VALID_NAVBAR_ROUTES.\n` +
        `Either add them to VALID_NAVBAR_ROUTES or list them in ` +
        `ROLE_ROUTE_ACCESS_EXCEPTIONS inside this test file:\n` +
        orphaned.map((r) => `  - ${r}`).join('\n'),
    ).toHaveLength(0);
  });

  it('all entries in ROLE_ROUTE_ACCESS_EXCEPTIONS are actually present in ROLE_ROUTE_ACCESS', () => {
    const staleExceptions = [...ROLE_ROUTE_ACCESS_EXCEPTIONS].filter(
      (route) => !roleAccessFinanceSet.has(route),
    );

    expect(
      staleExceptions,
      `The following routes are listed as known exceptions but no longer exist ` +
        `in ROLE_ROUTE_ACCESS. Remove them from ROLE_ROUTE_ACCESS_EXCEPTIONS:\n` +
        staleExceptions.map((r) => `  - ${r}`).join('\n'),
    ).toHaveLength(0);
  });
});
