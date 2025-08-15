import { Router, Request, Response } from 'express';
import { pool } from '../../db';

const router = Router();

// Save layup schedule and move orders to Layup/Plugging department
router.post('/save', async (req: Request, res: Response) => {
  try {
    console.log('💾 SCHEDULE SAVE: Starting layup schedule save and department progression...');
    
    const { entries, workDays, weekStart } = req.body;
    
    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        error: "Invalid schedule entries provided"
      });
    }

    console.log(`📋 Processing ${entries.length} schedule entries for week starting ${weekStart}`);
    console.log(`📅 Configured work days: ${workDays.map((d: number) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}`);

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Clear existing schedule for this week
      await pool.query(`
        DELETE FROM layup_schedule 
        WHERE scheduled_date >= $1 AND scheduled_date < $1::date + INTERVAL '7 days'
      `, [weekStart]);

      let savedCount = 0;
      let progressedCount = 0;

      // Save schedule entries and progress orders
      for (const entry of entries) {
        const { orderId, scheduledDate, moldId, employeeAssignments } = entry;
        
        // Validate required fields
        if (!orderId || !scheduledDate) {
          console.log(`⚠️ Skipping invalid entry: ${JSON.stringify(entry)}`);
          continue;
        }

        // Insert schedule entry
        await pool.query(`
          INSERT INTO layup_schedule (
            order_id, scheduled_date, mold_id, employee_assignments,
            is_override, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          orderId,
          scheduledDate,
          moldId || 'auto',
          JSON.stringify(employeeAssignments || []),
          true, // This is a manual schedule save
          new Date().toISOString(),
          new Date().toISOString()
        ]);

        savedCount++;

        // Progress order to Layup/Plugging department
        const progressResult = await pool.query(`
          UPDATE all_orders 
          SET 
            current_department = 'Layup/Plugging',
            department_history = CASE
              WHEN department_history IS NULL THEN 
                jsonb_build_array(jsonb_build_object(
                  'department', 'Layup/Plugging', 
                  'timestamp', $1,
                  'scheduledDate', $2
                ))
              ELSE 
                department_history || jsonb_build_array(jsonb_build_object(
                  'department', 'Layup/Plugging', 
                  'timestamp', $1,
                  'scheduledDate', $2
                ))
            END,
            updated_at = $1
          WHERE order_id = $3 OR orderId = $3
        `, [new Date().toISOString(), scheduledDate, orderId]);

        if (progressResult.rowCount && progressResult.rowCount > 0) {
          progressedCount++;
          console.log(`✅ Order ${orderId} scheduled for ${scheduledDate} and progressed to Layup/Plugging`);
        } else {
          console.log(`⚠️ Order ${orderId} scheduled but not found for progression`);
        }
      }

      // Commit transaction
      await pool.query('COMMIT');

      console.log(`✅ Successfully saved ${savedCount} schedule entries and progressed ${progressedCount} orders to Layup/Plugging`);
      
      res.json({
        success: true,
        message: `Schedule saved successfully`,
        entriesSaved: savedCount,
        ordersProgressed: progressedCount,
        weekStart: weekStart,
        workDays: workDays
      });

    } catch (transactionError) {
      await pool.query('ROLLBACK');
      throw transactionError;
    }
    
  } catch (error) {
    console.error('❌ SCHEDULE SAVE: Error saving layup schedule:', error);
    res.status(500).json({
      success: false,
      error: "Failed to save layup schedule",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get current week's schedule
router.get('/current-week', async (req: Request, res: Response) => {
  try {
    console.log('📅 CURRENT WEEK: Fetching current week layup schedule...');
    
    // Get start of current week (Monday)
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const scheduleQuery = `
      SELECT 
        ls.order_id as orderId,
        ls.scheduled_date as scheduledDate,
        ls.mold_id as moldId,
        ls.employee_assignments as employeeAssignments,
        ls.is_override as isOverride,
        o.fb_order_number as fbOrderNumber,
        o.modelId as stockModelId,
        o.customerId as customerId,
        c.customer_name as customerName
      FROM layup_schedule ls
      LEFT JOIN all_orders o ON ls.order_id = o.order_id OR ls.order_id = o.orderId
      LEFT JOIN customers c ON o.customerId = c.id
      WHERE ls.scheduled_date >= $1 AND ls.scheduled_date <= $2
      ORDER BY ls.scheduled_date ASC
    `;

    const scheduleResult = await pool.query(scheduleQuery, [
      startOfWeek.toISOString(),
      endOfWeek.toISOString()
    ]);

    const scheduleEntries = scheduleResult || [];
    
    console.log(`📋 Found ${scheduleEntries.length} schedule entries for current week`);
    
    res.json({
      success: true,
      schedule: scheduleEntries,
      weekStart: startOfWeek.toISOString(),
      weekEnd: endOfWeek.toISOString(),
      totalEntries: scheduleEntries.length
    });
    
  } catch (error) {
    console.error('❌ CURRENT WEEK: Error fetching current week schedule:', error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch current week schedule",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;