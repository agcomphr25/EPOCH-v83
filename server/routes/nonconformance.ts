import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm';

import { db, pool } from '../db';
import {
  nonconformanceRecords,
  insertNonconformanceRecordSchema,
  allOrders,
  customerAddresses,
} from '../schema';
import { recordNcrRepairTransition } from '../src/services/orderActivityService';

const router = Router();

type NcrSelectColumn = {
  column: string;
  alias: string;
  fallback: string;
};

const ncrSelectColumns: NcrSelectColumn[] = [
  { column: 'rma_number', alias: 'rmaNumber', fallback: 'NULL' },
  { column: 'date_received', alias: 'dateReceived', fallback: 'NULL' },
  { column: 'repair_department', alias: 'repairDepartment', fallback: 'NULL' },
  { column: 'repair_notes', alias: 'repairNotes', fallback: 'NULL' },
  { column: 'has_customer_parts_to_return', alias: 'hasCustomerPartsToReturn', fallback: 'FALSE' },
  { column: 'added_to_rts', alias: 'addedToRts', fallback: 'FALSE' },
  { column: 'rts_added_at', alias: 'rtsAddedAt', fallback: 'NULL' },
  { column: 'use_order_address', alias: 'useOrderAddress', fallback: 'FALSE' },
  { column: 'repair_address', alias: 'repairAddress', fallback: 'NULL' },
  { column: 'shipping_status', alias: 'shippingStatus', fallback: 'NULL' },
  { column: 'tracking_number', alias: 'trackingNumber', fallback: 'NULL' },
  { column: 'shipping_carrier', alias: 'shippingCarrier', fallback: 'NULL' },
  { column: 'shipped_date', alias: 'shippedDate', fallback: 'NULL' },
  { column: 'customer_notified', alias: 'customerNotified', fallback: 'FALSE' },
  { column: 'containment_action', alias: 'containmentAction', fallback: 'NULL' },
  { column: 'containment_owner', alias: 'containmentOwner', fallback: 'NULL' },
  { column: 'containment_due_date', alias: 'containmentDueDate', fallback: 'NULL' },
  { column: 'containment_completed_at', alias: 'containmentCompletedAt', fallback: 'NULL' },
  { column: 'root_cause', alias: 'rootCause', fallback: 'NULL' },
  { column: 'root_cause_method', alias: 'rootCauseMethod', fallback: 'NULL' },
  { column: 'corrective_action', alias: 'correctiveAction', fallback: 'NULL' },
  { column: 'preventive_action', alias: 'preventiveAction', fallback: 'NULL' },
  { column: 'capa_required', alias: 'capaRequired', fallback: 'FALSE' },
  { column: 'capa_id', alias: 'capaId', fallback: 'NULL' },
  { column: 'disposition_rationale', alias: 'dispositionRationale', fallback: 'NULL' },
  { column: 'disposition_approved_by_user_id', alias: 'dispositionApprovedByUserId', fallback: 'NULL' },
  { column: 'disposition_approved_by_display_name', alias: 'dispositionApprovedByDisplayName', fallback: 'NULL' },
  { column: 'disposition_approved_at', alias: 'dispositionApprovedAt', fallback: 'NULL' },
  { column: 'effectiveness_review', alias: 'effectivenessReview', fallback: 'NULL' },
  { column: 'effectiveness_status', alias: 'effectivenessStatus', fallback: "'not_started'" },
  { column: 'effectiveness_reviewed_by_user_id', alias: 'effectivenessReviewedByUserId', fallback: 'NULL' },
  { column: 'effectiveness_reviewed_by_display_name', alias: 'effectivenessReviewedByDisplayName', fallback: 'NULL' },
  { column: 'effectiveness_reviewed_at', alias: 'effectivenessReviewedAt', fallback: 'NULL' },
  { column: 'recurrence_detected', alias: 'recurrenceDetected', fallback: 'FALSE' },
];

