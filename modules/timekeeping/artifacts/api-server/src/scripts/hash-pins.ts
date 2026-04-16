import { db, employeesTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

const PIN_HASH_ROUNDS = 12;

async function hashExistingPins() {
  const employees = await db
    .select({ id: employeesTable.id, pin: employeesTable.pin })
    .from(employeesTable)
    .where(isNotNull(employeesTable.pin));

  let hashed = 0;
  let skipped = 0;

  for (const emp of employees) {
    if (!emp.pin) continue;

    if (emp.pin.startsWith("$2a$") || emp.pin.startsWith("$2b$") || emp.pin.startsWith("$2y$")) {
      skipped++;
      continue;
    }

    const hash = await bcrypt.hash(emp.pin, PIN_HASH_ROUNDS);
    await db
      .update(employeesTable)
      .set({ pin: hash })
      .where(eq(employeesTable.id, emp.id));
    hashed++;
  }

  console.log(`PIN hashing complete: ${hashed} hashed, ${skipped} already hashed, ${employees.length} total`);
  process.exit(0);
}

hashExistingPins().catch((err) => {
  console.error("Failed to hash PINs:", err);
  process.exit(1);
});
