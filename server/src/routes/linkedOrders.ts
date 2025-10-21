import { Router } from 'express';
import { db } from '../../db';
import { linkedOrderGroups, linkedOrders, allOrders, insertLinkedOrderGroupSchema, insertLinkedOrderSchema } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const linkedOrder = await db
      .select()
      .from(linkedOrders)
      .where(eq(linkedOrders.orderId, orderId))
      .limit(1);

    if (linkedOrder.length === 0) {
      return res.json({ linked: false, linkGroup: null });
    }

    const linkGroup = await db
      .select()
      .from(linkedOrderGroups)
      .where(eq(linkedOrderGroups.id, linkedOrder[0].linkGroupId))
      .limit(1);

    const groupOrders = await db
      .select()
      .from(linkedOrders)
      .where(eq(linkedOrders.linkGroupId, linkedOrder[0].linkGroupId));

    // Remove approval code from response for security
    const { approvalCode, ...safeLinkGroup } = linkGroup[0];

    return res.json({
      linked: true,
      linkGroup: safeLinkGroup,
      orders: groupOrders,
    });
  } catch (error) {
    console.error('Error fetching linked order info:', error);
    return res.status(500).json({ error: 'Failed to fetch linked order info' });
  }
});

router.get('/group/:groupId', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);

    const linkGroup = await db
      .select()
      .from(linkedOrderGroups)
      .where(eq(linkedOrderGroups.id, groupId))
      .limit(1);

    if (linkGroup.length === 0) {
      return res.status(404).json({ error: 'Link group not found' });
    }

    const groupOrders = await db
      .select({
        linkedOrder: linkedOrders,
        order: allOrders,
      })
      .from(linkedOrders)
      .leftJoin(allOrders, eq(linkedOrders.orderId, allOrders.orderId))
      .where(eq(linkedOrders.linkGroupId, groupId));

    // Remove approval code from response for security
    const { approvalCode, ...safeLinkGroup } = linkGroup[0];

    return res.json({
      linkGroup: safeLinkGroup,
      orders: groupOrders,
    });
  } catch (error) {
    console.error('Error fetching link group:', error);
    return res.status(500).json({ error: 'Failed to fetch link group' });
  }
});

router.post('/groups', async (req, res) => {
  try {
    const validatedData = insertLinkedOrderGroupSchema.parse(req.body);

    const [newGroup] = await db
      .insert(linkedOrderGroups)
      .values(validatedData)
      .returning();

    // Remove approval code from response for security
    const { approvalCode, ...safeGroup } = newGroup;

    return res.json(safeGroup);
  } catch (error) {
    console.error('Error creating link group:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to create link group' });
  }
});

router.post('/groups/:groupId/orders', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const existingLink = await db
      .select()
      .from(linkedOrders)
      .where(eq(linkedOrders.orderId, orderId))
      .limit(1);

    if (existingLink.length > 0) {
      return res.status(400).json({ 
        error: 'Order is already linked to another group',
        linkGroupId: existingLink[0].linkGroupId 
      });
    }

    const validatedData = insertLinkedOrderSchema.parse({
      linkGroupId: groupId,
      orderId,
    });

    const [linkedOrder] = await db
      .insert(linkedOrders)
      .values(validatedData)
      .returning();

    return res.json(linkedOrder);
  } catch (error) {
    console.error('Error adding order to link group:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to add order to link group' });
  }
});

router.delete('/groups/:groupId/orders/:orderId', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const { orderId } = req.params;
    const { approvalCode } = req.body;

    const linkGroup = await db
      .select()
      .from(linkedOrderGroups)
      .where(eq(linkedOrderGroups.id, groupId))
      .limit(1);

    if (linkGroup.length === 0) {
      return res.status(404).json({ error: 'Link group not found' });
    }

    if (linkGroup[0].requiresApprovalToSeparate && linkGroup[0].approvalCode) {
      if (!approvalCode || approvalCode !== linkGroup[0].approvalCode) {
        return res.status(403).json({ 
          error: 'Invalid approval code',
          requiresApproval: true 
        });
      }
    }

    await db
      .delete(linkedOrders)
      .where(
        and(
          eq(linkedOrders.linkGroupId, groupId),
          eq(linkedOrders.orderId, orderId)
        )
      );

    const remainingOrders = await db
      .select()
      .from(linkedOrders)
      .where(eq(linkedOrders.linkGroupId, groupId));

    if (remainingOrders.length === 0) {
      await db
        .delete(linkedOrderGroups)
        .where(eq(linkedOrderGroups.id, groupId));
    }

    return res.json({ 
      success: true,
      message: 'Order removed from link group',
      groupDeleted: remainingOrders.length === 0
    });
  } catch (error) {
    console.error('Error removing order from link group:', error);
    return res.status(500).json({ error: 'Failed to remove order from link group' });
  }
});

router.delete('/groups/:groupId', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const { approvalCode } = req.body;

    const linkGroup = await db
      .select()
      .from(linkedOrderGroups)
      .where(eq(linkedOrderGroups.id, groupId))
      .limit(1);

    if (linkGroup.length === 0) {
      return res.status(404).json({ error: 'Link group not found' });
    }

    if (linkGroup[0].requiresApprovalToSeparate && linkGroup[0].approvalCode) {
      if (!approvalCode || approvalCode !== linkGroup[0].approvalCode) {
        return res.status(403).json({ 
          error: 'Invalid approval code',
          requiresApproval: true 
        });
      }
    }

    await db
      .delete(linkedOrderGroups)
      .where(eq(linkedOrderGroups.id, groupId));

    return res.json({ 
      success: true,
      message: 'Link group deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting link group:', error);
    return res.status(500).json({ error: 'Failed to delete link group' });
  }
});

export default router;
