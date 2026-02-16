import { Router, type Request, type Response } from 'express';
import { db } from '../../db';
import { 
  p2SerializedItems, 
  p2SerializedItemEvents, 
  p2WorkTasks,
  partRoutings,
  p2EmployeePartCertifications,
  p2SerializedItemTraceability,
  p2SerializedItemCustomData,
  employees,
  travelers,
  travelerSteps,
  travelerTasks,
  insertP2WorkTaskSchema,
  insertP2SerializedItemEventSchema,
  insertP2SerializedItemTraceabilitySchema,
  insertP2SerializedItemCustomDataSchema,
} from '../../schema';
import { eq, and, desc, or, ilike, inArray, asc } from 'drizzle-orm';
import { storage } from '../../storage';

const router = Router();

// Department name aliases for matching certifications with routing names
const DEPARTMENT_ALIASES: Record<string, string[]> = {
  'Assemble/Disassembly': ['Assembly/Disassembly', 'Assemble/Disassembly'],
  'Assembly/Disassembly': ['Assembly/Disassembly', 'Assemble/Disassembly'],
};

function getDepartmentVariants(department: string): string[] {
  return DEPARTMENT_ALIASES[department] || [department];
}

// GET /api/p2-traveler/badge-lookup/:employeeCode
// Look up employee by badge code and return name
router.get('/badge-lookup/:employeeCode', async (req: Request, res: Response) => {
  try {
    const { employeeCode } = req.params;
    const employee = await db.query.employees.findFirst({
      where: eq(employees.employeeCode, employeeCode),
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Badge lookup failed' });
  }
});

// GET /api/p2-traveler/verify-certification/:employeeCode/:barcode
// Verify employee certification for part's next department
router.get('/verify-certification/:employeeCode/:barcode', async (req: Request, res: Response) => {
  try {
    const { employeeCode } = req.params;
    const barcode = decodeURIComponent(req.params.barcode).trim();

    // Get employee
    const employee = await db.query.employees.findFirst({
      where: eq(employees.employeeCode, employeeCode),
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get serialized item - check both system barcode and physical traveler barcode (case-insensitive)
    let serializedItem = await db.query.p2SerializedItems.findFirst({
      where: or(
        ilike(p2SerializedItems.barcode, barcode),
        ilike(p2SerializedItems.travelerBarcode, barcode)
      ),
    });

    // If not found, try suffix/contains match (physical labels may omit prefix like "SG0")
    if (!serializedItem) {
      serializedItem = await db.query.p2SerializedItems.findFirst({
        where: or(
          ilike(p2SerializedItems.barcode, `%${barcode}`),
          ilike(p2SerializedItems.travelerBarcode, `%${barcode}`),
          ilike(p2SerializedItems.serialNumber, `%${barcode}`)
        ),
      });
    }

    if (!serializedItem) {
      return res.status(404).json({ error: 'Part not found' });
    }

    // Get part routing - try exact match first, then base part number (without revision)
    let routing = await db.query.partRoutings.findFirst({
      where: and(
        eq(partRoutings.partNumber, serializedItem.partNumber),
        eq(partRoutings.isActive, true)
      ),
    });

    if (!routing) {
      // Try case-insensitive exact match
      routing = await db.query.partRoutings.findFirst({
        where: and(
          ilike(partRoutings.partNumber, serializedItem.partNumber),
          eq(partRoutings.isActive, true)
        ),
      });
    }

    if (!routing) {
      // Try matching base part number (strip revision suffix like "Rev N", "REV P", etc.)
      const basePartMatch = serializedItem.partNumber.match(/^(.+?)\s*Rev\s*\w+$/i);
      if (basePartMatch) {
        const basePartNumber = basePartMatch[1].trim();
        // Find any active routing whose part number starts with the same base
        const allRoutings = await db
          .select()
          .from(partRoutings)
          .where(and(
            ilike(partRoutings.partNumber, `${basePartNumber} Rev%`),
            eq(partRoutings.isActive, true)
          ));
        if (allRoutings.length > 0) {
          routing = allRoutings[0];
        }
      }
    }

    if (!routing) {
      return res.status(404).json({ error: 'No routing configuration found for this part' });
    }

    // Determine next department based on routing sequence
    const departmentSequence = routing.departmentSequence as string[];
    const currentIndex = serializedItem.currentStageIndex || 0;
    
    if (currentIndex >= departmentSequence.length) {
      return res.status(400).json({ error: 'Part has completed all departments' });
    }

    const nextDepartment = departmentSequence[currentIndex];

    // Check if employee is certified for this department and part (handle department name variants)
    const deptVariants = getDepartmentVariants(nextDepartment);
    const certification = await db.query.p2EmployeePartCertifications.findFirst({
      where: and(
        eq(p2EmployeePartCertifications.employeeId, employee.id),
        eq(p2EmployeePartCertifications.partNumber, serializedItem.partNumber),
        inArray(p2EmployeePartCertifications.department, deptVariants),
        eq(p2EmployeePartCertifications.drawingKnowledge, true),
        eq(p2EmployeePartCertifications.specSheetUnderstanding, true),
        eq(p2EmployeePartCertifications.procedureCompletion, true)
      ),
    });

    const isCertified = !!certification;

    // Get department configuration from routing
    const departmentConfig = routing.departmentConfig as any;
    const config = departmentConfig?.[nextDepartment] || {};

    return res.json({
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
      },
      serializedItem: {
        id: serializedItem.id,
        barcode: serializedItem.barcode,
        serialNumber: serializedItem.serialNumber,
        partNumber: serializedItem.partNumber,
        partName: serializedItem.partName,
        customerName: serializedItem.customerName,
        currentDepartment: serializedItem.currentDepartment,
        status: serializedItem.status,
      },
      routing: {
        id: routing.id,
        departmentSequence,
        currentStageIndex: currentIndex,
      },
      nextDepartment,
      isCertified,
      departmentConfig: config,
      traceabilityRequirements: (routing.traceabilityConfig as any)?.[nextDepartment] || [],
    });
  } catch (error: any) {
    console.error('Error verifying certification:', error);
    return res.status(500).json({ error: 'Failed to verify certification' });
  }
});

// GET /api/p2-traveler/part-info/:barcode
// Get part info and next department requirements
router.get('/part-info/:barcode', async (req: Request, res: Response) => {
  try {
    const barcode = decodeURIComponent(req.params.barcode).trim();

    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: or(
        ilike(p2SerializedItems.barcode, barcode),
        ilike(p2SerializedItems.travelerBarcode, barcode)
      ),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const routing = await db.query.partRoutings.findFirst({
      where: and(
        eq(partRoutings.partNumber, serializedItem.partNumber),
        eq(partRoutings.isActive, true)
      ),
    });

    if (!routing) {
      return res.status(404).json({ error: 'No routing configuration found for this part' });
    }

    const departmentSequence = routing.departmentSequence as string[];
    const currentIndex = serializedItem.currentStageIndex || 0;
    const nextDepartment = departmentSequence[currentIndex];
    const departmentConfig = routing.departmentConfig as any;
    const config = departmentConfig?.[nextDepartment] || {};

    return res.json({
      serializedItem: {
        id: serializedItem.id,
        barcode: serializedItem.barcode,
        serialNumber: serializedItem.serialNumber,
        partNumber: serializedItem.partNumber,
        partName: serializedItem.partName,
        customerName: serializedItem.customerName,
        currentDepartment: serializedItem.currentDepartment,
        currentStageIndex: currentIndex,
        status: serializedItem.status,
      },
      routing: {
        id: routing.id,
        departmentSequence,
      },
      nextDepartment,
      departmentConfig: config,
      traceabilityRequirements: (routing.traceabilityConfig as any)?.[nextDepartment] || [],
    });
  } catch (error: any) {
    console.error('Error getting part info:', error);
    return res.status(500).json({ error: 'Failed to get part information' });
  }
});

// GET /api/p2-traveler/active-tasks/:employeeId
// Get employee's active tasks
router.get('/active-tasks/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);

    const activeTasks = await db.query.p2WorkTasks.findMany({
      where: and(
        eq(p2WorkTasks.employeeId, employeeId),
        eq(p2WorkTasks.status, 'IN_PROGRESS')
      ),
      orderBy: [desc(p2WorkTasks.startedAt)],
    });

    return res.json(activeTasks);
  } catch (error: any) {
    console.error('Error getting active tasks:', error);
    return res.status(500).json({ error: 'Failed to get active tasks' });
  }
});

// POST /api/p2-traveler/generate-traveler
// Generate (or retrieve existing) traveler from routing for a P2 serialized item
router.post('/generate-traveler', async (req: Request, res: Response) => {
  try {
    const { serializedItemId, employeeCode } = req.body;

    if (!serializedItemId) {
      return res.status(400).json({ error: 'serializedItemId is required' });
    }

    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Serialized item not found' });
    }

    // Check if a traveler already exists for this serialized item's serial number and part
    const existingTraveler = await db.query.travelers.findFirst({
      where: and(
        eq(travelers.serialNumber, serializedItem.serialNumber),
        eq(travelers.partNumber, serializedItem.partNumber)
      ),
    });

    if (existingTraveler) {
      return res.json({
        travelerId: existingTraveler.id,
        travelerNumber: existingTraveler.travelerNumber,
        created: false,
      });
    }

    // Find the active routing for this part
    let routing = await db.query.partRoutings.findFirst({
      where: and(
        eq(partRoutings.partNumber, serializedItem.partNumber),
        eq(partRoutings.isActive, true)
      ),
    });

    if (!routing) {
      routing = await db.query.partRoutings.findFirst({
        where: and(
          ilike(partRoutings.partNumber, serializedItem.partNumber),
          eq(partRoutings.isActive, true)
        ),
      });
    }

    if (!routing) {
      const basePartMatch = serializedItem.partNumber.match(/^(.+?)\s*Rev\s*\w+$/i);
      if (basePartMatch) {
        const basePartNumber = basePartMatch[1].trim();
        const allRoutings = await db
          .select()
          .from(partRoutings)
          .where(and(
            ilike(partRoutings.partNumber, `${basePartNumber} Rev%`),
            eq(partRoutings.isActive, true)
          ));
        if (allRoutings.length > 0) {
          routing = allRoutings[0];
        }
      }
    }

    if (!routing) {
      return res.status(404).json({ error: 'No active routing found for this part number' });
    }

    // Generate a traveler from the routing
    const traveler = await storage.generateTravelerFromRouting(routing.id, {
      serialNumber: serializedItem.serialNumber,
      lotNumber: serializedItem.poNumber || undefined,
      createdBy: employeeCode || 'p2-system',
    });

    // Set status to IN_PROGRESS since P2 items are actively being worked
    await storage.updateTraveler(traveler.id, { status: 'IN_PROGRESS' });

    // Advance traveler steps to match the P2 serialized item's current stage
    const currentStageIndex = serializedItem.currentStageIndex || 0;
    if (currentStageIndex > 0) {
      const steps = await db
        .select()
        .from(travelerSteps)
        .where(eq(travelerSteps.travelerId, traveler.id))
        .orderBy(asc(travelerSteps.stepNumber));

      const now = new Date();
      const completedBy = employeeCode || 'p2-system';

      for (let i = 0; i < steps.length && i < currentStageIndex; i++) {
        await db
          .update(travelerSteps)
          .set({
            status: 'COMPLETED',
            completedAt: now,
            completedBy,
          })
          .where(eq(travelerSteps.id, steps[i].id));

        await db
          .update(travelerTasks)
          .set({
            status: 'COMPLETED',
            completedAt: now,
            completedBy,
          })
          .where(eq(travelerTasks.travelerStepId, steps[i].id));
      }

      if (steps[currentStageIndex]) {
        await db
          .update(travelerSteps)
          .set({
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            startedBy: employeeCode || 'p2-system',
          })
          .where(eq(travelerSteps.id, steps[currentStageIndex].id));
      }

      console.log(`[P2Traveler] Advanced traveler to step ${currentStageIndex + 1} of ${steps.length} (matching P2 item stage)`);
    } else {
      // First step - mark as IN_PROGRESS
      const steps = await db
        .select()
        .from(travelerSteps)
        .where(eq(travelerSteps.travelerId, traveler.id))
        .orderBy(asc(travelerSteps.stepNumber));

      if (steps.length > 0) {
        await db
          .update(travelerSteps)
          .set({
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            startedBy: employeeCode || 'p2-system',
          })
          .where(eq(travelerSteps.id, steps[0].id));
      }
    }

    console.log(`[P2Traveler] Generated traveler ${traveler.travelerNumber} for serialized item ${serializedItem.serialNumber}`);

    return res.json({
      travelerId: traveler.id,
      travelerNumber: traveler.travelerNumber,
      created: true,
    });
  } catch (error: any) {
    console.error('[P2Traveler] Error generating traveler:', error);
    return res.status(500).json({ error: 'Failed to generate traveler', detail: error?.message });
  }
});