async function getNonconformanceColumns() {
  const rows = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'nonconformance_records'
    `
  );

  return new Set(rows.map((row: any) => row.column_name));
}

function ncrSelectExpression(columns: Set<string>, item: NcrSelectColumn) {
  const expression = columns.has(item.column) ? item.column : item.fallback;
  return `${expression} as "${item.alias}"`;
}

// GET /api/nonconformance - List records with filtering
router.get('/', async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      stockModel,
      issueCause,
      status,
      search,
      limit = '50',
      offset = '0',
    } = req.query;

    // Build WHERE conditions
    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (dateFrom) {
      whereClauses.push(`disposition_date >= $${paramIndex++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClauses.push(`disposition_date <= $${paramIndex++}`);
      params.push(dateTo);
    }
    if (stockModel) {
      whereClauses.push(`stock_model ILIKE $${paramIndex++}`);
      params.push(`%${stockModel}%`);
    }
    if (issueCause) {
      whereClauses.push(`issue_cause = $${paramIndex++}`);
      params.push(issueCause);
    }
    if (status) {
      whereClauses.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (search) {
      whereClauses.push(`(order_id ILIKE $${paramIndex} OR serial_number ILIKE $${paramIndex} OR customer_name ILIKE $${paramIndex} OR po_number ILIKE $${paramIndex} OR stock_model ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const tableColumns = await getNonconformanceColumns();
    const optionalColumns = ncrSelectColumns
      .map((item) => ncrSelectExpression(tableColumns, item))
      .join(',\n        ');
    
    // Use pg Pool directly to avoid Neon HTTP driver issues with non-Neon databases
    const queryText = `
      SELECT 
        id, ${optionalColumns}, order_id as "orderId", serial_number as "serialNumber",
        customer_name as "customerName", po_number as "poNumber", stock_model as "stockModel",
        quantity, issue_cause as "issueCause", manufacturer_defect as "manufacturerDefect",
        disposition, auth_person as "authorization", disposition_date as "dispositionDate",
        notes, status, resolved_at as "resolvedAt",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM nonconformance_records
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit as string)} OFFSET ${parseInt(offset as string)}
    `;

    const result = await pool.query(queryText, params);
    res.json(result || []);
  } catch (error) {
    console.error('Error fetching nonconformance records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// GET /api/nonconformance/ready-to-ship - Get RMAs ready for shipping
router.get('/ready-to-ship', async (req, res) => {
  try {
    const records = await db
      .select()
      .from(nonconformanceRecords)
      .where(eq(nonconformanceRecords.shippingStatus, 'Ready to Ship'))
      .orderBy(desc(nonconformanceRecords.resolvedAt));

    // Transform RMA records to match order format for shipping queue
    // Enrich with shipping address from original order or repairAddress
    const rmaShipments = await Promise.all(records.map(async (record) => {
      let shippingAddress = null;
      let customerId = null;

      // If useOrderAddress is false and repairAddress exists, use it directly
      if (!record.useOrderAddress && record.repairAddress) {
        const repairAddr = record.repairAddress as any;
        shippingAddress = {
          name: repairAddr.name || record.customerName || '',
          street: repairAddr.street || '',
          city: repairAddr.city || '',
          state: repairAddr.state || '',
          zipCode: repairAddr.zip || repairAddr.zipCode || '',
          country: repairAddr.country || 'US',
        };
      }
      // Otherwise, try to get shipping address from original order
      else if (record.orderId) {
        try {
          const [originalOrder] = await db
            .select()
            .from(allOrders)
            .where(eq(allOrders.orderId, record.orderId))
            .limit(1);
          
          if (originalOrder && originalOrder.customerId) {
            customerId = originalOrder.customerId;
            // Get customer addresses from the customerAddresses table
            // Note: customerAddresses.customerId is integer, originalOrder.customerId is text
            const customerIdInt = parseInt(originalOrder.customerId, 10);
            const custAddressList = !isNaN(customerIdInt) ? await db
              .select()
              .from(customerAddresses)
              .where(eq(customerAddresses.customerId, customerIdInt)) : [];
            
            if (originalOrder.hasAltShipTo && originalOrder.altShipToAddress) {
              const altAddr = originalOrder.altShipToAddress as any;
              shippingAddress = {
                name: originalOrder.altShipToName || record.customerName || '',
                street: altAddr?.street || '',
                city: altAddr?.city || '',
                state: altAddr?.state || '',
                zipCode: altAddr?.zip || altAddr?.zipCode || '',
                country: altAddr?.country || 'US',
              };
            } else if (custAddressList.length > 0) {
              shippingAddress = {
                name: record.customerName || '',
                street: custAddressList[0].street || '',
                city: custAddressList[0].city || '',
                state: custAddressList[0].state || '',
                zipCode: custAddressList[0].zipCode || '',
                country: custAddressList[0].country || 'US',
              };
            }
          }
        } catch (err) {
          console.error(`Failed to get shipping address for RMA ${record.id}:`, err);
        }
      }

      // Final fallback to repairAddress if no address found and repairAddress exists
      if (!shippingAddress && record.repairAddress) {
        const repairAddr = record.repairAddress as any;
        shippingAddress = {
          name: repairAddr.name || record.customerName || '',
          street: repairAddr.street || '',
          city: repairAddr.city || '',
          state: repairAddr.state || '',
          zipCode: repairAddr.zip || repairAddr.zipCode || '',
          country: repairAddr.country || 'US',
        };
      }

      return {
        id: `rma-${record.id}`,
        orderId: record.rmaNumber || `RMA-${record.id}`,
        originalOrderId: record.orderId,
        isRma: true,
        rmaId: record.id,
        customerId,
        customerName: record.customerName,
        stockModel: record.stockModel,
        currentDepartment: 'Shipping',
        status: 'IN_PROGRESS',
        disposition: record.disposition,
        notes: record.notes,
        repairNotes: record.repairNotes,
        trackingNumber: record.trackingNumber,
        shippingCarrier: record.shippingCarrier,
        shippedDate: record.shippedDate,
        customerNotified: record.customerNotified,
        useOrderAddress: record.useOrderAddress,
        repairAddress: record.repairAddress,
        shippingAddress, // Include enriched shipping address
        resolvedAt: record.resolvedAt,
        createdAt: record.createdAt,
      };
    }));

    res.json(rmaShipments);
  } catch (error) {
    console.error('Error fetching RMAs ready to ship:', error);
    res.status(500).json({ error: 'Failed to fetch RMAs' });
  }
});

// POST /api/nonconformance/fulfill - Mark RMA as fulfilled/shipped (used from shipping queue)
router.post('/fulfill', async (req, res) => {
  try {
    const { rmaId, orderId, trackingNumber, shippingCarrier, shippedDate } = req.body;

    // Support finding by rmaId (NCR integer id) or by orderId (RMA number string)
    let ncrId: number | null = null;

    if (rmaId) {
      ncrId = typeof rmaId === 'number' ? rmaId : parseInt(rmaId, 10);
    } else if (orderId) {
      // orderId might be like "RMA260130-2" or the rma_number field
      // Try to find the NCR record by rma_number
      const [found] = await db
        .select()
        .from(nonconformanceRecords)
        .where(eq(nonconformanceRecords.rmaNumber, orderId))
        .limit(1);

      if (found) {
        ncrId = found.id;
      } else {
        // Try stripping "RMA-" prefix and parsing as integer
        const stripped = orderId.replace(/^RMA-?/i, '');
        const parsed = parseInt(stripped, 10);
        if (!isNaN(parsed)) {
          const [foundById] = await db
            .select()
            .from(nonconformanceRecords)
            .where(eq(nonconformanceRecords.id, parsed))
            .limit(1);
          if (foundById) {
            ncrId = foundById.id;
          }
        }
      }
    }

    if (!ncrId) {
      return res.status(400).json({ error: 'RMA ID or Order ID is required' });
    }

    // Build update data - always mark as Shipped/Resolved, include tracking if provided
    const updateData: any = {
      shippingStatus: 'Shipped',
      status: 'Resolved',
      resolvedAt: new Date(),
      updatedAt: new Date(),
    };

    // If tracking info wasn't already saved during label creation, save it now
    if (trackingNumber) updateData.trackingNumber = trackingNumber;
    if (shippingCarrier) updateData.shippingCarrier = shippingCarrier;
    if (shippedDate) {
      updateData.shippedDate = shippedDate;
    } else {
      updateData.shippedDate = new Date().toISOString().split('T')[0];
    }

    // Update the NCR: mark shipping status as 'Shipped' and ensure status is 'Resolved'
    const [updated] = await db
      .update(nonconformanceRecords)
      .set(updateData)
      .where(eq(nonconformanceRecords.id, ncrId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: `NCR record ${ncrId} not found` });
    }

    console.log(`✅ RMA FULFILLED: NCR #${ncrId} (${updated.rmaNumber || 'N/A'}) marked as Shipped and Resolved`);

    res.json({
      success: true,
      message: `RMA ${updated.rmaNumber || ncrId} has been fulfilled and marked as resolved`,
      record: updated,
    });
  } catch (error) {
    console.error('Error fulfilling RMA:', error);
    res.status(500).json({ error: 'Failed to fulfill RMA' });
  }
});

