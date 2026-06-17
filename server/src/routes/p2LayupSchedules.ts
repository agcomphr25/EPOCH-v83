import { Router, type Request, Response } from 'express';
import { db } from '../../db';
import { 
  p2LayupSchedules, 
  p2SerializedItems,
  p2PurchaseOrders,
  p2PurchaseOrderItems,
  p2ProductionOrders,
  partRoutings,
  projects,
  insertP2LayupScheduleSchema 
} from '../../schema';
import { eq, and, gte, lte, desc, inArray, ilike, max, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JsBarcode from 'jsbarcode';

const router = Router();

// GET /api/p2/layup-schedules - Get all schedules with optional filters
router.get('/layup-schedules', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, status, customerId, assignedTechnician } = req.query;

    let query = db.select().from(p2LayupSchedules).$dynamic();

    // Apply filters
    const conditions = [];
    if (startDate && endDate) {
      // Parse dates properly to avoid string comparison issues
      const start = new Date(startDate as string).toISOString().split('T')[0];
      const end = new Date(endDate as string).toISOString().split('T')[0];
      conditions.push(
        and(
          gte(p2LayupSchedules.scheduledDate, start),
          lte(p2LayupSchedules.scheduledDate, end)
        )
      );
    }
    if (status) {
      // Validate status value
      if (!['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status as string)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      conditions.push(eq(p2LayupSchedules.status, status as string));
    }
    if (customerId) {
      conditions.push(eq(p2LayupSchedules.customerId, customerId as string));
    }
    if (assignedTechnician) {
      conditions.push(eq(p2LayupSchedules.assignedTechnician, assignedTechnician as string));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const schedules = await query.orderBy(desc(p2LayupSchedules.scheduledDate));

    res.json(schedules);
  } catch (error: any) {
    console.error('Error fetching P2 layup schedules:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/p2/layup-schedules/unscheduled - Get P2 serialized items that haven't been scheduled yet
router.get('/layup-schedules/unscheduled', async (req: Request, res: Response) => {
  try {
    // Get all P2 serialized items that are in Layup department and not yet scheduled
    const unscheduledItems = await db
      .select()
      .from(p2SerializedItems)
      .where(
        and(
          eq(p2SerializedItems.currentDepartment, 'Layup'),
          eq(p2SerializedItems.status, 'ACTIVE')
        )
      )
      .leftJoin(
        p2LayupSchedules,
        eq(p2SerializedItems.id, p2LayupSchedules.serializedItemId)
      );

    // Filter out items that already have a schedule
    const unscheduled = unscheduledItems
      .filter(item => !item.p2_layup_schedules)
      .map(item => item.p2_serialized_items);

    res.json(unscheduled);
  } catch (error: any) {
    console.error('Error fetching unscheduled P2 items:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/p2/layup-schedules/:id - Get a specific schedule
router.get('/layup-schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const schedule = await db
      .select()
      .from(p2LayupSchedules)
      .where(eq(p2LayupSchedules.id, id))
      .limit(1);

    if (!schedule || schedule.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(schedule[0]);
  } catch (error: any) {
    console.error('Error fetching P2 layup schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/p2/layup-schedules - Create new schedule(s) with layup gating enforcement
router.post('/layup-schedules', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const { skipGatingCheck } = req.query; // Allow bypass for testing/admin
    
    // Support both single schedule and batch scheduling
    const schedulesToCreate = Array.isArray(data) ? data : [data];
    
    // Layup Gating Check: Verify packets are allocated before allowing scheduling
    if (skipGatingCheck !== 'true') {
      const { cuttingBuiltPackets } = await import('../../schema');
      const gatingErrors: string[] = [];
      
      for (const schedule of schedulesToCreate) {
        const { serializedItemId, partNumber } = schedule;
        
        // Check if packets are allocated for this item
        const allocatedPackets = await db
          .select()
          .from(cuttingBuiltPackets)
          .where(
            and(
              eq(cuttingBuiltPackets.allocatedToOrder, serializedItemId),
              eq(cuttingBuiltPackets.status, 'ALLOCATED')
            )
          );
        
        // If no packets are allocated, check if any are available
        if (allocatedPackets.length === 0) {
          // Check available packets for this part type
          const availablePackets = await db
            .select()
            .from(cuttingBuiltPackets)
            .where(eq(cuttingBuiltPackets.status, 'AVAILABLE'));
          
          if (availablePackets.length === 0) {
            gatingErrors.push(
              `No packets allocated for item ${serializedItemId} (${partNumber || 'unknown part'}). ` +
              `No available packets found. Please build packets on the Cutting Table before scheduling Layup.`
            );
          } else {
            gatingErrors.push(
              `Packets must be allocated before scheduling Layup for item ${serializedItemId} (${partNumber || 'unknown part'}). ` +
              `${availablePackets.length} unallocated packet(s) available. Use the allocation endpoint first.`
            );
          }
        }
      }
      
      // If any gating errors, return them all
      if (gatingErrors.length > 0) {
        return res.status(400).json({
          error: 'Layup gating check failed',
          gatingFailed: true,
          details: gatingErrors,
          message: 'Packets must be built and allocated before Layup can be scheduled. ' +
                   'Please ensure packets are available from the Cutting Table.'
        });
      }
    }
    
    // Validate all schedules
    const validatedSchedules = schedulesToCreate.map(schedule => {
      const validated = insertP2LayupScheduleSchema.parse(schedule);
      
      // Add default values for each schedule
      return {
        ...validated,
        id: crypto.randomUUID(),
        status: validated.status || 'SCHEDULED',
        scheduledDate: new Date(validated.scheduledDate).toISOString().split('T')[0],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    // Insert all schedules (type assertion safe because validation ensures required fields are present)
    const createdSchedules = await db
      .insert(p2LayupSchedules)
      .values(validatedSchedules as any)
      .returning();

    res.status(201).json(Array.isArray(data) ? createdSchedules : createdSchedules[0]);
  } catch (error: any) {
    console.error('Error creating P2 layup schedule:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/p2/layup-schedules/:id - Update a schedule
router.patch('/layup-schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Whitelist allowed update fields to prevent arbitrary updates
    const allowedFields = ['assignedTechnician', 'notes', 'scheduledDate'];
    const sanitizedUpdates: any = {};
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        sanitizedUpdates[field] = updates[field];
      }
    }

    // Validate scheduledDate if provided
    if (sanitizedUpdates.scheduledDate) {
      // Accept both ISO datetime and YYYY-MM-DD date formats
      const dateSchema = z.string().refine(val => !isNaN(Date.parse(val)), {
        message: 'Invalid date format'
      });
      const result = dateSchema.safeParse(sanitizedUpdates.scheduledDate);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid scheduled date format' });
      }
      sanitizedUpdates.scheduledDate = new Date(sanitizedUpdates.scheduledDate).toISOString().split('T')[0];
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    sanitizedUpdates.updatedAt = new Date();

    // Update the schedule
    const updatedSchedule = await db
      .update(p2LayupSchedules)
      .set(sanitizedUpdates)
      .where(eq(p2LayupSchedules.id, id))
      .returning();

    if (!updatedSchedule || updatedSchedule.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(updatedSchedule[0]);
  } catch (error: any) {
    console.error('Error updating P2 layup schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/p2/layup-schedules/:id/status - Update schedule status
router.patch('/layup-schedules/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, username } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Validate status value
    const validStatuses = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value', validStatuses });
    }

    // Validate username for status transitions that require it
    if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status) && !username) {
      return res.status(400).json({ error: 'Username is required for this status transition' });
    }

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    // Set appropriate timestamp fields based on status
    switch (status) {
      case 'IN_PROGRESS':
        updateData.startedAt = new Date();
        updateData.startedBy = username;
        break;
      case 'COMPLETED':
        updateData.completedAt = new Date();
        updateData.completedBy = username;
        break;
      case 'CANCELLED':
        updateData.cancelledAt = new Date();
        updateData.cancelledBy = username;
        break;
    }

    const updatedSchedule = await db
      .update(p2LayupSchedules)
      .set(updateData)
      .where(eq(p2LayupSchedules.id, id))
      .returning();

    if (!updatedSchedule || updatedSchedule.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(updatedSchedule[0]);
  } catch (error: any) {
    console.error('Error updating schedule status:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/p2/layup-schedules/:id/link-packet - Link a cutting table packet
router.patch('/layup-schedules/:id/link-packet', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { packetId, packetNumber } = req.body;

    if (!packetId || !packetNumber) {
      return res.status(400).json({ error: 'Packet ID and number are required' });
    }

    const updatedSchedule = await db
      .update(p2LayupSchedules)
      .set({
        cuttingPacketId: packetId,
        cuttingPacketNumber: packetNumber,
        updatedAt: new Date(),
      })
      .where(eq(p2LayupSchedules.id, id))
      .returning();

    if (!updatedSchedule || updatedSchedule.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(updatedSchedule[0]);
  } catch (error: any) {
    console.error('Error linking cutting packet:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/p2/layup-schedules/:id - Delete/cancel a schedule
router.delete('/layup-schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, reason } = req.body;

    // Soft delete by marking as cancelled
    const cancelledSchedule = await db
      .update(p2LayupSchedules)
      .set({
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: username || 'system',
        cancelReason: reason || 'Deleted by user',
        updatedAt: new Date(),
      })
      .where(eq(p2LayupSchedules.id, id))
      .returning();

    if (!cancelledSchedule || cancelledSchedule.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json({ message: 'Schedule cancelled successfully', schedule: cancelledSchedule[0] });
  } catch (error: any) {
    console.error('Error cancelling schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/p2/layup-schedules/bulk-schedule - Bulk schedule multiple items to a date
router.post('/layup-schedules/bulk-schedule', async (req: Request, res: Response) => {
  try {
    const { serializedItemIds, scheduledDate, scheduledBy, assignedTechnician, notes } = req.body;

    if (!serializedItemIds || !Array.isArray(serializedItemIds) || serializedItemIds.length === 0) {
      return res.status(400).json({ error: 'Serialized item IDs array is required' });
    }

    if (!scheduledDate || !scheduledBy) {
      return res.status(400).json({ error: 'Scheduled date and scheduled by are required' });
    }

    // Fetch serialized items to get their details
    const items = await db
      .select()
      .from(p2SerializedItems)
      .where(
        and(
          ...serializedItemIds.map(id => eq(p2SerializedItems.id, id))
        )
      );

    if (items.length !== serializedItemIds.length) {
      return res.status(404).json({ error: 'Some serialized items not found' });
    }

    // Create schedule entries for all items
    const schedulesToCreate = items.map(item => ({
      serializedItemId: item.id,
      barcode: item.barcode,
      poNumber: item.poNumber,
      partNumber: item.partNumber,
      partName: item.partName,
      customerId: item.customerId,
      customerName: item.customerName,
      scheduledDate,
      scheduledBy,
      assignedTechnician: assignedTechnician || null,
      notes: notes || null,
      status: 'SCHEDULED' as const,
    }));

    const createdSchedules = await db
      .insert(p2LayupSchedules)
      .values(schedulesToCreate)
      .returning();

    res.status(201).json(createdSchedules);
  } catch (error: any) {
    console.error('Error bulk scheduling P2 items:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/p2/layup-schedules/print-barcodes - Generate barcode labels PDF
router.post('/layup-schedules/print-barcodes', async (req: Request, res: Response) => {
  try {
    const { scheduleIds, scheduledDate, scheduledDates } = req.body;
    
    let schedules: any[] = [];

    // Get schedules either by IDs, by multiple dates, or by single date
    if (scheduleIds && Array.isArray(scheduleIds) && scheduleIds.length > 0) {
      schedules = await db
        .select()
        .from(p2LayupSchedules)
        .where(inArray(p2LayupSchedules.id, scheduleIds));
    } else if (scheduledDates && Array.isArray(scheduledDates) && scheduledDates.length > 0) {
      // Handle multiple dates
      schedules = await db
        .select()
        .from(p2LayupSchedules)
        .where(inArray(p2LayupSchedules.scheduledDate, scheduledDates))
        .orderBy(p2LayupSchedules.scheduledDate, p2LayupSchedules.customerName, p2LayupSchedules.partNumber);
    } else if (scheduledDate) {
      schedules = await db
        .select()
        .from(p2LayupSchedules)
        .where(eq(p2LayupSchedules.scheduledDate, scheduledDate))
        .orderBy(p2LayupSchedules.customerName, p2LayupSchedules.partNumber);
    } else {
      return res.status(400).json({ error: 'Either scheduleIds, scheduledDates, or scheduledDate is required' });
    }

    if (schedules.length === 0) {
      return res.status(404).json({ error: 'No schedules found' });
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Avery 5160 label dimensions (3 columns x 10 rows per page)
    const pageWidth = 612; // 8.5 inches
    const pageHeight = 792; // 11 inches
    const labelWidth = 189; // 2.625 inches
    const labelHeight = 72; // 1 inch
    const leftMargin = 13.5; // 0.1875 inches
    const topMargin = 36; // 0.5 inches
    const horizontalGap = 9; // 0.125 inches
    const verticalGap = 0; // No gap between rows

    const labelsPerRow = 3;
    const labelsPerColumn = 10;
    const labelsPerPage = labelsPerRow * labelsPerColumn;

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let labelIndex = 0;

    for (const schedule of schedules) {
      // Calculate position on page
      const pageIndex = Math.floor(labelIndex / labelsPerPage);
      const labelOnPage = labelIndex % labelsPerPage;
      const row = Math.floor(labelOnPage / labelsPerRow);
      const col = labelOnPage % labelsPerRow;

      // Add new page if needed
      if (labelOnPage === 0 && labelIndex > 0) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      }

      const x = leftMargin + col * (labelWidth + horizontalGap);
      const y = pageHeight - topMargin - row * (labelHeight + verticalGap) - labelHeight;

      // Generate barcode as SVG using bwip-js (pure JS, no native dependencies)
      let barcodeImage;
      try {
        const bwipjs = await import('bwip-js');
        const svg = bwipjs.default.toSVG({
          bcid: 'code128',
          text: schedule.barcode,
          scale: 2,
          height: 8,
          includetext: false,
        });
        
        // Convert SVG to PNG-compatible format for PDF embedding
        // Use a simple SVG to base64 approach
        const svgBuffer = Buffer.from(svg);
        
        // For PDF, we'll embed the barcode text visually instead since SVG embedding is complex
        // Draw barcode using PDF primitives (lines) - skip image embedding
        barcodeImage = null;
      } catch (barcodeError) {
        console.error('Error generating barcode:', barcodeError);
        barcodeImage = null;
      }

      // Draw barcode area
      const barcodeWidth = labelWidth - 10;
      const barcodeHeight = 30;
      
      // Skip image embedding (SVG to PNG conversion is complex without native deps)
      // The barcode text is displayed below for scanning

      // Draw text information below barcode area
      let textY = y + labelHeight - 10;

      // Barcode number
      currentPage.drawText(schedule.barcode, {
        x: x + 5,
        y: textY,
        size: 7,
        font: font,
        color: rgb(0, 0, 0),
      });

      textY -= 9;

      // Part number and name
      const partText = `${schedule.partNumber} - ${schedule.partName.substring(0, 20)}`;
      currentPage.drawText(partText, {
        x: x + 5,
        y: textY,
        size: 6,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      textY -= 8;

      // PO Number and Customer
      const poText = `PO: ${schedule.poNumber}`;
      currentPage.drawText(poText, {
        x: x + 5,
        y: textY,
        size: 6,
        font: font,
        color: rgb(0, 0, 0),
      });

      textY -= 8;

      // Customer name
      const customerText = schedule.customerName.substring(0, 25);
      currentPage.drawText(customerText, {
        x: x + 5,
        y: textY,
        size: 6,
        font: font,
        color: rgb(0, 0, 0),
      });

      // Draw border around label (optional, for alignment)
      currentPage.drawRectangle({
        x: x,
        y: y,
        width: labelWidth,
        height: labelHeight,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 0.5,
      });

      labelIndex++;
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="p2-layup-barcodes-${scheduledDate || 'batch'}.pdf"`
    );
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error('Error generating barcode labels:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/p2/layup-schedules/generate-serialized-items/:poItemId - Generate serialized items from a P2 PO item
router.post('/layup-schedules/generate-serialized-items/:poItemId', async (req: Request, res: Response) => {
  try {
    const { poItemId } = req.params;
    const poItemIdNum = parseInt(poItemId);

    if (isNaN(poItemIdNum)) {
      return res.status(400).json({ error: 'Invalid PO item ID' });
    }

    // Fetch the PO item with PO details
    const poItems = await db
      .select()
      .from(p2PurchaseOrderItems)
      .where(eq(p2PurchaseOrderItems.id, poItemIdNum))
      .leftJoin(p2PurchaseOrders, eq(p2PurchaseOrderItems.poId, p2PurchaseOrders.id));

    if (!poItems || poItems.length === 0) {
      return res.status(404).json({ error: 'PO item not found' });
    }

    const poItem = poItems[0].p2_purchase_order_items;
    const po = poItems[0].p2_purchase_orders;

    if (!po) {
      return res.status(404).json({ error: 'Associated purchase order not found' });
    }

    // Check if serialized items already exist for this PO item
    const existingItems = await db
      .select()
      .from(p2SerializedItems)
      .where(eq(p2SerializedItems.poItemId, poItemIdNum));

    if (existingItems.length > 0) {
      return res.status(400).json({ 
        error: `Serialized items already exist for this PO item (${existingItems.length} items found). Delete existing items first if you need to regenerate.`
      });
    }

    // Find the highest sequence number already used across ALL items on this PO
    // so that a second (or third) line continues the sequence instead of restarting at 1.
    const maxSeqResult = await db
      .select({ maxSeq: max(p2SerializedItems.sequenceNumber) })
      .from(p2SerializedItems)
      .where(eq(p2SerializedItems.poId, po.id));
    const startSeq = (maxSeqResult[0]?.maxSeq ?? 0) + 1;

    const [projectForPoItem] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.poId, po.id), eq(projects.p2PoItemId, poItem.id)))
      .limit(1);
    const [projectForPo] = projectForPoItem
      ? [projectForPoItem]
      : await db
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.poId, po.id))
          .limit(1);
    const projectId = projectForPo?.id ?? null;

    let itemRouting = projectId
      ? await db.query.partRoutings.findFirst({
          where: and(
            eq(partRoutings.projectId, projectId),
            eq(partRoutings.partNumber, poItem.partNumber),
            eq(partRoutings.isActive, true)
          ),
        })
      : null;
    if (!itemRouting && projectId) {
      itemRouting = await db.query.partRoutings.findFirst({
        where: and(
          eq(partRoutings.projectId, projectId),
          ilike(partRoutings.partNumber, poItem.partNumber),
          eq(partRoutings.isActive, true)
        ),
      });
    }
    if (!itemRouting) {
      itemRouting = await db.query.partRoutings.findFirst({
        where: and(
          isNull(partRoutings.projectId),
          eq(partRoutings.partNumber, poItem.partNumber),
          eq(partRoutings.isActive, true)
        ),
      });
    }
    if (!itemRouting) {
      itemRouting = await db.query.partRoutings.findFirst({
        where: and(
          isNull(partRoutings.projectId),
          ilike(partRoutings.partNumber, poItem.partNumber),
          eq(partRoutings.isActive, true)
        ),
      });
    }
    const baseMatch = poItem.partNumber.match(/^(.+?)\s*Rev\s*\w+$/i);
    const familyKey = baseMatch ? baseMatch[1].trim() : poItem.partNumber;

    const itemsToCreate = [];
    for (let i = 0; i < poItem.quantity; i++) {
      const seq = startSeq + i;
      const seq4 = seq.toString().padStart(4, '0');
      const barcode = `${po.poNumber}-UNIT-${seq4}`;
      const serialNumber = barcode;

      itemsToCreate.push({
        serialNumber,
        barcode,
        travelerBarcode: barcode,
        poId: po.id,
        poItemId: poItem.id,
        poNumber: po.poNumber,
        partNumber: poItem.partNumber,
        partName: poItem.partName,
        customerId: po.customerId,
        customerName: po.customerName,
        sequenceNumber: seq,
        currentDepartment: 'Pending Layup',
        currentStageIndex: 0,
        status: 'ACTIVE',
        departmentHistory: [],
        metadata: poItem.specifications ? { specifications: poItem.specifications } : null,
        buildFamilyKey: familyKey,
        partRoutingId: itemRouting?.id || null,
        partRoutingRevision: itemRouting ? ((itemRouting as any).routingRevision || 1) : null,
      });
    }

    // Insert all serialized items in batch
    const createdItems = await db
      .insert(p2SerializedItems)
      .values(itemsToCreate)
      .returning();

    let productionOrderCount = 0;
    let cuttingOrderCount = 0;
    try {
      const existingProdOrders = await db
        .select()
        .from(p2ProductionOrders)
        .where(eq(p2ProductionOrders.p2PoId, po.id))
        .limit(1);

      if (existingProdOrders.length === 0) {
        console.log(`🔄 Auto-generating production orders for PO ${po.poNumber} (including cutting table packet demands)...`);
        const { storage } = await import('../../storage');
        const prodOrders = await storage.generateP2ProductionOrders(po.id);
        productionOrderCount = prodOrders.length;
        const cuttingOrders = prodOrders.filter(o => o.department === 'Cutting Table');
        cuttingOrderCount = cuttingOrders.length;
        console.log(`✅ Auto-generated ${prodOrders.length} production orders for PO ${po.poNumber}`);
        if (cuttingOrders.length > 0) {
          console.log(`  📋 ${cuttingOrders.length} cutting table packet demand(s) transferred to Cutting Table Control Center`);
        }
      } else {
        console.log(`ℹ️ Production orders already exist for PO ${po.poNumber} - skipping auto-generation`);
      }
    } catch (prodError) {
      console.error(`⚠️ Failed to auto-generate production orders for PO ${po.poNumber}:`, prodError);
    }

    res.json({
      message: `Successfully generated ${createdItems.length} serialized items${productionOrderCount > 0 ? ` and ${productionOrderCount} production orders (${cuttingOrderCount} cutting table demands)` : ''}`,
      count: createdItems.length,
      items: createdItems,
      productionOrders: productionOrderCount,
      cuttingTableDemands: cuttingOrderCount,
    });
  } catch (error: any) {
    console.error('Error generating serialized items:', error);
    // Catch unique constraint violations and return a clear, human-readable message
    const isUniqueViolation =
      error.code === '23505' ||
      (typeof error.message === 'string' && error.message.toLowerCase().includes('unique'));
    if (isUniqueViolation) {
      return res.status(409).json({
        error: 'One or more barcodes for this PO already exist. This can happen if another line was generated simultaneously. Please refresh and try again.',
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// POST /api/p2/layup-schedules/send-to-layup/:poItemId - Move serialized items to Layup department
router.post('/layup-schedules/send-to-layup/:poItemId', async (req: Request, res: Response) => {
  try {
    const { poItemId } = req.params;
    const poItemIdNum = parseInt(poItemId);

    if (isNaN(poItemIdNum)) {
      return res.status(400).json({ error: 'Invalid PO item ID' });
    }

    // Get all serialized items for this PO item that are in Pending Layup
    const itemsToUpdate = await db
      .select()
      .from(p2SerializedItems)
      .where(
        and(
          eq(p2SerializedItems.poItemId, poItemIdNum),
          eq(p2SerializedItems.currentDepartment, 'Pending Layup')
        )
      );

    if (itemsToUpdate.length === 0) {
      return res.status(404).json({ 
        error: 'No items in Pending Layup status found for this PO item'
      });
    }

    // Update all items to Layup department
    await db
      .update(p2SerializedItems)
      .set({ currentDepartment: 'Layup' })
      .where(
        and(
          eq(p2SerializedItems.poItemId, poItemIdNum),
          eq(p2SerializedItems.currentDepartment, 'Pending Layup')
        )
      );

    res.json({
      message: `Successfully moved ${itemsToUpdate.length} items to Layup department`,
      count: itemsToUpdate.length,
    });
  } catch (error: any) {
    console.error('Error moving items to Layup:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate-production-orders/:poId', async (req: Request, res: Response) => {
  try {
    const poId = parseInt(req.params.poId);
    if (isNaN(poId)) {
      return res.status(400).json({ error: 'Invalid PO ID' });
    }

    const existingProdOrders = await db
      .select()
      .from(p2ProductionOrders)
      .where(eq(p2ProductionOrders.p2PoId, poId))
      .limit(1);

    if (existingProdOrders.length > 0) {
      const totalCount = await db
        .select()
        .from(p2ProductionOrders)
        .where(eq(p2ProductionOrders.p2PoId, poId));
      return res.status(409).json({
        error: `Production orders already exist for this PO (${totalCount.length} orders found). Delete existing orders first if regeneration is needed.`,
        existingCount: totalCount.length,
      });
    }

    const { storage } = await import('../../storage');
    const prodOrders = await storage.generateP2ProductionOrders(poId);
    const cuttingOrders = prodOrders.filter(o => o.department === 'Cutting Table');

    console.log(`✅ Manually generated ${prodOrders.length} production orders for P2 PO ${poId} (${cuttingOrders.length} cutting table demands)`);

    res.json({
      success: true,
      message: `Generated ${prodOrders.length} production orders (${cuttingOrders.length} cutting table demands)`,
      totalOrders: prodOrders.length,
      cuttingTableDemands: cuttingOrders.length,
      orders: prodOrders.map(o => ({
        id: o.id,
        orderId: o.orderId,
        partName: o.partName,
        department: o.department,
        status: o.status,
      })),
    });
  } catch (error: any) {
    console.error('Error generating P2 production orders:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
