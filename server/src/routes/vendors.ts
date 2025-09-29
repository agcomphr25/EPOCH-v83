import { Router } from 'express';

const router = Router();

// Get all vendors
router.get('/', async (req, res) => {
  try {
    // Return empty array for now - can be implemented later if needed
    res.json([]);
  } catch (error) {
    console.error('Failed to fetch vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

export default router;