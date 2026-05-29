import express from 'express';
import bcrypt from 'bcrypt';
import {
  ensureUserKeypair,
  rewrapOnPasswordChange,
  rotateKey,
  hasActiveSigningKey,
  DigitalSignatureError,
} from '../services/digitalSignatureService';

/**
 * Task #145 — keep the user's signing keypair in lockstep with their
 * password. These admin routes manage `users.password_hash` directly via
 * SQL (bypassing storage.createUser / storage.updateUserPassword), so we
 * re-implement the same enrollment / rewrap / rotation behavior inline.
 *
 * Three cases:
 *   1. No active key yet → enroll a fresh one under the new password.
 *   2. Active key exists AND we have the old plaintext → rewrap in place.
 *   3. Active key exists but the OLD plaintext is unavailable (admin
 *      password reset) → rotate: revoke the old key and generate a new
 *      one under the new password. Old signatures still verify against
 *      the preserved old certificate; future signing uses the new key
 *      and the new password — no manual recovery step required.
 *
 * Failures here are logged but never block the underlying password write.
 */
async function syncSigningKeyForUser(
  userId: number,
  newPlaintextPassword: string,
  previousPlaintextPassword?: string,
): Promise<void> {
  try {
    if (previousPlaintextPassword) {
      try {
        await rewrapOnPasswordChange(userId, previousPlaintextPassword, newPlaintextPassword);
        return;
      } catch (err: any) {
        if (!(err instanceof DigitalSignatureError) || err.code !== 'NO_ACTIVE_KEY') {
          throw err;
        }
      }
      await ensureUserKeypair(userId, newPlaintextPassword);
      return;
    }
    // No old plaintext available — admin reset path. If a key already
    // exists, rotate so the new password actually unwraps it.
    const hasKey = await hasActiveSigningKey(userId);
    if (hasKey) {
      await rotateKey(userId, newPlaintextPassword, 'admin_password_reset');
    } else {
      await ensureUserKeypair(userId, newPlaintextPassword);
    }
  } catch (err) {
    console.error('[users-route] signing-key sync failed (non-fatal):', err);
  }
}
import { z } from 'zod';

import { pool } from '../../db';
import { storage } from '../../storage';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';

const router = express.Router();

const createUserSchema = z.object({
  username: z.string().min(2).max(50),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  password: z.string().min(6).max(100),
  role: z.enum(['ADMIN', 'EMPLOYEE', 'OWNER']).optional().default('EMPLOYEE'),
  employeeId: z.number().int().positive().optional().nullable(),
  canOverridePrices: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  isFinishTechnician: z.boolean().optional().default(false),
});

const updateUserSchema = createUserSchema.partial().extend({
  password: z.string().min(6).max(100).optional(),
});

// Apply authentication to ALL user management routes
// ADMIN and OWNER roles can manage users; specific mutations are further gated by requirePermission
router.use(authenticateToken);
router.use(requireRole('ADMIN', 'OWNER'));

// User Capability Management Routes (MUST be before /:id to avoid route collision)
router.get('/:id/capabilities', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const capabilities = await storage.getUserCapabilities(userId);
    res.json(capabilities);
  } catch (error) {
    console.error('Get user capabilities error:', error);
    res.status(500).json({ error: 'Failed to fetch user capabilities' });
  }
});

router.post('/:id/capabilities', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { capabilityId, useHardcoded } = req.body;
    const assignmentData = {
      userId,
      capabilityId,
      useHardcodedValue: useHardcoded ?? true,
    };
    const newAssignment = await storage.grantUserCapability(assignmentData);
    res.status(201).json(newAssignment);
  } catch (error) {
    console.error('Grant user capability error:', error);
    res.status(500).json({ error: 'Failed to grant capability' });
  }
});

router.delete('/user-capabilities/:id', async (req, res) => {
  try {
    const userCapabilityId = parseInt(req.params.id);
    await storage.revokeUserCapability(userCapabilityId);
    res.status(204).end();
  } catch (error) {
    console.error('Revoke user capability error:', error);
    res.status(500).json({ error: 'Failed to revoke capability' });
  }
});

router.patch('/user-capabilities/:id/toggle', async (req, res) => {
  try {
    const userCapabilityId = parseInt(req.params.id);
    const { useHardcoded } = req.body;
    const updatedAssignment = await storage.toggleUserHardcodedCapability(
      userCapabilityId,
      useHardcoded
    );
    res.json(updatedAssignment);
  } catch (error) {
    console.error('Toggle user hardcoded capability error:', error);
    res.status(500).json({ error: 'Failed to toggle hardcoded capability' });
  }
});

