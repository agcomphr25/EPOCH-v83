import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertCSVDataSchema, 
  insertCustomerTypeSchema, 
  insertPersistentDiscountSchema, 
  insertShortTermSaleSchema 
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



  const httpServer = createServer(app);

  return httpServer;
}