// GET /api/nonconformance/:id - Get single record
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const record = await db
      .select()
      .from(nonconformanceRecords)
      .where(eq(nonconformanceRecords.id, parseInt(id)))
      .limit(1);

    if (record.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json(record[0]);
  } catch (error) {
    console.error('Error fetching nonconformance record:', error);
    res.status(500).json({ error: 'Failed to fetch record' });
  }
});

// Helper function to generate RMA number in format RMAYYMMDD-X
async function generateRmaNumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const datePrefix = `RMA${year}${month}${day}`;
  
  // Count existing RMAs for today and find the highest number
  const todayPattern = `${datePrefix}-%`;
  const existingRmas = await db
    .select({ rmaNumber: nonconformanceRecords.rmaNumber })
    .from(nonconformanceRecords)
    .where(ilike(nonconformanceRecords.rmaNumber, todayPattern));
  
  // Extract the highest number used today
  let maxNumber = 0;
  for (const rma of existingRmas) {
    if (rma.rmaNumber) {
      const match = rma.rmaNumber.match(/-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }
  }
  
  const nextNumber = maxNumber + 1;
  return `${datePrefix}-${nextNumber}`;
}

function validateNcrClosure(data: z.infer<typeof insertNonconformanceRecordSchema>): string[] {
  if (data.status !== 'Resolved') return [];

  const missing: string[] = [];
  if (!data.containmentAction?.trim()) missing.push('containment action');
  if (!data.rootCause?.trim()) missing.push('root cause');
  if (!data.correctiveAction?.trim()) missing.push('corrective action');
  if (!data.dispositionRationale?.trim()) missing.push('disposition rationale');
  if (data.effectivenessStatus !== 'effective') missing.push('effective effectiveness review');
  if (data.recurrenceDetected && !data.preventiveAction?.trim()) {
    missing.push('preventive action for recurrence');
  }
  return missing;
}

