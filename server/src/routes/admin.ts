import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { seedOrderReferenceTables } from '../../seeds/orderReferenceTables';

const router = Router();

router.post(
  '/seed-reference-tables',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      console.log('🌱 Admin seed endpoint called - seeding reference tables...');
      
      await seedOrderReferenceTables();
      
      console.log('✅ Reference tables seeded successfully');
      res.json({
        success: true,
        message: 'Order reference tables (departments and statuses) have been seeded successfully.',
        details: {
          departments: [
            'Production Queue',
            'Layup/Plugging',
            'Barcode',
            'CNC',
            'Gunsmith',
            'Finish',
            'Finish QC',
            'Shipping QC',
            'Shipping'
          ],
          statuses: [
            'Holding',
            'Finalized',
            'In Progress',
            'Fulfilled',
            'Cancelled'
          ]
        }
      });
    } catch (error) {
      console.error('❌ Error seeding reference tables:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to seed reference tables',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
