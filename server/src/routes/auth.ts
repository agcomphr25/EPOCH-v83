import { Router } from 'express';
import bcrypt from 'bcryptjs';

const router = Router();

// Simple in-memory session store
const sessions = new Map<string, { username: string; expiresAt: number }>();

// Hardcoded test users mapped from dashboardMapping.ts
// Password for all users is 'test123' (hashed with bcrypt)
// Hash: $2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu
const USERS = new Map([
  ['epoch', { id: 1, username: 'epoch', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'admin' }],
  ['glennj', { id: 2, username: 'glennj', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'admin' }],
  ['tasham', { id: 3, username: 'tasham', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'admin' }],
  ['staciw', { id: 4, username: 'staciw', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['agrace', { id: 5, username: 'agrace', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['tims', { id: 6, username: 'tims', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['angiet', { id: 7, username: 'angiet', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['blaket', { id: 8, username: 'blaket', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['bradw', { id: 9, username: 'bradw', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['darleneb', { id: 10, username: 'darleneb', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['faleeshah', { id: 11, username: 'faleeshah', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['halls', { id: 12, username: 'halls', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['hunta', { id: 13, username: 'hunta', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['jens', { id: 14, username: 'jens', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['joeyb', { id: 15, username: 'joeyb', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['johnl', { id: 16, username: 'johnl', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['lauriet', { id: 17, username: 'lauriet', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['tandyd', { id: 18, username: 'tandyd', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
  ['tandym', { id: 19, username: 'tandym', password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu', role: 'user' }],
]);

// Generate simple session token
function generateSessionToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('🔐 Login attempt:', { username, passwordLength: password?.length });

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user
    const user = USERS.get(username.toLowerCase());

    if (!user) {
      console.log('❌ User not found:', username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    console.log('✅ User found:', username);

    // Verify password (all test users use password 'test123')
    const isValidPassword = await bcrypt.compare(password, user.password);

    console.log('🔑 Password verification:', { isValid: isValidPassword });

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

    // Store session
    sessions.set(sessionToken, {
      username: user.username,
      expiresAt
    });

    // Set HTTP-only cookie
    res.cookie('sessionToken', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      sessionToken, // Also return in body for compatibility
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    
    if (sessionToken) {
      sessions.delete(sessionToken);
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
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionToken) {
      return res.status(401).json({ valid: false });
    }

    const session = sessions.get(sessionToken);
    
    if (!session || session.expiresAt < Date.now()) {
      if (session) {
        sessions.delete(sessionToken);
      }
      return res.status(401).json({ valid: false });
    }

    // Get user data from hardcoded users
    const user = USERS.get(session.username.toLowerCase());

    if (!user) {
      sessions.delete(sessionToken);
      return res.status(401).json({ valid: false });
    }

    res.json({ 
      valid: true, 
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ valid: false });
  }
});

// Get current user session
router.get('/session', async (req, res) => {
  try {
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const session = sessions.get(sessionToken);
    
    if (!session || session.expiresAt < Date.now()) {
      if (session) {
        sessions.delete(sessionToken);
      }
      return res.status(401).json({ error: 'Session expired' });
    }

    // Get user data from hardcoded users
    const user = USERS.get(session.username.toLowerCase());

    if (!user) {
      sessions.delete(sessionToken);
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

export default router;