// POST /api/p2-traveler/start-task
// Start a task (create work task, log event)
router.post('/start-task', async (req: Request, res: Response) => {
  try {
    const {
      employeeId,
      employeeCode,
      employeeName,
      barcode,
      serializedItemId,
      department,
      partNumber,
      partName,
      traceabilityData,
      customData,
      notes,
    } = req.body;

    // Get serialized item to verify routing and department
    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Part not found' });
    }

    // Get part routing to verify department and check multi-task settings
    const routing = await db.query.partRoutings.findFirst({
      where: and(
        eq(partRoutings.partNumber, serializedItem.partNumber),
        eq(partRoutings.isActive, true)
      ),
    });

    if (!routing) {
      return res.status(404).json({ error: 'No routing configuration found for this part' });
    }

    const departmentConfig = routing.departmentConfig as any;
    const config = departmentConfig?.[department] || {};

    // BACKEND CERTIFICATION ENFORCEMENT - Critical for AS9100 compliance
    const startDeptVariants = getDepartmentVariants(department);
    const certification = await db.query.p2EmployeePartCertifications.findFirst({
      where: and(
        eq(p2EmployeePartCertifications.employeeId, parseInt(employeeId)),
        eq(p2EmployeePartCertifications.partNumber, serializedItem.partNumber),
        inArray(p2EmployeePartCertifications.department, startDeptVariants),
        eq(p2EmployeePartCertifications.drawingKnowledge, true),
        eq(p2EmployeePartCertifications.specSheetUnderstanding, true),
        eq(p2EmployeePartCertifications.procedureCompletion, true)
      ),
    });

    if (!certification) {
      return res.status(403).json({ 
        error: `Employee ${employeeName} is not certified for ${department} on part ${partNumber}`,
        code: 'NOT_CERTIFIED'
      });
    }

    // Check if part is available (not already in progress by another tech in same department)
    const existingTask = await db.query.p2WorkTasks.findFirst({
      where: and(
        eq(p2WorkTasks.serializedItemId, serializedItemId),
        eq(p2WorkTasks.department, department),
        eq(p2WorkTasks.status, 'IN_PROGRESS')
      ),
    });

    if (existingTask && existingTask.employeeId !== parseInt(employeeId)) {
      return res.status(400).json({ 
        error: `Part is already being worked on by ${existingTask.employeeName}` 
      });
    }
    
    if (existingTask && existingTask.employeeId === parseInt(employeeId)) {
      return res.json({ 
        success: true,
        workTask: existingTask,
        resumed: true,
        message: 'Resumed existing task' 
      });
    }

    // MULTI-TASK CONTROL - Check if employee can work on multiple parts simultaneously
    const allowMultipleTasks = config.allowMultipleTasks !== false; // Default to true if not specified
    
    if (!allowMultipleTasks) {
      const employeeActiveTasks = await db.query.p2WorkTasks.findMany({
        where: and(
          eq(p2WorkTasks.employeeId, parseInt(employeeId)),
          eq(p2WorkTasks.status, 'IN_PROGRESS')
        ),
      });

      if (employeeActiveTasks.length > 0) {
        const activePartName = employeeActiveTasks[0]?.partName || employeeActiveTasks[0]?.partNumber || 'another part';
        return res.status(400).json({ 
          error: `You must complete your current task on ${activePartName} before starting a new one`,
          code: 'MULTI_TASK_NOT_ALLOWED'
        });
      }
    }

    // Validate input - pull denormalized fields from serialized item (use DB values as source of truth)
    const resolvedPartName = partName || serializedItem.partName || serializedItem.partNumber || 'Unknown';
    const resolvedPartNumber = partNumber || serializedItem.partNumber;
    const validatedData = insertP2WorkTaskSchema.parse({
      serializedItemId,
      barcode: barcode || serializedItem.barcode,
      poNumber: serializedItem.poNumber,
      partNumber: resolvedPartNumber,
      partName: resolvedPartName,
      customerId: serializedItem.customerId,
      customerName: serializedItem.customerName,
      department,
      employeeId: parseInt(employeeId),
      employeeCode,
      employeeName,
      certificationId: certification.id,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      traceabilityData,
      customData,
      notes,
    });

    // Create work task
    const [workTask] = await db.insert(p2WorkTasks).values(validatedData).returning();

    // Save traceability data
    if (traceabilityData && Array.isArray(traceabilityData) && traceabilityData.length > 0) {
      const traceabilityRecords = traceabilityData.map((item: any) => ({
        serializedItemId,
        department,
        inventoryPartId: item.inventoryPartId || null,
        inventoryPartNumber: item.inventoryPartNumber || null,
        traceabilityType: item.type,
        traceabilityLabel: item.label,
        traceabilityValue: item.value,
        recordedBy: employeeCode,
      }));

      await db.insert(p2SerializedItemTraceability).values(traceabilityRecords);
    }

    // Save custom data
    if (customData && Object.keys(customData).length > 0) {
      await db.insert(p2SerializedItemCustomData).values({
        serializedItemId,
        department,
        customData,
        recordedBy: employeeCode,
      });
    }

    // Log task start event
    await db.insert(p2SerializedItemEvents).values({
      serializedItemId,
      barcode,
      eventType: 'NOTE',
      performedBy: employeeCode,
      notes: `Task started in ${department}`,
      metadata: { taskId: workTask.id, action: 'start_task' },
    });

    return res.json({
      success: true,
      workTask,
      message: 'Task started successfully',
    });
  } catch (error: any) {
    console.error('Error starting task:', error);
    return res.status(500).json({ error: error.message || 'Failed to start task' });
  }
});

