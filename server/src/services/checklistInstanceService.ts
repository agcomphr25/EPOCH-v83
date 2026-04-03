import { pool } from '../../db';

export interface GeneratedInstance {
  instanceId: number;
  templateId: number;
  templateName: string;
  status: string;
  contextDate: string;
  items: Array<{
    id: number;
    templateItemId: number;
    label: string;
    type: string;
    options: string[] | null;
    required: boolean;
    frequency: string;
    sortOrder: number;
    value: string | null;
    completed: boolean;
    completedAt: string | null;
    completedByDisplayName: string | null;
  }>;
  completedAt: string | null;
  reviewedAt: string | null;
  isLegacy: false;
}

function isItemDueToday(frequency: string, _today: string): boolean {
  switch (frequency) {
    case 'DAILY':
      return true;
    case 'WEEKLY': {
      const d = new Date(_today + 'T00:00:00');
      return d.getDay() === 1;
    }
    case 'MONTHLY': {
      const d = new Date(_today + 'T00:00:00');
      return d.getDate() === 1;
    }
    default:
      return true;
  }
}

export async function generateInstancesForEmployee(
  employeeId: number,
  date: string,
  contextType: string = 'daily'
): Promise<GeneratedInstance[]> {
  const assignedTemplates = await pool.query(
    `SELECT DISTINCT ct.*
     FROM checklist_templates ct
     JOIN checklist_assignments ca ON ca.template_id = ct.id
     WHERE (
       (ca.assignment_type = 'employee' AND ca.employee_id = $1)
       OR (ca.assignment_type = 'department' AND ca.department_name = (
           SELECT department FROM employees WHERE id = $1 LIMIT 1
         ))
       OR (ca.assignment_type = 'role' AND ca.role_key = (
           SELECT role FROM employees WHERE id = $1 LIMIT 1
         ))
     )
       AND ca.is_active = true
       AND ct.is_active = true
       AND (ca.start_date IS NULL OR ca.start_date <= $2)
       AND (ca.end_date IS NULL OR ca.end_date >= $2)
     ORDER BY ct.name`,
    [employeeId, date]
  );

  const results: GeneratedInstance[] = [];

  for (const template of assignedTemplates || []) {
    const allItems = await pool.query(
      `SELECT * FROM checklist_template_items WHERE template_id = $1 ORDER BY sort_order`,
      [template.id]
    );

    const applicableItems = (allItems || []).filter((item: any) =>
      isItemDueToday(item.frequency, date)
    );

    if (applicableItems.length === 0) continue;

    let existingRows = await pool.query(
      `SELECT * FROM checklist_instances
       WHERE template_id = $1 AND employee_id = $2 AND context_type = $3 AND context_date = $4
       LIMIT 1`,
      [template.id, employeeId, contextType, date]
    );

    let instanceId: number;

    if (existingRows && existingRows.length > 0) {
      instanceId = existingRows[0].id;
    } else {
      const inserted = await pool.query(
        `INSERT INTO checklist_instances (template_id, employee_id, context_type, context_date, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (template_id, employee_id, context_type, context_date) DO NOTHING
         RETURNING *`,
        [template.id, employeeId, contextType, date]
      );

      if (!inserted || inserted.length === 0) {
        const refetch = await pool.query(
          `SELECT * FROM checklist_instances
           WHERE template_id = $1 AND employee_id = $2 AND context_type = $3 AND context_date = $4
           LIMIT 1`,
          [template.id, employeeId, contextType, date]
        );
        instanceId = refetch[0].id;
      } else {
        instanceId = inserted[0].id;

        for (const item of applicableItems) {
          await pool.query(
            `INSERT INTO checklist_instance_items
               (instance_id, template_item_id, label, type, options, required, frequency, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [instanceId, item.id, item.label, item.type, item.options, item.required, item.frequency, item.sort_order]
          );
        }

        await pool.query(
          `INSERT INTO checklist_instance_events (instance_id, event_type, metadata)
           VALUES ($1, 'created', $2::jsonb)`,
          [instanceId, JSON.stringify({ templateId: template.id, employeeId, contextType, date })]
        );
      }
    }

    const instanceData = await pool.query(
      `SELECT * FROM checklist_instances WHERE id = $1`,
      [instanceId]
    );
    const instance = instanceData[0];

    const itemRows = await pool.query(
      `SELECT * FROM checklist_instance_items WHERE instance_id = $1 ORDER BY sort_order`,
      [instanceId]
    );

    const completedCount = (itemRows || []).filter((i: any) => i.completed).length;
    const totalCount = (itemRows || []).length;

    let status = instance.status;
    if (status === 'pending' && completedCount > 0) {
      status = 'in_progress';
      await pool.query(
        `UPDATE checklist_instances SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
        [instanceId]
      );
    }
    if (completedCount === totalCount && totalCount > 0 && status !== 'completed' && status !== 'reviewed') {
      status = 'completed';
      await pool.query(
        `UPDATE checklist_instances SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [instanceId]
      );
    }

    results.push({
      instanceId,
      templateId: template.id,
      templateName: template.name,
      status,
      contextDate: date,
      items: (itemRows || []).map((item: any) => ({
        id: item.id,
        templateItemId: item.template_item_id,
        label: item.label,
        type: item.type,
        options: item.options,
        required: item.required,
        frequency: item.frequency,
        sortOrder: item.sort_order,
        value: item.value,
        completed: item.completed,
        completedAt: item.completed_at,
        completedByDisplayName: item.completed_by_display_name,
      })),
      completedAt: instance.completed_at,
      reviewedAt: instance.reviewed_at,
      isLegacy: false,
    });
  }

  return results;
}

export async function createSingleInstance(
  templateId: number,
  employeeId: number,
  date: string,
  contextType: string,
  actor?: { userId?: number | null; displayName?: string | null }
): Promise<GeneratedInstance> {
  const templateRows = await pool.query(
    `SELECT * FROM checklist_templates WHERE id = $1 AND is_active = true`,
    [templateId]
  );
  if (!templateRows || templateRows.length === 0) {
    throw new Error(`Template ${templateId} not found or inactive`);
  }
  const template = templateRows[0];

  const allItems = await pool.query(
    `SELECT * FROM checklist_template_items WHERE template_id = $1 ORDER BY sort_order`,
    [templateId]
  );
  const applicableItems = (allItems || []).filter((item: any) =>
    isItemDueToday(item.frequency, date)
  );

  let existingRows = await pool.query(
    `SELECT * FROM checklist_instances
     WHERE template_id = $1 AND employee_id = $2 AND context_type = $3 AND context_date = $4
     LIMIT 1`,
    [templateId, employeeId, contextType, date]
  );

  let instanceId: number;

  if (existingRows && existingRows.length > 0) {
    instanceId = existingRows[0].id;
  } else {
    const inserted = await pool.query(
      `INSERT INTO checklist_instances (template_id, employee_id, context_type, context_date, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (template_id, employee_id, context_type, context_date) DO NOTHING
       RETURNING *`,
      [templateId, employeeId, contextType, date]
    );

    if (!inserted || inserted.length === 0) {
      const refetch = await pool.query(
        `SELECT * FROM checklist_instances
         WHERE template_id = $1 AND employee_id = $2 AND context_type = $3 AND context_date = $4
         LIMIT 1`,
        [templateId, employeeId, contextType, date]
      );
      instanceId = refetch[0].id;
    } else {
      instanceId = inserted[0].id;

      for (const item of applicableItems) {
        await pool.query(
          `INSERT INTO checklist_instance_items
             (instance_id, template_item_id, label, type, options, required, frequency, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [instanceId, item.id, item.label, item.type, item.options, item.required, item.frequency, item.sort_order]
        );
      }

      await pool.query(
        `INSERT INTO checklist_instance_events (instance_id, event_type, actor_user_id, actor_display_name, metadata)
         VALUES ($1, 'created', $2, $3, $4::jsonb)`,
        [instanceId, actor?.userId || null, actor?.displayName || null,
          JSON.stringify({ templateId, employeeId, contextType, date, manual: true })]
      );
    }
  }

  const instanceData = await pool.query(
    `SELECT * FROM checklist_instances WHERE id = $1`,
    [instanceId]
  );
  const instance = instanceData[0];

  const itemRows = await pool.query(
    `SELECT * FROM checklist_instance_items WHERE instance_id = $1 ORDER BY sort_order`,
    [instanceId]
  );

  return {
    instanceId,
    templateId: template.id,
    templateName: template.name,
    status: instance.status,
    contextDate: date,
    items: (itemRows || []).map((item: any) => ({
      id: item.id,
      templateItemId: item.template_item_id,
      label: item.label,
      type: item.type,
      options: item.options,
      required: item.required,
      frequency: item.frequency,
      sortOrder: item.sort_order,
      value: item.value,
      completed: item.completed,
      completedAt: item.completed_at,
      completedByDisplayName: item.completed_by_display_name,
    })),
    completedAt: instance.completed_at,
    reviewedAt: instance.reviewed_at,
    isLegacy: false,
  };
}
