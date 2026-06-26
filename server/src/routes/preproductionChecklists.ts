import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { storage } from '../../storage';
import { requirePermission } from '../../middleware/requirePermission';
import { 
  preproductionTemplates, 
  preproductionTemplateSections, 
  preproductionTemplateTasks,
  preproductionChecklists, 
  preproductionChecklistSections, 
  preproductionChecklistTasks,
  employees,
  users,
  p2PurchaseOrders,
  insertPreproductionTemplateSchema,
  insertPreproductionChecklistSchema,
} from '../../schema';
import { eq, desc, asc, and, sql } from 'drizzle-orm';

const router = Router();

const normalizeDepartmentName = (name: unknown) =>
  typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';

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

// Get reusable department names from existing active templates.
router.get('/templates/departments', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ name: preproductionTemplateSections.name })
      .from(preproductionTemplateSections)
      .innerJoin(
        preproductionTemplates,
        eq(preproductionTemplateSections.templateId, preproductionTemplates.id)
      )
      .where(eq(preproductionTemplates.isActive, true))
      .orderBy(asc(preproductionTemplateSections.name));

    const departments = Array.from(
      new Set(rows.map((row) => normalizeDepartmentName(row.name)).filter(Boolean))
    );

    res.json(departments);
  } catch (error) {
    console.error('Error fetching preproduction departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// Create a complete template with department sections and task rows.
router.post('/templates/wizard', async (req: Request, res: Response) => {
  try {
    const { sections = [], ...templateData } = req.body;
    const parsed = insertPreproductionTemplateSchema.safeParse(templateData);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid template data', details: parsed.error });
    }

    const cleanSections = Array.isArray(sections)
      ? sections
          .map((section: any, index: number) => ({
            name: normalizeDepartmentName(section?.name),
            sortOrder: Number.isFinite(Number(section?.sortOrder))
              ? Number(section.sortOrder)
              : index + 1,
            tasks: Array.isArray(section?.tasks)
              ? section.tasks
                  .map((task: any, taskIndex: number) => ({
                    description: typeof task === 'string'
                      ? task.trim()
                      : typeof task?.description === 'string'
                        ? task.description.trim()
                        : '',
                    sortOrder: Number.isFinite(Number(task?.sortOrder))
                      ? Number(task.sortOrder)
                      : taskIndex + 1,
                  }))
                  .filter((task: any) => task.description)
              : [],
          }))
          .filter((section: any) => section.name && section.tasks.length > 0)
      : [];

    if (cleanSections.length === 0) {
      return res.status(400).json({ error: 'Add at least one department with one task' });
    }

    const [template] = await db
      .insert(preproductionTemplates)
      .values(parsed.data)
      .returning();

    for (const section of cleanSections) {
      const [createdSection] = await db
        .insert(preproductionTemplateSections)
        .values({
          templateId: template.id,
          name: section.name,
          sortOrder: section.sortOrder,
        })
        .returning();

      for (const task of section.tasks) {
        await db.insert(preproductionTemplateTasks).values({
          sectionId: createdSection.id,
          description: task.description,
          sortOrder: task.sortOrder,
        });
      }
    }

    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template from wizard:', error);
    res.status(500).json({ error: 'Failed to create template from wizard' });
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
    const { templateId, assignedProjectId, ...checklistData } = req.body;
    
    // Convert date strings to Date objects for timestamp fields
    const dateFields = [
      'targetCompletionDate', 'qualityTeamDate', 'generalDate', 
      'cuttingTableDate', 'layupDate', 'moldAssemblyDate', 
      'finishDate', 'qcShippingDate', 'dueDate',
      'preProductionDueDate', 'materialArrivalDate', 'firstArticleDueDate',
      'as9102CompletionDate', 'firstArticleApprovedDate', 'fullProductionStartDate', 'poDueDate'
    ];
    
    for (const field of dateFields) {
      if (checklistData[field] && typeof checklistData[field] === 'string') {
        checklistData[field] = new Date(checklistData[field]);
      }
    }
    
    // Auto-generate projectId if not provided (format: PRE + timestamp)
    if (!checklistData.projectId && assignedProjectId) {
      checklistData.projectId = assignedProjectId;
    } else if (!checklistData.projectId) {
      const timestamp = Date.now().toString(36).toUpperCase();
      checklistData.projectId = `PRE${timestamp}`;
    }
    
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

    if (assignedProjectId) {
      const steps = await storage.getProjectSteps(assignedProjectId);
      const preproductionStep = steps.find((step) => step.stepType === 'preproduction_checklist');

      if (preproductionStep) {
        await storage.updateProjectStep(preproductionStep.id, {
          linkedPreproductionChecklistId: checklist.id,
          status: preproductionStep.status === 'pending' ? 'in_progress' : preproductionStep.status,
          startedAt: preproductionStep.startedAt || new Date(),
        } as any);
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
    const updateData = { ...req.body };
    
    // Convert date strings to Date objects for timestamp fields
    const dateFields = [
      'targetCompletionDate', 'qualityTeamDate', 'generalDate', 
      'cuttingTableDate', 'layupDate', 'moldAssemblyDate', 
      'finishDate', 'qcShippingDate', 'dueDate',
      'preProductionDueDate', 'materialArrivalDate', 'firstArticleDueDate',
      'as9102CompletionDate', 'firstArticleApprovedDate', 'fullProductionStartDate',
      'poDueDate'
    ];
    
    for (const field of dateFields) {
      if (updateData[field] && typeof updateData[field] === 'string') {
        updateData[field] = new Date(updateData[field]);
      }
    }
    
    const [checklist] = await db
      .update(preproductionChecklists)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(preproductionChecklists.id, id))
      .returning();
    
    if (!checklist) {
      return res.status(404).json({ error: 'Checklist not found' });
    }

    // When checklist is marked completed, advance the linked P2 PO to READY_FOR_PRODUCTION
    if (updateData.status === 'completed' && checklist.poNumber) {
      await db
        .update(p2PurchaseOrders)
        .set({ status: 'READY_FOR_PRODUCTION', updatedAt: new Date() })
        .where(eq(p2PurchaseOrders.poNumber, checklist.poNumber));
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
    
    // Get current task to check if assignment is changing
    const [currentTask] = await db
      .select()
      .from(preproductionChecklistTasks)
      .where(eq(preproductionChecklistTasks.id, taskId))
      .limit(1);
    
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
    
    // Send notification if assignment changed to a new employee
    if (
      req.body.assignedToEmployeeId && 
      req.body.assignedToEmployeeId !== currentTask?.assignedToEmployeeId
    ) {
      try {
        // Get the checklist info for the notification
        const [section] = await db
          .select()
          .from(preproductionChecklistSections)
          .where(eq(preproductionChecklistSections.id, task.sectionId))
          .limit(1);
        
        if (section) {
          const [checklist] = await db
            .select()
            .from(preproductionChecklists)
            .where(eq(preproductionChecklists.id, section.checklistId))
            .limit(1);
          
          if (checklist) {
            // Get employee info for notification
            const [employee] = await db
              .select()
              .from(employees)
              .where(eq(employees.id, req.body.assignedToEmployeeId))
              .limit(1);
            
            if (employee) {
              // Look up user by employeeId to get userId for notification
              const [user] = await db
                .select()
                .from(users)
                .where(eq(users.employeeId, employee.id))
                .limit(1);
              
              // Create internal message notification
              const { storage } = await import('../../storage');
              await storage.createInternalMessage({
                subject: `New Task Assigned: ${checklist.projectName}`,
                message: `You have been assigned a new task:\n\n"${task.description}"\n\nProject: ${checklist.projectName}\nSection: ${section.name}\n\nView your tasks in My Tasks on your dashboard.`,
                senderId: 1, // System sender
                senderName: 'System',
                recipientType: 'person',
                recipientUserId: user?.id || undefined,
                recipientName: employee.name,
                isUrgent: false,
                hasReminder: false,
              });
            }
          }
        }
      } catch (notifyError) {
        console.error('Failed to send task assignment notification:', notifyError);
        // Don't fail the request if notification fails
      }
    }
    
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

// Get all tasks assigned to a specific employee (My Tasks endpoint)
router.get('/my-tasks/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const { status, projectName, startDate, endDate } = req.query;
    
    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }
    
    // Get all tasks assigned to this employee
    const tasks = await db
      .select({
        task: preproductionChecklistTasks,
        section: preproductionChecklistSections,
        checklist: preproductionChecklists,
      })
      .from(preproductionChecklistTasks)
      .innerJoin(
        preproductionChecklistSections, 
        eq(preproductionChecklistTasks.sectionId, preproductionChecklistSections.id)
      )
      .innerJoin(
        preproductionChecklists, 
        eq(preproductionChecklistSections.checklistId, preproductionChecklists.id)
      )
      .where(eq(preproductionChecklistTasks.assignedToEmployeeId, employeeId))
      .orderBy(
        asc(preproductionChecklists.preProductionDueDate),
        asc(preproductionChecklists.projectName)
      );
    
    // Transform to a flattened structure with checklist context
    let result = tasks.map(({ task, section, checklist }) => ({
      id: task.id,
      description: task.description,
      isCompleted: task.isCompleted,
      completedAt: task.completedAt,
      completedBy: task.completedBy,
      notes: task.notes,
      assignedTo: task.assignedTo,
      assignedToEmployeeId: task.assignedToEmployeeId,
      link: task.link,
      createdAt: task.createdAt,
      sectionId: section.id,
      sectionName: section.name,
      checklistId: checklist.id,
      projectName: checklist.projectName,
      projectId: checklist.projectId,
      poNumber: checklist.poNumber,
      dueDate: checklist.preProductionDueDate,
      preProductionDueDate: checklist.preProductionDueDate,
      checklistStatus: checklist.status,
      source: 'preproduction-checklist' as const,
    }));
    
    // Apply filters
    if (status === 'completed') {
      result = result.filter(t => t.isCompleted);
    } else if (status === 'pending') {
      result = result.filter(t => !t.isCompleted);
    }
    
    if (projectName) {
      result = result.filter(t => 
        t.projectName.toLowerCase().includes((projectName as string).toLowerCase())
      );
    }
    
    if (startDate) {
      const start = new Date(startDate as string);
      result = result.filter(t => t.dueDate && new Date(t.dueDate) >= start);
    }
    
    if (endDate) {
      const end = new Date(endDate as string);
      result = result.filter(t => t.dueDate && new Date(t.dueDate) <= end);
    }
    
    // Get summary stats
    const stats = {
      total: result.length,
      completed: result.filter(t => t.isCompleted).length,
      pending: result.filter(t => !t.isCompleted).length,
      overdue: result.filter(t => !t.isCompleted && t.dueDate && new Date(t.dueDate) < new Date()).length,
    };
    
    res.json({ tasks: result, stats });
  } catch (error) {
    console.error('Error fetching my tasks:', error);
    res.status(500).json({ error: 'Failed to fetch assigned tasks' });
  }
});

// Get task assignment history for an employee
router.get('/my-tasks/:employeeId/history', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const { limit = 50 } = req.query;
    
    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }
    
    // Get completed tasks (history)
    const tasks = await db
      .select({
        task: preproductionChecklistTasks,
        section: preproductionChecklistSections,
        checklist: preproductionChecklists,
      })
      .from(preproductionChecklistTasks)
      .innerJoin(
        preproductionChecklistSections, 
        eq(preproductionChecklistTasks.sectionId, preproductionChecklistSections.id)
      )
      .innerJoin(
        preproductionChecklists, 
        eq(preproductionChecklistSections.checklistId, preproductionChecklists.id)
      )
      .where(
        and(
          eq(preproductionChecklistTasks.assignedToEmployeeId, employeeId),
          eq(preproductionChecklistTasks.isCompleted, true)
        )
      )
      .orderBy(desc(preproductionChecklistTasks.completedAt))
      .limit(parseInt(limit as string));
    
    const result = tasks.map(({ task, section, checklist }) => ({
      id: task.id,
      description: task.description,
      isCompleted: task.isCompleted,
      completedAt: task.completedAt,
      completedBy: task.completedBy,
      sectionName: section.name,
      checklistId: checklist.id,
      projectName: checklist.projectName,
      projectId: checklist.projectId,
      source: 'preproduction-checklist' as const,
    }));
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching task history:', error);
    res.status(500).json({ error: 'Failed to fetch task history' });
  }
});

