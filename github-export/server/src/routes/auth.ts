import { Router, Request, Response } from 'express';
import { z } from 'zod';
import cookieParser from 'cookie-parser';
import { AuthService } from '../../auth';
import { authenticateToken, authenticatePortalToken } from '../../middleware/auth';
import { loginSchema, changePasswordSchema, insertUserSchema } from '@shared/schema';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const ipAddress = req.ip || req.connection.remoteAddress || null;
    const userAgent = req.get('User-Agent') || null;

    const result = await AuthService.authenticate(username, password, ipAddress, userAgent);
    
    if (!result) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Set secure cookie
    res.cookie('sessionToken', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    });

    res.json({
      success: true,
      user: result.user,
      sessionToken: result.sessionToken
    });
  } catch (error) {
    console.error('Login error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  try {
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    
    if (sessionToken) {
      await AuthService.invalidateSession(sessionToken);
    }

    res.clearCookie('sessionToken');
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: "Logout failed" });
  }
});

// GET /api/auth/session - Check current session (no auth required for manufacturing system)
router.get('/session', async (req: Request, res: Response) => {
  try {
    // Try to get authenticated user first
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1];
    const cookieToken = req.cookies?.sessionToken;
    const token = bearerToken || cookieToken;

    if (token) {
      try {
        let user = null;
        
        // Try JWT authentication first
        if (bearerToken) {
          const jwtPayload = AuthService.verifyJWT(bearerToken);
          if (jwtPayload) {
            const dbUser = await AuthService.getUserById(jwtPayload.userId);
            if (dbUser && dbUser.isActive) {
              user = dbUser;
            }
          }
        }

        // Fallback to session-based authentication
        if (!user && cookieToken) {
          user = await AuthService.getUserBySession(cookieToken);
        }

        if (user) {
          return res.json({
            id: user.id,
            username: user.username,
            role: user.role,
            employeeId: user.employeeId,
            isActive: user.isActive,
            canOverridePrices: user.canOverridePrices
          });
        }
      } catch (authError) {
        console.log('Authentication failed, returning anonymous user:', authError);
      }
    }

    // Return anonymous user for manufacturing system access
    res.json({
      id: 0,
      username: 'anonymous',
      role: 'OPERATOR',
      employeeId: null,
      isActive: true,
      canOverridePrices: false
    });
  } catch (error) {
    console.error('Session check error:', error);
    res.status(500).json({ error: "Session check failed" });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const success = await AuthService.changePassword(userId, currentPassword, newPassword);
    
    if (!success) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error('Change password error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Password change failed" });
  }
});

// POST /api/auth/create-user (Admin only)
router.post('/create-user', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userData = insertUserSchema.parse(req.body);
    const currentUser = (req as any).user;

    // Check if current user has admin privileges
    if (!currentUser || !['ADMIN', 'HR Manager'].includes(currentUser.role)) {
      return res.status(403).json({ error: "Insufficient privileges" });
    }

    const newUser = await AuthService.createUser(userData);
    res.status(201).json({ success: true, user: newUser });
  } catch (error) {
    console.error('Create user error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "User creation failed" });
  }
});

// Portal authentication routes
router.post('/portal/:portalId/verify', async (req: Request, res: Response) => {
  try {
    const { portalId } = req.params;
    const portalData = await AuthService.verifyPortalToken(portalId);
    
    if (!portalData) {
      return res.status(401).json({ error: "Invalid or expired portal access" });
    }

    res.json({ success: true, employee: portalData });
  } catch (error) {
    console.error('Portal verification error:', error);
    res.status(500).json({ error: "Portal verification failed" });
  }
});

export default router;