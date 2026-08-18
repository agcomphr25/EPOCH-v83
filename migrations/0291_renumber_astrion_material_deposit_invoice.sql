-- One-time audited correction for Astrion's first P2 material-deposit invoice.
-- AST26-0002 was reserved before the invoice workflow was finalized; make it
-- AST26-0001 and leave the 2026 sequence at 1 so the next number is AST26-0002.

DO $$
DECLARE
  target_invoice ar_invoices%ROWTYPE;
  voided_invoice ar_invoices%ROWTYPE;
  voided_archive_number text;
  target_count integer;
  before_sequence jsonb;
BEGIN
  SELECT count(*) INTO target_count
    FROM ar_invoices
   WHERE invoice_number = 'AST26-0002';

  IF target_count = 0 THEN
    -- Idempotent success after this correction has already been applied.
    IF EXISTS (
      SELECT 1
        FROM ar_invoices invoice
        JOIN p2_customers customer ON customer.customer_id = invoice.customer_id
       WHERE invoice.invoice_number = 'AST26-0001'
         AND invoice.invoice_type = 'MATERIAL_DEPOSIT'
         AND lower(customer.customer_name) LIKE 'astrion%'
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION '0291 AMBIGUOUS_STOP: AST26-0002 was not found and the corrected AST26-0001 does not exist';
  ELSIF target_count <> 1 THEN
    RAISE EXCEPTION '0291 AMBIGUOUS_STOP: expected one AST26-0002 invoice, found %', target_count;
  END IF;

  SELECT invoice.* INTO target_invoice
    FROM ar_invoices invoice
    JOIN p2_customers customer ON customer.customer_id = invoice.customer_id
   WHERE invoice.invoice_number = 'AST26-0002'
     AND invoice.invoice_type = 'MATERIAL_DEPOSIT'
     AND invoice.status IN ('DRAFT', 'REVIEW')
     AND invoice.posted_at IS NULL
     AND invoice.sent_at IS NULL
     AND invoice.packing_slip_id IS NULL
     AND lower(customer.customer_name) LIKE 'astrion%';

  IF target_invoice.id IS NULL THEN
    RAISE EXCEPTION '0291 AMBIGUOUS_STOP: AST26-0002 is not an unposted, unsent Astrion material-deposit invoice';
  END IF;

  SELECT invoice.* INTO voided_invoice
    FROM ar_invoices invoice
    JOIN p2_customers customer ON customer.customer_id = invoice.customer_id
   WHERE invoice.invoice_number = 'AST26-0001'
     AND invoice.status = 'VOID'
     AND invoice.voided_at IS NOT NULL
     AND lower(customer.customer_name) LIKE 'astrion%';

  IF EXISTS (SELECT 1 FROM ar_invoices WHERE invoice_number = 'AST26-0001')
     AND voided_invoice.id IS NULL THEN
    -- Never reuse a number belonging to a live or ambiguously voided invoice.
    RAISE NOTICE '0291 SAFE_SKIP: AST26-0001 is assigned to an invoice that is not a confirmed voided Astrion invoice; no data was changed';
    RETURN;
  END IF;

  IF voided_invoice.id IS NOT NULL THEN
    -- Preserve the voided invoice and its UUID-linked history while releasing
    -- the customer-facing number Glenn explicitly approved for reuse.
    voided_archive_number := 'AST26-0001-VOID-' || left(voided_invoice.id::text, 8);

    UPDATE ar_invoices
       SET invoice_number = voided_archive_number,
           updated_at = now()
     WHERE id = voided_invoice.id
       AND status = 'VOID'
       AND voided_at IS NOT NULL;

    INSERT INTO p2_invoice_number_audit (
      invoice_id, customer_id, old_invoice_number, new_invoice_number,
      action, reason, changed_by, metadata
    ) VALUES (
      voided_invoice.id,
      voided_invoice.customer_id,
      'AST26-0001',
      voided_archive_number,
      'VOIDED_NUMBER_RELEASE',
      'Release the number of Glenn Jones'' confirmed voided Astrion invoice while preserving the voided record and UUID-linked audit history.',
      'migration:0291 approved by Glenn Jones',
      jsonb_build_object('invoiceStatus', voided_invoice.status, 'voidedAt', voided_invoice.voided_at)
    );

    INSERT INTO schema_change_log (
      actor, action_type, table_name, column_name, before_state, after_state,
      approved_by, override_reason
    ) VALUES (
      'migration:0291', 'OVERRIDE', 'ar_invoices', 'invoice_number',
      jsonb_build_object('invoiceId', voided_invoice.id, 'invoiceNumber', 'AST26-0001', 'status', voided_invoice.status),
      jsonb_build_object('invoiceId', voided_invoice.id, 'invoiceNumber', voided_archive_number, 'status', voided_invoice.status),
      'Glenn Jones',
      'Preserve the voided invoice under an archival number and release AST26-0001 for the valid first Astrion material-deposit invoice.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM ar_invoices
     WHERE customer_id = target_invoice.customer_id
       AND id <> target_invoice.id
       AND invoice_number ~ '^AST26-[0-9]+$'
  ) OR EXISTS (
    SELECT 1 FROM p2_packing_slips
     WHERE customer_id = target_invoice.customer_id
       AND invoice_number ~ '^AST26-[0-9]+$'
  ) THEN
    RAISE EXCEPTION '0291 AMBIGUOUS_STOP: another Astrion 2026 invoice reservation exists; sequence cannot be safely rewound';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM p2_invoice_number_configs
     WHERE customer_id = target_invoice.customer_id
       AND prefix = 'AST'
  ) THEN
    RAISE EXCEPTION '0291 AMBIGUOUS_STOP: Astrion invoice-number configuration is not prefix AST';
  END IF;

  SELECT to_jsonb(sequence_row) INTO before_sequence
    FROM p2_invoice_number_sequences sequence_row
   WHERE sequence_row.customer_id = target_invoice.customer_id
     AND sequence_row.year = 2026;

  UPDATE ar_invoices
     SET invoice_number = 'AST26-0001',
         updated_at = now()
   WHERE id = target_invoice.id;

  INSERT INTO p2_invoice_number_sequences (customer_id, prefix, year, last_number, updated_at)
  VALUES (target_invoice.customer_id, 'AST', 2026, 1, now())
  ON CONFLICT (customer_id, year)
  DO UPDATE SET prefix = 'AST', last_number = 1, updated_at = now();

  INSERT INTO p2_invoice_number_audit (
    invoice_id,
    customer_id,
    old_invoice_number,
    new_invoice_number,
    action,
    reason,
    changed_by,
    metadata
  ) VALUES (
    target_invoice.id,
    target_invoice.customer_id,
    'AST26-0002',
    'AST26-0001',
    'ONE_TIME_INVOICE_RENUMBER',
    'Correct Astrion first material-deposit invoice number after the CLIN/PO-line workflow adjustment; reset the 2026 customer sequence so the next invoice is AST26-0002.',
    'migration:0291 approved by Glenn Jones',
    jsonb_build_object(
      'invoiceType', target_invoice.invoice_type,
      'invoiceStatus', target_invoice.status,
      'sequenceBefore', before_sequence,
      'sequenceAfter', jsonb_build_object('prefix', 'AST', 'year', 2026, 'lastNumber', 1)
    )
  );

  INSERT INTO schema_change_log (
    actor,
    action_type,
    table_name,
    column_name,
    before_state,
    after_state,
    approved_by,
    override_reason
  ) VALUES (
    'migration:0291',
    'OVERRIDE',
    'ar_invoices',
    'invoice_number',
    jsonb_build_object('invoiceId', target_invoice.id, 'invoiceNumber', 'AST26-0002', 'sequence', before_sequence),
    jsonb_build_object('invoiceId', target_invoice.id, 'invoiceNumber', 'AST26-0001', 'sequence', jsonb_build_object('prefix', 'AST', 'year', 2026, 'lastNumber', 1)),
    'Glenn Jones',
    'Renumber the first Astrion material-deposit invoice and safely reset that customer''s 2026 invoice sequence.'
  );
END $$;
