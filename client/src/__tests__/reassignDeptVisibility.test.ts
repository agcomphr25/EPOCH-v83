import { describe, it, expect } from 'vitest';
import { isAdminUser } from '@/config/userPermissions';

describe('isAdminUser', () => {
  it('returns false for null / undefined', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });

  it('returns true for role === ADMIN', () => {
    expect(isAdminUser({ role: 'ADMIN', username: 'someone' })).toBe(true);
  });

  it('returns true for role === OWNER', () => {
    expect(isAdminUser({ role: 'OWNER', username: 'someone' })).toBe(true);
  });

  it('returns true for a whitelisted username (glennj) regardless of role', () => {
    expect(isAdminUser({ role: 'MANAGER', username: 'glennj' })).toBe(true);
    expect(isAdminUser({ role: undefined, username: 'glennj' })).toBe(true);
  });

  it('returns true for a whitelisted username (tasham) regardless of role', () => {
    expect(isAdminUser({ role: 'FLOOR_OPERATOR', username: 'tasham' })).toBe(true);
  });

  it('returns true for whitelisted username (tandym) with fullAccess and no deniedRoutes', () => {
    expect(isAdminUser({ role: 'FLOOR_OPERATOR', username: 'tandym' })).toBe(true);
  });

  it('returns false for role === MANAGER', () => {
    expect(isAdminUser({ role: 'MANAGER', username: 'regularuser' })).toBe(false);
  });

  it('returns false for role === SUPERVISOR', () => {
    expect(isAdminUser({ role: 'SUPERVISOR', username: 'regularuser' })).toBe(false);
  });

  it('returns false for role === FLOOR_OPERATOR', () => {
    expect(isAdminUser({ role: 'FLOOR_OPERATOR', username: 'regularuser' })).toBe(false);
  });

  it('returns false for role === INVENTORY_MANAGER', () => {
    expect(isAdminUser({ role: 'INVENTORY_MANAGER', username: 'regularuser' })).toBe(false);
  });

  it('returns false for role === FINANCE', () => {
    expect(isAdminUser({ role: 'FINANCE', username: 'regularuser' })).toBe(false);
  });

  it('returns false for a user not on the whitelist even with a role-like string', () => {
    expect(isAdminUser({ role: 'OPERATOR', username: 'jdoe' })).toBe(false);
  });

  it('returns false when user object has no role and is not whitelisted', () => {
    expect(isAdminUser({ username: 'unknown_user' })).toBe(false);
  });

  it('returns false for staciw despite fullAccess because they have deniedRoutes', () => {
    expect(isAdminUser({ role: undefined, username: 'staciw' })).toBe(false);
  });

  it('returns false when username is empty and role is missing', () => {
    expect(isAdminUser({ role: undefined, username: '' })).toBe(false);
  });

  it('is case-sensitive for role comparison (lower-case role is not admin)', () => {
    expect(isAdminUser({ role: 'admin', username: 'regularuser' })).toBe(false);
    expect(isAdminUser({ role: 'owner', username: 'regularuser' })).toBe(false);
  });
});
