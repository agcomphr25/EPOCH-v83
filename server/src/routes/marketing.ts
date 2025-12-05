import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import {
  customers,
  customerTypes,
  marketingTemplates,
  marketingMessages,
  marketingRecipients,
  companySettings,
} from '../../schema';
import { eq, desc, and, sql, inArray, like, or } from 'drizzle-orm';
import { getUncachableSendGridClient } from '../../utils/sendgrid';
import twilio from 'twilio';

const router = Router();

interface CompanyBranding {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  companyLogo?: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateBrandedEmailHtml(
  content: string,
  customerName: string,
  branding: CompanyBranding
): string {
  const personalizedContent = content.replace(/\{\{name\}\}/g, customerName || 'Valued Customer');
  const htmlContent = personalizedContent;
  
  const websiteUrl = branding.companyWebsite.startsWith('http') 
    ? branding.companyWebsite 
    : `https://${branding.companyWebsite}`;
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${branding.companyName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; background: linear-gradient(135deg, #1a365d 0%, #2563eb 100%); border-radius: 8px 8px 0 0;">
              ${branding.companyLogo 
                ? `<img src="${branding.companyLogo}" alt="${branding.companyName}" style="max-height: 60px; max-width: 200px;">`
                : `<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${branding.companyName}</h1>`
              }
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">
              <div style="color: #333333; font-size: 16px; line-height: 1.6;">
                ${htmlContent}
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 10px 0; color: #1a365d; font-weight: 600; font-size: 18px;">
                      ${branding.companyName}
                    </p>
                    <p style="margin: 0 0 5px 0; color: #64748b; font-size: 14px;">
                      ${branding.companyAddress}
                    </p>
                    <p style="margin: 0 0 5px 0; color: #64748b; font-size: 14px;">
                      <a href="tel:${branding.companyPhone.replace(/[^\d+]/g, '')}" style="color: #2563eb; text-decoration: none;">
                        ${branding.companyPhone}
                      </a>
                    </p>
                    <p style="margin: 0 0 5px 0; color: #64748b; font-size: 14px;">
                      <a href="mailto:${branding.companyEmail}" style="color: #2563eb; text-decoration: none;">
                        ${branding.companyEmail}
                      </a>
                    </p>
                    <p style="margin: 0; color: #64748b; font-size: 14px;">
                      <a href="${websiteUrl}" style="color: #2563eb; text-decoration: none;">
                        ${branding.companyWebsite}
                      </a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Unsubscribe Footer -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                This email was sent by ${branding.companyName}.<br>
                If you no longer wish to receive these emails, please contact us.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function getCompanyBranding(): Promise<CompanyBranding> {
  const settings = await db.select().from(companySettings).limit(1);
  
  if (settings.length === 0) {
    return {
      companyName: 'AG Composites',
      companyAddress: '123 Business Street, City, ST 12345',
      companyPhone: '(555) 123-4567',
      companyEmail: 'info@agcomposites.com',
      companyWebsite: 'www.agcomposites.com',
    };
  }
  
  return {
    companyName: settings[0].companyName || 'AG Composites',
    companyAddress: settings[0].companyAddress || '',
    companyPhone: settings[0].companyPhone || '',
    companyEmail: settings[0].companyEmail || '',
    companyWebsite: settings[0].companyWebsite || '',
    companyLogo: settings[0].companyLogo,
  };
}

const templateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  category: z.string().optional().default('general'),
  isActive: z.boolean().optional().default(true),
  createdBy: z.string().optional(),
});

const bulkEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  customerTypeFilter: z.string().optional(),
  customerIds: z.array(z.number()).optional(),
  templateId: z.number().optional(),
  sentBy: z.string().optional(),
});

const bulkSmsSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(160, 'SMS must be 160 characters or less'),
  customerTypeFilter: z.string().optional(),
  customerIds: z.array(z.number()).optional(),
  sentBy: z.string().optional(),
});

router.get('/company-settings', async (req, res) => {
  try {
    const settings = await db.select().from(companySettings).limit(1);
    
    if (settings.length === 0) {
      return res.json({
        companyName: 'AG Composites',
        companyAddress: '123 Business Street, City, ST 12345',
        companyPhone: '(555) 123-4567',
        companyEmail: 'info@agcomposites.com',
        companyWebsite: 'www.agcomposites.com',
      });
    }
    
    res.json(settings[0]);
  } catch (error: any) {
    console.error('Error fetching company settings:', error);
    res.status(500).json({ error: 'Failed to fetch company settings' });
  }
});

