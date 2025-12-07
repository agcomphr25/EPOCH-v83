import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { 
  preproductionTemplates, 
  preproductionTemplateSections, 
  preproductionTemplateTasks,
  preproductionChecklists, 
  preproductionChecklistSections, 
  preproductionChecklistTasks,
  employees,
  insertPreproductionTemplateSchema,
  insertPreproductionChecklistSchema,
} from '../../schema';
import { eq, desc, asc, and, sql } from 'drizzle-orm';

const router = Router();

// =========================
// TEMPLATES
// =========================

// Get all templates
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const templates = await db
      .select()
      .from(preproductionTemplates)
      .where(eq(preproductionTemplates.isActive, true))
      .orderBy(desc(preproductionTemplates.createdAt));
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get template with sections and tasks
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const template = await db
      .select()
      .from(preproductionTemplates)
      .where(eq(preproductionTemplates.id, id))
      .limit(1);
    
    if (!template.length) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const sections = await db
      .select()
      .from(preproductionTemplateSections)
      .where(eq(preproductionTemplateSections.templateId, id))
      .orderBy(asc(preproductionTemplateSections.sortOrder));
    
    const sectionsWithTasks = await Promise.all(
      sections.map(async (section) => {
        const tasks = await db
          .select()
          .from(preproductionTemplateTasks)
          .where(eq(preproductionTemplateTasks.sectionId, section.id))
          .orderBy(asc(preproductionTemplateTasks.sortOrder));
        return { ...section, tasks };
      })
    );
    
    res.json({ ...template[0], sections: sectionsWithTasks });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Create template
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const parsed = insertPreproductionTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid template data', details: parsed.error });
    }
    
    const [template] = await db
      .insert(preproductionTemplates)
      .values(parsed.data)
      .returning();
    
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template
router.patch('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [template] = await db
      .update(preproductionTemplates)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(preproductionTemplates.id, id))
      .returning();
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Add section to template
router.post('/templates/:id/sections', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, sortOrder } = req.body;
    
    const [section] = await db
      .insert(preproductionTemplateSections)
      .values({ templateId: id, name, sortOrder: sortOrder || 0 })
      .returning();
    
    res.status(201).json(section);
  } catch (error) {
    console.error('Error adding section:', error);
    res.status(500).json({ error: 'Failed to add section' });
  }
});

// Add task to section
router.post('/templates/sections/:sectionId/tasks', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { description, sortOrder } = req.body;
    
    const [task] = await db
      .insert(preproductionTemplateTasks)
      .values({ sectionId, description, sortOrder: sortOrder || 0 })
      .returning();
    
    res.status(201).json(task);
  } catch (error) {
    console.error('Error adding task:', error);
    res.status(500).json({ error: 'Failed to add task' });
  }
});

// Delete template section
router.delete('/templates/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    await db.delete(preproductionTemplateSections).where(eq(preproductionTemplateSections.id, sectionId));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting section:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// Delete template task
router.delete('/templates/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    await db.delete(preproductionTemplateTasks).where(eq(preproductionTemplateTasks.id, taskId));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Update template section
router.patch('/templates/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const [section] = await db
      .update(preproductionTemplateSections)
      .set(req.body)
      .where(eq(preproductionTemplateSections.id, sectionId))
      .returning();
    res.json(section);
  } catch (error) {
    console.error('Error updating section:', error);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// Update template task
router.patch('/templates/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const [task] = await db
      .update(preproductionTemplateTasks)
      .set(req.body)
      .where(eq(preproductionTemplateTasks.id, taskId))
      .returning();
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// =========================
// CHECKLISTS
// =========================

// Get all checklists
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    
    let query = db.select().from(preproductionChecklists);
    
    if (status && status !== 'all') {
      query = query.where(eq(preproductionChecklists.status, status as string)) as any;
    }
    
    const checklists = await query.orderBy(desc(preproductionChecklists.createdAt));
    
    // Get progress for each checklist
    const checklistsWithProgress = await Promise.all(
      checklists.map(async (checklist) => {
        const sections = await db
          .select()
          .from(preproductionChecklistSections)
          .where(eq(preproductionChecklistSections.checklistId, checklist.id));
        
        let totalTasks = 0;
        let completedTasks = 0;
        
        for (const section of sections) {
          const tasks = await db
            .select()
            .from(preproductionChecklistTasks)
            .where(eq(preproductionChecklistTasks.sectionId, section.id));
          
          totalTasks += tasks.length;
          completedTasks += tasks.filter(t => t.isCompleted).length;
        }
        
        return {
          ...checklist,
          progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          totalTasks,
          completedTasks,
        };
      })
    );
    
    res.json(checklistsWithProgress);
  } catch (error) {
    console.error('Error fetching checklists:', error);
    res.status(500).json({ error: 'Failed to fetch checklists' });
  }
});

// Get single checklist with all details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const checklist = await db
      .select()
      .from(preproductionChecklists)
      .where(eq(preproductionChecklists.id, id))
      .limit(1);
    
    if (!checklist.length) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    
    const sections = await db
      .select()
      .from(preproductionChecklistSections)
      .where(eq(preproductionChecklistSections.checklistId, id))
      .orderBy(asc(preproductionChecklistSections.sortOrder));
    
    const sectionsWithTasks = await Promise.all(
      sections.map(async (section) => {
        const tasks = await db
          .select()
          .from(preproductionChecklistTasks)
          .where(eq(preproductionChecklistTasks.sectionId, section.id))
          .orderBy(asc(preproductionChecklistTasks.sortOrder));
        
        const completedCount = tasks.filter(t => t.isCompleted).length;
        
        return { 
          ...section, 
          tasks,
          progress: tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0,
        };
      })
    );
    
    const totalTasks = sectionsWithTasks.reduce((sum, s) => sum + s.tasks.length, 0);
    const completedTasks = sectionsWithTasks.reduce(
      (sum, s) => sum + s.tasks.filter(t => t.isCompleted).length, 
      0
    );
    
    res.json({ 
      ...checklist[0], 
      sections: sectionsWithTasks,
      progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      totalTasks,
      completedTasks,
    });
  } catch (error) {
    console.error('Error fetching checklist:', error);
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
});

