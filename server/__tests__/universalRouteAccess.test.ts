import { describe, it, expect } from 'vitest';
import { hasRouteAccess } from '../middleware/routeAuthorization';

describe('hasRouteAccess — universal routes bypass explicit permission entries', () => {
  it('grants darleneb access to /employee-portal even though it is not in her explicit route list', () => {
    expect(hasRouteAccess('darleneb', '/employee-portal')).toBe(true);
  });

  it('grants darleneb access to sub-paths under /employee-portal', () => {
    expect(hasRouteAccess('darleneb', '/employee-portal/time-clock')).toBe(true);
    expect(hasRouteAccess('darleneb', '/employee-portal/certifications')).toBe(true);
  });

  it('grants darleneb access to all universal routes', () => {
    const universalRoutes = [
      '/communications/inbox',
      '/employee-portal',
      '/badge-scanner',
      '/help',
      '/pdf-signature-tool',
      '/routing-document-management',
      '/forms/document-builder',
      '/tickets',
      '/quick-notes',
      '/training',
    ];
    for (const route of universalRoutes) {
      expect(hasRouteAccess('darleneb', route), `Expected access to ${route}`).toBe(true);
    }
  });

  it('still blocks darleneb from routes outside her explicit list and outside universal routes', () => {
    expect(hasRouteAccess('darleneb', '/finance/accounting')).toBe(false);
    expect(hasRouteAccess('darleneb', '/user-management')).toBe(false);
    expect(hasRouteAccess('darleneb', '/manufacturing-queue')).toBe(false);
  });

  it('grants users with no explicit entry access to /employee-portal via DEFAULT_USER_ROUTES', () => {
    expect(hasRouteAccess('unknownuser', '/employee-portal')).toBe(true);
  });

  it('grants full-access users access to any route as before', () => {
    expect(hasRouteAccess('glennj', '/finance/accounting')).toBe(true);
    expect(hasRouteAccess('glennj', '/employee-portal')).toBe(true);
    expect(hasRouteAccess('glennj', '/user-management')).toBe(true);
  });

  it('grants angiet (explicit entry without /employee-portal) access to /employee-portal via universal check', () => {
    expect(hasRouteAccess('angiet', '/employee-portal')).toBe(true);
  });

  it('still allows angiet to access her explicit Joey-style dashboard routes', () => {
    expect(hasRouteAccess('angiet', '/angiet-dashboard')).toBe(true);
    expect(hasRouteAccess('angiet', '/order-entry')).toBe(true);
    expect(hasRouteAccess('angiet', '/department-queue/cnc')).toBe(true);
    expect(hasRouteAccess('angiet', '/department-queue/gunsmith')).toBe(true);
    expect(hasRouteAccess('angiet', '/cutting-control-center/dashboard')).toBe(true);
    expect(hasRouteAccess('angiet', '/fabric-inventory')).toBe(true);
    expect(hasRouteAccess('angiet', '/orders-list')).toBe(true);
    expect(hasRouteAccess('angiet', '/customers')).toBe(true);
    expect(hasRouteAccess('angiet', '/inventory/parts-request')).toBe(true);
  });

  it('still blocks angiet from routes outside her explicit list and outside universal routes', () => {
    expect(hasRouteAccess('angiet', '/finance/dashboard')).toBe(false);
    expect(hasRouteAccess('angiet', '/manufacturing-queue')).toBe(false);
  });
});
