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
  
  // Additional routes can be added here as we continue splitting
  // app.use('/api/reports', reportsRoutes);
  // app.use('/api/scheduling', schedulingRoutes);
  // app.use('/api/bom', bomRoutes);
}