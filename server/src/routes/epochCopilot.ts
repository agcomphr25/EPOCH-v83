import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';
import { and, desc, eq, ilike, or } from 'drizzle-orm';

import { db } from '../../db';
import {
  allOrders,
  customers,
  epochCopilotConversations,
  epochCopilotDraftGuides,
  epochCopilotMessages,
  purchaseOrders,
} from '../../schema';

const router = Router();

type User = {
  id?: number | string;
  username?: string;
  role?: string;
};

type RecordCard = {
  type: 'order' | 'customer' | 'purchase_order';
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badges: string[];
};

type GuideStep = {
  title: string;
  body: string;
  href?: string;
};

type CopilotGuide = {
  title: string;
  status: 'approved' | 'draft';
  label: string;
  routeHints: Array<{ label: string; href: string }>;
  steps: GuideStep[];
};

type CopilotPayload = {
  answer: string;
  mode: 'record_search' | 'how_to' | 'mixed' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  recordCards: RecordCard[];
  guide?: CopilotGuide;
  followUpQuestions: string[];
  ownerFinancialPlaceholder: {
    enabled: false;
    message: string;
  };
};

const sendMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

const saveDraftGuideSchema = z.object({
  title: z.string().trim().min(1).max(160),
  prompt: z.string().trim().max(4000).optional(),
  guide: z.record(z.any()),
});

const approvedNewOrderGuide: CopilotGuide = {
  title: 'Create a New Order',
  status: 'approved',
  label: 'Approved Guide',
  routeHints: [
    { label: 'Order Entry', href: '/order-entry' },
    { label: 'Customers', href: '/customers' },
    { label: 'Orders List', href: '/orders-list' },
  ],
  steps: [
    {
      title: 'Open Order Entry',
      body: 'Go to Order Entry and start a new sales order from the main order form.',
      href: '/order-entry',
    },
    {
      title: 'Choose the customer',
      body: 'Search for the customer, confirm the customer record, or create/update the customer before continuing.',
      href: '/customers',
    },
    {
      title: 'Enter order details',
      body: 'Add the customer PO, requested dates, order source, and any notes that should follow the order.',
    },
    {
      title: 'Select the product configuration',
      body: 'Choose the stock model or custom configuration, handedness, shank length, and required features.',
    },
    {
      title: 'Review pricing and production signals',
      body: 'Confirm discounts, price overrides, shipping, due date pressure, and any production notes before saving.',
    },
    {
      title: 'Save and verify',
      body: 'Save the order, then verify it appears in the order list with the expected customer, PO, status, and due date.',
      href: '/orders-list',
    },
  ],
};

function getUser(req: Request): Required<User> {
  const user = (req as any).user as User | undefined;
  return {
    id: user?.id ?? 'unknown',
    username: user?.username || 'unknown',
    role: user?.role || 'UNKNOWN',
  };
}

function titleFromMessage(message: string): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New Copilot conversation';
  return clean.length > 72 ? `${clean.slice(0, 69).trim()}...` : clean;
}

function looksLikeHowTo(message: string): boolean {
  return /\b(how do i|how to|walk me through|guide|steps|show me how|create a new order|new order)\b/i.test(
    message
  );
}

function isFinancialQuestion(message: string): boolean {
  return /\b(revenue|sales total|profit|margin|financial|invoice total|april 2026|income)\b/i.test(
    message
  );
}

