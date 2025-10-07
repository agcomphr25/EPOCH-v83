import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'epoch-v8-secret-key-change-in-production';

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  console.log('🔐 LOGIN START: Login attempt with username:', req.body.username);
  
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('❌ LOGIN FAILED: Missing username or password');
      return res.status(400).json({ error: "Username and password are required" });
    }

    console.log('🔍 LOGIN STEP 1: Basic validation passed for user:', username);

    // Query user from database
    const result = await db.execute(
      sql`SELECT id, username, password_hash, role, employee_id, can_override_prices, is_active 
          FROM users 
          WHERE username = ${username} 
          LIMIT 1`
    );

    const user = result.rows[0] as any;

    if (!user) {
      console.log('❌ LOGIN FAILED: User not found:', username);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    console.log('🔍 LOGIN STEP 2: User found, checking password...');

    // Check if account is active
    if (!user.is_active) {
      console.log('❌ LOGIN FAILED: Account is inactive:', username);
      return res.status(403).json({ error: "Account is inactive" });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      console.log('❌ LOGIN FAILED: Invalid password for user:', username);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    console.log('✅ LOGIN STEP 3: Password valid, generating token...');

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.employee_id
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Update last login time
    await db.execute(
      sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`
    );

    console.log('✅ LOGIN COMPLETE: Sending successful response for user:', username);

    // Send response
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.employee_id,
        canOverridePrices: user.can_override_prices
      },
      token
    });
  } catch (error) {
    console.error('❌ LOGIN ERROR:', error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  res.json({ success: true });
});

// GET /api/auth/session
router.get('/session', async (req: Request, res: Response) => {
  try {
    // For development, return a mock user
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 BACKEND AUTH BYPASS: Development environment - session check skipped');
      return res.json({
        id: 999,
        username: 'dev-user',
        role: 'ADMIN',
        employeeId: null,
        isActive: true,
        canOverridePrices: true
      });
    }

    // In production, check for JWT token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Query user from database
    const result = await db.execute(
      sql`SELECT id, username, role, employee_id, can_override_prices, is_active 
          FROM users 
          WHERE id = ${decoded.userId} 
          LIMIT 1`
    );

    const user = result.rows[0] as any;

    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid session" });
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employee_id,
      isActive: user.is_active,
      canOverridePrices: user.can_override_prices
    });
  } catch (error) {
    console.error('Session check error:', error);
    res.status(401).json({ error: "Invalid session" });
  }
});

// GET /api/auth/validate  
router.get('/validate', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ valid: false, error: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    res.json({
      valid: true,
      user: {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role
      }
    });
  } catch (error) {
    res.status(401).json({ valid: false, error: "Invalid session" });
  }
});

export default router;