// GET all users
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.role,
        u.employee_id as "employeeId",
        u.can_override_prices as "canOverridePrices",
        u.is_active as "isActive",
        u.created_at as "createdAt",
        u.updated_at as "updatedAt",
        u.last_login as "lastLoginAt",
        u.failed_login_attempts as "failedLoginAttempts",
        u.account_locked_until as "accountLockedUntil",
        u.password_changed_at as "passwordChangedAt",
        u.locked_until as "lockedUntil",
        u.can_create_vendor_pos as "canCreateVendorPOs",
        COALESCE(e.is_finish_technician, u.is_finish_technician, false) as "isFinishTechnician",
        e.name as "employeeDisplayName"
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      ORDER BY u.username
    `);

    res.json(result);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST create new user
router.post('/', requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const validation = createUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid user data',
        details: validation.error.format()
      });
    }
    
    const {
      username,
      firstName,
      lastName,
      password,
      role,
      employeeId,
      canOverridePrices,
      isActive,
      isFinishTechnician,
    } = validation.data;

    // Check if username already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (existingUser && existingUser.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash the password - using 12 salt rounds for security consistency
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO users (
        username, 
        first_name, 
        last_name, 
        password_hash, 
        role, 
        employee_id, 
        can_override_prices, 
        is_finish_technician,
        is_active,
        password_changed_at,
        failed_login_attempts
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 0)
      RETURNING 
        id,
        username,
        first_name as "firstName",
        last_name as "lastName",
        role,
        employee_id as "employeeId",
        can_override_prices as "canOverridePrices",
        is_finish_technician as "isFinishTechnician",
        is_active as "isActive"
    `,
      [
        username,
        firstName,
        lastName,
        passwordHash,
        role || 'EMPLOYEE',
        employeeId,
        canOverridePrices || false,
        isFinishTechnician || false,
        isActive !== false,
      ]
    );

    const newUser = result[0];

    // Task #145 — auto-enroll a digital-signature keypair under the user's
    // initial password.
    await syncSigningKeyForUser(newUser.id, password);

    // If the user has an employeeId and isFinishTechnician was provided, update the employee record
    if (newUser.employeeId && isFinishTechnician !== undefined) {
      await pool.query(
        `UPDATE employees SET is_finish_technician = $1 WHERE id = $2`,
        [isFinishTechnician, newUser.employeeId]
      );
      newUser.isFinishTechnician = isFinishTechnician;
    } else if (newUser.employeeId) {
      // Fetch current isFinishTechnician status
      const empResult = await pool.query(
        `SELECT is_finish_technician as "isFinishTechnician" FROM employees WHERE id = $1`,
        [newUser.employeeId]
      );
      if (empResult && empResult.length > 0) {
        newUser.isFinishTechnician = empResult[0].isFinishTechnician;
      }
    }

    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT update user
router.put('/:id', requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      username,
      firstName,
      lastName,
      password,
      role,
      employeeId,
      canOverridePrices,
      isActive,
      isFinishTechnician,
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (username !== undefined) {
      updates.push(`username = $${paramCount++}`);
      values.push(username);
    }
    if (firstName !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(lastName);
    }
    let passwordChangedTo: string | null = null;
    if (password !== undefined && password !== '') {
      // Using 12 salt rounds for security consistency
      // SECURITY: Only store the hashed password, never plaintext
      const passwordHash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(passwordHash);
      updates.push(`password_changed_at = NOW()`);
      passwordChangedTo = password;
    }
    if (role !== undefined) {
      updates.push(`role = $${paramCount++}`);
      values.push(role);
    }
    if (employeeId !== undefined) {
      updates.push(`employee_id = $${paramCount++}`);
      values.push(employeeId);
    }
    if (canOverridePrices !== undefined) {
      updates.push(`can_override_prices = $${paramCount++}`);
      values.push(canOverridePrices);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }
    if (isFinishTechnician !== undefined) {
      updates.push(`is_finish_technician = $${paramCount++}`);
      values.push(isFinishTechnician);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING 
        id,
        username,
        first_name as "firstName",
        last_name as "lastName",
        role,
        employee_id as "employeeId",
        can_override_prices as "canOverridePrices",
        is_finish_technician as "isFinishTechnician",
        is_active as "isActive"
    `,
      values
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result[0];

    // Task #145 — re-enroll the digital-signature keypair under the new
    // password. We don't have the OLD plaintext at this admin-managed
    // route, so we fall back to enrolling a fresh keypair when one is
    // missing; an existing key whose old password we can't supply will be
    // left in place (the user can rotate it manually via the
    // /api/digital-signatures/keys/rotate endpoint).
    if (passwordChangedTo) {
      await syncSigningKeyForUser(Number(id), passwordChangedTo);
    }

    // If the user has an employeeId and isFinishTechnician was provided, update the employee record
    if (updatedUser.employeeId && isFinishTechnician !== undefined) {
      await pool.query(
        `UPDATE employees SET is_finish_technician = $1 WHERE id = $2`,
        [isFinishTechnician, updatedUser.employeeId]
      );
      updatedUser.isFinishTechnician = isFinishTechnician;
    } else if (updatedUser.employeeId) {
      // Fetch current isFinishTechnician status if not updated
      const empResult = await pool.query(
        `SELECT is_finish_technician as "isFinishTechnician" FROM employees WHERE id = $1`,
        [updatedUser.employeeId]
      );
      if (empResult && empResult.length > 0) {
        updatedUser.isFinishTechnician = empResult[0].isFinishTechnician;
      }
    }

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE user (soft delete by setting isActive to false)
router.delete('/:id', requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
      [id]
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
