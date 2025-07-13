import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertCSVDataSchema, 
  insertCustomerTypeSchema, 
  insertPersistentDiscountSchema, 
  insertShortTermSaleSchema,
  insertFeatureCategorySchema,
  insertFeatureSubCategorySchema,
  insertFeatureSchema,
  insertStockModelSchema,
  insertOrderDraftSchema,
  insertFormSchema,
  insertFormSubmissionSchema,
  insertInventoryItemSchema,
  insertInventoryScanSchema,
  insertEmployeeSchema,
  insertQcDefinitionSchema,
  insertQcSubmissionSchema,
  insertMaintenanceScheduleSchema,
  insertMaintenanceLogSchema,
  insertTimeClockEntrySchema,
  insertChecklistItemSchema,
  insertOnboardingDocSchema,
  insertCustomerAddressSchema,
  insertCommunicationLogSchema,
  insertPdfDocumentSchema
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // CSV Data routes
  app.post("/api/csv-data", async (req, res) => {
    try {
      const result = insertCSVDataSchema.parse(req.body);
      const savedData = await storage.saveCSVData(result);
      res.json(savedData);
    } catch (error) {
      res.status(400).json({ error: "Invalid CSV data" });
    }
  });

  app.get("/api/csv-data", async (req, res) => {
    try {
      const data = await storage.getLatestCSVData();
      if (data) {
        res.json(data);
      } else {
        res.status(404).json({ error: "No CSV data found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve CSV data" });
    }
  });

  app.delete("/api/csv-data", async (req, res) => {
    try {
      await storage.clearCSVData();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear CSV data" });
    }
  });

  // Customer Types routes
  app.get("/api/customer-types", async (req, res) => {
    try {
      const customerTypes = await storage.getAllCustomerTypes();
      res.json(customerTypes);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve customer types" });
    }
  });

  app.post("/api/customer-types", async (req, res) => {
    try {
      const result = insertCustomerTypeSchema.parse(req.body);
      const customerType = await storage.createCustomerType(result);
      res.json(customerType);
    } catch (error) {
      res.status(400).json({ error: "Invalid customer type data" });
    }
  });

  app.put("/api/customer-types/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertCustomerTypeSchema.partial().parse(req.body);
      const customerType = await storage.updateCustomerType(id, result);
      res.json(customerType);
    } catch (error) {
      res.status(400).json({ error: "Invalid customer type data" });
    }
  });

  app.delete("/api/customer-types/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCustomerType(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete customer type" });
    }
  });

  // Persistent Discounts routes
  app.get("/api/persistent-discounts", async (req, res) => {
    try {
      const discounts = await storage.getAllPersistentDiscounts();
      res.json(discounts);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve persistent discounts" });
    }
  });

  app.post("/api/persistent-discounts", async (req, res) => {
    try {
      const result = insertPersistentDiscountSchema.parse(req.body);
      const discount = await storage.createPersistentDiscount(result);
      res.json(discount);
    } catch (error) {
      res.status(400).json({ error: "Invalid persistent discount data" });
    }
  });

  app.put("/api/persistent-discounts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertPersistentDiscountSchema.partial().parse(req.body);
      const discount = await storage.updatePersistentDiscount(id, result);
      res.json(discount);
    } catch (error) {
      res.status(400).json({ error: "Invalid persistent discount data" });
    }
  });

  app.delete("/api/persistent-discounts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePersistentDiscount(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete persistent discount" });
    }
  });

  // Short Term Sales routes
  app.get("/api/short-term-sales", async (req, res) => {
    try {
      const sales = await storage.getAllShortTermSales();
      res.json(sales);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve short term sales" });
    }
  });

  app.post("/api/short-term-sales", async (req, res) => {
    try {
      const result = insertShortTermSaleSchema.parse(req.body);
      const sale = await storage.createShortTermSale(result);
      res.json(sale);
    } catch (error) {
      res.status(400).json({ error: "Invalid short term sale data" });
    }
  });

  app.put("/api/short-term-sales/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertShortTermSaleSchema.partial().parse(req.body);
      const sale = await storage.updateShortTermSale(id, result);
      res.json(sale);
    } catch (error) {
      res.status(400).json({ error: "Invalid short term sale data" });
    }
  });

  app.delete("/api/short-term-sales/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteShortTermSale(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete short term sale" });
    }
  });

  // Order API endpoints for OrderEntry component
  app.get("/api/orders/last-id", async (req, res) => {
    try {
      // Mock response for now - in real implementation, query the orders table
      res.json({ lastOrderId: "AP001" });
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve last order ID" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      // Mock order creation - in real implementation, save to orders table
      const orderData = req.body;
      res.json({ 
        id: Date.now(), 
        ...orderData,
        status: "created",
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      res.status(400).json({ error: "Invalid order data" });
    }
  });



  // Feature Categories API
  app.get("/api/feature-categories", async (req, res) => {
    try {
      const categories = await storage.getAllFeatureCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve feature categories" });
    }
  });

  app.post("/api/feature-categories", async (req, res) => {
    try {
      const result = insertFeatureCategorySchema.parse(req.body);
      const category = await storage.createFeatureCategory(result);
      res.json(category);
    } catch (error) {
      res.status(400).json({ error: "Invalid feature category data" });
    }
  });

  app.put("/api/feature-categories/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = insertFeatureCategorySchema.partial().parse(req.body);
      const category = await storage.updateFeatureCategory(id, result);
      res.json(category);
    } catch (error) {
      res.status(400).json({ error: "Invalid feature category data" });
    }
  });

  app.delete("/api/feature-categories/:id", async (req, res) => {
    try {
      const id = req.params.id;
      await storage.deleteFeatureCategory(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Failed to delete feature category" });
    }
  });

  // Feature Sub-Categories API
  app.get("/api/feature-sub-categories", async (req, res) => {
    try {
      const subCategories = await storage.getAllFeatureSubCategories();
      res.json(subCategories);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve feature sub-categories" });
    }
  });

  app.post("/api/feature-sub-categories", async (req, res) => {
    try {
      const result = insertFeatureSubCategorySchema.parse(req.body);
      const subCategory = await storage.createFeatureSubCategory(result);
      res.json(subCategory);
    } catch (error) {
      res.status(400).json({ error: "Invalid feature sub-category data" });
    }
  });

  app.put("/api/feature-sub-categories/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = insertFeatureSubCategorySchema.partial().parse(req.body);
      const subCategory = await storage.updateFeatureSubCategory(id, result);
      res.json(subCategory);
    } catch (error) {
      res.status(400).json({ error: "Invalid feature sub-category data" });
    }
  });

  app.delete("/api/feature-sub-categories/:id", async (req, res) => {
    try {
      const id = req.params.id;
      await storage.deleteFeatureSubCategory(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete feature sub-category" });
    }
  });

  // Features API
  app.get("/api/features", async (req, res) => {
    try {
      const features = await storage.getAllFeatures();
      res.json(features);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve features" });
    }
  });

  app.post("/api/features", async (req, res) => {
    try {
      const result = insertFeatureSchema.parse(req.body);
      const feature = await storage.createFeature(result);
      res.json(feature);
    } catch (error) {
      res.status(400).json({ error: "Invalid feature data" });
    }
  });

  app.put("/api/features/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = insertFeatureSchema.partial().parse(req.body);
      const feature = await storage.updateFeature(id, result);
      res.json(feature);
    } catch (error) {
      console.error("Feature update error:", error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: "Invalid feature data" });
      }
    }
  });

  app.delete("/api/features/:id", async (req, res) => {
    try {
      const id = req.params.id;
      await storage.deleteFeature(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete feature" });
    }
  });

  // Stock Models API
  app.get("/api/stock-models", async (req, res) => {
    try {
      const stockModels = await storage.getAllStockModels();
      res.json(stockModels);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve stock models" });
    }
  });

  app.post("/api/stock-models", async (req, res) => {
    try {
      const result = insertStockModelSchema.parse(req.body);
      const stockModel = await storage.createStockModel(result);
      res.json(stockModel);
    } catch (error) {
      res.status(400).json({ error: "Invalid stock model data" });
    }
  });

  app.put("/api/stock-models/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = insertStockModelSchema.partial().parse(req.body);
      const stockModel = await storage.updateStockModel(id, result);
      res.json(stockModel);
    } catch (error) {
      console.error("Stock model update error:", error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: "Invalid stock model data" });
      }
    }
  });

  app.delete("/api/stock-models/:id", async (req, res) => {
    try {
      const id = req.params.id;
      await storage.deleteStockModel(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete stock model" });
    }
  });

  // Order Drafts API
  app.post("/api/orders/draft", async (req, res) => {
    try {
      const result = insertOrderDraftSchema.parse(req.body);
      
      // Check if draft already exists with this orderId
      const existingDraft = await storage.getOrderDraft(result.orderId);
      if (existingDraft) {
        // Update existing draft instead of creating new one
        const updatedDraft = await storage.updateOrderDraft(result.orderId, result);
        res.json(updatedDraft);
      } else {
        const draft = await storage.createOrderDraft(result);
        res.json(draft);
      }
    } catch (error) {
      console.error("Order draft creation error:", error);
      res.status(400).json({ error: "Invalid order draft data" });
    }
  });

  app.put("/api/orders/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;
      const result = insertOrderDraftSchema.partial().parse(req.body);
      
      // Check if draft exists, if not create it
      const existingDraft = await storage.getOrderDraft(orderId);
      if (existingDraft) {
        const updatedDraft = await storage.updateOrderDraft(orderId, result);
        res.json(updatedDraft);
      } else {
        // Create new draft if it doesn't exist
        const newDraft = await storage.createOrderDraft({ ...result, orderId } as any);
        res.json(newDraft);
      }
    } catch (error) {
      console.error("Order draft update error:", error);
      res.status(400).json({ error: "Invalid order draft data" });
    }
  });

  app.put("/api/orders/draft/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;
      const result = insertOrderDraftSchema.partial().parse(req.body);
      const updatedDraft = await storage.updateOrderDraft(orderId, result);
      res.json(updatedDraft);
    } catch (error) {
      console.error("Order draft update error:", error);
      res.status(400).json({ error: "Invalid order draft data" });
    }
  });

  app.get("/api/orders/drafts", async (req, res) => {
    try {
      const drafts = await storage.getAllOrderDrafts();
      res.json(drafts);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve order drafts" });
    }
  });

  app.get("/api/orders/draft/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;
      const draft = await storage.getOrderDraft(orderId);
      if (draft) {
        res.json(draft);
      } else {
        res.status(404).json({ error: "Order draft not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve order draft" });
    }
  });

  app.delete("/api/orders/draft/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;
      await storage.deleteOrderDraft(orderId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete order draft" });
    }
  });

  // Draft workflow endpoints
  app.post("/api/orders/draft/:orderId/send-confirmation", async (req, res) => {
    try {
      const { orderId } = req.params;
      const draft = await storage.getOrderDraft(orderId);
      
      if (!draft) {
        return res.status(404).json({ error: "Order draft not found" });
      }
      
      if (draft.status !== 'DRAFT') {
        return res.status(400).json({ error: "Order must be in DRAFT status" });
      }
      
      await storage.updateOrderDraft(orderId, { status: 'CONFIRMED' });
      res.json({ success: true, message: "Order sent for confirmation" });
    } catch (error) {
      console.error("Send confirmation error:", error);
      res.status(500).json({ error: "Failed to send order for confirmation" });
    }
  });

  app.post("/api/orders/draft/:orderId/finalize", async (req, res) => {
    try {
      const { orderId } = req.params;
      const draft = await storage.getOrderDraft(orderId);
      
      if (!draft) {
        return res.status(404).json({ error: "Order draft not found" });
      }
      
      if (draft.status !== 'CONFIRMED') {
        return res.status(400).json({ error: "Order must be in CONFIRMED status" });
      }
      
      await storage.updateOrderDraft(orderId, { status: 'FINALIZED' });
      res.json({ success: true, message: "Order finalized successfully" });
    } catch (error) {
      console.error("Finalize order error:", error);
      res.status(500).json({ error: "Failed to finalize order" });
    }
  });

  // Forms routes
  app.get("/api/forms", async (req, res) => {
    try {
      const forms = await storage.getAllForms();
      res.json(forms);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve forms" });
    }
  });

  app.get("/api/forms/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const form = await storage.getForm(id);
      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }
      res.json(form);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve form" });
    }
  });

  app.post("/api/forms", async (req, res) => {
    try {
      const result = insertFormSchema.parse(req.body);
      const form = await storage.createForm(result);
      res.json(form);
    } catch (error) {
      console.error("Create form error:", error);
      res.status(400).json({ error: "Invalid form data" });
    }
  });

  app.put("/api/forms/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertFormSchema.partial().parse(req.body);
      const form = await storage.updateForm(id, result);
      res.json(form);
    } catch (error) {
      console.error("Update form error:", error);
      res.status(400).json({ error: "Failed to update form" });
    }
  });

  app.delete("/api/forms/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteForm(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete form" });
    }
  });

  // Form submissions routes
  app.get("/api/form-submissions", async (req, res) => {
    try {
      const formId = req.query.formId ? parseInt(req.query.formId as string) : undefined;
      const submissions = await storage.getAllFormSubmissions(formId);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve form submissions" });
    }
  });

  app.post("/api/form-submissions", async (req, res) => {
    try {
      const result = insertFormSubmissionSchema.parse(req.body);
      const submission = await storage.createFormSubmission(result);
      res.json(submission);
    } catch (error) {
      console.error("Create submission error:", error);
      res.status(400).json({ error: "Invalid submission data" });
    }
  });

  app.delete("/api/form-submissions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteFormSubmission(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete submission" });
    }
  });

  // Inventory item routes
  app.get("/api/inventory", async (req, res) => {
    try {
      const items = await storage.getAllInventoryItems();
      res.json(items);
    } catch (error) {
      console.error("Get inventory items error:", error);
      res.status(500).json({ error: "Failed to get inventory items" });
    }
  });

  app.get("/api/inventory/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const item = await storage.getInventoryItem(id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Get inventory item error:", error);
      res.status(500).json({ error: "Failed to get inventory item" });
    }
  });

  app.post("/api/inventory", async (req, res) => {
    try {
      const validatedData = insertInventoryItemSchema.parse(req.body);
      const item = await storage.createInventoryItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Create inventory item error:", error);
      res.status(400).json({ error: "Invalid inventory item data" });
    }
  });

  app.put("/api/inventory/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertInventoryItemSchema.partial().parse(req.body);
      const item = await storage.updateInventoryItem(id, validatedData);
      res.json(item);
    } catch (error) {
      console.error("Update inventory item error:", error);
      res.status(400).json({ error: "Invalid inventory item data" });
    }
  });

  app.delete("/api/inventory/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteInventoryItem(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete inventory item error:", error);
      res.status(500).json({ error: "Failed to delete inventory item" });
    }
  });

  // Inventory scan routes
  app.post("/api/inventory/scan", async (req, res) => {
    try {
      const validatedData = insertInventoryScanSchema.parse(req.body);
      const scan = await storage.createInventoryScan(validatedData);
      res.status(201).json(scan);
    } catch (error) {
      console.error("Create inventory scan error:", error);
      res.status(400).json({ error: "Invalid scan data" });
    }
  });

  app.get("/api/inventory/scans", async (req, res) => {
    try {
      const scans = await storage.getAllInventoryScans();
      res.json(scans);
    } catch (error) {
      console.error("Get inventory scans error:", error);
      res.status(500).json({ error: "Failed to get inventory scans" });
    }
  });

  // Employee routes
  app.get("/api/employees", async (req, res) => {
    try {
      const role = req.query.role as string;
      const employees = role 
        ? await storage.getEmployeesByRole(role)
        : await storage.getAllEmployees();
      res.json(employees);
    } catch (error) {
      console.error("Get employees error:", error);
      res.status(500).json({ error: "Failed to get employees" });
    }
  });

  app.post("/api/employees", async (req, res) => {
    try {
      const validatedData = insertEmployeeSchema.parse(req.body);
      const employee = await storage.createEmployee(validatedData);
      res.status(201).json(employee);
    } catch (error) {
      console.error("Create employee error:", error);
      res.status(400).json({ error: "Invalid employee data" });
    }
  });

  // QC Definition routes
  app.get("/api/qc-definitions", async (req, res) => {
    try {
      const { line, department, final } = req.query;
      const definitions = await storage.getQCDefinitions(
        line as string, 
        department as string, 
        final === 'true'
      );
      res.json(definitions);
    } catch (error) {
      console.error("Get QC definitions error:", error);
      res.status(500).json({ error: "Failed to get QC definitions" });
    }
  });

  app.post("/api/qc-definitions", async (req, res) => {
    try {
      const validatedData = insertQcDefinitionSchema.parse(req.body);
      const definition = await storage.createQCDefinition(validatedData);
      res.status(201).json(definition);
    } catch (error) {
      console.error("Create QC definition error:", error);
      res.status(400).json({ error: "Invalid QC definition data" });
    }
  });

  // QC Submission routes
  app.get("/api/qc-submissions", async (req, res) => {
    try {
      const { status } = req.query;
      const submissions = await storage.getQCSubmissions(status as string);
      res.json(submissions);
    } catch (error) {
      console.error("Get QC submissions error:", error);
      res.status(500).json({ error: "Failed to get QC submissions" });
    }
  });

  app.post("/api/qc-submissions", async (req, res) => {
    try {
      const validatedData = insertQcSubmissionSchema.parse(req.body);
      const submission = await storage.createQCSubmission(validatedData);
      res.status(201).json(submission);
    } catch (error) {
      console.error("Create QC submission error:", error);
      res.status(400).json({ error: "Invalid QC submission data" });
    }
  });

  app.get("/api/qc-submissions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const submission = await storage.getQCSubmission(id);
      if (!submission) {
        return res.status(404).json({ error: "QC submission not found" });
      }
      res.json(submission);
    } catch (error) {
      console.error("Get QC submission error:", error);
      res.status(500).json({ error: "Failed to get QC submission" });
    }
  });

  // Maintenance Schedule routes
  app.get("/api/maintenance-schedules", async (req, res) => {
    try {
      const schedules = await storage.getAllMaintenanceSchedules();
      res.json(schedules);
    } catch (error) {
      console.error("Get maintenance schedules error:", error);
      res.status(500).json({ error: "Failed to get maintenance schedules" });
    }
  });

  app.post("/api/maintenance-schedules", async (req, res) => {
    try {
      const validatedData = insertMaintenanceScheduleSchema.parse(req.body);
      const schedule = await storage.createMaintenanceSchedule(validatedData);
      res.status(201).json(schedule);
    } catch (error) {
      console.error("Create maintenance schedule error:", error);
      res.status(400).json({ error: "Invalid maintenance schedule data" });
    }
  });

  // Maintenance Log routes
  app.get("/api/maintenance-logs", async (req, res) => {
    try {
      const logs = await storage.getAllMaintenanceLogs();
      res.json(logs);
    } catch (error) {
      console.error("Get maintenance logs error:", error);
      res.status(500).json({ error: "Failed to get maintenance logs" });
    }
  });

  app.post("/api/maintenance-logs", async (req, res) => {
    try {
      const validatedData = insertMaintenanceLogSchema.parse(req.body);
      const log = await storage.createMaintenanceLog(validatedData);
      res.status(201).json(log);
    } catch (error) {
      console.error("Create maintenance log error:", error);
      res.status(400).json({ error: "Invalid maintenance log data" });
    }
  });

  // Employee Portal - Time Clock routes
  app.get("/api/timeclock", async (req, res) => {
    try {
      const { employeeId } = req.query;
      if (!employeeId) {
        return res.status(400).json({ error: "Employee ID is required" });
      }
      const status = await storage.getTimeClockStatus(employeeId as string);
      res.json(status);
    } catch (error) {
      console.error("Get time clock status error:", error);
      res.status(500).json({ error: "Failed to get time clock status" });
    }
  });

  app.post("/api/timeclock", async (req, res) => {
    try {
      const { employeeId, action, timestamp } = req.body;
      if (!employeeId || !action || !timestamp) {
        return res.status(400).json({ error: "Employee ID, action, and timestamp are required" });
      }
      
      if (action === 'IN') {
        await storage.clockIn(employeeId, timestamp);
      } else if (action === 'OUT') {
        await storage.clockOut(employeeId, timestamp);
      } else {
        return res.status(400).json({ error: "Invalid action. Must be 'IN' or 'OUT'" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Time clock action error:", error);
      res.status(500).json({ error: "Failed to perform time clock action" });
    }
  });

  app.get("/api/timeclock/entries", async (req, res) => {
    try {
      const { employeeId, date } = req.query;
      const entries = await storage.getTimeClockEntries(
        employeeId as string, 
        date as string
      );
      res.json(entries);
    } catch (error) {
      console.error("Get time clock entries error:", error);
      res.status(500).json({ error: "Failed to get time clock entries" });
    }
  });

  app.post("/api/timeclock/entries", async (req, res) => {
    try {
      const validatedData = insertTimeClockEntrySchema.parse(req.body);
      const entry = await storage.createTimeClockEntry(validatedData);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Create time clock entry error:", error);
      res.status(400).json({ error: "Invalid time clock entry data" });
    }
  });

  app.put("/api/timeclock/entries/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertTimeClockEntrySchema.partial().parse(req.body);
      const entry = await storage.updateTimeClockEntry(id, validatedData);
      res.json(entry);
    } catch (error) {
      console.error("Update time clock entry error:", error);
      res.status(400).json({ error: "Failed to update time clock entry" });
    }
  });

  app.delete("/api/timeclock/entries/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTimeClockEntry(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete time clock entry error:", error);
      res.status(500).json({ error: "Failed to delete time clock entry" });
    }
  });

  // Employee Portal - Checklist routes
  app.get("/api/checklist", async (req, res) => {
    try {
      const { employeeId, date } = req.query;
      if (!employeeId || !date) {
        return res.status(400).json({ error: "Employee ID and date are required" });
      }
      const items = await storage.getChecklistItems(employeeId as string, date as string);
      res.json(items);
    } catch (error) {
      console.error("Get checklist items error:", error);
      res.status(500).json({ error: "Failed to get checklist items" });
    }
  });

  app.post("/api/checklist", async (req, res) => {
    try {
      const validatedData = insertChecklistItemSchema.parse(req.body);
      const item = await storage.createChecklistItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Create checklist item error:", error);
      res.status(400).json({ error: "Invalid checklist item data" });
    }
  });

  app.post("/api/checklist/complete", async (req, res) => {
    try {
      const { employeeId, date, items } = req.body;
      if (!employeeId || !date || !items) {
        return res.status(400).json({ error: "Employee ID, date, and items are required" });
      }
      await storage.completeChecklist(employeeId, date, items);
      res.json({ success: true });
    } catch (error) {
      console.error("Complete checklist error:", error);
      res.status(500).json({ error: "Failed to complete checklist" });
    }
  });

  // Employee Portal - Onboarding Documents routes
  app.get("/api/onboarding-docs", async (req, res) => {
    try {
      const { employeeId } = req.query;
      if (!employeeId) {
        return res.status(400).json({ error: "Employee ID is required" });
      }
      const docs = await storage.getOnboardingDocs(employeeId as string);
      res.json(docs);
    } catch (error) {
      console.error("Get onboarding docs error:", error);
      res.status(500).json({ error: "Failed to get onboarding documents" });
    }
  });

  app.post("/api/onboarding-docs", async (req, res) => {
    try {
      const validatedData = insertOnboardingDocSchema.parse(req.body);
      const doc = await storage.createOnboardingDoc(validatedData);
      res.status(201).json(doc);
    } catch (error) {
      console.error("Create onboarding doc error:", error);
      res.status(400).json({ error: "Invalid onboarding document data" });
    }
  });

  app.post("/api/onboarding-docs/:id/sign", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { signatureDataURL } = req.body;
      if (!signatureDataURL) {
        return res.status(400).json({ error: "Signature data URL is required" });
      }
      const doc = await storage.signOnboardingDoc(id, signatureDataURL);
      res.json(doc);
    } catch (error) {
      console.error("Sign onboarding doc error:", error);
      res.status(500).json({ error: "Failed to sign onboarding document" });
    }
  });

  // Module 8: Address Management routes
  app.get("/api/address/autocomplete", async (req, res) => {
    try {
      const { query } = req.query;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      
      // Mock address autocomplete - in production, integrate with Google Places API or similar
      const mockSuggestions = [
        `${query} Main St, New York, NY 10001`,
        `${query} Oak Avenue, Los Angeles, CA 90210`,
        `${query} Pine Street, Chicago, IL 60601`,
        `${query} Cedar Drive, Houston, TX 77001`,
        `${query} Elm Boulevard, Phoenix, AZ 85001`
      ].filter(suggestion => suggestion.toLowerCase().includes(query.toLowerCase()));
      
      res.json(mockSuggestions);
    } catch (error) {
      console.error("Address autocomplete error:", error);
      res.status(500).json({ error: "Failed to fetch address suggestions" });
    }
  });

  app.post("/api/address/validate", async (req, res) => {
    try {
      const { address } = req.body;
      if (!address) {
        return res.status(400).json({ error: "Address is required" });
      }
      
      // Mock address validation - in production, integrate with USPS API or similar
      const validated = {
        ...address,
        // Normalize some common fields
        state: address.state?.toUpperCase(),
        zipCode: address.zipCode?.replace(/\D/g, '').slice(0, 5),
        country: address.country || "United States"
      };
      
      res.json(validated);
    } catch (error) {
      console.error("Address validation error:", error);
      res.status(500).json({ error: "Failed to validate address" });
    }
  });

  app.get("/api/addresses", async (req, res) => {
    try {
      const { customerId } = req.query;
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID is required" });
      }
      const addresses = await storage.getCustomerAddresses(customerId as string);
      res.json(addresses);
    } catch (error) {
      console.error("Get customer addresses error:", error);
      res.status(500).json({ error: "Failed to get customer addresses" });
    }
  });

  app.post("/api/addresses", async (req, res) => {
    try {
      const validatedData = insertCustomerAddressSchema.parse(req.body);
      const address = await storage.createCustomerAddress(validatedData);
      res.status(201).json(address);
    } catch (error) {
      console.error("Create customer address error:", error);
      res.status(400).json({ error: "Invalid customer address data" });
    }
  });

  // Module 8: PDF Generation routes
  app.get("/api/pdfs/order-confirmation", async (req, res) => {
    try {
      const { orderId } = req.query;
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required" });
      }
      
      // Mock PDF generation - in production, use a PDF library like jsPDF or Puppeteer
      const mockPdfBuffer = Buffer.from(`Mock Order Confirmation PDF for Order: ${orderId}`);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="order-confirmation-${orderId}.pdf"`);
      res.send(mockPdfBuffer);
    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  app.get("/api/pdfs/packing-slip", async (req, res) => {
    try {
      const { orderId } = req.query;
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required" });
      }
      
      // Mock PDF generation
      const mockPdfBuffer = Buffer.from(`Mock Packing Slip PDF for Order: ${orderId}`);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="packing-slip-${orderId}.pdf"`);
      res.send(mockPdfBuffer);
    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  app.get("/api/pdfs/invoice", async (req, res) => {
    try {
      const { orderId } = req.query;
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required" });
      }
      
      // Mock PDF generation
      const mockPdfBuffer = Buffer.from(`Mock Invoice PDF for Order: ${orderId}`);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${orderId}.pdf"`);
      res.send(mockPdfBuffer);
    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // Module 8: Communication routes
  app.post("/api/communications/order-confirmation", async (req, res) => {
    try {
      const { orderId, via } = req.body;
      if (!orderId || !via) {
        return res.status(400).json({ error: "Order ID and communication method are required" });
      }
      
      // Mock communication sending - in production, integrate with SendGrid, Twilio, etc.
      const mockLog = {
        id: Date.now(),
        orderId,
        customerId: `CUST-${orderId}`, // Mock customer ID
        type: 'order-confirmation' as const,
        method: via as 'email' | 'sms',
        recipient: via === 'email' ? 'customer@example.com' : '+1234567890',
        subject: via === 'email' ? 'Order Confirmation' : undefined,
        message: `Your order ${orderId} has been confirmed`,
        status: 'sent' as const,
        sentAt: new Date(),
        createdAt: new Date(),
      };
      
      // TODO: Replace with actual database call when schema is pushed
      // const log = await storage.createCommunicationLog(logData);
      res.json({ success: true, log: mockLog });
    } catch (error) {
      console.error("Communication error:", error);
      res.status(500).json({ error: "Failed to send communication" });
    }
  });

  app.post("/api/communications/shipping-notification", async (req, res) => {
    try {
      const { orderId, via } = req.body;
      if (!orderId || !via) {
        return res.status(400).json({ error: "Order ID and communication method are required" });
      }
      
      const mockLog = {
        id: Date.now(),
        orderId,
        customerId: `CUST-${orderId}`,
        type: 'shipping-notification' as const,
        method: via as 'email' | 'sms',
        recipient: via === 'email' ? 'customer@example.com' : '+1234567890',
        subject: via === 'email' ? 'Shipping Notification' : undefined,
        message: `Your order ${orderId} has been shipped`,
        status: 'sent' as const,
        sentAt: new Date(),
        createdAt: new Date(),
      };
      
      // TODO: Replace with actual database call when schema is pushed
      // const log = await storage.createCommunicationLog(logData);
      res.json({ success: true, log: mockLog });
    } catch (error) {
      console.error("Communication error:", error);
      res.status(500).json({ error: "Failed to send communication" });
    }
  });

  app.post("/api/communications/quality-alert", async (req, res) => {
    try {
      const { orderId, via, message } = req.body;
      if (!orderId || !via || !message) {
        return res.status(400).json({ error: "Order ID, communication method, and message are required" });
      }
      
      const mockLog = {
        id: Date.now(),
        orderId,
        customerId: `CUST-${orderId}`,
        type: 'quality-alert' as const,
        method: via as 'email' | 'sms',
        recipient: via === 'email' ? 'customer@example.com' : '+1234567890',
        subject: via === 'email' ? 'Quality Control Alert' : undefined,
        message,
        status: 'sent' as const,
        sentAt: new Date(),
        createdAt: new Date(),
      };
      
      // TODO: Replace with actual database call when schema is pushed
      // const log = await storage.createCommunicationLog(logData);
      res.json({ success: true, log: mockLog });
    } catch (error) {
      console.error("Communication error:", error);
      res.status(500).json({ error: "Failed to send communication" });
    }
  });

  app.get("/api/communications", async (req, res) => {
    try {
      const { orderId } = req.query;
      if (!orderId) {
        return res.status(400).json({ error: "Order ID is required" });
      }
      // TODO: Replace with actual database call when schema is pushed
      // const logs = await storage.getCommunicationLogs(orderId as string);
      const mockLogs = [
        {
          id: 1,
          orderId: orderId as string,
          customerId: `CUST-${orderId}`,
          type: 'order-confirmation',
          method: 'email',
          recipient: 'customer@example.com',
          subject: 'Order Confirmation',
          message: `Your order ${orderId} has been confirmed`,
          status: 'sent',
          sentAt: new Date(),
          createdAt: new Date(),
        }
      ];
      res.json(mockLogs);
    } catch (error) {
      console.error("Get communication logs error:", error);
      res.status(500).json({ error: "Failed to get communication logs" });
    }
  });

  // Module 9: Finance & Reporting routes
  app.get("/api/finance/ap", async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;
      
      // Mock AP transactions data
      const mockAPTransactions = [
        {
          id: 1,
          poNumber: "PO-2025-001",
          vendorName: "Steel Supply Co",
          amount: 15750.00,
          date: "2025-01-15",
          status: "paid"
        },
        {
          id: 2,
          poNumber: "PO-2025-002",
          vendorName: "Machine Parts Inc",
          amount: 8920.50,
          date: "2025-01-18",
          status: "pending"
        },
        {
          id: 3,
          poNumber: "PO-2025-003",
          vendorName: "Tool & Die Works",
          amount: 12300.75,
          date: "2025-01-20",
          status: "overdue"
        },
        {
          id: 4,
          poNumber: "PO-2025-004",
          vendorName: "Precision Manufacturing",
          amount: 22150.00,
          date: "2025-01-22",
          status: "paid"
        },
        {
          id: 5,
          poNumber: "PO-2025-005",
          vendorName: "Industrial Supplies LLC",
          amount: 5690.25,
          date: "2025-01-25",
          status: "pending"
        }
      ];

      // Filter by date range if provided
      let filteredTransactions = mockAPTransactions;
      if (dateFrom && dateTo) {
        filteredTransactions = mockAPTransactions.filter(tx => {
          const txDate = new Date(tx.date);
          return txDate >= new Date(dateFrom) && txDate <= new Date(dateTo);
        });
      }

      res.json(filteredTransactions);
    } catch (error) {
      console.error("AP transactions error:", error);
      res.status(500).json({ error: "Failed to fetch AP transactions" });
    }
  });

  app.get("/api/finance/ar", async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;
      
      // Mock AR transactions data
      const mockARTransactions = [
        {
          id: 1,
          orderId: "AG001",
          customerName: "Acme Manufacturing",
          amount: 18500.00,
          date: "2025-01-10",
          terms: "Net 30",
          status: "paid"
        },
        {
          id: 2,
          orderId: "AG002",
          customerName: "Beta Industries",
          amount: 12750.50,
          date: "2025-01-12",
          terms: "prepaid",
          status: "paid"
        },
        {
          id: 3,
          orderId: "AG003",
          customerName: "Gamma Corporation",
          amount: 24800.25,
          date: "2025-01-15",
          terms: "Net 30",
          status: "pending"
        },
        {
          id: 4,
          orderId: "AG004",
          customerName: "Delta Systems",
          amount: 9320.75,
          date: "2025-01-18",
          terms: "Net 60",
          status: "overdue"
        },
        {
          id: 5,
          orderId: "AG005",
          customerName: "Echo Technologies",
          amount: 16450.00,
          date: "2025-01-20",
          terms: "prepaid",
          status: "paid"
        }
      ];

      // Filter by date range if provided
      let filteredTransactions = mockARTransactions;
      if (dateFrom && dateTo) {
        filteredTransactions = mockARTransactions.filter(tx => {
          const txDate = new Date(tx.date);
          return txDate >= new Date(dateFrom) && txDate <= new Date(dateTo);
        });
      }

      res.json(filteredTransactions);
    } catch (error) {
      console.error("AR transactions error:", error);
      res.status(500).json({ error: "Failed to fetch AR transactions" });
    }
  });

  app.get("/api/finance/cogs", async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;
      
      // Mock COGS data
      const mockCOGSData = {
        standardCost: 125000.00,
        actualCost: 132500.00,
        breakdown: [
          {
            category: "Raw Materials",
            standard: 45000.00,
            actual: 47500.00
          },
          {
            category: "Direct Labor",
            standard: 35000.00,
            actual: 38200.00
          },
          {
            category: "Manufacturing Overhead",
            standard: 25000.00,
            actual: 26800.00
          },
          {
            category: "Quality Control",
            standard: 8000.00,
            actual: 8500.00
          },
          {
            category: "Packaging & Shipping",
            standard: 7000.00,
            actual: 6800.00
          },
          {
            category: "Utilities",
            standard: 5000.00,
            actual: 4700.00
          }
        ]
      };

      res.json(mockCOGSData);
    } catch (error) {
      console.error("COGS data error:", error);
      res.status(500).json({ error: "Failed to fetch COGS data" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
