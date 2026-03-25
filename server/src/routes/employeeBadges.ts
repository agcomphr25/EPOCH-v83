import express from 'express';
import { db } from '../../db';
import { employeeBadgeActions, employees, insertEmployeeBadgeActionSchema, badgeScanAuditLog } from '../../schema';
import { eq, and, or, like } from 'drizzle-orm';
import { z } from 'zod';

// Whitelist of allowed navigation pages
const ALLOWED_NAVIGATION_PAGES = [
  '/dashboard',
  '/orders',
  '/production-queue',
  '/department-manager',
  '/p2-department-manager',
  '/layup-schedule',
  '/cutting-table',
  '/shipping-qc',
  '/inventory',
  '/customers',
  '/employees',
  '/employee-portal',
  '/badge-scanner',
];

// Action config validation schemas
const p1DepartmentProgressConfigSchema = z.object({
  fromDepartment: z.string().min(1),
  toDepartment: z.string().min(1),
});

const p2DepartmentProgressConfigSchema = z.object({
  departmentName: z.string().min(1),
});

const quickNavigationConfigSchema = z.object({
  targetPage: z.string().min(1).refine(
    (page) => ALLOWED_NAVIGATION_PAGES.includes(page),
    { message: 'Target page must be from the approved list' }
  ),
});

const clockInOutConfigSchema = z.object({
  autoDetect: z.boolean().default(true),
});

// Validate action config based on type
function validateActionConfig(actionType: string, actionConfig: any) {
  switch (actionType) {
    case 'P1_DEPARTMENT_PROGRESS':
      return p1DepartmentProgressConfigSchema.parse(actionConfig);
    case 'P2_DEPARTMENT_PROGRESS':
      return p2DepartmentProgressConfigSchema.parse(actionConfig);
    case 'QUICK_NAVIGATION':
      return quickNavigationConfigSchema.parse(actionConfig);
    case 'CLOCK_IN_OUT':
      return clockInOutConfigSchema.parse(actionConfig);
    default:
      throw new Error(`Unsupported action type: ${actionType}`);
  }
}

// Log badge scan audit event
async function logBadgeScan(
  employeeId: number | null,
  employeeCode: string,
  actionType: string,
  actionPayload: any,
  outcome: 'success' | 'error' | 'validation_failed',
  errorMessage?: string
) {
  try {
    await db.insert(badgeScanAuditLog).values({
      employeeId,
      employeeCode,
      actionType,
      actionPayload,
      outcome,
      errorMessage,
    });
  } catch (err) {
    console.error('Failed to log badge scan:', err);
    // Don't throw - audit logging failure shouldn't break the main workflow
  }
}

const router = express.Router();

router.get('/employee-badge-actions', async (req, res) => {
  try {
    const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
    
    let query = db
      .select({
        badgeAction: employeeBadgeActions,
        employee: {
          id: employees.id,
          name: employees.name,
          employeeCode: employees.employeeCode,
        },
      })
      .from(employeeBadgeActions)
      .leftJoin(employees, eq(employeeBadgeActions.employeeId, employees.id));

    if (employeeId) {
      query = query.where(eq(employeeBadgeActions.employeeId, employeeId)) as any;
    }

    const results = await query;
    res.json(results);
  } catch (error) {
    console.error('Error fetching badge actions:', error);
    res.status(500).json({ error: 'Failed to fetch badge actions' });
  }
});

router.post('/employee-badge-actions', async (req, res) => {
  try {
    const validatedData = insertEmployeeBadgeActionSchema.parse(req.body);
    
    // Validate action config structure
    try {
      validateActionConfig(validatedData.actionType, validatedData.actionConfig);
    } catch (configError: any) {
      return res.status(400).json({ 
        error: 'Invalid action configuration', 
        details: configError.message 
      });
    }
    
    const existingAction = await db
      .select()
      .from(employeeBadgeActions)
      .where(
        and(
          eq(employeeBadgeActions.employeeId, validatedData.employeeId),
          eq(employeeBadgeActions.isActive, true)
        )
      );

    if (existingAction.length > 0) {
      await db
        .update(employeeBadgeActions)
        .set({ isActive: false })
        .where(eq(employeeBadgeActions.employeeId, validatedData.employeeId));
    }

    const [newAction] = await db
      .insert(employeeBadgeActions)
      .values(validatedData)
      .returning();

    res.json(newAction);
  } catch (error: any) {
    console.error('Error creating badge action:', error);
    res.status(400).json({ error: error.message || 'Failed to create badge action' });
  }
});

