import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Pure Precision P1 tracking notifications', () => {
  const route = readFileSync(
    join(process.cwd(), 'server/src/routes/poShippingQC.ts'),
    'utf8'
  );
  const service = readFileSync(
    join(process.cwd(), 'server/src/services/p1ShipmentNotificationService.ts'),
    'utf8'
  );
  const dialog = readFileSync(
    join(process.cwd(), 'client/src/components/ShipmentDialog.tsx'),
    'utf8'
  );

  it('limits automatic P1 notification delivery to live Pure Precision shipments', () => {
    expect(route).toContain('!historicalShipment');
    expect(route).toContain('!skipDbPersistence');
    expect(route).toContain('isPurePrecisionCustomer(resolvedCustomerName)');
    expect(route).toContain('sendPurePrecisionShipmentNotification({');
  });

  it('shows an opt-in review control only for Pure Precision standard shipments', () => {
    expect(dialog).toContain("shipmentMode === 'standard' && isPurePrecisionShipment");
    expect(dialog).toContain('checkbox-pure-precision-tracking-notification');
    expect(dialog).toContain('customerEmail');
  });

  it('deduplicates and audits shipment-level tracking email outcomes', () => {
    expect(service).toContain("eq(communicationLogs.type, 'p1-shipping-notification')");
    expect(service).toContain('eq(communicationLogs.trackingNumber, input.trackingNumber)');
    expect(service).toContain("trackingNotificationStatus: 'sent'");
    expect(service).toContain("trackingNotificationStatus: 'failed'");
    expect(service).toContain('notification_metadata');
  });
});
