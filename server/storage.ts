import { 
  users, csvData, customerTypes, persistentDiscounts, shortTermSales, featureCategories, featureSubCategories, features, stockModels, orderDrafts, forms, formSubmissions,
  inventoryItems, inventoryScans, employees, qcDefinitions, qcSubmissions, maintenanceSchedules, maintenanceLogs,
  timeClockEntries, checklistItems, onboardingDocs, customers, customerAddresses, communicationLogs, pdfDocuments,
  enhancedFormCategories, enhancedForms, enhancedFormVersions, enhancedFormSubmissions,
  type User, type InsertUser, type CSVData, type InsertCSVData,
  type CustomerType, type InsertCustomerType,
  type PersistentDiscount, type InsertPersistentDiscount,
  type ShortTermSale, type InsertShortTermSale,
  type FeatureCategory, type InsertFeatureCategory,
  type FeatureSubCategory, type InsertFeatureSubCategory,
  type Feature, type InsertFeature,
  type StockModel, type InsertStockModel,
  type OrderDraft, type InsertOrderDraft,
  type Form, type InsertForm,
  type FormSubmission, type InsertFormSubmission,
  type InventoryItem, type InsertInventoryItem,
  type InventoryScan, type InsertInventoryScan,
  type Employee, type InsertEmployee,
  type QcDefinition, type InsertQcDefinition,
  type QcSubmission, type InsertQcSubmission,
  type MaintenanceSchedule, type InsertMaintenanceSchedule,
  type MaintenanceLog, type InsertMaintenanceLog,
  type TimeClockEntry, type InsertTimeClockEntry,
  type ChecklistItem, type InsertChecklistItem,
  type OnboardingDoc, type InsertOnboardingDoc,
  type Customer, type InsertCustomer,
  type CustomerAddress, type InsertCustomerAddress,
  type CommunicationLog, type InsertCommunicationLog,
  type PdfDocument, type InsertPdfDocument,
  type EnhancedFormCategory, type InsertEnhancedFormCategory,
  type EnhancedForm, type InsertEnhancedForm,
  type EnhancedFormVersion, type InsertEnhancedFormVersion,
  type EnhancedFormSubmission, type InsertEnhancedFormSubmission
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  saveCSVData(data: InsertCSVData): Promise<CSVData>;
  getLatestCSVData(): Promise<CSVData | undefined>;
  clearCSVData(): Promise<void>;
  
  // Customer Types CRUD
  getAllCustomerTypes(): Promise<CustomerType[]>;
  getCustomerType(id: number): Promise<CustomerType | undefined>;
  createCustomerType(data: InsertCustomerType): Promise<CustomerType>;
  updateCustomerType(id: number, data: Partial<InsertCustomerType>): Promise<CustomerType>;
  deleteCustomerType(id: number): Promise<void>;
  
  // Persistent Discounts CRUD
  getAllPersistentDiscounts(): Promise<PersistentDiscount[]>;
  getPersistentDiscount(id: number): Promise<PersistentDiscount | undefined>;
  createPersistentDiscount(data: InsertPersistentDiscount): Promise<PersistentDiscount>;
  updatePersistentDiscount(id: number, data: Partial<InsertPersistentDiscount>): Promise<PersistentDiscount>;
  deletePersistentDiscount(id: number): Promise<void>;
  
  // Short Term Sales CRUD
  getAllShortTermSales(): Promise<ShortTermSale[]>;
  getShortTermSale(id: number): Promise<ShortTermSale | undefined>;
  createShortTermSale(data: InsertShortTermSale): Promise<ShortTermSale>;
  updateShortTermSale(id: number, data: Partial<InsertShortTermSale>): Promise<ShortTermSale>;
  deleteShortTermSale(id: number): Promise<void>;
  
  // Feature Categories CRUD
  getAllFeatureCategories(): Promise<FeatureCategory[]>;
  getFeatureCategory(id: string): Promise<FeatureCategory | undefined>;
  createFeatureCategory(data: InsertFeatureCategory): Promise<FeatureCategory>;
  updateFeatureCategory(id: string, data: Partial<InsertFeatureCategory>): Promise<FeatureCategory>;
  deleteFeatureCategory(id: string): Promise<void>;
  
  // Feature Sub-Categories CRUD
  getAllFeatureSubCategories(): Promise<FeatureSubCategory[]>;
  getFeatureSubCategory(id: string): Promise<FeatureSubCategory | undefined>;
  createFeatureSubCategory(data: InsertFeatureSubCategory): Promise<FeatureSubCategory>;
  updateFeatureSubCategory(id: string, data: Partial<InsertFeatureSubCategory>): Promise<FeatureSubCategory>;
  deleteFeatureSubCategory(id: string): Promise<void>;
  
  // Features CRUD
  getAllFeatures(): Promise<Feature[]>;
  getFeature(id: string): Promise<Feature | undefined>;
  createFeature(data: InsertFeature): Promise<Feature>;
  updateFeature(id: string, data: Partial<InsertFeature>): Promise<Feature>;
  deleteFeature(id: string): Promise<void>;
  
  // Stock Models CRUD
  getAllStockModels(): Promise<StockModel[]>;
  getStockModel(id: string): Promise<StockModel | undefined>;
  createStockModel(data: InsertStockModel): Promise<StockModel>;
  updateStockModel(id: string, data: Partial<InsertStockModel>): Promise<StockModel>;
  deleteStockModel(id: string): Promise<void>;
  
  // Order Drafts CRUD
  createOrderDraft(data: InsertOrderDraft): Promise<OrderDraft>;
  getOrderDraft(orderId: string): Promise<OrderDraft | undefined>;
  getOrderDraftById(id: number): Promise<OrderDraft | undefined>;
  updateOrderDraft(orderId: string, data: Partial<InsertOrderDraft>): Promise<OrderDraft>;
  deleteOrderDraft(orderId: string): Promise<void>;
  getAllOrderDrafts(): Promise<OrderDraft[]>;
  getLastOrderId(): Promise<string>;
  getAllOrders(): Promise<OrderDraft[]>;
  
  // Forms CRUD
  getAllForms(): Promise<Form[]>;
  getForm(id: number): Promise<Form | undefined>;
  createForm(data: InsertForm): Promise<Form>;
  updateForm(id: number, data: Partial<InsertForm>): Promise<Form>;
  deleteForm(id: number): Promise<void>;
  
  // Form Submissions CRUD
  getAllFormSubmissions(formId?: number): Promise<FormSubmission[]>;
  getFormSubmission(id: number): Promise<FormSubmission | undefined>;
  createFormSubmission(data: InsertFormSubmission): Promise<FormSubmission>;
  deleteFormSubmission(id: number): Promise<void>;
  
  // Inventory Items CRUD
  getAllInventoryItems(): Promise<InventoryItem[]>;
  getInventoryItem(id: number): Promise<InventoryItem | undefined>;
  getInventoryItemByCode(code: string): Promise<InventoryItem | undefined>;
  createInventoryItem(data: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: number, data: Partial<InsertInventoryItem>): Promise<InventoryItem>;
  deleteInventoryItem(id: number): Promise<void>;
  
  // Inventory Scans CRUD
  getAllInventoryScans(): Promise<InventoryScan[]>;
  getInventoryScan(id: number): Promise<InventoryScan | undefined>;
  createInventoryScan(data: InsertInventoryScan): Promise<InventoryScan>;
  deleteInventoryScan(id: number): Promise<void>;
  
  // Employees CRUD
  getAllEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  getEmployeesByRole(role: string): Promise<Employee[]>;
  createEmployee(data: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee>;
  deleteEmployee(id: number): Promise<void>;
  
  // QC Definitions CRUD
  getQCDefinitions(line?: string, department?: string, final?: boolean): Promise<QcDefinition[]>;
  getQCDefinition(id: number): Promise<QcDefinition | undefined>;
  createQCDefinition(data: InsertQcDefinition): Promise<QcDefinition>;
  updateQCDefinition(id: number, data: Partial<InsertQcDefinition>): Promise<QcDefinition>;
  deleteQCDefinition(id: number): Promise<void>;
  
  // QC Submissions CRUD
  getQCSubmissions(status?: string): Promise<QcSubmission[]>;
  getQCSubmission(id: number): Promise<QcSubmission | undefined>;
  createQCSubmission(data: InsertQcSubmission): Promise<QcSubmission>;
  updateQCSubmission(id: number, data: Partial<InsertQcSubmission>): Promise<QcSubmission>;
  deleteQCSubmission(id: number): Promise<void>;
  
  // Maintenance Schedules CRUD
  getAllMaintenanceSchedules(): Promise<MaintenanceSchedule[]>;
  getMaintenanceSchedule(id: number): Promise<MaintenanceSchedule | undefined>;
  createMaintenanceSchedule(data: InsertMaintenanceSchedule): Promise<MaintenanceSchedule>;
  updateMaintenanceSchedule(id: number, data: Partial<InsertMaintenanceSchedule>): Promise<MaintenanceSchedule>;
  deleteMaintenanceSchedule(id: number): Promise<void>;
  
  // Maintenance Logs CRUD
  getAllMaintenanceLogs(): Promise<MaintenanceLog[]>;
  getMaintenanceLog(id: number): Promise<MaintenanceLog | undefined>;
  createMaintenanceLog(data: InsertMaintenanceLog): Promise<MaintenanceLog>;
  updateMaintenanceLog(id: number, data: Partial<InsertMaintenanceLog>): Promise<MaintenanceLog>;
  deleteMaintenanceLog(id: number): Promise<void>;

  // Time Clock CRUD
  getTimeClockStatus(employeeId: string): Promise<{ status: 'IN' | 'OUT'; clockIn: string | null; clockOut: string | null }>;
  clockIn(employeeId: string, timestamp: string): Promise<void>;
  clockOut(employeeId: string, timestamp: string): Promise<void>;
  getTimeClockEntries(employeeId?: string, date?: string): Promise<TimeClockEntry[]>;
  createTimeClockEntry(data: InsertTimeClockEntry): Promise<TimeClockEntry>;
  updateTimeClockEntry(id: number, data: Partial<InsertTimeClockEntry>): Promise<TimeClockEntry>;
  deleteTimeClockEntry(id: number): Promise<void>;

  // Checklist CRUD
  getChecklistItems(employeeId: string, date: string): Promise<ChecklistItem[]>;
  createChecklistItem(data: InsertChecklistItem): Promise<ChecklistItem>;
  updateChecklistItem(id: number, data: Partial<InsertChecklistItem>): Promise<ChecklistItem>;
  completeChecklist(employeeId: string, date: string, items: ChecklistItem[]): Promise<void>;

  // Onboarding Docs CRUD
  getOnboardingDocs(employeeId: string): Promise<OnboardingDoc[]>;
  createOnboardingDoc(data: InsertOnboardingDoc): Promise<OnboardingDoc>;
  signOnboardingDoc(id: number, signatureDataURL: string): Promise<OnboardingDoc>;
  updateOnboardingDoc(id: number, data: Partial<InsertOnboardingDoc>): Promise<OnboardingDoc>;

  // Module 8: Customers CRUD
  getAllCustomers(): Promise<Customer[]>;
  searchCustomers(query: string): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(data: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;

  // Module 8: Customer Addresses CRUD
  getCustomerAddresses(customerId: string): Promise<CustomerAddress[]>;
  createCustomerAddress(data: InsertCustomerAddress): Promise<CustomerAddress>;
  updateCustomerAddress(id: number, data: Partial<InsertCustomerAddress>): Promise<CustomerAddress>;
  deleteCustomerAddress(id: number): Promise<void>;

  // Module 8: Communication Logs CRUD
  getCommunicationLogs(orderId: string): Promise<CommunicationLog[]>;
  createCommunicationLog(data: InsertCommunicationLog): Promise<CommunicationLog>;
  updateCommunicationLog(id: number, data: Partial<InsertCommunicationLog>): Promise<CommunicationLog>;

  // Module 8: PDF Documents CRUD
  getPdfDocuments(orderId: string): Promise<PdfDocument[]>;
  createPdfDocument(data: InsertPdfDocument): Promise<PdfDocument>;
  updatePdfDocument(id: number, data: Partial<InsertPdfDocument>): Promise<PdfDocument>;

}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async saveCSVData(data: InsertCSVData): Promise<CSVData> {
    const [result] = await db
      .insert(csvData)
      .values(data)
      .returning();
    return result;
  }

  async getLatestCSVData(): Promise<CSVData | undefined> {
    const [result] = await db
      .select()
      .from(csvData)
      .orderBy(desc(csvData.uploadedAt))
      .limit(1);
    return result || undefined;
  }

  async clearCSVData(): Promise<void> {
    await db.delete(csvData);
  }

  // Customer Types CRUD
  async getAllCustomerTypes(): Promise<CustomerType[]> {
    return await db.select().from(customerTypes).orderBy(customerTypes.name);
  }

  async getCustomerType(id: number): Promise<CustomerType | undefined> {
    const [result] = await db.select().from(customerTypes).where(eq(customerTypes.id, id));
    return result || undefined;
  }

  async createCustomerType(data: InsertCustomerType): Promise<CustomerType> {
    const [result] = await db.insert(customerTypes).values(data).returning();
    return result;
  }

  async updateCustomerType(id: number, data: Partial<InsertCustomerType>): Promise<CustomerType> {
    const [result] = await db
      .update(customerTypes)
      .set(data)
      .where(eq(customerTypes.id, id))
      .returning();
    return result;
  }

  async deleteCustomerType(id: number): Promise<void> {
    await db.delete(customerTypes).where(eq(customerTypes.id, id));
  }

  // Persistent Discounts CRUD
  async getAllPersistentDiscounts(): Promise<PersistentDiscount[]> {
    return await db.select().from(persistentDiscounts).where(eq(persistentDiscounts.isActive, 1));
  }

  async getPersistentDiscount(id: number): Promise<PersistentDiscount | undefined> {
    const [result] = await db.select().from(persistentDiscounts).where(eq(persistentDiscounts.id, id));
    return result || undefined;
  }

  async createPersistentDiscount(data: InsertPersistentDiscount): Promise<PersistentDiscount> {
    const [result] = await db.insert(persistentDiscounts).values(data).returning();
    return result;
  }

  async updatePersistentDiscount(id: number, data: Partial<InsertPersistentDiscount>): Promise<PersistentDiscount> {
    const [result] = await db
      .update(persistentDiscounts)
      .set(data)
      .where(eq(persistentDiscounts.id, id))
      .returning();
    return result;
  }

  async deletePersistentDiscount(id: number): Promise<void> {
    await db.delete(persistentDiscounts).where(eq(persistentDiscounts.id, id));
  }

  // Short Term Sales CRUD
  async getAllShortTermSales(): Promise<ShortTermSale[]> {
    return await db.select().from(shortTermSales).where(eq(shortTermSales.isActive, 1)).orderBy(desc(shortTermSales.createdAt));
  }

  async getShortTermSale(id: number): Promise<ShortTermSale | undefined> {
    const [result] = await db.select().from(shortTermSales).where(eq(shortTermSales.id, id));
    return result || undefined;
  }

  async createShortTermSale(data: InsertShortTermSale): Promise<ShortTermSale> {
    const [result] = await db.insert(shortTermSales).values(data).returning();
    return result;
  }

  async updateShortTermSale(id: number, data: Partial<InsertShortTermSale>): Promise<ShortTermSale> {
    const [result] = await db
      .update(shortTermSales)
      .set(data)
      .where(eq(shortTermSales.id, id))
      .returning();
    return result;
  }

  async deleteShortTermSale(id: number): Promise<void> {
    await db.delete(shortTermSales).where(eq(shortTermSales.id, id));
  }

  // Feature Categories CRUD
  async getAllFeatureCategories(): Promise<FeatureCategory[]> {
    return await db.select().from(featureCategories).orderBy(featureCategories.sortOrder);
  }

  async getFeatureCategory(id: string): Promise<FeatureCategory | undefined> {
    const [category] = await db.select().from(featureCategories).where(eq(featureCategories.id, id));
    return category || undefined;
  }

  async createFeatureCategory(data: InsertFeatureCategory): Promise<FeatureCategory> {
    // Generate ID from name if not provided
    const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const categoryData = { ...data, id };
    const [category] = await db.insert(featureCategories).values(categoryData).returning();
    return category;
  }

  async updateFeatureCategory(id: string, data: Partial<InsertFeatureCategory>): Promise<FeatureCategory> {
    const [category] = await db.update(featureCategories)
      .set(data)
      .where(eq(featureCategories.id, id))
      .returning();
    return category;
  }

  async deleteFeatureCategory(id: string): Promise<void> {
    // Check if any features are using this category
    const relatedFeatures = await db.select().from(features).where(eq(features.category, id));
    if (relatedFeatures.length > 0) {
      throw new Error(`Cannot delete category. ${relatedFeatures.length} features are still using this category. Please delete or reassign those features first.`);
    }
    
    // Check if any sub-categories are using this category
    const relatedSubCategories = await db.select().from(featureSubCategories).where(eq(featureSubCategories.categoryId, id));
    if (relatedSubCategories.length > 0) {
      throw new Error(`Cannot delete category. ${relatedSubCategories.length} sub-categories are still using this category. Please delete or reassign those sub-categories first.`);
    }
    
    await db.delete(featureCategories).where(eq(featureCategories.id, id));
  }

  // Feature Sub-Categories CRUD
  async getAllFeatureSubCategories(): Promise<FeatureSubCategory[]> {
    return await db.select().from(featureSubCategories).orderBy(featureSubCategories.sortOrder);
  }

  async getFeatureSubCategory(id: string): Promise<FeatureSubCategory | undefined> {
    const [subCategory] = await db.select().from(featureSubCategories).where(eq(featureSubCategories.id, id));
    return subCategory || undefined;
  }

  async createFeatureSubCategory(data: InsertFeatureSubCategory): Promise<FeatureSubCategory> {
    // Generate ID from name if not provided
    const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const subCategoryData = { ...data, id };
    const [subCategory] = await db.insert(featureSubCategories).values(subCategoryData).returning();
    return subCategory;
  }

  async updateFeatureSubCategory(id: string, data: Partial<InsertFeatureSubCategory>): Promise<FeatureSubCategory> {
    const [subCategory] = await db.update(featureSubCategories)
      .set(data)
      .where(eq(featureSubCategories.id, id))
      .returning();
    return subCategory;
  }

  async deleteFeatureSubCategory(id: string): Promise<void> {
    await db.delete(featureSubCategories).where(eq(featureSubCategories.id, id));
  }

  // Features CRUD
  async getAllFeatures(): Promise<Feature[]> {
    return await db.select().from(features).orderBy(features.sortOrder);
  }

  async getFeature(id: string): Promise<Feature | undefined> {
    const [feature] = await db.select().from(features).where(eq(features.id, id));
    return feature || undefined;
  }

  async createFeature(data: InsertFeature): Promise<Feature> {
    // Generate ID from name if not provided
    const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const featureData = { ...data, id };
    const [feature] = await db.insert(features).values(featureData).returning();
    return feature;
  }

  async updateFeature(id: string, data: Partial<InsertFeature>): Promise<Feature> {
    const [feature] = await db.update(features)
      .set(data)
      .where(eq(features.id, id))
      .returning();
    return feature;
  }

  async deleteFeature(id: string): Promise<void> {
    await db.delete(features).where(eq(features.id, id));
  }
  
  // Stock Models CRUD
  async getAllStockModels(): Promise<StockModel[]> {
    return await db.select().from(stockModels).orderBy(stockModels.sortOrder);
  }

  async getStockModel(id: string): Promise<StockModel | undefined> {
    const [stockModel] = await db.select().from(stockModels).where(eq(stockModels.id, id));
    return stockModel || undefined;
  }

  async createStockModel(data: InsertStockModel): Promise<StockModel> {
    // Generate ID from name if not provided
    const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const stockModelData = { ...data, id };
    const [stockModel] = await db.insert(stockModels).values(stockModelData).returning();
    return stockModel;
  }

  async updateStockModel(id: string, data: Partial<InsertStockModel>): Promise<StockModel> {
    const [stockModel] = await db.update(stockModels)
      .set(data)
      .where(eq(stockModels.id, id))
      .returning();
    return stockModel;
  }

  async deleteStockModel(id: string): Promise<void> {
    await db.delete(stockModels).where(eq(stockModels.id, id));
  }

  // Order Drafts CRUD
  async createOrderDraft(data: InsertOrderDraft): Promise<OrderDraft> {
    const [draft] = await db.insert(orderDrafts).values(data).returning();
    return draft;
  }

  async getOrderDraft(orderId: string): Promise<OrderDraft | undefined> {
    const [draft] = await db.select().from(orderDrafts).where(eq(orderDrafts.orderId, orderId));
    return draft || undefined;
  }

  async getOrderDraftById(id: number): Promise<OrderDraft | undefined> {
    const [draft] = await db.select().from(orderDrafts).where(eq(orderDrafts.id, id));
    return draft || undefined;
  }

  async updateOrderDraft(orderId: string, data: Partial<InsertOrderDraft>): Promise<OrderDraft> {
    const [draft] = await db.update(orderDrafts)
      .set(data)
      .where(eq(orderDrafts.orderId, orderId))
      .returning();
    return draft;
  }

  async deleteOrderDraft(orderId: string): Promise<void> {
    await db.delete(orderDrafts).where(eq(orderDrafts.orderId, orderId));
  }

  async getAllOrderDrafts(): Promise<OrderDraft[]> {
    return await db.select().from(orderDrafts).orderBy(desc(orderDrafts.updatedAt));
  }

  async getLastOrderId(): Promise<string> {
    // Get the most recent order draft by order ID
    const [lastOrder] = await db.select().from(orderDrafts).orderBy(desc(orderDrafts.createdAt)).limit(1);
    return lastOrder?.orderId || '';
  }

  async getAllOrders(): Promise<OrderDraft[]> {
    return await db.select().from(orderDrafts).orderBy(desc(orderDrafts.updatedAt));
  }

  // Forms CRUD
  async getAllForms(): Promise<Form[]> {
    return await db.select().from(forms).orderBy(desc(forms.updatedAt));
  }

  async getForm(id: number): Promise<Form | undefined> {
    const [form] = await db.select().from(forms).where(eq(forms.id, id));
    return form || undefined;
  }

  async createForm(data: InsertForm): Promise<Form> {
    const [form] = await db.insert(forms).values(data).returning();
    return form;
  }

  async updateForm(id: number, data: Partial<InsertForm>): Promise<Form> {
    const [form] = await db.update(forms)
      .set(data)
      .where(eq(forms.id, id))
      .returning();
    return form;
  }

  async deleteForm(id: number): Promise<void> {
    await db.delete(forms).where(eq(forms.id, id));
  }

  // Form Submissions CRUD
  async getAllFormSubmissions(formId?: number): Promise<FormSubmission[]> {
    if (formId) {
      return await db.select().from(formSubmissions)
        .where(eq(formSubmissions.formId, formId))
        .orderBy(desc(formSubmissions.createdAt));
    }
    return await db.select().from(formSubmissions).orderBy(desc(formSubmissions.createdAt));
  }

  async getFormSubmission(id: number): Promise<FormSubmission | undefined> {
    const [submission] = await db.select().from(formSubmissions).where(eq(formSubmissions.id, id));
    return submission || undefined;
  }

  async createFormSubmission(data: InsertFormSubmission): Promise<FormSubmission> {
    const [submission] = await db.insert(formSubmissions).values(data).returning();
    return submission;
  }

  async deleteFormSubmission(id: number): Promise<void> {
    await db.delete(formSubmissions).where(eq(formSubmissions.id, id));
  }

  // Inventory Items CRUD
  async getAllInventoryItems(): Promise<InventoryItem[]> {
    return await db.select().from(inventoryItems).where(eq(inventoryItems.isActive, true)).orderBy(inventoryItems.name);
  }

  async getInventoryItem(id: number): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    return item || undefined;
  }

  async getInventoryItemByCode(code: string): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.code, code));
    return item || undefined;
  }

  async createInventoryItem(data: InsertInventoryItem): Promise<InventoryItem> {
    const [item] = await db.insert(inventoryItems).values(data).returning();
    return item;
  }

  async updateInventoryItem(id: number, data: Partial<InsertInventoryItem>): Promise<InventoryItem> {
    const [item] = await db.update(inventoryItems)
      .set(data)
      .where(eq(inventoryItems.id, id))
      .returning();
    return item;
  }

  async deleteInventoryItem(id: number): Promise<void> {
    await db.update(inventoryItems)
      .set({ isActive: false })
      .where(eq(inventoryItems.id, id));
  }

  // Inventory Scans CRUD
  async getAllInventoryScans(): Promise<InventoryScan[]> {
    return await db.select().from(inventoryScans).orderBy(desc(inventoryScans.scannedAt));
  }

  async getInventoryScan(id: number): Promise<InventoryScan | undefined> {
    const [scan] = await db.select().from(inventoryScans).where(eq(inventoryScans.id, id));
    return scan || undefined;
  }

  async createInventoryScan(data: InsertInventoryScan): Promise<InventoryScan> {
    const [scan] = await db.insert(inventoryScans).values(data).returning();
    
    // Update inventory item quantity when scan is recorded
    const item = await this.getInventoryItemByCode(data.itemCode);
    if (item) {
      // Increase on-hand quantity by the scanned quantity
      const newOnHand = item.onHand + data.quantity;
      const newAvailable = newOnHand - item.committed;
      
      await db.update(inventoryItems)
        .set({ 
          onHand: newOnHand,
          available: newAvailable
        })
        .where(eq(inventoryItems.id, item.id));
    }
    
    return scan;
  }

  async deleteInventoryScan(id: number): Promise<void> {
    await db.delete(inventoryScans).where(eq(inventoryScans.id, id));
  }

  // Employees CRUD
  async getAllEmployees(): Promise<Employee[]> {
    return await db.select().from(employees).where(eq(employees.isActive, true)).orderBy(employees.name);
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const [employee] = await db.select().from(employees).where(eq(employees.id, id));
    return employee || undefined;
  }

  async getEmployeesByRole(role: string): Promise<Employee[]> {
    return await db.select().from(employees)
      .where(eq(employees.role, role))
      .orderBy(employees.name);
  }

  async createEmployee(data: InsertEmployee): Promise<Employee> {
    const [employee] = await db.insert(employees).values(data).returning();
    return employee;
  }

  async updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee> {
    const [employee] = await db.update(employees)
      .set(data)
      .where(eq(employees.id, id))
      .returning();
    return employee;
  }

  async deleteEmployee(id: number): Promise<void> {
    await db.update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, id));
  }

  // QC Definitions CRUD
  async getQCDefinitions(line?: string, department?: string, final?: boolean): Promise<QcDefinition[]> {
    let query = db.select().from(qcDefinitions);
    
    const conditions = [];
    if (line) conditions.push(eq(qcDefinitions.line, line));
    if (department) conditions.push(eq(qcDefinitions.department, department));
    if (final !== undefined) conditions.push(eq(qcDefinitions.final, final));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return await query.orderBy(qcDefinitions.sortOrder);
  }

  async getQCDefinition(id: number): Promise<QcDefinition | undefined> {
    const [definition] = await db.select().from(qcDefinitions).where(eq(qcDefinitions.id, id));
    return definition || undefined;
  }

  async createQCDefinition(data: InsertQcDefinition): Promise<QcDefinition> {
    const [definition] = await db.insert(qcDefinitions).values(data).returning();
    return definition;
  }

  async updateQCDefinition(id: number, data: Partial<InsertQcDefinition>): Promise<QcDefinition> {
    const [definition] = await db.update(qcDefinitions)
      .set(data)
      .where(eq(qcDefinitions.id, id))
      .returning();
    return definition;
  }

  async deleteQCDefinition(id: number): Promise<void> {
    await db.delete(qcDefinitions).where(eq(qcDefinitions.id, id));
  }

  // QC Submissions CRUD
  async getQCSubmissions(status?: string): Promise<QcSubmission[]> {
    let query = db.select().from(qcSubmissions);
    
    if (status) {
      query = query.where(eq(qcSubmissions.status, status));
    }
    
    return await query.orderBy(desc(qcSubmissions.submittedAt));
  }

  async getQCSubmission(id: number): Promise<QcSubmission | undefined> {
    const [submission] = await db.select().from(qcSubmissions).where(eq(qcSubmissions.id, id));
    return submission || undefined;
  }

  async createQCSubmission(data: InsertQcSubmission): Promise<QcSubmission> {
    const [submission] = await db.insert(qcSubmissions).values(data).returning();
    return submission;
  }

  async updateQCSubmission(id: number, data: Partial<InsertQcSubmission>): Promise<QcSubmission> {
    const [submission] = await db.update(qcSubmissions)
      .set(data)
      .where(eq(qcSubmissions.id, id))
      .returning();
    return submission;
  }

  async deleteQCSubmission(id: number): Promise<void> {
    await db.delete(qcSubmissions).where(eq(qcSubmissions.id, id));
  }

  // Maintenance Schedules CRUD
  async getAllMaintenanceSchedules(): Promise<MaintenanceSchedule[]> {
    return await db.select().from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.isActive, true))
      .orderBy(maintenanceSchedules.startDate);
  }

  async getMaintenanceSchedule(id: number): Promise<MaintenanceSchedule | undefined> {
    const [schedule] = await db.select().from(maintenanceSchedules).where(eq(maintenanceSchedules.id, id));
    return schedule || undefined;
  }

  async createMaintenanceSchedule(data: InsertMaintenanceSchedule): Promise<MaintenanceSchedule> {
    const [schedule] = await db.insert(maintenanceSchedules).values(data).returning();
    return schedule;
  }

  async updateMaintenanceSchedule(id: number, data: Partial<InsertMaintenanceSchedule>): Promise<MaintenanceSchedule> {
    const [schedule] = await db.update(maintenanceSchedules)
      .set(data)
      .where(eq(maintenanceSchedules.id, id))
      .returning();
    return schedule;
  }

  async deleteMaintenanceSchedule(id: number): Promise<void> {
    await db.update(maintenanceSchedules)
      .set({ isActive: false })
      .where(eq(maintenanceSchedules.id, id));
  }

  // Maintenance Logs CRUD
  async getAllMaintenanceLogs(): Promise<MaintenanceLog[]> {
    return await db.select().from(maintenanceLogs).orderBy(desc(maintenanceLogs.completedAt));
  }

  async getMaintenanceLog(id: number): Promise<MaintenanceLog | undefined> {
    const [log] = await db.select().from(maintenanceLogs).where(eq(maintenanceLogs.id, id));
    return log || undefined;
  }

  async createMaintenanceLog(data: InsertMaintenanceLog): Promise<MaintenanceLog> {
    const [log] = await db.insert(maintenanceLogs).values(data).returning();
    return log;
  }

  async updateMaintenanceLog(id: number, data: Partial<InsertMaintenanceLog>): Promise<MaintenanceLog> {
    const [log] = await db.update(maintenanceLogs)
      .set(data)
      .where(eq(maintenanceLogs.id, id))
      .returning();
    return log;
  }

  async deleteMaintenanceLog(id: number): Promise<void> {
    await db.delete(maintenanceLogs).where(eq(maintenanceLogs.id, id));
  }

  // Time Clock CRUD
  async getTimeClockStatus(employeeId: string): Promise<{ status: 'IN' | 'OUT'; clockIn: string | null; clockOut: string | null }> {
    const today = new Date().toISOString().split('T')[0];
    const [entry] = await db
      .select()
      .from(timeClockEntries)
      .where(and(eq(timeClockEntries.employeeId, employeeId), eq(timeClockEntries.date, today)))
      .orderBy(desc(timeClockEntries.id))
      .limit(1);
    
    if (!entry) {
      return { status: 'OUT', clockIn: null, clockOut: null };
    }
    
    return {
      status: entry.clockOut ? 'OUT' : 'IN',
      clockIn: entry.clockIn?.toISOString() || null,
      clockOut: entry.clockOut?.toISOString() || null
    };
  }

  async clockIn(employeeId: string, timestamp: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const clockInTime = new Date(timestamp);
    
    // Check if entry already exists for today
    const [existing] = await db
      .select()
      .from(timeClockEntries)
      .where(and(eq(timeClockEntries.employeeId, employeeId), eq(timeClockEntries.date, today)))
      .orderBy(desc(timeClockEntries.id))
      .limit(1);
    
    if (existing) {
      // Update existing entry
      await db.update(timeClockEntries)
        .set({ clockIn: clockInTime, clockOut: null })
        .where(eq(timeClockEntries.id, existing.id));
    } else {
      // Create new entry
      await db.insert(timeClockEntries).values({
        employeeId,
        clockIn: clockInTime,
        clockOut: null,
        date: today
      });
    }
  }

  async clockOut(employeeId: string, timestamp: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const clockOutTime = new Date(timestamp);
    
    const [existing] = await db
      .select()
      .from(timeClockEntries)
      .where(and(eq(timeClockEntries.employeeId, employeeId), eq(timeClockEntries.date, today)))
      .orderBy(desc(timeClockEntries.id))
      .limit(1);
    
    if (existing) {
      await db.update(timeClockEntries)
        .set({ clockOut: clockOutTime })
        .where(eq(timeClockEntries.id, existing.id));
    }
  }

  async getTimeClockEntries(employeeId?: string, date?: string): Promise<TimeClockEntry[]> {
    let query = db.select().from(timeClockEntries);
    
    if (employeeId && date) {
      query = query.where(and(eq(timeClockEntries.employeeId, employeeId), eq(timeClockEntries.date, date)));
    } else if (employeeId) {
      query = query.where(eq(timeClockEntries.employeeId, employeeId));
    } else if (date) {
      query = query.where(eq(timeClockEntries.date, date));
    }
    
    return await query.orderBy(desc(timeClockEntries.date));
  }

  async createTimeClockEntry(data: InsertTimeClockEntry): Promise<TimeClockEntry> {
    // Normalize the date to YYYY-MM-DD format
    const normalizedData = {
      ...data,
      date: typeof data.date === 'string' ? data.date : new Date(data.date).toISOString().split('T')[0]
    };
    const [entry] = await db.insert(timeClockEntries).values(normalizedData).returning();
    return entry;
  }

  async updateTimeClockEntry(id: number, data: Partial<InsertTimeClockEntry>): Promise<TimeClockEntry> {
    // Normalize the date to YYYY-MM-DD format if provided
    const normalizedData = data.date ? {
      ...data,
      date: typeof data.date === 'string' ? data.date : new Date(data.date).toISOString().split('T')[0]
    } : data;
    
    const [entry] = await db.update(timeClockEntries)
      .set(normalizedData)
      .where(eq(timeClockEntries.id, id))
      .returning();
    return entry;
  }

  async deleteTimeClockEntry(id: number): Promise<void> {
    await db.delete(timeClockEntries).where(eq(timeClockEntries.id, id));
  }

  // Checklist CRUD
  async getChecklistItems(employeeId: string, date: string): Promise<ChecklistItem[]> {
    const items = await db
      .select()
      .from(checklistItems)
      .where(and(eq(checklistItems.employeeId, employeeId), eq(checklistItems.date, date)))
      .orderBy(checklistItems.id);
    
    // If no items exist for today, create default checklist items
    if (items.length === 0) {
      const defaultItems = [
        { employeeId, date, label: 'Review safety procedures', type: 'checkbox', required: true },
        { employeeId, date, label: 'Check equipment status', type: 'dropdown', options: ['Good', 'Needs Attention', 'Broken'], required: true },
        { employeeId, date, label: 'Work area cleanliness', type: 'dropdown', options: ['Clean', 'Needs Cleaning', 'Deep Clean Required'], required: true },
        { employeeId, date, label: 'Special notes', type: 'text', required: false }
      ];
      
      const createdItems = [];
      for (const item of defaultItems) {
        const [created] = await db.insert(checklistItems).values(item).returning();
        createdItems.push(created);
      }
      return createdItems;
    }
    
    return items;
  }

  async createChecklistItem(data: InsertChecklistItem): Promise<ChecklistItem> {
    const [item] = await db.insert(checklistItems).values(data).returning();
    return item;
  }

  async updateChecklistItem(id: number, data: Partial<InsertChecklistItem>): Promise<ChecklistItem> {
    const [item] = await db.update(checklistItems)
      .set(data)
      .where(eq(checklistItems.id, id))
      .returning();
    return item;
  }

  async completeChecklist(employeeId: string, date: string, items: ChecklistItem[]): Promise<void> {
    // Update all items with their values
    for (const item of items) {
      await db.update(checklistItems)
        .set({ value: item.value })
        .where(eq(checklistItems.id, item.id));
    }
  }

  // Onboarding Docs CRUD
  async getOnboardingDocs(employeeId: string): Promise<OnboardingDoc[]> {
    let docs = await db
      .select()
      .from(onboardingDocs)
      .where(eq(onboardingDocs.employeeId, employeeId))
      .orderBy(onboardingDocs.id);
    
    // If no docs exist, create default onboarding documents
    if (docs.length === 0) {
      const defaultDocs = [
        { employeeId, title: 'Employee Handbook', url: '/docs/employee-handbook.pdf', signed: false },
        { employeeId, title: 'Safety Training Manual', url: '/docs/safety-training.pdf', signed: false },
        { employeeId, title: 'Code of Conduct', url: '/docs/code-of-conduct.pdf', signed: false },
        { employeeId, title: 'Emergency Procedures', url: '/docs/emergency-procedures.pdf', signed: false }
      ];
      
      const createdDocs = [];
      for (const doc of defaultDocs) {
        const [created] = await db.insert(onboardingDocs).values(doc).returning();
        createdDocs.push(created);
      }
      return createdDocs;
    }
    
    return docs;
  }

  async createOnboardingDoc(data: InsertOnboardingDoc): Promise<OnboardingDoc> {
    const [doc] = await db.insert(onboardingDocs).values(data).returning();
    return doc;
  }

  async signOnboardingDoc(id: number, signatureDataURL: string): Promise<OnboardingDoc> {
    const [doc] = await db.update(onboardingDocs)
      .set({ 
        signed: true, 
        signatureDataURL, 
        signedAt: new Date() 
      })
      .where(eq(onboardingDocs.id, id))
      .returning();
    return doc;
  }

  async updateOnboardingDoc(id: number, data: Partial<InsertOnboardingDoc>): Promise<OnboardingDoc> {
    const [doc] = await db.update(onboardingDocs)
      .set(data)
      .where(eq(onboardingDocs.id, id))
      .returning();
    return doc;
  }

  // Module 8: Customers CRUD
  async getAllCustomers(): Promise<Customer[]> {
    return await db
      .select()
      .from(customers)
      .where(eq(customers.isActive, true))
      .orderBy(customers.name);
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    return await db
      .select()
      .from(customers)
      .where(and(
        eq(customers.isActive, true),
        // Search by name or company
        or(
          ilike(customers.name, `%${query}%`),
          ilike(customers.company, `%${query}%`)
        )
      ))
      .orderBy(customers.name)
      .limit(10);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    return customer;
  }

  async createCustomer(data: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(data).returning();
    return customer;
  }

  async updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer> {
    const [customer] = await db.update(customers)
      .set(data)
      .where(eq(customers.id, id))
      .returning();
    return customer;
  }

  async deleteCustomer(id: number): Promise<void> {
    // Soft delete - just mark as inactive
    await db.update(customers)
      .set({ isActive: false })
      .where(eq(customers.id, id));
  }

  // Module 8: Customer Addresses CRUD
  async getCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
    return await db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customerId))
      .orderBy(customerAddresses.isDefault, customerAddresses.id);
  }

  async createCustomerAddress(data: InsertCustomerAddress): Promise<CustomerAddress> {
    const [address] = await db.insert(customerAddresses).values(data).returning();
    return address;
  }

  async updateCustomerAddress(id: number, data: Partial<InsertCustomerAddress>): Promise<CustomerAddress> {
    const [address] = await db.update(customerAddresses)
      .set(data)
      .where(eq(customerAddresses.id, id))
      .returning();
    return address;
  }

  async deleteCustomerAddress(id: number): Promise<void> {
    await db.delete(customerAddresses).where(eq(customerAddresses.id, id));
  }

  // Module 8: Communication Logs CRUD
  async getCommunicationLogs(orderId: string): Promise<CommunicationLog[]> {
    return await db
      .select()
      .from(communicationLogs)
      .where(eq(communicationLogs.orderId, orderId))
      .orderBy(desc(communicationLogs.createdAt));
  }

  async createCommunicationLog(data: InsertCommunicationLog): Promise<CommunicationLog> {
    const [log] = await db.insert(communicationLogs).values(data).returning();
    return log;
  }

  async updateCommunicationLog(id: number, data: Partial<InsertCommunicationLog>): Promise<CommunicationLog> {
    const [log] = await db.update(communicationLogs)
      .set(data)
      .where(eq(communicationLogs.id, id))
      .returning();
    return log;
  }

  // Module 8: PDF Documents CRUD
  async getPdfDocuments(orderId: string): Promise<PdfDocument[]> {
    return await db
      .select()
      .from(pdfDocuments)
      .where(eq(pdfDocuments.orderId, orderId))
      .orderBy(desc(pdfDocuments.createdAt));
  }

  async createPdfDocument(data: InsertPdfDocument): Promise<PdfDocument> {
    const [doc] = await db.insert(pdfDocuments).values(data).returning();
    return doc;
  }

  async updatePdfDocument(id: number, data: Partial<InsertPdfDocument>): Promise<PdfDocument> {
    const [doc] = await db.update(pdfDocuments)
      .set(data)
      .where(eq(pdfDocuments.id, id))
      .returning();
    return doc;
  }

}

export const storage = new DatabaseStorage();
