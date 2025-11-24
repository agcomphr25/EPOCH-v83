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
  insertP2WorkTaskSchema,
  insertP2SerializedItemEventSchema,
  insertP2SerializedItemTraceabilitySchema,
  insertP2SerializedItemCustomDataSchema,
} from '../../schema';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

// GET /api/p2-traveler/verify-certification/:employeeCode/:barcode
// Verify employee certification for part's next department
router.get('/verify-certification/:employeeCode/:barcode', async (req: Request, res: Response) => {
  try {
    const { employeeCode, barcode } = req.params;

    // Get employee
    const employee = await db.query.employees.findFirst({
      where: eq(employees.employeeCode, employeeCode),
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get serialized item
    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.barcode, barcode),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Part not found' });
    }

    // Get part routing
    const routing = await db.query.partRoutings.findFirst({
      where: and(
        eq(partRoutings.partNumber, serializedItem.partNumber),
        eq(partRoutings.isActive, true)
      ),
    });

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

    // Check if employee is certified for this department and part
    const certification = await db.query.p2EmployeePartCertifications.findFirst({
      where: and(
        eq(p2EmployeePartCertifications.employeeId, employee.id),
        eq(p2EmployeePartCertifications.partNumber, serializedItem.partNumber),
        eq(p2EmployeePartCertifications.department, nextDepartment),
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
    const { barcode } = req.params;

    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.barcode, barcode),
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
    const certification = await db.query.p2EmployeePartCertifications.findFirst({
      where: and(
        eq(p2EmployeePartCertifications.employeeId, parseInt(employeeId)),
        eq(p2EmployeePartCertifications.partNumber, serializedItem.partNumber),
        eq(p2EmployeePartCertifications.department, department),
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

    // Check if part is available (not already in progress by another tech)
    const existingTask = await db.query.p2WorkTasks.findFirst({
      where: and(
        eq(p2WorkTasks.serializedItemId, serializedItemId),
        eq(p2WorkTasks.status, 'IN_PROGRESS')
      ),
    });

    if (existingTask) {
      return res.status(400).json({ 
        error: `Part is already being worked on by ${existingTask.employeeName}` 
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
        return res.status(400).json({ 
          error: `You must complete your current task on ${employeeActiveTasks[0].partName} before starting a new one`,
          code: 'MULTI_TASK_NOT_ALLOWED'
        });
      }
    }

    // Validate input
    const validatedData = insertP2WorkTaskSchema.parse({
      serializedItemId,
      barcode,
      partNumber,
      partName,
      department,
      employeeId: parseInt(employeeId),
      employeeCode,
      employeeName,
      certificationId: certification.id, // Link certification for audit trail
      status: 'IN_PROGRESS',
      traceabilityData,
      customData,
      notes,
    });

    // Create work task
    const [workTask] = await db.insert(p2WorkTasks).values(validatedData).returning();

    // Save traceability data
    if (traceabilityData && Array.isArray(traceabilityData)) {
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

    // Verify employee and barcode match
    if (workTask.employeeCode !== employeeCode) {
      return res.status(403).json({ error: 'Only the assigned technician can complete this task' });
    }

    if (workTask.barcode !== barcode) {
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

    // Update department completion timestamp
    const completionField = `${currentDepartment.toLowerCase().replace(/[^a-z]/g, '')}CompletedAt`;
    const updates: any = {
      updatedAt: new Date(),
    };

    // Set completion timestamp for current department
    if (currentDepartment === 'Layup') {
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
