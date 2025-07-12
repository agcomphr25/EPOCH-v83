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
  insertStockModelSchema
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

  const httpServer = createServer(app);

  return httpServer;
}
