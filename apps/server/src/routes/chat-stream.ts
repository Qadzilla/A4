import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { Router, type Response, type Router as RouterType } from 'express';
import { db } from '../db';
import { aiUsage, conversations, messages } from '../db/schema';
import { DEV_AUTH_BYPASS } from '../env';
import { buildWorkspaceContext } from '../services/ai-context';
import { AnthropicServiceError, streamChatCompletion } from '../services/anthropic';

const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-opus-4-6': { inputPerMTok: 15, outputPerMTok: 75 },
};

export function calculateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return Math.round((inputCost + outputCost) * 100);
}

export const chatStreamRouter: RouterType = Router();

function getUserId(req: any): string | null {
  if (DEV_AUTH_BYPASS) return 'dev-user-001';
  return req.auth?.userId ?? null;
}

function sendSSE(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const ERROR_MESSAGES: Record<string, string> = {
  ANTHROPIC_RATE_LIMIT: 'AI service is busy. Please try again in a moment.',
  ANTHROPIC_OVERLOADED: 'AI service is temporarily overloaded. Please try again.',
  ANTHROPIC_AUTH_ERROR: 'AI service configuration error. Please contact support.',
};

chatStreamRouter.post('/', async (req, res) => {
  // 1. Auth
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // 2. Parse body
  const { conversationId } = req.body ?? {};
  if (!conversationId || typeof conversationId !== 'string') {
    res.status(400).json({ error: 'conversationId is required' });
    return;
  }

  // 3. Load conversation
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));

  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  // 4. Load messages
  const dbMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  if (dbMessages.length === 0) {
    res.status(400).json({ error: 'Conversation has no messages' });
    return;
  }

  // 5. Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Track client disconnect
  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  try {
    // 6. Build system prompt
    const systemPrompt = await buildWorkspaceContext(db, userId, conversation.workspaceId);

    // 7. Format messages for Anthropic
    const anthropicMessages = dbMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // 8. Send message_start event
    const assistantMessageId = randomUUID();
    sendSSE(res, { type: 'message_start', messageId: assistantMessageId });

    // 9. Call Anthropic streaming API
    const stream = await streamChatCompletion({
      messages: anthropicMessages,
      systemPrompt,
      model: conversation.model,
    });

    // 10. Iterate stream events
    let accumulatedText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (aborted) break;

      if (event.type === 'message_start') {
        const msg = (event as any).message;
        if (msg?.usage?.input_tokens) {
          inputTokens = msg.usage.input_tokens;
        }
      } else if (event.type === 'content_block_delta') {
        const delta = (event as any).delta;
        if (delta?.type === 'text_delta' && delta.text) {
          accumulatedText += delta.text;
          sendSSE(res, { type: 'text_delta', text: delta.text });
        }
      } else if (event.type === 'message_delta') {
        const usage = (event as any).usage;
        if (usage?.output_tokens) {
          outputTokens = usage.output_tokens;
        }
      }
    }

    // 11. Send done event
    if (!aborted) {
      sendSSE(res, { type: 'done', usage: { inputTokens, outputTokens } });
    }

    // 12. Persist assistant message (even if aborted, as long as we have content)
    if (accumulatedText.length > 0) {
      await db.insert(messages).values({
        id: assistantMessageId,
        conversationId,
        userId,
        role: 'assistant',
        content: accumulatedText,
        tokenCount: inputTokens + outputTokens,
        model: conversation.model,
        createdAt: new Date(),
      });

      // 13. Update conversation updatedAt + auto-generate title from first user message
      const updateSet: { updatedAt: Date; title?: string } = { updatedAt: new Date() };
      if (!conversation.title) {
        const firstUserMsg = dbMessages.find((m) => m.role === 'user');
        if (firstUserMsg) {
          let title = firstUserMsg.content.trim().replace(/\s+/g, ' ');
          if (title.length > 50) {
            title = `${title.slice(0, 50).replace(/\s\S*$/, '')}…`;
          }
          updateSet.title = title;
        }
      }
      await db
        .update(conversations)
        .set(updateSet)
        .where(eq(conversations.id, conversationId));

      // 14. Log AI usage
      await db.insert(aiUsage).values({
        id: randomUUID(),
        userId,
        conversationId,
        model: conversation.model,
        inputTokens,
        outputTokens,
        costCents: calculateCostCents(conversation.model, inputTokens, outputTokens),
        createdAt: new Date(),
      });
    }
  } catch (error) {
    if (error instanceof AnthropicServiceError) {
      const userMessage = ERROR_MESSAGES[error.type] ?? 'An unexpected error occurred.';
      sendSSE(res, { type: 'error', message: userMessage });
    } else {
      sendSSE(res, { type: 'error', message: 'An unexpected error occurred.' });
    }
  }

  res.end();
});
