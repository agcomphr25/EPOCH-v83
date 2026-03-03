import { Router, type Request, type Response } from 'express';
import { db } from '../../db';
import { 
  p2SerializedItems, 
  p2SerializedItemEvents, 
  p2WorkTasks,
  partRoutings,
  p2SerializedItemTraceability,
  p2SerializedItemCustomData,
  p2PurchaseOrders,
  p2PurchaseOrderItems,
  p2OvenCureLogs,
  p2VacuumLeakTests,
  p2FinalInspectionResults,
  p2LotNumbers,
  p2PackingSlips,
  p2CertificatesOfConformance,
  p2TestForConformanceReports,
  p2DepartmentTransferSignatures,
  qcSubmissions,
  travelers,
  inventoryItems,
  cuttingFabricInventory,
  travelerSteps,
  travelerTasks,
  travelerTaskFields,
  travelerSignatures,
  employees,
  users,
  insertP2LotNumberSchema,
  insertP2PackingSlipSchema,
  insertP2CertificateOfConformanceSchema,
  insertP2TestForConformanceReportSchema,
  insertP2OvenCureLogSchema,
  insertP2VacuumLeakTestSchema,
  insertP2FinalInspectionResultSchema,
  insertP2DepartmentTransferSignatureSchema,
} from '../../schema';
import { eq, and, desc, sql, inArray, or, ilike, asc } from 'drizzle-orm';

const router = Router();

// Helper function to generate lot number
function generateLotNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `LOT-${dateStr}-${randomNum}`;
}