// POST /api/nonconformance - Create new record
router.post('/', async (req, res) => {
  try {
    // Convert empty date strings to null before validation
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.dateReceived === '') sanitizedBody.dateReceived = null;
    if (sanitizedBody.dispositionDate === '') sanitizedBody.dispositionDate = null;
    if (sanitizedBody.containmentDueDate === '') sanitizedBody.containmentDueDate = null;
    if (sanitizedBody.containmentCompletedAt === '') sanitizedBody.containmentCompletedAt = null;
    if (sanitizedBody.dispositionApprovedAt === '') sanitizedBody.dispositionApprovedAt = null;
    if (sanitizedBody.effectivenessReviewedAt === '') sanitizedBody.effectivenessReviewedAt = null;
    
    const validatedData = insertNonconformanceRecordSchema.parse(sanitizedBody);

    // Auto-generate RMA number if not provided
    const rmaNumber = validatedData.rmaNumber || await generateRmaNumber();

    const [newRecord] = await db
      .insert(nonconformanceRecords)
      .values({
        ...validatedData,
        rmaNumber,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // If this is a Repair disposition with a repair department, move the order to that department
    if (newRecord.disposition === 'Repair' && newRecord.repairDepartment && newRecord.orderId) {
      try {
        await recordNcrRepairTransition(
          newRecord.orderId,
          newRecord.repairDepartment,
          newRecord.id,
          {
            actorDisplayName: (req as any).user?.username || 'System',
            actorType: 'user',
          },
          {
            source: 'ncr',
            sourceRoute: '/api/nonconformance',
            reasonText: `NCR #${newRecord.id} (${newRecord.rmaNumber || 'N/A'}) - Repair disposition`,
            metadata: { ncrId: newRecord.id, rmaNumber: newRecord.rmaNumber },
          }
        );
        
        console.log(`✅ Moved order ${newRecord.orderId} to ${newRecord.repairDepartment} department for nonconformance repair (status: IN_PROGRESS)`);
      } catch (error) {
        console.error(`⚠️ Failed to move order ${newRecord.orderId} to repair department:`, error);
        // Don't fail the whole request if department update fails
      }
    }

    // Add NCR link to order notes if orderId is provided
    if (newRecord.orderId) {
      try {
        // Get the current order notes
        const [currentOrder] = await db
          .select({ notes: allOrders.notes })
          .from(allOrders)
          .where(eq(allOrders.orderId, newRecord.orderId))
          .limit(1);

        if (currentOrder) {
          const ncrLink = `[Nonconformance Record #${newRecord.id}](/nonconformance?search=${newRecord.orderId})`;
          const existingNotes = currentOrder.notes || '';
          
          // Check if NCR link already exists (to avoid duplicates on updates)
          if (!existingNotes.includes(`Nonconformance Record #${newRecord.id}`)) {
            const updatedNotes = existingNotes 
              ? `${existingNotes}\n\n${ncrLink}`
              : ncrLink;

            await db
              .update(allOrders)
              .set({
                notes: updatedNotes,
                updatedAt: new Date(),
              })
              .where(eq(allOrders.orderId, newRecord.orderId));

            console.log(`✅ Added NCR #${newRecord.id} link to order ${newRecord.orderId} notes`);
          }
        }
      } catch (error) {
        console.error(`⚠️ Failed to add NCR link to order ${newRecord.orderId} notes:`, error);
        // Don't fail the whole request if notes update fails
      }
    }

    res.status(201).json(newRecord);
  } catch (error) {
    console.error('Error creating nonconformance record:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(500).json({ error: 'Failed to create record' });
  }
});

// PUT /api/nonconformance/:id - Update record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Convert empty date strings to null before validation
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.dateReceived === '') sanitizedBody.dateReceived = null;
    if (sanitizedBody.dispositionDate === '') sanitizedBody.dispositionDate = null;
    if (sanitizedBody.containmentDueDate === '') sanitizedBody.containmentDueDate = null;
    if (sanitizedBody.containmentCompletedAt === '') sanitizedBody.containmentCompletedAt = null;
    if (sanitizedBody.dispositionApprovedAt === '') sanitizedBody.dispositionApprovedAt = null;
    if (sanitizedBody.effectivenessReviewedAt === '') sanitizedBody.effectivenessReviewedAt = null;
    
    const validatedData = insertNonconformanceRecordSchema.parse(sanitizedBody);
    const closureMissing = validateNcrClosure(validatedData);
    if (closureMissing.length > 0) {
      return res.status(400).json({
        error: 'NCR closure requires complete Section 9 quality evidence',
        missing: closureMissing,
      });
    }

    // Set resolvedAt timestamp if status is changing to Resolved
    const updateData: any = {
      ...validatedData,
      updatedAt: new Date(),
    };

    if (validatedData.status === 'Resolved') {
      updateData.resolvedAt = new Date();
      
      // For Repair or Rework dispositions, set shippingStatus to "Ready to Ship"
      // so the RMA appears in the shipping queue
      const disposition = validatedData.disposition?.toLowerCase();
      if (disposition === 'repair' || disposition === 'rework') {
        updateData.shippingStatus = 'Ready to Ship';
        console.log(`✅ NCR marked as Resolved with ${validatedData.disposition} disposition - setting shipping status to "Ready to Ship"`);
      } else {
        // Non-shippable dispositions - clear shipping status
        updateData.shippingStatus = null;
      }
    } else {
      // Not Resolved status - clear shipping status to remove from shipping queue
      updateData.shippingStatus = null;
      updateData.resolvedAt = null;
    }

    const [updatedRecord] = await db
      .update(nonconformanceRecords)
      .set(updateData)
      .where(eq(nonconformanceRecords.id, parseInt(id)))
      .returning();

    if (!updatedRecord) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Add NCR link to order notes if orderId is provided (in case it wasn't added during create)
    if (updatedRecord.orderId) {
      try {
        // Get the current order notes
        const [currentOrder] = await db
          .select({ notes: allOrders.notes })
          .from(allOrders)
          .where(eq(allOrders.orderId, updatedRecord.orderId))
          .limit(1);

        if (currentOrder) {
          const ncrLink = `[Nonconformance Record #${updatedRecord.id}](/nonconformance?search=${updatedRecord.orderId})`;
          const existingNotes = currentOrder.notes || '';
          
          // Check if NCR link already exists (to avoid duplicates)
          if (!existingNotes.includes(`Nonconformance Record #${updatedRecord.id}`)) {
            const updatedNotes = existingNotes 
              ? `${existingNotes}\n\n${ncrLink}`
              : ncrLink;

            await db
              .update(allOrders)
              .set({
                notes: updatedNotes,
                updatedAt: new Date(),
              })
              .where(eq(allOrders.orderId, updatedRecord.orderId));

            console.log(`✅ Added NCR #${updatedRecord.id} link to order ${updatedRecord.orderId} notes`);
          }
        }
      } catch (error) {
        console.error(`⚠️ Failed to add NCR link to order ${updatedRecord.orderId} notes:`, error);
        // Don't fail the whole request if notes update fails
      }
    }

    res.json(updatedRecord);
  } catch (error) {
    console.error('Error updating nonconformance record:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(500).json({ error: 'Failed to update record' });
  }
});

