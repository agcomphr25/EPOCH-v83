/**
 * Seed script: creates the initial admin user.
 * Usage: pnpm --filter @workspace/api-server run seed:admin
 *
 * Environment variables required:
 *   DATABASE_URL  — PostgreSQL connection string
 *   ADMIN_EMAIL   — email for the admin account (default: admin@timekeeper.local)
 *   ADMIN_PASSWORD — password for the admin account (default: Change-Me-Now!)
 */
import { createUser, getUserByEmail } from "../services/auth.service";

const email = process.env["ADMIN_EMAIL"] ?? "admin@timekeeper.local";
const password = process.env["ADMIN_PASSWORD"] ?? "Change-Me-Now!";

async function main() {
  const existing = await getUserByEmail(email);
  if (existing) {
    console.log(`Admin user already exists: ${email} (id=${existing.id})`);
    process.exit(0);
  }

  const user = await createUser({ email, password, role: "admin" });
  console.log(`Admin user created: ${user.email} (id=${user.id})`);
  console.log(`⚠  Change the default password immediately if using the default!`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
