import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { eq, sql } from 'drizzle-orm';

import { pool, db } from '../../db';
import { users } from '../../schema';

const router = Router();

// Rate limiting for authentication endpoints to prevent brute-force attacks
// Limits: 5 attempts per 15 minutes per IP for login
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

// More lenient rate limit for password reset requests
const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: { error: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General auth endpoint rate limiter (for session checks, logout, etc.)
const generalAuthRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all auth routes
router.use(generalAuthRateLimiter);

// Hardcoded test users mapped from dashboardMapping.ts
// Password for all users is 'test123' (hashed with bcrypt)
// Hash: $2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu
// Role structure: ADMIN, EMPLOYEE, OWNER
const USERS = new Map([
  [
    'epoch',
    {
      id: 1,
      username: 'epoch',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'ADMIN',
    },
  ],
  [
    'glennj',
    {
      id: 2,
      username: 'glennj',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'ADMIN',
    },
  ],
  [
    'tasham',
    {
      id: 3,
      username: 'tasham',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'ADMIN',
    },
  ],
  [
    'staciw',
    {
      id: 4,
      username: 'staciw',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'agrace',
    {
      id: 5,
      username: 'agrace',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'tims',
    {
      id: 6,
      username: 'tims',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'angiet',
    {
      id: 7,
      username: 'angiet',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'blaket',
    {
      id: 8,
      username: 'blaket',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'bradw',
    {
      id: 9,
      username: 'bradw',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'darleneb',
    {
      id: 10,
      username: 'darleneb',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'faleeshah',
    {
      id: 11,
      username: 'faleeshah',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'halls',
    {
      id: 12,
      username: 'halls',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'hunta',
    {
      id: 13,
      username: 'hunta',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'jens',
    {
      id: 14,
      username: 'jens',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'joeyb',
    {
      id: 15,
      username: 'joeyb',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'johnl',
    {
      id: 16,
      username: 'johnl',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'lauriet',
    {
      id: 17,
      username: 'lauriet',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'tandyd',
    {
      id: 18,
      username: 'tandyd',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'tandym',
    {
      id: 19,
      username: 'tandym',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'brian',
    {
      id: 20,
      username: 'brian',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
]);

// Generate cryptographically secure session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Helper function to hydrate session and verify user is valid
// Used by badge-login to ensure session is valid before returning success
async function hydrateAndValidateSession(
  sessionToken: string,
  userId: number
): Promise<{ valid: boolean; user?: any; error?: string }> {
  try {
    // Verify session exists and is active
    const sessionResult = await pool.query(
      'SELECT user_id, expires_at FROM user_sessions WHERE session_token = $1 AND is_active = true',
      [sessionToken]
    );

    if (!sessionResult || sessionResult.length === 0) {
      return { valid: false, error: 'Session not found' };
    }

    const session = sessionResult[0];

    if (session.user_id !== userId) {
      return { valid: false, error: 'Session user mismatch' };
    }

    if (new Date(session.expires_at) < new Date()) {
      return { valid: false, error: 'Session expired' };
    }

    // Hydrate user from database using user_id, with employee name fallback
    const userResult = await pool.query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.role, u.employee_id, u.is_active,
              e.name as employee_name
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE u.id = $1`,
      [userId]
    );

    if (!userResult || userResult.length === 0) {
      return { valid: false, error: 'User not found' };
    }

    const user = userResult[0];

    if (!user.is_active) {
      return { valid: false, error: 'User account is inactive' };
    }

    let firstName = user.first_name;
    let lastName = user.last_name;
    if (!firstName && !lastName && user.employee_name) {
      const parts = user.employee_name.split(' ');
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }
    if (!firstName && !lastName) {
      firstName = user.username;
      lastName = '';
    }

    return {
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        firstName,
        lastName,
        role: user.role,
        employeeId: user.employee_id,
      },
    };
  } catch (error) {
    console.error('Session hydration error:', error);
    return { valid: false, error: 'Session validation failed' };
  }
}

// Minimal audit logging for badge login attempts
function logBadgeLoginAttempt(data: {
  employeeId: number | null;
  employeeCode: string;
  userId: number | null;
  sessionToken: string | null;
  redirectUrl: string | null;
  success: boolean;
  failureReason: string | null;
}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type: 'BADGE_LOGIN',
    ...data,
  };
  
  if (data.success) {
    console.log(`🔐 [BADGE_LOGIN] SUCCESS | employee_id=${data.employeeId} user_id=${data.userId} redirect=${data.redirectUrl} session=${data.sessionToken?.substring(0, 8)}...`);
  } else {
    console.warn(`🔐 [BADGE_LOGIN] FAILED | employee_code=${data.employeeCode} reason=${data.failureReason}`);
  }
  
  return logEntry;
}

// Badge login endpoint - employees log in with just their employee code
// Rate limited to prevent brute-force attacks
router.post('/badge-login', loginRateLimiter, async (req, res) => {
  const { employeeCode } = req.body;
  let employeeId: number | null = null;
  let userId: number | null = null;
  let sessionToken: string | null = null;
  let redirectUrl: string | null = null;

  try {
    if (!employeeCode) {
      logBadgeLoginAttempt({
        employeeId: null,
        employeeCode: employeeCode || '',
        userId: null,
        sessionToken: null,
        redirectUrl: null,
        success: false,
        failureReason: 'Employee code is required',
      });
      return res.status(400).json({ error: 'Employee code is required' });
    }

    // Look up employee by badge_scan_code first, then fall back to employee_code
    let employeeResult = await pool.query(
      `SELECT id, employee_code as "employeeCode", name, email, user_role as "userRole", is_active as "isActive"
      FROM employees
      WHERE badge_scan_code = $1`,
      [employeeCode]
    );

    if (!employeeResult || employeeResult.length === 0) {
      employeeResult = await pool.query(
        `SELECT id, employee_code as "employeeCode", name, email, user_role as "userRole", is_active as "isActive"
        FROM employees
        WHERE employee_code = $1`,
        [employeeCode]
      );
    }

    if (!employeeResult || employeeResult.length === 0) {
      logBadgeLoginAttempt({
        employeeId: null,
        employeeCode,
        userId: null,
        sessionToken: null,
        redirectUrl: null,
        success: false,
        failureReason: 'Invalid employee code',
      });
      return res.status(401).json({ error: 'Invalid employee code' });
    }

    const employee = employeeResult[0];
    employeeId = employee.id;

    // Check if employee is active
    if (!employee.isActive) {
      logBadgeLoginAttempt({
        employeeId,
        employeeCode,
        userId: null,
        sessionToken: null,
        redirectUrl: null,
        success: false,
        failureReason: 'Employee account is inactive',
      });
      return res.status(401).json({ error: 'Employee account is inactive' });
    }

    // Look up linked user account for this employee
    const linkedUserResult = await pool.query(
      `SELECT id, username, role, first_name as "firstName", last_name as "lastName", is_active as "isActive"
      FROM users
      WHERE employee_id = $1 AND is_active = true`,
      [employee.id]
    );

    // Use linked user account if available, otherwise deny access
    let sessionUser: { id: number; username: string; role: string };
    
    if (linkedUserResult && linkedUserResult.length > 0) {
      const linkedUser = linkedUserResult[0];
      sessionUser = {
        id: linkedUser.id,
        username: linkedUser.username,
        role: linkedUser.role || 'EMPLOYEE',
      };
      userId = linkedUser.id;
    } else {
      logBadgeLoginAttempt({
        employeeId,
        employeeCode,
        userId: null,
        sessionToken: null,
        redirectUrl: null,
        success: false,
        failureReason: 'No user account linked to this employee badge',
      });
      return res.status(401).json({ 
        error: 'No user account linked to this employee badge. Please contact an administrator.' 
      });
    }

    // Look up employee's badge action configuration to determine redirect
    const badgeActionResult = await pool.query(
      `SELECT action_type as "actionType", action_config as "actionConfig"
      FROM employee_badge_actions
      WHERE employee_id = $1
        AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1`,
      [employee.id]
    );

    // Determine redirect URL based on badge action
    redirectUrl = '/dashboard'; // Default

    if (badgeActionResult && badgeActionResult.length > 0) {
      const badgeAction = badgeActionResult[0];
      const actionType = badgeAction.actionType;
      const actionConfig = badgeAction.actionConfig;

      switch (actionType) {
        case 'QUICK_NAVIGATION':
          redirectUrl = actionConfig?.targetPage || '/dashboard';
          break;
        case 'P1_DEPARTMENT_PROGRESS':
          redirectUrl = '/badge-scanner';
          break;
        case 'P2_DEPARTMENT_PROGRESS':
          redirectUrl = '/p2-department-manager';
          break;
        case 'CLOCK_IN_OUT':
          redirectUrl = '/employee-portal';
          break;
        default:
          redirectUrl = '/dashboard';
      }
    }

    // Generate session token
    sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store session in database using the linked user's credentials
    await pool.query(
      `INSERT INTO user_sessions (session_token, user_id, username, expires_at, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (session_token) DO UPDATE
      SET expires_at = $4, is_active = true`,
      [sessionToken, sessionUser.id, sessionUser.username, expiresAt]
    );

    // SESSION HYDRATION INVARIANT: Validate session can be hydrated before returning success
    // This ensures badge login produces identical authenticated state as password login
    const hydrationResult = await hydrateAndValidateSession(sessionToken, sessionUser.id);
    
    if (!hydrationResult.valid) {
      // Session was created but cannot be hydrated - this is a critical failure
      // Clean up the invalid session
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [sessionToken]);
      
      logBadgeLoginAttempt({
        employeeId,
        employeeCode,
        userId,
        sessionToken,
        redirectUrl,
        success: false,
        failureReason: `Session hydration failed: ${hydrationResult.error}`,
      });
      
      return res.status(500).json({ 
        error: 'Badge login failed: Unable to create valid session. Please contact an administrator.' 
      });
    }

    // Set HTTP-only cookie
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.REPL_DEPLOYMENT === 'true' ||
      process.env.REPLIT_DEPLOYMENT === 'true';

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    };

    res.cookie('sessionToken', sessionToken, cookieOptions);

    // Log successful badge login
    logBadgeLoginAttempt({
      employeeId,
      employeeCode,
      userId,
      sessionToken,
      redirectUrl,
      success: true,
      failureReason: null,
    });

    res.json({
      success: true,
      sessionToken,
      user: {
        id: sessionUser.id,
        username: sessionUser.username,
        role: sessionUser.role,
      },
      employee: {
        name: employee.name,
        email: employee.email,
        id: employee.id,
      },
      redirectUrl,
    });
  } catch (error) {
    console.error('Badge login error:', error);
    logBadgeLoginAttempt({
      employeeId,
      employeeCode: employeeCode || '',
      userId,
      sessionToken,
      redirectUrl,
      success: false,
      failureReason: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Badge login failed' });
  }
});

// Login endpoint with rate limiting to prevent brute-force attacks
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: 'Username and password are required' });
    }

    // Try to find user in database first using Drizzle ORM
    const dbUserResult = await db.select({
      id: users.id,
      username: users.username,
      passwordHash: users.passwordHash,
      role: users.role,
      isActive: users.isActive,
    }).from(users).where(sql`LOWER(${users.username}) = LOWER(${username})`);

    let user: any;
    let isValidPassword = false;

    if (dbUserResult && dbUserResult.length > 0) {
      // User exists in database
      const dbUser = dbUserResult[0];

      // Check if user is active - skip check in dev mode with auth bypass enabled
      const devAuthBypass = process.env.DEV_AUTH_BYPASS === 'true';
      if (dbUser.isActive === false && !devAuthBypass) {
        return res.status(401).json({ error: 'Account is inactive' });
      }

      // Verify password against database hash
      isValidPassword = await bcrypt.compare(password, dbUser.passwordHash);

      if (isValidPassword) {
        user = {
          id: dbUser.id,
          username: dbUser.username,
          role: dbUser.role || 'EMPLOYEE',
        };
      }
    } else {
      // Fall back to hardcoded users if not in database
      const hardcodedUser = USERS.get(username.toLowerCase());

      if (hardcodedUser) {
        isValidPassword = await bcrypt.compare(
          password,
          hardcodedUser.password
        );
        if (isValidPassword) {
          user = hardcodedUser;
        }
      }
    }

    if (!user || !isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store session in database for persistence
    await pool.query(
      `INSERT INTO user_sessions (session_token, user_id, username, expires_at, is_active) 
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (session_token) DO UPDATE 
       SET expires_at = $4, is_active = true`,
      [sessionToken, user.id, user.username, expiresAt]
    );

    console.log('✅ Session saved to database for user:', user.username);

    // Set HTTP-only cookie with production-safe settings
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.REPL_DEPLOYMENT === 'true' ||
      process.env.REPLIT_DEPLOYMENT === 'true';

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const, // 'lax' works for same-origin (agcompepoch.xyz)
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    };

    console.log('🍪 Setting cookie:', {
      isProduction,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
    });

    res.cookie('sessionToken', sessionToken, cookieOptions);

    res.json({
      success: true,
      sessionToken, // Also return in body for compatibility
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const sessionToken =
      req.cookies?.sessionToken ||
      req.headers.authorization?.replace('Bearer ', '');

    if (sessionToken) {
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [
        sessionToken,
      ]);
      console.log('✅ Session deleted from database');
    }

    res.clearCookie('sessionToken');
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Validate session endpoint
router.get('/validate', async (req, res) => {
  try {
    const sessionToken =
      req.cookies?.sessionToken ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({ valid: false });
    }

    // Query database for session
    const result = await pool.query(
      'SELECT user_id, username, expires_at FROM user_sessions WHERE session_token = $1 AND is_active = true',
      [sessionToken]
    );

    if (!result || result.length === 0) {
      return res.status(401).json({ valid: false });
    }

    const session = result[0];

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [
        sessionToken,
      ]);
      return res.status(401).json({ valid: false });
    }

    // FIXED: Use user_id as source of truth instead of username
    // This eliminates username casing, rename, and drift issues
    const dbUserResult = await pool.query(
      `SELECT id, username, role FROM users WHERE id = $1 AND is_active = true`,
      [session.user_id]
    );

    let user: any;

    if (dbUserResult && dbUserResult.length > 0) {
      user = dbUserResult[0];
    } else {
      // Fall back to hardcoded users only if user_id matches
      const hardcodedUser = Array.from(USERS.values()).find(u => u.id === session.user_id);
      if (hardcodedUser) {
        user = hardcodedUser;
      }
    }

    if (!user) {
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [
        sessionToken,
      ]);
      return res.status(401).json({ valid: false });
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ valid: false });
  }
});

// Get current user session
router.get('/session', async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const bypassEnabled = process.env.DEV_AUTH_BYPASS === 'true';
    if (!isProduction && bypassEnabled) {
      return res.json({
        id: 2,
        username: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        employeeId: null,
      });
    }

    const sessionToken =
      req.cookies?.sessionToken ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Query database for session
    const result = await pool.query(
      'SELECT user_id, username, expires_at FROM user_sessions WHERE session_token = $1 AND is_active = true',
      [sessionToken]
    );

    if (!result || result.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const session = result[0];

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [
        sessionToken,
      ]);
      return res.status(401).json({ error: 'Session expired' });
    }

    // FIXED: Use user_id as source of truth instead of username
    // This eliminates username casing, rename, and drift issues
    const dbUserResult = await pool.query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.role, u.employee_id,
              e.name as employee_name
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE u.id = $1 AND u.is_active = true`,
      [session.user_id]
    );

    let user: any;

    if (dbUserResult && dbUserResult.length > 0) {
      user = dbUserResult[0];
    } else {
      // Fall back to hardcoded users only if user_id matches
      const hardcodedUser = Array.from(USERS.values()).find(u => u.id === session.user_id);
      if (hardcodedUser) {
        user = hardcodedUser;
      }
    }

    if (!user) {
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [
        sessionToken,
      ]);
      return res.status(401).json({ error: 'User not found' });
    }

    let firstName = user.first_name;
    let lastName = user.last_name;
    if (!firstName && !lastName && user.employee_name) {
      const parts = user.employee_name.split(' ');
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }
    if (!firstName && !lastName) {
      firstName = user.username;
      lastName = '';
    }

    res.json({
      id: user.id,
      username: user.username,
      firstName,
      lastName,
      role: user.role,
      employeeId: user.employee_id,
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * POST /api/auth/validate-credentials
 * Validate credentials without creating a full login session.
 * Returns a short-lived action token for inline credential gating.
 * Used by Timer Station and other public-view pages that need auth for actions.
 */
router.post('/validate-credentials', loginRateLimiter, async (req, res) => {
  try {
    const { username, password, employeeCode } = req.body;

    // Badge-only auth mode: accept employee code without a password
    if (employeeCode && !username && !password) {
      const empResult = await pool.query(
        `SELECT e.id as emp_id, e.name,
                u.id as user_id, u.username, u.role
         FROM employees e
         LEFT JOIN users u ON u.employee_id = e.id AND u.is_active = true
         WHERE (LOWER(e.employee_code) = LOWER($1) OR LOWER(e.badge_scan_code) = LOWER($1))
           AND e.is_active = true
         LIMIT 1`,
        [employeeCode]
      );
      if (empResult.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid employee code' });
      }
      const emp = empResult.rows[0];
      if (!emp.user_id) {
        return res.status(401).json({
          error: 'No login account linked to this employee badge. Contact an administrator.',
        });
      }
      const empUser = { id: emp.user_id, username: emp.username, role: emp.role || 'EMPLOYEE' };
      const actionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await pool.query(
        `INSERT INTO action_tokens (token, user_id, expires_at, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (token) DO UPDATE SET user_id = $2, expires_at = $3`,
        [actionToken, empUser.id, expiresAt]
      );
      console.log(`[Auth] Badge action token issued for employee ${emp.name} → user ${empUser.username}`);
      return res.json({
        success: true,
        token: actionToken,
        expiresAt: expiresAt.toISOString(),
        user: empUser,
      });
    }

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Try to find user in database first
    const dbUserResult = await db.select({
      id: users.id,
      username: users.username,
      passwordHash: users.passwordHash,
      role: users.role,
      isActive: users.isActive,
    }).from(users).where(sql`LOWER(${users.username}) = LOWER(${username})`);

    let user: { id: number; username: string; role: string } | null = null;
    let isValidPassword = false;

    if (dbUserResult && dbUserResult.length > 0) {
      const dbUser = dbUserResult[0];

      // Check if user is active
      if (dbUser.isActive === false) {
        return res.status(401).json({ error: 'Account is inactive' });
      }

      // Verify password
      isValidPassword = await bcrypt.compare(password, dbUser.passwordHash);

      if (isValidPassword) {
        user = {
          id: dbUser.id,
          username: dbUser.username,
          role: dbUser.role || 'EMPLOYEE',
        };
      }
    } else {
      // Fall back to hardcoded users
      const hardcodedUser = USERS.get(username.toLowerCase());

      if (hardcodedUser) {
        isValidPassword = await bcrypt.compare(password, hardcodedUser.password);
        if (isValidPassword) {
          user = {
            id: hardcodedUser.id,
            username: hardcodedUser.username,
            role: hardcodedUser.role,
          };
        }
      }
    }

    if (!user || !isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate a short-lived action token (15 minutes)
    const actionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store the action token in the database
    await pool.query(
      `INSERT INTO action_tokens (token, user_id, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (token) DO UPDATE SET user_id = $2, expires_at = $3`,
      [actionToken, user.id, expiresAt]
    );

    console.log(`[Auth] Action token issued for user ${user.username} (expires: ${expiresAt.toISOString()})`);

    res.json({
      success: true,
      token: actionToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Validate credentials error:', error);
    res.status(500).json({ error: 'Failed to validate credentials' });
  }
});

/**
 * Ensures required user accounts exist in the database.
 * Called at server startup to prevent missing login accounts.
 */
export async function ensureRequiredUsersExist(): Promise<void> {
  const DEFAULT_PASSWORD_HASH = '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu';

  const requiredUsers = [
    { username: 'brian', role: 'EMPLOYEE', firstName: 'Brian', lastName: 'Ramirez' },
  ];

  for (const u of requiredUsers) {
    try {
      const existing = await pool.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
        [u.username]
      );

      if (!existing || existing.length === 0) {
        // Look up employee record by name — try exact full name first, then partial
        let empResult = await pool.query(
          `SELECT id FROM employees WHERE LOWER(name) = $1 LIMIT 1`,
          [`${u.firstName.toLowerCase()} ${u.lastName.toLowerCase()}`]
        );
        if (!empResult || empResult.length === 0) {
          empResult = await pool.query(
            `SELECT id FROM employees WHERE LOWER(name) LIKE $1 AND LOWER(name) LIKE $2 LIMIT 1`,
            [`%${u.firstName.toLowerCase()}%`, `%${u.lastName.toLowerCase()}%`]
          );
        }
        const employeeId = empResult && empResult.length > 0 ? empResult[0].id : null;

        await pool.query(
          `INSERT INTO users (username, password, password_hash, role, is_active, first_name, last_name, employee_id, created_at, updated_at)
           VALUES ($1, $2, $2, $3, true, $4, $5, $6, NOW(), NOW())
           ON CONFLICT (username) DO NOTHING`,
          [u.username, DEFAULT_PASSWORD_HASH, u.role, u.firstName, u.lastName, employeeId]
        );
        console.log(`✅ Created missing user account: ${u.username}`);
      }
    } catch (err: any) {
      console.warn(`⚠️ Could not ensure user account for ${u.username}: ${err.message}`);
    }
  }
}

export default router;
