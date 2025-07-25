import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertTaskItemSchema } from '@shared/schema';

const router = Router();

// Task Tracker Management
router.get('/', async (req: Request, res: Response) => {
  try {
    const tasks = await storage.getAllTaskItems();
    res.json(tasks);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    const task = await storage.getTaskItemById(taskId);
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    res.json(task);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: "Failed to fetch task" });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const taskData = insertTaskItemSchema.parse(req.body);
    const newTask = await storage.createTaskItem(taskData);
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Create task error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create task" });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    const updates = req.body;
    const updatedTask = await storage.updateTaskItem(taskId, updates);
    res.json(updatedTask);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    const statusData = req.body;
    const updatedTask = await storage.updateTaskItemStatus(taskId, statusData);
    res.json(updatedTask);
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ error: "Failed to update task status" });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    await storage.deleteTaskItem(taskId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;