function normalizeOpenAiJson(content: string): Partial<CopilotPayload> {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function getOpenAIClient(): OpenAI | null {
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

async function searchRecords(message: string): Promise<RecordCard[]> {
  const terms = Array.from(
    new Set(
      message
        .replace(/[^a-zA-Z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3)
    )
  ).slice(0, 8);

  if (terms.length === 0) return [];

  const recordCards: RecordCard[] = [];
  const patterns = terms.map((term) => `%${term}%`);

  const orderWhere = or(
    ...patterns.flatMap((pattern) => [
      ilike(allOrders.orderId, pattern),
      ilike(allOrders.customerId, pattern),
      ilike(allOrders.customerPO, pattern),
      ilike(allOrders.fbOrderNumber, pattern),
      ilike(allOrders.modelId, pattern),
      ilike(allOrders.notes, pattern),
    ])
  );

  const customerWhere = or(
    ...patterns.flatMap((pattern) => [
      ilike(customers.name, pattern),
      ilike(customers.customerKey, pattern),
      ilike(customers.company, pattern),
      ilike(customers.contact, pattern),
      ilike(customers.email, pattern),
    ])
  );

  const poWhere = or(
    ...patterns.flatMap((pattern) => [
      ilike(purchaseOrders.poNumber, pattern),
      ilike(purchaseOrders.customerId, pattern),
      ilike(purchaseOrders.customerName, pattern),
      ilike(purchaseOrders.notes, pattern),
    ])
  );

  const [orders, customerRows, poRows] = await Promise.all([
    db
      .select({
        orderId: allOrders.orderId,
        customerId: allOrders.customerId,
        customerPO: allOrders.customerPO,
        modelId: allOrders.modelId,
        status: allOrders.status,
        currentDepartment: allOrders.currentDepartment,
        dueDate: allOrders.dueDate,
      })
      .from(allOrders)
      .where(orderWhere)
      .limit(5),
    db
      .select({
        id: customers.id,
        name: customers.name,
        company: customers.company,
        contact: customers.contact,
        email: customers.email,
        phone: customers.phone,
      })
      .from(customers)
      .where(customerWhere)
      .limit(5),
    db
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        customerName: purchaseOrders.customerName,
        status: purchaseOrders.status,
        expectedDelivery: purchaseOrders.expectedDelivery,
      })
      .from(purchaseOrders)
      .where(poWhere)
      .limit(5),
  ]);

  for (const order of orders) {
    recordCards.push({
      type: 'order',
      id: order.orderId,
      title: `Order ${order.orderId}`,
      subtitle: [
        order.customerId,
        order.customerPO ? `PO ${order.customerPO}` : null,
        order.modelId,
      ]
        .filter(Boolean)
        .join(' - '),
      href: `/orders-list?search=${encodeURIComponent(order.orderId)}`,
      badges: [order.status, order.currentDepartment].filter(
        Boolean
      ) as string[],
    });
  }

  for (const customer of customerRows) {
    recordCards.push({
      type: 'customer',
      id: String(customer.id),
      title: customer.name,
      subtitle: [
        customer.company,
        customer.contact,
        customer.email || customer.phone,
      ]
        .filter(Boolean)
        .join(' - '),
      href: `/customers?search=${encodeURIComponent(customer.name)}`,
      badges: ['Customer'],
    });
  }

  for (const po of poRows) {
    recordCards.push({
      type: 'purchase_order',
      id: String(po.id),
      title: `PO ${po.poNumber}`,
      subtitle: [
        po.customerName,
        po.expectedDelivery ? `Expected ${po.expectedDelivery}` : null,
      ]
        .filter(Boolean)
        .join(' - '),
      href: `/purchase-orders?search=${encodeURIComponent(po.poNumber)}`,
      badges: [po.status].filter(Boolean) as string[],
    });
  }

  return recordCards.slice(0, 10);
}

function fallbackPayload(
  message: string,
  recordCards: RecordCard[],
  guide?: CopilotGuide
): CopilotPayload {
  const wantsFinancial = isFinancialQuestion(message);
  const wantsHowTo = looksLikeHowTo(message);

  if (wantsFinancial) {
    return {
      answer:
        "I don't know yet. Owner financial answers are intentionally disabled in Phase 1, but this placeholder keeps the path open for later.",
      mode: 'unknown',
      confidence: 'low',
      recordCards,
      guide,
      followUpQuestions: [
        'Do you want this saved as a future owner-financial Copilot capability?',
      ],
      ownerFinancialPlaceholder: {
        enabled: false,
        message:
          'Owner financial mode is planned for a later phase and is disabled in Phase 1.',
      },
    };
  }

  if (guide) {
    return {
      answer:
        guide.status === 'approved'
          ? 'Here is the approved EPOCH guide for creating a new order.'
          : 'I drafted a how-to guide from your question. Review it before treating it as an approved procedure.',
      mode: wantsHowTo && recordCards.length > 0 ? 'mixed' : 'how_to',
      confidence: guide.status === 'approved' ? 'high' : 'medium',
      recordCards,
      guide,
      followUpQuestions: [
        'Should this become a saved draft guide?',
        'Which role should this guide be written for?',
      ],
      ownerFinancialPlaceholder: {
        enabled: false,
        message:
          'Owner financial mode is planned for a later phase and is disabled in Phase 1.',
      },
    };
  }

  if (recordCards.length > 0) {
    return {
      answer:
        'I found matching EPOCH records. Open the cards below to verify the exact order, customer, or purchase order.',
      mode: 'record_search',
      confidence: 'medium',
      recordCards,
      followUpQuestions: [
        'Which matching record should I focus on?',
        'Do you want a guide tied to one of these records?',
      ],
      ownerFinancialPlaceholder: {
        enabled: false,
        message:
          'Owner financial mode is planned for a later phase and is disabled in Phase 1.',
      },
    };
  }

  return {
    answer:
      "I don't know yet. I could not find a matching EPOCH record or approved guide for that question.",
    mode: 'unknown',
    confidence: 'low',
    recordCards,
    followUpQuestions: [
      'Can you give me an order number, customer name, PO number, or the EPOCH task you are trying to complete?',
    ],
    ownerFinancialPlaceholder: {
      enabled: false,
      message:
        'Owner financial mode is planned for a later phase and is disabled in Phase 1.',
    },
  };
}

function guideForMessage(message: string): CopilotGuide | undefined {
  if (
    /\b(create|enter|add|new)\b.*\border\b/i.test(message) ||
    /\bnew order\b/i.test(message)
  ) {
    return approvedNewOrderGuide;
  }

  if (!looksLikeHowTo(message)) return undefined;

  return {
    title: titleFromMessage(message).replace(/\?$/, ''),
    status: 'draft',
    label: 'Draft Guide',
    routeHints: [],
    steps: [
      {
        title: 'Clarify the EPOCH task',
        body: 'Identify the page, record type, and outcome the user needs before turning this into an approved procedure.',
      },
      {
        title: 'Find the closest EPOCH page',
        body: 'Use navigation and record search to locate the order, customer, purchase order, or module involved.',
      },
      {
        title: 'Capture the working steps',
        body: 'Write the exact clicks, fields, checks, and save/verification step needed for the task.',
      },
    ],
  };
}

async function askOpenAI(
  message: string,
  recordCards: RecordCard[],
  guide?: CopilotGuide
): Promise<Partial<CopilotPayload>> {
  const openai = getOpenAIClient();
  if (!openai) return {};

  const response = await openai.chat.completions.create({
    model: process.env.EPOCH_COPILOT_MODEL || 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You are EPOCH Copilot inside a manufacturing ERP.',
          'Phase 1 is admin-only and excludes owner financial answers.',
          'Answer only from provided EPOCH records and guide context.',
          'If the context is insufficient, say "I don\'t know" clearly.',
          'For how-to requests, provide practical steps and label generated procedures as Draft Guide unless an approved guide is provided.',
          'Return JSON with answer, mode, confidence, guide, and followUpQuestions.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          question: message,
          matchedRecords: recordCards,
          guideContext: guide,
          ownerFinancialMode: { enabled: false },
        }),
      },
    ],
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content || '{}';
  return normalizeOpenAiJson(content);
}

