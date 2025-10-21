import { Router } from 'express';
import bcrypt from 'bcryptjs';

import { pool } from '../../db';

const router = Router();

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
]);

// Generate cryptographically secure session token
function generateSessionToken(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
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
      'SELECT user_id, username, expires_at FROM user_sessions WHERE session_token = $1',
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

    // Query database for session
    const result = await pool.query(
      'SELECT user_id, username, expires_at FROM user_sessions WHERE session_token = $1',
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
