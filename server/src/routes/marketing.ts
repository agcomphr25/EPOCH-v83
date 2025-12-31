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
import { getTwilioConfig, isTwilioConfigured } from '../../config/notifications';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

const LOGO_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'company-branding');
if (!fs.existsSync(LOGO_UPLOAD_DIR)) {
  fs.mkdirSync(LOGO_UPLOAD_DIR, { recursive: true });
}

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LOGO_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `company-logo${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG and JPEG files are allowed'));
    }
  },
});

interface CompanyBranding {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  companyLogo?: string | null;
  hasInlineLogo?: boolean;
}

interface CompanyBrandingWithLogo extends CompanyBranding {
  logoAttachment?: { content: string; type: string } | null;
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
  
  let logoHtml: string;
  if (branding.hasInlineLogo) {
    logoHtml = `<img src="cid:companyLogo" alt="${branding.companyName}" style="max-height: 60px; max-width: 200px;">`;
  } else if (branding.companyLogo) {
    logoHtml = `<img src="${branding.companyLogo}" alt="${branding.companyName}" style="max-height: 60px; max-width: 200px;">`;
  } else {
    logoHtml = `<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${branding.companyName}</h1>`;
  }
  
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
              ${logoHtml}
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
      hasInlineLogo: false,
    };
  }
  
  const logoData = getLogoForEmail();
  const hasValidLogoAttachment: boolean = logoData !== null && !!logoData.content && logoData.content.length > 0;
  
  return {
    companyName: settings[0].companyName || 'AG Composites',
    companyAddress: settings[0].companyAddress || '',
    companyPhone: settings[0].companyPhone || '',
    companyEmail: settings[0].companyEmail || '',
    companyWebsite: settings[0].companyWebsite || '',
    companyLogo: hasValidLogoAttachment ? null : settings[0].companyLogoUrl,
    hasInlineLogo: hasValidLogoAttachment,
  };
}

async function getCompanyBrandingWithLogo(): Promise<CompanyBrandingWithLogo> {
  const settings = await db.select().from(companySettings).limit(1);
  
  if (settings.length === 0) {
    return {
      companyName: 'AG Composites',
      companyAddress: '123 Business Street, City, ST 12345',
      companyPhone: '(555) 123-4567',
      companyEmail: 'info@agcomposites.com',
      companyWebsite: 'www.agcomposites.com',
      hasInlineLogo: false,
      logoAttachment: null,
    };
  }
  
  const logoData = getLogoForEmail();
  const hasValidLogoAttachment: boolean = logoData !== null && !!logoData.content && logoData.content.length > 0;
  
  return {
    companyName: settings[0].companyName || 'AG Composites',
    companyAddress: settings[0].companyAddress || '',
    companyPhone: settings[0].companyPhone || '',
    companyEmail: settings[0].companyEmail || '',
    companyWebsite: settings[0].companyWebsite || '',
    companyLogo: hasValidLogoAttachment ? null : settings[0].companyLogoUrl,
    hasInlineLogo: hasValidLogoAttachment,
    logoAttachment: hasValidLogoAttachment ? logoData : null,
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

router.get('/email-config', async (req, res) => {
  try {
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Not configured';
    const replyToEmail = 'sales@agcomposites.com';
    const replyToName = 'A G Composites Sales';
    
    res.json({
      fromEmail,
      fromName: 'A G Composites',
      replyToEmail,
      replyToName,
      isConfigured: !!process.env.SENDGRID_FROM_EMAIL && !!process.env.SENDGRID_API_KEY,
    });
  } catch (error: any) {
    console.error('Error fetching email config:', error);
    res.status(500).json({ error: 'Failed to fetch email configuration' });
  }
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
        companyLogoUrl: null,
      });
    }
    
    res.json(settings[0]);
  } catch (error: any) {
    console.error('Error fetching company settings:', error);
    res.status(500).json({ error: 'Failed to fetch company settings' });
  }
});

router.patch('/company-settings', async (req, res) => {
  try {
    const { companyLogoUrl } = req.body;
    
    const existingSettings = await db.select().from(companySettings).limit(1);
    
    if (existingSettings.length === 0) {
      const newSettings = await db.insert(companySettings).values({
        companyName: 'AG Composites',
        companyAddress: '230 Hamer Road Owens Cross Roads, AL 35763',
        companyPhone: '256-723-8381',
        companyEmail: 'sales@agcomposites.com',
        companyWebsite: 'www.agcomposites.com',
        companyLogoUrl: companyLogoUrl || null,
      }).returning();
      return res.json(newSettings[0]);
    }
    
    const updatedSettings = await db
      .update(companySettings)
      .set({ 
        companyLogoUrl: companyLogoUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(companySettings.id, existingSettings[0].id))
      .returning();
    
    res.json(updatedSettings[0]);
  } catch (error: any) {
    console.error('Error updating company settings:', error);
    res.status(500).json({ error: 'Failed to update company settings' });
  }
});

router.post('/company-logo', logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Only PNG and JPEG files are allowed.' });
    }

    const existingSettings = await db.select().from(companySettings).limit(1);
    
    if (existingSettings.length > 0 && existingSettings[0].companyLogoFilename) {
      const oldLogoPath = path.join(LOGO_UPLOAD_DIR, existingSettings[0].companyLogoFilename);
      if (fs.existsSync(oldLogoPath) && existingSettings[0].companyLogoFilename !== req.file.filename) {
        try {
          fs.unlinkSync(oldLogoPath);
        } catch (e) {
          console.warn('Could not delete old logo file:', e);
        }
      }
    }
    
    if (existingSettings.length === 0) {
      await db.insert(companySettings).values({
        companyName: 'AG Composites',
        companyAddress: '230 Hamer Road Owens Cross Roads, AL 35763',
        companyPhone: '256-723-8381',
        companyEmail: 'sales@agcomposites.com',
        companyWebsite: 'www.agcomposites.com',
        companyLogoFilename: req.file.filename,
        companyLogoMimetype: req.file.mimetype,
      });
    } else {
      await db
        .update(companySettings)
        .set({
          companyLogoFilename: req.file.filename,
          companyLogoMimetype: req.file.mimetype,
          companyLogoUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(companySettings.id, existingSettings[0].id));
    }

    res.json({ 
      success: true, 
      filename: req.file.filename,
      mimetype: req.file.mimetype,
    });
  } catch (error: any) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

router.get('/company-logo', async (req, res) => {
  try {
    const settings = await db.select().from(companySettings).limit(1);
    
    if (settings.length === 0 || !settings[0].companyLogoFilename) {
      return res.status(404).json({ error: 'No logo found' });
    }

    const logoPath = path.join(LOGO_UPLOAD_DIR, settings[0].companyLogoFilename);
    
    if (!fs.existsSync(logoPath)) {
      return res.status(404).json({ error: 'Logo file not found' });
    }

    const logoData = fs.readFileSync(logoPath);
    const base64Logo = logoData.toString('base64');
    const mimetype = settings[0].companyLogoMimetype || 'image/png';
    
    res.json({
      dataUrl: `data:${mimetype};base64,${base64Logo}`,
      filename: settings[0].companyLogoFilename,
      mimetype: mimetype,
    });
  } catch (error: any) {
    console.error('Error fetching logo:', error);
    res.status(500).json({ error: 'Failed to fetch logo' });
  }
});

router.delete('/company-logo', async (req, res) => {
  try {
    const settings = await db.select().from(companySettings).limit(1);
    
    if (settings.length > 0 && settings[0].companyLogoFilename) {
      const logoPath = path.join(LOGO_UPLOAD_DIR, settings[0].companyLogoFilename);
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
      
      await db
        .update(companySettings)
        .set({
          companyLogoFilename: null,
          companyLogoMimetype: null,
          updatedAt: new Date(),
        })
        .where(eq(companySettings.id, settings[0].id));
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting logo:', error);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});

export function getLogoForEmail(): { content: string; type: string } | null {
  try {
    const files = fs.readdirSync(LOGO_UPLOAD_DIR);
    const logoFile = files.find(f => f.startsWith('company-logo'));
    
    if (!logoFile) return null;
    
    const logoPath = path.join(LOGO_UPLOAD_DIR, logoFile);
    const logoData = fs.readFileSync(logoPath);
    const base64Logo = logoData.toString('base64');
    
    const ext = path.extname(logoFile).toLowerCase();
    let mimetype = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mimetype = 'image/jpeg';
    if (ext === '.svg') mimetype = 'image/svg+xml';
    
    return { content: base64Logo, type: mimetype };
  } catch (error) {
    console.error('Error reading logo for email:', error);
    return null;
  }
}

router.post('/preview-email', async (req, res) => {
  try {
    const { content, customerName = 'John Smith' } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required for preview' });
    }
    
    const branding = await getCompanyBrandingWithLogo();
    
    let previewBranding: CompanyBranding = { ...branding };
    if (branding.hasInlineLogo && branding.logoAttachment) {
      previewBranding.companyLogo = `data:${branding.logoAttachment.type};base64,${branding.logoAttachment.content}`;
      previewBranding.hasInlineLogo = false;
    }
    
    const previewHtml = generateBrandedEmailHtml(content, customerName, previewBranding);
    
    res.json({ 
      html: previewHtml,
      branding: previewBranding
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
      const branding = await getCompanyBrandingWithLogo();
      
      console.log('📧 Bulk email branding:', {
        hasInlineLogo: branding.hasInlineLogo,
        hasLogoAttachment: !!branding.logoAttachment,
        logoAttachmentSize: branding.logoAttachment?.content?.length || 0,
      });
      
      for (const customer of targetCustomers) {
        try {
          const brandedHtml = generateBrandedEmailHtml(
            data.content,
            customer.name || 'Valued Customer',
            branding
          );
          
          const emailPayload: any = {
            to: customer.email,
            from: fromEmail,
            subject: data.subject,
            text: data.content.replace(/\{\{name\}\}/g, customer.name || 'Valued Customer'),
            html: brandedHtml,
          };
          
          if (branding.hasInlineLogo && branding.logoAttachment) {
            emailPayload.attachments = [{
              content: branding.logoAttachment.content,
              filename: 'company-logo.png',
              type: branding.logoAttachment.type,
              disposition: 'inline',
              content_id: 'companyLogo',
            }];
          }
          
          await client.send(emailPayload);
          
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
    
    // Use centralized Twilio config
    const twilioConfig = getTwilioConfig();
    
    if (!isTwilioConfigured()) {
      console.error('Missing Twilio config:', { accountSid: !!twilioConfig.accountSid, authToken: !!twilioConfig.authToken, fromNumber: !!twilioConfig.fromNumber });
      return res.status(500).json({ error: 'Twilio credentials not configured' });
    }
    
    const fromNumber = twilioConfig.fromNumber;
    
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
    
    const twilioClient = twilio(twilioConfig.accountSid, twilioConfig.authToken);
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
