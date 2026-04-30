# Charge Code Manager Role Access Alignment

## Summary

Two lines were added to `client/src/config/userPermissions.ts` so that ADMIN and OWNER role users can reach `/finance/charge-codes`, consistent with every other `/finance/*` route.

## Lines Changed

### 1. `ROLE_ROUTE_ACCESS` (line ~637)

```ts
'/finance/charge-codes': ['ADMIN', 'OWNER'],
```

Placed immediately after `'/finance/scrap-report': ['ADMIN', 'OWNER'],`.

This is the authoritative permission gate: `canAccessRoute()` checks this map to decide whether a role-based user may navigate to a given path.

### 2. `VALID_NAVBAR_ROUTES` (line ~91)

```ts
'/finance/charge-codes',
```

Placed immediately after `'/finance/scrap-report',`.

This reference list is used for navbar filtering. A route must appear here to be rendered in sidebar/nav menus for eligible users. **This entry was not added to `DEFAULT_USER_ROUTES`**, which would incorrectly open the route to every unlisted user.

## Rationale

`/finance/charge-codes` was previously inaccessible to ADMIN and OWNER roles because it was absent from both `ROLE_ROUTE_ACCESS` and `VALID_NAVBAR_ROUTES`. Every other `/finance/*` route grants access to these two roles, so the omission was an oversight. No change was made to any page component, API route, or server-side auth.

## Validation Checklist

| Check | Status |
|---|---|
| ADMIN role can navigate to `/finance/charge-codes` | ✓ |
| OWNER role can navigate to `/finance/charge-codes` | ✓ |
| Users without ADMIN or OWNER role are still blocked | ✓ |
| All other `/finance/*` route access is unaffected | ✓ |
| `DEFAULT_USER_ROUTES` was not modified (no security weakening) | ✓ |
| No regression to any other permission logic | ✓ |
