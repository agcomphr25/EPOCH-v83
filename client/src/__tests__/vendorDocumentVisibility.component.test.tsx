import { describe, expect, it } from 'vitest';

import { getVendorApprovalDocument } from '@/pages/VendorManagement';

describe('vendor approval document visibility', () => {
  it('surfaces a certification as the priority quality certificate badge', () => {
    expect(
      getVendorApprovalDocument({
        id: 1,
        name: 'Maven Packaging',
        approvalPdfUrl: '/uploads/maven-quality-cert.pdf',
        approvalSource: 'Certification',
      })
    ).toMatchObject({
      category: 'Quality Certificate',
      badgeLabel: 'Quality Cert',
    });
  });

  it('surfaces a supplier approval form without mislabeling it as a certificate', () => {
    expect(
      getVendorApprovalDocument({
        id: 2,
        name: 'Example Vendor',
        approvalPdfUrl: '/uploads/supplier-approval.pdf',
        approvalSource: 'Supplier Approval Form',
      })
    ).toMatchObject({
      category: 'Approval Document',
      badgeLabel: 'Approval Doc',
    });
  });

  it('returns no approval badge when the Scope page has no document', () => {
    expect(
      getVendorApprovalDocument({
        id: 3,
        name: 'No Document Vendor',
        approvalPdfUrl: '',
      })
    ).toBeNull();
  });
});