// PATCH /api/nonconformance/:id/shipping - Update RMA shipping info
router.patch('/:id/shipping', async (req, res) => {
  try {
    const { id } = req.params;
    const { trackingNumber, shippingCarrier, shippedDate, shippingStatus, customerNotified } = req.body;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
    if (shippingCarrier !== undefined) updateData.shippingCarrier = shippingCarrier;
    if (shippedDate !== undefined) updateData.shippedDate = shippedDate || null;
    if (shippingStatus !== undefined) updateData.shippingStatus = shippingStatus;
    if (customerNotified !== undefined) updateData.customerNotified = customerNotified;

    const [updatedRecord] = await db
      .update(nonconformanceRecords)
      .set(updateData)
      .where(eq(nonconformanceRecords.id, parseInt(id)))
      .returning();

    if (!updatedRecord) {
      return res.status(404).json({ error: 'Record not found' });
    }

    console.log(`✅ Updated RMA #${updatedRecord.rmaNumber} shipping info: tracking=${trackingNumber}, status=${shippingStatus}`);
    res.json(updatedRecord);
  } catch (error) {
    console.error('Error updating RMA shipping info:', error);
    res.status(500).json({ error: 'Failed to update shipping info' });
  }
});

// DELETE /api/nonconformance/:id - Delete record
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [deletedRecord] = await db
      .delete(nonconformanceRecords)
      .where(eq(nonconformanceRecords.id, parseInt(id)))
      .returning();

    if (!deletedRecord) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting nonconformance record:', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// GET /analytics - Get analytics data
