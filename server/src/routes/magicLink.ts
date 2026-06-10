import { Router, Request, Response } from 'express';
import {
  generateMagicLink,
  validateMagicLink,
  sendMagicLink,
  cleanupExpiredMagicLinks,
} from '../../utils/magicLink';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

// SECURITY: All magic link generation/sending routes require authentication
// Only verified backend users can create magic links

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

// PROTECTED: Only authenticated users can generate magic links
router.post(
  '/generate',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const validatedData = generateMagicLinkSchema.parse(req.body);
      if (validatedData.purpose === 'vendor_po_confirmation') {
        return res.status(410).json({
          success: false,
          error: 'Vendor PO confirmation is no longer supported.',
        });
      }

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
          details: error.errors,
        });
      }
      console.error('Generate magic link error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate magic link',
      });
    }
  }
);

// PROTECTED: Only authenticated users can send magic links
router.post('/send', authenticateToken, async (req: Request, res: Response) => {
  try {
    const validatedData = sendMagicLinkSchema.parse(req.body);
    if (validatedData.purpose === 'vendor_po_confirmation') {
      return res.status(410).json({
        success: false,
        error: 'Vendor PO confirmation is no longer supported.',
      });
    }

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
        details: error.errors,
      });
    }
    console.error('Send magic link error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send magic link',
    });
  }
});

// PUBLIC: Customers can verify their magic links (no auth required)
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const { token, purpose } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    if (purpose === 'vendor_po_confirmation') {
      return res.status(410).json({
        success: false,
        error: 'Vendor PO confirmation is no longer supported.',
      });
    }

    const result = await validateMagicLink(
      token,
      purpose ? String(purpose) : undefined
    );

    if (result.isValid && result.token) {
      // Handle vendor PO confirmation - show a thank you page
      if (result.token.purpose === 'vendor_po_confirmation') {
        const metadata = result.token.metadata || {};
        const poNumber = metadata.poNumber || 'Unknown';
        const vendorName = metadata.vendorName || 'Vendor';
        
        // Return a styled confirmation page
        return res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PO Confirmation - AG Composites</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 60px 40px;
      max-width: 500px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .checkmark {
      width: 80px;
      height: 80px;
      background: #22c55e;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 30px;
    }
    .checkmark svg {
      width: 40px;
      height: 40px;
      stroke: white;
      stroke-width: 3;
    }
    h1 {
      color: #1a1a2e;
      font-size: 28px;
      margin-bottom: 20px;
    }
    .po-number {
      background: #f0f9ff;
      border: 2px solid #0ea5e9;
      border-radius: 8px;
      padding: 15px 25px;
      display: inline-block;
      margin: 20px 0;
    }
    .po-number span {
      color: #0369a1;
      font-weight: 700;
      font-size: 24px;
    }
    p {
      color: #64748b;
      line-height: 1.7;
      margin-bottom: 15px;
    }
    .company-info {
      margin-top: 40px;
      padding-top: 30px;
      border-top: 1px solid #e2e8f0;
      color: #94a3b8;
      font-size: 14px;
    }
    .company-info strong {
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h1>Thank You!</h1>
    <p>Your confirmation has been received.</p>
    <div class="po-number">
      <span>${poNumber}</span>
    </div>
    <p>We have recorded that <strong>${vendorName}</strong> has confirmed receipt of this purchase order.</p>
    <p>If you have any questions about this order, please contact us at sales@agcomposites.com or call 256-723-8381.</p>
    <div class="company-info">
      <strong>AG Composites</strong><br>
      230 Hamer Road, Owens Cross Roads, AL 35763<br>
      Phone: 256-723-8381
    </div>
  </div>
</body>
</html>
        `);
      }

      // Default JSON response for other purposes
      res.json({
        success: true,
        message: 'Token is valid',
        email: result.token.email,
        purpose: result.token.purpose,
        metadata: result.token.metadata,
      });
    } else {
      // Handle invalid/expired token with a user-friendly page for PO confirmations
      if (purpose === 'vendor_po_confirmation') {
        return res.status(400).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Expired - AG Composites</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 60px 40px;
      max-width: 500px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .icon {
      width: 80px;
      height: 80px;
      background: #fbbf24;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 30px;
      font-size: 40px;
    }
    h1 {
      color: #1a1a2e;
      font-size: 28px;
      margin-bottom: 20px;
    }
    p {
      color: #64748b;
      line-height: 1.7;
      margin-bottom: 15px;
    }
    .company-info {
      margin-top: 40px;
      padding-top: 30px;
      border-top: 1px solid #e2e8f0;
      color: #94a3b8;
      font-size: 14px;
    }
    .company-info strong {
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">⚠️</div>
    <h1>Link Expired or Invalid</h1>
    <p>${result.error || 'This confirmation link has expired or has already been used.'}</p>
    <p>If you need to confirm a purchase order, please contact us and we'll send you a new confirmation link.</p>
    <div class="company-info">
      <strong>AG Composites</strong><br>
      230 Hamer Road, Owens Cross Roads, AL 35763<br>
      Phone: 256-723-8381 | Email: sales@agcomposites.com
    </div>
  </div>
</body>
</html>
        `);
      }

      res.status(400).json({
        success: false,
        error: result.error || 'Invalid token',
      });
    }
  } catch (error) {
    console.error('Verify magic link error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify magic link',
    });
  }
});

// PROTECTED: Only authenticated users can trigger cleanup
router.post(
  '/cleanup',
  authenticateToken,
  async (req: Request, res: Response) => {
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
        error: 'Failed to cleanup expired tokens',
      });
    }
  }
);

export default router;
