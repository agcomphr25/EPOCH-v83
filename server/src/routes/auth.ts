import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../../db';
import { HARDCODED_USERS } from '../../hardcoded-users';

const router = Router();

// Use shared hardcoded users for backward compatibility
const USERS = HARDCODED_USERS;

// Generate simple session token
function generateSessionToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: 'Username and password are required' });
    }

    // Try to find user in database first
    const dbUserResult = await pool.query(
      `SELECT id, username, password_hash, role, is_active 
       FROM users 
       WHERE LOWER(username) = LOWER($1)`,
      [username]
    );

    let user: any;
    let isValidPassword = false;

    if (dbUserResult && dbUserResult.length > 0) {
      // User exists in database
      const dbUser = dbUserResult[0];

      // Check if user is active
      if (!dbUser.is_active) {
        return res.status(401).json({ error: 'Account is inactive' });
      }

      // Verify password against database hash
      isValidPassword = await bcrypt.compare(password, dbUser.password_hash);

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

    // Set role-based idle timeout
    // ADMIN and OWNER: 30 minutes, EMPLOYEE: 15 minutes
    const timeoutMinutes =
      user.role === 'ADMIN' || user.role === 'OWNER' ? 30 : 15;
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

    // Store session in database for persistence
    await pool.query(
      `INSERT INTO user_sessions (session_token, user_id, username, expires_at, last_activity_at, is_active) 
       VALUES ($1, $2, $3, $4, NOW(), true)
       ON CONFLICT (session_token) DO UPDATE 
       SET expires_at = $4, last_activity_at = NOW(), is_active = true`,
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
      maxAge: timeoutMinutes * 60 * 1000, // Role-based timeout
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

    // Query database for session with last activity
    const result = await pool.query(
      `SELECT us.user_id, us.username, us.last_activity_at, u.role 
       FROM user_sessions us
       LEFT JOIN users u ON us.user_id = u.id
       WHERE us.session_token = $1 AND us.is_active = true`,
      [sessionToken]
    );

    if (!result || result.length === 0) {
      return res.status(401).json({ valid: false });
    }

    const session = result[0];

    // Get user role (fallback for hardcoded users)
    let userRole = session.role;
    if (!userRole) {
      const hardcodedUser = USERS.get(session.username.toLowerCase());
      if (hardcodedUser) {
        userRole = hardcodedUser.role;
      } else {
        // Unknown user - reject
        await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [
          sessionToken,
        ]);
        return res.status(401).json({ valid: false, reason: 'User not found' });
      }
    }

    // Calculate idle timeout based on role
    // ADMIN and OWNER: 30 minutes, EMPLOYEE: 15 minutes
    const timeoutMinutes =
      userRole === 'ADMIN' || userRole === 'OWNER' ? 30 : 15;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Handle NULL last_activity_at (legacy sessions) by treating as current time
    const lastActivity = session.last_activity_at
      ? new Date(session.last_activity_at).getTime()
      : Date.now();
    const now = Date.now();

    // Check if session has been idle too long
    if (now - lastActivity > timeoutMs) {
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [
        sessionToken,
      ]);
      return res
        .status(401)
        .json({ valid: false, reason: 'Session expired due to inactivity' });
    }

    // Update last activity timestamp
    await pool.query(
      'UPDATE user_sessions SET last_activity_at = NOW() WHERE session_token = $1',
      [sessionToken]
    );

    // Try to get user data from database first
    const dbUserResult = await pool.query(
      `SELECT id, username, role FROM users WHERE username = $1 AND is_active = true`,
      [session.username.toLowerCase()]
    );

    let user: any;

    if (dbUserResult && dbUserResult.length > 0) {
      user = dbUserResult[0];
    } else {
      // Fall back to hardcoded users
      user = USERS.get(session.username.toLowerCase());
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
    const sessionToken =
      req.cookies?.sessionToken ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Query database for session with last activity
    const result = await pool.query(
      `SELECT us.user_id, us.username, us.last_activity_at, u.role 
       FROM user_sessions us
       LEFT JOIN users u ON us.user_id = u.id
       WHERE us.session_token = $1 AND us.is_active = true`,
      [sessionToken]
    );

    if (!result || result.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const session = result[0];

    // Get user role (fallback for hardcoded users)
    let userRole = session.role;
    if (!userRole) {
      const hardcodedUser = USERS.get(session.username.toLowerCase());
      if (hardcodedUser) {
        userRole = hardcodedUser.role;
      } else {
        // Unknown user - reject
        await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [
          sessionToken,
        ]);
        return res.status(401).json({ valid: false, reason: 'User not found' });
      }
    }

    // Calculate idle timeout based on role
    // ADMIN and OWNER: 30 minutes, EMPLOYEE: 15 minutes
    const timeoutMinutes =
      userRole === 'ADMIN' || userRole === 'OWNER' ? 30 : 15;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Handle NULL last_activity_at (legacy sessions) by treating as current time
    const lastActivity = session.last_activity_at
      ? new Date(session.last_activity_at).getTime()
      : Date.now();
    const now = Date.now();

    // Check if session has been idle too long
    if (now - lastActivity > timeoutMs) {
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [
        sessionToken,
      ]);
      return res
        .status(401)
        .json({ error: 'Session expired due to inactivity' });
    }

    // Update last activity timestamp
    await pool.query(
      'UPDATE user_sessions SET last_activity_at = NOW() WHERE session_token = $1',
      [sessionToken]
    );

    // Try to get user data from database first
    const dbUserResult = await pool.query(
      `SELECT id, username, first_name, last_name, role FROM users WHERE username = $1 AND is_active = true`,
      [session.username.toLowerCase()]
    );

    let user: any;

    if (dbUserResult && dbUserResult.length > 0) {
      user = dbUserResult[0];
    } else {
      // Fall back to hardcoded users
      user = USERS.get(session.username.toLowerCase());
    }

    if (!user) {
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [
        sessionToken,
      ]);
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

export default router;
