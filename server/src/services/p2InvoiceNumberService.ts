import type { PoolClient } from 'pg';
import { pgPool } from '../../db';

type Queryable = PoolClient;

export type P2InvoiceNumberReservation = {
  invoiceNumber: string;
  prefix: string;
  year: number;
  sequenceNumber: number;
  customerId: string;
  customerName: string;
};

type ReserveInput = {
  customerId: string;
  customerName: string;
  year?: number;
};

type AuditInput = {
  packingSlipId?: string | null;
  invoiceId?: string | null;
  customerId?: string | null;
  oldPackingSlipNumber?: string | null;
  newPackingSlipNumber?: string | null;
  oldInvoiceNumber?: string | null;
  newInvoiceNumber?: string | null;
  action: string;
  reason?: string | null;
  changedBy?: string | null;
  metadata?: Record<string, unknown>;
};

let p2InvoiceNumberingSchemaReady: Promise<void> | null = null;

export function deriveP2InvoicePrefixBase(customerName: string): string {
  const normalized = customerName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (normalized.slice(0, 3) || 'P2X').padEnd(3, 'X');
}

export function parseP2InvoiceNumber(value: string | null | undefined): {
  prefix: string;
  year: number;
  sequenceNumber: number;
} | null {
  const match = String(value || '').trim().toUpperCase().match(/^([A-Z0-9]{3,})?(\d{2})-(\d{4,})$/);
  if (!match) return null;

  const prefix = match[1];
  const yearShort = Number(match[2]);
  const sequenceNumber = Number(match[3]);
  if (!prefix || !Number.isFinite(yearShort) || !Number.isFinite(sequenceNumber)) return null;

  return {
    prefix,
    year: 2000 + yearShort,
    sequenceNumber,
  };
}

export async function ensureP2InvoiceNumberingSchema(): Promise<void> {
  if (!p2InvoiceNumberingSchemaReady) {
    p2InvoiceNumberingSchemaReady = pgPool.query(`
      ALTER TABLE p2_packing_slips
        ADD COLUMN IF NOT EXISTS invoice_number text;

      CREATE TABLE IF NOT EXISTS p2_invoice_number_configs (
        id SERIAL PRIMARY KEY,
        customer_id TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        prefix TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS p2_invoice_number_sequences (
        id SERIAL PRIMARY KEY,
        customer_id TEXT NOT NULL,
        prefix TEXT NOT NULL,
        year INTEGER NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(customer_id, year)
      );

      CREATE INDEX IF NOT EXISTS p2_invoice_number_sequences_prefix_year_idx
        ON p2_invoice_number_sequences(prefix, year);

      CREATE TABLE IF NOT EXISTS p2_invoice_number_audit (
        id SERIAL PRIMARY KEY,
        packing_slip_id UUID,
        invoice_id UUID,
        customer_id TEXT,
        old_packing_slip_number TEXT,
        new_packing_slip_number TEXT,
        old_invoice_number TEXT,
        new_invoice_number TEXT,
        action TEXT NOT NULL,
        reason TEXT,
        changed_by TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS p2_invoice_number_audit_packing_slip_idx
        ON p2_invoice_number_audit(packing_slip_id);
      CREATE INDEX IF NOT EXISTS p2_invoice_number_audit_customer_idx
        ON p2_invoice_number_audit(customer_id);
    `)
      .then(() => undefined)
      .catch((err) => {
        p2InvoiceNumberingSchemaReady = null;
        throw err;
      });
  }

  return p2InvoiceNumberingSchemaReady;
}

