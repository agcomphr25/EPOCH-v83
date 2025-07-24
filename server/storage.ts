import { 
  users, csvData, customerTypes, persistentDiscounts, shortTermSales, featureCategories, featureSubCategories, features, stockModels, orders, orderDrafts, forms, formSubmissions,
  inventoryItems, inventoryScans, partsRequests, employees, qcDefinitions, qcSubmissions, maintenanceSchedules, maintenanceLogs,
  timeClockEntries, checklistItems, onboardingDocs, customers, customerAddresses, communicationLogs, pdfDocuments,
  enhancedFormCategories, enhancedForms, enhancedFormVersions, enhancedFormSubmissions,
  purchaseOrders, purchaseOrderItems, productionOrders,
  p2Customers, p2PurchaseOrders, p2PurchaseOrderItems, p2ProductionOrders,
  molds, employeeLayupSettings, layupOrders, layupSchedule, bomDefinitions, bomItems, orderIdReservations,
  type User, type InsertUser, type Order, type InsertOrder, type CSVData, type InsertCSVData,
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
  type PartsRequest, type InsertPartsRequest,
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
  type EnhancedFormSubmission, type InsertEnhancedFormSubmission,
  type PurchaseOrder, type InsertPurchaseOrder,
  type PurchaseOrderItem, type InsertPurchaseOrderItem,
  type ProductionOrder, type InsertProductionOrder,
  type P2Customer, type InsertP2Customer,
  type P2PurchaseOrder, type InsertP2PurchaseOrder,
  type P2PurchaseOrderItem, type InsertP2PurchaseOrderItem,
  type P2ProductionOrder, type InsertP2ProductionOrder,
  type Mold, type InsertMold,
  type EmployeeLayupSettings, type InsertEmployeeLayupSettings,
  type LayupOrder, type InsertLayupOrder,
  type LayupSchedule, type InsertLayupSchedule,
  type BomDefinition, type InsertBomDefinition,
  type BomItem, type InsertBomItem,

} from "./schema";
import { db } from "./db";
import { eq, desc, and, or, ilike, isNull, sql, ne, like, lt, gt } from "drizzle-orm";
import { generateP1OrderId, getCurrentYearMonthPrefix, parseOrderId, formatOrderId } from "./utils/orderIdGenerator";

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
  
  // Order ID generation with atomic reservation system
  generateNextOrderId(): Promise<string>;
  markOrderIdAsUsed(orderId: string): Promise<void>;

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

  // Parts Requests CRUD
  getAllPartsRequests(): Promise<PartsRequest[]>;
  getPartsRequest(id: number): Promise<PartsRequest | undefined>;
  createPartsRequest(data: InsertPartsRequest): Promise<PartsRequest>;
  updatePartsRequest(id: number, data: Partial<InsertPartsRequest>): Promise<PartsRequest>;
  deletePartsRequest(id: number): Promise<void>;

  // Outstanding Orders
  getOutstandingOrders(): Promise<OrderDraft[]>;

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
  getAllAddresses(): Promise<CustomerAddress[]>;
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

  // Module 12: Purchase Orders CRUD
  getAllPurchaseOrders(): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: number, options?: { includeItems?: boolean; includeOrderCount?: boolean }): Promise<PurchaseOrder & { items?: PurchaseOrderItem[] } | undefined>;
  createPurchaseOrder(data: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: number, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder>;
  deletePurchaseOrder(id: number): Promise<void>;

  // P2 Customers CRUD
  getAllP2Customers(): Promise<P2Customer[]>;
  getP2Customer(id: number): Promise<P2Customer | undefined>;
  getP2CustomerByCustomerId(customerId: string): Promise<P2Customer | undefined>;
  createP2Customer(data: InsertP2Customer): Promise<P2Customer>;
  updateP2Customer(id: number, data: Partial<InsertP2Customer>): Promise<P2Customer>;
  deleteP2Customer(id: number): Promise<void>;

  // P2 Purchase Orders CRUD
  getAllP2PurchaseOrders(): Promise<P2PurchaseOrder[]>;
  getP2PurchaseOrder(id: number, options?: { includeItems?: boolean }): Promise<P2PurchaseOrder & { items?: P2PurchaseOrderItem[] } | undefined>;
  createP2PurchaseOrder(data: InsertP2PurchaseOrder): Promise<P2PurchaseOrder>;
  updateP2PurchaseOrder(id: number, data: Partial<InsertP2PurchaseOrder>): Promise<P2PurchaseOrder>;
  deleteP2PurchaseOrder(id: number): Promise<void>;

  // P2 Purchase Order Items CRUD
  getP2PurchaseOrderItems(poId: number): Promise<P2PurchaseOrderItem[]>;
  createP2PurchaseOrderItem(data: InsertP2PurchaseOrderItem): Promise<P2PurchaseOrderItem>;
  updateP2PurchaseOrderItem(id: number, data: Partial<InsertP2PurchaseOrderItem>): Promise<P2PurchaseOrderItem>;
  deleteP2PurchaseOrderItem(id: number): Promise<void>;

  // P2 Production Orders CRUD
  getAllP2ProductionOrders(): Promise<P2ProductionOrder[]>;
  getP2ProductionOrdersByPoId(poId: number): Promise<P2ProductionOrder[]>;
  getP2ProductionOrder(id: number): Promise<P2ProductionOrder | undefined>;
  createP2ProductionOrder(data: InsertP2ProductionOrder): Promise<P2ProductionOrder>;
  updateP2ProductionOrder(id: number, data: Partial<InsertP2ProductionOrder>): Promise<P2ProductionOrder>;
  deleteP2ProductionOrder(id: number): Promise<void>;
  generateP2ProductionOrders(poId: number): Promise<P2ProductionOrder[]>;

  // Purchase Order Items CRUD
  getPurchaseOrderItems(poId: number): Promise<PurchaseOrderItem[]>;
  createPurchaseOrderItem(data: InsertPurchaseOrderItem): Promise<PurchaseOrderItem>;
  updatePurchaseOrderItem(id: number, data: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem>;
  deletePurchaseOrderItem(id: number): Promise<void>;

  // Production Orders CRUD
  getAllProductionOrders(): Promise<ProductionOrder[]>;
  getProductionOrder(id: number): Promise<ProductionOrder | undefined>;
  getProductionOrderByOrderId(orderId: string): Promise<ProductionOrder | undefined>;
  createProductionOrder(data: InsertProductionOrder): Promise<ProductionOrder>;
  updateProductionOrder(id: number, data: Partial<InsertProductionOrder>): Promise<ProductionOrder>;
  deleteProductionOrder(id: number): Promise<void>;
  generateProductionOrders(poId: number): Promise<ProductionOrder[]>;

  // Layup Scheduler: Molds CRUD
  getAllMolds(): Promise<Mold[]>;
  getMold(moldId: string): Promise<Mold | undefined>;
  createMold(data: InsertMold): Promise<Mold>;
  updateMold(moldId: string, data: Partial<InsertMold>): Promise<Mold>;
  deleteMold(moldId: string): Promise<void>;

  // Layup Scheduler: Employee Settings CRUD
  getAllEmployeeLayupSettings(): Promise<(EmployeeLayupSettings & { name: string })[]>;
  getEmployeeLayupSettings(employeeId: string): Promise<EmployeeLayupSettings | undefined>;
  createEmployeeLayupSettings(data: InsertEmployeeLayupSettings): Promise<EmployeeLayupSettings>;
  updateEmployeeLayupSettings(employeeId: string, data: Partial<InsertEmployeeLayupSettings>): Promise<EmployeeLayupSettings>;
  deleteEmployeeLayupSettings(employeeId: string): Promise<void>;

  // Layup Scheduler: Orders CRUD
  getAllLayupOrders(filters?: { status?: string; department?: string }): Promise<LayupOrder[]>;
  getLayupOrder(orderId: string): Promise<LayupOrder | undefined>;
  createLayupOrder(data: InsertLayupOrder): Promise<LayupOrder>;
  updateLayupOrder(orderId: string, data: Partial<InsertLayupOrder>): Promise<LayupOrder>;
  deleteLayupOrder(orderId: string): Promise<void>;

  // Layup Scheduler: Schedule CRUD
  getAllLayupSchedule(): Promise<LayupSchedule[]>;
  getLayupScheduleByOrder(orderId: string): Promise<LayupSchedule[]>;
  createLayupSchedule(data: InsertLayupSchedule): Promise<LayupSchedule>;
  updateLayupSchedule(id: number, data: Partial<InsertLayupSchedule>): Promise<LayupSchedule>;
  deleteLayupSchedule(id: number): Promise<void>;
  overrideOrderSchedule(orderId: string, newDate: Date, moldId: string, overriddenBy?: string): Promise<LayupSchedule>;

  // Department Progression Methods
  getPipelineCounts(): Promise<Record<string, number>>;
  getPipelineDetails(): Promise<Record<string, Array<{ orderId: string; modelId: string; dueDate: Date; daysInDept: number; scheduleStatus: 'on-schedule' | 'at-risk' | 'behind' }>>>;
  progressOrder(orderId: string, nextDepartment?: string): Promise<OrderDraft>;
  scrapOrder(orderId: string, scrapData: { reason: string; disposition: string; authorization: string; scrapDate: Date }): Promise<OrderDraft>;
  createReplacementOrder(scrapOrderId: string): Promise<OrderDraft>;

  // BOM Management Methods
  getAllBOMs(): Promise<BomDefinition[]>;
  getBOMDetails(bomId: number): Promise<(BomDefinition & { items: BomItem[] }) | undefined>;
  createBOM(data: InsertBomDefinition): Promise<BomDefinition>;
  updateBOM(bomId: number, data: Partial<InsertBomDefinition>): Promise<BomDefinition>;
  deleteBOM(bomId: number): Promise<void>;
  addBOMItem(bomId: number, data: InsertBomItem): Promise<BomItem>;
  updateBOMItem(bomId: number, itemId: number, data: Partial<InsertBomItem>): Promise<BomItem>;
  deleteBOMItem(bomId: number, itemId: number): Promise<void>;




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
    const rawFeatures = await db.select().from(features).orderBy(features.sortOrder);

    // Parse JSON options field if it's a string
    return rawFeatures.map(feature => ({
      ...feature,
      options: typeof feature.options === 'string' 
        ? (feature.options ? JSON.parse(feature.options) : null)
        : feature.options
    }));
  }

  async getFeature(id: string): Promise<Feature | undefined> {
    const [feature] = await db.select().from(features).where(eq(features.id, id));
    if (!feature) return undefined;

    // Parse JSON options field if it's a string
    return {
      ...feature,
      options: typeof feature.options === 'string' 
        ? (feature.options ? JSON.parse(feature.options) : null)
        : feature.options
    };
  }

  async createFeature(data: InsertFeature): Promise<Feature> {
    // Generate ID from name if not provided
    const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const featureData = { ...data, id };
    const [feature] = await db.insert(features).values(featureData).returning();

    // Parse JSON options field if it's a string
    return {
      ...feature,
      options: typeof feature.options === 'string' 
        ? (feature.options ? JSON.parse(feature.options) : null)
        : feature.options
    };
  }

  async updateFeature(id: string, data: Partial<InsertFeature>): Promise<Feature> {
    const [feature] = await db.update(features)
      .set(data)
      .where(eq(features.id, id))
      .returning();

    // Parse JSON options field if it's a string
    return {
      ...feature,
      options: typeof feature.options === 'string' 
        ? (feature.options ? JSON.parse(feature.options) : null)
        : feature.options
    };
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
    let baseId = data.id || data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let id = baseId;
    let counter = 1;
    
    // Check for existing ID and increment if needed
    while (true) {
      try {
        const stockModelData = { ...data, id };
        const [stockModel] = await db.insert(stockModels).values(stockModelData).returning();
        return stockModel;
      } catch (error: any) {
        // If duplicate key error, try with incremented suffix
        if (error.code === '23505' && error.constraint === 'stock_models_pkey') {
          counter++;
          id = `${baseId}_${counter}`;
          continue;
        }
        // If it's a different error, throw it
        throw error;
      }
    }
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
    try {
      console.log('=== CREATING ORDER DRAFT ===');
      console.log('Data:', JSON.stringify(data, null, 2));
      
      // Generate barcode if not provided
      const dataWithBarcode = {
        ...data,
        barcode: data.barcode || `P1-${data.orderId}`
      };
      
      const [draft] = await db.insert(orderDrafts).values(dataWithBarcode).returning();
      console.log('Created draft:', draft.id);
      return draft;
    } catch (error) {
      console.error('Database error creating order draft:', error);
      throw new Error(`Failed to create order draft: ${error.message}`);
    }
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

    if (!draft) {
      throw new Error(`Draft order with ID ${orderId} not found`);
    }

    return draft;
  }

  async deleteOrderDraft(orderId: string): Promise<void> {
    await db.delete(orderDrafts).where(eq(orderDrafts.orderId, orderId));
  }

  async getAllOrderDrafts(): Promise<OrderDraft[]> {
    return await db.select().from(orderDrafts).orderBy(desc(orderDrafts.updatedAt));
  }

  async getLastOrderId(): Promise<string> {
    try {
      const result = await db
        .select({ orderId: orderDrafts.orderId })
        .from(orderDrafts)
        .orderBy(desc(orderDrafts.id))
        .limit(1);

      return result.length > 0 ? result[0].orderId : '';
    } catch (error) {
      console.error("Error getting last order ID:", error);
      return '';
    }
  }

  async generateNextOrderId(): Promise<string> {
    try {
      const now = new Date();
      const currentPrefix = getCurrentYearMonthPrefix(now);
      
      // Clean up expired reservations first (non-atomic, but helps keep table clean)
      try {
        await db.delete(orderIdReservations).where(
          and(
            eq(orderIdReservations.isUsed, false),
            lt(orderIdReservations.expiresAt, now)
          )
        );
      } catch (cleanupError) {
        console.warn('Cleanup error (non-critical):', cleanupError);
      }

      // Retry loop for handling race conditions
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          // Find the highest sequence number for current year-month prefix
          // Check both actual orders and active reservations
          const [orderResult, reservationResult] = await Promise.all([
            // Get highest sequence from actual orders
            db
              .select({ orderId: orderDrafts.orderId })
              .from(orderDrafts)
              .where(like(orderDrafts.orderId, `${currentPrefix}%`))
              .orderBy(desc(orderDrafts.orderId))
              .limit(1),
            
            // Get highest sequence from active reservations
            db
              .select({ sequenceNumber: orderIdReservations.sequenceNumber })
              .from(orderIdReservations)
              .where(
                and(
                  eq(orderIdReservations.yearMonthPrefix, currentPrefix),
                  eq(orderIdReservations.isUsed, false),
                  gt(orderIdReservations.expiresAt, now)
                )
              )
              .orderBy(desc(orderIdReservations.sequenceNumber))
              .limit(1)
          ]);

          let maxSequence = 0;

          // Check highest sequence from orders
          if (orderResult.length > 0) {
            const parsed = parseOrderId(orderResult[0].orderId);
            if (parsed && parsed.prefix === currentPrefix) {
              maxSequence = Math.max(maxSequence, parsed.sequence);
            }
          }

          // Check highest sequence from active reservations
          if (reservationResult.length > 0) {
            maxSequence = Math.max(maxSequence, reservationResult[0].sequenceNumber);
          }

          // Generate next sequence number
          const nextSequence = maxSequence + 1;
          const nextOrderId = formatOrderId(currentPrefix, nextSequence);

          // Atomically reserve the Order ID using INSERT (will fail if duplicate)
          const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
          
          await db.insert(orderIdReservations).values({
            orderId: nextOrderId,
            yearMonthPrefix: currentPrefix,
            sequenceNumber: nextSequence,
            reservedAt: now,
            expiresAt: expiresAt,
            isUsed: false,
          });

          console.log(`Reserved Order ID: ${nextOrderId} (expires: ${expiresAt.toISOString()})`);
          return nextOrderId;

        } catch (insertError: any) {
          // If unique constraint violation, retry with next sequence
          if (insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
            console.log(`Order ID conflict on attempt ${attempt + 1}, retrying...`);
            continue;
          }
          throw insertError;
        }
      }

      // If all retries failed, fall back to timestamp-based ID
      const fallbackId = currentPrefix + String(Date.now() % 10000).padStart(4, '0');
      console.warn(`All Order ID generation attempts failed, using fallback: ${fallbackId}`);
      return fallbackId;

    } catch (error) {
      console.error("Error in Order ID generation:", error);
      // Ultimate fallback
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const yearLetter = String.fromCharCode(65 + (year - 2025));
      const monthLetter = String.fromCharCode(65 + month);
      const fallbackId = yearLetter + monthLetter + String(Date.now() % 1000).padStart(3, '0');
      return fallbackId;
    }
  }

  async markOrderIdAsUsed(orderId: string): Promise<void> {
    try {
      await db
        .update(orderIdReservations)
        .set({
          isUsed: true,
          usedAt: new Date(),
        })
        .where(eq(orderIdReservations.orderId, orderId));
      
      console.log(`Marked Order ID as used: ${orderId}`);
    } catch (error) {
      console.error(`Error marking Order ID as used: ${orderId}`, error);
      // Don't throw - this is not critical for order creation
    }
  }

  // Cleanup expired reservations (call periodically)
  async cleanupExpiredReservations(): Promise<number> {
    try {
      const result = await db
        .delete(orderIdReservations)
        .where(
          and(
            eq(orderIdReservations.isUsed, false),
            lt(orderIdReservations.expiresAt, new Date())
          )
        );
      
      const count = result.rowCount || 0;
      if (count > 0) {
        console.log(`Cleaned up ${count} expired Order ID reservations`);
      }
      return count;
    } catch (error) {
      console.error('Error cleaning up expired reservations:', error);
      return 0;
    }
  }

  async getAllOrders(): Promise<OrderDraft[]> {
    // For now, return from orderDrafts table as it has the order data
    // In the future, this could be changed to use the main orders table
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

  async getInventoryItemByAgPartNumber(agPartNumber: string): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.agPartNumber, agPartNumber));
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
    await db.delete(inventoryItems)
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
    // Note: Inventory scans are now for tracking only, not affecting inventory levels
    // since the new inventory schema doesn't track onHand/committed quantities
    return scan;
  }

  async deleteInventoryScan(id: number): Promise<void> {
    await db.delete(inventoryScans).where(eq(inventoryScans.id, id));
  }

  // Parts Requests CRUD
  async getAllPartsRequests(): Promise<PartsRequest[]> {
    return await db.select().from(partsRequests).where(eq(partsRequests.isActive, true)).orderBy(desc(partsRequests.requestDate));
  }

  async getPartsRequest(id: number): Promise<PartsRequest | undefined> {
    const [request] = await db.select().from(partsRequests).where(eq(partsRequests.id, id));
    return request || undefined;
  }

  async createPartsRequest(data: InsertPartsRequest): Promise<PartsRequest> {
    const [request] = await db.insert(partsRequests).values(data).returning();
    return request;
  }

  async updatePartsRequest(id: number, data: Partial<InsertPartsRequest>): Promise<PartsRequest> {
    const [request] = await db.update(partsRequests)
      .set(data)
      .where(eq(partsRequests.id, id))
      .returning();
    return request;
  }

  async deletePartsRequest(id: number): Promise<void> {
    await db.delete(partsRequests).where(eq(partsRequests.id, id));
  }

  // Outstanding Orders
  async getOutstandingOrders(): Promise<OrderDraft[]> {
    return await db.select().from(orderDrafts)
      .where(or(
        eq(orderDrafts.status, 'PENDING'),
        eq(orderDrafts.status, 'CONFIRMED'),
        eq(orderDrafts.status, 'IN_PRODUCTION'),
        eq(orderDrafts.status, 'READY')
      ))
      .orderBy(desc(orderDrafts.dueDate));
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
  async getAllAddresses(): Promise<CustomerAddress[]> {
    return await db
      .select()
      .from(customerAddresses)
      .orderBy(customerAddresses.customerId, customerAddresses.isDefault, customerAddresses.id);
  }

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

  // Module 12: Purchase Orders CRUD
  async getAllPurchaseOrders(): Promise<PurchaseOrder[]> {
    return await db
      .select()
      .from(purchaseOrders)
      .orderBy(desc(purchaseOrders.createdAt));
  }

  async getPurchaseOrder(id: number, options?: { includeItems?: boolean; includeOrderCount?: boolean }): Promise<PurchaseOrder & { items?: PurchaseOrderItem[] } | undefined> {
    const po = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1);

    if (po.length === 0) return undefined;

    const result = po[0] as PurchaseOrder & { items?: PurchaseOrderItem[] };

    if (options?.includeItems) {
      result.items = await db
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.poId, id))
        .orderBy(purchaseOrderItems.createdAt);
    }

    return result;
  }

  async createPurchaseOrder(data: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [po] = await db.insert(purchaseOrders).values(data).returning();
    return po;
  }

  async updatePurchaseOrder(id: number, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder> {
    const [po] = await db.update(purchaseOrders)
      .set(data)
      .where(eq(purchaseOrders.id, id))
      .returning();
    return po;
  }

  async deletePurchaseOrder(id: number): Promise<void> {
    // First delete all items
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, id));
    // Then delete the PO
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  }

  // Purchase Order Items CRUD
  async getPurchaseOrderItems(poId: number): Promise<PurchaseOrderItem[]> {
    return await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.poId, poId))
      .orderBy(purchaseOrderItems.createdAt);
  }

  async createPurchaseOrderItem(data: InsertPurchaseOrderItem): Promise<PurchaseOrderItem> {
    const [item] = await db.insert(purchaseOrderItems).values(data).returning();
    return item;
  }

  async updatePurchaseOrderItem(id: number, data: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem> {
    // Calculate total price if quantity or unitPrice changed
    if (data.quantity !== undefined || data.unitPrice !== undefined) {
      const currentItem = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.id, id));
      if (currentItem.length > 0) {
        const item = currentItem[0];
        const quantity = data.quantity ?? item.quantity;
        const unitPrice = data.unitPrice ?? item.unitPrice;
        data.totalPrice = quantity * unitPrice;
      }
    }

    const [item] = await db.update(purchaseOrderItems)
      .set(data)
      .where(eq(purchaseOrderItems.id, id))
      .returning();
    return item;
  }

  async deletePurchaseOrderItem(id: number): Promise<void> {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.id, id));
  }

  // Production Orders CRUD
  async getAllProductionOrders(): Promise<ProductionOrder[]> {
    return await db
      .select()
      .from(productionOrders)
      .orderBy(desc(productionOrders.createdAt));
  }

  async getProductionOrder(id: number): Promise<ProductionOrder | undefined> {
    const [order] = await db
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.id, id))
      .limit(1);
    return order;
  }

  async getProductionOrderByOrderId(orderId: string): Promise<ProductionOrder | undefined> {
    const [order] = await db
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.orderId, orderId))
      .limit(1);
    return order;
  }

  async createProductionOrder(data: InsertProductionOrder): Promise<ProductionOrder> {
    const [order] = await db.insert(productionOrders).values(data).returning();
    return order;
  }

  async updateProductionOrder(id: number, data: Partial<InsertProductionOrder>): Promise<ProductionOrder> {
    const [order] = await db
      .update(productionOrders)
      .set(data)
      .where(eq(productionOrders.id, id))
      .returning();
    return order;
  }

  async deleteProductionOrder(id: number): Promise<void> {
    await db.delete(productionOrders).where(eq(productionOrders.id, id));
  }

  // Generate production orders from PO
  async generateProductionOrders(poId: number): Promise<ProductionOrder[]> {
    const po = await this.getPurchaseOrder(poId);
    if (!po) {
      throw new Error('Purchase order not found');
    }

    // Check if production orders already exist for this PO
    const existingOrders = await db
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.poId, poId));
    
    if (existingOrders.length > 0) {
      console.log(`🏭 Found ${existingOrders.length} existing production orders for PO ${poId}`);
      console.log(`🏭 Returning existing production orders instead of creating duplicates`);
      return existingOrders;
    }

    // Get customer from the main customers table
    const customerIdNum = parseInt(po.customerId);
    if (isNaN(customerIdNum)) {
      throw new Error('Invalid customer ID in purchase order');
    }
    
    const customer = await this.getCustomer(customerIdNum);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const items = await this.getPurchaseOrderItems(poId);
    if (items.length === 0) {
      throw new Error('No items found in purchase order');
    }

    // Generate base order ID: [First 3 letters of customer][Last 5 digits of PO#]
    const customerPrefix = customer.name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
    const poNumberDigits = po.poNumber.replace(/[^0-9]/g, '').slice(-5).padStart(5, '0');
    const baseOrderId = `${customerPrefix}${poNumberDigits}`;

    const orders: ProductionOrder[] = [];
    let sequentialNumber = 1;

    // Create production orders for each item based on quantity
    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        const orderId = `${baseOrderId}-${sequentialNumber.toString().padStart(4, '0')}`;

        const orderData: InsertProductionOrder = {
          orderId,
          poId: po.id,
          poItemId: item.id,
          customerId: po.customerId,
          customerName: po.customerName,
          poNumber: po.poNumber,
          itemType: item.itemType,
          itemId: item.itemId,
          itemName: item.itemName,
          specifications: item.specifications,
          orderDate: new Date(),
          dueDate: new Date(po.expectedDelivery),
          productionStatus: 'PENDING'
        };

        const order = await this.createProductionOrder(orderData);
        orders.push(order);
        sequentialNumber++;
      }

      // Update the PO item's order count
      await this.updatePurchaseOrderItem(item.id, { orderCount: item.quantity });
    }

    return orders;
  }

  // Layup Scheduler: Molds CRUD
  async getAllMolds(): Promise<Mold[]> {
    return await db.select().from(molds).orderBy(molds.modelName, molds.instanceNumber);
  }

  async getMold(moldId: string): Promise<Mold | undefined> {
    const [result] = await db.select().from(molds).where(eq(molds.moldId, moldId));
    return result || undefined;
  }

  async createMold(data: InsertMold): Promise<Mold> {
    const [result] = await db.insert(molds).values(data).returning();
    return result;
  }

  async updateMold(moldId: string, data: Partial<InsertMold>): Promise<Mold> {
    const [result] = await db
      .update(molds)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(molds.moldId, moldId))
      .returning();
    return result;
  }

  async deleteMold(moldId: string): Promise<void> {
    await db.delete(molds).where(eq(molds.moldId, moldId));
  }

  // Layup Scheduler: Employee Settings CRUD
  async getAllEmployeeLayupSettings(): Promise<(EmployeeLayupSettings & { name: string })[]> {
    const result = await db
      .select({
        id: employeeLayupSettings.id,
        employeeId: employeeLayupSettings.employeeId,
        rate: employeeLayupSettings.rate,
        hours: employeeLayupSettings.hours,
        department: employeeLayupSettings.department,
        isActive: employeeLayupSettings.isActive,
        createdAt: employeeLayupSettings.createdAt,
        updatedAt: employeeLayupSettings.updatedAt,
        name: employeeLayupSettings.employeeId, // Use employeeId as name since they're stored as names
      })
      .from(employeeLayupSettings)
      .where(eq(employeeLayupSettings.isActive, true))
      .orderBy(employeeLayupSettings.employeeId);
    
    return result.map(r => ({
      ...r,
      name: r.name || r.employeeId
    }));
  }

  async getEmployeeLayupSettings(employeeId: string): Promise<EmployeeLayupSettings | undefined> {
    const [result] = await db
      .select()
      .from(employeeLayupSettings)
      .where(eq(employeeLayupSettings.employeeId, employeeId));
    return result || undefined;
  }

  async createEmployeeLayupSettings(data: InsertEmployeeLayupSettings): Promise<EmployeeLayupSettings> {
    const [result] = await db.insert(employeeLayupSettings).values(data).returning();
    return result;
  }

  async updateEmployeeLayupSettings(employeeId: string, data: Partial<InsertEmployeeLayupSettings>): Promise<EmployeeLayupSettings> {
    console.log(`🔄 Storage: Updating employee "${employeeId}" with data:`, data);
    
    // Check if employee exists first
    const existing = await this.getEmployeeLayupSettings(employeeId);
    if (!existing) {
      console.log(`❌ Employee "${employeeId}" not found in layup settings`);
      throw new Error(`Employee "${employeeId}" not found in layup settings`);
    }
    
    const [result] = await db
      .update(employeeLayupSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employeeLayupSettings.employeeId, employeeId))
      .returning();
      
    console.log(`✅ Storage: Updated employee "${employeeId}":`, result);
    return result;
  }

  async deleteEmployeeLayupSettings(employeeId: string): Promise<void> {
    await db.delete(employeeLayupSettings).where(eq(employeeLayupSettings.employeeId, employeeId));
  }

  // Layup Scheduler: Orders CRUD
  async getAllLayupOrders(filters?: { status?: string; department?: string }): Promise<LayupOrder[]> {
    let query = db.select().from(layupOrders);
    
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(layupOrders.status, filters.status));
    }
    if (filters?.department) {
      conditions.push(eq(layupOrders.department, filters.department));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return await query.orderBy(layupOrders.priorityScore, layupOrders.orderDate);
  }

  async getLayupOrder(orderId: string): Promise<LayupOrder | undefined> {
    const [result] = await db.select().from(layupOrders).where(eq(layupOrders.orderId, orderId));
    return result || undefined;
  }

  async createLayupOrder(data: InsertLayupOrder): Promise<LayupOrder> {
    const [result] = await db.insert(layupOrders).values(data).returning();
    return result;
  }

  async updateLayupOrder(orderId: string, data: Partial<InsertLayupOrder>): Promise<LayupOrder> {
    const [result] = await db
      .update(layupOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(layupOrders.orderId, orderId))
      .returning();
    return result;
  }

  async deleteLayupOrder(orderId: string): Promise<void> {
    await db.delete(layupOrders).where(eq(layupOrders.orderId, orderId));
  }

  // Get unified layup orders (combining regular orders and P1 PO items)
  async getUnifiedLayupOrders(): Promise<any[]> {
    try {
      // Get regular P1 orders (from orderDrafts) that are in Layup department
      const regularOrders = await db
        .select()
        .from(orderDrafts)
        .where(
          and(
            eq(orderDrafts.currentDepartment, 'Layup'),
            ne(orderDrafts.status, 'SCRAPPED'),
            ne(orderDrafts.status, 'COMPLETED')
          )
        );

      // Get P1 Purchase Order items - simplified query to avoid null/undefined issues
      let p1Orders: any[] = [];
      try {
        p1Orders = await db
          .select({
            poId: purchaseOrderItems.poId,
            itemId: purchaseOrderItems.id,
            partNumber: purchaseOrderItems.partNumber,
            quantity: purchaseOrderItems.quantity,
            status: purchaseOrderItems.status
          })
          .from(purchaseOrderItems)
          .where(ne(purchaseOrderItems.status, 'COMPLETED'));
      } catch (error) {
        console.log('Could not fetch P1 orders:', error);
        p1Orders = [];
      }

      // Format regular orders
      const formattedRegularOrders = regularOrders.map(order => ({
        id: order.id,
        orderId: order.orderId,
        orderDate: order.createdAt,
        customerName: order.customerName || 'Unknown',
        stockModelId: order.modelId,
        stockModelName: order.modelId,
        priority: 50,
        priorityScore: 50,
        type: 'regular',
        features: order.features,
        customer: order.customerName || 'Unknown',
        product: order.modelId || 'Unknown'
      }));

      // Format P1 orders - simplified to avoid database join issues
      const formattedP1Orders = p1Orders.map((item, index) => ({
        id: item.itemId || index,
        orderId: `P1-PO-${item.poId || 'Unknown'}-${item.itemId || index}`,
        orderDate: new Date(),
        customerName: 'P1 Customer',
        stockModelId: item.partNumber || 'Unknown',
        stockModelName: item.partNumber || 'Unknown',
        priority: 75, // Default priority for P1 orders
        priorityScore: 75,
        type: 'p1_po',
        features: {},
        customer: 'P1 Customer',
        product: item.partNumber || 'Unknown'
      }));

      // Combine and return all orders
      return [...formattedRegularOrders, ...formattedP1Orders];

    } catch (error) {
      console.error('Error getting unified layup orders:', error);
      return [];
    }
  }

  // Layup Scheduler: Schedule CRUD
  async getAllLayupSchedule(): Promise<LayupSchedule[]> {
    return await db.select().from(layupSchedule).orderBy(layupSchedule.scheduledDate);
  }

  async getLayupScheduleByOrder(orderId: string): Promise<LayupSchedule[]> {
    return await db.select().from(layupSchedule).where(eq(layupSchedule.orderId, orderId));
  }

  async createLayupSchedule(data: InsertLayupSchedule): Promise<LayupSchedule> {
    const [result] = await db.insert(layupSchedule).values(data).returning();
    return result;
  }

  async updateLayupSchedule(id: number, data: Partial<InsertLayupSchedule>): Promise<LayupSchedule> {
    const [result] = await db
      .update(layupSchedule)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(layupSchedule.id, id))
      .returning();
    return result;
  }

  async deleteLayupSchedule(id: number): Promise<void> {
    await db.delete(layupSchedule).where(eq(layupSchedule.id, id));
  }

  async deleteLayupScheduleByOrder(orderId: string): Promise<void> {
    await db.delete(layupSchedule).where(eq(layupSchedule.orderId, orderId));
  }

  async overrideOrderSchedule(orderId: string, newDate: Date, moldId: string, overriddenBy?: string): Promise<LayupSchedule> {
    // First, mark any existing schedule entries as overridden
    await db
      .update(layupSchedule)
      .set({ 
        isOverride: true, 
        overriddenAt: new Date(), 
        overriddenBy 
      })
      .where(eq(layupSchedule.orderId, orderId));

    // Create new schedule entry
    const data: InsertLayupSchedule = {
      orderId,
      scheduledDate: newDate,
      moldId,
      employeeAssignments: [], // This would be filled by the scheduler algorithm
      isOverride: true,
      overriddenBy
    };

    const [result] = await db.insert(layupSchedule).values(data).returning();
    return result;
  }

  // Department Progression Methods
  async getPipelineCounts(): Promise<Record<string, number>> {
    try {
      // Use GROUP BY to count orders by current department from orderDrafts
      const results = await db
        .select({ 
          department: orderDrafts.currentDepartment, 
          count: sql<number>`count(*)::integer`
        })
        .from(orderDrafts)
        .where(
          and(
            ne(orderDrafts.status, 'SCRAPPED'), // Only count active orders
            isNull(orderDrafts.scrapDate)       // Exclude scrapped orders
          )
        )
        .groupBy(orderDrafts.currentDepartment);

      // Convert to object format
      const counts: Record<string, number> = {};
      results.forEach(result => {
        if (result.department) {
          counts[result.department] = result.count;
        }
      });

      return counts;
    } catch (error) {
      console.error('Error getting pipeline counts:', error);
      return {};
    }
  }

  async getPipelineDetails(): Promise<Record<string, Array<{ orderId: string; modelId: string; dueDate: Date; daysInDept: number; scheduleStatus: 'on-schedule' | 'at-risk' | 'behind' }>>> {
    try {
      // Get all active orders with their department entry timestamps
      const orders = await db
        .select({
          orderId: orderDrafts.orderId,
          modelId: orderDrafts.modelId,
          currentDepartment: orderDrafts.currentDepartment,
          dueDate: orderDrafts.dueDate,
          layupCompletedAt: orderDrafts.layupCompletedAt,
          pluggingCompletedAt: orderDrafts.pluggingCompletedAt,
          cncCompletedAt: orderDrafts.cncCompletedAt,
          finishCompletedAt: orderDrafts.finishCompletedAt,
          gunsmithCompletedAt: orderDrafts.gunsmithCompletedAt,
          paintCompletedAt: orderDrafts.paintCompletedAt,
          qcCompletedAt: orderDrafts.qcCompletedAt,
          createdAt: orderDrafts.createdAt
        })
        .from(orderDrafts)
        .where(
          and(
            ne(orderDrafts.status, 'SCRAPPED'),
            isNull(orderDrafts.scrapDate)
          )
        );

      // Group by department and calculate schedule status
      const pipelineDetails: Record<string, Array<{ orderId: string; modelId: string; dueDate: Date; daysInDept: number; scheduleStatus: 'on-schedule' | 'at-risk' | 'behind' }>> = {};

      orders.forEach(order => {
        if (!order.currentDepartment) return;

        // Calculate days in current department
        const daysInDept = this.calculateDaysInDepartment(order);
        
        // Calculate schedule status
        const scheduleStatus = this.calculateScheduleStatus(order, daysInDept);

        if (!pipelineDetails[order.currentDepartment]) {
          pipelineDetails[order.currentDepartment] = [];
        }

        pipelineDetails[order.currentDepartment].push({
          orderId: order.orderId,
          modelId: order.modelId || '',
          dueDate: order.dueDate,
          daysInDept,
          scheduleStatus
        });
      });

      return pipelineDetails;
    } catch (error) {
      console.error('Error getting pipeline details:', error);
      return {};
    }
  }

  private calculateDaysInDepartment(order: any): number {
    const now = new Date();
    let deptEntryDate: Date;

    // Determine when the order entered the current department
    switch (order.currentDepartment) {
      case 'Layup':
        deptEntryDate = order.createdAt;
        break;
      case 'Plugging':
        deptEntryDate = order.layupCompletedAt || order.createdAt;
        break;
      case 'CNC':
        deptEntryDate = order.pluggingCompletedAt || order.createdAt;
        break;
      case 'Finish':
        deptEntryDate = order.cncCompletedAt || order.createdAt;
        break;
      case 'Gunsmith':
        deptEntryDate = order.finishCompletedAt || order.createdAt;
        break;
      case 'Paint':
        deptEntryDate = order.gunsmithCompletedAt || order.createdAt;
        break;
      case 'QC':
        deptEntryDate = order.paintCompletedAt || order.createdAt;
        break;
      case 'Shipping':
        deptEntryDate = order.qcCompletedAt || order.createdAt;
        break;
      default:
        deptEntryDate = order.createdAt;
    }

    const diffTime = Math.abs(now.getTime() - deptEntryDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private calculateScheduleStatus(order: any, daysInDept: number): 'on-schedule' | 'at-risk' | 'behind' {
    const isAdjusted = order.modelId?.includes('Adj') || false;
    let standardDays: number;

    // Get standard processing time for current department
    switch (order.currentDepartment) {
      case 'Layup':
        standardDays = 35; // 5 weeks
        break;
      case 'Finish':
        standardDays = isAdjusted ? 14 : 7; // 2 weeks for Adj, 1 week for regular
        break;
      case 'Gunsmith':
        standardDays = isAdjusted ? 14 : 7; // 2 weeks for Adj, 1 week for regular
        break;
      case 'Plugging':
      case 'CNC':
      case 'Paint':
      case 'QC':
      case 'Shipping':
      default:
        standardDays = 7; // 1 week
        break;
    }

    // Calculate status
    if (daysInDept > standardDays) {
      return 'behind';
    } else if (daysInDept > standardDays * 0.8) {
      return 'at-risk';
    } else {
      return 'on-schedule';
    }
  }

  async progressOrder(orderId: string, nextDepartment?: string): Promise<OrderDraft> {
    try {
      // Find the current order
      const [currentOrder] = await db
        .select()
        .from(orderDrafts)
        .where(eq(orderDrafts.orderId, orderId));

      if (!currentOrder) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Department progression logic
      const departmentFlow = [
        'Layup', 'Plugging', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'QC', 'Shipping'
      ];

      let nextDept = nextDepartment;
      if (!nextDept) {
        const currentIndex = departmentFlow.indexOf(currentOrder.currentDepartment);
        if (currentIndex === -1 || currentIndex >= departmentFlow.length - 1) {
          throw new Error(`Cannot progress from ${currentOrder.currentDepartment}`);
        }
        nextDept = departmentFlow[currentIndex + 1];
      }

      // Prepare completion timestamp update based on current department
      const completionUpdates: any = {};
      const now = new Date();
      
      switch (currentOrder.currentDepartment) {
        case 'Layup': completionUpdates.layupCompletedAt = now; break;
        case 'Plugging': completionUpdates.pluggingCompletedAt = now; break;
        case 'CNC': completionUpdates.cncCompletedAt = now; break;
        case 'Finish': completionUpdates.finishCompletedAt = now; break;
        case 'Gunsmith': completionUpdates.gunsmithCompletedAt = now; break;
        case 'Paint': completionUpdates.paintCompletedAt = now; break;
        case 'QC': completionUpdates.qcCompletedAt = now; break;
        case 'Shipping': completionUpdates.shippingCompletedAt = now; break;
      }

      // Update the order
      const [updatedOrder] = await db
        .update(orderDrafts)
        .set({
          currentDepartment: nextDept,
          ...completionUpdates,
          updatedAt: now
        })
        .where(eq(orderDrafts.orderId, orderId))
        .returning();

      return updatedOrder;
    } catch (error) {
      console.error('Error progressing order:', error);
      throw error;
    }
  }

  async scrapOrder(orderId: string, scrapData: { reason: string; disposition: string; authorization: string; scrapDate: Date }): Promise<OrderDraft> {
    try {
      const [updatedOrder] = await db
        .update(orderDrafts)
        .set({
          scrapDate: scrapData.scrapDate,
          scrapReason: scrapData.reason,
          scrapDisposition: scrapData.disposition,
          scrapAuthorization: scrapData.authorization,
          status: 'SCRAPPED',
          updatedAt: new Date()
        })
        .where(eq(orderDrafts.orderId, orderId))
        .returning();

      if (!updatedOrder) {
        throw new Error(`Order ${orderId} not found`);
      }

      return updatedOrder;
    } catch (error) {
      console.error('Error scrapping order:', error);
      throw error;
    }
  }

  async createReplacementOrder(scrapOrderId: string): Promise<OrderDraft> {
    try {
      // Find the scrapped order
      const [scrapOrder] = await db
        .select()
        .from(orderDrafts)
        .where(eq(orderDrafts.orderId, scrapOrderId));

      if (!scrapOrder) {
        throw new Error(`Scrapped order ${scrapOrderId} not found`);
      }

      // Generate new order ID for replacement
      const newOrderId = await this.generateNextOrderId();

      // Create replacement order with same details but new ID
      const [replacementOrder] = await db
        .insert(orderDrafts)
        .values({
          orderId: newOrderId,
          orderDate: new Date(),
          dueDate: scrapOrder.dueDate,
          customerId: scrapOrder.customerId,
          customerPO: scrapOrder.customerPO,
          fbOrderNumber: scrapOrder.fbOrderNumber,
          agrOrderDetails: scrapOrder.agrOrderDetails,
          modelId: scrapOrder.modelId,
          handedness: scrapOrder.handedness,
          features: scrapOrder.features,
          featureQuantities: scrapOrder.featureQuantities,
          status: 'ACTIVE',
          currentDepartment: 'Layup', // Reset to start of pipeline
          isReplacement: true,
          replacedOrderId: scrapOrderId,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      return replacementOrder;
    } catch (error) {
      console.error('Error creating replacement order:', error);
      throw error;
    }
  }

  // BOM Management Implementation
  async getAllBOMs(): Promise<BomDefinition[]> {
    try {
      const boms = await db
        .select()
        .from(bomDefinitions)
        .where(eq(bomDefinitions.isActive, true))
        .orderBy(bomDefinitions.modelName, bomDefinitions.revision);
      return boms;
    } catch (error) {
      console.error('Error fetching BOMs:', error);
      throw error;
    }
  }

  async getBOMDetails(bomId: number): Promise<(BomDefinition & { items: BomItem[] }) | undefined> {
    try {
      const [bom] = await db
        .select()
        .from(bomDefinitions)
        .where(and(eq(bomDefinitions.id, bomId), eq(bomDefinitions.isActive, true)));

      if (!bom) return undefined;

      const items = await db
        .select()
        .from(bomItems)
        .where(and(eq(bomItems.bomId, bomId), eq(bomItems.isActive, true)))
        .orderBy(bomItems.partName);

      return { ...bom, items };
    } catch (error) {
      console.error('Error fetching BOM details:', error);
      throw error;
    }
  }

  async createBOM(data: InsertBomDefinition): Promise<BomDefinition> {
    try {
      const [bom] = await db
        .insert(bomDefinitions)
        .values({
          ...data,
          updatedAt: new Date()
        })
        .returning();
      return bom;
    } catch (error) {
      console.error('Error creating BOM:', error);
      throw error;
    }
  }

  async updateBOM(bomId: number, data: Partial<InsertBomDefinition>): Promise<BomDefinition> {
    try {
      const [bom] = await db
        .update(bomDefinitions)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(bomDefinitions.id, bomId))
        .returning();

      if (!bom) {
        throw new Error(`BOM ${bomId} not found`);
      }

      return bom;
    } catch (error) {
      console.error('Error updating BOM:', error);
      throw error;
    }
  }

  async deleteBOM(bomId: number): Promise<void> {
    try {
      // Soft delete - mark as inactive
      await db
        .update(bomDefinitions)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(eq(bomDefinitions.id, bomId));

      // Also soft delete all items
      await db
        .update(bomItems)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(eq(bomItems.bomId, bomId));
    } catch (error) {
      console.error('Error deleting BOM:', error);
      throw error;
    }
  }

  async addBOMItem(bomId: number, data: InsertBomItem): Promise<BomItem> {
    try {
      const [item] = await db
        .insert(bomItems)
        .values({
          ...data,
          bomId,
          updatedAt: new Date()
        })
        .returning();
      return item;
    } catch (error) {
      console.error('Error adding BOM item:', error);
      throw error;
    }
  }

  async updateBOMItem(bomId: number, itemId: number, data: Partial<InsertBomItem>): Promise<BomItem> {
    try {
      const [item] = await db
        .update(bomItems)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)))
        .returning();

      if (!item) {
        throw new Error(`BOM item ${itemId} not found in BOM ${bomId}`);
      }

      return item;
    } catch (error) {
      console.error('Error updating BOM item:', error);
      throw error;
    }
  }

  async deleteBOMItem(bomId: number, itemId: number): Promise<void> {
    try {
      // Soft delete - mark as inactive
      await db
        .update(bomItems)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)));
    } catch (error) {
      console.error('Error deleting BOM item:', error);
      throw error;
    }
  }

  // P2 Customers CRUD
  async getAllP2Customers(): Promise<P2Customer[]> {
    return await db
      .select()
      .from(p2Customers)
      .orderBy(p2Customers.customerName);
  }

  async getP2Customer(id: number): Promise<P2Customer | undefined> {
    const [customer] = await db
      .select()
      .from(p2Customers)
      .where(eq(p2Customers.id, id))
      .limit(1);
    return customer;
  }

  async getP2CustomerByCustomerId(customerId: string): Promise<P2Customer | undefined> {
    const [customer] = await db
      .select()
      .from(p2Customers)
      .where(eq(p2Customers.customerId, customerId))
      .limit(1);
    return customer;
  }

  async createP2Customer(data: InsertP2Customer): Promise<P2Customer> {
    const [customer] = await db.insert(p2Customers).values(data).returning();
    return customer;
  }

  async updateP2Customer(id: number, data: Partial<InsertP2Customer>): Promise<P2Customer> {
    const [customer] = await db
      .update(p2Customers)
      .set(data)
      .where(eq(p2Customers.id, id))
      .returning();
    return customer;
  }

  async deleteP2Customer(id: number): Promise<void> {
    await db.delete(p2Customers).where(eq(p2Customers.id, id));
  }

  // P2 Purchase Orders CRUD
  async getAllP2PurchaseOrders(): Promise<P2PurchaseOrder[]> {
    return await db
      .select()
      .from(p2PurchaseOrders)
      .orderBy(desc(p2PurchaseOrders.createdAt));
  }

  async getP2PurchaseOrder(id: number, options?: { includeItems?: boolean }): Promise<P2PurchaseOrder & { items?: P2PurchaseOrderItem[] } | undefined> {
    const [po] = await db
      .select()
      .from(p2PurchaseOrders)
      .where(eq(p2PurchaseOrders.id, id))
      .limit(1);

    if (!po) return undefined;

    let items: P2PurchaseOrderItem[] = [];
    if (options?.includeItems) {
      items = await this.getP2PurchaseOrderItems(id);
    }

    return { ...po, items };
  }

  async createP2PurchaseOrder(data: InsertP2PurchaseOrder): Promise<P2PurchaseOrder> {
    const [po] = await db.insert(p2PurchaseOrders).values(data).returning();
    return po;
  }

  async updateP2PurchaseOrder(id: number, data: Partial<InsertP2PurchaseOrder>): Promise<P2PurchaseOrder> {
    const [po] = await db
      .update(p2PurchaseOrders)
      .set(data)
      .where(eq(p2PurchaseOrders.id, id))
      .returning();
    return po;
  }

  async deleteP2PurchaseOrder(id: number): Promise<void> {
    await db.delete(p2PurchaseOrders).where(eq(p2PurchaseOrders.id, id));
  }

  // P2 Purchase Order Items CRUD
  async getP2PurchaseOrderItems(poId: number): Promise<P2PurchaseOrderItem[]> {
    return await db
      .select()
      .from(p2PurchaseOrderItems)
      .where(eq(p2PurchaseOrderItems.poId, poId))
      .orderBy(p2PurchaseOrderItems.createdAt);
  }

  async createP2PurchaseOrderItem(data: InsertP2PurchaseOrderItem): Promise<P2PurchaseOrderItem> {
    const [item] = await db.insert(p2PurchaseOrderItems).values(data).returning();
    return item;
  }

  async updateP2PurchaseOrderItem(id: number, data: Partial<InsertP2PurchaseOrderItem>): Promise<P2PurchaseOrderItem> {
    // Calculate total price if quantity or unitPrice changed
    if (data.quantity !== undefined || data.unitPrice !== undefined) {
      const currentItem = await db.select().from(p2PurchaseOrderItems).where(eq(p2PurchaseOrderItems.id, id));
      if (currentItem.length > 0) {
        const item = currentItem[0];
        const quantity = data.quantity ?? item.quantity;
        const unitPrice = data.unitPrice ?? item.unitPrice;
        data.totalPrice = quantity * unitPrice;
      }
    }

    const [item] = await db.update(p2PurchaseOrderItems)
      .set(data)
      .where(eq(p2PurchaseOrderItems.id, id))
      .returning();
    return item;
  }

  async deleteP2PurchaseOrderItem(id: number): Promise<void> {
    await db.delete(p2PurchaseOrderItems).where(eq(p2PurchaseOrderItems.id, id));
  }

  // P2 Production Orders CRUD
  async getAllP2ProductionOrders(): Promise<P2ProductionOrder[]> {
    return await db
      .select()
      .from(p2ProductionOrders)
      .orderBy(desc(p2ProductionOrders.createdAt));
  }

  async getP2ProductionOrdersByPoId(poId: number): Promise<P2ProductionOrder[]> {
    return await db
      .select()
      .from(p2ProductionOrders)
      .where(eq(p2ProductionOrders.p2PoId, poId))
      .orderBy(p2ProductionOrders.department, p2ProductionOrders.createdAt);
  }

  async getP2ProductionOrder(id: number): Promise<P2ProductionOrder | undefined> {
    const orders = await db
      .select()
      .from(p2ProductionOrders)
      .where(eq(p2ProductionOrders.id, id));
    return orders[0];
  }

  async createP2ProductionOrder(data: InsertP2ProductionOrder): Promise<P2ProductionOrder> {
    const [order] = await db.insert(p2ProductionOrders).values(data).returning();
    return order;
  }

  async updateP2ProductionOrder(id: number, data: Partial<InsertP2ProductionOrder>): Promise<P2ProductionOrder> {
    const [order] = await db.update(p2ProductionOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(p2ProductionOrders.id, id))
      .returning();
    return order;
  }

  async deleteP2ProductionOrder(id: number): Promise<void> {
    await db.delete(p2ProductionOrders).where(eq(p2ProductionOrders.id, id));
  }

  async generateP2ProductionOrders(poId: number): Promise<P2ProductionOrder[]> {
    // Get the P2 Purchase Order and its items
    const po = await this.getP2PurchaseOrder(poId);
    if (!po) {
      throw new Error(`P2 Purchase Order ${poId} not found`);
    }

    const poItems = await this.getP2PurchaseOrderItems(poId);
    if (poItems.length === 0) {
      throw new Error(`No items found for P2 Purchase Order ${poId}`);
    }

    const productionOrders: P2ProductionOrder[] = [];

    // Process each PO item
    for (const poItem of poItems) {
      // Get the BOM definition for this SKU
      const bomDefs = await db
        .select()
        .from(bomDefinitions)
        .where(eq(bomDefinitions.sku, poItem.partNumber));
      
      if (bomDefs.length === 0) {
        console.warn(`No BOM definition found for SKU: ${poItem.partNumber}`);
        continue;
      }

      const bomDef = bomDefs[0];

      // Get all BOM items for this definition
      const bomItemsList = await db
        .select()
        .from(bomItems)
        .where(and(
          eq(bomItems.bomId, bomDef.id),
          eq(bomItems.isActive, true)
        ));

      // Create production orders for each BOM item
      for (let i = 0; i < bomItemsList.length; i++) {
        const bomItem = bomItemsList[i];
        
        // Skip materials - only create production orders for manufactured parts
        if (bomItem.itemType === 'material') {
          console.log(`Skipping material item: ${bomItem.partName} - quantity tracking only`);
          continue;
        }
        
        const totalQuantity = bomItem.quantity * poItem.quantity;
        
        // Create individual production orders (1 unit each) instead of bulk orders
        for (let unitIndex = 1; unitIndex <= totalQuantity; unitIndex++) {
          // Generate unique order ID: P2-{PO#}-{item#}-{bomItem#}-{unit#}
          const orderIdSuffix = String(i + 1).padStart(3, '0');
          const unitSuffix = String(unitIndex).padStart(3, '0');
          const orderId = `P2-${po.poNumber}-${poItem.id}-${orderIdSuffix}-${unitSuffix}`;

          const productionOrderData: InsertP2ProductionOrder = {
            orderId,
            p2PoId: poId,
            p2PoItemId: poItem.id,
            bomDefinitionId: bomDef.id,
            bomItemId: bomItem.id,
            sku: poItem.partNumber,
            partName: bomItem.partName,
            quantity: 1, // Individual orders with quantity of 1
            department: bomItem.firstDept as any,
            status: 'PENDING',
            priority: 50,
            dueDate: po.dueDate || undefined,
            notes: `Generated from P2 PO ${po.poNumber} - ${bomDef.modelName} (${bomDef.revision}) - Unit ${unitIndex} of ${totalQuantity}`,
          };

          const productionOrder = await this.createP2ProductionOrder(productionOrderData);
          productionOrders.push(productionOrder);
        }
      }
    }

    return productionOrders;
  }

  async getP2MaterialRequirements(poId: number): Promise<any[]> {
    const po = await this.getP2PurchaseOrder(poId);
    if (!po) {
      throw new Error(`P2 Purchase Order ${poId} not found`);
    }

    const poItems = await this.getP2PurchaseOrderItems(poId);
    if (poItems.length === 0) {
      return [];
    }

    const materialRequirements: any[] = [];

    // Process each PO item
    for (const poItem of poItems) {
      // Get the BOM definition for this SKU
      const bomDefs = await db
        .select()
        .from(bomDefinitions)
        .where(eq(bomDefinitions.sku, poItem.partNumber));
      
      if (bomDefs.length === 0) {
        continue;
      }

      const bomDef = bomDefs[0];

      // Get all BOM items for this definition that are materials
      const materialItems = await db
        .select()
        .from(bomItems)
        .where(and(
          eq(bomItems.bomId, bomDef.id),
          eq(bomItems.isActive, true),
          eq(bomItems.itemType, 'material')
        ));

      // Calculate material requirements
      for (const materialItem of materialItems) {
        const totalQuantity = materialItem.quantity * poItem.quantity;
        
        // Check if this material is already in our requirements list
        const existingIndex = materialRequirements.findIndex(
          req => req.partName === materialItem.partName
        );
        
        if (existingIndex >= 0) {
          // Add to existing requirement
          materialRequirements[existingIndex].totalQuantity += totalQuantity;
          materialRequirements[existingIndex].sources.push({
            sku: poItem.partNumber,
            skuQuantity: poItem.quantity,
            bomQuantity: materialItem.quantity,
            subtotal: totalQuantity
          });
        } else {
          // Create new requirement
          materialRequirements.push({
            partName: materialItem.partName,
            unitQuantity: materialItem.quantity,
            totalQuantity: totalQuantity,
            department: materialItem.firstDept,
            sources: [{
              sku: poItem.partNumber,
              skuQuantity: poItem.quantity,
              bomQuantity: materialItem.quantity,
              subtotal: totalQuantity
            }]
          });
        }
      }
    }

    return materialRequirements;
  }

}

export const storage = new DatabaseStorage();