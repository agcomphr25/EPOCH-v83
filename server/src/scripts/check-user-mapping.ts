import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from '../../schema';

const DEV_DATABASE_URL =
  'postgresql://neondb_owner:npg_28YFPchwECLb@ep-sweet-smoke-adiyfj99.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const PROD_DATABASE_URL =
  'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function checkUserMapping() {
  const devSql = neon(DEV_DATABASE_URL);
  const devDb = drizzle(devSql, { schema });

  const prodSql = neon(PROD_DATABASE_URL);
  const prodDb = drizzle(prodSql, { schema });

  console.log('🔍 Checking user data in both databases...\n');

  // Get DEV users (select only key columns)
  const devUsers = await devDb
    .select({
      username: schema.users.username,
      employeeId: schema.users.employeeId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users);

  console.log('📦 DEV Users:');
  console.log('═'.repeat(80));
  devUsers.forEach((user) => {
    console.log(
      `Username: ${user.username.padEnd(20)} | Employee ID: ${String(user.employeeId || 'NULL').padEnd(8)} | Name: ${user.firstName} ${user.lastName}`
    );
  });

  console.log('\n📦 PROD Users:');
  console.log('═'.repeat(80));
  const prodUsers = await prodDb
    .select({
      username: schema.users.username,
      employeeId: schema.users.employeeId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users);

  prodUsers.forEach((user) => {
    console.log(
      `Username: ${user.username.padEnd(20)} | Employee ID: ${String(user.employeeId || 'NULL').padEnd(8)} | Name: ${user.firstName} ${user.lastName}`
    );
  });

  console.log('\n🔗 Potential Mappings:');
  console.log('═'.repeat(80));

  for (const devUser of devUsers) {
    const prodUser = prodUsers.find((u) => u.username === devUser.username);
    if (prodUser) {
      const canMap = devUser.employeeId && prodUser.employeeId;
      const status = canMap ? '✅' : '❌';
      console.log(
        `${status} ${devUser.username.padEnd(20)} | DEV EmpID: ${String(devUser.employeeId || 'NULL').padEnd(8)} | PROD EmpID: ${prodUser.employeeId || 'NULL'}`
      );
    } else {
      console.log(`⚠️  ${devUser.username.padEnd(20)} | Only in DEV`);
    }
  }

  // Check for PROD-only users
  for (const prodUser of prodUsers) {
    const devUser = devUsers.find((u) => u.username === prodUser.username);
    if (!devUser) {
      console.log(`⚠️  ${prodUser.username.padEnd(20)} | Only in PROD`);
    }
  }

  process.exit(0);
}

checkUserMapping().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
