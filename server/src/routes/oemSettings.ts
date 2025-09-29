import { Router } from 'express';
import { storage } from '../../storage';
import { insertOemPrioritySettingsSchema } from '@shared/schema';
import { z } from 'zod';

const router = Router();

// Get all OEM priority settings
router.get('/priority-settings', async (req, res) => {
  try {
    const settings = await storage.getAllOemPrioritySettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching OEM priority settings:', error);
    res.status(500).json({ error: 'Failed to fetch OEM priority settings' });
  }
});

// Get OEM priority settings by vendor
router.get('/priority-settings/vendor/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const settings = await storage.getOemPrioritySettingsByVendor(vendorId);
    res.json(settings);
  } catch (error) {
    console.error('Error fetching OEM priority settings by vendor:', error);
    res.status(500).json({ error: 'Failed to fetch OEM priority settings by vendor' });
  }
});

// Get active priority settings
router.get('/priority-settings/active', async (req, res) => {
  try {
    const settings = await storage.getActivePrioritySettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching active priority settings:', error);
    res.status(500).json({ error: 'Failed to fetch active priority settings' });
  }
});

// Save OEM priority settings (new dual-mode endpoint)
router.post('/priority-settings/save', async (req, res) => {
  try {
    console.log('🎯 OEM Priority Settings Save Request:', req.body);
    
    // Validation schema for the request with dual-mode enforcement
    const saveSchema = z.object({
      vendorId: z.string().min(1, "Vendor ID is required"),
      vendorName: z.string().min(1, "Vendor name is required"),
      poId: z.number().min(1, "PO ID is required"),
      poNumber: z.string().min(1, "PO number is required"),
      selectionMode: z.enum(['entire_po', 'specific_items']),
      stockItemIds: z.array(z.string()).optional(),
      priorityLevel: z.number().min(1).max(10).optional().default(1),
      createdBy: z.string().optional()
    }).refine((data) => {
      // Enforce non-empty stockItemIds when selectionMode is 'specific_items'
      if (data.selectionMode === 'specific_items') {
        return data.stockItemIds && data.stockItemIds.length > 0;
      }
      return true;
    }, {
      message: "Stock item IDs are required when selection mode is 'specific_items'",
      path: ['stockItemIds']
    });

    const validatedData = saveSchema.parse(req.body);
    
    // Remove any existing priority settings for this PO to avoid duplicates
    await storage.deleteOemPrioritySettingsByPO(validatedData.poId);
    
    // Create the new priority setting
    const newSetting = await storage.createOemPrioritySettings({
      vendorId: validatedData.vendorId,
      vendorName: validatedData.vendorName,
      poId: validatedData.poId,
      poNumber: validatedData.poNumber,
      selectionMode: validatedData.selectionMode,
      stockItemIds: validatedData.stockItemIds || null,
      priorityLevel: validatedData.priorityLevel || 1,
      isActive: true,
      createdBy: validatedData.createdBy || null
    });

    console.log('✅ OEM Priority Settings saved:', newSetting);
    
    res.json({
      success: true,
      message: `Priority settings saved for ${validatedData.selectionMode === 'entire_po' ? 'entire PO' : 'specific items'}`,
      setting: newSetting
    });
    
  } catch (error) {
    console.error('❌ Error saving OEM priority settings:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Failed to save OEM priority settings' });
  }
});

// Delete OEM priority settings
router.delete('/priority-settings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await storage.deleteOemPrioritySettings(parseInt(id));
    res.json({ success: true, message: 'Priority settings deleted successfully' });
  } catch (error) {
    console.error('Error deleting OEM priority settings:', error);
    res.status(500).json({ error: 'Failed to delete OEM priority settings' });
  }
});

// Update OEM priority settings
router.put('/priority-settings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = insertOemPrioritySettingsSchema.partial().parse(req.body);
    
    const updatedSetting = await storage.updateOemPrioritySettings(parseInt(id), updateData);
    res.json({
      success: true,
      message: 'Priority settings updated successfully',
      setting: updatedSetting
    });
  } catch (error) {
    console.error('Error updating OEM priority settings:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Failed to update OEM priority settings' });
  }
});

export default router;