// POST /api/p2-traveler/complete-task
// Complete task (rescan verification, calculate duration, advance department)
router.post('/complete-task', async (req: Request, res: Response) => {
  try {
    const {
      taskId,
      employeeCode,
      barcode,
      notes,
    } = req.body;

    // Get work task
    const workTask = await db.query.p2WorkTasks.findFirst({
      where: eq(p2WorkTasks.id, taskId),
    });

    if (!workTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (workTask.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Task is not in progress' });
    }

    // Verify employee and barcode match (case-insensitive for scanner compatibility)
    if (workTask.employeeCode.toLowerCase() !== employeeCode.toLowerCase()) {
      return res.status(403).json({ error: 'Only the assigned technician can complete this task' });
    }

    // Check barcode against both system barcode and traveler barcode (scanners may use either)
    const scannedBarcode = barcode.toLowerCase();
    const taskBarcode = workTask.barcode.toLowerCase();
    let barcodeMatch = taskBarcode === scannedBarcode;

    if (!barcodeMatch) {
      // Also check if the scanned barcode matches the serialized item's traveler barcode
      const serializedItemForBarcode = await db.query.p2SerializedItems.findFirst({
        where: eq(p2SerializedItems.id, workTask.serializedItemId),
      });
      if (serializedItemForBarcode) {
        const travelerBarcode = serializedItemForBarcode.travelerBarcode?.toLowerCase();
        const systemBarcode = serializedItemForBarcode.barcode?.toLowerCase();
        barcodeMatch = scannedBarcode === travelerBarcode || scannedBarcode === systemBarcode;
      }
    }

    if (!barcodeMatch) {
      return res.status(400).json({ error: 'Barcode does not match the started task' });
    }

    // Calculate duration in minutes
    const startTime = new Date(workTask.startedAt).getTime();
    const endTime = Date.now();
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    // Update work task
    await db.update(p2WorkTasks)
      .set({
        status: 'COMPLETED',
        completedAt: new Date(),
        durationMinutes,
        notes: notes || workTask.notes,
        updatedAt: new Date(),
      })
      .where(eq(p2WorkTasks.id, taskId));

    // Get serialized item and routing
    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, workTask.serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Serialized item not found' });
    }

    const routing = await db.query.partRoutings.findFirst({
      where: and(
        eq(partRoutings.partNumber, serializedItem.partNumber),
        eq(partRoutings.isActive, true)
      ),
    });

    if (!routing) {
      return res.status(404).json({ error: 'Routing not found' });
    }

    const departmentSequence = routing.departmentSequence as string[];
    const currentIndex = serializedItem.currentStageIndex || 0;
    const currentDepartment = departmentSequence[currentIndex];
    const nextIndex = currentIndex + 1;
    const nextDepartment = departmentSequence[nextIndex];

    // TOLERANCE GATE ENFORCEMENT: If progressing FROM Final QC, check for failed inspections
    if (currentDepartment === 'Final QC') {
      // Check if item has any failed inspection data in metadata
      const itemMetadata = serializedItem.metadata as any;
      const hasFinalQCFailures = itemMetadata?.finalQcFailures?.length > 0 || 
                                  itemMetadata?.hasToleranceDeviation === true;
      
      if (hasFinalQCFailures) {
        // Check if tolerance authorization has been recorded on the item
        const hasToleranceAuthorization = itemMetadata?.toleranceDeviationApproved === true;
        
        if (!hasToleranceAuthorization) {
          // Also check PO for tolerance authorizer if poItemId exists
          let poHasAuthorizer = false;
          
          if (serializedItem.poItemId) {
            const { p2PurchaseOrders, p2PurchaseOrderItems } = await import('../../schema');
            
            const poItem = await db.query.p2PurchaseOrderItems.findFirst({
              where: eq(p2PurchaseOrderItems.id, serializedItem.poItemId),
            });
            
            if (poItem) {
              const po = await db.query.p2PurchaseOrders.findFirst({
                where: eq(p2PurchaseOrders.id, poItem.poId),
              });
              poHasAuthorizer = !!(po as any)?.toleranceAuthorizerId;
            }
          }
          
          if (!poHasAuthorizer) {
            return res.status(403).json({
              error: 'Tolerance authorization required',
              gatingFailed: true,
              message: 'This item has failed Final QC inspections. Tolerance authorizer signature is required before the item can proceed. ' +
                       'Please use the Tolerance Gate approval workflow.',
              currentDepartment,
              requiresToleranceAuth: true,
              serializedItemId: serializedItem.id,
            });
          }
        }
      }
    }

    // Update department completion timestamp
    const completionField = `${currentDepartment.toLowerCase().replace(/[^a-z]/g, '')}CompletedAt`;
    const updates: any = {
      updatedAt: new Date(),
    };

    // Set completion timestamp for current department
    if (currentDepartment === 'Layup' || currentDepartment === 'Layup/Plugging') {
      updates.layupCompletedAt = new Date();
    } else if (currentDepartment === 'Assemble/Disassembly') {
      updates.assembleDisassemblyCompletedAt = new Date();
    } else if (currentDepartment === 'CNC') {
      updates.cncCompletedAt = new Date();
    } else if (currentDepartment === 'Finish') {
      updates.finishCompletedAt = new Date();
    } else if (currentDepartment === 'Paint') {
      updates.paintCompletedAt = new Date();
    } else if (currentDepartment === 'Final QC') {
      updates.finalQcCompletedAt = new Date();
    }

    // Advance to next department or mark completed
    if (nextIndex < departmentSequence.length) {
      updates.currentDepartment = nextDepartment;
      updates.currentStageIndex = nextIndex;
    } else {
      updates.status = 'COMPLETED';
      updates.completedAt = new Date();
    }

    // Update serialized item
    await db.update(p2SerializedItems)
      .set(updates)
      .where(eq(p2SerializedItems.id, serializedItem.id));

    // Log transition event
    await db.insert(p2SerializedItemEvents).values({
      serializedItemId: serializedItem.id,
      barcode: serializedItem.barcode,
      eventType: 'TRANSITION',
      fromDepartment: currentDepartment,
      toDepartment: nextDepartment || 'COMPLETED',
      fromStageIndex: currentIndex,
      toStageIndex: nextIndex < departmentSequence.length ? nextIndex : null,
      performedBy: employeeCode,
      notes: notes || `Completed ${currentDepartment} - Duration: ${durationMinutes} minutes`,
      metadata: { taskId, durationMinutes },
    });

    return res.json({
      success: true,
      message: nextDepartment 
        ? `Task completed. Part advanced to ${nextDepartment}` 
        : 'Task completed. Part has finished all departments',
      durationMinutes,
      nextDepartment: nextDepartment || null,
      status: updates.status || 'ACTIVE',
    });
  } catch (error: any) {
    console.error('Error completing task:', error);
    return res.status(500).json({ error: error.message || 'Failed to complete task' });
  }
});