// Sign off checklist
router.post('/:id/sign-off', requirePermission('travelers.sign_qc_preproduction'), async (req: Request, res: Response) => {
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

    // Advance the linked P2 PO to READY_FOR_PRODUCTION
    if (checklist?.poNumber) {
      await db
        .update(p2PurchaseOrders)
        .set({ status: 'READY_FOR_PRODUCTION', updatedAt: new Date() })
        .where(eq(p2PurchaseOrders.poNumber, checklist.poNumber));
    }
    
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

// Seed default template — not available in production
if (process.env.NODE_ENV !== 'production') {
router.post('/templates/seed-default', async (req: Request, res: Response) => {
  try {
    // Check if default template already exists
    const existing = await db
      .select()
      .from(preproductionTemplates)
      .where(eq(preproductionTemplates.name, 'Standard Pre-Production Checklist'))
      .limit(1);
    
    if (existing.length > 0) {
      return res.json({ message: 'Default template already exists', template: existing[0] });
    }
    
    // Create the default template
    const [template] = await db
      .insert(preproductionTemplates)
      .values({
        name: 'Standard Pre-Production Checklist',
        description: 'Complete pre-production checklist template covering Quality Team, General, Cutting Table, Layup, Mold Assembly, Finish, and QC/Shipping departments.',
      })
      .returning();
    
    // Define sections and tasks from the user's checklist
    const sectionsData = [
      {
        name: 'Quality Team',
        sortOrder: 1,
        tasks: [
          'Spec Sheet',
          'Traveler creation/modified',
          'Chief engineer approves tolerances',
          'Manager approval of the traveler',
          'Trolley wheels ordered',
          'Wraps for project stocked',
          'Blades for cutting table stocked',
          'Project packet created and presented to each corresponding department',
          'All lot #s and certificates of conformance are on hand for project materials',
          'Tools calibrated',
        ]
      },
      {
        name: 'General',
        sortOrder: 2,
        tasks: [
          'Compressor maintenance conducted',
          'Tool carts are stocked and organized',
          'Trolley are maintained and wheels changed',
          'Oven maintenance conducted',
          'AC working properly',
          'Wrap Station stocked and organized',
          'Wraps labeled properly',
          'Workstations are clean and stocked',
          'Delegate tasks that need to be completed before full production begins',
        ]
      },
      {
        name: 'Cutting Table',
        sortOrder: 3,
        tasks: [
          'Packet quantities confirmed',
          'Cut definitions double-checked',
          'Cutting table calibrated, blade status',
          'Extra blades on hand',
          'Packet table clean and functioning properly',
          'Production goals established and communicated with team',
          'Excess stock packets made to continue normal production',
          'Packet storage location and on hand determined',
          'Workstation is clean, organized and ready for full production',
        ]
      },
      {
        name: 'Layup',
        sortOrder: 4,
        tasks: [
          'Materials cut verified and labeled',
          'Workstations stocked per work instructions',
          'Mandrels cleaned/prepped',
          'Traveler reviewed and correct',
          'All parts necessary for task are readily available',
          'Production goals established and communicated with team',
          'All workstations are clean, organized and stocked',
          'Table is marked for seam placement',
          'Mandrel is marked for seam placement',
          'Work instructions updated and communicated',
          'Layup table is ready for production',
        ]
      },
      {
        name: 'Mold Assembly/Disassembly',
        sortOrder: 5,
        tasks: [
          'Mandrels matched to product and are labeled correctly',
          'Mandrels are cleaned, released and free of defects',
          'Mandrel cart functioning properly',
          'Cure timing scheduled to meet production of line 1 and 2',
          'Oven temperature and time sheet is correct and document control in place',
          'Release magnets on hand and ready',
          'Inventory in date',
          'Production goals established and communicated with team',
          'Workstations clean, organized and stocked',
        ]
      },
      {
        name: 'Finish',
        sortOrder: 6,
        tasks: [
          'Workstation stocked, organized, and clean',
          'Inventory in date and labeled with batch# or lot #',
          'Tools needed to complete task',
          'Production goals established and communicated with team',
        ]
      },
      {
        name: 'QC / Shipping',
        sortOrder: 7,
        tasks: [
          'Tools in workstation calibrated and available',
          'Packaging available for PO',
          'Research Packaging',
          'Designate Receiving Area for Tubes',
          'Create Storage area',
          'Specs correct based on PO',
          'Production goals established and communicated with team',
          'Workstation clean, organized, and stocked',
        ]
      },
    ];
    
    // Create sections and tasks
    for (const sectionData of sectionsData) {
      const [section] = await db
        .insert(preproductionTemplateSections)
        .values({
          templateId: template.id,
          name: sectionData.name,
          sortOrder: sectionData.sortOrder,
        })
        .returning();
      
      for (let i = 0; i < sectionData.tasks.length; i++) {
        await db.insert(preproductionTemplateTasks).values({
          sectionId: section.id,
          description: sectionData.tasks[i],
          sortOrder: i + 1,
        });
      }
    }
    
    res.status(201).json({ message: 'Default template created successfully', template });
  } catch (error) {
    console.error('Error seeding default template:', error);
    res.status(500).json({ error: 'Failed to seed default template' });
  }
});
} // end NODE_ENV !== 'production'

export default router;