router.put('/employee-badge-actions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = insertEmployeeBadgeActionSchema.parse(req.body);

    // Validate action config structure
    try {
      validateActionConfig(validatedData.actionType, validatedData.actionConfig);
    } catch (configError: any) {
      return res.status(400).json({ 
        error: 'Invalid action configuration', 
        details: configError.message 
      });
    }

    const [updated] = await db
      .update(employeeBadgeActions)
      .set(validatedData)
      .where(eq(employeeBadgeActions.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Badge action not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating badge action:', error);
    res.status(400).json({ error: error.message || 'Failed to update badge action' });
  }
});

router.delete('/employee-badge-actions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db
      .delete(employeeBadgeActions)
      .where(eq(employeeBadgeActions.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting badge action:', error);
    res.status(500).json({ error: 'Failed to delete badge action' });
  }
});

router.get('/employee-badge-actions/by-employee/:employeeCode', async (req, res) => {
  try {
    const { employeeCode } = req.params;

    const employee = await db
      .select()
      .from(employees)
      .where(eq(employees.employeeCode, employeeCode))
      .limit(1);

    if (!employee.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const actions = await db
      .select()
      .from(employeeBadgeActions)
      .where(
        and(
          eq(employeeBadgeActions.employeeId, employee[0].id),
          eq(employeeBadgeActions.isActive, true)
        )
      );

    res.json({
      employee: employee[0],
      action: actions[0] || null,
    });
  } catch (error) {
    console.error('Error fetching employee badge action:', error);
    res.status(500).json({ error: 'Failed to fetch employee badge action' });
  }
});

// Resolve a badge scan code to an employee name and details
router.get('/resolve-badge/:scanCode', async (req, res) => {
  try {
    const { scanCode } = req.params;

    if (!scanCode || scanCode.trim().length === 0) {
      return res.status(400).json({ error: 'Badge scan code is required' });
    }

    const employee = await db
      .select({
        id: employees.id,
        name: employees.name,
        employeeCode: employees.employeeCode,
        department: employees.department,
        jobTitle: employees.jobTitle,
        isActive: employees.isActive,
      })
      .from(employees)
      .where(eq(employees.badgeScanCode, scanCode.trim()))
      .limit(1);

    if (!employee.length) {
      return res.status(404).json({ error: 'Badge not recognized' });
    }

    if (!employee[0].isActive) {
      return res.status(403).json({ error: 'Employee account is inactive' });
    }

    const emp = employee[0];
    res.json({
      id: emp.id,
      name: emp.name,
      fullName: emp.name,
      employeeCode: emp.employeeCode,
      department: emp.department,
      jobTitle: emp.jobTitle,
    });
  } catch (error) {
    console.error('Error resolving badge:', error);
    res.status(500).json({ error: 'Failed to resolve badge' });
  }
});

// Badge-specific execution endpoint with validation, execution, and audit logging
router.post('/execute-badge-action', async (req, res) => {
  const { employeeId, employeeCode, actionType, actionConfig, targetBarcode: rawTargetBarcode } = req.body;
  
  // Normalize barcode to uppercase for case-insensitive matching
  const targetBarcode = rawTargetBarcode?.toUpperCase();

  try {
    // Step 1: Validate the target exists based on action type
    if (actionType === 'P1_DEPARTMENT_PROGRESS' || actionType === 'P2_DEPARTMENT_PROGRESS') {
      if (!targetBarcode) {
        await logBadgeScan(employeeId, employeeCode, actionType, { targetBarcode: rawTargetBarcode }, 'validation_failed', 'No target barcode provided');
        return res.status(400).json({ error: 'Target barcode is required for department progression' });
      }

      // Validate P1 order exists (case-insensitive - barcodes normalized to uppercase)
      if (actionType === 'P1_DEPARTMENT_PROGRESS') {
        const { allOrders, productionOrders } = await import('../../schema');
        const order = await db
          .select()
          .from(allOrders)
          .where(or(eq(allOrders.orderId, targetBarcode), eq(allOrders.fbOrderNumber, targetBarcode)))
          .limit(1);

        if (!order.length) {
          // Also check production_orders by poNumber (for PO barcode scans like "FB307")
          const poOrders = await db
            .select()
            .from(productionOrders)
            .where(or(eq(productionOrders.poNumber, targetBarcode), eq(productionOrders.orderId, targetBarcode)))
            .limit(1);

          if (!poOrders.length) {
            await logBadgeScan(employeeId, employeeCode, actionType, { targetBarcode, actionConfig }, 'validation_failed', `Order ${targetBarcode} not found`);
            return res.status(404).json({ error: `Order ${targetBarcode} not found` });
          }
        }
      }

      // Validate P2 item exists
      if (actionType === 'P2_DEPARTMENT_PROGRESS') {
        const { p2SerializedItems } = await import('../../schema');
        const item = await db
          .select()
          .from(p2SerializedItems)
          .where(eq(p2SerializedItems.barcode, targetBarcode))
          .limit(1);

        if (!item.length) {
          await logBadgeScan(employeeId, employeeCode, actionType, { targetBarcode, actionConfig }, 'validation_failed', `P2 item ${targetBarcode} not found`);
          return res.status(404).json({ error: `P2 item ${targetBarcode} not found` });
        }
      }
    }

    // Step 2: Execute the action and log the outcome
    let executionResult;
    try {
      switch (actionType) {
        case 'P1_DEPARTMENT_PROGRESS': {
          const { allOrders, productionOrders } = await import('../../schema');
          
          // First fetch the order to get current state (match by orderId or fbOrderNumber)
          const existingOrder = await db
            .select()
            .from(allOrders)
            .where(or(eq(allOrders.orderId, targetBarcode), eq(allOrders.fbOrderNumber, targetBarcode)))
            .limit(1);
          
          if (existingOrder.length) {
            // Standard sales order path
            const order = existingOrder[0];
            const fromDepartment = order.currentDepartment;
            const toDepartment = actionConfig.toDepartment;
            const currentTimestamp = new Date();
            
            // Skip no-op moves
            if (fromDepartment === toDepartment) {
              executionResult = { success: true, message: `Order already in ${toDepartment}` };
              break;
            }
            
            // Build department history entry
            const existingHistory = (order as any).departmentHistory || [];
            const departmentHistory = Array.isArray(existingHistory) ? [...existingHistory] : [];
            departmentHistory.push({
              fromDepartment,
              toDepartment,
              timestamp: currentTimestamp.toISOString(),
              progressedBy: employeeCode,
              scanMethod: 'badge',
            });
            
            // Build update data with department history and completion timestamps
            const updateData: any = {
              currentDepartment: toDepartment,
              updatedAt: currentTimestamp,
              departmentHistory,
            };
            
            // Set completion timestamp for the department being left
            if (fromDepartment === 'Barcode') {
              updateData.barcodeCompletedAt = currentTimestamp;
            } else if (fromDepartment === 'Layup' || fromDepartment === 'Layup/Plugging') {
              updateData.layupCompletedAt = currentTimestamp;
            } else if (fromDepartment === 'CNC') {
              updateData.cncCompletedAt = currentTimestamp;
            } else if (fromDepartment === 'Finish' || fromDepartment === 'Finish Queue') {
              updateData.finishCompletedAt = currentTimestamp;
            } else if (fromDepartment === 'Finish QC') {
              updateData.finishCompletedAt = currentTimestamp;
            } else if (fromDepartment === 'Gunsmith') {
              updateData.gunsmithCompletedAt = currentTimestamp;
            } else if (fromDepartment === 'Paint') {
              updateData.paintCompletedAt = currentTimestamp;
            } else if (fromDepartment === 'QC' || fromDepartment === 'QC Shipping Queue') {
              updateData.qcCompletedAt = currentTimestamp;
            } else if (fromDepartment === 'Shipping' || fromDepartment === 'Shipping Management') {
              updateData.shippingCompletedAt = currentTimestamp;
            }
            
            const updatedOrders = await db
              .update(allOrders)
              .set(updateData)
              .where(or(eq(allOrders.orderId, targetBarcode), eq(allOrders.fbOrderNumber, targetBarcode)))
              .returning();
            
            if (!updatedOrders.length) {
              throw new Error(`Failed to update order ${targetBarcode} - order may have been deleted`);
            }
            
            console.log(`✅ Badge scan progressed ${targetBarcode} from ${fromDepartment} to ${toDepartment}`);
            executionResult = { success: true, message: `Order progressed from ${fromDepartment} to ${toDepartment}` };
          } else {
            // PO barcode path — look up production_orders by poNumber or orderId
            const toDepartment = actionConfig.toDepartment;
            const currentTimestamp = new Date();
            
            // Find PO units by barcode only (no currentDepartment filter)
            const poMatches = await db
              .select()
              .from(productionOrders)
              .where(
                or(eq(productionOrders.poNumber, targetBarcode), eq(productionOrders.orderId, targetBarcode))
              );
            
            if (!poMatches.length) {
              throw new Error(`No units of order ${targetBarcode} found`);
            }

            // Helper: build completion timestamp fields based on the department being left
            const completionFields = (dept: string): Record<string, Date> => {
              if (dept === 'Barcode') return { barcodeCompletedAt: currentTimestamp };
              if (dept === 'Layup' || dept === 'Layup/Plugging') return { layupCompletedAt: currentTimestamp };
              if (dept === 'CNC') return { cncCompletedAt: currentTimestamp };
              if (dept === 'Finish' || dept === 'Finish Queue') return { finishCompletedAt: currentTimestamp };
              if (dept === 'Finish QC') return { finishCompletedAt: currentTimestamp };
              if (dept === 'Gunsmith') return { gunsmithCompletedAt: currentTimestamp };
              if (dept === 'Paint') return { paintCompletedAt: currentTimestamp };
              if (dept === 'QC' || dept === 'QC Shipping Queue') return { qcCompletedAt: currentTimestamp };
              if (dept === 'Shipping' || dept === 'Shipping Management') return { shippingCompletedAt: currentTimestamp };
              return {};
            };

            let progressedCount = 0;
            // Track unique (poNumber, fromDepartment) pairs for allOrders sync (avoid duplicate updates)
            const allOrdersSyncKeys = new Map<string, string>(); // key: "poNumber|fromDept" -> fromDepartment

            // Update each matched production_order row using its own actual currentDepartment
            for (const poOrder of poMatches) {
              const rowFromDepartment = poOrder.currentDepartment;

              // Skip no-op: this unit is already in the target department
              if (rowFromDepartment === toDepartment) continue;

              const existingHistory = (poOrder as any).departmentHistory || [];
              const departmentHistory = Array.isArray(existingHistory) ? [...existingHistory] : [];
              departmentHistory.push({
                fromDepartment: rowFromDepartment,
                toDepartment,
                timestamp: currentTimestamp.toISOString(),
                progressedBy: employeeCode,
                scanMethod: 'badge',
              });

              await db
                .update(productionOrders)
                .set({
                  currentDepartment: toDepartment,
                  updatedAt: currentTimestamp,
                  ...completionFields(rowFromDepartment),
                  departmentHistory,
                })
                .where(eq(productionOrders.id, poOrder.id));

              // Record this (poNumber, fromDepartment) pair for later allOrders sync
              const syncKey = `${poOrder.poNumber}|${rowFromDepartment}`;
              allOrdersSyncKeys.set(syncKey, rowFromDepartment);

              progressedCount++;
            }

            // Sync corresponding all_orders rows once per unique (poNumber, fromDepartment) pair
            for (const [syncKey, rowFromDepartment] of allOrdersSyncKeys) {
              const poNumber = syncKey.split('|')[0];
              const correspondingAllOrders = await db
                .select()
                .from(allOrders)
                .where(
                  and(
                    like(allOrders.orderId, `PO-${poNumber}-%`),
                    eq(allOrders.currentDepartment, rowFromDepartment)
                  )
                );

              for (const aoOrder of correspondingAllOrders) {
                const aoExistingHistory = (aoOrder as any).departmentHistory || [];
                const aoDepartmentHistory = Array.isArray(aoExistingHistory) ? [...aoExistingHistory] : [];
                aoDepartmentHistory.push({
                  fromDepartment: rowFromDepartment,
                  toDepartment,
                  timestamp: currentTimestamp.toISOString(),
                  progressedBy: employeeCode,
                  scanMethod: 'badge',
                });

                await db
                  .update(allOrders)
                  .set({
                    currentDepartment: toDepartment,
                    updatedAt: currentTimestamp,
                    ...completionFields(rowFromDepartment),
                    departmentHistory: aoDepartmentHistory,
                  })
                  .where(eq(allOrders.id, aoOrder.id));
              }
            }

            if (progressedCount === 0) {
              executionResult = { success: true, message: `All units of order ${targetBarcode} already in ${toDepartment}` };
            } else {
              console.log(`✅ Badge scan progressed PO ${targetBarcode} (${progressedCount} production orders) to ${toDepartment}`);
              executionResult = { success: true, message: `PO order progressed to ${toDepartment} (${progressedCount} units)` };
            }
          }
          break;
        }

        case 'P2_DEPARTMENT_PROGRESS': {
          const { p2SerializedItems, p2PurchaseOrderItems, p2PurchaseOrders } = await import('../../schema');
          
          // Get current item to check for tolerance gate
          const currentItem = await db
            .select()
            .from(p2SerializedItems)
            .where(eq(p2SerializedItems.barcode, targetBarcode))
            .limit(1);
          
          if (!currentItem.length) {
            throw new Error(`P2 item ${targetBarcode} not found`);
          }
          
          const item = currentItem[0];
          const fromDepartment = item.currentDepartment;
          const toDepartment = actionConfig.departmentName;
          
          // TOLERANCE GATE ENFORCEMENT: If progressing FROM Final QC, check for failed inspections
          if (fromDepartment === 'Final QC') {
            const itemMetadata = item.metadata as any;
            const hasFinalQCFailures = itemMetadata?.finalQcFailures?.length > 0 || 
                                        itemMetadata?.hasToleranceDeviation === true;
            
            if (hasFinalQCFailures) {
              // Check if tolerance authorization has been recorded
              const hasToleranceAuthorization = itemMetadata?.toleranceDeviationApproved === true;
              
              if (!hasToleranceAuthorization) {
                // Check PO for tolerance authorizer
                if (item.poItemId) {
                  const poItem = await db.query.p2PurchaseOrderItems.findFirst({
                    where: eq(p2PurchaseOrderItems.id, item.poItemId),
                  });
                  
                  if (poItem) {
                    const po = await db.query.p2PurchaseOrders.findFirst({
                      where: eq(p2PurchaseOrders.id, poItem.poId),
                    });
                    
                    if (!(po as any)?.toleranceAuthorizerId) {
                      throw new Error('Tolerance authorization required for items with QC failures. Please use the Tolerance Gate approval workflow.');
                    }
                  }
                } else {
                  throw new Error('Tolerance authorization required for items with QC failures. Please use the Tolerance Gate approval workflow.');
                }
              }
            }
          }
          
          const updatedItems = await db
            .update(p2SerializedItems)
            .set({ currentDepartment: toDepartment })
            .where(eq(p2SerializedItems.barcode, targetBarcode))
            .returning();
          
          if (!updatedItems.length) {
            throw new Error(`Failed to update P2 item ${targetBarcode} - item may have been deleted`);
          }
          executionResult = { success: true, message: `P2 item advanced from ${fromDepartment} to ${toDepartment}` };
          break;
        }

        case 'CLOCK_IN_OUT': {
          // Execute clock in/out
          const { timeClockEntries } = await import('../../schema');
          const { isNull } = await import('drizzle-orm');
          
          const existingClockIn = await db
            .select()
            .from(timeClockEntries)
            .where(
              and(
                eq(timeClockEntries.employeeId, String(employeeId)),
                isNull(timeClockEntries.clockOut)
              )
            )
            .limit(1);

          if (existingClockIn.length > 0) {
            // Clock out - verify the row still has null clockOut to prevent double-clocking
            const updated = await db
              .update(timeClockEntries)
              .set({ clockOut: new Date() })
              .where(
                and(
                  eq(timeClockEntries.id, existingClockIn[0].id),
                  isNull(timeClockEntries.clockOut) // Prevent race condition
                )
              )
              .returning();
            
            if (!updated.length) {
              throw new Error('Clock out failed - employee may have already clocked out');
            }
            executionResult = { success: true, message: 'Clocked out successfully' };
          } else {
            // Clock in
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            await db.insert(timeClockEntries).values({
              employeeId: String(employeeId),
              date: today,
              clockIn: new Date(),
            });
            executionResult = { success: true, message: 'Clocked in successfully' };
          }
          break;
        }

        case 'QUICK_NAVIGATION':
          // Navigation is handled client-side, just log success
          executionResult = { success: true, message: 'Navigation action logged' };
          break;

        default:
          throw new Error('Unsupported action type');
      }

      // Log successful execution
      await logBadgeScan(employeeId, employeeCode, actionType, { targetBarcode, actionConfig }, 'success');
      res.json(executionResult);
    } catch (execError: any) {
      // Log execution failure
      await logBadgeScan(employeeId, employeeCode, actionType, { targetBarcode, actionConfig }, 'error', execError.message);
      throw execError;
    }
  } catch (error: any) {
    console.error('Error executing badge action:', error);
    res.status(500).json({ error: error.message || 'Failed to execute badge action' });
  }
});

export default router;
