import { Router } from 'express';
import { db } from '../../db';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// ============================================================================
// GET DEFROST SCHEDULE
// ============================================================================
router.get('/defrost-schedule', async (req, res) => {
  try {
    console.log('❄️ DEFROST: Fetching defrost schedule...');
    
    const schedules = await db.query(`
      SELECT * FROM defrost_schedule 
      ORDER BY scheduled_date ASC, scheduled_time ASC
    `);

    console.log(`❄️ DEFROST: Found ${schedules.rows.length} scheduled defrost tasks`);
    
    const transformedSchedules = schedules.rows.map(schedule => ({
      id: schedule.id,
      freezerId: schedule.freezer_id,
      freezerName: schedule.freezer_name,
      locationBuilding: schedule.location_building,
      locationRoom: schedule.location_room,
      scheduledDate: schedule.scheduled_date,
      scheduledTime: schedule.scheduled_time,
      assignedTo: schedule.assigned_to,
      status: schedule.status,
      startedAt: schedule.started_at,
      completedAt: schedule.completed_at,
      durationMinutes: schedule.duration_minutes,
      notes: schedule.notes,
      createdAt: schedule.created_at,
      updatedAt: schedule.updated_at
    }));

    res.json(transformedSchedules);
  } catch (error) {
    console.error('❌ DEFROST: Error fetching schedule:', error);
    res.status(500).json({ 
      error: 'Failed to fetch defrost schedule',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// ADD DEFROST SCHEDULE
// ============================================================================
const addScheduleSchema = z.object({
  freezerId: z.string().min(1),
  freezerName: z.string().min(1),
  locationBuilding: z.string().min(1),
  locationRoom: z.string().min(1),
  scheduledDate: z.string().min(1),
  scheduledTime: z.string().min(1),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/defrost-schedule', async (req, res) => {
  try {
    console.log('➕ DEFROST: Adding new defrost schedule...');
    
    const scheduleData = addScheduleSchema.parse(req.body);
    
    const result = await db.query(`
      INSERT INTO defrost_schedule (
        freezer_id, freezer_name, location_building, location_room,
        scheduled_date, scheduled_time, assigned_to, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
      RETURNING *
    `, [
      scheduleData.freezerId,
      scheduleData.freezerName,
      scheduleData.locationBuilding,
      scheduleData.locationRoom,
      scheduleData.scheduledDate,
      scheduleData.scheduledTime,
      scheduleData.assignedTo || null,
      scheduleData.notes || null
    ]);
    
    console.log(`➕ DEFROST: Created schedule for ${scheduleData.freezerName}`);
    
    const newSchedule = result.rows[0];
    res.json({
      success: true,
      schedule: {
        id: newSchedule.id,
        freezerId: newSchedule.freezer_id,
        freezerName: newSchedule.freezer_name,
        locationBuilding: newSchedule.location_building,
        locationRoom: newSchedule.location_room,
        scheduledDate: newSchedule.scheduled_date,
        scheduledTime: newSchedule.scheduled_time,
        assignedTo: newSchedule.assigned_to,
        status: newSchedule.status,
        notes: newSchedule.notes,
        createdAt: newSchedule.created_at
      }
    });
  } catch (error) {
    console.error('❌ DEFROST: Error adding schedule:', error);
    res.status(500).json({ 
      error: 'Failed to add defrost schedule',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// UPDATE DEFROST STATUS
// ============================================================================
const updateStatusSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
  notes: z.string().optional(),
});

router.patch('/defrost-schedule/:id', async (req, res) => {
  try {
    console.log('🔄 DEFROST: Updating defrost status...');
    
    const scheduleId = parseInt(req.params.id);
    const { status, notes } = updateStatusSchema.parse(req.body);
    
    let updateQuery = `
      UPDATE defrost_schedule 
      SET status = $1, updated_at = NOW()
    `;
    let params = [status];
    let paramIndex = 2;
    
    // Add timestamp fields based on status
    if (status === 'in_progress') {
      updateQuery += `, started_at = NOW()`;
    } else if (status === 'completed') {
      updateQuery += `, completed_at = NOW()`;
      // Calculate duration if we have started_at
      updateQuery += `, duration_minutes = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60`;
    }
    
    // Add notes if provided
    if (notes) {
      updateQuery += `, notes = $${paramIndex}`;
      params.push(notes);
      paramIndex++;
    }
    
    updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(scheduleId);
    
    const result = await db.query(updateQuery, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Defrost schedule not found' });
    }
    
    console.log(`🔄 DEFROST: Updated schedule ${scheduleId} to ${status}`);
    
    const updatedSchedule = result.rows[0];
    res.json({
      success: true,
      schedule: {
        id: updatedSchedule.id,
        freezerId: updatedSchedule.freezer_id,
        freezerName: updatedSchedule.freezer_name,
        locationBuilding: updatedSchedule.location_building,
        locationRoom: updatedSchedule.location_room,
        scheduledDate: updatedSchedule.scheduled_date,
        scheduledTime: updatedSchedule.scheduled_time,
        assignedTo: updatedSchedule.assigned_to,
        status: updatedSchedule.status,
        startedAt: updatedSchedule.started_at,
        completedAt: updatedSchedule.completed_at,
        durationMinutes: updatedSchedule.duration_minutes,
        notes: updatedSchedule.notes,
        updatedAt: updatedSchedule.updated_at
      }
    });
  } catch (error) {
    console.error('❌ DEFROST: Error updating status:', error);
    res.status(500).json({ 
      error: 'Failed to update defrost status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;