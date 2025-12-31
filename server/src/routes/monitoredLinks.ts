import { Router } from 'express';
import { db } from '../../db';
import { monitoredLinks, insertMonitoredLinkSchema } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const links = await db.select().from(monitoredLinks).orderBy(monitoredLinks.name);
    res.json(links);
  } catch (error) {
    console.error('Error fetching monitored links:', error);
    res.status(500).json({ message: 'Failed to fetch monitored links' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [link] = await db.select().from(monitoredLinks).where(eq(monitoredLinks.id, parseInt(id)));
    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }
    res.json(link);
  } catch (error) {
    console.error('Error fetching monitored link:', error);
    res.status(500).json({ message: 'Failed to fetch monitored link' });
  }
});

router.post('/', async (req, res) => {
  try {
    const validatedData = insertMonitoredLinkSchema.parse(req.body);
    const [link] = await db.insert(monitoredLinks).values(validatedData).returning();
    res.json(link);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Error creating monitored link:', error);
    res.status(500).json({ message: 'Failed to create monitored link' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const [link] = await db.update(monitoredLinks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(monitoredLinks.id, parseInt(id)))
      .returning();
    
    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }
    res.json(link);
  } catch (error) {
    console.error('Error updating monitored link:', error);
    res.status(500).json({ message: 'Failed to update monitored link' });
  }
});

router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { isEnabled } = req.body;
    
    const [link] = await db.update(monitoredLinks)
      .set({ isEnabled, updatedAt: new Date() })
      .where(eq(monitoredLinks.id, parseInt(id)))
      .returning();
    
    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }
    res.json(link);
  } catch (error) {
    console.error('Error toggling monitored link:', error);
    res.status(500).json({ message: 'Failed to toggle monitored link' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(monitoredLinks).where(eq(monitoredLinks.id, parseInt(id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting monitored link:', error);
    res.status(500).json({ message: 'Failed to delete monitored link' });
  }
});

function getFullUrl(link: { url: string; linkType: string }): string {
  if (link.linkType === 'internal' && link.url.startsWith('/')) {
    const port = process.env.PORT || 5000;
    return `http://localhost:${port}${link.url}`;
  }
  return link.url;
}

router.post('/:id/check', async (req, res) => {
  try {
    const { id } = req.params;
    const [link] = await db.select().from(monitoredLinks).where(eq(monitoredLinks.id, parseInt(id)));
    
    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }
    
    const startTime = Date.now();
    let status: number | null = null;
    let checkResult = 'unknown';
    const fullUrl = getFullUrl(link);
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(fullUrl, { 
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'EPOCH-Link-Health-Checker/1.0'
        }
      });
      
      clearTimeout(timeout);
      status = response.status;
      
      if (status === link.expectedStatus) {
        checkResult = 'healthy';
      } else if (status === 404) {
        checkResult = '404_not_found';
      } else if (status >= 500) {
        checkResult = 'server_error';
      } else if (status >= 400) {
        checkResult = 'client_error';
      } else {
        checkResult = 'unexpected_status';
      }
    } catch (fetchError: any) {
      if (fetchError.name === 'AbortError') {
        checkResult = 'timeout';
      } else {
        checkResult = 'connection_error';
      }
    }
    
    const responseTime = Date.now() - startTime;
    const consecutiveFailures = checkResult === 'healthy' ? 0 : (link.consecutiveFailures || 0) + 1;
    
    const [updatedLink] = await db.update(monitoredLinks)
      .set({
        lastCheckedAt: new Date(),
        lastStatus: status,
        lastCheckResult: checkResult,
        consecutiveFailures,
        updatedAt: new Date()
      })
      .where(eq(monitoredLinks.id, parseInt(id)))
      .returning();
    
    res.json({
      ...updatedLink,
      responseTime,
      checkResult
    });
  } catch (error) {
    console.error('Error checking monitored link:', error);
    res.status(500).json({ message: 'Failed to check monitored link' });
  }
});

router.post('/check-all', async (req, res) => {
  try {
    const enabledLinks = await db.select().from(monitoredLinks).where(eq(monitoredLinks.isEnabled, true));
    
    const results = await Promise.all(enabledLinks.map(async (link) => {
      const startTime = Date.now();
      let status: number | null = null;
      let checkResult = 'unknown';
      const fullUrl = getFullUrl(link);
      
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(fullUrl, { 
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'EPOCH-Link-Health-Checker/1.0'
          }
        });
        
        clearTimeout(timeout);
        status = response.status;
        
        if (status === link.expectedStatus) {
          checkResult = 'healthy';
        } else if (status === 404) {
          checkResult = '404_not_found';
        } else if (status >= 500) {
          checkResult = 'server_error';
        } else if (status >= 400) {
          checkResult = 'client_error';
        } else {
          checkResult = 'unexpected_status';
        }
      } catch (fetchError: any) {
        if (fetchError.name === 'AbortError') {
          checkResult = 'timeout';
        } else {
          checkResult = 'connection_error';
        }
      }
      
      const responseTime = Date.now() - startTime;
      const consecutiveFailures = checkResult === 'healthy' ? 0 : (link.consecutiveFailures || 0) + 1;
      
      const [updatedLink] = await db.update(monitoredLinks)
        .set({
          lastCheckedAt: new Date(),
          lastStatus: status,
          lastCheckResult: checkResult,
          consecutiveFailures,
          updatedAt: new Date()
        })
        .where(eq(monitoredLinks.id, link.id))
        .returning();
      
      return {
        ...updatedLink,
        responseTime
      };
    }));
    
    const healthy = results.filter(r => r.lastCheckResult === 'healthy').length;
    const unhealthy = results.length - healthy;
    
    res.json({
      checked: results.length,
      healthy,
      unhealthy,
      results
    });
  } catch (error) {
    console.error('Error checking all monitored links:', error);
    res.status(500).json({ message: 'Failed to check all monitored links' });
  }
});

export default router;
