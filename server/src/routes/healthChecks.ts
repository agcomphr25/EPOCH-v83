import { Router } from 'express';
import {
  getHealthCheckTypes,
  getHealthCheckConfig,
  updateHealthCheckConfig,
  toggleHealthCheck,
  updateHealthCheckType,
  createCustomCheck,
  deleteCustomCheck,
  runAllEnabledChecks,
  runSingleCheck,
  getRecentResults,
  getResultsByBatchId,
} from '../../utils/healthCheckService';

const router = Router();

router.get('/types', async (req, res) => {
  try {
    const types = await getHealthCheckTypes();
    res.json(types);
  } catch (error) {
    console.error('Error fetching health check types:', error);
    res.status(500).json({ message: 'Failed to fetch health check types' });
  }
});

router.get('/config', async (req, res) => {
  try {
    const config = await getHealthCheckConfig();
    res.json(config);
  } catch (error) {
    console.error('Error fetching health check config:', error);
    res.status(500).json({ message: 'Failed to fetch health check config' });
  }
});

router.patch('/config', async (req, res) => {
  try {
    const updates = req.body;
    const config = await updateHealthCheckConfig(updates);
    res.json(config);
  } catch (error) {
    console.error('Error updating health check config:', error);
    res.status(500).json({ message: 'Failed to update health check config' });
  }
});

router.patch('/types/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { isEnabled } = req.body;
    const updated = await toggleHealthCheck(parseInt(id), isEnabled);
    res.json(updated);
  } catch (error) {
    console.error('Error toggling health check:', error);
    res.status(500).json({ message: 'Failed to toggle health check' });
  }
});

router.patch('/types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = await updateHealthCheckType(parseInt(id), updates);
    res.json(updated);
  } catch (error) {
    console.error('Error updating health check type:', error);
    res.status(500).json({ message: 'Failed to update health check type' });
  }
});

router.post('/types', async (req, res) => {
  try {
    const data = req.body;
    const created = await createCustomCheck(data);
    res.json(created);
  } catch (error) {
    console.error('Error creating custom check:', error);
    res.status(500).json({ message: 'Failed to create custom check' });
  }
});

router.delete('/types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteCustomCheck(parseInt(id));
    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting custom check:', error);
    res.status(500).json({ message: 'Failed to delete custom check' });
  }
});

router.post('/run', async (req, res) => {
  try {
    const results = await runAllEnabledChecks('manual');
    res.json(results);
  } catch (error) {
    console.error('Error running health checks:', error);
    res.status(500).json({ message: 'Failed to run health checks' });
  }
});

router.post('/run/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await runSingleCheck(parseInt(id), 'manual');
    if (!result) {
      return res.status(404).json({ message: 'Health check not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Error running single health check:', error);
    res.status(500).json({ message: 'Failed to run health check' });
  }
});

router.get('/results', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const results = await getRecentResults(limit);
    res.json(results);
  } catch (error) {
    console.error('Error fetching health check results:', error);
    res.status(500).json({ message: 'Failed to fetch health check results' });
  }
});

router.get('/results/batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const results = await getResultsByBatchId(batchId);
    res.json(results);
  } catch (error) {
    console.error('Error fetching batch results:', error);
    res.status(500).json({ message: 'Failed to fetch batch results' });
  }
});

export default router;