router.get('/analytics', async (req, res) => {
  try {
    const { dateFrom, dateTo, stockModel, issueCause } = req.query;

    const conditions = [];

    // Date range filtering
    if (dateFrom) {
      conditions.push(
        gte(nonconformanceRecords.dispositionDate, dateFrom as string)
      );
    }
    if (dateTo) {
      conditions.push(
        lte(nonconformanceRecords.dispositionDate, dateTo as string)
      );
    }
    if (stockModel) {
      conditions.push(
        ilike(nonconformanceRecords.stockModel, `%${stockModel}%`)
      );
    }
    if (issueCause) {
      conditions.push(
        eq(nonconformanceRecords.issueCause, issueCause as string)
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get aggregate data
    const [totalStats] = await db
      .select({
        totalIssues: sql<number>`count(*)`,
        openIssues: sql<number>`count(*) filter (where status = 'Open')`,
        scrapRate: sql<number>`cast(count(*) filter (where disposition = 'Scrap') as float) / nullif(count(*), 0)`,
        avgResolutionDays: sql<number>`avg(extract(day from resolved_at - created_at)) filter (where resolved_at is not null)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause);

    // By department - we'll use a placeholder since department isn't in the schema yet
    const byDept = await db
      .select({
        dept: sql<string>`'Quality'`,
        count: sql<number>`count(*)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause)
      .groupBy(sql`1`);

    // By stock model
    const byModel = await db
      .select({
        model: nonconformanceRecords.stockModel,
        count: sql<number>`count(*)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause)
      .groupBy(nonconformanceRecords.stockModel)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // By issue cause
    const byCause = await db
      .select({
        cause: nonconformanceRecords.issueCause,
        count: sql<number>`count(*)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause)
      .groupBy(nonconformanceRecords.issueCause)
      .orderBy(sql`count(*) desc`);

    // By disposition
    const byDisposition = await db
      .select({
        disposition: nonconformanceRecords.disposition,
        count: sql<number>`count(*)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause)
      .groupBy(nonconformanceRecords.disposition)
      .orderBy(sql`count(*) desc`);

    // Monthly trend
    const monthlyTrend = await db
      .select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        count: sql<number>`count(*)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

    const analytics = {
      ...totalStats,
      byDept,
      byModel: byModel.filter((item) => item.model),
      byCause,
      byDisposition,
      monthlyTrend,
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
