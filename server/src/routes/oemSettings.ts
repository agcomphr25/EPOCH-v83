import { Router } from 'express';
import { storage } from '../../storage';

const router = Router();

// Save OEM priority settings
router.post('/priority-settings/save', async (req, res) => {
  try {
    console.log('💾 Saving OEM priority settings:', req.body);
    const { vendorId, vendorName, poId, poNumber, selectionMode, stockItemIds, manualQuantities, priorityLevel } = req.body;

    // Validate required fields
    if (!vendorId || !poId || !poNumber) {
      return res.status(400).json({ error: 'Missing required fields: vendorId, poId, or poNumber' });
    }

    if (selectionMode === 'specific_items' && (!stockItemIds || stockItemIds.length === 0)) {
      return res.status(400).json({ error: 'Stock item IDs required for specific_items mode' });
    }

    // Delete existing priority settings for this PO to avoid duplicates
    await storage.deleteOemPrioritySettingsByPO(poId);

    // Create new priority settings with manual quantities
    const prioritySettings = await storage.createOemPrioritySettings({
      vendorId,
      vendorName: vendorName || 'Unknown Vendor',
      poId,
      poNumber,
      selectionMode,
      stockItemIds: selectionMode === 'entire_po' ? null : stockItemIds,
      manualQuantities: manualQuantities || null, // Persist manual quantity overrides
      priorityLevel: priorityLevel || 1,
      isActive: true,
      createdBy: 'system' // TODO: Replace with actual user when auth is available
    });

    console.log('✅ OEM priority settings saved successfully with manual quantities:', prioritySettings);

    res.json({
      success: true,
      message: 'OEM priority settings saved successfully',
      settings: prioritySettings
    });
  } catch (error) {
    console.error('❌ Error saving OEM priority settings:', error);
    res.status(500).json({ error: 'Failed to save OEM priority settings' });
  }
});

// Get all active OEM priority settings
router.get('/priority-settings', async (req, res) => {
  try {
    const settings = await storage.getActivePrioritySettings();
    res.json(settings);
  } catch (error) {
    console.error('❌ Error fetching OEM priority settings:', error);
    res.status(500).json({ error: 'Failed to fetch OEM priority settings' });
  }
});

// Get OEM priority settings by PO
router.get('/priority-settings/po/:poId', async (req, res) => {
  try {
    const { poId } = req.params;
    const settings = await storage.getOemPrioritySettingsByPO(parseInt(poId));
    res.json(settings);
  } catch (error) {
    console.error('❌ Error fetching OEM priority settings by PO:', error);
    res.status(500).json({ error: 'Failed to fetch OEM priority settings' });
  }
});

// Delete OEM priority settings
router.delete('/priority-settings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await storage.deleteOemPrioritySettings(parseInt(id));
    res.json({ success: true, message: 'OEM priority settings deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting OEM priority settings:', error);
    res.status(500).json({ error: 'Failed to delete OEM priority settings' });
  }
});

export default router;
