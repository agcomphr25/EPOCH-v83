import { db } from "../db";
import { orderDepartmentTypes, orderStatusTypes } from "../schema";

// Seed data for order department types (based on production flow)
const departments = [
  { name: "Production Queue", displayName: "Production Queue", sortOrder: 1, isActive: true },
  { name: "Layup", displayName: "Layup/Plugging", sortOrder: 2, isActive: true },
  { name: "Barcode", displayName: "Barcode", sortOrder: 3, isActive: true },
  { name: "CNC", displayName: "CNC", sortOrder: 4, isActive: true },
  { name: "Gunsmith", displayName: "Gunsmith", sortOrder: 5, isActive: true },
  { name: "Finish", displayName: "Finish", sortOrder: 6, isActive: true },
  { name: "Finish QC", displayName: "Finish QC", sortOrder: 7, isActive: true },
  { name: "Shipping QC", displayName: "Shipping QC", sortOrder: 8, isActive: true },
  { name: "Shipping", displayName: "Shipping", sortOrder: 9, isActive: true },
];

// Seed data for order status types (based on order lifecycle)
const statuses = [
  { name: "HOLDING", displayName: "Holding", sortOrder: 1, isActive: true },
  { name: "FINALIZED", displayName: "Finalized", sortOrder: 2, isActive: true },
  { name: "IN_PROGRESS", displayName: "In Progress", sortOrder: 3, isActive: true },
  { name: "FULFILLED", displayName: "Fulfilled", sortOrder: 4, isActive: true },
  { name: "CANCELLED", displayName: "Cancelled", sortOrder: 5, isActive: true },
];

export async function seedOrderReferenceTables() {
  try {
    console.log("Seeding order departments...");
    
    // Seed departments
    for (const dept of departments) {
      await db.insert(orderDepartmentTypes)
        .values(dept)
        .onConflictDoNothing();
    }
    
    console.log("Seeding order statuses...");
    
    // Seed statuses
    for (const status of statuses) {
      await db.insert(orderStatusTypes)
        .values(status)
        .onConflictDoNothing();
    }
    
    console.log("Order reference tables seeded successfully!");
  } catch (error) {
    console.error("Error seeding order reference tables:", error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedOrderReferenceTables()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
