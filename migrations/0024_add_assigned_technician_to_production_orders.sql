-- Add assigned_technician column to production_orders
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS assigned_technician TEXT;

-- Backfill 18 known records from the week of Mar 23-29, 2026 to Tomas Montes
UPDATE production_orders
SET assigned_technician = 'Tomas Montes'
WHERE order_id IN (
  'FB295',
  'FB297',
  'FB298',
  'FB300',
  'FB301',
  'FB302',
  'FB303',
  'FB304',
  'FB305',
  'FB306',
  'FB307',
  'PO-0046-174-14',
  'PO-0046-174-20',
  'PO-0046-174-9',
  'PO-0046-5-189',
  'PO-P18432-39-1',
  'PO-RFPO-002481-175-21',
  'PO-RFPO-002481-175-23'
);