router.post('/preview-email', async (req, res) => {
  try {
    const { content, customerName = 'John Smith' } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required for preview' });
    }
    
    const branding = await getCompanyBranding();
    const previewHtml = generateBrandedEmailHtml(content, customerName, branding);
    
    res.json({ 
      html: previewHtml,
      branding 
    });
  } catch (error: any) {
    console.error('Error generating preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

router.get('/templates', async (req, res) => {
  try {
    const templates = await db
      .select()
      .from(marketingTemplates)
      .where(eq(marketingTemplates.isActive, true))
      .orderBy(desc(marketingTemplates.createdAt));
    
    res.json(templates);
  } catch (error: any) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/templates', async (req, res) => {
  try {
    const data = templateSchema.parse(req.body);
    
    const [template] = await db
      .insert(marketingTemplates)
      .values({
        name: data.name,
        subject: data.subject,
        content: data.content,
        category: data.category,
        isActive: data.isActive,
        createdBy: data.createdBy || null,
      })
      .returning();
    
    res.json(template);
  } catch (error: any) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template', details: error.message });
  }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = templateSchema.parse(req.body);
    
    const [template] = await db
      .update(marketingTemplates)
      .set({
        name: data.name,
        subject: data.subject,
        content: data.content,
        category: data.category,
        isActive: data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(marketingTemplates.id, parseInt(id)))
      .returning();
    
    res.json(template);
  } catch (error: any) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template', details: error.message });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db
      .update(marketingTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(marketingTemplates.id, parseInt(id)));
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

router.get('/customer-types', async (req, res) => {
  try {
    const types = await db
      .select()
      .from(customerTypes)
      .orderBy(customerTypes.name);
    
    res.json(types);
  } catch (error: any) {
    console.error('Error fetching customer types:', error);
    res.status(500).json({ error: 'Failed to fetch customer types' });
  }
});

router.post('/customer-types', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const [newType] = await db
      .insert(customerTypes)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
      })
      .returning();
    
    res.status(201).json(newType);
  } catch (error: any) {
    console.error('Error creating customer type:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A customer type with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create customer type' });
  }
});

router.put('/customer-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const [updated] = await db
      .update(customerTypes)
      .set({
        name: name.trim(),
        description: description?.trim() || null,
      })
      .where(eq(customerTypes.id, parseInt(id)))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Customer type not found' });
    }
    
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating customer type:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A customer type with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to update customer type' });
  }
});

router.delete('/customer-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [deleted] = await db
      .delete(customerTypes)
      .where(eq(customerTypes.id, parseInt(id)))
      .returning();
    
    if (!deleted) {
      return res.status(404).json({ error: 'Customer type not found' });
    }
    
    res.json({ success: true, deleted });
  } catch (error: any) {
    console.error('Error deleting customer type:', error);
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Cannot delete customer type that has associated discounts' });
    }
    res.status(500).json({ error: 'Failed to delete customer type' });
  }
});

