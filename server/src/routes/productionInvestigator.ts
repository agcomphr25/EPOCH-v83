import { Router, type Request, type Response } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import {
  productionInvestigatorActivity,
  productionInvestigatorConversations,
  productionInvestigatorMessages,
} from '../../schema';
import { investigateProductionQuestion } from '../services/productionInvestigator.service';

const router = Router();

const messageSchema = z.object({ message: z.string().trim().min(1).max(4000) });
const conversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

function getUser(req: Request) {
  const user = (req as any).user as
    | { id?: number | string; username?: string; role?: string }
    | undefined;
  return {
    id: user?.id == null ? null : String(user.id),
    username: user?.username || 'unknown',
  };
}

function titleFromQuestion(question: string) {
  const value = question.replace(/\s+/g, ' ').trim();
  return value.length > 72 ? `${value.slice(0, 69).trim()}...` : value;
}

function retentionDate() {
  const value = new Date();
  value.setFullYear(value.getFullYear() + 1);
  return value;
}

async function ownedConversation(id: string, username: string) {
  const [conversation] = await db
    .select()
    .from(productionInvestigatorConversations)
    .where(
      and(
        eq(productionInvestigatorConversations.id, id),
        eq(productionInvestigatorConversations.username, username)
      )
    )
    .limit(1);
  return conversation;
}

router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const conversations = await db
      .select()
      .from(productionInvestigatorConversations)
      .where(eq(productionInvestigatorConversations.username, user.username))
      .orderBy(desc(productionInvestigatorConversations.updatedAt))
      .limit(50);
    res.json(conversations);
  } catch (error) {
    console.error(
      '[production-investigator] list conversations failed:',
      error
    );
    res.status(500).json({ error: 'Failed to load production investigations' });
  }
});

router.post('/conversations', async (req: Request, res: Response) => {
  try {
    const parsed = conversationSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues });
    const user = getUser(req);
    const [conversation] = await db
      .insert(productionInvestigatorConversations)
      .values({
        userId: user.id,
        username: user.username,
        title: parsed.data.title || 'New production investigation',
        retentionUntil: retentionDate(),
      })
      .returning();
    res.status(201).json(conversation);
  } catch (error) {
    console.error(
      '[production-investigator] create conversation failed:',
      error
    );
    res
      .status(500)
      .json({ error: 'Failed to create production investigation' });
  }
});

router.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const conversation = await ownedConversation(req.params.id, user.username);
    if (!conversation)
      return res
        .status(404)
        .json({ error: 'Production investigation not found' });
    const messages = await db
      .select()
      .from(productionInvestigatorMessages)
      .where(eq(productionInvestigatorMessages.conversationId, conversation.id))
      .orderBy(asc(productionInvestigatorMessages.createdAt));
    const activities = await db
      .select()
      .from(productionInvestigatorActivity)
      .where(eq(productionInvestigatorActivity.conversationId, conversation.id))
      .orderBy(
        asc(productionInvestigatorActivity.createdAt),
        asc(productionInvestigatorActivity.sequence)
      );
    res.json({ conversation, messages, activities });
  } catch (error) {
    console.error('[production-investigator] load conversation failed:', error);
    res.status(500).json({ error: 'Failed to load production investigation' });
  }
});

router.post(
  '/conversations/:id?/messages',
  async (req: Request, res: Response) => {
    try {
      const parsed = messageSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.issues });
      const user = getUser(req);
      let conversation = req.params.id
        ? await ownedConversation(req.params.id, user.username)
        : undefined;
      if (req.params.id && !conversation) {
        return res
          .status(404)
          .json({ error: 'Production investigation not found' });
      }
      if (!conversation) {
        [conversation] = await db
          .insert(productionInvestigatorConversations)
          .values({
            userId: user.id,
            username: user.username,
            title: titleFromQuestion(parsed.data.message),
            retentionUntil: retentionDate(),
          })
          .returning();
      }

      const [userMessage] = await db
        .insert(productionInvestigatorMessages)
        .values({
          conversationId: conversation.id,
          role: 'user',
          content: parsed.data.message,
        })
        .returning();

      const result = await investigateProductionQuestion(parsed.data.message);
      const [assistantMessage] = await db
        .insert(productionInvestigatorMessages)
        .values({
          conversationId: conversation.id,
          role: 'assistant',
          content: result.answer,
          payload: { traceId: result.traceId, partial: result.partial },
        })
        .returning();

      if (result.activities.length > 0) {
        await db.insert(productionInvestigatorActivity).values(
          result.activities.map((activity) => ({
            conversationId: conversation!.id,
            messageId: assistantMessage.id,
            traceId: activity.traceId,
            sequence: activity.sequence,
            toolName: activity.toolName,
            sanitizedArguments: activity.sanitizedArguments,
            rationale: activity.rationale,
            status: activity.status,
            resultSummary: activity.resultSummary,
            durationMs: activity.durationMs,
            errorCode: activity.errorCode,
          }))
        );
      }

      await db
        .update(productionInvestigatorConversations)
        .set({
          title:
            conversation.title === 'New production investigation'
              ? titleFromQuestion(parsed.data.message)
              : conversation.title,
          updatedAt: new Date(),
        })
        .where(eq(productionInvestigatorConversations.id, conversation.id));

      res.json({
        conversation,
        userMessage,
        assistantMessage,
        activities: result.activities,
      });
    } catch (error) {
      console.error('[production-investigator] investigation failed:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Production investigation failed',
      });
    }
  }
);

export default router;
