import { Express } from 'express';
import authRoutes from './auth';
import employeesRoutes from './employees';
import ordersRoutes from './orders';
import formsRoutes from './forms';
import tasksRoutes from './tasks';
import inventoryRoutes from './inventory';
import customersRoutes from './customers';
import qualityRoutes from './quality';
import documentsRoutes from './documents';
import moldsRoutes from './molds';

export function registerRoutes(app: Express) {
  // Authentication routes
  app.use('/api/auth', authRoutes);
  
  // Employee management routes
  app.use('/api/employees', employeesRoutes);
  
  // Order management routes  
  app.use('/api/orders', ordersRoutes);
  
  // Forms and submissions routes
  app.use('/api/forms', formsRoutes);
  
  // Task tracker routes
  app.use('/api/task-items', tasksRoutes);
  
  // Inventory management routes
  app.use('/api/inventory', inventoryRoutes);
  
  // Customer management routes
  app.use('/api/customers', customersRoutes);
  
  // Quality control and maintenance routes
  app.use('/api/quality', qualityRoutes);
  
  // Document management routes
  app.use('/api/documents', documentsRoutes);
  
  // Mold management routes
  app.use('/api/molds', moldsRoutes);
  
  // Temporary bypass route for employee layup settings (different path to avoid conflicts)
  app.get('/api/layup-employee-settings', async (req, res) => {
    try {
      console.log('🔧 Bypass employee layup-settings route called');
      const { storage } = await import('../../storage');
      const settings = await storage.getAllEmployeeLayupSettings();
      console.log('🔧 Found employees:', settings);
      res.json(settings);
    } catch (error) {
      console.error('🔧 Employee layup settings fetch error:', error);
      res.status(500).json({ error: "Failed to fetch employee layup settings" });
    }
  });
  
  // Address routes - bypass to old monolithic routes temporarily
  app.get('/api/addresses/all', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const addresses = await storage.getAllAddresses();
      res.json(addresses);
    } catch (error) {
      console.error("Get all addresses error:", error);
      res.status(500).json({ error: "Failed to get all addresses" });
    }
  });
  
  app.get('/api/addresses', async (req, res) => {
    try {
      const { customerId } = req.query;
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID is required" });
      }
      const { storage } = await import('../../storage');
      const addresses = await storage.getCustomerAddresses(customerId as string);
      res.json(addresses);
    } catch (error) {
      console.error("Get customer addresses error:", error);
      res.status(500).json({ error: "Failed to get customer addresses" });
    }
  });
  
  // Additional routes can be added here as we continue splitting
  // app.use('/api/reports', reportsRoutes);
  // app.use('/api/scheduling', schedulingRoutes);
  // app.use('/api/bom', bomRoutes);
  
  return app;
}