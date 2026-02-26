import { Router } from 'express';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import {
  getAllTemplates,
  getTemplateByKey,
  updateTemplateWithVersioning,
  getTemplateVersionHistory,
} from '../../communication/registry';
import { enforceTemplateEditCapability } from '../../communication/capabilities';
import { sendCommunication } from '../../communication/send';
import { renderFromObject } from '../../communication/render';

const router = Router();

const SAFE_CSS_PROPERTIES = [
  'color', 'background-color', 'background',
  'font-size', 'font-weight', 'font-family', 'font-style',
  'text-align', 'text-decoration', 'text-transform',
  'line-height', 'letter-spacing',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-color', 'border-width', 'border-style', 'border-collapse', 'border-spacing',
  'border-radius',
  'width', 'max-width', 'min-width',
  'height', 'max-height', 'min-height',
  'display', 'vertical-align',
  'list-style-type', 'list-style',
  'white-space', 'word-break', 'overflow-wrap',
];

function buildAllowedStyles(): Record<string, Record<string, RegExp[]>> {
  const cssRule: RegExp[] = [/^.+$/];
  const styles: Record<string, Record<string, RegExp[]>> = {};
  const tags = [
    'a', 'img', 'td', 'th', 'table', 'div', 'span', 'p',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'ul', 'ol', 'li',
    'blockquote', 'pre', 'code', 'strong', 'b', 'em', 'i', 'u', 's',
    'tr', 'thead', 'tbody', 'body',
  ];
  for (const tag of tags) {
    styles[tag] = {};
    for (const prop of SAFE_CSS_PROPERTIES) {
      styles[tag][prop] = cssRule;
    }
  }
  return styles;
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'div', 'span', 'br', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li',
    'a', 'img',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code',
  ],
  allowedAttributes: {
    'a': ['href', 'target', 'rel', 'class', 'style'],
    'img': ['src', 'alt', 'width', 'height', 'class', 'style'],
    'td': ['colspan', 'rowspan', 'class', 'style'],
    'th': ['colspan', 'rowspan', 'class', 'style'],
    'table': ['class', 'style', 'border', 'cellpadding', 'cellspacing', 'width'],
    'div': ['class', 'style'],
    'span': ['class', 'style'],
    'p': ['class', 'style'],
    'h1': ['class', 'style'],
    'h2': ['class', 'style'],
    'h3': ['class', 'style'],
    'h4': ['class', 'style'],
    'h5': ['class', 'style'],
    'h6': ['class', 'style'],
    'br': [],
    'hr': ['class', 'style'],
    'ul': ['class', 'style'],
    'ol': ['class', 'style'],
    'li': ['class', 'style'],
    'blockquote': ['class', 'style'],
    'pre': ['class', 'style'],
    'code': ['class', 'style'],
    'strong': ['class', 'style'],
    'b': ['class', 'style'],
    'em': ['class', 'style'],
    'i': ['class', 'style'],
    'u': ['class', 'style'],
    's': ['class', 'style'],
    'tr': ['class', 'style'],
    'thead': ['class', 'style'],
    'tbody': ['class', 'style'],
  },
  allowedStyles: buildAllowedStyles(),
  disallowedTagsMode: 'discard',
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    'a': (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: 'noopener noreferrer',
      },
    }),
  },
};

function sanitizeTemplateHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

function requireAdminRole(req: any, res: any, next: any) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const role = (user.role || '').toUpperCase();
  if (role !== 'ADMIN' && role !== 'OWNER') {
    return res.status(403).json({ error: 'Only ADMIN and OWNER roles can access email template management' });
  }
  next();
}

router.use(requireAdminRole);

router.get('/', async (_req, res) => {
  try {
    const templates = await getAllTemplates(db);
    res.json(templates);
  } catch (err: any) {
    console.error('[EmailTemplates] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/:key', async (req, res) => {
  try {
    const template = await getTemplateByKey(db, req.params.key);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (err: any) {
    console.error('[EmailTemplates] GET /:key error:', err.message);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().nullable().optional(),
  allowedVariables: z.array(z.string()).optional(),
  attachmentRules: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  changeNote: z.string().min(1, 'Change note is required'),
});

router.put('/:key', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const template = await getTemplateByKey(db, req.params.key);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const updates = { ...parsed.data };
    if (updates.bodyHtml) {
      updates.bodyHtml = sanitizeTemplateHtml(updates.bodyHtml);
    }

    const result = await updateTemplateWithVersioning(db, {
      templateId: template.id,
      updates,
      updatedBy: userId ? String(userId) : undefined,
      changeNote: parsed.data.changeNote,
    });

    if (result.statusCode === 403) {
      return res.status(403).json({ error: result.error });
    }
    if (result.statusCode === 404) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result.template);
  } catch (err: any) {
    console.error('[EmailTemplates] PUT /:key error:', err.message);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.post('/:key/test-send', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.email) {
      return res.status(400).json({ error: 'Your user account does not have an email address configured. A test email can only be sent to your own address.' });
    }

    const capCheck = await enforceTemplateEditCapability(db, user.id);
    if (!capCheck.allowed) {
      return res.status(403).json({ error: capCheck.reason });
    }

    const template = await getTemplateByKey(db, req.params.key);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const mockContext: Record<string, string> = {};
    if (Array.isArray(template.allowedVariables)) {
      for (const v of template.allowedVariables) {
        mockContext[v] = `[TEST: ${v}]`;
      }
    }

    const result = await sendCommunication({
      templateKey: template.key,
      context: mockContext,
      to: user.email,
      triggeredBy: String(user.id),
      orderId: undefined,
      customerId: String(user.id),
      emailContext: 'test-send',
    });

    if (result.success) {
      res.json({ success: true, sentTo: user.email, messageId: result.messageId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err: any) {
    console.error('[EmailTemplates] POST /:key/test-send error:', err.message);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

router.get('/:key/versions', async (req, res) => {
  try {
    const template = await getTemplateByKey(db, req.params.key);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const versions = await getTemplateVersionHistory(db, template.id);
    res.json(versions);
  } catch (err: any) {
    console.error('[EmailTemplates] GET /:key/versions error:', err.message);
    res.status(500).json({ error: 'Failed to fetch version history' });
  }
});

router.post('/:key/preview', async (req, res) => {
  try {
    const template = await getTemplateByKey(db, req.params.key);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const mockContext: Record<string, string> = {};
    if (Array.isArray(template.allowedVariables)) {
      for (const v of template.allowedVariables) {
        mockContext[v] = `[${v}]`;
      }
    }

    const rendered = renderFromObject(template, mockContext);
    res.json({
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  } catch (err: any) {
    console.error('[EmailTemplates] POST /:key/preview error:', err.message);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

export default router;