router.get('/customers', async (req, res) => {
  try {
    const { customerType, search, hasEmail, hasPhone, page = '1', limit = '50' } = req.query;
    
    let query = db.select().from(customers);
    const conditions: any[] = [eq(customers.isActive, true)];
    
    if (customerType && customerType !== 'all') {
      conditions.push(eq(customers.customerType, customerType as string));
    }
    
    if (hasEmail === 'true') {
      conditions.push(sql`${customers.email} IS NOT NULL AND ${customers.email} != ''`);
    }
    
    if (hasPhone === 'true') {
      conditions.push(sql`${customers.phone} IS NOT NULL AND ${customers.phone} != ''`);
    }
    
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          like(customers.name, searchTerm),
          like(customers.email, searchTerm),
          like(customers.company, searchTerm)
        )
      );
    }
    
    const filteredCustomers = await db
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(customers.name)
      .limit(parseInt(limit as string))
      .offset((parseInt(page as string) - 1) * parseInt(limit as string));
    
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(and(...conditions));
    
    res.json({
      customers: filteredCustomers,
      total: countResult[0]?.count || 0,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

router.get('/customers/count', async (req, res) => {
  try {
    const { customerType, hasEmail, hasPhone } = req.query;
    
    const conditions: any[] = [eq(customers.isActive, true)];
    
    if (customerType && customerType !== 'all') {
      conditions.push(eq(customers.customerType, customerType as string));
    }
    
    if (hasEmail === 'true') {
      conditions.push(sql`${customers.email} IS NOT NULL AND ${customers.email} != ''`);
    }
    
    if (hasPhone === 'true') {
      conditions.push(sql`${customers.phone} IS NOT NULL AND ${customers.phone} != ''`);
    }
    
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(and(...conditions));
    
    res.json({ count: countResult[0]?.count || 0 });
  } catch (error: any) {
    console.error('Error counting customers:', error);
    res.status(500).json({ error: 'Failed to count customers' });
  }
});

router.post('/send-bulk-email', async (req, res) => {
  try {
    const data = bulkEmailSchema.parse(req.body);
    
    let targetCustomers: any[] = [];
    
    if (data.customerIds && data.customerIds.length > 0) {
      targetCustomers = await db
        .select()
        .from(customers)
        .where(
          and(
            inArray(customers.id, data.customerIds),
            eq(customers.isActive, true),
            sql`${customers.email} IS NOT NULL AND ${customers.email} != ''`
          )
        );
    } else if (data.customerTypeFilter && data.customerTypeFilter !== 'all') {
      targetCustomers = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.customerType, data.customerTypeFilter),
            eq(customers.isActive, true),
            sql`${customers.email} IS NOT NULL AND ${customers.email} != ''`
          )
        );
    } else {
      targetCustomers = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.isActive, true),
            sql`${customers.email} IS NOT NULL AND ${customers.email} != ''`
          )
        );
    }
    
    if (targetCustomers.length === 0) {
      return res.status(400).json({ error: 'No customers found matching the criteria with valid email addresses' });
    }
    
    const [marketingMessage] = await db
      .insert(marketingMessages)
      .values({
        subject: data.subject,
        content: data.content,
        messageType: 'email',
        recipientCount: targetCustomers.length,
        successCount: 0,
        failedCount: 0,
        customerTypeFilter: data.customerTypeFilter || null,
        templateId: data.templateId || null,
        sentBy: data.sentBy || null,
        status: 'sending',
      })
      .returning();
    
    let successCount = 0;
    let failedCount = 0;
    const results: { email: string; success: boolean; error?: string }[] = [];
    
    try {
      const { client, fromEmail } = await getUncachableSendGridClient();
      const branding = await getCompanyBranding();
      
      for (const customer of targetCustomers) {
        try {
          const brandedHtml = generateBrandedEmailHtml(
            data.content,
            customer.name || 'Valued Customer',
            branding
          );
          
          await client.send({
            to: customer.email,
            from: fromEmail,
            subject: data.subject,
            text: data.content.replace(/\{\{name\}\}/g, customer.name || 'Valued Customer'),
            html: brandedHtml,
          });
          
          await db.insert(marketingRecipients).values({
            messageId: marketingMessage.id,
            customerId: customer.id,
            recipientEmail: customer.email,
            status: 'sent',
            sentAt: new Date(),
          });
          
          successCount++;
          results.push({ email: customer.email, success: true });
        } catch (emailError: any) {
          failedCount++;
          const errorDetails = emailError.response?.body?.errors?.[0]?.message || emailError.message;
          console.error('📧 SendGrid email error:', {
            email: customer.email,
            error: emailError.message,
            fullErrors: JSON.stringify(emailError.response?.body?.errors, null, 2),
            statusCode: emailError.code,
            fromEmail: fromEmail,
          });
          results.push({ email: customer.email, success: false, error: errorDetails });
          
          await db.insert(marketingRecipients).values({
            messageId: marketingMessage.id,
            customerId: customer.id,
            recipientEmail: customer.email,
            status: 'failed',
            errorMessage: errorDetails,
          });
        }
      }
    } catch (error: any) {
      console.error('SendGrid initialization error:', error);
      return res.status(500).json({
        error: 'SendGrid not configured',
        details: error.message,
        hint: 'Make sure SendGrid integration is set up with a verified sender email',
      });
    }
    
    await db
      .update(marketingMessages)
      .set({
        successCount,
        failedCount,
        status: 'completed',
      })
      .where(eq(marketingMessages.id, marketingMessage.id));
    
    res.json({
      success: true,
      messageId: marketingMessage.id,
      recipientCount: targetCustomers.length,
      successCount,
      failedCount,
      results,
    });
  } catch (error: any) {
    console.error('Bulk email error:', error);
    res.status(500).json({ error: 'Failed to send bulk email', details: error.message });
  }
});

