import { db } from '../db';
import { 
  healthCheckTypes, 
  healthCheckResults, 
  healthCheckConfig,
  allOrders,
  monitoredLinks,
  type HealthCheckType,
  type HealthCheckResult,
  type InsertHealthCheckResult,
  type MonitoredLink
} from '../schema';
import { eq, sql, desc } from 'drizzle-orm';
import { sendEmailViaSendGrid } from './sendgrid';
import { nanoid } from 'nanoid';
import { getTwilioConfig, getSendGridConfig, isTwilioConfigured, isSendGridConfigured } from '../config/notifications';

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
  twilio_sms: checkTwilioSMS,
  tracking_notification_pipeline: checkTrackingNotificationPipeline,
  link_health: checkLinkHealth,
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

async function checkTwilioSMS(checkType: HealthCheckType): Promise<HealthCheckResponse> {
  const startTime = Date.now();
  
  // Get phone from check type first, then fall back to global config
  let testPhone = checkType.testSmsPhone;
  if (!testPhone) {
    const config = await getHealthCheckConfig();
    testPhone = config?.testSmsPhone || null;
  }
  
  if (!testPhone) {
    return {
      status: 'skipped',
      message: 'No test phone number configured for SMS check. Set it in Schedule settings.',
      executionTimeMs: Date.now() - startTime,
    };
  }

  try {
    const twilio = await import('twilio');
    const twilioConfig = getTwilioConfig();

    if (!isTwilioConfigured()) {
      return {
        status: 'fail',
        message: 'Twilio credentials not configured',
        details: { 
          accountSidSet: !!twilioConfig.accountSid, 
          accountSidSource: twilioConfig.accountSidSource || 'NOT SET',
          authTokenSet: !!twilioConfig.authToken, 
          fromNumberSet: !!twilioConfig.fromNumber,
          fromNumberSource: twilioConfig.fromNumberSource || 'NOT SET',
        },
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Get timezone from config
    const config = await getHealthCheckConfig();
    const timezone = config?.timezone || 'America/Chicago';
    const tzAbbreviations: Record<string, string> = {
      'America/New_York': 'ET',
      'America/Chicago': 'CT',
      'America/Denver': 'MT',
      'America/Los_Angeles': 'PT',
      'America/Anchorage': 'AKT',
      'Pacific/Honolulu': 'HT',
    };
    const tzAbbr = tzAbbreviations[timezone] || timezone;

    const twilioClient = twilio.default(twilioConfig.accountSid, twilioConfig.authToken);
    const now = new Date();
    const message = await twilioClient.messages.create({
      body: `[AG Composites Health Check] System is operational - ${now.toLocaleString('en-US', { timeZone: timezone })} ${tzAbbr}`,
      from: twilioConfig.fromNumber,
      to: testPhone,
    });

    return {
      status: 'pass',
      message: `Test SMS sent successfully to ${testPhone}`,
      details: { 
        messageSid: message.sid, 
        recipient: testPhone,
        accountSidSource: twilioConfig.accountSidSource || 'NOT SET',
        fromNumberSource: twilioConfig.fromNumberSource || 'NOT SET',
        sentAt: now.toISOString()
      },
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `SMS check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
      executionTimeMs: Date.now() - startTime,
    };
  }
}

async function checkTrackingNotificationPipeline(checkType: HealthCheckType): Promise<HealthCheckResponse> {
  const startTime = Date.now();
  const testEmail = checkType.testEmailAddress;
  
  // Track results
  let emailSuccess = false;
  let emailError: string | null = null;
  let emailMessageId: string | null = null;
  let smsSuccess = false;
  let smsError: string | null = null;
  let smsMessageId: string | null = null;
  let smsConfigured = false;
  
  // Get sender info from centralized config
  const emailSenderConfig = getSendGridConfig();
  const emailSender = emailSenderConfig.fromEmail || 'NOT_CONFIGURED';
  const timestamp = new Date().toISOString();
  
  console.log('[TRACKING PIPELINE CHECK] Starting notification pipeline health check');
  console.log('[TRACKING PIPELINE CHECK] Test email:', testEmail || 'NOT_CONFIGURED');
  console.log('[TRACKING PIPELINE CHECK] Email sender:', emailSender);
  
  // 1. Test Email (Required)
  if (!testEmail) {
    return {
      status: 'skipped',
      message: 'No test email address configured. Set it in the check settings.',
      details: {
        emailSender,
        smsConfigured: false,
        lastTestTimestamp: timestamp,
      },
      executionTimeMs: Date.now() - startTime,
    };
  }
  
  try {
    console.log('[TRACKING PIPELINE CHECK] Testing email delivery...');
    const result = await sendEmailViaSendGrid({
      to: testEmail,
      subject: `[Tracking Pipeline Check] Test Notification - ${new Date().toLocaleString()}`,
      text: `This is a tracking notification pipeline test.\n\nTimestamp: ${timestamp}\nSender: ${emailSender}\n\nIf you received this email, the tracking notification email path is working.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #28a745;">🔔 Tracking Notification Pipeline Test</h2>
          <p>This is a tracking notification pipeline health check.</p>
          <table style="margin: 20px 0;">
            <tr><td><strong>Timestamp:</strong></td><td>${timestamp}</td></tr>
            <tr><td><strong>Sender:</strong></td><td>${emailSender}</td></tr>
          </table>
          <p>If you received this email, the tracking notification email path is working correctly.</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">AG Composites - Tracking Pipeline Health Check</p>
        </div>
      `,
    });
    
    if (result.success) {
      emailSuccess = true;
      emailMessageId = result.messageId || null;
      console.log('[TRACKING PIPELINE CHECK] ✅ Email sent successfully, messageId:', emailMessageId);
    } else {
      emailError = result.error || 'Unknown email error';
      console.error('[TRACKING PIPELINE CHECK] ❌ Email failed:', emailError);
    }
  } catch (error) {
    emailError = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TRACKING PIPELINE CHECK] ❌ Email exception:', emailError);
  }
  
  // 2. Test SMS (Optional - only if Twilio configured)
  const smsTwilioConfig = getTwilioConfig();
  smsConfigured = isTwilioConfigured();
  console.log('[TRACKING PIPELINE CHECK] SMS configured:', smsConfigured);
  
  if (smsConfigured) {
    // Get test phone from check type or global config
    let testPhone = checkType.testSmsPhone;
    if (!testPhone) {
      const config = await getHealthCheckConfig();
      testPhone = config?.testSmsPhone || null;
    }
    
    if (testPhone) {
      try {
        console.log('[TRACKING PIPELINE CHECK] Testing SMS delivery to:', testPhone);
        const twilio = await import('twilio');
        const twilioClient = twilio.default(smsTwilioConfig.accountSid, smsTwilioConfig.authToken);
        
        const config = await getHealthCheckConfig();
        const timezone = config?.timezone || 'America/Chicago';
        const now = new Date();
        
        const message = await twilioClient.messages.create({
          body: `[AG Composites] Tracking pipeline test - ${now.toLocaleString('en-US', { timeZone: timezone })}`,
          from: smsTwilioConfig.fromNumber,
          to: testPhone,
        });
        
        smsSuccess = true;
        smsMessageId = message.sid;
        console.log('[TRACKING PIPELINE CHECK] ✅ SMS sent successfully, sid:', smsMessageId);
      } catch (error) {
        smsError = error instanceof Error ? error.message : 'Unknown SMS error';
        console.error('[TRACKING PIPELINE CHECK] ❌ SMS failed:', smsError);
      }
    } else {
      console.log('[TRACKING PIPELINE CHECK] SMS skipped - no test phone configured');
    }
  }
  
  // 3. Determine final status
  const details = {
    emailSender,
    emailSuccess,
    emailMessageId,
    emailError,
    smsConfigured,
    smsSuccess,
    smsMessageId,
    smsError,
    smsAccountSidSource: smsTwilioConfig.accountSidSource || 'NOT SET',
    smsFromNumberSource: smsTwilioConfig.fromNumberSource || 'NOT SET',
    lastTestTimestamp: timestamp,
  };
  
  if (!emailSuccess) {
    // 🔴 Email failed - critical failure
    return {
      status: 'fail',
      message: `Email notification failed: ${emailError}. No tracking notifications can be delivered.`,
      details,
      executionTimeMs: Date.now() - startTime,
    };
  }
  
  if (smsConfigured && !smsSuccess) {
    // 🟡 Email works, SMS configured but failed
    return {
      status: 'warning',
      message: `Email working (${emailSender}), but SMS failed: ${smsError}`,
      details,
      executionTimeMs: Date.now() - startTime,
    };
  }
  
  if (emailSuccess && (!smsConfigured || smsSuccess)) {
    // 🟢 Fully working
    const smsStatus = smsConfigured ? 'SMS working' : 'SMS not configured';
    return {
      status: 'pass',
      message: `Tracking notifications operational. Email: ✓ (${emailSender}), ${smsStatus}`,
      details,
      executionTimeMs: Date.now() - startTime,
    };
  }
  
  // Fallback
  return {
    status: 'warning',
    message: 'Tracking notification pipeline check completed with mixed results',
    details,
    executionTimeMs: Date.now() - startTime,
  };
}

async function checkLinkHealth(): Promise<HealthCheckResponse> {
  const startTime = Date.now();
  
  try {
    // Get all enabled monitored links
    const links = await db.select().from(monitoredLinks).where(eq(monitoredLinks.isEnabled, true));
    
    if (links.length === 0) {
      return {
        status: 'skipped',
        message: 'No monitored links configured. Add links in the Link Health settings.',
        details: { linksChecked: 0 },
        executionTimeMs: Date.now() - startTime,
      };
    }
    
    const results: Array<{
      name: string;
      url: string;
      status: number | null;
      result: 'pass' | 'fail' | 'warning';
      error?: string;
      responseTimeMs: number;
    }> = [];
    
    let passCount = 0;
    let failCount = 0;
    let warningCount = 0;
    
    // Check each link
    for (const link of links) {
      const linkStartTime = Date.now();
      let status: number | null = null;
      let result: 'pass' | 'fail' | 'warning' = 'pass';
      let error: string | undefined;
      
      try {
        // Use HEAD request first (faster), fall back to GET if needed
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(link.url, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'follow',
        });
        
        clearTimeout(timeout);
        status = response.status;
        
        // Check if status matches expected
        const expectedStatus = link.expectedStatus || 200;
        if (status === expectedStatus) {
          result = 'pass';
          passCount++;
        } else if (status === 404) {
          result = 'fail';
          failCount++;
          error = `Got 404 Not Found (expected ${expectedStatus})`;
        } else if (status >= 400) {
          result = 'fail';
          failCount++;
          error = `Got ${status} error (expected ${expectedStatus})`;
        } else {
          result = 'warning';
          warningCount++;
          error = `Got ${status} (expected ${expectedStatus})`;
        }
      } catch (err) {
        result = 'fail';
        failCount++;
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            error = 'Request timed out after 10 seconds';
          } else {
            error = err.message;
          }
        } else {
          error = 'Unknown error';
        }
      }
      
      const responseTimeMs = Date.now() - linkStartTime;
      
      results.push({
        name: link.name,
        url: link.url,
        status,
        result,
        error,
        responseTimeMs,
      });
      
      // Update the link with latest check results
      await db.update(monitoredLinks)
        .set({
          lastCheckedAt: new Date(),
          lastStatus: status,
          lastCheckResult: result,
          consecutiveFailures: result === 'fail' 
            ? (link.consecutiveFailures || 0) + 1 
            : 0,
          updatedAt: new Date(),
        })
        .where(eq(monitoredLinks.id, link.id));
    }
    
    // Determine overall status
    let overallStatus: 'pass' | 'fail' | 'warning' = 'pass';
    let message = '';
    
    if (failCount > 0) {
      overallStatus = 'fail';
      const failedLinks = results.filter(r => r.result === 'fail').map(r => r.name);
      message = `${failCount} link(s) failed: ${failedLinks.join(', ')}`;
    } else if (warningCount > 0) {
      overallStatus = 'warning';
      message = `${warningCount} link(s) returned unexpected status codes`;
    } else {
      message = `All ${passCount} monitored links are healthy`;
    }
    
    return {
      status: overallStatus,
      message,
      details: {
        linksChecked: links.length,
        passCount,
        failCount,
        warningCount,
        results,
      },
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `Link health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

export async function runSingleCheckByName(checkName: string, runType: 'manual' | 'scheduled' = 'manual'): Promise<HealthCheckResult | null> {
  const batchId = nanoid();
  const [checkType] = await db
    .select()
    .from(healthCheckTypes)
    .where(eq(healthCheckTypes.name, checkName));

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
    scheduledTime: '07:00',
    timezone: 'America/Chicago',
    isScheduleEnabled: true,
  });
  console.log('✅ Seeded default health check config');
}

export async function ensureSmsHealthCheckExists(): Promise<void> {
  const existing = await db
    .select()
    .from(healthCheckTypes)
    .where(eq(healthCheckTypes.name, 'twilio_sms'))
    .limit(1);
  
  if (existing.length > 0) {
    return;
  }

  await db.insert(healthCheckTypes).values({
    name: 'twilio_sms',
    displayName: 'Twilio SMS Service',
    description: 'Sends a daily test SMS to verify text messaging is working (7:00 AM in your timezone)',
    category: 'sms',
    isBuiltIn: true,
    isEnabled: true,
    sortOrder: 5,
  });
  console.log('✅ Added Twilio SMS health check type');
}

export async function ensureTrackingPipelineHealthCheckExists(): Promise<void> {
  const existing = await db
    .select()
    .from(healthCheckTypes)
    .where(eq(healthCheckTypes.name, 'tracking_notification_pipeline'))
    .limit(1);
  
  if (existing.length > 0) {
    return;
  }

  await db.insert(healthCheckTypes).values({
    name: 'tracking_notification_pipeline',
    displayName: 'Tracking Notification Pipeline',
    description: 'Tests the complete tracking notification delivery path (email + optional SMS). Shows 🟢 if email works, 🟡 if email works but SMS fails, 🔴 if email fails.',
    category: 'notifications',
    isBuiltIn: true,
    isEnabled: true,
    sortOrder: 6,
  });
  console.log('✅ Added Tracking Notification Pipeline health check type');
}

export async function getHealthCheckConfig() {
  const [config] = await db.select().from(healthCheckConfig).limit(1);
  return config;
}

export async function updateHealthCheckConfig(updates: Partial<{ scheduledTime: string; notificationEmail: string; testSmsPhone: string; timezone: string; isScheduleEnabled: boolean }>) {
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

export async function updateHealthCheckType(checkId: number, updates: Partial<{ testEmailAddress: string; testSmsPhone: string; description: string }>) {
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
