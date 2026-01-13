import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("✅ DB migrated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
