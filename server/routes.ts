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
  insertEmployeeSchema
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

  const httpServer = createServer(app);

  return httpServer;
}
