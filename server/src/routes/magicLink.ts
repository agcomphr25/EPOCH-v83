import { Router, Request, Response } from 'express';
import { 
  generateMagicLink, 
  validateMagicLink, 
  sendMagicLink,
  cleanupExpiredMagicLinks 
} from '../../utils/magicLink';
import { z } from 'zod';

const router = Router();

const generateMagicLinkSchema = z.object({
  email: z.string().email('Invalid email address'),
  purpose: z.string().min(1, 'Purpose is required'),
  metadata: z.record(z.any()).optional(),
  expiresInMinutes: z.number().min(1).max(1440).optional(),
});

const sendMagicLinkSchema = generateMagicLinkSchema.extend({
  subject: z.string().optional(),
  message: z.string().optional(),
  buttonText: z.string().optional(),
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const validatedData = generateMagicLinkSchema.parse(req.body);
    
    const result = await generateMagicLink({
      ...validatedData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    
    res.json({
      success: true,
      link: result.link,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    console.error('Generate magic link error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate magic link' 
    });
  }
});

router.post('/send', async (req: Request, res: Response) => {
  try {
    const validatedData = sendMagicLinkSchema.parse(req.body);
    
    const result = await sendMagicLink({
      ...validatedData,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Magic link sent successfully',
        expiresAt: result.expiresAt,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to send magic link',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    console.error('Send magic link error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send magic link' 
    });
  }
});

router.get('/verify', async (req: Request, res: Response) => {
  try {
    const { token, purpose } = req.query;
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Token is required' 
      });
    }
    
    const result = await validateMagicLink(
      token, 
      purpose ? String(purpose) : undefined
    );
    
    if (result.isValid && result.token) {
      res.json({
        success: true,
        message: 'Token is valid',
        email: result.token.email,
        purpose: result.token.purpose,
        metadata: result.token.metadata,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Invalid token',
      });
    }
  } catch (error) {
    console.error('Verify magic link error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to verify magic link' 
    });
  }
});

router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const deletedCount = await cleanupExpiredMagicLinks();
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} expired tokens`,
      deletedCount,
    });
  } catch (error) {
    console.error('Cleanup magic links error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to cleanup expired tokens' 
    });
  }
});

export default router;
