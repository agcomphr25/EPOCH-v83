import express from 'express';
import { pool } from '../../db';
import bcrypt from 'bcrypt';
import { storage } from '../../storage';

const router = express.Router();

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
        id,
        username,
        first_name as "firstName",
        last_name as "lastName",
        role,
        employee_id as "employeeId",
        can_override_prices as "canOverridePrices",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_login_at as "lastLoginAt",
        failed_login_attempts as "failedLoginAttempts",
        account_locked_until as "accountLockedUntil",
        password_changed_at as "passwordChangedAt",
        locked_until as "lockedUntil",
        can_create_vendor_pos as "canCreateVendorPOs"
      FROM users
      ORDER BY username
    `);

    res.json(result);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST create new user
router.post('/', async (req, res) => {
  try {
    const {
      username,
      firstName,
      lastName,
      password,
      role,
      employeeId,
      canOverridePrices,
      isActive,
    } = req.body;

    // Check if username already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (existingUser && existingUser.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (
        username, 
        first_name, 
        last_name, 
        password, 
        password_hash, 
        role, 
        employee_id, 
        can_override_prices, 
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
        is_active as "isActive"
    `,
      [
        username,
        firstName,
        lastName,
        password,
        passwordHash,
        role || 'EMPLOYEE',
        employeeId,
        canOverridePrices || false,
        isActive !== false,
      ]
    );

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT update user
router.put('/:id', async (req, res) => {
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
    if (password !== undefined && password !== '') {
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push(`password = $${paramCount++}`);
      values.push(password);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(passwordHash);
      updates.push(`password_changed_at = NOW()`);
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
        is_active as "isActive"
    `,
      values
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE user (soft delete by setting isActive to false)
router.delete('/:id', async (req, res) => {
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