function mergePayload(
  base: CopilotPayload,
  ai: Partial<CopilotPayload>
): CopilotPayload {
  return {
    ...base,
    answer:
      typeof ai.answer === 'string' && ai.answer.trim()
        ? ai.answer
        : base.answer,
    mode: ai.mode || base.mode,
    confidence: ai.confidence || base.confidence,
    guide: ai.guide
      ? ({ ...base.guide, ...ai.guide } as CopilotGuide)
      : base.guide,
    followUpQuestions:
      Array.isArray(ai.followUpQuestions) && ai.followUpQuestions.length > 0
        ? ai.followUpQuestions.slice(0, 3)
        : base.followUpQuestions,
    recordCards: base.recordCards,
    ownerFinancialPlaceholder: base.ownerFinancialPlaceholder,
  };
}

async function ensureConversation(
  conversationId: string | undefined,
  user: Required<User>,
  firstMessage: string
) {
  if (conversationId) {
    const [existing] = await db
      .select()
      .from(epochCopilotConversations)
      .where(
        and(
          eq(epochCopilotConversations.id, conversationId),
          eq(epochCopilotConversations.username, user.username)
        )
      )
      .limit(1);
    return existing;
  }

  const [created] = await db
    .insert(epochCopilotConversations)
    .values({
      userId: String(user.id),
      username: user.username,
      title: titleFromMessage(firstMessage),
    } as any)
    .returning();
  return created;
}

router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const conversations = await db
      .select()
      .from(epochCopilotConversations)
      .where(eq(epochCopilotConversations.username, user.username))
      .orderBy(desc(epochCopilotConversations.updatedAt))
      .limit(50);
    res.json(conversations);
  } catch (error) {
    console.error('[epoch-copilot] GET /conversations error:', error);
    res.status(500).json({ error: 'Failed to load Copilot conversations' });
  }
});

