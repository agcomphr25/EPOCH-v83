import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

// Save OEM settings for a specific week
router.post('/save', async (req, res) => {
  try {
    const { selectedPurchaseOrders = [], weekStart, weekEnd } = req.body;
    
    console.log(`🔧 Saving OEM settings for week ${weekStart} to ${weekEnd}:`, selectedPurchaseOrders);
    
    // First, delete any existing OEM settings for this week
    await pool.query(`
      DELETE FROM oem_layup_settings 
      WHERE week_start = $1
    `, [weekStart]);
    
    // If there are selected purchase orders, save them
    if (selectedPurchaseOrders.length > 0) {
      const insertPromises = selectedPurchaseOrders.map((poId: string) => {
        return pool.query(`
          INSERT INTO oem_layup_settings (
            purchase_order_id, 
            week_start, 
            week_end, 
            priority_level,
            created_at
          ) VALUES ($1, $2, $3, $4, NOW())
        `, [poId, weekStart, weekEnd || weekStart, 2000]); // High priority level
      });
      
      await Promise.all(insertPromises);
    }
    
    console.log(`✅ Saved ${selectedPurchaseOrders.length} OEM purchase order priorities for week ${weekStart}`);
    
    res.json({
      success: true,
      savedCount: selectedPurchaseOrders.length,
      weekStart,
      weekEnd: weekEnd || weekStart
    });
    
  } catch (error) {
    console.error('❌ Failed to save OEM settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save OEM settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get OEM settings for a specific week
router.get('/week/:weekStart', async (req, res) => {
  try {
    const { weekStart } = req.params;
    
    console.log(`🔍 Fetching OEM settings for week ${weekStart}`);
    
    const result = await pool.query(`
      SELECT 
        purchase_order_id,
        priority_level,
        week_start,
        week_end,
        created_at
      FROM oem_layup_settings 
      WHERE week_start = $1
      ORDER BY created_at DESC
    `, [weekStart]);
    
    const oemSettings = result?.rows || [];
    const selectedPurchaseOrders = oemSettings.map((setting: any) => setting.purchase_order_id);
    
    console.log(`✅ Found ${oemSettings.length} OEM settings for week ${weekStart}`);
    
    res.json({
      success: true,
      weekStart,
      selectedPurchaseOrders,
      settings: oemSettings
    });
    
  } catch (error) {
    console.error('❌ Failed to get OEM settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve OEM settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Clear OEM settings for a specific week
router.delete('/week/:weekStart', async (req, res) => {
  try {
    const { weekStart } = req.params;
    
    console.log(`🗑️ Clearing OEM settings for week ${weekStart}`);
    
    const result = await pool.query(`
      DELETE FROM oem_layup_settings 
      WHERE week_start = $1
    `, [weekStart]);
    
    console.log(`✅ Cleared OEM settings for week ${weekStart}`);
    
    res.json({
      success: true,
      weekStart,
      deletedCount: 1 // Assume successful if no error thrown
    });
    
  } catch (error) {
    console.error('❌ Failed to clear OEM settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear OEM settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;