// POST /api/p2-traveler/admin/force-complete-task
// Admin: Force-complete a stuck task (bypasses employee/barcode checks)
router.post('/admin/force-complete-task', async (req: Request, res: Response) => {
  try {
    const { taskId, reason } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const workTask = await db.query.p2WorkTasks.findFirst({
      where: eq(p2WorkTasks.id, taskId),
    });

    if (!workTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (workTask.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Task is not in progress' });
    }

    const startedAt = workTask.startedAt ? new Date(workTask.startedAt) : new Date();
    const completedAt = new Date();
    const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);

    await db.update(p2WorkTasks)
      .set({
        status: 'COMPLETED',
        completedAt,
        durationMinutes,
        notes: `[ADMIN FORCE-COMPLETE] ${reason || 'Stuck task cleared by admin'}`,
      })
      .where(eq(p2WorkTasks.id, taskId));

    console.log(`[ADMIN] Force-completed task ${taskId} for ${workTask.employeeName} in ${workTask.department}`);

    return res.json({ 
      success: true, 
      message: `Task force-completed for ${workTask.employeeName}`,
      taskId,
    });
  } catch (error: any) {
    console.error('Error force-completing task:', error);
    return res.status(500).json({ error: error.message || 'Failed to force-complete task' });
  }
});

