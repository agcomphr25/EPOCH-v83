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

        // Convert scheduledDate to Date object if it's a string
        const processedScheduledDate = typeof scheduledDate === 'string' ? new Date(scheduledDate) : scheduledDate;

<<<<<<< HEAD
        // Extract business day from scheduled date as YYYY-MM-DD string
        const layupDayStr = new Date(processedScheduledDate).toISOString().slice(0, 10);

        // Insert schedule entry with upsert to handle conflicts
        await pool.query(`
          INSERT INTO layup_schedule (
            order_id, scheduled_date, layup_day, mold_id, employee_assignments,
            is_override, created_at, updated_at
          ) VALUES ($1, $2, $3::date, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (layup_day, mold_id) DO UPDATE SET
            order_id = EXCLUDED.order_id,
            scheduled_date = EXCLUDED.scheduled_date,
            employee_assignments = EXCLUDED.employee_assignments,
            updated_at = NOW()
        `, [
          orderId,
          processedScheduledDate,
          layupDayStr,
          moldId || 'auto',
          JSON.stringify(employeeAssignments || []),
          true // This is a manual schedule save (preserve is_override on conflict)
=======
        // Insert schedule entry
        await pool.query(`
          INSERT INTO layup_schedule (
            order_id, scheduled_date, mold_id, employee_assignments,
            is_override, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          orderId,
          processedScheduledDate,
          moldId || 'auto',
          JSON.stringify(employeeAssignments || []),
          true, // This is a manual schedule save
          new Date().toISOString(),
          new Date().toISOString()
>>>>>>> origin/main
        ]);

        savedCount++;
        console.log(`✅ Order ${orderId} scheduled for ${scheduledDate} (schedule only, no department change)`);
      }

      // Commit transaction
      await pool.query('COMMIT');

      console.log(`✅ Successfully saved ${savedCount} schedule entries (no department changes)`);
      
      res.json({
        success: true,
        message: `Weekly schedule saved successfully`,
        entriesSaved: savedCount,
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
        o.model_id as stockModelId,
        o.customer_id as customerId,
        c.customer_name as customerName,
        po.po_number as poNumber,
        po.id as poId,
        po.id as productionOrderId,
        CASE 
          WHEN po.order_id IS NOT NULL THEN 'production_order'
          ELSE 'main_orders'
        END as source
      FROM layup_schedule ls
      LEFT JOIN all_orders o ON ls.order_id = o.order_id
      LEFT JOIN production_orders po ON ls.order_id = po.order_id
      LEFT JOIN customers c ON o.customer_id = c.id::text
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