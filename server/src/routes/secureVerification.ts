
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { storage } from '../../storage';

const router = Router();

// Verify admin password for secure operations
router.post('/verify-admin', authenticateToken, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user details from storage to verify password
    const user = await storage.getUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password (assuming you have password hash stored)
    // Note: You'll need to implement password storage in your user system
    const isValidPassword = await bcrypt.compare(password, user.passwordHash || '');
    
    if (!isValidPassword) {
      // Log security attempt
      console.warn(`Failed admin verification attempt by user ${req.user.id} (${req.user.username})`);
      return res.status(403).json({ error: 'Invalid password' });
    }

    // Log successful verification
    console.log(`Admin verification successful for user ${req.user.id} (${req.user.username})`);
    
    res.json({ 
      verified: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Log secure operations for audit trail
router.post('/log-secure-operation', authenticateToken, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { operation, itemType, itemName, operationType } = req.body;
    
    // Log the secure operation
    console.log(`SECURE OPERATION: ${req.user?.username} performed ${operationType} on ${itemType}: ${itemName} - ${operation}`);
    
    // You could store this in a security audit table if needed
    // await storage.logSecureOperation({
    //   userId: req.user.id,
    //   operation,
    //   itemType,
    //   itemName,
    //   operationType,
    //   timestamp: new Date()
    // });
    
    res.json({ logged: true });
  } catch (error) {
    console.error('Security logging error:', error);
    res.status(500).json({ error: 'Logging failed' });
  }
});

export default router;