// GET /api/p2-traveler/admin/stuck-tasks
// Admin: List all IN_PROGRESS tasks (for clearing stuck ones)
router.get('/admin/stuck-tasks', async (_req: Request, res: Response) => {
  try {
    const stuckTasks = await db.query.p2WorkTasks.findMany({
      where: eq(p2WorkTasks.status, 'IN_PROGRESS'),
      orderBy: [desc(p2WorkTasks.startedAt)],
    });
    return res.json(stuckTasks);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to get stuck tasks' });
  }
});

// GET /api/p2-traveler/traceability/:serializedItemId
// Get complete traceability report for a serialized item
router.get('/traceability/:serializedItemId', async (req: Request, res: Response) => {
  try {
    const { serializedItemId } = req.params;

    // Get serialized item
    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Part not found' });
    }

    // Get all events
    const events = await db.query.p2SerializedItemEvents.findMany({
      where: eq(p2SerializedItemEvents.serializedItemId, serializedItemId),
      orderBy: [desc(p2SerializedItemEvents.createdAt)],
    });

    // Get all work tasks
    const workTasks = await db.query.p2WorkTasks.findMany({
      where: eq(p2WorkTasks.serializedItemId, serializedItemId),
      orderBy: [desc(p2WorkTasks.startedAt)],
    });

    // Get all traceability records
    const traceabilityRecords = await db.query.p2SerializedItemTraceability.findMany({
      where: eq(p2SerializedItemTraceability.serializedItemId, serializedItemId),
      orderBy: [desc(p2SerializedItemTraceability.createdAt)],
    });

    // Get all custom data records
    const customDataRecords = await db.query.p2SerializedItemCustomData.findMany({
      where: eq(p2SerializedItemCustomData.serializedItemId, serializedItemId),
      orderBy: [desc(p2SerializedItemCustomData.createdAt)],
    });

    return res.json({
      serializedItem,
      events,
      workTasks,
      traceabilityRecords,
      customDataRecords,
    });
  } catch (error: any) {
    console.error('Error getting traceability:', error);
    return res.status(500).json({ error: 'Failed to get traceability report' });
  }
});

export default router;
