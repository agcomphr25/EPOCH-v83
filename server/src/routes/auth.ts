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

// GET /api/auth/health - Database health check
router.get('/health', async (req: Request, res: Response) => {
  const healthTimeout = setTimeout(() => {
    console.error('🚨 HEALTH CHECK TIMEOUT: Database health check took longer than 5 seconds');
    if (!res.headersSent) {
      res.status(408).json({ 
        healthy: false, 
        error: "Database health check timeout",
        timestamp: new Date().toISOString()
      });
    }
  }, 5000);

  try {
    const { testDatabaseConnection } = await import('../../db');
    const isHealthy = await testDatabaseConnection();
    
    clearTimeout(healthTimeout);
    res.json({
      healthy: isHealthy,
      database: isHealthy ? "connected" : "disconnected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    clearTimeout(healthTimeout);
    res.status(500).json({ 
      healthy: false, 
      error: "Health check failed",
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/auth/login (with aggressive timeout protection)
router.post('/login', async (req: Request, res: Response) => {
  // Add timeout wrapper around entire login process (longer for deployment)
  const isDeployment = req.get('host')?.includes('.replit.app') || 
                      req.get('host')?.includes('.repl.co') ||
                      req.get('host')?.includes('agcompepoch.xyz');
  const loginTimeoutDuration = isDeployment ? 30000 : 10000; // 30s for deployment, 10s for dev
  
  const loginTimeout = setTimeout(() => {
    console.error(`🚨 LOGIN TIMEOUT: Login process took longer than ${loginTimeoutDuration}ms (deployment: ${isDeployment})`);
    if (!res.headersSent) {
      res.status(408).json({ error: "Login request timed out - possible database connectivity issues" });
    }
  }, loginTimeoutDuration);

  try {
    console.log('🔐 LOGIN START: Login attempt with username:', req.body?.username);
    
    // Basic validation first
    if (!req.body || typeof req.body !== 'object') {
      clearTimeout(loginTimeout);
      return res.status(400).json({ error: "Invalid request body" });
    }

    if (!req.body.username || !req.body.password) {
      clearTimeout(loginTimeout);
      return res.status(400).json({ error: "Username and password are required" });
    }

    const username = String(req.body.username).trim();
    const password = String(req.body.password);

    if (!username || !password) {
      clearTimeout(loginTimeout);
      return res.status(400).json({ error: "Username and password cannot be empty" });
    }

    console.log('🔍 LOGIN STEP 1: Basic validation passed for user:', username);
    
    const ipAddress = req.ip || req.connection.remoteAddress || null;
    const userAgent = req.get('User-Agent') || null;
    
    console.log('🔍 LOGIN STEP 2: About to call AuthService.authenticate...');
    
    try {
      // Add timeout wrapper around authentication (longer for deployment)
      const authTimeoutDuration = isDeployment ? 25000 : 8000; // 25s for deployment, 8s for dev
      const authPromise = AuthService.authenticate(username, password, ipAddress, userAgent);
      const authTimeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Authentication timeout')), authTimeoutDuration);
      });

      const result = await Promise.race([authPromise, authTimeoutPromise]) as { user: any; sessionToken: string } | null;
      
      console.log('🔍 LOGIN STEP 3: AuthService.authenticate completed');
      
      if (!result) {
        console.log('❌ LOGIN FAILED: Authentication failed for user:', username);
        clearTimeout(loginTimeout);
        return res.status(401).json({ error: "Invalid username or password" });
      }

      console.log('✅ LOGIN STEP 4: Authentication successful for user:', username);
      console.log('🔍 LOGIN STEP 5: About to set cookie and send response...');

      // Set secure cookie with enhanced security
      res.cookie('sessionToken', result.sessionToken, {
        httpOnly: true,
        secure: true, // Always use secure cookies
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
        path: '/', // Explicit path
      });

      console.log('🔍 LOGIN STEP 6: Cookie set, about to send JSON response...');

      const responseData = {
        success: true,
        user: result.user,
        sessionToken: result.sessionToken,
        token: result.sessionToken // Use session token for client-side storage
      };

      console.log('✅ LOGIN COMPLETE: Sending successful response for user:', username);
      clearTimeout(loginTimeout);
      res.json(responseData);
      
    } catch (authError: any) {
      console.error('💥 LOGIN ERROR: AuthService.authenticate error:', authError);
      clearTimeout(loginTimeout);
      
      // Handle specific auth errors
      if (authError instanceof Error) {
        if (authError.message === 'Authentication timeout') {
          return res.status(408).json({ error: "Authentication timed out - possible database issues" });
        }
        if (authError.message.includes('locked') || authError.message.includes('deactivated')) {
          return res.status(401).json({ error: authError.message });
        }
        // For any other auth service errors, return a generic message
        return res.status(401).json({ error: "Authentication failed" });
      }
      
      return res.status(500).json({ error: "Authentication service error" });
    }
  } catch (error) {
    console.error('💥 LOGIN OUTER ERROR:', error);
    clearTimeout(loginTimeout);
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

// GET /api/auth/session - Check current session (enhanced timeout handling)
router.get('/session', async (req: Request, res: Response) => {
  // Timeout adjusted for deployment environments
  const isDeployment = req.get('host')?.includes('.replit.app') || 
                      req.get('host')?.includes('.repl.co') ||
                      req.get('host')?.includes('agcompepoch.xyz');
  const sessionTimeoutDuration = isDeployment ? 15000 : 3000; // 15s for deployment, 3s for dev
  
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Session check timeout')), sessionTimeoutDuration);
  });

  try {
    await Promise.race([
      (async () => {
        console.log('Session check starting...');
        
        // Try to get authenticated user first
        const authHeader = req.headers['authorization'];
        const bearerToken = authHeader && authHeader.split(' ')[1];
        const cookieToken = req.cookies?.sessionToken;
        const token = bearerToken || cookieToken;

        if (token) {
          try {
            let user = null;
            
            console.log('Attempting session-based auth...');
            // Try session-based authentication first (session tokens from login)
            user = await AuthService.getUserBySession(token);
            
            // Fallback to JWT authentication if session fails
            if (!user && bearerToken) {
              console.log('Session auth failed, trying JWT fallback...');
              try {
                const jwtPayload = AuthService.verifyJWT(bearerToken);
                if (jwtPayload) {
                  const dbUser = await AuthService.getUserById(jwtPayload.userId);
                  if (dbUser && dbUser.isActive) {
                    user = dbUser;
                  }
                }
              } catch (jwtError) {
                console.log('JWT verification failed:', jwtError);
              }
            }

            if (user) {
              console.log('Session check successful for user:', user.username);
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
            console.log('Authentication failed:', authError);
          }
        }

        console.log('No valid authentication found, returning 401');
        // Return 401 for unauthenticated users in deployment
        return res.status(401).json({ error: "Authentication required" });
      })(),
      timeoutPromise
    ]);
  } catch (error) {
    console.error('Session check error:', error);
    if (error instanceof Error && error.message === 'Session check timeout') {
      console.error('Session validation timed out - this indicates database connectivity issues');
      return res.status(408).json({ error: "Session validation timeout" });
    }
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