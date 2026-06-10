import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

import {
  LEGACY_VENDOR_CONTACT_EMAILS,
  VENDOR_CONTACT_EMAIL,
  VENDOR_RFQ_TEMPLATE,
  normalizeVendorTemplateContactText,
} from '../communication/registry';
import { renderFromObject } from '../communication/render';

describe('vendor RFQ email contact', () => {
  it('renders the current contact email in the RFQ body', () => {
    const rendered = renderFromObject(VENDOR_RFQ_TEMPLATE as any, {
      vendor_name: "Glenn's Metal Supplies",
      vendor_contact_person: '',
      desired_delivery_date: '6/10/2026',
      items_table: '<table><tbody><tr><td>1</td></tr></tbody></table>',
      items_list: '- Glenn metal part',
    });

    expect(rendered.html).toContain(VENDOR_CONTACT_EMAIL);
    expect(rendered.text).toContain(VENDOR_CONTACT_EMAIL);
    for (const legacyEmail of LEGACY_VENDOR_CONTACT_EMAILS) {
      expect(rendered.html).not.toContain(legacyEmail);
      expect(rendered.text).not.toContain(legacyEmail);
    }
  });

  it('normalizes legacy saved-template contact text', () => {
    const repaired = normalizeVendorTemplateContactText(
      `Questions: Laurie.Tandy@agadvanced.com / ${LEGACY_VENDOR_CONTACT_EMAILS[0]}`
    );

    expect(repaired).toBe(`Questions: ${VENDOR_CONTACT_EMAIL} / ${VENDOR_CONTACT_EMAIL}`);
  });
});