async function getOrCreateCustomerConfig(client: Queryable, input: ReserveInput) {
  const existing = await client.query<{
    customer_id: string;
    customer_name: string;
    prefix: string;
  }>(
    `SELECT customer_id, customer_name, prefix
       FROM p2_invoice_number_configs
      WHERE customer_id = $1
      FOR UPDATE`,
    [input.customerId]
  );

  if (existing.rows[0]) {
    if (existing.rows[0].customer_name !== input.customerName) {
      await client.query(
        `UPDATE p2_invoice_number_configs
            SET customer_name = $2, updated_at = NOW()
          WHERE customer_id = $1`,
        [input.customerId, input.customerName]
      );
    }
    return existing.rows[0];
  }

  const basePrefix = deriveP2InvoicePrefixBase(input.customerName);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const prefix = attempt === 0 ? basePrefix : `${basePrefix}${attempt + 1}`;
    const prefixConflict = await client.query(
      `SELECT id FROM p2_invoice_number_configs WHERE prefix = $1 LIMIT 1`,
      [prefix]
    );
    if (prefixConflict.rows.length > 0) continue;

    const inserted = await client.query<{
      customer_id: string;
      customer_name: string;
      prefix: string;
    }>(
      `INSERT INTO p2_invoice_number_configs (customer_id, customer_name, prefix)
       VALUES ($1, $2, $3)
       RETURNING customer_id, customer_name, prefix`,
      [input.customerId, input.customerName, prefix]
    );
    return inserted.rows[0];
  }

  throw new Error(`Unable to create unique P2 invoice prefix for ${input.customerName}`);
}

async function reserveP2InvoiceNumberWithClient(
  client: Queryable,
  input: ReserveInput,
): Promise<P2InvoiceNumberReservation> {
  const year = input.year || new Date().getFullYear();
  const yearShort = String(year).slice(-2);
  const config = await getOrCreateCustomerConfig(client, input);

  const existingSequence = await client.query<{ id: number; last_number: number }>(
    `SELECT id, last_number
       FROM p2_invoice_number_sequences
      WHERE customer_id = $1 AND year = $2
      FOR UPDATE`,
    [input.customerId, year]
  );

  const sequenceNumber = Number(existingSequence.rows[0]?.last_number || 0) + 1;
  if (existingSequence.rows[0]) {
    await client.query(
      `UPDATE p2_invoice_number_sequences
          SET last_number = $3, prefix = $4, updated_at = NOW()
        WHERE customer_id = $1 AND year = $2`,
      [input.customerId, year, sequenceNumber, config.prefix]
    );
  } else {
    await client.query(
      `INSERT INTO p2_invoice_number_sequences (customer_id, prefix, year, last_number)
       VALUES ($1, $2, $3, $4)`,
      [input.customerId, config.prefix, year, sequenceNumber]
    );
  }

  return {
    customerId: input.customerId,
    customerName: input.customerName,
    prefix: config.prefix,
    year,
    sequenceNumber,
    invoiceNumber: `${config.prefix}${yearShort}-${String(sequenceNumber).padStart(4, '0')}`,
  };
}

