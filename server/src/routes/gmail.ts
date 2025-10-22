import { Router, type Request, type Response } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { listMessages, getMessage, searchMessages, sendEmail } from '../lib/gmail';

const router = Router();

router.get('/messages', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const maxResults = parseInt(req.query.maxResults as string) || 20;
    const pageToken = req.query.pageToken as string;

    const messages = await listMessages(userId, maxResults, pageToken);
    res.json(messages);
  } catch (error: any) {
    console.error('Error fetching Gmail messages:', error);
    
    if (error.needsReauth) {
      return res.status(409).json({ 
        error: error.message,
        needsReauth: true
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to fetch messages',
      needsConnection: error.message?.includes('not connected')
    });
  }
});

router.get('/messages/:messageId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { messageId } = req.params;

    const message = await getMessage(userId, messageId);
    res.json(message);
  } catch (error: any) {
    console.error('Error fetching Gmail message:', error);
    
    if (error.needsReauth) {
      return res.status(409).json({ 
        error: error.message,
        needsReauth: true
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to fetch message',
      needsConnection: error.message?.includes('not connected')
    });
  }
});

router.get('/search', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const query = req.query.q as string;
    const maxResults = parseInt(req.query.maxResults as string) || 20;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const messages = await searchMessages(userId, query, maxResults);
    res.json(messages);
  } catch (error: any) {
    console.error('Error searching Gmail messages:', error);
    
    if (error.needsReauth) {
      return res.status(409).json({ 
        error: error.message,
        needsReauth: true
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to search messages',
      needsConnection: error.message?.includes('not connected')
    });
  }
});

router.post('/send', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { to, subject, body, threadId } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
    }

    const result = await sendEmail(userId, to, subject, body, threadId);
    res.json(result);
  } catch (error: any) {
    console.error('Error sending email:', error);
    
    if (error.needsReauth) {
      return res.status(409).json({ 
        error: error.message,
        needsReauth: true
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to send email',
      needsConnection: error.message?.includes('not connected')
    });
  }
});

export default router;
