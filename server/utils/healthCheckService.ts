import { db } from '../db';
import { 
  healthCheckTypes, 
  healthCheckResults, 
  healthCheckConfig,
  allOrders,
  type HealthCheckType,
  type HealthCheckResult,
  type InsertHealthCheckResult
} from '../schema';
import { eq, sql, desc } from 'drizzle-orm';
import { sendEmailViaSendGrid } from './sendgrid';
import { nanoid } from 'nanoid';

export interface HealthCheckResponse {
  status: 'pass' | 'fail' | 'warning' | 'skipped';
  message: string;
  details?: any;
  executionTimeMs: number;
}

type CheckFunction = (checkType: HealthCheckType) => Promise<HealthCheckResponse>;

const builtInChecks: Record<string, CheckFunction> = {
  database_connection: checkDatabaseConnection,
  sendgrid_email: checkSendGridEmail,
  signature_email: checkSignatureEmail,
  duplicate_orders: checkDuplicateOrders,
};

async function checkDatabaseConnection(): Promise<HealthCheckResponse> {
  const startTime = Date.now();
  try {
    const result = await db.execute(sql`SELECT 1 as test`);
    return {
      status: 'pass',
      message: 'Database connection is healthy',
      details: { queryResult: 'success' },
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
      executionTimeMs: Date.now() - startTime,
    };
  }
}

