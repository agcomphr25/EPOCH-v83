import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { z } from 'zod';

const router = Router();

// User schema for validation
const insertUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  role: z.string().optional().default('EMPLOYEE'),
  employeeId: z.number().optional(),
  canOverridePrices: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true)
});

const updateUserSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(4).optional(),
  role: z.string().optional(),
  employeeId: z.number().optional(),
  canOverridePrices: z.boolean().optional(),
  isActive: z.boolean().optional()
});

// Get all users
router.get('/', async (req: Request, res: Response) => {
  try {
    const users = await storage.getAllUsers();
    // Remove password hash from response for security
    const sanitizedUsers = users.map(user => {
      const { passwordHash, password, ...sanitizedUser } = user;
      return sanitizedUser;
    });
    res.json(sanitizedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get user by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remove password hash from response for security
    const { passwordHash, password, ...sanitizedUser } = user;
    res.json(sanitizedUser);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Create new user
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('Creating user with data:', req.body);
    
    const userData = insertUserSchema.parse(req.body);
    
    // Check if username already exists
    const existingUser = await storage.getUserByUsername(userData.username);
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const newUser = await storage.createUser(userData);
    console.log('User created successfully:', newUser.id);

    // Remove password hash from response for security
    const { passwordHash, password, ...sanitizedUser } = newUser;
    res.status(201).json(sanitizedUser);
  } catch (error) {
    console.error('Error creating user:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      });
    }
    res.status(500).json({ 
      error: "Failed to create user", 
      details: error.message 
    });
  }
});

// Update user
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    console.log(`Updating user ${id} with data:`, req.body);
    
    const userData = updateUserSchema.parse(req.body);
    
    // Check if user exists
    const existingUser = await storage.getUser(id);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // If username is being updated, check if new username already exists
    if (userData.username && userData.username !== existingUser.username) {
      const userWithSameUsername = await storage.getUserByUsername(userData.username);
      if (userWithSameUsername && userWithSameUsername.id !== id) {
        return res.status(400).json({ error: "Username already exists" });
      }
    }

    // If password is being updated, ensure it gets hashed
    if (userData.password) {
      const { AuthService } = require('../../auth');
      const passwordHash = await AuthService.hashPassword(userData.password);
      userData = { ...userData, passwordHash };
    }

    const updatedUser = await storage.updateUser(id, userData);
    console.log('User updated successfully:', updatedUser.id);

    // Remove password hash from response for security  
    const { passwordHash, password, ...sanitizedUser } = updatedUser;
    res.json(sanitizedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      });
    }
    res.status(500).json({ 
      error: "Failed to update user", 
      details: error.message 
    });
  }
});

// Delete user
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    console.log(`Attempting to delete user ${id}`);
    
    // Check if user exists
    const existingUser = await storage.getUser(id);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // For safety, instead of actual deletion, we'll deactivate the user
    // This preserves audit trail and prevents orphaned records
    await storage.updateUser(id, { isActive: false });
    console.log(`User ${id} deactivated successfully`);

    res.json({ 
      success: true, 
      message: "User has been deactivated for safety. Account is no longer active." 
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      error: "Failed to delete user", 
      details: error.message 
    });
  }
});

// Reset user password (admin only)
router.post('/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: "New password must be at least 4 characters" });
    }

    console.log(`Resetting password for user ${id}`);
    
    // Check if user exists
    const existingUser = await storage.getUser(id);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    await storage.updateUser(id, { password: newPassword });
    console.log(`Password reset successfully for user ${id}`);

    res.json({ 
      success: true, 
      message: "Password has been reset successfully" 
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ 
      error: "Failed to reset password", 
      details: error.message 
    });
  }
});

export default router;