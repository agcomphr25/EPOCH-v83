import { and, asc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { customers, financeBillingRecipients, p2Customers } from '../../schema';
import type { FinancePilotUser } from '../lib/financeOperationsPolicy';
import { recordFinanceDecision } from './financeDecisionLedger.service';

export type BillingCustomerScope = 'P1' | 'P2';
export type BillingDeliveryRole = 'TO' | 'CC';

export type BillingRecipientInput = {
  customerScope: BillingCustomerScope;
  customerId: number;
  recipientName: string;
  email: string;
  deliveryRole: BillingDeliveryRole;
  receivesInvoices: boolean;
  receivesStatements: boolean;
  receivesCreditMemos: boolean;
  active: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  changeReason: string;
};

function actorDisplayName(actor: FinancePilotUser): string {
  return actor.username?.trim() || 'unknown';
}

function customerColumns(scope: BillingCustomerScope, customerId: number) {
  return scope === 'P1'
    ? { p1CustomerId: customerId, p2CustomerId: null }
    : { p1CustomerId: null, p2CustomerId: customerId };
}

export async function listFinanceBillingCustomers(scope: BillingCustomerScope) {
  if (scope === 'P1') {
    return db
      .select({
        id: customers.id,
        reference: customers.customerKey,
        name: customers.name,
        generalEmail: customers.email,
      })
      .from(customers)
      .where(eq(customers.isActive, true))
      .orderBy(asc(customers.name));
  }
  return db
    .select({
      id: p2Customers.id,
      reference: p2Customers.customerId,
      name: p2Customers.customerName,
      generalEmail: p2Customers.contactEmail,
    })
    .from(p2Customers)
    .where(eq(p2Customers.status, 'ACTIVE'))
    .orderBy(asc(p2Customers.customerName));
}

export async function listFinanceBillingRecipients(
  scope: BillingCustomerScope,
  customerId: number
) {
  return db
    .select()
    .from(financeBillingRecipients)
    .where(
      and(
        eq(financeBillingRecipients.customerScope, scope),
        scope === 'P1'
          ? eq(financeBillingRecipients.p1CustomerId, customerId)
          : eq(financeBillingRecipients.p2CustomerId, customerId)
      )
    )
    .orderBy(
      asc(financeBillingRecipients.deliveryRole),
      asc(financeBillingRecipients.email)
    );
}

export async function createFinanceBillingRecipient(
  input: BillingRecipientInput,
  actor: FinancePilotUser
) {
  return db.transaction(async (tx) => {
    const [recipient] = await tx
      .insert(financeBillingRecipients)
      .values({
        ...customerColumns(input.customerScope, input.customerId),
        customerScope: input.customerScope,
        recipientName: input.recipientName.trim(),
        email: input.email.trim().toLowerCase(),
        deliveryRole: input.deliveryRole,
        receivesInvoices: input.receivesInvoices,
        receivesStatements: input.receivesStatements,
        receivesCreditMemos: input.receivesCreditMemos,
        active: input.active,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
        changeReason: input.changeReason.trim(),
        createdByUserId: actor.id ?? null,
        createdByDisplayName: actorDisplayName(actor),
        updatedByUserId: actor.id ?? null,
        updatedByDisplayName: actorDisplayName(actor),
      })
      .returning();

    await recordFinanceDecision(
      {
        eventType: 'FINANCE_BILLING_RECIPIENT_CREATED',
        subjectType: 'finance_billing_recipient',
        subjectId: recipient.id,
        authorityLevel: 'PREPARE',
        actor,
        sourceVersion: recipient.updatedAt.toISOString(),
        evidenceSnapshot: recipient,
        reason: input.changeReason,
      },
      tx
    );
    return recipient;
  });
}

export type BillingRecipientUpdate = Omit<
  BillingRecipientInput,
  'customerScope' | 'customerId'
>;

export async function updateFinanceBillingRecipient(
  id: string,
  input: BillingRecipientUpdate,
  actor: FinancePilotUser
) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(financeBillingRecipients)
      .where(eq(financeBillingRecipients.id, id));
    if (!before) return null;

    const [recipient] = await tx
      .update(financeBillingRecipients)
      .set({
        recipientName: input.recipientName.trim(),
        email: input.email.trim().toLowerCase(),
        deliveryRole: input.deliveryRole,
        receivesInvoices: input.receivesInvoices,
        receivesStatements: input.receivesStatements,
        receivesCreditMemos: input.receivesCreditMemos,
        active: input.active,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
        changeReason: input.changeReason.trim(),
        updatedByUserId: actor.id ?? null,
        updatedByDisplayName: actorDisplayName(actor),
        updatedAt: new Date(),
      })
      .where(eq(financeBillingRecipients.id, id))
      .returning();

    await recordFinanceDecision(
      {
        eventType: input.active
          ? 'FINANCE_BILLING_RECIPIENT_UPDATED'
          : 'FINANCE_BILLING_RECIPIENT_DEACTIVATED',
        subjectType: 'finance_billing_recipient',
        subjectId: recipient.id,
        authorityLevel: 'PREPARE',
        actor,
        sourceVersion: recipient.updatedAt.toISOString(),
        evidenceSnapshot: { before, after: recipient },
        reason: input.changeReason,
      },
      tx
    );
    return recipient;
  });
}