async function checkSendGridEmail(checkType: HealthCheckType): Promise<HealthCheckResponse> {
  const startTime = Date.now();
  const testEmail = checkType.testEmailAddress;
  
  if (!testEmail) {
    return {
      status: 'skipped',
      message: 'No test email address configured for SendGrid check',
      executionTimeMs: Date.now() - startTime,
    };
  }

  try {
    const result = await sendEmailViaSendGrid({
      to: testEmail,
      subject: `[Health Check] SendGrid Test - ${new Date().toLocaleString()}`,
      text: `This is an automated health check email sent at ${new Date().toISOString()}.\n\nIf you received this email, the SendGrid email service is working correctly.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #28a745;">✓ Health Check Passed</h2>
          <p>This is an automated health check email sent at <strong>${new Date().toISOString()}</strong>.</p>
          <p>If you received this email, the SendGrid email service is working correctly.</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">AG Composites System Health Check</p>
        </div>
      `,
    });

    if (result.success) {
      return {
        status: 'pass',
        message: `Test email sent successfully to ${testEmail}`,
        details: { messageId: result.messageId, recipient: testEmail },
        executionTimeMs: Date.now() - startTime,
      };
    } else {
      return {
        status: 'fail',
        message: `Failed to send test email: ${result.error}`,
        details: { error: result.error, recipient: testEmail },
        executionTimeMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      status: 'fail',
      message: `SendGrid check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
      executionTimeMs: Date.now() - startTime,
    };
  }
}

async function checkSignatureEmail(checkType: HealthCheckType): Promise<HealthCheckResponse> {
  const startTime = Date.now();
  const testEmail = checkType.testEmailAddress;
  
  if (!testEmail) {
    return {
      status: 'skipped',
      message: 'No test email address configured for signature email check',
      executionTimeMs: Date.now() - startTime,
    };
  }

  try {
    const { sendOrderSignedConfirmation } = await import('./orderSignedConfirmation');
    
    const result = await sendOrderSignedConfirmation({
      orderId: 'HEALTH-CHECK-TEST',
      customerName: 'Health Check Test',
      customerEmail: testEmail,
      orderDate: new Date().toLocaleDateString(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
    });

    if (result.success) {
      return {
        status: 'pass',
        message: `Signature confirmation email sent successfully to ${testEmail}`,
        details: { messageId: result.messageId, recipient: testEmail },
        executionTimeMs: Date.now() - startTime,
      };
    } else {
      return {
        status: 'fail',
        message: `Failed to send signature email: ${result.error}`,
        details: { error: result.error, recipient: testEmail },
        executionTimeMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      status: 'fail',
      message: `Signature email check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
      executionTimeMs: Date.now() - startTime,
    };
  }
}

async function checkDuplicateOrders(): Promise<HealthCheckResponse> {
  const startTime = Date.now();
  try {
    const duplicates = await db.execute(sql`
      SELECT order_id, COUNT(*) as count 
      FROM all_orders 
      GROUP BY order_id 
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 100
    `);

    const duplicateList = duplicates.rows as Array<{ order_id: string; count: number }>;

    if (duplicateList.length === 0) {
      return {
        status: 'pass',
        message: 'No duplicate order numbers found',
        details: { duplicatesFound: 0 },
        executionTimeMs: Date.now() - startTime,
      };
    } else {
      return {
        status: 'fail',
        message: `Found ${duplicateList.length} duplicate order number(s)`,
        details: { 
          duplicatesFound: duplicateList.length,
          duplicates: duplicateList.map(d => ({ orderId: d.order_id, count: d.count }))
        },
        executionTimeMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      status: 'fail',
      message: `Duplicate order check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
      executionTimeMs: Date.now() - startTime,
    };
  }
}

export async function runHealthCheck(checkType: HealthCheckType, runType: 'manual' | 'scheduled', batchId: string): Promise<HealthCheckResult> {
  let response: HealthCheckResponse;

  const checkFn = builtInChecks[checkType.name];
  
  if (checkFn) {
    response = await checkFn(checkType);
  } else if (checkType.checkFunction) {
    response = await runCustomCheck(checkType);
  } else {
    response = {
      status: 'skipped',
      message: `No check function defined for ${checkType.displayName}`,
      executionTimeMs: 0,
    };
  }

  const [result] = await db.insert(healthCheckResults).values({
    checkTypeId: checkType.id,
    checkName: checkType.displayName,
    status: response.status,
    message: response.message,
    details: response.details,
    executionTimeMs: response.executionTimeMs,
    runType,
    runBatchId: batchId,
  }).returning();

  return result;
}

async function runCustomCheck(checkType: HealthCheckType): Promise<HealthCheckResponse> {
  const startTime = Date.now();
  
  if (!checkType.checkFunction) {
    return {
      status: 'skipped',
      message: 'No check function configured',
      executionTimeMs: Date.now() - startTime,
    };
  }

  try {
    const result = await db.execute(sql.raw(checkType.checkFunction));
    const rows = result.rows as any[];

    if (rows.length === 0) {
      return {
        status: 'pass',
        message: 'Custom check passed - no issues found',
        details: { rowCount: 0 },
        executionTimeMs: Date.now() - startTime,
      };
    } else {
      return {
        status: 'warning',
        message: `Custom check found ${rows.length} result(s)`,
        details: { rowCount: rows.length, results: rows.slice(0, 50) },
        executionTimeMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      status: 'fail',
      message: `Custom check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
      executionTimeMs: Date.now() - startTime,
    };
  }
}

export async function runAllEnabledChecks(runType: 'manual' | 'scheduled' = 'manual'): Promise<HealthCheckResult[]> {
  const batchId = nanoid();
  const enabledChecks = await db
    .select()
    .from(healthCheckTypes)
    .where(eq(healthCheckTypes.isEnabled, true))
    .orderBy(healthCheckTypes.sortOrder);

  const results: HealthCheckResult[] = [];

  for (const checkType of enabledChecks) {
    const result = await runHealthCheck(checkType, runType, batchId);
    results.push(result);
  }

  await db
    .update(healthCheckConfig)
    .set({ lastRunAt: new Date() });

  return results;
}

export async function runSingleCheck(checkId: number, runType: 'manual' | 'scheduled' = 'manual'): Promise<HealthCheckResult | null> {
  const batchId = nanoid();
  const [checkType] = await db
    .select()
    .from(healthCheckTypes)
    .where(eq(healthCheckTypes.id, checkId));

  if (!checkType) {
    return null;
  }

  return runHealthCheck(checkType, runType, batchId);
}

export async function getHealthCheckTypes(): Promise<HealthCheckType[]> {
  return db.select().from(healthCheckTypes).orderBy(healthCheckTypes.sortOrder);
}

export async function seedDefaultHealthCheckTypes(): Promise<void> {
  const existing = await db.select().from(healthCheckTypes).limit(1);
  
  if (existing.length > 0) {
    return;
  }

  const defaultChecks = [
    {
      name: 'database_connection',
      displayName: 'Database Connection',
      description: 'Verifies the database is accessible and responding',
      category: 'system',
      isBuiltIn: true,
      isEnabled: true,
      sortOrder: 1,
    },
    {
      name: 'sendgrid_email',
      displayName: 'SendGrid Email Service',
      description: 'Sends a test email to verify email service is working',
      category: 'email',
      isBuiltIn: true,
      isEnabled: true,
      sortOrder: 2,
    },
    {
      name: 'signature_email',
      displayName: 'Digital Signature Email',
      description: 'Tests the digital signature request email template',
      category: 'email',
      isBuiltIn: true,
      isEnabled: true,
      sortOrder: 3,
    },
    {
      name: 'duplicate_orders',
      displayName: 'Duplicate Order Numbers',
      description: 'Checks for duplicate order IDs in the database',
      category: 'database',
      isBuiltIn: true,
      isEnabled: true,
      sortOrder: 4,
    },
  ];

  await db.insert(healthCheckTypes).values(defaultChecks);
  console.log('✅ Seeded default health check types');
}

export async function seedDefaultHealthCheckConfig(): Promise<void> {
  const existing = await db.select().from(healthCheckConfig).limit(1);
  
  if (existing.length > 0) {
    return;
  }

  await db.insert(healthCheckConfig).values({
    scheduledTime: '08:00',
    isScheduleEnabled: true,
  });
  console.log('✅ Seeded default health check config');
}

export async function getHealthCheckConfig() {
  const [config] = await db.select().from(healthCheckConfig).limit(1);
  return config;
}

export async function updateHealthCheckConfig(updates: Partial<{ scheduledTime: string; notificationEmail: string; isScheduleEnabled: boolean }>) {
  const [config] = await db
    .update(healthCheckConfig)
    .set({ ...updates, updatedAt: new Date() })
    .returning();
  return config;
}

export async function toggleHealthCheck(checkId: number, isEnabled: boolean) {
  const [updated] = await db
    .update(healthCheckTypes)
    .set({ isEnabled, updatedAt: new Date() })
    .where(eq(healthCheckTypes.id, checkId))
    .returning();
  return updated;
}

export async function updateHealthCheckType(checkId: number, updates: Partial<{ testEmailAddress: string; description: string }>) {
  const [updated] = await db
    .update(healthCheckTypes)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(healthCheckTypes.id, checkId))
    .returning();
  return updated;
}

export async function createCustomCheck(data: { name: string; displayName: string; description: string; checkFunction: string }) {
  const [created] = await db.insert(healthCheckTypes).values({
    name: data.name.toLowerCase().replace(/\s+/g, '_'),
    displayName: data.displayName,
    description: data.description,
    category: 'custom',
    isBuiltIn: false,
    isEnabled: true,
    checkFunction: data.checkFunction,
    sortOrder: 100,
  }).returning();
  return created;
}

export async function deleteCustomCheck(checkId: number) {
  const [check] = await db
    .select()
    .from(healthCheckTypes)
    .where(eq(healthCheckTypes.id, checkId));

  if (!check || check.isBuiltIn) {
    return { success: false, message: 'Cannot delete built-in checks' };
  }

  await db.delete(healthCheckTypes).where(eq(healthCheckTypes.id, checkId));
  return { success: true };
}

export async function getRecentResults(limit: number = 50): Promise<HealthCheckResult[]> {
  return db
    .select()
    .from(healthCheckResults)
    .orderBy(desc(healthCheckResults.createdAt))
    .limit(limit);
}

export async function getResultsByBatchId(batchId: string): Promise<HealthCheckResult[]> {
  return db
    .select()
    .from(healthCheckResults)
    .where(eq(healthCheckResults.runBatchId, batchId))
    .orderBy(healthCheckResults.id);
}
