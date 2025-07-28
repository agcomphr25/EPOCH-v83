import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateP1OrderId } from "./utils/orderIdGenerator";
import { db } from "./db";
import { enhancedForms, enhancedFormCategories } from "./schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { uploadMiddleware, getFileInfo, getFileUrl, validateEmployeeDocumentAccess, getDocumentType } from "./utils/fileUpload";
import { authenticateToken, requireRole, requireEmployeeAccess, authenticatePortalToken } from "./middleware/auth";
import { AuthService } from "./auth";
import cookieParser from 'cookie-parser';


// SmartyStreets direct API calls
import axios from 'axios';
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
  insertPartsRequestSchema,
  insertBomDefinitionSchema,
  insertBomItemSchema,
  insertCustomerSchema,
  insertCustomerAddressSchema,
  insertCommunicationLogSchema,
  insertPdfDocumentSchema,
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertProductionOrderSchema,
  insertP2CustomerSchema,
  insertP2PurchaseOrderSchema,
  insertP2PurchaseOrderItemSchema,
  insertP2ProductionOrderSchema,
  insertMoldSchema,
  insertEmployeeLayupSettingsSchema,
  insertLayupOrderSchema,
  insertLayupScheduleSchema,
  insertOrderSchema,
  // New employee management schemas
  insertCertificationSchema,
  insertEmployeeCertificationSchema,
  insertEvaluationSchema,
  insertUserSessionSchema,
  insertEmployeeDocumentSchema,
  insertEmployeeAuditLogSchema,
  // Authentication schemas
  insertUserSchema,
  loginSchema,
  changePasswordSchema,
  // Purchase Review Checklist schema
  insertPurchaseReviewChecklistSchema,
  // Task Tracker schema
  insertTaskItemSchema
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable cookie parsing for session management
  app.use(cookieParser());

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = loginSchema.parse(req.body);
      const ipAddress = req.ip || req.connection.remoteAddress || null;
      const userAgent = req.get('User-Agent') || null;

      const result = await AuthService.authenticate(username, password, ipAddress, userAgent);
      
      if (!result) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Set secure cookie
      res.cookie('sessionToken', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      });

      res.json({
        success: true,
        user: result.user,
        token: result.token
      });
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", authenticateToken, async (req, res) => {
    try {
      const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
      
      if (sessionToken) {
        await AuthService.invalidateSession(sessionToken);
      }

      res.clearCookie('sessionToken');
      res.json({ success: true });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    res.json(req.user);
  });

  // Session endpoint for frontend compatibility
  app.get("/api/auth/session", authenticateToken, async (req, res) => {
    res.json(req.user);
  });

  app.get("/api/auth/user", authenticateToken, async (req, res) => {
    res.json(req.user);
  });

  app.post("/api/auth/change-password", authenticateToken, async (req, res) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const success = await AuthService.changePassword(req.user!.id, currentPassword, newPassword);
      
      if (!success) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // User management routes (Admin/HR only)
  app.post("/api/users", authenticateToken, requireRole('ADMIN', 'HR'), async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const passwordHash = await AuthService.hashPassword(userData.password);
      
      const user = await storage.createUser({
        ...userData,
        passwordHash,
      });

      // Don't return the password hash
      const { passwordHash: _, ...userResponse } = user;
      res.json(userResponse);
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.get("/api/users", authenticateToken, requireRole('ADMIN', 'HR'), async (req, res) => {
    try {
      // This would need to be implemented in storage
      res.json([]);
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: "Failed to retrieve users" });
    }
  });

  // Portal access routes
  app.get("/api/portal/:portalId/employee", authenticatePortalToken, async (req, res) => {
    try {
      const employeeId = req.portalEmployeeId!;
      const employee = await storage.getEmployee(employeeId);
      
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      res.json(employee);
    } catch (error) {
      console.error('Portal employee error:', error);
      res.status(500).json({ error: "Failed to retrieve employee data" });
    }
  });

  // Generate portal link for employee (Admin/HR only)
  app.post("/api/employees/:employeeId/portal-link", authenticateToken, requireRole('ADMIN', 'HR'), async (req, res) => {
    try {
      const employeeId = parseInt(req.params.employeeId);
      const employee = await storage.getEmployee(employeeId);
      
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      const portalToken = await storage.generatePortalToken(employeeId);
      const portalUrl = `${req.protocol}://${req.get('host')}/portal/${portalToken}`;

      res.json({
        portalToken,
        portalUrl,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });
    } catch (error) {
      console.error('Generate portal link error:', error);
      res.status(500).json({ error: "Failed to generate portal link" });
    }
  });

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
      console.log("Updating persistent discount - Raw body:", req.body);
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid discount ID" });
      }
      
      const result = insertPersistentDiscountSchema.partial().parse(req.body);
      console.log("Parsed data:", result);
      
      const discount = await storage.updatePersistentDiscount(id, result);
      res.json(discount);
    } catch (error) {
      console.error("Persistent discount update error:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      res.status(400).json({ 
        error: "Invalid persistent discount data", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
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
      const lastOrderId = await storage.getLastOrderId();
      res.json({ lastOrderId });
    } catch (error) {
      console.error("Get last order ID error:", error);
      // Return empty string fallback instead of error
      res.json({ lastOrderId: '' });
    }
  });

  // Generate next unique order ID atomically
  app.post("/api/orders/generate-id", async (req, res) => {
    try {
      const nextOrderId = await storage.generateNextOrderId();
      res.json({ orderId: nextOrderId });
    } catch (error) {
      console.error("Generate order ID error:", error);
      // Fallback ID generation for now
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const yearLetter = String.fromCharCode(65 + (year - 2025));
      const monthLetter = String.fromCharCode(65 + month);
      const fallbackId = yearLetter + monthLetter + String(Date.now() % 1000).padStart(3, '0');
      res.json({ orderId: fallbackId });
    }
  });

  // Test concurrent order ID generation (for testing race condition prevention)
  app.post("/api/orders/test-concurrent", async (req, res) => {
    try {
      const concurrency = req.body.concurrency || 5;
      console.log(`Testing concurrent Order ID generation with ${concurrency} parallel requests`);
      
      // Generate multiple Order IDs concurrently
      const promises = Array.from({ length: concurrency }, () => 
        storage.generateNextOrderId()
      );
      
      const orderIds = await Promise.all(promises);
      
      // Check for duplicates
      const uniqueIds = new Set(orderIds);
      const hasDuplicates = uniqueIds.size !== orderIds.length;
      
      res.json({
        orderIds,
        uniqueIds: Array.from(uniqueIds),
        totalGenerated: orderIds.length,
        uniqueCount: uniqueIds.size,
        hasDuplicates,
        success: !hasDuplicates
      });
    } catch (error) {
      console.error("Concurrent test error:", error);
      res.status(500).json({ error: "Test failed", details: (error as any).message });
    }
  });

  // Cleanup expired Order ID reservations
  app.post("/api/orders/cleanup-reservations", async (req, res) => {
    try {
      const cleanedCount = await storage.cleanupExpiredReservations();
      res.json({ 
        message: `Cleaned up ${cleanedCount} expired reservations`,
        cleanedCount 
      });
    } catch (error) {
      console.error("Cleanup error:", error);
      res.status(500).json({ error: "Cleanup failed", details: (error as any).message });
    }
  });

  app.get("/api/orders/all", async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error) {
      console.error('Error retrieving orders:', error);
      res.status(500).json({ error: "Failed to retrieve orders", details: (error as any).message });
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
      console.log("Retrieved stock models:", stockModels.length, "models");
      console.log("Stock models include:", stockModels.map(m => m.id));
      res.json(stockModels);
    } catch (error) {
      console.error("Error retrieving stock models:", error);
      res.status(500).json({ error: "Failed to retrieve stock models" });
    }
  });

  app.post("/api/stock-models", async (req, res) => {
    try {
      console.log("Stock model creation request body:", req.body);
      const result = insertStockModelSchema.parse(req.body);
      console.log("Parsed stock model data:", result);
      const stockModel = await storage.createStockModel(result);
      res.json(stockModel);
    } catch (error) {
      console.error("Stock model creation error:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      res.status(400).json({ 
        error: "Invalid stock model data", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
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
      console.log('=== DRAFT CREATION REQUEST ===');
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      
      const result = insertOrderDraftSchema.parse(req.body);
      console.log('Parsed result:', JSON.stringify(result, null, 2));
      
      // Check if draft already exists with this orderId (for editing existing orders)
      const existingDraft = await storage.getOrderDraft(result.orderId);
      console.log('Existing draft found:', existingDraft ? 'Yes' : 'No');
      
      if (existingDraft) {
        console.log('Existing draft status:', existingDraft.status);
        // If it's a reserved ID, convert it to a real draft
        if (existingDraft.status === 'RESERVED') {
          const updatedDraft = await storage.updateOrderDraft(result.orderId, {
            ...result,
            status: 'DRAFT' // Convert from RESERVED to DRAFT
          });
          console.log('Updated reserved draft to DRAFT');
          res.json(updatedDraft);
        } else {
          // Update existing draft
          const updatedDraft = await storage.updateOrderDraft(result.orderId, result);
          console.log('Updated existing draft');
          res.json(updatedDraft);
        }
      } else {
        // Create new draft with the provided order ID
        console.log('Creating new draft with order ID:', result.orderId);
        const draft = await storage.createOrderDraft(result);
        console.log('Created new draft:', draft.id);
        
        // Mark reserved Order ID as used when order is actually created
        await storage.markOrderIdAsUsed(result.orderId);
        console.log('Marked Order ID as used:', result.orderId);
        
        res.json(draft);
      }
    } catch (error) {
      console.error("Order draft creation error:", error);
      console.error("Error details:", (error as any).message);
      
      let errorMessage = "Invalid order draft data";
      if ((error as any).message) {
        errorMessage = (error as any).message;
      } else if ((error as any).issues && (error as any).issues.length > 0) {
        errorMessage = (error as any).issues[0].message;
      }
      
      res.status(400).json({ error: errorMessage });
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
      console.log('=== UPDATING DRAFT ORDER ===');
      console.log('Order ID:', orderId);
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      
      // Check if the draft exists first
      const existingDraft = await storage.getOrderDraft(orderId);
      if (!existingDraft) {
        console.log('Draft not found for orderId:', orderId);
        return res.status(404).json({ error: `Draft order with ID ${orderId} not found` });
      }
      
      console.log('Existing draft found:', JSON.stringify(existingDraft, null, 2));
      
      try {
        const result = insertOrderDraftSchema.partial().parse(req.body);
        console.log('Parsed result:', JSON.stringify(result, null, 2));
        
        const updatedDraft = await storage.updateOrderDraft(orderId, result);
        console.log('Updated draft:', JSON.stringify(updatedDraft, null, 2));
        
        res.json(updatedDraft);
      } catch (parseError) {
        console.error("Schema validation error:", parseError);
        if (parseError instanceof Error) {
          return res.status(400).json({ error: `Validation error: ${parseError.message}` });
        }
        return res.status(400).json({ error: "Invalid request data format" });
      }
      
    } catch (error) {
      console.error("Order draft update error:", error);
      
      let errorMessage = "Failed to update order draft";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      res.status(500).json({ error: errorMessage });
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

  app.get("/api/orders/draft/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if id is a valid number for database ID lookup
      const numericId = parseInt(id);
      let draft;
      
      if (!isNaN(numericId) && numericId > 0) {
        // Try to get by database ID first (when coming from All Orders page)
        draft = await storage.getOrderDraftById(numericId);
      }
      
      // If not found by ID or ID is not numeric, try by orderId string (legacy support)
      if (!draft) {
        draft = await storage.getOrderDraft(id);
      }
      
      if (draft) {
        res.json(draft);
      } else {
        res.status(404).json({ error: "Order draft not found" });
      }
    } catch (error) {
      console.error("Get order draft error:", error);
      res.status(500).json({ error: "Failed to retrieve order draft" });
    }
  });

  // Get pipeline counts for all departments (must be before :orderId route)
  app.get("/api/orders/pipeline-counts", async (req, res) => {
    try {
      const counts = await storage.getPipelineCounts();
      res.json(counts);
    } catch (error) {
      console.error("Pipeline counts fetch error:", error);
      res.status(500).json({ error: "Failed to fetch pipeline counts" });
    }
  });

  // Get detailed pipeline data with schedule status (must be before :orderId route)
  app.get("/api/orders/pipeline-details", async (req, res) => {
    try {
      const details = await storage.getPipelineDetails();
      res.json(details);
    } catch (error) {
      console.error("Pipeline details fetch error:", error);
      res.status(500).json({ error: "Failed to fetch pipeline details" });
    }
  });

  // Outstanding Orders route (must be before :orderId route)
  app.get("/api/orders/outstanding", async (req, res) => {
    try {
      const orders = await storage.getOutstandingOrders();
      res.json(orders);
    } catch (error) {
      console.error("Get outstanding orders error:", error);
      res.status(500).json({ error: "Failed to get outstanding orders" });
    }
  });



  // Get individual order by orderId
  app.get("/api/orders/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;
      
      // Get order by orderId string
      const order = await storage.getOrderDraft(orderId);
      
      if (order) {
        res.json(order);
      } else {
        res.status(404).json({ error: "Order not found" });
      }
    } catch (error) {
      console.error("Get order error:", error);
      res.status(500).json({ error: "Failed to retrieve order" });
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
  app.post("/api/orders/draft/:draftId/send-confirmation", async (req, res) => {
    try {
      const { draftId } = req.params;
      const draft = await storage.getOrderDraftById(parseInt(draftId));
      
      if (!draft) {
        return res.status(404).json({ error: "Order draft not found" });
      }
      
      if (draft.status !== 'DRAFT') {
        return res.status(400).json({ error: "Order must be in DRAFT status" });
      }
      
      await storage.updateOrderDraft(draft.orderId, { status: 'CONFIRMED' });
      res.json({ success: true, message: "Order sent for confirmation" });
    } catch (error) {
      console.error("Send confirmation error:", error);
      res.status(500).json({ error: "Failed to send order for confirmation" });
    }
  });

  app.post("/api/orders/draft/:draftId/finalize", async (req, res) => {
    try {
      const { draftId } = req.params;
      console.log("Finalize request for draftId:", draftId);
      const draft = await storage.getOrderDraftById(parseInt(draftId));
      
      if (!draft) {
        console.log("Draft not found for ID:", draftId);
        return res.status(404).json({ error: "Order draft not found" });
      }
      
      console.log("Draft found:", draft.orderId, "Status:", draft.status);
      
      // Simply update status to FINALIZED in the draft table
      await storage.updateOrderDraft(draft.orderId, { status: 'FINALIZED' });
      console.log("Successfully finalized order:", draft.orderId);
      res.json({ success: true, message: "Order finalized successfully" });
    } catch (error) {
      console.error("Finalize order error:", error);
      res.status(500).json({ error: "Failed to finalize order" });
    }
  });

  // Orders CSV Export
  app.get("/api/orders/export/csv", async (req, res) => {
    try {
      const orders = await storage.getAllOrderDrafts();
      const customers = await storage.getAllCustomers();
      const stockModels = await storage.getAllStockModels();
      
      // Create customer lookup
      const customerLookup = customers.reduce((acc, customer) => {
        acc[customer.id] = customer.name;
        return acc;
      }, {} as Record<string, string>);
      
      // Create stock model lookup
      const stockModelLookup = stockModels.reduce((acc, model) => {
        acc[model.id] = model.displayName;
        return acc;
      }, {} as Record<string, string>);
      
      // Transform orders for CSV
      const csvData = orders.map(order => ({
        OrderID: order.orderId,
        OrderDate: order.orderDate?.toISOString().split('T')[0] || '',
        DueDate: order.dueDate?.toISOString().split('T')[0] || '',
        CustomerName: customerLookup[order.customerId || ''] || 'Unknown',
        CustomerPO: order.customerPO || '',
        FBOrderNumber: order.fbOrderNumber || '',
        AGROrderDetails: order.agrOrderDetails || '',
        StockModel: stockModelLookup[order.modelId || ''] || 'Unknown',
        Handedness: order.handedness || '',
        ShankLength: order.shankLength || '',
        Status: order.status || '',
        DiscountCode: order.discountCode || '',
        Shipping: order.shipping || 0,
        Features: JSON.stringify(order.features || {}),
        FeatureQuantities: JSON.stringify(order.featureQuantities || {}),
        CreatedAt: order.createdAt?.toISOString().split('T')[0] || '',
        UpdatedAt: order.updatedAt?.toISOString().split('T')[0] || ''
      }));
      
      // Convert to CSV format
      const headers = Object.keys(csvData[0] || {});
      const csvRows = [
        headers.join(','),
        ...csvData.map(row => 
          headers.map(header => {
            const value = row[header as keyof typeof row];
            // Escape commas and quotes in CSV
            const stringValue = String(value || '');
            return stringValue.includes(',') || stringValue.includes('"') 
              ? `"${stringValue.replace(/"/g, '""')}"` 
              : stringValue;
          }).join(',')
        )
      ];
      
      const csvContent = csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="orders_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
      
    } catch (error) {
      console.error("CSV export error:", error);
      res.status(500).json({ error: "Failed to export orders to CSV" });
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

  // Inventory CSV import
  app.post("/api/inventory/import/csv", async (req, res) => {
    try {
      const { csvData } = req.body;
      
      if (!csvData || typeof csvData !== 'string') {
        return res.status(400).json({ error: "CSV data is required" });
      }

      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV must contain at least a header and one data row" });
      }

      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const importedItems = [];
      const errors = [];

      // Expected columns
      const expectedColumns = ['AG Part#', 'Name', 'Source', 'Supplier Part #', 'Cost per', 'Order Date', 'Dept.', 'Secondary Source', 'Notes'];
      
      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          
          if (values.length < 2) continue; // Skip empty rows
          
          const itemData: any = {
            agPartNumber: values[0] || '',
            name: values[1] || '',
            source: values[2] || null,
            supplierPartNumber: values[3] || null,
            costPer: values[4] ? parseFloat(values[4]) || null : null,
            orderDate: values[5] || null,
            department: values[6] || null,
            secondarySource: values[7] || null,
            notes: values[8] || null,
          };

          if (!itemData.agPartNumber || !itemData.name) {
            errors.push(`Row ${i + 1}: AG Part# and Name are required`);
            continue;
          }

          const validatedData = insertInventoryItemSchema.parse(itemData);
          const item = await storage.createInventoryItem(validatedData);
          importedItems.push(item);
        } catch (error) {
          errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Invalid data'}`);
        }
      }

      res.json({
        success: true,
        importedCount: importedItems.length,
        errors: errors,
        items: importedItems
      });
    } catch (error) {
      console.error("Import inventory CSV error:", error);
      res.status(500).json({ error: "Failed to import inventory CSV" });
    }
  });

  // Inventory CSV export
  app.get("/api/inventory/export/csv", async (req, res) => {
    try {
      const items = await storage.getAllInventoryItems();
      
      const csvHeader = "AG Part#,Name,Source,Supplier Part #,Cost per,Order Date,Dept.,Secondary Source,Notes,Active,Created At,Updated At\n";
      const csvRows = items.map(item => {
        return [
          item.agPartNumber || '',
          item.name || '',
          item.source || '',
          item.supplierPartNumber || '',
          item.costPer || '',
          item.orderDate ? new Date(item.orderDate).toISOString().split('T')[0] : '',
          item.department || '',
          item.secondarySource || '',
          (item.notes || '').replace(/"/g, '""'),
          item.isActive ? 'Yes' : 'No',
          item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : '',
          item.updatedAt ? new Date(item.updatedAt).toISOString().split('T')[0] : ''
        ].map(field => typeof field === 'string' ? `"${field}"` : field).join(',');
      }).join('\n');

      const csvContent = csvHeader + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory_export.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Export inventory CSV error:", error);
      res.status(500).json({ error: "Failed to export inventory CSV" });
    }
  });

  // Parts Requests routes
  app.get("/api/parts-requests", async (req, res) => {
    try {
      const requests = await storage.getAllPartsRequests();
      res.json(requests);
    } catch (error) {
      console.error("Get parts requests error:", error);
      res.status(500).json({ error: "Failed to get parts requests" });
    }
  });

  app.post("/api/parts-requests", async (req, res) => {
    try {
      const validatedData = insertPartsRequestSchema.parse(req.body);
      const request = await storage.createPartsRequest(validatedData);
      res.status(201).json(request);
    } catch (error) {
      console.error("Create parts request error:", error);
      res.status(400).json({ error: "Invalid parts request data" });
    }
  });

  app.put("/api/parts-requests/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertPartsRequestSchema.partial().parse(req.body);
      const request = await storage.updatePartsRequest(id, validatedData);
      res.json(request);
    } catch (error) {
      console.error("Update parts request error:", error);
      res.status(400).json({ error: "Invalid parts request data" });
    }
  });

  app.delete("/api/parts-requests/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePartsRequest(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete parts request error:", error);
      res.status(500).json({ error: "Failed to delete parts request" });
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

  app.get("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const employee = await storage.getEmployee(id);
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }
      res.json(employee);
    } catch (error) {
      console.error("Get employee error:", error);
      res.status(500).json({ error: "Failed to get employee" });
    }
  });

  app.put("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertEmployeeSchema.partial().parse(req.body);
      const employee = await storage.updateEmployee(id, validatedData);
      res.json(employee);
    } catch (error) {
      console.error("Update employee error:", error);
      res.status(400).json({ error: "Invalid employee data" });
    }
  });

  app.delete("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteEmployee(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete employee error:", error);
      res.status(500).json({ error: "Failed to delete employee" });
    }
  });

  // Employee portal token generation
  app.post("/api/employees/:id/portal-token", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const token = await storage.generateEmployeePortalToken(id);
      res.json({ 
        token, 
        portalUrl: `${req.protocol}://${req.get('host')}/employee-portal/${token}` 
      });
    } catch (error) {
      console.error("Generate portal token error:", error);
      res.status(500).json({ error: "Failed to generate portal token" });
    }
  });

  // Employee portal access by token
  app.get("/api/employee-portal/:token", async (req, res) => {
    try {
      const token = req.params.token;
      const employee = await storage.getEmployeeByToken(token);
      if (!employee) {
        return res.status(404).json({ error: "Invalid or expired token" });
      }
      
      // Log portal access
      await storage.createAuditLog({
        employeeId: employee.id,
        action: "PORTAL_ACCESS",
        resourceType: "PORTAL",
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null,
      });
      
      res.json(employee);
    } catch (error) {
      console.error("Employee portal access error:", error);
      res.status(500).json({ error: "Portal access failed" });
    }
  });

  // =================================
  // CERTIFICATIONS ROUTES
  // =================================
  
  app.get("/api/certifications", async (req, res) => {
    try {
      const certifications = await storage.getAllCertifications();
      res.json(certifications);
    } catch (error) {
      console.error("Get certifications error:", error);
      res.status(500).json({ error: "Failed to get certifications" });
    }
  });

  app.post("/api/certifications", async (req, res) => {
    try {
      const validatedData = insertCertificationSchema.parse(req.body);
      const certification = await storage.createCertification(validatedData);
      res.status(201).json(certification);
    } catch (error) {
      console.error("Create certification error:", error);
      res.status(400).json({ error: "Invalid certification data" });
    }
  });

  app.get("/api/certifications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const certification = await storage.getCertification(id);
      if (!certification) {
        return res.status(404).json({ error: "Certification not found" });
      }
      res.json(certification);
    } catch (error) {
      console.error("Get certification error:", error);
      res.status(500).json({ error: "Failed to get certification" });
    }
  });

  app.put("/api/certifications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertCertificationSchema.partial().parse(req.body);
      const certification = await storage.updateCertification(id, validatedData);
      res.json(certification);
    } catch (error) {
      console.error("Update certification error:", error);
      res.status(400).json({ error: "Invalid certification data" });
    }
  });

  app.delete("/api/certifications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCertification(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete certification error:", error);
      res.status(500).json({ error: "Failed to delete certification" });
    }
  });

  // =================================
  // EMPLOYEE CERTIFICATIONS ROUTES
  // =================================
  
  app.get("/api/employee-certifications", async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      const certifications = await storage.getEmployeeCertifications(employeeId);
      res.json(certifications);
    } catch (error) {
      console.error("Get employee certifications error:", error);
      res.status(500).json({ error: "Failed to get employee certifications" });
    }
  });

  app.post("/api/employee-certifications", async (req, res) => {
    try {
      const validatedData = insertEmployeeCertificationSchema.parse(req.body);
      const empCertification = await storage.createEmployeeCertification(validatedData);
      res.status(201).json(empCertification);
    } catch (error) {
      console.error("Create employee certification error:", error);
      res.status(400).json({ error: "Invalid employee certification data" });
    }
  });

  app.get("/api/employee-certifications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const empCertification = await storage.getEmployeeCertification(id);
      if (!empCertification) {
        return res.status(404).json({ error: "Employee certification not found" });
      }
      res.json(empCertification);
    } catch (error) {
      console.error("Get employee certification error:", error);
      res.status(500).json({ error: "Failed to get employee certification" });
    }
  });

  app.put("/api/employee-certifications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertEmployeeCertificationSchema.partial().parse(req.body);
      const empCertification = await storage.updateEmployeeCertification(id, validatedData);
      res.json(empCertification);
    } catch (error) {
      console.error("Update employee certification error:", error);
      res.status(400).json({ error: "Invalid employee certification data" });
    }
  });

  app.delete("/api/employee-certifications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteEmployeeCertification(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete employee certification error:", error);
      res.status(500).json({ error: "Failed to delete employee certification" });
    }
  });

  // Get expiring certifications
  app.get("/api/employee-certifications/expiring/:days", async (req, res) => {
    try {
      const days = parseInt(req.params.days);
      const expiring = await storage.getExpiringCertifications(days);
      res.json(expiring);
    } catch (error) {
      console.error("Get expiring certifications error:", error);
      res.status(500).json({ error: "Failed to get expiring certifications" });  
    }
  });

  // =================================
  // EVALUATIONS ROUTES
  // =================================
  
  app.get("/api/evaluations", async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      const evaluatorId = req.query.evaluatorId ? parseInt(req.query.evaluatorId as string) : undefined;
      
      let evaluations;
      if (employeeId) {
        evaluations = await storage.getEvaluationsByEmployee(employeeId);
      } else if (evaluatorId) {
        evaluations = await storage.getEvaluationsByEvaluator(evaluatorId);
      } else {
        evaluations = await storage.getAllEvaluations();
      }
      
      res.json(evaluations);
    } catch (error) {
      console.error("Get evaluations error:", error);
      res.status(500).json({ error: "Failed to get evaluations" });
    }
  });

  app.post("/api/evaluations", async (req, res) => {
    try {
      const validatedData = insertEvaluationSchema.parse(req.body);
      const evaluation = await storage.createEvaluation(validatedData);
      res.status(201).json(evaluation);
    } catch (error) {
      console.error("Create evaluation error:", error);
      res.status(400).json({ error: "Invalid evaluation data" });
    }
  });

  app.get("/api/evaluations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const evaluation = await storage.getEvaluation(id);
      if (!evaluation) {
        return res.status(404).json({ error: "Evaluation not found" });
      }
      res.json(evaluation);
    } catch (error) {
      console.error("Get evaluation error:", error);
      res.status(500).json({ error: "Failed to get evaluation" });
    }
  });

  app.put("/api/evaluations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertEvaluationSchema.partial().parse(req.body);
      const evaluation = await storage.updateEvaluation(id, validatedData);
      res.json(evaluation);
    } catch (error) {
      console.error("Update evaluation error:", error);
      res.status(400).json({ error: "Invalid evaluation data" });
    }
  });

  app.delete("/api/evaluations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteEvaluation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete evaluation error:", error);
      res.status(500).json({ error: "Failed to delete evaluation" });
    }
  });

  // Submit evaluation for review
  app.post("/api/evaluations/:id/submit", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const evaluation = await storage.submitEvaluation(id);
      res.json(evaluation);
    } catch (error) {
      console.error("Submit evaluation error:", error);
      res.status(500).json({ error: "Failed to submit evaluation" });
    }
  });

  // Review and complete evaluation
  app.post("/api/evaluations/:id/review", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const reviewData = insertEvaluationSchema.partial().parse(req.body);
      const evaluation = await storage.reviewEvaluation(id, reviewData);
      res.json(evaluation);
    } catch (error) {
      console.error("Review evaluation error:", error);
      res.status(400).json({ error: "Invalid review data" });
    }
  });

  // =================================
  // AUTHENTICATION ROUTES
  // =================================
  
  app.post("/api/auth/login", async (req, res) => {
    try {
      // Note: In a real implementation, you'd validate credentials here
      const { username, password, employeeId } = req.body;
      
      // For now, create a simple session (in real app, validate credentials first)
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      const sessionData = {
        userId: 1, // This would be from user lookup
        sessionToken,
        employeeId: employeeId || null,
        userType: 'ADMIN' as const, // This would be determined by user role
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null,
      };

      const session = await storage.createUserSession(sessionData);
      
      // Log login action
      if (employeeId) {
        await storage.createAuditLog({
          employeeId,
          action: "LOGIN",
          resourceType: "SESSION",
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null,
        });
      }
      
      res.json({ 
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
        userType: session.userType
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(401).json({ error: "Authentication failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sessionToken = req.headers.authorization?.replace('Bearer ', '');
      if (sessionToken) {
        const session = await storage.getUserSession(sessionToken);
        if (session?.employeeId) {
          await storage.createAuditLog({
            employeeId: session.employeeId,
            action: "LOGOUT",
            resourceType: "SESSION",
            ipAddress: req.ip,
            userAgent: req.get('User-Agent') || null,
          });
        }
        await storage.deleteUserSession(sessionToken);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  app.get("/api/auth/session", async (req, res) => {
    try {
      const sessionToken = req.headers.authorization?.replace('Bearer ', '');
      if (!sessionToken) {
        return res.status(401).json({ error: "No session token" });
      }
      
      const session = await storage.getUserSession(sessionToken);
      if (!session) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
      
      res.json({
        userId: session.userId,
        employeeId: session.employeeId,
        userType: session.userType,
        expiresAt: session.expiresAt
      });
    } catch (error) {
      console.error("Session check error:", error);
      res.status(500).json({ error: "Session check failed" });
    }
  });

  // =================================
  // DOCUMENT MANAGEMENT ROUTES
  // =================================
  
  app.get("/api/employee-documents", async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      const documentType = req.query.documentType as string;
      
      let documents;
      if (documentType) {
        documents = await storage.getDocumentsByType(documentType, employeeId);
      } else {
        documents = await storage.getAllDocuments(employeeId);
      }
      
      res.json(documents);
    } catch (error) {
      console.error("Get documents error:", error);
      res.status(500).json({ error: "Failed to get documents" });
    }
  });

  app.post("/api/employee-documents", async (req, res) => {
    try {
      const validatedData = insertEmployeeDocumentSchema.parse(req.body);
      const document = await storage.createDocument(validatedData);
      
      // Log document upload
      await storage.createAuditLog({
        employeeId: document.employeeId,
        action: "DOCUMENT_UPLOAD",
        resourceType: "DOCUMENT",
        resourceId: document.id.toString(),
        details: { documentType: document.documentType, fileName: document.fileName },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null,
      });
      
      res.status(201).json(document);
    } catch (error) {
      console.error("Create document error:", error);
      res.status(400).json({ error: "Invalid document data" });
    }
  });

  app.get("/api/employee-documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Log document access
      await storage.createAuditLog({
        employeeId: document.employeeId,
        action: "DOCUMENT_VIEW",
        resourceType: "DOCUMENT",
        resourceId: document.id.toString(),
        details: { documentType: document.documentType, fileName: document.fileName },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null,
      });
      
      res.json(document);
    } catch (error) {
      console.error("Get document error:", error);
      res.status(500).json({ error: "Failed to get document" });
    }
  });

  app.put("/api/employee-documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertEmployeeDocumentSchema.partial().parse(req.body);
      const document = await storage.updateDocument(id, validatedData);
      res.json(document);
    } catch (error) {
      console.error("Update document error:", error);
      res.status(400).json({ error: "Invalid document data" });
    }
  });

  app.delete("/api/employee-documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      if (document) {
        await storage.createAuditLog({
          employeeId: document.employeeId,
          action: "DOCUMENT_DELETE",
          resourceType: "DOCUMENT",
          resourceId: document.id.toString(),
          details: { documentType: document.documentType, fileName: document.fileName },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null,
        });
      }
      
      await storage.deleteDocument(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete document error:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Get expiring documents
  app.get("/api/employee-documents/expiring/:days", async (req, res) => {
    try {
      const days = parseInt(req.params.days);
      const expiring = await storage.getExpiringDocuments(days);
      res.json(expiring);
    } catch (error) {
      console.error("Get expiring documents error:", error);
      res.status(500).json({ error: "Failed to get expiring documents" });  
    }
  });

  // =================================
  // AUDIT LOG ROUTES
  // =================================
  
  app.get("/api/audit-logs", async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      const action = req.query.action as string;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      let logs;
      if (startDate && endDate) {
        logs = await storage.getAuditLogsByDateRange(startDate, endDate, employeeId);
      } else {
        logs = await storage.getAuditLogs(employeeId, action);
      }
      
      res.json(logs);
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ error: "Failed to get audit logs" });
    }
  });

  // =================================
  // FILE UPLOAD AND SERVING ROUTES
  // =================================
  
  // Upload employee documents (with authentication)
  app.post("/api/employee-documents/upload", authenticateToken, uploadMiddleware.array('documents', 5), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const employeeId = parseInt(req.body.employeeId);
      const documentType = req.body.documentType || 'OTHER';
      const description = req.body.description || '';
      const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
      const expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
      const isConfidential = req.body.isConfidential === 'true';

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      if (!employeeId) {
        return res.status(400).json({ error: "Employee ID is required" });
      }

      // Check authorization - only admins or the employee themselves can upload documents
      if (!validateEmployeeDocumentAccess(req.user!.userType, req.user!.employeeId, employeeId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const uploadedDocuments = [];

      for (const file of files) {
        const fileInfo = getFileInfo(file);
        const autoDetectedType = getDocumentType(file.originalname, file.mimetype);
        
        const documentData = {
          employeeId,
          documentType: documentType || autoDetectedType,
          fileName: fileInfo.fileName,
          originalFileName: fileInfo.originalFileName,
          fileSize: fileInfo.fileSize,
          mimeType: fileInfo.mimeType,
          filePath: fileInfo.filePath,
          uploadedBy: req.user!.employeeId || null,
          description,
          tags,
          expiryDate,
          isConfidential,
        };

        const document = await storage.createDocument(documentData);
        
        // Log document upload
        await storage.createAuditLog({
          employeeId,
          action: "DOCUMENT_UPLOAD",
          resourceType: "DOCUMENT",
          resourceId: document.id.toString(),
          details: { 
            documentType: document.documentType, 
            fileName: document.fileName,
            fileSize: document.fileSize 
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null,
        });

        uploadedDocuments.push({
          ...document,
          fileUrl: getFileUrl(req, document.fileName)
        });
      }

      res.status(201).json(uploadedDocuments);
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({ error: "File upload failed" });
    }
  });

  // Serve employee documents (with access control)
  app.get("/api/files/employee-documents/:fileName", authenticateToken, async (req, res) => {
    try {
      const fileName = req.params.fileName;
      const filePath = path.join(process.cwd(), 'uploads', 'employee-documents', fileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }

      // Get document info from database to check access
      const documents = await storage.getAllDocuments();
      const document = documents.find(doc => doc.fileName === fileName);

      if (!document) {
        return res.status(404).json({ error: "Document not found in database" });
      }

      // Check access permissions
      if (!validateEmployeeDocumentAccess(req.user!.userType, req.user!.employeeId, document.employeeId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Log document access
      await storage.createAuditLog({
        employeeId: document.employeeId,
        action: "DOCUMENT_VIEW",
        resourceType: "DOCUMENT",
        resourceId: document.id.toString(),
        details: { 
          documentType: document.documentType, 
          fileName: document.fileName 
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null,
      });

      // Set appropriate headers
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${document.originalFileName}"`);
      
      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("File serving error:", error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  // Download employee document (forces download)
  app.get("/api/employee-documents/:id/download", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);

      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Check access permissions
      if (!validateEmployeeDocumentAccess(req.user!.userType, req.user!.employeeId, document.employeeId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const filePath = document.filePath;
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found on disk" });
      }

      // Log download
      await storage.createAuditLog({
        employeeId: document.employeeId,
        action: "DOCUMENT_DOWNLOAD",
        resourceType: "DOCUMENT",
        resourceId: document.id.toString(),
        details: { 
          documentType: document.documentType, 
          fileName: document.fileName 
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null,
      });

      // Force download
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalFileName}"`);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("File download error:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  // Employee portal file upload (for portal users)
  app.post("/api/employee-portal/:token/documents/upload", authenticatePortalToken, uploadMiddleware.array('documents', 3), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const employeeId = req.user!.employeeId!;
      const documentType = req.body.documentType || 'OTHER';
      const description = req.body.description || '';

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const uploadedDocuments = [];

      for (const file of files) {
        const fileInfo = getFileInfo(file);
        const autoDetectedType = getDocumentType(file.originalname, file.mimetype);
        
        const documentData = {
          employeeId,
          documentType: documentType || autoDetectedType,
          fileName: fileInfo.fileName,
          originalFileName: fileInfo.originalFileName,
          fileSize: fileInfo.fileSize,
          mimeType: fileInfo.mimeType,
          filePath: fileInfo.filePath,
          uploadedBy: null, // Portal uploads don't have uploadedBy user
          description,
          tags: [],
          expiryDate: null,
          isConfidential: false,
        };

        const document = await storage.createDocument(documentData);
        
        // Log portal document upload
        await storage.createAuditLog({
          employeeId,
          action: "PORTAL_DOCUMENT_UPLOAD",
          resourceType: "DOCUMENT",
          resourceId: document.id.toString(),
          details: { 
            documentType: document.documentType, 
            fileName: document.fileName,
            fileSize: document.fileSize 
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null,
        });

        uploadedDocuments.push({
          ...document,
          fileUrl: getFileUrl(req, document.fileName)
        });
      }

      res.status(201).json(uploadedDocuments);
    } catch (error) {
      console.error("Portal file upload error:", error);
      res.status(500).json({ error: "Portal file upload failed" });
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
  
  // Customers CRUD
  app.get('/api/customers', async (req, res) => {
    try {
      const customers = await storage.getAllCustomers();
      res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.get('/api/customers/search', async (req, res) => {
    try {
      const { query } = req.query;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Search query is required" });
      }
      
      const customers = await storage.searchCustomers(query);
      res.json(customers);
    } catch (error) {
      console.error("Error searching customers:", error);
      res.status(500).json({ error: "Failed to search customers" });
    }
  });

  app.get('/api/customers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const customer = await storage.getCustomer(id);
      
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      res.json(customer);
    } catch (error) {
      console.error("Error fetching customer:", error);
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });

  app.post('/api/customers', async (req, res) => {
    try {
      const result = insertCustomerSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid customer data", details: result.error.issues });
      }
      
      const customer = await storage.createCustomer(result.data);
      res.status(201).json(customer);
    } catch (error) {
      console.error("Error creating customer:", error);
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  app.put('/api/customers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertCustomerSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid customer data", details: result.error.issues });
      }
      
      const customer = await storage.updateCustomer(id, result.data);
      res.json(customer);
    } catch (error) {
      console.error("Error updating customer:", error);
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  app.delete('/api/customers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCustomer(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });

  // Customer CSV import
  app.post("/api/customers/import/csv", async (req, res) => {
    try {
      const { csvData } = req.body;
      
      if (!csvData || typeof csvData !== 'string') {
        return res.status(400).json({ error: "CSV data is required" });
      }

      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV must contain at least a header and one data row" });
      }

      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const importedCustomers = [];
      const updatedCustomers = [];
      const errors = [];

      // Expected columns: Name, Email, Phone
      const nameIndex = header.findIndex(h => h.toLowerCase().includes('name'));
      const emailIndex = header.findIndex(h => h.toLowerCase().includes('email'));
      const phoneIndex = header.findIndex(h => h.toLowerCase().includes('phone'));
      
      if (nameIndex === -1) {
        return res.status(400).json({ error: "CSV must contain a 'Name' column" });
      }
      
      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          
          if (values.length < 1) continue; // Skip empty rows
          
          const customerData: any = {
            name: values[nameIndex] || '',
            email: emailIndex >= 0 ? (values[emailIndex] || undefined) : undefined,
            phone: phoneIndex >= 0 ? (values[phoneIndex] || undefined) : undefined,
            customerType: 'standard',
            isActive: true
          };

          if (!customerData.name) {
            errors.push(`Row ${i + 1}: Name is required`);
            continue;
          }

          // Clean up empty strings to undefined for optional fields
          if (customerData.email === '') customerData.email = undefined;
          if (customerData.phone === '') customerData.phone = undefined;

          // Check if customer already exists by name
          const existingCustomers = await storage.searchCustomers(customerData.name);
          const existingCustomer = existingCustomers.find(c => 
            c.name.toLowerCase() === customerData.name.toLowerCase()
          );

          let customer;
          if (existingCustomer) {
            // Update existing customer with new data (only if new data is provided)
            const updateData: any = {};
            if (customerData.email) updateData.email = customerData.email;
            if (customerData.phone) updateData.phone = customerData.phone;
            
            // Only update if we have new information to add
            if (Object.keys(updateData).length > 0) {
              customer = await storage.updateCustomer(existingCustomer.id, updateData);
              updatedCustomers.push(customer);
            } else {
              customer = existingCustomer; // No new data to update
            }
          } else {
            // Create new customer
            const validatedData = insertCustomerSchema.parse(customerData);
            customer = await storage.createCustomer(validatedData);
            importedCustomers.push(customer);
          }
        } catch (error) {
          errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Invalid data'}`);
        }
      }

      res.json({
        success: true,
        importedCount: importedCustomers.length,
        updatedCount: updatedCustomers.length,
        totalProcessed: importedCustomers.length + updatedCustomers.length,
        errors: errors,
        newCustomers: importedCustomers,
        updatedCustomers: updatedCustomers
      });
    } catch (error) {
      console.error("Import customers CSV error:", error);
      res.status(500).json({ error: "Failed to import customers CSV" });
    }
  });
  app.get("/api/address/autocomplete", async (req, res) => {
    try {
      const { query } = req.query;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      
      // SmartyStreets US Autocomplete API Direct REST Call
      const authId = process.env.SMARTYSTREETS_AUTH_ID;
      const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;
      
      if (!authId || !authToken) {
        return res.status(500).json({ error: "SmartyStreets credentials not configured" });
      }
      
      // Try SmartyStreets US Autocomplete API
      try {
        const response = await axios.get('https://us-autocomplete.api.smartystreets.com/suggest', {
          params: {
            'auth-id': authId,
            'auth-token': authToken,
            'prefix': query,
            'max_suggestions': 5
          }
        });
        
        const suggestions = response.data.suggestions || [];
        const formattedSuggestions = suggestions.map((suggestion: any) => suggestion.text);
        res.json(formattedSuggestions);
      } catch (error: any) {
        // If autocomplete API is not available, try using Street API for partial lookups
        console.log('Autocomplete API not available, trying Street API approach');
        
        // Use Street API with common endings to generate suggestions
        const streetSuffixes = ['St', 'Ave', 'Blvd', 'Dr', 'Rd'];
        const suggestions = [];
        
        for (const suffix of streetSuffixes) {
          const testAddress = `${query} ${suffix}`;
          try {
            const streetResponse = await axios.get('https://us-street.api.smartystreets.com/street-address', {
              params: {
                'auth-id': authId,
                'auth-token': authToken,
                'street': testAddress,
                'city': '',
                'state': '',
                'zipcode': ''
              }
            });
            
            if (streetResponse.data && streetResponse.data.length > 0) {
              const result = streetResponse.data[0];
              const fullAddress = `${result.delivery_line_1}, ${result.components.city_name}, ${result.components.state_abbreviation} ${result.components.zipcode}`;
              suggestions.push(fullAddress);
            }
          } catch (streetError) {
            // Continue with next suffix
          }
        }
        
        // If no Street API results, fall back to basic suggestions
        if (suggestions.length === 0) {
          const fallbackSuggestions = [
            `${query} St, New York, NY 10001`,
            `${query} Ave, Los Angeles, CA 90210`,
            `${query} Blvd, Chicago, IL 60601`,
            `${query} Dr, Houston, TX 77001`,
            `${query} Rd, Phoenix, AZ 85001`
          ];
          res.json(fallbackSuggestions);
        } else {
          res.json(suggestions.slice(0, 5));
        }
      }
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
      
      // SmartyStreets US Street API Direct REST Call with fallback
      const authId = process.env.SMARTYSTREETS_AUTH_ID;
      const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;
      
      if (!authId || !authToken) {
        return res.status(500).json({ error: "SmartyStreets credentials not configured" });
      }
      
      const response = await axios.get('https://us-street.api.smartystreets.com/street-address', {
        params: {
          'auth-id': authId,
          'auth-token': authToken,
          'street': address.street,
          'city': address.city,
          'state': address.state,
          'zipcode': address.zipCode
        }
      });
      
      const results = response.data;
      
      if (!results || results.length === 0) {
        return res.status(400).json({ error: "Address could not be validated" });
      }
      
      const validated = results[0];
      const normalizedAddress = {
        street: `${validated.delivery_line_1}${validated.delivery_line_2 ? ' ' + validated.delivery_line_2 : ''}`,
        city: validated.components.city_name,
        state: validated.components.state_abbreviation,
        zipCode: `${validated.components.zipcode}-${validated.components.plus4_code}`,
        country: "United States"
      };
      
      res.json(normalizedAddress);
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

  app.get("/api/addresses/all", async (req, res) => {
    try {
      const addresses = await storage.getAllAddresses();
      res.json(addresses);
    } catch (error) {
      console.error("Get all addresses error:", error);
      res.status(500).json({ error: "Failed to get all addresses" });
    }
  });

  app.post("/api/addresses", async (req, res) => {
    try {
      console.log("Received address data:", req.body);
      const validatedData = insertCustomerAddressSchema.parse(req.body);
      const address = await storage.createCustomerAddress(validatedData);
      res.status(201).json(address);
    } catch (error) {
      console.error("Create customer address error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ 
          error: "Invalid customer address data", 
          details: error.errors 
        });
      }
      res.status(400).json({ error: "Invalid customer address data" });
    }
  });

  app.put("/api/addresses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log("Received address update data:", req.body);
      
      // Remove id from body to avoid conflicts
      const { id: bodyId, ...updateData } = req.body;
      
      const validatedData = insertCustomerAddressSchema.parse(updateData);
      const address = await storage.updateCustomerAddress(parseInt(id), validatedData);
      res.json(address);
    } catch (error) {
      console.error("Update customer address error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ 
          error: "Invalid customer address data", 
          details: error.errors 
        });
      }
      res.status(400).json({ error: "Failed to update customer address" });
    }
  });

  app.delete("/api/addresses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteCustomerAddress(parseInt(id));
      res.status(204).send();
    } catch (error) {
      console.error("Delete customer address error:", error);
      res.status(500).json({ error: "Failed to delete customer address" });
    }
  });

  // Address validation endpoint using SmartyStreets API
  app.post("/api/validate-address", async (req, res) => {
    try {
      const { street, city, state, zipCode } = req.body;
      
      // Check if we have SmartyStreets credentials
      const authId = process.env.SMARTYSTREETS_AUTH_ID;
      const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;
      
      if (!authId || !authToken) {
        return res.status(500).json({ 
          error: "SmartyStreets credentials not configured" 
        });
      }
      
      // Use SmartyStreets US Street API for validation
      const smartyStreetsUrl = `https://us-street.api.smartystreets.com/street-address?auth-id=${authId}&auth-token=${authToken}`;
      
      const requestBody = [{
        street: street || '',
        city: city || '',
        state: state || '',
        zipcode: zipCode || '',
        candidates: 3 // Request up to 3 suggestions
      }];
      
      const response = await fetch(smartyStreetsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`SmartyStreets API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Transform SmartyStreets response to our format
      const suggestions = data.map((item: any) => ({
        street: item.delivery_line_1 || '',
        city: item.components?.city_name || '',
        state: item.components?.state_abbreviation || '',
        zipCode: item.components?.zipcode || '',
        isValid: true,
        smartyStreetsData: {
          deliveryLine1: item.delivery_line_1,
          lastLine: item.last_line,
          deliveryPointBarcode: item.delivery_point_barcode,
          components: item.components,
          metadata: item.metadata,
          analysis: item.analysis
        }
      }));
      
      res.json({
        suggestions: suggestions,
        isValid: suggestions.length > 0
      });
      
    } catch (error) {
      console.error("SmartyStreets validation error:", error);
      res.status(500).json({ 
        error: "Failed to validate address with SmartyStreets",
        details: (error as any).message 
      });
    }
  });

  // Address autocomplete endpoint using SmartyStreets API
  app.post("/api/autocomplete-address", async (req, res) => {
    try {
      const { search } = req.body;
      
      // Check if we have SmartyStreets credentials
      const authId = process.env.SMARTYSTREETS_AUTH_ID;
      const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;
      
      if (!authId || !authToken) {
        return res.status(500).json({ 
          error: "SmartyStreets credentials not configured" 
        });
      }
      
      // Use SmartyStreets US Autocomplete API with correct parameter name
      const smartyStreetsUrl = `https://us-autocomplete.api.smartystreets.com/suggest?auth-id=${authId}&auth-token=${authToken}&prefix=${encodeURIComponent(search)}&max_suggestions=10`;
      
      const response = await fetch(smartyStreetsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SmartyStreets Autocomplete API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      // Transform SmartyStreets autocomplete response
      const suggestions = data.suggestions?.map((item: any) => ({
        text: item.text,
        streetLine: item.street_line,
        city: item.city,
        state: item.state,
        zipCode: item.zipcode,
        entries: item.entries
      })) || [];
      
      res.json({
        suggestions: suggestions
      });
      
    } catch (error) {
      console.error("SmartyStreets autocomplete error:", error);
      res.status(500).json({ 
        error: "Failed to get address suggestions",
        details: (error as any).message 
      });
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
          return txDate >= new Date(dateFrom as string) && txDate <= new Date(dateTo as string);
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
          return txDate >= new Date(dateFrom as string) && txDate <= new Date(dateTo as string);
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

  // Enhanced Forms API routes
  app.get("/api/enhanced-forms/categories", async (req, res) => {
    try {
      const categories = await db.select().from(enhancedFormCategories);
      res.json(categories);
    } catch (error) {
      console.error("Enhanced forms categories error:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.post("/api/enhanced-forms/categories", async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Category name is required" });
      }
      
      const [newCategory] = await db.insert(enhancedFormCategories).values({
        name,
        description: description || "",
      }).returning();
      
      res.json(newCategory);
    } catch (error) {
      console.error("Enhanced forms create category error:", error);
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  app.put("/api/enhanced-forms/categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description } = req.body;
      
      const [updatedCategory] = await db.update(enhancedFormCategories)
        .set({
          name: name || "Updated Category",
          description: description || "",
          updatedAt: new Date()
        })
        .where(eq(enhancedFormCategories.id, parseInt(id)))
        .returning();
      
      if (!updatedCategory) {
        return res.status(404).json({ error: "Category not found" });
      }
      
      res.json(updatedCategory);
    } catch (error) {
      console.error("Enhanced forms update category error:", error);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  app.delete("/api/enhanced-forms/categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const [deletedCategory] = await db.delete(enhancedFormCategories)
        .where(eq(enhancedFormCategories.id, parseInt(id)))
        .returning();
      
      if (!deletedCategory) {
        return res.status(404).json({ error: "Category not found" });
      }
      
      res.json({ success: true, id: parseInt(id) });
    } catch (error) {
      console.error("Enhanced forms delete category error:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // Schema discovery routes
  app.get("/api/enhanced-forms/schema", async (req, res) => {
    try {
      // Mock database tables
      const mockTables = [
        { name: "orders", label: "Orders", description: "Customer orders table" },
        { name: "inventory_items", label: "Inventory Items", description: "Inventory tracking table" },
        { name: "qc_submissions", label: "QC Submissions", description: "Quality control submissions" },
        { name: "maintenance_logs", label: "Maintenance Logs", description: "Equipment maintenance records" }
      ];
      
      res.json({ tables: mockTables });
    } catch (error) {
      console.error("Enhanced forms schema error:", error);
      res.status(500).json({ error: "Failed to fetch schema" });
    }
  });

  app.get("/api/enhanced-forms/schema/:tableName/columns", async (req, res) => {
    try {
      const { tableName } = req.params;
      
      // Mock column data based on table
      const mockColumns: Record<string, any[]> = {
        orders: [
          { name: "order_id", label: "Order ID", type: "text", nullable: false },
          { name: "customer", label: "Customer", type: "text", nullable: false },
          { name: "product", label: "Product", type: "text", nullable: false },
          { name: "quantity", label: "Quantity", type: "number", nullable: false },
          { name: "status", label: "Status", type: "text", nullable: false }
        ],
        inventory_items: [
          { name: "sku", label: "SKU", type: "text", nullable: false },
          { name: "name", label: "Item Name", type: "text", nullable: false },
          { name: "category", label: "Category", type: "text", nullable: false },
          { name: "quantity", label: "Quantity", type: "number", nullable: false },
          { name: "location", label: "Location", type: "text", nullable: true }
        ],
        qc_submissions: [
          { name: "order_id", label: "Order ID", type: "text", nullable: false },
          { name: "line", label: "Line", type: "text", nullable: false },
          { name: "department", label: "Department", type: "text", nullable: false },
          { name: "sku", label: "SKU", type: "text", nullable: false },
          { name: "summary", label: "Summary", type: "text", nullable: true }
        ],
        maintenance_logs: [
          { name: "equipment", label: "Equipment", type: "text", nullable: false },
          { name: "completed_by", label: "Completed By", type: "text", nullable: true },
          { name: "notes", label: "Notes", type: "text", nullable: true },
          { name: "next_due_date", label: "Next Due Date", type: "date", nullable: true }
        ]
      };
      
      const columns = mockColumns[tableName] || [];
      res.json({ columns });
    } catch (error) {
      console.error("Enhanced forms columns error:", error);
      res.status(500).json({ error: "Failed to fetch columns" });
    }
  });

  // Form submissions routes (must come before /:id routes)
  app.post("/api/enhanced-forms/submissions", async (req, res) => {
    try {
      const { formId, data } = req.body;
      
      if (!formId || !data) {
        return res.status(400).json({ error: "Form ID and data are required" });
      }
      
      const mockSubmission = {
        id: Date.now(),
        formId: parseInt(formId),
        data,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      res.json(mockSubmission);
    } catch (error) {
      console.error("Enhanced forms submission error:", error);
      res.status(500).json({ error: "Failed to submit form" });
    }
  });

  // User permissions route
  app.get("/api/user/permissions", async (req, res) => {
    try {
      // For now, return mock permissions. In a real app, this would check the authenticated user
      // You can manually set this to true to test the price override functionality
      res.json({ 
        canOverridePrices: true  // Set to true for testing - you can change this later
      });
    } catch (error) {
      console.error("User permissions error:", error);
      res.status(500).json({ error: "Failed to fetch user permissions" });
    }
  });

  app.get("/api/enhanced-forms/submissions", async (req, res) => {
    try {
      const { formId } = req.query;
      
      if (!formId) {
        return res.status(400).json({ error: "Form ID is required" });
      }
      
      // Mock submissions data
      const mockSubmissions = [
        {
          id: 1,
          formId: parseInt(formId as string),
          data: {
            customer_name: "John Doe",
            notes: "Sample submission data"
          },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          formId: parseInt(formId as string),
          data: {
            customer_name: "Jane Smith",
            notes: "Another sample submission"
          },
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      
      res.json(mockSubmissions);
    } catch (error) {
      console.error("Enhanced forms get submissions error:", error);
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  });

  // Enhanced forms CRUD routes
  app.get("/api/enhanced-forms", async (req, res) => {
    try {
      const forms = await db.select().from(enhancedForms);
      res.json(forms);
    } catch (error) {
      console.error("Enhanced forms error:", error);
      res.status(500).json({ error: "Failed to fetch forms" });
    }
  });

  app.get("/api/enhanced-forms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      const [form] = await db.select()
        .from(enhancedForms)
        .where(eq(enhancedForms.id, parseInt(id)));
      
      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }
      
      res.json(form);
    } catch (error) {
      console.error("Enhanced forms get form error:", error);
      res.status(500).json({ error: "Failed to fetch form" });
    }
  });

  app.post("/api/enhanced-forms", async (req, res) => {
    try {
      const { name, description, categoryId, tableName, layout } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Form name is required" });
      }
      
      const [newForm] = await db.insert(enhancedForms).values({
        name,
        description: description || "",
        categoryId: categoryId || null,
        tableName: tableName || null,
        layout: layout || [],
        version: 1,
      }).returning();
      
      res.json(newForm);
    } catch (error) {
      console.error("Enhanced forms create form error:", error);
      res.status(500).json({ error: "Failed to create form" });
    }
  });

  app.put("/api/enhanced-forms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, categoryId, tableName, layout } = req.body;
      
      const [updatedForm] = await db.update(enhancedForms)
        .set({
          name: name || "Updated Form",
          description: description || "",
          categoryId: categoryId || null,
          tableName: tableName || null,
          layout: layout || [],
          updatedAt: new Date(),
        })
        .where(eq(enhancedForms.id, parseInt(id)))
        .returning();
      
      if (!updatedForm) {
        return res.status(404).json({ error: "Form not found" });
      }
      
      res.json(updatedForm);
    } catch (error) {
      console.error("Enhanced forms update form error:", error);
      res.status(500).json({ error: "Failed to update form" });
    }
  });

  app.delete("/api/enhanced-forms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      const [deletedForm] = await db.delete(enhancedForms)
        .where(eq(enhancedForms.id, parseInt(id)))
        .returning();
      
      if (!deletedForm) {
        return res.status(404).json({ error: "Form not found" });
      }
      
      res.json({ success: true, id: parseInt(id) });
    } catch (error) {
      console.error("Enhanced forms delete form error:", error);
      res.status(500).json({ error: "Failed to delete form" });
    }
  });

  // Form versions routes
  app.get("/api/enhanced-forms/:id/versions", async (req, res) => {
    try {
      const { id } = req.params;
      
      const mockVersions = [
        {
          id: 1,
          formId: parseInt(id),
          version: 1,
          layout: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      
      res.json(mockVersions);
    } catch (error) {
      console.error("Enhanced forms versions error:", error);
      res.status(500).json({ error: "Failed to fetch versions" });
    }
  });

  app.get("/api/enhanced-forms/:id/versions/:version", async (req, res) => {
    try {
      const { id, version } = req.params;
      
      const mockVersion = {
        id: 1,
        formId: parseInt(id),
        version: parseInt(version),
        layout: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      res.json(mockVersion);
    } catch (error) {
      console.error("Enhanced forms get version error:", error);
      res.status(500).json({ error: "Failed to fetch version" });
    }
  });



  // Module 12: Purchase Orders routes
  app.get("/api/pos", async (req, res) => {
    try {
      const pos = await storage.getAllPurchaseOrders();
      res.json(pos);
    } catch (error) {
      console.error("Get POs error:", error);
      res.status(500).json({ error: "Failed to fetch purchase orders" });
    }
  });

  app.get("/api/pos/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const includeItems = req.query.includeItems === 'true';
      const includeOrderCount = req.query.includeOrderCount === 'true';
      
      const po = await storage.getPurchaseOrder(id, { includeItems, includeOrderCount });
      if (!po) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      res.json(po);
    } catch (error) {
      console.error("Get PO error:", error);
      res.status(500).json({ error: "Failed to fetch purchase order" });
    }
  });

  app.post("/api/pos", async (req, res) => {
    try {
      console.log("PO creation request body:", req.body);
      const result = insertPurchaseOrderSchema.parse(req.body);
      const po = await storage.createPurchaseOrder(result);
      res.json(po);
    } catch (error) {
      console.error("Create PO error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ 
          error: "Invalid purchase order data", 
          details: error.errors 
        });
      }
      res.status(400).json({ error: "Invalid purchase order data" });
    }
  });

  app.put("/api/pos/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertPurchaseOrderSchema.partial().parse(req.body);
      const po = await storage.updatePurchaseOrder(id, result);
      res.json(po);
    } catch (error) {
      console.error("Update PO error:", error);
      res.status(400).json({ error: "Invalid purchase order data" });
    }
  });

  app.delete("/api/pos/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePurchaseOrder(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete PO error:", error);
      res.status(500).json({ error: "Failed to delete purchase order" });
    }
  });

  // Purchase Order Items routes
  app.get("/api/pos/:poId/items", async (req, res) => {
    try {
      const poId = parseInt(req.params.poId);
      const items = await storage.getPurchaseOrderItems(poId);
      res.json(items);
    } catch (error) {
      console.error("Get PO items error:", error);
      res.status(500).json({ error: "Failed to fetch purchase order items" });
    }
  });

  app.post("/api/pos/:poId/items", async (req, res) => {
    try {
      const poId = parseInt(req.params.poId);
      const result = insertPurchaseOrderItemSchema.parse({
        ...req.body,
        poId
      });
      const item = await storage.createPurchaseOrderItem(result);
      res.json(item);
    } catch (error) {
      console.error("Create PO item error:", error);
      res.status(400).json({ error: "Invalid purchase order item data" });
    }
  });

  app.put("/api/pos/:poId/items/:itemId", async (req, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const result = insertPurchaseOrderItemSchema.partial().parse(req.body);
      const item = await storage.updatePurchaseOrderItem(itemId, result);
      res.json(item);
    } catch (error) {
      console.error("Update PO item error:", error);
      res.status(400).json({ error: "Invalid purchase order item data" });
    }
  });

  app.delete("/api/pos/:poId/items/:itemId", async (req, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      await storage.deletePurchaseOrderItem(itemId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete PO item error:", error);
      res.status(500).json({ error: "Failed to delete purchase order item" });
    }
  });



  // Generate production orders from PO
  app.post("/api/pos/:poId/generate-production-orders", async (req, res) => {
    try {
      const poId = parseInt(req.params.poId);
      const orders = await storage.generateProductionOrders(poId);
      
      const isNewGeneration = orders.length > 0 && orders[0].createdAt && 
                              new Date().getTime() - new Date(orders[0].createdAt).getTime() < 10000; // Within 10 seconds
      
      if (isNewGeneration) {
        console.log(`🏭 Generated ${orders.length} NEW production orders from PO ${poId}`);
        console.log(`🏭 Production orders will be auto-scheduled based on due dates and priority scores`);
      } else {
        console.log(`🏭 Retrieved ${orders.length} existing production orders from PO ${poId}`);
      }
      
      res.json({ 
        success: true, 
        message: isNewGeneration 
          ? `Generated ${orders.length} production orders from PO - Auto-scheduling will prioritize these orders based on due dates`
          : `Found ${orders.length} existing production orders from this PO - they are already integrated into the layup scheduler`, 
        orders,
        autoScheduleTrigger: true, // Signal to frontend to refresh layup scheduler
        isExisting: !isNewGeneration
      });
    } catch (error) {
      console.error("Generate production orders error:", error);
      res.status(500).json({ error: "Failed to generate production orders from PO" });
    }
  });

  // Production Orders API
  app.get("/api/production-orders", async (req, res) => {
    try {
      const orders = await storage.getAllProductionOrders();
      res.json(orders);
    } catch (error) {
      console.error("Get production orders error:", error);
      res.status(500).json({ error: "Failed to fetch production orders" });
    }
  });

  app.get("/api/production-orders/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getProductionOrder(id);
      if (!order) {
        return res.status(404).json({ error: "Production order not found" });
      }
      res.json(order);
    } catch (error) {
      console.error("Get production order error:", error);
      res.status(500).json({ error: "Failed to fetch production order" });
    }
  });

  app.put("/api/production-orders/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertProductionOrderSchema.partial().parse(req.body);
      const order = await storage.updateProductionOrder(id, result);
      res.json(order);
    } catch (error) {
      console.error("Update production order error:", error);
      res.status(400).json({ error: "Invalid production order data" });
    }
  });

  app.delete("/api/production-orders/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProductionOrder(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete production order error:", error);
      res.status(500).json({ error: "Failed to delete production order" });
    }
  });

  // Routes for PO item selection data
  app.get("/api/stock-models", async (req, res) => {
    try {
      const models = await storage.getAllStockModels();
      res.json(models);
    } catch (error) {
      console.error("Get stock models error:", error);
      res.status(500).json({ error: "Failed to fetch stock models" });
    }
  });

  app.get("/api/features", async (req, res) => {
    try {
      const features = await storage.getAllFeatures();
      res.json(features);
    } catch (error) {
      console.error("Get features error:", error);
      res.status(500).json({ error: "Failed to fetch features" });
    }
  });

  // Unified Layup Queue endpoint - combines regular orders and P1 PO orders
  app.get("/api/layup-queue", async (req, res) => {
    try {
      console.log('🏭 Starting layup queue processing...');
      // Get regular orders from main database - all finalized orders need layup processing
      const regularOrders = await storage.getAllOrderDrafts();
      const layupOrders = regularOrders.filter(order => 
        order.status === 'FINALIZED'
        // All finalized orders go through layup department, no need to filter by department
      );
      
      // Add debug logging for features
      console.log('Sample layup order features:', {
        orderId: layupOrders[0]?.orderId,
        features: layupOrders[0]?.features,
        modelId: layupOrders[0]?.modelId
      });

      // Get P1 Purchase Orders with stock model items
      const pos = await storage.getAllPurchaseOrders();
      const activePos = pos.filter(po => po.status === 'OPEN');
      
      const p1LayupOrders = [];

      // Get Production Orders generated from Purchase Orders
      let pendingProductionOrders = [];
      try {
        const productionOrders = await storage.getAllProductionOrders();
        console.log(`🏭 Found ${productionOrders.length} total production orders`);
        
        // Debug all production orders first - show ALL properties
        console.log('🔍 Debug first production order - ALL PROPERTIES:', JSON.stringify(productionOrders[0], null, 2));
        
        pendingProductionOrders = productionOrders.filter(po => {
          // Drizzle ORM returns camelCase field names
          const status = (po as any).productionStatus;
          const orderId = (po as any).orderId;
          const isPending = status === 'PENDING';
          const isPUR = orderId?.startsWith('PUR');
          
          if (isPending && isPUR) {
            console.log(`✅ Production order ${orderId} matches criteria: status=${status}, starts with PUR=${isPUR}`);
          } else if (orderId?.startsWith('PUR')) {
            console.log(`⚠️ Production order ${orderId} has wrong status: ${status} (expected PENDING)`);
          }
          
          return isPending && isPUR;
        });
        console.log(`🏭 Found ${pendingProductionOrders.length} pending PUR production orders`);
        
        // Debug: Show first few production orders to see the filtering
        console.log('🔍 First 3 production orders after filtering:', pendingProductionOrders.slice(0, 3).map(po => ({
          id: (po as any).id,
          orderId: (po as any).orderId,
          status: (po as any).productionStatus,
          itemName: (po as any).itemName
        })));
        if (pendingProductionOrders.length > 0) {
          console.log('🏭 Sample production order:', {
            orderId: (pendingProductionOrders[0] as any).orderId,
            productionStatus: (pendingProductionOrders[0] as any).productionStatus,
            itemName: (pendingProductionOrders[0] as any).itemName,
            itemId: (pendingProductionOrders[0] as any).itemId,
            stockModelId: (pendingProductionOrders[0] as any).itemId,
            customerName: (pendingProductionOrders[0] as any).customerName
          });
        }
      } catch (prodOrderError) {
        console.error('❌ Error fetching production orders:', prodOrderError);
        pendingProductionOrders = [];
      }
      
      // Process each active PO for layup-required items
      console.log(`🏭 Processing ${activePos.length} active P1 Purchase Orders`);
      try {
        for (const po of activePos) {
          try {
            const items = await storage.getPurchaseOrderItems(po.id);
            console.log(`🏭 PO ${po.poNumber} has ${items?.length || 0} items`);
            const stockModelItems = (items || []).filter(item => item?.itemType === 'stock_model');
            console.log(`🏭 PO ${po.poNumber} has ${stockModelItems?.length || 0} stock model items`);
        
        for (const item of stockModelItems) {
          // Calculate priority score for P1 PO items
          const calculateP1Priority = (po: any, item: any) => {
            let baseScore = 50; // Default medium priority
            
            // Due date factor (0-40 points based on urgency)
            const dueDate = new Date(po.expectedDelivery);
            const now = new Date();
            const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const urgencyScore = Math.max(0, Math.min(40, 40 - daysUntilDue));
            
            // Customer factor (check if existing customer - 10 points bonus)
            // We'll add this logic when customer matching is needed
            const customerScore = 0; // TODO: implement customer lookup
            
            return Math.max(1, baseScore + urgencyScore + customerScore);
          };

          // Create layup order entry for each P1 PO item
          const layupOrder = {
            id: `p1-po-${po.id}-${item.id}`, // Unique identifier
            orderId: `${po.poNumber}-${item.id}`, // Display identifier
            orderDate: po.poDate,
            customer: po.customerName,
            product: item.itemName,
            quantity: item.quantity,
            status: 'FINALIZED',
            department: 'Layup',
            currentDepartment: 'Layup',
            priorityScore: calculateP1Priority(po, item),
            dueDate: po.expectedDelivery,
            source: 'p1_purchase_order', // Track source for identification
            poId: po.id,
            poItemId: item.id,
            stockModelId: item.itemId, // For mold mapping
            createdAt: po.createdAt,
            updatedAt: po.updatedAt
          };
          
            p1LayupOrders.push(layupOrder);
          }
          } catch (poItemError) {
            console.error(`❌ Error processing PO ${po.poNumber}:`, poItemError);
          }
        }
      } catch (p1PoError) {
        console.error('❌ Error processing P1 Purchase Orders:', p1PoError);
      }

      // Convert Production Orders to layup queue format
      console.log('🏭 Processing production orders for layup queue, array type:', typeof pendingProductionOrders, 'length:', pendingProductionOrders?.length);
      console.log('🏭 About to apply stock model mapping to production orders');
      
      // Map production order item names to stock model IDs
      const mapItemNameToStockModel = (itemName: string): string => {
        if (!itemName) return 'mesa_universal'; // Default fallback
        
        const name = itemName.toLowerCase();
        
        // Map common production items to stock models
        if (name.includes('altitude') || name.includes('universal')) return 'mesa_universal';
        if (name.includes('privateer')) return 'cf_privateer';
        if (name.includes('alpine') && name.includes('hunter')) return 'cf_adj_alp_hunter';
        if (name.includes('visigoth')) return 'cf_visigoth';
        if (name.includes('armor')) return 'cf_adj_armor';
        if (name.includes('chalk') && name.includes('branch')) return 'cf_adj_chalk_branch';
        if (name.includes('k2')) return 'cf_k2';
        if (name.includes('apr')) return 'apr_hunter';
        if (name.includes('cat')) return 'cf_cat';
        
        // Default to mesa_universal for unmatched items
        return 'mesa_universal';
      };
      
      const productionLayupOrders = (pendingProductionOrders || []).map(po => {
        const mappedStockModelId = mapItemNameToStockModel((po as any).itemName);
        console.log(`🏭 Production order mapping: "${(po as any).itemName}" → "${mappedStockModelId}"`);
        
        // Calculate high priority for production orders to meet P1 purchase order due dates
        const calculateProductionPriority = (dueDate: Date) => {
          const now = new Date();
          const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          // High priority (20-40) for production orders, based on urgency
          if (daysUntilDue <= 7) return 20;   // Very urgent
          if (daysUntilDue <= 14) return 25;  // Urgent
          if (daysUntilDue <= 21) return 30;  // High priority
          return 35; // Still higher than regular orders (50+)
        };
        
        const priority = calculateProductionPriority(new Date((po as any).dueDate));
        console.log(`🏭 Production order ${(po as any).orderId} priority: ${priority} (due: ${(po as any).dueDate})`);
        
        // Map product display name to match mold configuration
        const getProductDisplayName = (itemName: string) => {
          if (itemName === 'Altitude - Universal') {
            return 'Mesa - Universal';
          }
          return itemName || 'Production Item';
        };

        const displayProductName = getProductDisplayName((po as any).itemName);
        console.log(`🏭 Product display name mapping: "${(po as any).itemName}" → "${displayProductName}"`);
        console.log(`🏭 Production order status: ${(po as any).productionStatus}`);
        
        return {
          id: `production-${(po as any).id}`,
          orderId: (po as any).orderId,
          orderDate: (po as any).orderDate,
          customer: (po as any).customerName || 'Production Order',
          product: displayProductName,
          quantity: 1,
          status: 'FINALIZED', // Production orders ready for layup scheduling
          department: 'Layup',
          currentDepartment: 'Layup',
          priorityScore: priority, // High priority to meet due dates
          dueDate: (po as any).dueDate,
          source: 'production_order',
          productionOrderId: (po as any).id,
          stockModelId: mappedStockModelId,
          createdAt: po.createdAt,
          updatedAt: po.updatedAt,
          specifications: po.specifications
        };
      });

      // Combine and sort all orders by priority score (lower = higher priority)
      console.log('🏭 Combining orders:', {
        layupOrders: layupOrders?.length || 0,
        p1LayupOrders: p1LayupOrders?.length || 0,
        productionLayupOrders: productionLayupOrders?.length || 0
      });
      
      // Debug first production order with ALL properties
      if (productionLayupOrders && productionLayupOrders.length > 0) {
        const firstPO = productionLayupOrders[0];
        console.log('🔍 FIRST PRODUCTION ORDER - ALL PROPERTIES:');
        console.log('='.repeat(60));
        Object.keys(firstPO).forEach(key => {
          console.log(`${key}:`, firstPO[key]);
        });
        console.log('='.repeat(60));
        console.log('🔍 First production order JSON:', JSON.stringify(firstPO, null, 2));
      } else {
        console.log('🔍 No production orders found');
      }
      
      const combinedOrders = [
        ...(layupOrders || []).map(order => ({ 
          ...order, 
          source: 'main_orders',
          // Ensure features object is included for action length display
          features: (order as any).features || {},
          modelId: (order as any).modelId
        })),
        ...p1LayupOrders.map(order => ({
          ...order,
          // P1 orders don't have features but we can add modelId for consistency  
          modelId: order.stockModelId
        })),
        ...productionLayupOrders.map(order => ({
          ...order,
          // Production orders may not have stock model but include item ID
          modelId: order.stockModelId || order.product
        }))
      ].sort((a, b) => ((a as any).priorityScore || 50) - ((b as any).priorityScore || 50));

      console.log(`🏭 Final combined orders count: ${combinedOrders.length}`);
      console.log(`🏭 Production orders in final result: ${combinedOrders.filter(o => o.source === 'production_order').length}`);
      
      res.json(combinedOrders);
    } catch (error) {
      console.error("Layup queue error:", error);
      res.status(500).json({ error: "Failed to fetch layup queue" });
    }
  });

  // Documentation endpoint
  app.get("/api/documentation", async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const docPath = path.join(process.cwd(), 'EPOCH_v8_Complete_Architecture.md');
      const content = fs.readFileSync(docPath, 'utf-8');
      
      res.setHeader('Content-Type', 'text/markdown');
      res.send(content);
    } catch (error) {
      console.error("Documentation error:", error);
      res.status(500).json({ error: "Failed to load documentation" });
    }
  });

  // Barcode API routes
  app.get("/api/orders/:orderId/barcode", async (req, res) => {
    try {
      const { orderId } = req.params;
      const order = await storage.getOrderDraft(orderId);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      res.json({ 
        orderId: order.orderId,
        barcode: order.barcode || `P1-${order.orderId}`
      });
    } catch (error) {
      console.error("Get order barcode error:", error);
      res.status(500).json({ error: "Failed to fetch order barcode" });
    }
  });

  app.get("/api/barcode/scan/:barcode", async (req, res) => {
    try {
      const { barcode } = req.params;
      
      // Find order by barcode (case insensitive)
      const orders = await storage.getAllOrderDrafts();
      const order = orders.find(o => o.barcode?.toLowerCase() === barcode.toLowerCase());
      
      if (!order) {
        return res.status(404).json({ error: "Order not found for this barcode" });
      }

      // Get customer info
      const customers = await storage.getAllCustomers();
      const customer = customers.find(c => c.id.toString() === order.customerId);

      // Get model info
      const models = await storage.getAllStockModels();
      const model = models.find(m => m.id === order.modelId);

      // Get features for pricing calculation and display
      const allFeatures = await storage.getAllFeatures();
      const subCategories = await storage.getAllFeatureSubCategories();
      const selectedFeatures = order.features ? Object.entries(order.features as Record<string, any>) : [];
      
      // Build detailed features list for display
      const orderFeatures = [];
      for (const [featureId, featureValue] of selectedFeatures) {
        if (!featureValue) continue;
        
        const feature = allFeatures.find(f => f.id === featureId);
        if (feature) {
          let displayValue = featureValue;
          
          // Handle paint options with subcategory lookup
          if (featureId === 'paint_options_combined' && typeof featureValue === 'string' && featureValue.includes(':')) {
            const [paintFeatureId, optionValue] = featureValue.split(':');
            const paintFeature = allFeatures.find(f => f.id === paintFeatureId);
            if (paintFeature && paintFeature.subCategory) {
              const subCategory = subCategories.find(sc => sc.id === paintFeature.subCategory);
              displayValue = subCategory?.name || optionValue;
            } else {
              displayValue = optionValue;
            }
          }
          
          // Handle multiselect arrays
          if (Array.isArray(featureValue)) {
            displayValue = featureValue.join(', ');
          }
          
          orderFeatures.push({
            id: featureId,
            name: feature.displayName || feature.name,
            value: displayValue,
            type: feature.type
          });
        }
      }
      
      // Calculate line items with prices
      const lineItems = [];
      
      // Base model price
      if (model) {
        lineItems.push({
          type: 'model',
          name: model.name,
          description: 'Base Model',
          price: model.price || 0,
          quantity: 1
        });
      }

      // Feature prices
      for (const [featureId, featureValue] of selectedFeatures) {
        const feature = allFeatures.find(f => f.id === featureId);
        if (feature && featureValue && feature.price) {
          lineItems.push({
            type: 'feature',
            name: feature.displayName || feature.name,
            description: `Feature: ${featureValue}`,
            price: feature.price,
            quantity: (order.featureQuantities as any)?.[featureId] || 1
          });
        }
      }

      // Shipping
      if (order.shipping && order.shipping > 0) {
        lineItems.push({
          type: 'shipping',
          name: 'Shipping',
          description: 'Shipping & Handling',
          price: order.shipping,
          quantity: 1
        });
      }

      // Calculate totals
      const subtotal = lineItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      // Apply discounts if present
      let discountAmount = 0;
      let discountDetails = [];
      
      if ((order as any).discounts && Array.isArray((order as any).discounts)) {
        for (const discount of (order as any).discounts) {
          let amount = 0;
          if (discount.type === 'PERCENTAGE') {
            amount = subtotal * (discount.value / 100);
          } else if (discount.type === 'FIXED') {
            amount = discount.value;
          }
          discountAmount += amount;
          discountDetails.push({
            name: discount.name || 'Discount',
            type: discount.type,
            value: discount.value,
            amount: Math.round(amount * 100) / 100
          });
        }
      }
      
      const afterDiscounts = subtotal - discountAmount;
      const total = order.priceOverride || afterDiscounts;

      // Determine payment status (simplified logic)
      const paymentStatus = order.status === 'COMPLETED' ? 'PAID' : 
                           order.status === 'PROCESSING' ? 'PENDING' : 'UNPAID';

      res.json({
        orderId: order.orderId,
        orderDate: order.orderDate,
        customer: customer ? {
          name: customer.name,
          email: customer.email
        } : null,
        baseModel: model ? {
          name: model.name,
          id: model.id
        } : null,
        features: orderFeatures,
        lineItems,
        pricing: {
          subtotal: Math.round(subtotal * 100) / 100,
          discounts: discountDetails,
          discountTotal: Math.round(discountAmount * 100) / 100,
          afterDiscounts: Math.round(afterDiscounts * 100) / 100,
          total: Math.round(total * 100) / 100,
          override: order.priceOverride ? true : false
        },
        paymentStatus,
        status: order.status
      });
    } catch (error) {
      console.error("Barcode scan error:", error);
      res.status(500).json({ error: "Failed to process barcode scan" });
    }
  });

  // Layup Scheduler API Routes

  // Molds CRUD
  app.get("/api/molds", async (req, res) => {
    try {
      const molds = await storage.getAllMolds();
      res.json(molds);
    } catch (error) {
      console.error("Molds fetch error:", error);
      res.status(500).json({ error: "Failed to fetch molds" });
    }
  });

  app.get("/api/molds/:moldId", async (req, res) => {
    try {
      const mold = await storage.getMold(req.params.moldId);
      if (mold) {
        res.json(mold);
      } else {
        res.status(404).json({ error: "Mold not found" });
      }
    } catch (error) {
      console.error("Mold fetch error:", error);
      res.status(500).json({ error: "Failed to fetch mold" });
    }
  });

  app.post("/api/molds", async (req, res) => {
    try {
      const result = insertMoldSchema.parse(req.body);
      const mold = await storage.createMold(result);
      res.json(mold);
    } catch (error) {
      console.error("Mold creation error:", error);
      res.status(400).json({ error: "Invalid mold data" });
    }
  });

  app.put("/api/molds/:moldId", async (req, res) => {
    try {
      // Ensure updatedAt is properly set
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };
      const mold = await storage.updateMold(req.params.moldId, updateData);
      res.json(mold);
    } catch (error) {
      console.error("Mold update error:", error);
      res.status(400).json({ error: "Failed to update mold" });
    }
  });

  app.delete("/api/molds/:moldId", async (req, res) => {
    try {
      await storage.deleteMold(req.params.moldId);
      res.json({ success: true });
    } catch (error) {
      console.error("Mold deletion error:", error);
      res.status(500).json({ error: "Failed to delete mold" });
    }
  });

  // Employee Layup Settings CRUD
  app.get("/api/employees/layup-settings", async (req, res) => {
    try {
      const settings = await storage.getAllEmployeeLayupSettings();
      res.json(settings);
    } catch (error) {
      console.error("Employee layup settings fetch error:", error);
      res.status(500).json({ error: "Failed to fetch employee layup settings" });
    }
  });

  app.get("/api/employees/layup-settings/:employeeId", async (req, res) => {
    try {
      const settings = await storage.getEmployeeLayupSettings(req.params.employeeId);
      if (settings) {
        res.json(settings);
      } else {
        res.status(404).json({ error: "Employee layup settings not found" });
      }
    } catch (error) {
      console.error("Employee layup settings fetch error:", error);
      res.status(500).json({ error: "Failed to fetch employee layup settings" });
    }
  });

  app.post("/api/employees/layup-settings", async (req, res) => {
    try {
      const result = insertEmployeeLayupSettingsSchema.parse(req.body);
      const settings = await storage.createEmployeeLayupSettings(result);
      res.json(settings);
    } catch (error) {
      console.error("Employee layup settings creation error:", error);
      res.status(400).json({ error: "Invalid employee layup settings data" });
    }
  });

  app.put("/api/employees/layup-settings/:employeeId", async (req, res) => {
    try {
      // Decode URL-encoded employee ID
      const employeeId = decodeURIComponent(req.params.employeeId);
      console.log(`💾 API: Updating employee layup settings for: "${employeeId}"`);
      console.log(`📝 API: Update data:`, req.body);
      
      // Validate the data (but be flexible with required fields for updates)
      const updateData = {
        rate: req.body.rate ? parseFloat(req.body.rate) : undefined,
        hours: req.body.hours ? parseFloat(req.body.hours) : undefined,
        department: req.body.department || undefined,
        isActive: req.body.isActive !== undefined ? req.body.isActive : undefined,
        updatedAt: new Date()
      };
      
      // Remove undefined values
      const cleanData = Object.fromEntries(
        Object.entries(updateData).filter(([_, value]) => value !== undefined)
      );
      
      console.log(`🧹 API: Clean update data:`, cleanData);
      
      const settings = await storage.updateEmployeeLayupSettings(employeeId, cleanData);
      console.log(`✅ API: Successfully updated employee layup settings for: "${employeeId}"`);
      res.json(settings);
    } catch (error) {
      console.error("❌ API: Employee layup settings update error:", error);
      console.error("❌ API: Error details:", (error as any)?.message || error);
      res.status(400).json({ 
        error: "Failed to update employee layup settings", 
        details: (error as any)?.message || "Unknown error",
        employeeId: decodeURIComponent(req.params.employeeId)
      });
    }
  });

  app.delete("/api/employees/layup-settings/:employeeId", async (req, res) => {
    try {
      await storage.deleteEmployeeLayupSettings(req.params.employeeId);
      res.json({ success: true });
    } catch (error) {
      console.error("Employee layup settings deletion error:", error);
      res.status(500).json({ error: "Failed to delete employee layup settings" });
    }
  });

  // Layup Orders CRUD
  app.get("/api/layup-orders", async (req, res) => {
    try {
      const { status, department } = req.query;
      const filters = {
        status: status as string,
        department: department as string,
      };
      const orders = await storage.getAllLayupOrders(filters);
      res.json(orders);
    } catch (error) {
      console.error("Layup orders fetch error:", error);
      res.status(500).json({ error: "Failed to fetch layup orders" });
    }
  });

  app.get("/api/layup-orders/:orderId", async (req, res) => {
    try {
      const order = await storage.getLayupOrder(req.params.orderId);
      if (order) {
        res.json(order);
      } else {
        res.status(404).json({ error: "Layup order not found" });
      }
    } catch (error) {
      console.error("Layup order fetch error:", error);
      res.status(500).json({ error: "Failed to fetch layup order" });
    }
  });

  app.post("/api/layup-orders", async (req, res) => {
    try {
      const result = insertLayupOrderSchema.parse(req.body);
      const order = await storage.createLayupOrder(result);
      res.json(order);
    } catch (error) {
      console.error("Layup order creation error:", error);
      res.status(400).json({ error: "Invalid layup order data" });
    }
  });

  app.put("/api/layup-orders/:orderId", async (req, res) => {
    try {
      const order = await storage.updateLayupOrder(req.params.orderId, req.body);
      res.json(order);
    } catch (error) {
      console.error("Layup order update error:", error);
      res.status(400).json({ error: "Failed to update layup order" });
    }
  });

  app.delete("/api/layup-orders/:orderId", async (req, res) => {
    try {
      await storage.deleteLayupOrder(req.params.orderId);
      res.json({ success: true });
    } catch (error) {
      console.error("Layup order deletion error:", error);
      res.status(500).json({ error: "Failed to delete layup order" });
    }
  });

  // Order Override Endpoint
  app.post("/api/layup-orders/:orderId/override", async (req, res) => {
    try {
      const { newDate, moldId } = req.body;
      const schedule = await storage.overrideOrderSchedule(
        req.params.orderId,
        new Date(newDate),
        moldId,
        'system' // or req.user?.id if you have authentication
      );
      res.json(schedule);
    } catch (error) {
      console.error("Order override error:", error);
      res.status(400).json({ error: "Failed to override order schedule" });
    }
  });

  // Auto-schedule layup orders based on molds and employee production rates
  app.post("/api/layup-schedule/auto-generate", async (req, res) => {
    try {
      // Get all required data
      const orders = await storage.getUnifiedLayupOrders();
      const molds = await storage.getAllMolds();
      const employeeSettings = await storage.getAllEmployeeLayupSettings();

      // Convert to scheduler format with proper stock model mapping
      const layupOrders = orders.map((order: any) => ({
        orderId: order.orderId,
        orderDate: new Date(order.orderDate || order.created_at),
        priorityScore: order.priority || 100,
        customer: order.customerName || 'Unknown',
        product: order.stockModelName || order.skuNumber || 'Unknown',
        modelId: order.modelId || order.stockModelId, // Include model ID for mold matching
        stockModelId: order.modelId || order.stockModelId // Ensure both fields are available
      }));

      const moldSettings = molds.map((mold: any) => ({
        moldId: mold.moldId,
        modelName: mold.modelName,
        instanceNumber: mold.instanceNumber || 1,
        enabled: mold.enabled !== false,
        multiplier: mold.dailyCapacity || mold.multiplier || 1,
        stockModels: mold.stockModels || [] // Include stock model compatibility for proper matching
      }));

      const empSettings = employeeSettings.map((emp: any) => ({
        employeeId: emp.employeeId,
        name: emp.name || emp.employeeId,
        rate: emp.productionRate || 1,
        hours: emp.dailyHours || 8
      }));

      // Generate schedule using the scheduler utility
      const schedulerUtils = await import('../client/src/utils/schedulerUtils.js');
      const generateLayupSchedule = schedulerUtils.generateLayupSchedule || schedulerUtils.default?.generateLayupSchedule;
      
      if (!generateLayupSchedule) {
        throw new Error('generateLayupSchedule function not found');
      }
      
      const scheduleResults = generateLayupSchedule(layupOrders, moldSettings, empSettings);

      // Return the generated schedule (without database persistence for now)
      console.log(`📋 Generated schedule for ${scheduleResults.length} orders`);
      
      // Log schedule details for debugging
      scheduleResults.forEach(entry => {
        console.log(`📅 Schedule: ${entry.orderId} → ${entry.moldId} on ${entry.scheduledDate.toDateString()}`);
      });

      console.log('✅ Auto-schedule generation completed successfully');
      res.json({ 
        success: true, 
        message: `Generated auto-schedule for ${scheduleResults.length} orders`,
        scheduledOrders: scheduleResults.length,
        schedules: scheduleResults.map(entry => ({
          orderId: entry.orderId,
          scheduledDate: entry.scheduledDate.toISOString(),
          moldId: entry.moldId,
          employeeAssignments: entry.employeeAssignments || []
        }))
      });

    } catch (error) {
      console.error("Auto-schedule generation error:", error);
      res.status(500).json({ error: "Failed to generate auto-schedule" });
    }
  });

  // Layup Schedule CRUD
  app.get("/api/layup-schedule", async (req, res) => {
    try {
      const { orderId } = req.query;
      if (orderId) {
        const schedule = await storage.getLayupScheduleByOrder(orderId as string);
        res.json(schedule);
      } else {
        const schedule = await storage.getAllLayupSchedule();
        res.json(schedule);
      }
    } catch (error) {
      console.error("Layup schedule fetch error:", error);
      res.status(500).json({ error: "Failed to fetch layup schedule" });
    }
  });

  app.post("/api/layup-schedule", async (req, res) => {
    try {
      const result = insertLayupScheduleSchema.parse(req.body);
      const schedule = await storage.createLayupSchedule(result);
      res.json(schedule);
    } catch (error) {
      console.error("Layup schedule creation error:", error);
      res.status(400).json({ error: "Invalid layup schedule data" });
    }
  });

  app.put("/api/layup-schedule/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const schedule = await storage.updateLayupSchedule(id, req.body);
      res.json(schedule);
    } catch (error) {
      console.error("Layup schedule update error:", error);
      res.status(400).json({ error: "Failed to update layup schedule" });
    }
  });

  app.delete("/api/layup-schedule/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteLayupSchedule(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Layup schedule deletion error:", error);
      res.status(500).json({ error: "Failed to delete layup schedule" });
    }
  });

  // Department Progression API Routes
  
  // Get all orders with department information
  app.get("/api/orders", async (req, res) => {
    try {
      const { view, includeDept, includeScheduleFlag } = req.query;
      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error) {
      console.error("Orders fetch error:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });



  // Progress an order to the next department
  app.post("/api/orders/:orderId/progress", async (req, res) => {
    try {
      const { orderId } = req.params;
      const { nextDepartment } = req.body;
      const result = await storage.progressOrder(orderId, nextDepartment);
      res.json(result);
    } catch (error) {
      console.error("Order progress error:", error);
      res.status(500).json({ error: "Failed to progress order" });
    }
  });

  // Scrap an order
  app.post("/api/orders/:orderId/scrap", async (req, res) => {
    try {
      const { orderId } = req.params;
      const { reason, disposition, authorization, scrapDate } = req.body;
      const result = await storage.scrapOrder(orderId, {
        reason,
        disposition,
        authorization,
        scrapDate: new Date(scrapDate)
      });
      res.json(result);
    } catch (error) {
      console.error("Order scrap error:", error);
      res.status(500).json({ error: "Failed to scrap order" });
    }
  });

  // Create replacement order after scrapping
  app.post("/api/orders/:orderId/reload-replacement", async (req, res) => {
    try {
      const { orderId } = req.params;
      const result = await storage.createReplacementOrder(orderId);
      res.json(result);
    } catch (error) {
      console.error("Replacement order error:", error);
      res.status(500).json({ error: "Failed to create replacement order" });
    }
  });

  // P2 Customer Management API routes
  app.get("/api/p2/customers", async (req, res) => {
    try {
      const customers = await storage.getAllP2Customers();
      res.json(customers);
    } catch (error) {
      console.error("Get P2 customers error:", error);
      res.status(500).json({ error: "Failed to fetch P2 customers" });
    }
  });

  app.get("/api/p2/customers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const customer = await storage.getP2Customer(parseInt(id));
      if (!customer) {
        return res.status(404).json({ error: "P2 Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      console.error("Get P2 customer error:", error);
      res.status(500).json({ error: "Failed to fetch P2 customer" });
    }
  });

  app.post("/api/p2/customers", async (req, res) => {
    try {
      const customerData = insertP2CustomerSchema.parse(req.body);
      const customer = await storage.createP2Customer(customerData);
      res.status(201).json(customer);
    } catch (error) {
      console.error("Create P2 customer error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid P2 customer data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create P2 customer" });
      }
    }
  });

  app.put("/api/p2/customers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const customerData = insertP2CustomerSchema.partial().parse(req.body);
      const customer = await storage.updateP2Customer(parseInt(id), customerData);
      res.json(customer);
    } catch (error) {
      console.error("Update P2 customer error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid P2 customer data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update P2 customer" });
      }
    }
  });

  app.delete("/api/p2/customers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteP2Customer(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete P2 customer error:", error);
      res.status(500).json({ error: "Failed to delete P2 customer" });
    }
  });

  // P2 Purchase Orders API routes
  app.get("/api/p2/purchase-orders", async (req, res) => {
    try {
      const pos = await storage.getAllP2PurchaseOrders();
      res.json(pos);
    } catch (error) {
      console.error("Get P2 purchase orders error:", error);
      res.status(500).json({ error: "Failed to fetch P2 purchase orders" });
    }
  });

  app.get("/api/p2/purchase-orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { includeItems } = req.query;
      const po = await storage.getP2PurchaseOrder(parseInt(id), {
        includeItems: includeItems === 'true'
      });
      if (!po) {
        return res.status(404).json({ error: "P2 Purchase Order not found" });
      }
      res.json(po);
    } catch (error) {
      console.error("Get P2 purchase order error:", error);
      res.status(500).json({ error: "Failed to fetch P2 purchase order" });
    }
  });

  app.post("/api/p2/purchase-orders", async (req, res) => {
    try {
      const poData = insertP2PurchaseOrderSchema.parse(req.body);
      const po = await storage.createP2PurchaseOrder(poData);
      res.status(201).json(po);
    } catch (error) {
      console.error("Create P2 purchase order error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid P2 purchase order data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create P2 purchase order" });
      }
    }
  });

  app.put("/api/p2/purchase-orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const poData = insertP2PurchaseOrderSchema.partial().parse(req.body);
      const po = await storage.updateP2PurchaseOrder(parseInt(id), poData);
      res.json(po);
    } catch (error) {
      console.error("Update P2 purchase order error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid P2 purchase order data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update P2 purchase order" });
      }
    }
  });

  app.delete("/api/p2/purchase-orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteP2PurchaseOrder(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete P2 purchase order error:", error);
      res.status(500).json({ error: "Failed to delete P2 purchase order" });
    }
  });

  // P2 Purchase Order Items API routes
  app.get("/api/p2/purchase-orders/:poId/items", async (req, res) => {
    try {
      const { poId } = req.params;
      const items = await storage.getP2PurchaseOrderItems(parseInt(poId));
      res.json(items);
    } catch (error) {
      console.error("Get P2 purchase order items error:", error);
      res.status(500).json({ error: "Failed to fetch P2 purchase order items" });
    }
  });

  app.post("/api/p2/purchase-orders/:poId/items", async (req, res) => {
    try {
      const { poId } = req.params;
      const itemData = insertP2PurchaseOrderItemSchema.omit({ poId: true }).parse(req.body);
      const item = await storage.createP2PurchaseOrderItem({ 
        ...itemData, 
        poId: parseInt(poId),
        totalPrice: itemData.quantity * (itemData.unitPrice || 0)
      });
      res.status(201).json(item);
    } catch (error) {
      console.error("Create P2 purchase order item error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid P2 purchase order item data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create P2 purchase order item" });
      }
    }
  });

  app.put("/api/p2/purchase-orders/:poId/items/:itemId", async (req, res) => {
    try {
      const { itemId } = req.params;
      const itemData = insertP2PurchaseOrderItemSchema.partial().omit({ poId: true }).parse(req.body);
      const item = await storage.updateP2PurchaseOrderItem(parseInt(itemId), itemData);
      res.json(item);
    } catch (error) {
      console.error("Update P2 purchase order item error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid P2 purchase order item data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update P2 purchase order item" });
      }
    }
  });

  app.delete("/api/p2/purchase-orders/:poId/items/:itemId", async (req, res) => {
    try {
      const { itemId } = req.params;
      await storage.deleteP2PurchaseOrderItem(parseInt(itemId));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete P2 purchase order item error:", error);
      res.status(500).json({ error: "Failed to delete P2 purchase order item" });
    }
  });

  // P2 Production Orders Routes
  app.get("/api/p2/production-orders", async (req, res) => {
    try {
      const orders = await storage.getAllP2ProductionOrders();
      res.json(orders);
    } catch (error) {
      console.error("Get P2 production orders error:", error);
      res.status(500).json({ error: "Failed to fetch P2 production orders" });
    }
  });

  app.get("/api/p2/purchase-orders/:poId/production-orders", async (req, res) => {
    try {
      const { poId } = req.params;
      const orders = await storage.getP2ProductionOrdersByPoId(parseInt(poId));
      res.json(orders);
    } catch (error) {
      console.error("Get P2 production orders by PO ID error:", error);
      res.status(500).json({ error: "Failed to fetch P2 production orders" });
    }
  });

  app.post("/api/p2/purchase-orders/:poId/generate-production-orders", async (req, res) => {
    try {
      const { poId } = req.params;
      const orders = await storage.generateP2ProductionOrders(parseInt(poId));
      res.status(201).json(orders);
    } catch (error) {
      console.error("Generate P2 production orders error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate P2 production orders" });
    }
  });

  app.get("/api/p2/purchase-orders/:poId/material-requirements", async (req, res) => {
    try {
      const { poId } = req.params;
      const materials = await storage.getP2MaterialRequirements(parseInt(poId));
      res.json(materials);
    } catch (error) {
      console.error("Get P2 material requirements error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch material requirements" });
    }
  });

  app.get("/api/p2/production-orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getP2ProductionOrder(parseInt(id));
      if (!order) {
        return res.status(404).json({ error: "P2 production order not found" });
      }
      res.json(order);
    } catch (error) {
      console.error("Get P2 production order error:", error);
      res.status(500).json({ error: "Failed to fetch P2 production order" });
    }
  });

  app.put("/api/p2/production-orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const orderData = insertP2ProductionOrderSchema.partial().parse(req.body);
      const order = await storage.updateP2ProductionOrder(parseInt(id), orderData);
      res.json(order);
    } catch (error) {
      console.error("Update P2 production order error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid P2 production order data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update P2 production order" });
      }
    }
  });

  app.delete("/api/p2/production-orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteP2ProductionOrder(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete P2 production order error:", error);
      res.status(500).json({ error: "Failed to delete P2 production order" });
    }
  });

  // BOM (Bill of Materials) Management Routes
  app.get("/api/boms", async (req, res) => {
    try {
      const boms = await storage.getAllBOMs();
      res.json(boms);
    } catch (error) {
      console.error("Get BOMs error:", error);
      res.status(500).json({ error: "Failed to fetch BOMs" });
    }
  });

  app.post("/api/boms", async (req, res) => {
    try {
      const bomData = insertBomDefinitionSchema.parse(req.body);
      const bom = await storage.createBOM(bomData);
      res.status(201).json(bom);
    } catch (error) {
      console.error("Create BOM error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid BOM data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create BOM" });
      }
    }
  });

  app.get("/api/boms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const bom = await storage.getBOMDetails(parseInt(id));
      if (!bom) {
        return res.status(404).json({ error: "BOM not found" });
      }
      res.json(bom);
    } catch (error) {
      console.error("Get BOM details error:", error);
      res.status(500).json({ error: "Failed to fetch BOM details" });
    }
  });

  app.put("/api/boms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const bomData = insertBomDefinitionSchema.partial().parse(req.body);
      const bom = await storage.updateBOM(parseInt(id), bomData);
      res.json(bom);
    } catch (error) {
      console.error("Update BOM error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid BOM data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update BOM" });
      }
    }
  });

  app.delete("/api/boms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteBOM(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete BOM error:", error);
      res.status(500).json({ error: "Failed to delete BOM" });
    }
  });

  app.post("/api/boms/:id/items", async (req, res) => {
    try {
      const { id } = req.params;
      const itemData = insertBomItemSchema.omit({ bomId: true }).parse(req.body);
      const item = await storage.addBOMItem(parseInt(id), { ...itemData, bomId: parseInt(id) });
      res.status(201).json(item);
    } catch (error) {
      console.error("Add BOM item error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid BOM item data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to add BOM item" });
      }
    }
  });

  app.put("/api/boms/:bomId/items/:itemId", async (req, res) => {
    try {
      const { bomId, itemId } = req.params;
      const itemData = insertBomItemSchema.partial().omit({ bomId: true }).parse(req.body);
      const item = await storage.updateBOMItem(parseInt(bomId), parseInt(itemId), itemData);
      res.json(item);
    } catch (error) {
      console.error("Update BOM item error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid BOM item data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update BOM item" });
      }
    }
  });

  app.delete("/api/boms/:bomId/items/:itemId", async (req, res) => {
    try {
      const { bomId, itemId } = req.params;
      await storage.deleteBOMItem(parseInt(bomId), parseInt(itemId));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete BOM item error:", error);
      res.status(500).json({ error: "Failed to delete BOM item" });
    }
  });

  // Purchase Review Checklist API routes
  app.post("/api/purchase-review-checklists", async (req, res) => {
    try {
      const data = insertPurchaseReviewChecklistSchema.parse(req.body);
      const result = await storage.createPurchaseReviewChecklist(data);
      res.json(result);
    } catch (error) {
      console.error("Create purchase review checklist error:", error);
      res.status(500).json({ error: "Failed to save purchase review checklist" });
    }
  });

  app.get("/api/purchase-review-checklists", async (req, res) => {
    try {
      const result = await storage.getAllPurchaseReviewChecklists();
      res.json(result);
    } catch (error) {
      console.error("Get purchase review checklists error:", error);
      res.status(500).json({ error: "Failed to get purchase review checklists" });
    }
  });

  app.get("/api/purchase-review-checklists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.getPurchaseReviewChecklistById(parseInt(id));
      if (!result) {
        return res.status(404).json({ error: "Purchase review checklist not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Get purchase review checklist error:", error);
      res.status(500).json({ error: "Failed to get purchase review checklist" });
    }
  });

  app.put("/api/purchase-review-checklists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = insertPurchaseReviewChecklistSchema.parse(req.body);
      const result = await storage.updatePurchaseReviewChecklist(parseInt(id), data);
      if (!result) {
        return res.status(404).json({ error: "Purchase review checklist not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Update purchase review checklist error:", error);
      res.status(500).json({ error: "Failed to update purchase review checklist" });
    }
  });

  app.delete("/api/purchase-review-checklists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.deletePurchaseReviewChecklist(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete purchase review checklist error:", error);
      res.status(500).json({ error: "Failed to delete purchase review checklist" });
    }
  });

  // Task Tracker API routes
  app.get("/api/task-items", async (req, res) => {
    try {
      const tasks = await storage.getAllTaskItems();
      res.json(tasks);
    } catch (error) {
      console.error("Get task items error:", error);
      res.status(500).json({ error: "Failed to get task items" });
    }
  });

  app.get("/api/task-items/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const task = await storage.getTaskItemById(parseInt(id));
      if (!task) {
        return res.status(404).json({ error: "Task item not found" });
      }
      res.json(task);
    } catch (error) {
      console.error("Get task item error:", error);
      res.status(500).json({ error: "Failed to get task item" });
    }
  });

  app.post("/api/task-items", async (req, res) => {
    try {
      const data = insertTaskItemSchema.parse(req.body);
      const task = await storage.createTaskItem(data);
      res.status(201).json(task);
    } catch (error) {
      console.error("Create task item error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid task item data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create task item" });
      }
    }
  });

  app.put("/api/task-items/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = insertTaskItemSchema.partial().parse(req.body);
      const task = await storage.updateTaskItem(parseInt(id), data);
      if (!task) {
        return res.status(404).json({ error: "Task item not found" });
      }
      res.json(task);
    } catch (error) {
      console.error("Update task item error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid task item data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update task item" });
      }
    }
  });

  app.patch("/api/task-items/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const task = await storage.updateTaskItemStatus(parseInt(id), updateData);
      if (!task) {
        return res.status(404).json({ error: "Task item not found" });
      }
      res.json(task);
    } catch (error) {
      console.error("Update task item status error:", error);
      res.status(500).json({ error: "Failed to update task item status" });
    }
  });

  app.delete("/api/task-items/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTaskItem(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete task item error:", error);
      res.status(500).json({ error: "Failed to delete task item" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

