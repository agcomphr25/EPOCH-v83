import express from 'express';
import { db } from '../../db';
import { employeeBadgeActions, employees, insertEmployeeBadgeActionSchema, badgeScanAuditLog } from '../../schema';
import { eq, and } from 'drizzle-orm';
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

// Badge-specific execution endpoint with validation, execution, and audit logging
router.post('/execute-badge-action', async (req, res) => {
  const { employeeId, employeeCode, actionType, actionConfig, targetBarcode } = req.body;

  try {
    // Step 1: Validate the target exists based on action type
    if (actionType === 'P1_DEPARTMENT_PROGRESS' || actionType === 'P2_DEPARTMENT_PROGRESS') {
      if (!targetBarcode) {
        await logBadgeScan(employeeId, employeeCode, actionType, { targetBarcode }, 'validation_failed', 'No target barcode provided');
        return res.status(400).json({ error: 'Target barcode is required for department progression' });
      }

      // Validate P1 order exists
      if (actionType === 'P1_DEPARTMENT_PROGRESS') {
        const { allOrders } = await import('../../schema');
        const order = await db
          .select()
          .from(allOrders)
          .where(eq(allOrders.orderId, targetBarcode))
          .limit(1);

        if (!order.length) {
          await logBadgeScan(employeeId, employeeCode, actionType, { targetBarcode, actionConfig }, 'validation_failed', `Order ${targetBarcode} not found`);
          return res.status(404).json({ error: `Order ${targetBarcode} not found` });
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
          const { allOrders } = await import('../../schema');
          const updatedOrders = await db
            .update(allOrders)
            .set({ currentDepartment: actionConfig.toDepartment })
            .where(eq(allOrders.orderId, targetBarcode))
            .returning();
          
          if (!updatedOrders.length) {
            throw new Error(`Failed to update order ${targetBarcode} - order may have been deleted`);
          }
          executionResult = { success: true, message: 'Order department updated' };
          break;
        }

        case 'P2_DEPARTMENT_PROGRESS': {
          const { p2SerializedItems } = await import('../../schema');
          const updatedItems = await db
            .update(p2SerializedItems)
            .set({ currentDepartment: actionConfig.departmentName })
            .where(eq(p2SerializedItems.barcode, targetBarcode))
            .returning();
          
          if (!updatedItems.length) {
            throw new Error(`Failed to update P2 item ${targetBarcode} - item may have been deleted`);
          }
          executionResult = { success: true, message: 'P2 item department updated' };
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