export async function reserveP2InvoiceNumber(input: ReserveInput): Promise<P2InvoiceNumberReservation> {
  await ensureP2InvoiceNumberingSchema();
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const reservation = await reserveP2InvoiceNumberWithClient(client, input);
    await client.query('COMMIT');
    return reservation;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function recordP2InvoiceNumberAuditWithClient(client: Queryable, input: AuditInput) {
  await client.query(
    `INSERT INTO p2_invoice_number_audit (
       packing_slip_id, invoice_id, customer_id,
       old_packing_slip_number, new_packing_slip_number,
       old_invoice_number, new_invoice_number,
       action, reason, changed_by, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
    [
      input.packingSlipId || null,
      input.invoiceId || null,
      input.customerId || null,
      input.oldPackingSlipNumber || null,
      input.newPackingSlipNumber || null,
      input.oldInvoiceNumber || null,
      input.newInvoiceNumber || null,
      input.action,
      input.reason || null,
      input.changedBy || null,
      JSON.stringify(input.metadata || {}),
    ]
  );
}

export async function recordP2InvoiceNumberAudit(input: AuditInput): Promise<void> {
  await ensureP2InvoiceNumberingSchema();
  await recordP2InvoiceNumberAuditWithClient(pgPool as unknown as Queryable, input);
}

async function syncP2InvoiceSequenceFromManualNumberWithClient(client: Queryable, input: {
  customerId: string;
  customerName: string;
  invoiceNumber: string;
}): Promise<void> {
  const parsed = parseP2InvoiceNumber(input.invoiceNumber);
  if (!parsed) return;

  await getOrCreateCustomerConfig(client, input);
  await client.query(
    `UPDATE p2_invoice_number_configs
        SET prefix = $3, customer_name = $2, updated_at = NOW()
      WHERE customer_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM p2_invoice_number_configs other
           WHERE other.prefix = $3 AND other.customer_id <> $1
        )`,
    [input.customerId, input.customerName, parsed.prefix]
  );

  await client.query(
    `INSERT INTO p2_invoice_number_sequences (customer_id, prefix, year, last_number)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (customer_id, year)
     DO UPDATE SET
       prefix = EXCLUDED.prefix,
       last_number = GREATEST(p2_invoice_number_sequences.last_number, EXCLUDED.last_number),
       updated_at = NOW()`,
    [input.customerId, parsed.prefix, parsed.year, parsed.sequenceNumber]
  );
}

export async function syncP2InvoiceSequenceFromManualNumber(input: {
  customerId: string;
  customerName: string;
  invoiceNumber: string;
}): Promise<void> {
  await ensureP2InvoiceNumberingSchema();
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await syncP2InvoiceSequenceFromManualNumberWithClient(client, input);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function assignReservedP2InvoiceNumberToPackingSlip(input: {
  packingSlipId: string;
  reason: string;
  changedBy?: string | null;
  reuseExistingPackingSlipNumber?: boolean;
}): Promise<string> {
  await ensureP2InvoiceNumberingSchema();
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const slipResult = await client.query<{
      id: string;
      packing_slip_number: string | null;
      invoice_number: string | null;
      customer_id: string;
      customer_name: string;
    }>(
      `SELECT id, packing_slip_number, invoice_number, customer_id, customer_name
         FROM p2_packing_slips
        WHERE id = $1
        FOR UPDATE`,
      [input.packingSlipId]
    );

    const slip = slipResult.rows[0];
    if (!slip) throw new Error(`Packing slip ${input.packingSlipId} not found`);

    const existingNumber = parseP2InvoiceNumber(slip.invoice_number)
      ? slip.invoice_number
      : input.reuseExistingPackingSlipNumber !== false && parseP2InvoiceNumber(slip.packing_slip_number)
        ? slip.packing_slip_number
        : null;

    const invoiceNumber = existingNumber || (
      await reserveP2InvoiceNumberWithClient(client, {
        customerId: slip.customer_id,
        customerName: slip.customer_name,
      })
    ).invoiceNumber;

    await client.query(
      `UPDATE p2_packing_slips
          SET invoice_number = $2,
              packing_slip_number = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [slip.id, invoiceNumber]
    );

    if (existingNumber) {
      await syncP2InvoiceSequenceFromManualNumberWithClient(client, {
        customerId: slip.customer_id,
        customerName: slip.customer_name,
        invoiceNumber,
      });
    }

    await recordP2InvoiceNumberAuditWithClient(client, {
      packingSlipId: slip.id,
      customerId: slip.customer_id,
      oldPackingSlipNumber: slip.packing_slip_number,
      newPackingSlipNumber: invoiceNumber,
      oldInvoiceNumber: slip.invoice_number,
      newInvoiceNumber: invoiceNumber,
      action: 'RESERVE_FOR_PACKING_SLIP',
      reason: input.reason,
      changedBy: input.changedBy || 'system',
      metadata: { reusedExisting: Boolean(existingNumber) },
    });

    await client.query('COMMIT');
    return invoiceNumber;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