router.post('/send-bulk-sms', async (req, res) => {
  try {
    const data = bulkSmsSchema.parse(req.body);
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (!accountSid || !authToken || !fromNumber) {
      return res.status(500).json({ error: 'Twilio credentials not configured' });
    }
    
    let targetCustomers: any[] = [];
    
    if (data.customerIds && data.customerIds.length > 0) {
      targetCustomers = await db
        .select()
        .from(customers)
        .where(
          and(
            inArray(customers.id, data.customerIds),
            eq(customers.isActive, true),
            sql`${customers.phone} IS NOT NULL AND ${customers.phone} != ''`
          )
        );
    } else if (data.customerTypeFilter && data.customerTypeFilter !== 'all') {
      targetCustomers = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.customerType, data.customerTypeFilter),
            eq(customers.isActive, true),
            sql`${customers.phone} IS NOT NULL AND ${customers.phone} != ''`
          )
        );
    } else {
      targetCustomers = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.isActive, true),
            sql`${customers.phone} IS NOT NULL AND ${customers.phone} != ''`
          )
        );
    }
    
    if (targetCustomers.length === 0) {
      return res.status(400).json({ error: 'No customers found matching the criteria with valid phone numbers' });
    }
    
    const [marketingMessage] = await db
      .insert(marketingMessages)
      .values({
        subject: 'SMS Marketing',
        content: data.content,
        messageType: 'sms',
        recipientCount: targetCustomers.length,
        successCount: 0,
        failedCount: 0,
        customerTypeFilter: data.customerTypeFilter || null,
        sentBy: data.sentBy || null,
        status: 'sending',
      })
      .returning();
    
    const twilioClient = twilio(accountSid, authToken);
    let successCount = 0;
    let failedCount = 0;
    const results: { phone: string; success: boolean; error?: string }[] = [];
    
    for (const customer of targetCustomers) {
      try {
        await twilioClient.messages.create({
          body: data.content,
          from: fromNumber,
          to: customer.phone,
        });
        
        await db.insert(marketingRecipients).values({
          messageId: marketingMessage.id,
          customerId: customer.id,
          recipientPhone: customer.phone,
          status: 'sent',
          sentAt: new Date(),
        });
        
        successCount++;
        results.push({ phone: customer.phone, success: true });
      } catch (smsError: any) {
        failedCount++;
        results.push({ phone: customer.phone, success: false, error: smsError.message });
        
        await db.insert(marketingRecipients).values({
          messageId: marketingMessage.id,
          customerId: customer.id,
          recipientPhone: customer.phone,
          status: 'failed',
          errorMessage: smsError.message,
        });
      }
    }
    
    await db
      .update(marketingMessages)
      .set({
        successCount,
        failedCount,
        status: 'completed',
      })
      .where(eq(marketingMessages.id, marketingMessage.id));
    
    res.json({
      success: true,
      messageId: marketingMessage.id,
      recipientCount: targetCustomers.length,
      successCount,
      failedCount,
      results,
    });
  } catch (error: any) {
    console.error('Bulk SMS error:', error);
    res.status(500).json({ error: 'Failed to send bulk SMS', details: error.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    
    const messages = await db
      .select()
      .from(marketingMessages)
      .orderBy(desc(marketingMessages.sentAt))
      .limit(parseInt(limit as string))
      .offset((parseInt(page as string) - 1) * parseInt(limit as string));
    
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(marketingMessages);
    
    res.json({
      messages,
      total: countResult[0]?.count || 0,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (error: any) {
    console.error('Error fetching marketing history:', error);
    res.status(500).json({ error: 'Failed to fetch marketing history' });
  }
});

router.get('/history/:id/recipients', async (req, res) => {
  try {
    const { id } = req.params;
    
    const recipients = await db
      .select()
      .from(marketingRecipients)
      .where(eq(marketingRecipients.messageId, parseInt(id)));
    
    res.json(recipients);
  } catch (error: any) {
    console.error('Error fetching recipients:', error);
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
});

export default router;
