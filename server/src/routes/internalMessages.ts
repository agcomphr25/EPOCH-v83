import { Router } from 'express';
import { z } from 'zod';

import { storage } from '../../storage';
import { insertInternalMessageSchema } from '../../schema';

const router = Router();

// Get all messages (filtered by user)
router.get('/', async (req, res) => {
  try {
    const { sentBy, sentTo } = req.query;

    if (sentBy) {
      const messages = await storage.getMessagesBySender(
        parseInt(sentBy as string)
      );
      res.json(messages);
    } else if (sentTo) {
      const messages = await storage.getMessagesForUser(
        parseInt(sentTo as string)
      );
      res.json(messages);
    } else {
      const messages = await storage.getAllInternalMessages();
      res.json(messages);
    }
  } catch (error) {
    console.error('Get internal messages error:', error);
    res.status(500).json({ error: 'Failed to retrieve internal messages' });
  }
});

// Get messages for a specific department
router.get('/department/:departmentId', async (req, res) => {
  try {
    const departmentId = parseInt(req.params.departmentId);
    const messages = await storage.getMessagesForDepartment(departmentId);
    res.json(messages);
  } catch (error) {
    console.error('Get department messages error:', error);
    res.status(500).json({ error: 'Failed to retrieve department messages' });
  }
});

// Get unread message count for a user (must be before /:id route)
router.get('/unread/count/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const messages = await storage.getMessagesForUser(userId);

    // Count unread messages for this user
    let unreadCount = 0;
    for (const message of messages) {
      if (message.recipients && message.recipients.length > 0) {
        const userRecipient = message.recipients.find(
          (r) => r.userId === userId
        );
        if (userRecipient && !userRecipient.isRead) {
          unreadCount++;
        }
      }
    }

    res.json({
      userId,
      unreadCount,
      hasUnread: unreadCount > 0,
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread message count' });
  }
});

// Get a single message by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const message = await storage.getInternalMessage(id);
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    res.json(message);
  } catch (error) {
    console.error('Get internal message error:', error);
    res.status(500).json({ error: 'Failed to retrieve message' });
  }
});

// Create a new internal message
router.post('/', async (req, res) => {
  try {
    console.log('📨 Received message data:', JSON.stringify(req.body, null, 2));
    const messageData = insertInternalMessageSchema.parse(req.body);
    console.log(
      '✅ Message data validated:',
      JSON.stringify(messageData, null, 2)
    );
    const message = await storage.createInternalMessage(messageData);
    console.log('💾 Message created with ID:', message.id);

    if (
      messageData.recipientType === 'department' &&
      messageData.recipientDepartmentId
    ) {
      const allUsers = await storage.getAllUsers();
      const departmentUsers = allUsers.filter((user) => user.isActive);

      for (const user of departmentUsers) {
        await storage.createMessageRecipient({
          messageId: message.id,
          userId: user.id,
          isRead: false,
          isAccomplished: false,
        });
      }
    } else if (
      messageData.recipientType === 'person' &&
      messageData.recipientUserId
    ) {
      await storage.createMessageRecipient({
        messageId: message.id,
        userId: messageData.recipientUserId,
        isRead: false,
        isAccomplished: false,
      });
    }

    const fullMessage = await storage.getInternalMessage(message.id);
    res.status(201).json(fullMessage);
  } catch (error) {
    console.error('Create internal message error:', error);
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: 'Invalid message data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to create message' });
    }
  }
});

// Mark a message as read
router.patch('/:id/read', async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    await storage.markMessageAsRead(messageId, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark message as read error:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// Mark a message as accomplished
router.patch('/:id/accomplished', async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    await storage.markMessageAsAccomplished(messageId, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark message as accomplished error:', error);
    res.status(500).json({ error: 'Failed to mark message as accomplished' });
  }
});

export default router;
