import { 
  users, csvData, customerTypes, persistentDiscounts, shortTermSales,
  type User, type InsertUser, type CSVData, type InsertCSVData,
  type CustomerType, type InsertCustomerType,
  type PersistentDiscount, type InsertPersistentDiscount,
  type ShortTermSale, type InsertShortTermSale
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

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
    // Clear existing data first
    await this.clearCSVData();
    
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
      .set({ ...data, updatedAt: new Date() })
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
}

export const storage = new DatabaseStorage();