// Create checklist from template
router.post('/', async (req: Request, res: Response) => {
  try {
    const { templateId, ...checklistData } = req.body;
    
    // Create the checklist
    const [checklist] = await db
      .insert(preproductionChecklists)
      .values({ ...checklistData, templateId })
      .returning();
    
    // If a template is specified, copy its sections and tasks
    if (templateId) {
      const templateSections = await db
        .select()
        .from(preproductionTemplateSections)
        .where(eq(preproductionTemplateSections.templateId, templateId))
        .orderBy(asc(preproductionTemplateSections.sortOrder));
      
      for (const templateSection of templateSections) {
        const [newSection] = await db
          .insert(preproductionChecklistSections)
          .values({
            checklistId: checklist.id,
            name: templateSection.name,
            sortOrder: templateSection.sortOrder,
          })
          .returning();
        
        const templateTasks = await db
          .select()
          .from(preproductionTemplateTasks)
          .where(eq(preproductionTemplateTasks.sectionId, templateSection.id))
          .orderBy(asc(preproductionTemplateTasks.sortOrder));
        
        for (const templateTask of templateTasks) {
          await db.insert(preproductionChecklistTasks).values({
            sectionId: newSection.id,
            description: templateTask.description,
            sortOrder: templateTask.sortOrder,
          });
        }
      }
    }
    
    res.status(201).json(checklist);
  } catch (error) {
    console.error('Error creating checklist:', error);
    res.status(500).json({ error: 'Failed to create checklist' });
  }
});

// Update checklist
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [checklist] = await db
      .update(preproductionChecklists)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(preproductionChecklists.id, id))
      .returning();
    
    if (!checklist) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    
    res.json(checklist);
  } catch (error) {
    console.error('Error updating checklist:', error);
    res.status(500).json({ error: 'Failed to update checklist' });
  }
});

// Delete checklist
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.delete(preproductionChecklists).where(eq(preproductionChecklists.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting checklist:', error);
    res.status(500).json({ error: 'Failed to delete checklist' });
  }
});

// Add section to checklist
router.post('/:id/sections', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, sortOrder } = req.body;
    
    const [section] = await db
      .insert(preproductionChecklistSections)
      .values({ checklistId: id, name, sortOrder: sortOrder || 0 })
      .returning();
    
    res.status(201).json(section);
  } catch (error) {
    console.error('Error adding section:', error);
    res.status(500).json({ error: 'Failed to add section' });
  }
});

// Update checklist section
router.patch('/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const [section] = await db
      .update(preproductionChecklistSections)
      .set(req.body)
      .where(eq(preproductionChecklistSections.id, sectionId))
      .returning();
    res.json(section);
  } catch (error) {
    console.error('Error updating section:', error);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// Delete checklist section
router.delete('/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    await db.delete(preproductionChecklistSections).where(eq(preproductionChecklistSections.id, sectionId));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting section:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// Add task to checklist section
router.post('/sections/:sectionId/tasks', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.params;
    const { description, sortOrder, assignedTo, assignedToEmployeeId } = req.body;
    
    const [task] = await db
      .insert(preproductionChecklistTasks)
      .values({ sectionId, description, sortOrder: sortOrder || 0, assignedTo, assignedToEmployeeId })
      .returning();
    
    res.status(201).json(task);
  } catch (error) {
    console.error('Error adding task:', error);
    res.status(500).json({ error: 'Failed to add task' });
  }
});

// Update checklist task
router.patch('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const updates = { ...req.body, updatedAt: new Date() };
    
    // If marking as completed, set completedAt
    if (req.body.isCompleted === true && !req.body.completedAt) {
      updates.completedAt = new Date();
    }
    // If marking as not completed, clear completedAt and completedBy
    if (req.body.isCompleted === false) {
      updates.completedAt = null;
      updates.completedBy = null;
    }
    
    const [task] = await db
      .update(preproductionChecklistTasks)
      .set(updates)
      .where(eq(preproductionChecklistTasks.id, taskId))
      .returning();
    
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete checklist task
router.delete('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    await db.delete(preproductionChecklistTasks).where(eq(preproductionChecklistTasks.id, taskId));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Sign off checklist
router.post('/:id/sign-off', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { signatureData, signedBy } = req.body;
    
    const [checklist] = await db
      .update(preproductionChecklists)
      .set({
        signatureData,
        signedBy,
        signedAt: new Date(),
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(preproductionChecklists.id, id))
      .returning();
    
    res.json(checklist);
  } catch (error) {
    console.error('Error signing checklist:', error);
    res.status(500).json({ error: 'Failed to sign checklist' });
  }
});

// Get employees for assignment dropdown
router.get('/employees/list', async (req: Request, res: Response) => {
  try {
    const employeeList = await db
      .select({ id: employees.id, name: employees.name, email: employees.email })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));
    
    res.json(employeeList);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

export default router;