// Helper function to generate document numbers
function generateDocumentNumber(prefix: string): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${randomNum}`;
}

// GET /api/p2-traveler-viewer/item/:barcode
// Get comprehensive traveler data for a serialized item
router.get('/item/:barcode', async (req: Request, res: Response) => {
  try {
    const barcode = decodeURIComponent(req.params.barcode).trim();

    // Get serialized item - check both system barcode and physical traveler barcode (case-insensitive)
    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: or(
        ilike(p2SerializedItems.barcode, barcode),
        ilike(p2SerializedItems.travelerBarcode, barcode)
      ),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Serialized item not found' });
    }

    // Get part routing
    const routing = await db.query.partRoutings.findFirst({
      where: and(
        eq(partRoutings.partNumber, serializedItem.partNumber),
        eq(partRoutings.isActive, true)
      ),
    });

    // Get PO information
    const purchaseOrder = await db.query.p2PurchaseOrders.findFirst({
      where: eq(p2PurchaseOrders.id, serializedItem.poId),
    });

    const poItem = await db.query.p2PurchaseOrderItems.findFirst({
      where: eq(p2PurchaseOrderItems.id, serializedItem.poItemId),
    });

    // Get all work tasks (technician history)
    const workTasks = await db.query.p2WorkTasks.findMany({
      where: eq(p2WorkTasks.serializedItemId, serializedItem.id),
      orderBy: [desc(p2WorkTasks.startedAt)],
    });

    // Get all events (audit log)
    const events = await db.query.p2SerializedItemEvents.findMany({
      where: eq(p2SerializedItemEvents.serializedItemId, serializedItem.id),
      orderBy: [desc(p2SerializedItemEvents.createdAt)],
    });

    // Get traceability data and enrich with inventory/fabric details
    const rawTraceabilityData = await db.query.p2SerializedItemTraceability.findMany({
      where: eq(p2SerializedItemTraceability.serializedItemId, serializedItem.id),
    });

    const traceabilityData = await Promise.all(rawTraceabilityData.map(async (trace) => {
      let inventoryDetail: any = null;
      let fabricDetail: any = null;

      if (trace.inventoryPartId) {
        const partId = parseInt(trace.inventoryPartId);
        if (!isNaN(partId)) {
          const item = await db.query.inventoryItems.findFirst({
            where: eq(inventoryItems.id, partId),
          });
          if (item) {
            inventoryDetail = {
              name: item.name,
              agPartNumber: item.agPartNumber,
              source: item.source,
              supplierPartNumber: item.supplierPartNumber,
              isFabric: item.isFabric,
              category: item.category,
              location: item.location,
            };
          }
        }
      }

      if (trace.traceabilityValue) {
        const val = trace.traceabilityValue.trim();
        const fabricMatch = await db.query.cuttingFabricInventory.findFirst({
          where: or(
            eq(cuttingFabricInventory.lotNumber, val),
            eq(cuttingFabricInventory.rollNumber, val),
            eq(cuttingFabricInventory.batchNumber, val),
            eq(cuttingFabricInventory.barcode, val),
            eq(cuttingFabricInventory.internalControlNumber, val),
          ),
        });
        if (fabricMatch) {
          fabricDetail = {
            fabricId: fabricMatch.id,
            fabric: fabricMatch.fabric,
            fabricPartNumber: fabricMatch.fabricPartNumber,
            nickname: fabricMatch.nickname,
            source: fabricMatch.source,
            supplierPartNumber: fabricMatch.supplierPartNumber,
            supplierPoNumber: fabricMatch.supplierPoNumber,
            manufacturerPoNumber: fabricMatch.manufacturerPoNumber,
            lotNumber: fabricMatch.lotNumber,
            rollNumber: fabricMatch.rollNumber,
            batchNumber: fabricMatch.batchNumber,
            internalControlNumber: fabricMatch.internalControlNumber,
            barcode: fabricMatch.barcode,
            manufactureDate: fabricMatch.manufactureDate,
            receivedDate: fabricMatch.receivedDate,
            expirationDate: fabricMatch.expirationDate,
            location: fabricMatch.location,
            freezerNumber: fabricMatch.freezerNumber,
            conformanceDocumentLink: fabricMatch.conformanceDocumentLink,
            quantityInStock: fabricMatch.quantityInStock,
            squareMeters: fabricMatch.squareMeters,
            notes: fabricMatch.notes,
            status: fabricMatch.status,
            depletedAt: fabricMatch.depletedAt,
            depletedBy: fabricMatch.depletedBy,
          };
        }
      }

      return {
        ...trace,
        inventoryDetail,
        fabricDetail,
      };
    }));

    // Get custom data
    const customData = await db.query.p2SerializedItemCustomData.findMany({
      where: eq(p2SerializedItemCustomData.serializedItemId, serializedItem.id),
    });

    // Get oven cure logs
    const ovenCureLogs = await db.query.p2OvenCureLogs.findMany({
      where: eq(p2OvenCureLogs.serializedItemId, serializedItem.id),
      orderBy: [desc(p2OvenCureLogs.startTime)],
    });

    // Get vacuum leak tests
    const vacuumLeakTests = await db.query.p2VacuumLeakTests.findMany({
      where: eq(p2VacuumLeakTests.serializedItemId, serializedItem.id),
      orderBy: [desc(p2VacuumLeakTests.startTime)],
    });

    // Get final inspection results
    const finalInspectionResults = await db.query.p2FinalInspectionResults.findMany({
      where: eq(p2FinalInspectionResults.serializedItemId, serializedItem.id),
      orderBy: [desc(p2FinalInspectionResults.inspectionDate)],
    });

    // Get QC submissions related to this item
    const qcSubmissionsData = await db.query.qcSubmissions.findMany({
      where: eq(qcSubmissions.orderId, serializedItem.poNumber),
    });

    // Get lot numbers that include this item
    const lotNumbers = await db.query.p2LotNumbers.findMany({
      where: sql`${p2LotNumbers.barcodes}::jsonb ? ${barcode}`,
    });

    // Get department transfer signatures
    const departmentTransferSignatures = await db.query.p2DepartmentTransferSignatures.findMany({
      where: eq(p2DepartmentTransferSignatures.serializedItemId, serializedItem.id),
      orderBy: [desc(p2DepartmentTransferSignatures.signedAt)],
    });

    // Get traveler steps linked to this serialized item via serial number
    let travelerStepData: any[] = [];
    const linkedTravelers = await db.query.travelers.findMany({
      where: eq(travelers.serialNumber, serializedItem.serialNumber),
    });
    if (linkedTravelers.length > 0) {
      const activeTraveler = linkedTravelers.find(t => t.status === 'IN_PROGRESS') 
        || linkedTravelers.find(t => t.status === 'COMPLETED')
        || linkedTravelers[linkedTravelers.length - 1];
      
      travelerStepData = await db.select()
        .from(travelerSteps)
        .where(eq(travelerSteps.travelerId, activeTraveler.id))
        .orderBy(asc(travelerSteps.stepNumber));
    }

    // Load traveler tasks, field values, and signatures for the linked traveler steps
    let travelerTasksData: any[] = [];
    let travelerTaskFieldsData: any[] = [];
    let travelerSigsData: any[] = [];
    if (travelerStepData.length > 0) {
      const stepIds = travelerStepData.map((s: any) => s.id);
      travelerTasksData = await db.query.travelerTasks.findMany({
        where: inArray(travelerTasks.travelerStepId, stepIds),
      });
      if (travelerTasksData.length > 0) {
        const taskIds = travelerTasksData.map((t: any) => t.id);
        travelerTaskFieldsData = await db.query.travelerTaskFields.findMany({
          where: inArray(travelerTaskFields.travelerTaskId, taskIds),
        });
      }
      travelerSigsData = await db.query.travelerSignatures.findMany({
        where: inArray(travelerSignatures.travelerStepId, stepIds),
      });
    }

    // Build a name lookup for employee codes and usernames
    const nameIdentifiers = new Set<string>();
    travelerStepData.forEach(s => {
      if (s.startedBy) nameIdentifiers.add(s.startedBy);
      if (s.completedBy) nameIdentifiers.add(s.completedBy);
    });
    workTasks.forEach(t => {
      if (t.employeeCode) nameIdentifiers.add(t.employeeCode);
      if (t.employeeName) nameIdentifiers.add(t.employeeName);
    });
    events.forEach(e => {
      if (e.performedBy) nameIdentifiers.add(e.performedBy);
    });
    travelerTasksData.forEach((t: any) => {
      if (t.completedBy) nameIdentifiers.add(t.completedBy);
    });
    travelerSigsData.forEach((s: any) => {
      if (s.signedBy) nameIdentifiers.add(s.signedBy);
      if (s.signedByName) nameIdentifiers.add(s.signedByName);
    });
    travelerTaskFieldsData.forEach((f: any) => {
      if (f.recordedBy) nameIdentifiers.add(f.recordedBy);
    });
    ovenCureLogs.forEach(l => {
      if (l.operatorName) nameIdentifiers.add(l.operatorName);
    });
    vacuumLeakTests.forEach(t => {
      if (t.operatorName) nameIdentifiers.add(t.operatorName);
    });
    finalInspectionResults.forEach(r => {
      if (r.inspectorName) nameIdentifiers.add(r.inspectorName);
    });
    qcSubmissionsData.forEach(q => {
      if (q.submittedBy) nameIdentifiers.add(q.submittedBy);
    });
    departmentTransferSignatures.forEach(s => {
      if (s.signedByUsername) nameIdentifiers.add(s.signedByUsername);
    });
    
    const nameMap: Record<string, string> = {};
    if (nameIdentifiers.size > 0) {
      const ids = Array.from(nameIdentifiers);
      const numericIds = ids.filter(id => /^\d+$/.test(id)).map(Number);
      const matchedEmployees = await db.query.employees.findMany({
        where: or(
          inArray(employees.employeeCode, ids),
          inArray(employees.name, ids),
          inArray(employees.badgeScanCode, ids),
          ...(numericIds.length > 0 ? [inArray(employees.id, numericIds)] : [])
        ),
      });
      matchedEmployees.forEach(emp => {
        const displayName = emp.preferredName || emp.name;
        if (emp.employeeCode) nameMap[emp.employeeCode] = displayName;
        if (emp.badgeScanCode) nameMap[emp.badgeScanCode] = displayName;
        nameMap[emp.name] = displayName;
        nameMap[String(emp.id)] = displayName;
      });
      
      const matchedUsers = await db.query.users.findMany({
        where: inArray(users.username, ids),
      });
      matchedUsers.forEach(u => {
        if (u.firstName && u.lastName) {
          nameMap[u.username] = `${u.firstName} ${u.lastName}`;
        }
      });
    }
    
    const empCodePattern = /^EMP\d+$/i;
    const resolveName = (identifier: string | null): string | null => {
      if (!identifier) return null;
      const key = String(identifier);
      if (nameMap[key]) return nameMap[key];
      if (empCodePattern.test(key)) return 'Unknown Technician';
      return key;
    };

    // Build department progression data using traveler step data when available
    const departmentSequence = routing?.departmentSequence as string[] || [];
    
    const normalizeDept = (name: string) => (name || '').toLowerCase().replace(/[\s_-]+/g, '');
    
    const departmentProgress = departmentSequence.map((dept, index) => {
      const completedTasks = workTasks.filter(t => 
        t.department === dept && t.status === 'COMPLETED'
      );
      const activeTasks = workTasks.filter(t => 
        t.department === dept && t.status === 'IN_PROGRESS'
      );

      const deptNorm = normalizeDept(dept);
      let matchingStep = travelerStepData.find(s => normalizeDept(s.departmentName) === deptNorm);
      
      if (!matchingStep && travelerStepData.length > 0) {
        matchingStep = travelerStepData.find(s => (s.stepNumber - 1) === index);
      }

      let status: string;
      let startedAt: string | null = null;
      let completedAt: string | null = null;
      let startedBy: string | null = null;
      let completedBy: string | null = null;

      if (matchingStep) {
        if (matchingStep.status === 'COMPLETED') {
          status = 'COMPLETED';
        } else if (matchingStep.status === 'IN_PROGRESS') {
          status = 'IN_PROGRESS';
        } else if (matchingStep.status === 'BLOCKED') {
          status = 'BLOCKED';
        } else {
          status = 'PENDING';
        }
        startedAt = matchingStep.startedAt;
        completedAt = matchingStep.completedAt;
        startedBy = resolveName(matchingStep.startedBy);
        completedBy = resolveName(matchingStep.completedBy);
      } else {
        status = index < (serializedItem.currentStageIndex || 0) ? 'COMPLETED' :
                index === (serializedItem.currentStageIndex || 0) ? 
                  (activeTasks.length > 0 ? 'IN_PROGRESS' : 'PENDING') : 'PENDING';
        completedAt = completedTasks[0]?.completedAt || null;
      }
      
      return {
        department: dept,
        index,
        status,
        startedAt,
        completedAt,
        startedBy,
        completedBy,
        stepId: matchingStep?.id || null,
        stepNumber: matchingStep?.stepNumber ?? null,
        technicians: completedTasks.map(t => ({
          name: t.employeeName || resolveName(t.employeeCode) || t.employeeCode,
          code: t.employeeCode,
          startedAt: t.startedAt,
          completedAt: t.completedAt,
          duration: t.durationMinutes,
        })),
        traceabilityData: traceabilityData.filter(t => t.department === dept),
        customData: customData.filter(c => c.department === dept),
      };
    });

    // Extract all signatures from various sources
    const signatures = [
      // Department Transfer Signatures (AS9100 compliant work completion verification)
      ...departmentTransferSignatures.map(s => ({
        id: s.id,
        type: 'Department Transfer',
        fromDepartment: s.fromDepartment,
        toDepartment: s.toDepartment,
        signedBy: s.signedByName,
        signedByUsername: s.signedByUsername,
        signedAt: s.signedAt,
        signatureData: s.signatureData,
        workInstructionRef: s.workInstructionRef,
        declarationText: s.declarationText,
        declarationAccepted: s.declarationAccepted,
        notes: s.notes,
      })),
      // Legacy signatures from other sources
      ...workTasks.filter(t => t.traceabilityData && (t.traceabilityData as any)?.signature).map(t => ({
        type: 'Work Task',
        department: t.department,
        signedBy: resolveName(t.employeeCode) || t.employeeName,
        signedAt: t.completedAt,
        signatureData: (t.traceabilityData as any)?.signature,
      })),
      ...ovenCureLogs.filter(l => l.signature).map(l => ({
        type: 'Oven Cure',
        department: l.department,
        signedBy: resolveName(l.operatorName) || l.operatorName,
        signedAt: l.endTime,
        signatureData: l.signature,
      })),
      ...vacuumLeakTests.filter(t => t.signature).map(t => ({
        type: 'Vacuum Test',
        department: t.department,
        signedBy: resolveName(t.operatorName) || t.operatorName,
        signedAt: t.endTime,
        signatureData: t.signature,
      })),
      ...finalInspectionResults.filter(r => r.signature).map(r => ({
        type: 'Final Inspection',
        department: r.department,
        signedBy: resolveName(r.inspectorName) || r.inspectorName,
        signedAt: r.inspectionDate,
        signatureData: r.signature,
      })),
      ...qcSubmissionsData.filter(q => q.signature).map(q => ({
        type: 'QC Submission',
        department: q.department,
        signedBy: resolveName(q.submittedBy) || q.submittedBy,
        signedAt: q.submittedAt,
        signatureData: q.signature,
      })),
      // Signatures captured directly in TravelerExecution steps
      ...travelerSigsData.map((s: any) => {
        const step = travelerStepData.find((st: any) => st.id === s.travelerStepId);
        return {
          id: s.id,
          type: 'Traveler Step',
          department: step?.departmentName || 'Unknown',
          signedBy: resolveName(s.signedBy) || s.signedByName || s.signedBy,
          signedByUsername: s.signedBy,
          signedAt: s.signedAt,
          signatureData: s.signatureData,
          notes: s.notes,
          meaning: s.meaning,
          signatureRole: s.signatureRole,
        };
      }),
    ];

    // Technicians derived from traveler steps (startedBy / completedBy)
    const stepTechnicianTasks: any[] = [];
    const seenTechKeys = new Set<string>();
    travelerStepData.forEach((step: any) => {
      if (step.startedBy) {
        const key = `${step.departmentName}-${step.startedBy}-start`;
        if (!seenTechKeys.has(key)) {
          seenTechKeys.add(key);
          stepTechnicianTasks.push({
            id: `step-start-${step.id}`,
            department: step.departmentName,
            employeeName: resolveName(step.startedBy) || step.startedBy,
            employeeCode: step.startedBy,
            status: step.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
            startedAt: step.startedAt,
            completedAt: step.status === 'COMPLETED' ? step.completedAt : null,
            durationMinutes: null,
            source: 'traveler_step',
          });
        }
      }
      if (step.completedBy && step.completedBy !== step.startedBy) {
        const key = `${step.departmentName}-${step.completedBy}-complete`;
        if (!seenTechKeys.has(key)) {
          seenTechKeys.add(key);
          stepTechnicianTasks.push({
            id: `step-complete-${step.id}`,
            department: step.departmentName,
            employeeName: resolveName(step.completedBy) || step.completedBy,
            employeeCode: step.completedBy,
            status: 'COMPLETED',
            startedAt: step.startedAt,
            completedAt: step.completedAt,
            durationMinutes: null,
            source: 'traveler_step',
          });
        }
      }
    });

    // Technicians derived from traveler tasks (badge scans on individual tasks)
    const stepIdToDeptName: Record<string, string> = {};
    travelerStepData.forEach((s: any) => { stepIdToDeptName[s.id] = s.departmentName; });
    travelerTasksData.forEach((task: any) => {
      if (task.completedBy) {
        const dept = stepIdToDeptName[task.travelerStepId] || 'Unknown';
        const key = `${dept}-${task.completedBy}-task`;
        if (!seenTechKeys.has(key)) {
          seenTechKeys.add(key);
          stepTechnicianTasks.push({
            id: `task-${task.id}`,
            department: dept,
            employeeName: resolveName(task.completedBy) || task.completedBy,
            employeeCode: task.completedBy,
            taskTitle: task.title,
            status: 'COMPLETED',
            startedAt: task.startedAt,
            completedAt: task.completedAt,
            durationMinutes: task.startedAt && task.completedAt
              ? Math.round((new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 60000)
              : null,
            source: 'traveler_task',
          });
        }
      }
    });

    const resolvedWorkTasks = [
      ...workTasks.map(t => ({
        ...t,
        employeeName: resolveName(t.employeeCode) || t.employeeName || t.employeeCode,
      })),
      ...stepTechnicianTasks,
    ];

    const resolvedEvents = events.map(e => ({
      ...e,
      performedBy: resolveName(e.performedBy) || e.performedBy,
    }));

    // Task field values from TravelerExecution as traceability entries
    const stepIdToDept: Record<string, string> = {};
    travelerStepData.forEach((s: any) => { stepIdToDept[s.id] = s.departmentName; });
    const taskIdToStepId: Record<string, string> = {};
    travelerTasksData.forEach((t: any) => { taskIdToStepId[t.id] = t.travelerStepId; });

    const travelerFieldTraceability = travelerTaskFieldsData
      .filter((f: any) => f.value && f.value.trim() !== '')
      .map((f: any) => {
        const stepId = taskIdToStepId[f.travelerTaskId];
        const dept = stepId ? stepIdToDept[stepId] : 'Unknown';
        return {
          id: `ttf-${f.id}`,
          serializedItemId: serializedItem.id,
          department: dept,
          traceabilityType: f.fieldType || 'text',
          traceabilityLabel: f.fieldLabel,
          traceabilityValue: f.value,
          recordedBy: resolveName(f.recordedBy) || f.recordedBy,
          recordedAt: f.recordedAt,
          source: 'traveler_field',
        };
      });

    const mergedTraceabilityData = [...traceabilityData, ...travelerFieldTraceability];

    return res.json({
      serializedItem,
      purchaseOrder,
      poItem,
      routing: routing ? {
        id: routing.id,
        departmentSequence,
        traceabilityConfig: routing.traceabilityConfig,
        departmentConfig: routing.departmentConfig,
      } : null,
      departmentProgress,
      workTasks: resolvedWorkTasks,
      events: resolvedEvents,
      traceabilityData: mergedTraceabilityData,
      customData,
      ovenCureLogs,
      vacuumLeakTests,
      finalInspectionResults,
      qcSubmissions: qcSubmissionsData,
      signatures,
      lotNumbers,
    });
  } catch (error: any) {
    console.error('Error getting traveler data:', error);
    if (error?.code === '42P01') {
      return res.status(503).json({ 
        error: 'Database tables not yet available. Please contact admin.',
        detail: error.message,
      });
    }
    return res.status(500).json({ 
      error: 'Failed to get traveler data',
      detail: error?.message || 'Unknown error',
    });
  }
});

// GET /api/p2-traveler-viewer/item-by-id/:id
// Get comprehensive traveler data for a serialized item by ID
router.get('/item-by-id/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, id),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Serialized item not found' });
    }

    // Redirect to the barcode endpoint
    return res.redirect(`/api/p2-traveler-viewer/item/${serializedItem.barcode}`);
  } catch (error: any) {
    console.error('Error getting traveler data by ID:', error);
    return res.status(500).json({ error: 'Failed to get traveler data' });
  }
});

// PATCH /api/p2-traveler-viewer/item/:id/traveler-barcode
// Update the physical traveler barcode for a serialized item
router.patch('/item/:id/traveler-barcode', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { travelerBarcode } = req.body;

    if (!travelerBarcode || typeof travelerBarcode !== 'string') {
      return res.status(400).json({ error: 'Traveler barcode is required' });
    }

    const [updated] = await db
      .update(p2SerializedItems)
      .set({ travelerBarcode: travelerBarcode.trim() })
      .where(eq(p2SerializedItems.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Serialized item not found' });
    }

    return res.json({ success: true, item: updated });
  } catch (error: any) {
    console.error('Error updating traveler barcode:', error);
    return res.status(500).json({ error: 'Failed to update traveler barcode' });
  }
});

// POST /api/p2-traveler-viewer/oven-cure-log
// Record an oven cure cycle
router.post('/oven-cure-log', async (req: Request, res: Response) => {
  try {
    const validatedData = insertP2OvenCureLogSchema.parse(req.body);
    const [log] = await db.insert(p2OvenCureLogs).values(validatedData).returning();
    return res.json({ success: true, log });
  } catch (error: any) {
    console.error('Error creating oven cure log:', error);
    return res.status(500).json({ error: error.message || 'Failed to create oven cure log' });
  }
});

// PUT /api/p2-traveler-viewer/oven-cure-log/:id
// Update an oven cure cycle
router.put('/oven-cure-log/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    delete updateData.id;
    delete updateData.createdAt;
    updateData.updatedAt = new Date();

    const [log] = await db
      .update(p2OvenCureLogs)
      .set(updateData)
      .where(eq(p2OvenCureLogs.id, id))
      .returning();

    if (!log) {
      return res.status(404).json({ error: 'Oven cure log not found' });
    }
    return res.json({ success: true, log });
  } catch (error: any) {
    console.error('Error updating oven cure log:', error);
    return res.status(500).json({ error: error.message || 'Failed to update oven cure log' });
  }
});

// POST /api/p2-traveler-viewer/vacuum-leak-test
// Record a vacuum leak test
router.post('/vacuum-leak-test', async (req: Request, res: Response) => {
  try {
    const validatedData = insertP2VacuumLeakTestSchema.parse(req.body);
    const [test] = await db.insert(p2VacuumLeakTests).values(validatedData).returning();
    return res.json({ success: true, test });
  } catch (error: any) {
    console.error('Error creating vacuum leak test:', error);
    return res.status(500).json({ error: error.message || 'Failed to create vacuum leak test' });
  }
});

// PUT /api/p2-traveler-viewer/vacuum-leak-test/:id
// Update a vacuum leak test
router.put('/vacuum-leak-test/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    delete updateData.id;
    delete updateData.createdAt;
    updateData.updatedAt = new Date();

    const [test] = await db
      .update(p2VacuumLeakTests)
      .set(updateData)
      .where(eq(p2VacuumLeakTests.id, id))
      .returning();

    if (!test) {
      return res.status(404).json({ error: 'Vacuum leak test not found' });
    }
    return res.json({ success: true, test });
  } catch (error: any) {
    console.error('Error updating vacuum leak test:', error);
    return res.status(500).json({ error: error.message || 'Failed to update vacuum leak test' });
  }
});

// POST /api/p2-traveler-viewer/final-inspection
// Record a final inspection result
router.post('/final-inspection', async (req: Request, res: Response) => {
  try {
    const validatedData = insertP2FinalInspectionResultSchema.parse(req.body);
    const [result] = await db.insert(p2FinalInspectionResults).values(validatedData).returning();
    return res.json({ success: true, result });
  } catch (error: any) {
    console.error('Error creating final inspection result:', error);
    return res.status(500).json({ error: error.message || 'Failed to create final inspection result' });
  }
});

// PUT /api/p2-traveler-viewer/final-inspection/:id
// Update a final inspection result
router.put('/final-inspection/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    delete updateData.id;
    delete updateData.createdAt;
    updateData.updatedAt = new Date();

    const [result] = await db
      .update(p2FinalInspectionResults)
      .set(updateData)
      .where(eq(p2FinalInspectionResults.id, id))
      .returning();

    if (!result) {
      return res.status(404).json({ error: 'Final inspection result not found' });
    }
    return res.json({ success: true, result });
  } catch (error: any) {
    console.error('Error updating final inspection result:', error);
    return res.status(500).json({ error: error.message || 'Failed to update final inspection result' });
  }
});

// POST /api/p2-traveler-viewer/lot-number
// Create a new lot number
router.post('/lot-number', async (req: Request, res: Response) => {
  try {
    const lotNumber = req.body.lotNumber || generateLotNumber();
    const validatedData = insertP2LotNumberSchema.parse({
      ...req.body,
      lotNumber,
    });
    
    const [lot] = await db.insert(p2LotNumbers).values(validatedData).returning();
    return res.json({ success: true, lot });
  } catch (error: any) {
    console.error('Error creating lot number:', error);
    return res.status(500).json({ error: error.message || 'Failed to create lot number' });
  }
});

// GET /api/p2-traveler-viewer/lot-numbers
// Get all lot numbers
router.get('/lot-numbers', async (req: Request, res: Response) => {
  try {
    const { status, customerId } = req.query;
    
    let query = db.query.p2LotNumbers.findMany({
      orderBy: [desc(p2LotNumbers.createdAt)],
    });

    const lotNumbers = await query;
    
    // Filter by status and customerId if provided
    let filtered = lotNumbers;
    if (status) {
      filtered = filtered.filter(l => l.status === status);
    }
    if (customerId) {
      filtered = filtered.filter(l => l.customerId === customerId);
    }

    return res.json(filtered);
  } catch (error: any) {
    console.error('Error getting lot numbers:', error);
    return res.status(500).json({ error: 'Failed to get lot numbers' });
  }
});

// PUT /api/p2-traveler-viewer/lot-number/:id
// Update a lot number
router.put('/lot-number/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    delete updateData.id;
    delete updateData.createdAt;
    updateData.updatedAt = new Date();

    const [lot] = await db
      .update(p2LotNumbers)
      .set(updateData)
      .where(eq(p2LotNumbers.id, id))
      .returning();

    if (!lot) {
      return res.status(404).json({ error: 'Lot number not found' });
    }
    return res.json({ success: true, lot });
  } catch (error: any) {
    console.error('Error updating lot number:', error);
    return res.status(500).json({ error: error.message || 'Failed to update lot number' });
  }
});

// POST /api/p2-traveler-viewer/lot-number/:id/add-items
// Add serialized items to a lot
router.post('/lot-number/:id/add-items', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { barcodes } = req.body;

    const lot = await db.query.p2LotNumbers.findFirst({
      where: eq(p2LotNumbers.id, id),
    });

    if (!lot) {
      return res.status(404).json({ error: 'Lot number not found' });
    }

    // Get serialized item IDs for the barcodes
    const items = await db.query.p2SerializedItems.findMany({
      where: inArray(p2SerializedItems.barcode, barcodes),
    });

    const existingBarcodes = (lot.barcodes as string[]) || [];
    const existingIds = (lot.serializedItemIds as string[]) || [];

    const newBarcodes = Array.from(new Set([...existingBarcodes, ...barcodes]));
    const newIds = Array.from(new Set([...existingIds, ...items.map(i => i.id)]));

    const [updatedLot] = await db
      .update(p2LotNumbers)
      .set({
        barcodes: newBarcodes,
        serializedItemIds: newIds,
        quantity: newBarcodes.length,
        updatedAt: new Date(),
      })
      .where(eq(p2LotNumbers.id, id))
      .returning();

    return res.json({ success: true, lot: updatedLot });
  } catch (error: any) {
    console.error('Error adding items to lot:', error);
    return res.status(500).json({ error: error.message || 'Failed to add items to lot' });
  }
});

// POST /api/p2-traveler-viewer/packing-slip
// Create a packing slip
router.post('/packing-slip', async (req: Request, res: Response) => {
  try {
    const packingSlipNumber = req.body.packingSlipNumber || generateDocumentNumber('PS');
    const validatedData = insertP2PackingSlipSchema.parse({
      ...req.body,
      packingSlipNumber,
    });
    
    const [packingSlip] = await db.insert(p2PackingSlips).values(validatedData).returning();

    // If associated with a lot, update the lot
    if (req.body.lotNumberId) {
      await db
        .update(p2LotNumbers)
        .set({ packingSlipId: packingSlip.id, updatedAt: new Date() })
        .where(eq(p2LotNumbers.id, req.body.lotNumberId));
    }

    return res.json({ success: true, packingSlip });
  } catch (error: any) {
    console.error('Error creating packing slip:', error);
    return res.status(500).json({ error: error.message || 'Failed to create packing slip' });
  }
});

// GET /api/p2-traveler-viewer/packing-slips
// Get all packing slips
router.get('/packing-slips', async (req: Request, res: Response) => {
  try {
    const packingSlips = await db.query.p2PackingSlips.findMany({
      orderBy: [desc(p2PackingSlips.createdAt)],
    });
    return res.json(packingSlips);
  } catch (error: any) {
    console.error('Error getting packing slips:', error);
    return res.status(500).json({ error: 'Failed to get packing slips' });
  }
});

// GET /api/p2-traveler-viewer/packing-slip/:id
// Get a packing slip by ID
router.get('/packing-slip/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const packingSlip = await db.query.p2PackingSlips.findFirst({
      where: eq(p2PackingSlips.id, id),
    });
    if (!packingSlip) {
      return res.status(404).json({ error: 'Packing slip not found' });
    }
    return res.json(packingSlip);
  } catch (error: any) {
    console.error('Error getting packing slip:', error);
    return res.status(500).json({ error: 'Failed to get packing slip' });
  }
});

// PUT /api/p2-traveler-viewer/packing-slip/:id
// Update a packing slip
router.put('/packing-slip/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    delete updateData.id;
    delete updateData.createdAt;
    updateData.updatedAt = new Date();

    const [packingSlip] = await db
      .update(p2PackingSlips)
      .set(updateData)
      .where(eq(p2PackingSlips.id, id))
      .returning();

    if (!packingSlip) {
      return res.status(404).json({ error: 'Packing slip not found' });
    }
    return res.json({ success: true, packingSlip });
  } catch (error: any) {
    console.error('Error updating packing slip:', error);
    return res.status(500).json({ error: error.message || 'Failed to update packing slip' });
  }
});

// POST /api/p2-traveler-viewer/certificate-of-conformance
// Create a certificate of conformance
router.post('/certificate-of-conformance', async (req: Request, res: Response) => {
  try {
    const certificateNumber = req.body.certificateNumber || generateDocumentNumber('COC');
    const validatedData = insertP2CertificateOfConformanceSchema.parse({
      ...req.body,
      certificateNumber,
    });
    
    const [certificate] = await db.insert(p2CertificatesOfConformance).values(validatedData).returning();

    // If associated with a lot, update the lot
    if (req.body.lotNumberId) {
      await db
        .update(p2LotNumbers)
        .set({ certificateId: certificate.id, updatedAt: new Date() })
        .where(eq(p2LotNumbers.id, req.body.lotNumberId));
    }

    return res.json({ success: true, certificate });
  } catch (error: any) {
    console.error('Error creating certificate of conformance:', error);
    return res.status(500).json({ error: error.message || 'Failed to create certificate of conformance' });
  }
});

// GET /api/p2-traveler-viewer/certificates-of-conformance
// Get all certificates of conformance
router.get('/certificates-of-conformance', async (req: Request, res: Response) => {
  try {
    const certificates = await db.query.p2CertificatesOfConformance.findMany({
      orderBy: [desc(p2CertificatesOfConformance.createdAt)],
    });
    return res.json(certificates);
  } catch (error: any) {
    console.error('Error getting certificates:', error);
    return res.status(500).json({ error: 'Failed to get certificates' });
  }
});

// GET /api/p2-traveler-viewer/certificate-of-conformance/:id
// Get a certificate of conformance by ID
router.get('/certificate-of-conformance/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const certificate = await db.query.p2CertificatesOfConformance.findFirst({
      where: eq(p2CertificatesOfConformance.id, id),
    });
    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    return res.json(certificate);
  } catch (error: any) {
    console.error('Error getting certificate:', error);
    return res.status(500).json({ error: 'Failed to get certificate' });
  }
});

// PUT /api/p2-traveler-viewer/certificate-of-conformance/:id
// Update a certificate of conformance
router.put('/certificate-of-conformance/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    delete updateData.id;
    delete updateData.createdAt;
    updateData.updatedAt = new Date();

    const [certificate] = await db
      .update(p2CertificatesOfConformance)
      .set(updateData)
      .where(eq(p2CertificatesOfConformance.id, id))
      .returning();

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    return res.json({ success: true, certificate });
  } catch (error: any) {
    console.error('Error updating certificate:', error);
    return res.status(500).json({ error: error.message || 'Failed to update certificate' });
  }
});

// POST /api/p2-traveler-viewer/test-for-conformance
// Create a test for conformance report
router.post('/test-for-conformance', async (req: Request, res: Response) => {
  try {
    const reportNumber = req.body.reportNumber || generateDocumentNumber('TFC');
    const validatedData = insertP2TestForConformanceReportSchema.parse({
      ...req.body,
      reportNumber,
    });
    
    const [report] = await db.insert(p2TestForConformanceReports).values(validatedData).returning();
    return res.json({ success: true, report });
  } catch (error: any) {
    console.error('Error creating test for conformance report:', error);
    return res.status(500).json({ error: error.message || 'Failed to create test for conformance report' });
  }
});

// GET /api/p2-traveler-viewer/test-for-conformance-reports
// Get all test for conformance reports
router.get('/test-for-conformance-reports', async (req: Request, res: Response) => {
  try {
    const reports = await db.query.p2TestForConformanceReports.findMany({
      orderBy: [desc(p2TestForConformanceReports.createdAt)],
    });
    return res.json(reports);
  } catch (error: any) {
    console.error('Error getting reports:', error);
    return res.status(500).json({ error: 'Failed to get reports' });
  }
});

// GET /api/p2-traveler-viewer/test-for-conformance/:id
// Get a test for conformance report by ID
router.get('/test-for-conformance/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const report = await db.query.p2TestForConformanceReports.findFirst({
      where: eq(p2TestForConformanceReports.id, id),
    });
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    return res.json(report);
  } catch (error: any) {
    console.error('Error getting report:', error);
    return res.status(500).json({ error: 'Failed to get report' });
  }
});

// PUT /api/p2-traveler-viewer/test-for-conformance/:id
// Update a test for conformance report
router.put('/test-for-conformance/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    delete updateData.id;
    delete updateData.createdAt;
    updateData.updatedAt = new Date();

    const [report] = await db
      .update(p2TestForConformanceReports)
      .set(updateData)
      .where(eq(p2TestForConformanceReports.id, id))
      .returning();

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    return res.json({ success: true, report });
  } catch (error: any) {
    console.error('Error updating report:', error);
    return res.status(500).json({ error: error.message || 'Failed to update report' });
  }
});

// POST /api/p2-traveler-viewer/generate-from-lot/:lotId
// Generate packing slip and certificate from lot data
router.post('/generate-from-lot/:lotId', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const { createdBy, generatePackingSlip, generateCertificate, generateTestReport } = req.body;

    const lot = await db.query.p2LotNumbers.findFirst({
      where: eq(p2LotNumbers.id, lotId),
    });

    if (!lot) {
      return res.status(404).json({ error: 'Lot not found' });
    }

    const barcodes = (lot.barcodes as string[]) || [];
    const results: any = { lot };

    // Get all serialized items in the lot
    const serializedItems = barcodes.length > 0 
      ? await db.query.p2SerializedItems.findMany({
          where: inArray(p2SerializedItems.barcode, barcodes),
        })
      : [];

    // Get all traceability data for items in lot
    const itemIds = serializedItems.map(i => i.id);
    const allTraceability = itemIds.length > 0
      ? await db.query.p2SerializedItemTraceability.findMany({
          where: inArray(p2SerializedItemTraceability.serializedItemId, itemIds),
        })
      : [];

    // Get all inspection results for items in lot
    const allInspections = itemIds.length > 0
      ? await db.query.p2FinalInspectionResults.findMany({
          where: inArray(p2FinalInspectionResults.serializedItemId, itemIds),
        })
      : [];

    // Get all oven cure logs for items in lot
    const allOvenLogs = itemIds.length > 0
      ? await db.query.p2OvenCureLogs.findMany({
          where: inArray(p2OvenCureLogs.serializedItemId, itemIds),
        })
      : [];

    // Get all vacuum tests for items in lot
    const allVacuumTests = itemIds.length > 0
      ? await db.query.p2VacuumLeakTests.findMany({
          where: inArray(p2VacuumLeakTests.serializedItemId, itemIds),
        })
      : [];

    if (generatePackingSlip) {
      const lineItems = serializedItems.map(item => ({
        partNumber: item.partNumber,
        partName: item.partName,
        quantity: 1,
        serialNumbers: [item.serialNumber],
      }));

      const [packingSlip] = await db.insert(p2PackingSlips).values({
        packingSlipNumber: generateDocumentNumber('PS'),
        lotNumberId: lot.id,
        lotNumber: lot.lotNumber,
        customerId: lot.customerId || '',
        customerName: lot.customerName || '',
        poNumber: lot.poNumber,
        lineItems,
        totalQuantity: serializedItems.length,
        status: 'DRAFT',
        createdBy,
      }).returning();

      await db
        .update(p2LotNumbers)
        .set({ packingSlipId: packingSlip.id, updatedAt: new Date() })
        .where(eq(p2LotNumbers.id, lot.id));

      results.packingSlip = packingSlip;
    }

    if (generateCertificate) {
      const serialNumbers = serializedItems.map(i => i.serialNumber);
      
      // Summarize inspection results
      const inspectionSummary = {
        totalInspections: allInspections.length,
        passed: allInspections.filter(i => i.overallResult === 'PASS').length,
        failed: allInspections.filter(i => i.overallResult === 'FAIL').length,
        conditional: allInspections.filter(i => i.overallResult === 'CONDITIONAL').length,
      };

      const [certificate] = await db.insert(p2CertificatesOfConformance).values({
        certificateNumber: generateDocumentNumber('COC'),
        lotNumberId: lot.id,
        lotNumber: lot.lotNumber,
        customerId: lot.customerId || '',
        customerName: lot.customerName || '',
        poNumber: lot.poNumber,
        partNumber: lot.partNumber,
        partName: lot.partName,
        quantity: serializedItems.length,
        serialNumbers,
        manufacturingDate: lot.manufacturingDate,
        traceabilityData: allTraceability,
        inspectionSummary,
        status: 'DRAFT',
        createdBy,
      }).returning();

      await db
        .update(p2LotNumbers)
        .set({ certificateId: certificate.id, updatedAt: new Date() })
        .where(eq(p2LotNumbers.id, lot.id));

      results.certificate = certificate;
    }

    if (generateTestReport) {
      const serialNumbers = serializedItems.map(i => i.serialNumber);
      
      // Summarize test results
      const ovenCureResults = {
        total: allOvenLogs.length,
        passed: allOvenLogs.filter(l => l.result === 'PASS').length,
        failed: allOvenLogs.filter(l => l.result === 'FAIL').length,
        logs: allOvenLogs.map(l => ({
          id: l.id,
          ovenId: l.ovenId,
          temperature: l.actualTemperature,
          duration: l.actualDuration,
          result: l.result,
        })),
      };

      const vacuumTestResults = {
        total: allVacuumTests.length,
        passed: allVacuumTests.filter(t => t.result === 'PASS').length,
        failed: allVacuumTests.filter(t => t.result === 'FAIL').length,
        tests: allVacuumTests.map(t => ({
          id: t.id,
          pressureDrop: t.pressureDrop,
          holdTime: t.holdTime,
          result: t.result,
        })),
      };

      const dimensionalResults = allInspections
        .filter(i => i.inspectionType === 'DIMENSIONAL')
        .map(i => ({
          id: i.id,
          toleranceChecks: i.toleranceChecks,
          result: i.overallResult,
        }));

      const visualInspectionResults = allInspections
        .filter(i => i.inspectionType === 'VISUAL')
        .map(i => ({
          id: i.id,
          visualChecks: i.visualChecks,
          result: i.overallResult,
        }));

      // Determine overall conformance
      const allPassed = 
        allOvenLogs.every(l => l.result === 'PASS') &&
        allVacuumTests.every(t => t.result === 'PASS') &&
        allInspections.every(i => i.overallResult === 'PASS' || i.overallResult === 'CONDITIONAL');

      const [report] = await db.insert(p2TestForConformanceReports).values({
        reportNumber: generateDocumentNumber('TFC'),
        lotNumberId: lot.id,
        lotNumber: lot.lotNumber,
        customerId: lot.customerId || '',
        customerName: lot.customerName || '',
        poNumber: lot.poNumber,
        partNumber: lot.partNumber,
        partName: lot.partName,
        quantity: serializedItems.length,
        serialNumbers,
        ovenCureResults,
        vacuumTestResults,
        dimensionalResults,
        visualInspectionResults,
        overallConformance: allPassed ? 'CONFORMING' : 'NON_CONFORMING',
        status: 'DRAFT',
        createdBy,
      }).returning();

      results.testReport = report;
    }

    return res.json({ success: true, ...results });
  } catch (error: any) {
    console.error('Error generating documents from lot:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate documents' });
  }
});

// ============================================================================
// DEPARTMENT TRANSFER SIGNATURES - AS9100 Compliance
// ============================================================================

// POST /api/p2-traveler-viewer/signatures
// Create a new department transfer signature
router.post('/signatures', async (req: Request, res: Response) => {
  try {
    const validatedData = insertP2DepartmentTransferSignatureSchema.parse(req.body);
    
    // Verify the serialized item exists
    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, validatedData.serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Serialized item not found' });
    }

    // Create the signature record
    const [signature] = await db.insert(p2DepartmentTransferSignatures).values({
      ...validatedData,
      barcode: validatedData.barcode || serializedItem.barcode,
      partNumber: validatedData.partNumber || serializedItem.partNumber,
      ipAddress: req.ip || req.headers['x-forwarded-for']?.toString() || null,
      userAgent: req.headers['user-agent'] || null,
    }).returning();

    console.log(`[P2 Signature] Department transfer signature created: ${signature.id} for item ${serializedItem.barcode} from ${validatedData.fromDepartment} to ${validatedData.toDepartment}`);

    return res.status(201).json(signature);
  } catch (error: any) {
    console.error('Error creating department transfer signature:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid signature data', details: error.errors });
    }
    return res.status(500).json({ error: error.message || 'Failed to create signature' });
  }
});

// GET /api/p2-traveler-viewer/signatures/item/:serializedItemId
// Get all signatures for a serialized item
router.get('/signatures/item/:serializedItemId', async (req: Request, res: Response) => {
  try {
    const { serializedItemId } = req.params;

    const signatures = await db.query.p2DepartmentTransferSignatures.findMany({
      where: eq(p2DepartmentTransferSignatures.serializedItemId, serializedItemId),
      orderBy: [desc(p2DepartmentTransferSignatures.signedAt)],
    });

    return res.json(signatures);
  } catch (error: any) {
    console.error('Error fetching signatures:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch signatures' });
  }
});

// GET /api/p2-traveler-viewer/signatures/barcode/:barcode
// Get all signatures for an item by barcode
router.get('/signatures/barcode/:barcode', async (req: Request, res: Response) => {
  try {
    const { barcode } = req.params;

    const signatures = await db.query.p2DepartmentTransferSignatures.findMany({
      where: eq(p2DepartmentTransferSignatures.barcode, barcode),
      orderBy: [desc(p2DepartmentTransferSignatures.signedAt)],
    });

    return res.json(signatures);
  } catch (error: any) {
    console.error('Error fetching signatures by barcode:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch signatures' });
  }
});

// GET /api/p2-traveler-viewer/signatures/:id
// Get a single signature by ID
router.get('/signatures/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const signature = await db.query.p2DepartmentTransferSignatures.findFirst({
      where: eq(p2DepartmentTransferSignatures.id, id),
    });

    if (!signature) {
      return res.status(404).json({ error: 'Signature not found' });
    }

    return res.json(signature);
  } catch (error: any) {
    console.error('Error fetching signature:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch signature' });
  }
});

// GET /api/p2-traveler-viewer/signatures/department/:department
// Get all signatures from a specific department
router.get('/signatures/department/:department', async (req: Request, res: Response) => {
  try {
    const { department } = req.params;
    const { limit = 50 } = req.query;

    const signatures = await db.query.p2DepartmentTransferSignatures.findMany({
      where: eq(p2DepartmentTransferSignatures.fromDepartment, department),
      orderBy: [desc(p2DepartmentTransferSignatures.signedAt)],
      limit: Number(limit),
    });

    return res.json(signatures);
  } catch (error: any) {
    console.error('Error fetching signatures by department:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch signatures' });
  }
});

// GET /api/p2-traveler-viewer/signatures/employee/:employeeId
// Get all signatures by an employee
router.get('/signatures/employee/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { limit = 50 } = req.query;

    const signatures = await db.query.p2DepartmentTransferSignatures.findMany({
      where: eq(p2DepartmentTransferSignatures.signedByEmployeeId, Number(employeeId)),
      orderBy: [desc(p2DepartmentTransferSignatures.signedAt)],
      limit: Number(limit),
    });

    return res.json(signatures);
  } catch (error: any) {
    console.error('Error fetching signatures by employee:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch signatures' });
  }
});

// GET /api/p2-traveler-viewer/signatures/verify/:id
// Verify a signature exists and return verification details
router.get('/signatures/verify/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const signature = await db.query.p2DepartmentTransferSignatures.findFirst({
      where: eq(p2DepartmentTransferSignatures.id, id),
    });

    if (!signature) {
      return res.json({
        valid: false,
        error: 'Signature not found',
      });
    }

    // Get the serialized item for additional context
    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, signature.serializedItemId),
    });

    return res.json({
      valid: true,
      signatureId: signature.id,
      signedBy: signature.signedByName,
      signedAt: signature.signedAt,
      fromDepartment: signature.fromDepartment,
      toDepartment: signature.toDepartment,
      declarationAccepted: signature.declarationAccepted,
      itemBarcode: signature.barcode,
      itemPartNumber: signature.partNumber,
      itemCurrentStatus: serializedItem?.status || 'UNKNOWN',
    });
  } catch (error: any) {
    console.error('Error verifying signature:', error);
    return res.status(500).json({ error: error.message || 'Failed to verify signature' });
  }
});

export default router;
