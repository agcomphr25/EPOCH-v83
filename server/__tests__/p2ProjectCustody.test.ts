import { describe, expect, it } from 'vitest';
import {
  canAdministerP2ProjectCustody,
  getP2ReceiptCustodyError,
} from '../src/services/p2ProjectCustody';

describe('P2 project material custody', () => {
  it('does not change non-P2 receiving behavior', () => {
    expect(
      getP2ReceiptCustodyError({
        isP2: false,
        poLineProjectId: null,
        targetProjectId: null,
      })
    ).toBeNull();
  });

  it('blocks a P2 PO line without a project', () => {
    expect(
      getP2ReceiptCustodyError({
        isP2: true,
        poLineProjectId: null,
        targetProjectId: 'project-a',
      })
    ).toContain('vendor PO line does not have a project');
  });

  it('blocks missing and mismatched receiving projects', () => {
    expect(
      getP2ReceiptCustodyError({
        isP2: true,
        poLineProjectId: 'project-a',
        targetProjectId: null,
      })
    ).toContain('received unit does not have a project');
    expect(
      getP2ReceiptCustodyError({
        isP2: true,
        poLineProjectId: 'project-a',
        targetProjectId: 'project-b',
      })
    ).toContain('does not match');
  });

  it('allows an exact P2 project match', () => {
    expect(
      getP2ReceiptCustodyError({
        isP2: true,
        poLineProjectId: 'PROJECT-A',
        targetProjectId: 'project-a',
      })
    ).toBeNull();
  });

  it('reserves transfer and release authority for ADMIN', () => {
    expect(canAdministerP2ProjectCustody('ADMIN')).toBe(true);
    expect(canAdministerP2ProjectCustody('OWNER')).toBe(false);
    expect(canAdministerP2ProjectCustody('EMPLOYEE')).toBe(false);
  });
});