router.post('/conversations', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const parsed = createConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }
    const [conversation] = await db
      .insert(epochCopilotConversations)
      .values({
        userId: String(user.id),
        username: user.username,
        title: parsed.data.title || 'New Copilot conversation',
      } as any)
      .returning();
    res.status(201).json(conversation);
  } catch (error) {
    console.error('[epoch-copilot] POST /conversations error:', error);
    res.status(500).json({ error: 'Failed to create Copilot conversation' });
  }
});

router.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const [conversation] = await db
      .select()
      .from(epochCopilotConversations)
      .where(
        and(
          eq(epochCopilotConversations.id, req.params.id),
          eq(epochCopilotConversations.username, user.username)
        )
      )
      .limit(1);
    if (!conversation) {
      res.status(404).json({ error: 'Copilot conversation not found' });
      return;
    }
    const messages = await db
      .select()
      .from(epochCopilotMessages)
      .where(eq(epochCopilotMessages.conversationId, conversation.id))
      .orderBy(epochCopilotMessages.createdAt);
    res.json({ conversation, messages });
  } catch (error) {
    console.error('[epoch-copilot] GET /conversations/:id error:', error);
    res.status(500).json({ error: 'Failed to load Copilot conversation' });
  }
});

router.post(
  '/conversations/:id?/messages',
  async (req: Request, res: Response) => {
    try {
      const parsed = sendMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues });
        return;
      }

      const user = getUser(req);
      const conversation = await ensureConversation(
        req.params.id,
        user,
        parsed.data.message
      );
      if (!conversation) {
        res.status(404).json({ error: 'Copilot conversation not found' });
        return;
      }

      const recordCards = await searchRecords(parsed.data.message);
      const seededGuide = guideForMessage(parsed.data.message);
      const base = fallbackPayload(
        parsed.data.message,
        recordCards,
        seededGuide
      );
      const aiPayload = await askOpenAI(
        parsed.data.message,
        recordCards,
        seededGuide
      );
      const payload = mergePayload(base, aiPayload);

      const [userMessage] = await db
        .insert(epochCopilotMessages)
        .values({
          conversationId: conversation.id,
          role: 'user',
          content: parsed.data.message,
        } as any)
        .returning();

      const [assistantMessage] = await db
        .insert(epochCopilotMessages)
        .values({
          conversationId: conversation.id,
          role: 'assistant',
          content: payload.answer,
          payload,
        } as any)
        .returning();

      await db
        .update(epochCopilotConversations)
        .set({
          title:
            conversation.title === 'New Copilot conversation'
              ? titleFromMessage(parsed.data.message)
              : conversation.title,
          updatedAt: new Date(),
        } as any)
        .where(eq(epochCopilotConversations.id, conversation.id));

      res.json({
        conversation: {
          ...conversation,
          title:
            conversation.title === 'New Copilot conversation'
              ? titleFromMessage(parsed.data.message)
              : conversation.title,
        },
        userMessage,
        assistantMessage,
      });
    } catch (error) {
      console.error('[epoch-copilot] POST /messages error:', error);
      res.status(500).json({ error: 'Failed to ask EPOCH Copilot' });
    }
  }
);

router.get('/draft-guides', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const drafts = await db
      .select()
      .from(epochCopilotDraftGuides)
      .where(eq(epochCopilotDraftGuides.createdByUsername, user.username))
      .orderBy(desc(epochCopilotDraftGuides.createdAt))
      .limit(50);
    res.json(drafts);
  } catch (error) {
    console.error('[epoch-copilot] GET /draft-guides error:', error);
    res.status(500).json({ error: 'Failed to load draft guides' });
  }
});

router.post('/draft-guides', async (req: Request, res: Response) => {
  try {
    const parsed = saveDraftGuideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }

    const user = getUser(req);
    const [draft] = await db
      .insert(epochCopilotDraftGuides)
      .values({
        title: parsed.data.title,
        prompt: parsed.data.prompt,
        guide: parsed.data.guide,
        createdByUserId: String(user.id),
        createdByUsername: user.username,
        status: 'draft',
      } as any)
      .returning();

    res.status(201).json(draft);
  } catch (error) {
    console.error('[epoch-copilot] POST /draft-guides error:', error);
    res.status(500).json({ error: 'Failed to save draft guide' });
  }
});

export default router;
