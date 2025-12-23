import { db } from "../db";
import { employees, canonicalIdentities } from "../schema";
import { eq, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

async function backfillCanonicalIdentities() {
  console.log("Starting canonical identity backfill...");

  const employeesWithoutIdentity = await db
    .select()
    .from(employees)
    .where(isNull(employees.canonicalId));

  console.log(`Found ${employeesWithoutIdentity.length} employees without canonical identity`);

  let created = 0;
  let matched = 0;
  let errors = 0;

  for (const employee of employeesWithoutIdentity) {
    try {
      if (!employee.email) {
        console.log(`Skipping employee ${employee.id} (${employee.name}) - no email`);
        continue;
      }

      const existingIdentity = await db
        .select()
        .from(canonicalIdentities)
        .where(eq(canonicalIdentities.primaryEmail, employee.email))
        .limit(1);

      let canonicalId: string;

      if (existingIdentity.length > 0) {
        canonicalId = existingIdentity[0].id;
        console.log(`Employee ${employee.id} (${employee.name}) matched existing identity ${canonicalId}`);
        matched++;
      } else {
        canonicalId = uuidv4();
        await db.insert(canonicalIdentities).values({
          id: canonicalId,
          displayName: employee.name,
          primaryEmail: employee.email,
          source: "epoch",
          status: employee.isActive ? "active" : "inactive",
        });
        console.log(`Created new identity ${canonicalId} for employee ${employee.id} (${employee.name})`);
        created++;
      }

      await db
        .update(employees)
        .set({ canonicalId })
        .where(eq(employees.id, employee.id));

    } catch (error) {
      console.error(`Error processing employee ${employee.id}:`, error);
      errors++;
    }
  }

  console.log("\nBackfill complete:");
  console.log(`  Created: ${created}`);
  console.log(`  Matched: ${matched}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Skipped (no email): ${employeesWithoutIdentity.length - created - matched - errors}`);
}

backfillCanonicalIdentities()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
