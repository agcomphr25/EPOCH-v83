import { Router } from 'express';
import { db } from '../../db';
import {
  customerWatchRules,
  insertCustomerWatchRuleSchema,
  allOrders,
  customers,
  orderDepartmentTypes,
} from '../../schema';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

router.get('/customers/search', async (req, res) => {
  try {
    const allCustomers = await db.select().from(customers).limit(1000);
    res.json(allCustomers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
});

router.get('/departments/list', async (req, res) => {
  try {
    const departments = await db
      .select()
      .from(orderDepartmentTypes)
      .where(eq(orderDepartmentTypes.isActive, true))
      .orderBy(orderDepartmentTypes.sortOrder);

    res.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ message: 'Failed to fetch departments' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const rules = await db
      .select()
      .from(customerWatchRules)
      .where(eq(customerWatchRules.userId, userId))
      .orderBy(desc(customerWatchRules.createdAt));

    res.json(rules);
  } catch (error) {
    console.error('Error fetching watch rules:', error);
    res.status(500).json({ message: 'Failed to fetch watch rules' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await db
      .select()
      .from(customerWatchRules)
      .where(eq(customerWatchRules.id, parseInt(id)))
      .limit(1);

    if (rule.length === 0) {
      return res.status(404).json({ message: 'Watch rule not found' });
    }

    res.json(rule[0]);
  } catch (error) {
    console.error('Error fetching watch rule:', error);
    res.status(500).json({ message: 'Failed to fetch watch rule' });
  }
});

router.post('/', async (req, res) => {
  try {
    const validatedData = insertCustomerWatchRuleSchema.parse(req.body);

    const [newRule] = await db
      .insert(customerWatchRules)
      .values(validatedData)
      .returning();

    res.status(201).json(newRule);
  } catch (error: any) {
    console.error('Error creating watch rule:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({
        message: 'Invalid watch rule data',
        errors: error.errors,
      });
    }
    res.status(500).json({ message: 'Failed to create watch rule' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { customerId, customerName, departmentId, departmentName, label, isActive, userId } = req.body;

    const [existingRule] = await db
      .select()
      .from(customerWatchRules)
      .where(eq(customerWatchRules.id, parseInt(id)))
      .limit(1);

    if (!existingRule) {
      return res.status(404).json({ message: 'Watch rule not found' });
    }

    if (userId && existingRule.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized to update this watch rule' });
    }

    const updates: any = { updatedAt: new Date() };
    if (customerId !== undefined) updates.customerId = customerId;
    if (customerName !== undefined) updates.customerName = customerName;
    if (departmentId !== undefined) updates.departmentId = departmentId;
    if (departmentName !== undefined) updates.departmentName = departmentName;
    if (label !== undefined) updates.label = label;
    if (isActive !== undefined) updates.isActive = isActive;

    const [updatedRule] = await db
      .update(customerWatchRules)
      .set(updates)
      .where(eq(customerWatchRules.id, parseInt(id)))
      .returning();

    res.json(updatedRule);
  } catch (error) {
    console.error('Error updating watch rule:', error);
    res.status(500).json({ message: 'Failed to update watch rule' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [deletedRule] = await db
      .delete(customerWatchRules)
      .where(eq(customerWatchRules.id, parseInt(id)))
      .returning();

    if (!deletedRule) {
      return res.status(404).json({ message: 'Watch rule not found' });
    }

    res.json({ message: 'Watch rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting watch rule:', error);
    res.status(500).json({ message: 'Failed to delete watch rule' });
  }
});

router.get('/:id/orders', async (req, res) => {
  try {
    const { id } = req.params;

    const [rule] = await db
      .select()
      .from(customerWatchRules)
      .where(eq(customerWatchRules.id, parseInt(id)))
      .limit(1);

    if (!rule) {
      return res.status(404).json({ message: 'Watch rule not found' });
    }

    const conditions = [eq(allOrders.customerId, rule.customerId)];
    if (rule.departmentName) {
      conditions.push(eq(allOrders.currentDepartment, rule.departmentName));
    }

    const orders = await db
      .select()
      .from(allOrders)
      .where(and(...conditions))
      .orderBy(desc(allOrders.createdAt));

    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders for watch rule:', error);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

router.get('/:id/count', async (req, res) => {
  try {
    const { id } = req.params;

    const [rule] = await db
      .select()
      .from(customerWatchRules)
      .where(eq(customerWatchRules.id, parseInt(id)))
      .limit(1);

    if (!rule) {
      return res.status(404).json({ message: 'Watch rule not found' });
    }

    const conditions = [eq(allOrders.customerId, rule.customerId)];
    if (rule.departmentName) {
      conditions.push(eq(allOrders.currentDepartment, rule.departmentName));
    }

    const orders = await db
      .select()
      .from(allOrders)
      .where(and(...conditions));

    res.json({ count: orders.length });
  } catch (error) {
    console.error('Error fetching order count:', error);
    res.status(500).json({ message: 'Failed to fetch order count' });
  }
});

export default router;
