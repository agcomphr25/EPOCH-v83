import { Router, Request, Response } from 'express';
import { z } from 'zod';
import cookieParser from 'cookie-parser';
import { AuthService } from '../../auth';
import { authenticateToken, authenticatePortalToken } from '../../middleware/auth';
import { loginSchema, changePasswordSchema, insertUserSchema } from '../../schema';

const router = Router();

// GET /api/auth/test - Simple test endpoint
router.get('/test', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      message: "Auth endpoint is working",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown'
    });
  } catch (error) {
    res.status(500).json({ error: "Test endpoint failed" });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    console.log('Login attempt with body:', req.body);
    
    // Basic validation first
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: "Invalid request body" });
    }

    if (!req.body.username || !req.body.password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const username = String(req.body.username).trim();
    const password = String(req.body.password);

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password cannot be empty" });
    }

    console.log('Attempting to authenticate user:', username);
    
    const ipAddress = req.ip || req.connection.remoteAddress || null;
    const userAgent = req.get('User-Agent') || null;
    
    try {
      const result = await AuthService.authenticate(username, password, ipAddress, userAgent);
      
      if (!result) {
        console.log('Authentication failed for user:', username);
        return res.status(401).json({ error: "Invalid username or password" });
      }

      console.log('Authentication successful for user:', username);

      // Set secure cookie with enhanced security
      res.cookie('sessionToken', result.sessionToken, {
        httpOnly: true,
        secure: true, // Always use secure cookies
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
        path: '/', // Explicit path
      });

      res.json({
        success: true,
        user: result.user,
        sessionToken: result.sessionToken,
        token: result.sessionToken // Use session token for client-side storage
      });
    } catch (authError) {
      console.error('AuthService.authenticate error:', authError);
      
      // Handle specific auth errors
      if (authError instanceof Error) {
        if (authError.message.includes('locked') || authError.message.includes('deactivated')) {
          return res.status(401).json({ error: authError.message });
        }
        // For any other auth service errors, return a generic message
        return res.status(401).json({ error: "Authentication failed" });
      }
      
      return res.status(500).json({ error: "Authentication service error" });
    }
  } catch (error) {
    console.error('Login error:', error);
    if (error instanceof Error) {
      console.log('Error message:', error.message);
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