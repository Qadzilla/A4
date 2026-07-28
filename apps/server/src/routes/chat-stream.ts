import { randomUUID } from 'node:crypto';
import type { Citation } from '@a4/shared-schemas';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { and, asc, eq, sql } from 'drizzle-orm';
import { type Response, Router, type Router as RouterType } from 'express';
import { db } from '../db';
import { aiUsage, conversations, documentChunks, messages } from '../db/schema';
import { DEV_AUTH_BYPASS } from '../env';
import { buildDocumentContext, buildWorkspaceContext } from '../services/ai-context';
import { type ToolContext, getToolDefinitions, safeExecuteTool } from '../services/ai-tools';
import {
  AnthropicServiceError,
  isByokAnthropicUser,
  streamChatCompletion,
} from '../services/anthropic';
import { summarizeConversation } from '../services/conversation-summarizer';

const MAX_TOOL_ROUNDS = 10;
const MAX_TOOLS_PER_ROUND = 20;

const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-opus-4-6': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
};

export function calculateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
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

// --- Message formatting ---

interface DbMessage {
  role: string;
  content: string;
  toolCalls: string | null;
  toolCallId: string | null;
}

type AnthropicMessage = { role: 'user' | 'assistant'; content: string | ContentBlockParam[] };

export function formatMessagesForAnthropic(dbMsgs: DbMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];
  let pendingToolResults: ContentBlockParam[] = [];

  function flushToolResults() {
    if (pendingToolResults.length > 0) {
      result.push({ role: 'user', content: pendingToolResults });
      pendingToolResults = [];
    }
  }

  for (const m of dbMsgs) {
    if (m.role === 'tool') {
      // Accumulate consecutive tool results
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.toolCallId!,
        content: m.content,
      } as ContentBlockParam);
      continue;
    }

    flushToolResults();

    if (m.role === 'assistant' && m.toolCalls) {
      // Assistant message with tool calls — multi-block content
      const blocks: ContentBlockParam[] = [];
      if (m.content) {
        blocks.push({ type: 'text', text: m.content } as ContentBlockParam);
      }
      const toolCalls = JSON.parse(m.toolCalls) as Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }>;
      for (const tc of toolCalls) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        } as ContentBlockParam);
      }
      result.push({ role: 'assistant', content: blocks });
    } else if (m.role === 'assistant') {
      result.push({ role: 'assistant', content: m.content });
    } else if (m.role === 'user') {
      result.push({ role: 'user', content: m.content });
    }
  }

  flushToolResults();
  return result;
}

// --- Stream iteration ---

interface ToolUseBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface StreamResult {
  accumulatedText: string;
  toolUseBlocks: ToolUseBlock[];
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}

async function iterateStream(
  stream: AsyncIterable<any>,
  res: Response,
  isAborted: () => boolean,
): Promise<StreamResult> {
  let accumulatedText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = 'end_turn';
  const toolUseBlocks: ToolUseBlock[] = [];

  // Track active content blocks by index
  const activeBlocks = new Map<
    number,
    { type: string; id?: string; name?: string; inputJson: string }
  >();

  for await (const event of stream) {
    if (isAborted()) break;

    if (event.type === 'message_start') {
      const msg = (event as any).message;
      if (msg?.usage?.input_tokens) {
        inputTokens = msg.usage.input_tokens;
      }
    } else if (event.type === 'content_block_start') {
      const block = (event as any).content_block;
      const index = (event as any).index as number;
      if (block?.type === 'tool_use') {
        activeBlocks.set(index, {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          inputJson: '',
        });
      } else if (block?.type === 'text') {
        activeBlocks.set(index, { type: 'text', inputJson: '' });
      }
    } else if (event.type === 'content_block_delta') {
      const delta = (event as any).delta;
      const index = (event as any).index as number;
      if (delta?.type === 'text_delta' && delta.text) {
        accumulatedText += delta.text;
        sendSSE(res, { type: 'text_delta', text: delta.text });
      } else if (delta?.type === 'input_json_delta' && delta.partial_json !== undefined) {
        const block = activeBlocks.get(index);
        if (block) {
          block.inputJson += delta.partial_json;
        }
      }
    } else if (event.type === 'content_block_stop') {
      const index = (event as any).index as number;
      const block = activeBlocks.get(index);
      if (block?.type === 'tool_use' && block.id && block.name) {
        let input: Record<string, unknown> = {};
        try {
          if (block.inputJson) input = JSON.parse(block.inputJson);
        } catch {
          /* empty input */
        }
        toolUseBlocks.push({ id: block.id, name: block.name, input });
      }
      activeBlocks.delete(index);
    } else if (event.type === 'message_delta') {
      const delta = (event as any).delta;
      if (delta?.stop_reason) {
        stopReason = delta.stop_reason;
      }
      const usage = (event as any).usage;
      if (usage?.output_tokens) {
        outputTokens = usage.output_tokens;
      }
    }
  }

  return { accumulatedText, toolUseBlocks, inputTokens, outputTokens, stopReason };
}

// --- Main handler ---

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
    let systemPrompt = await buildWorkspaceContext(
      db,
      userId,
      conversation.workspaceId,
      conversationId,
    );

    // 6b. RAG: inject document context if workspace has chunks
    let citations: Citation[] = [];
    try {
      const lastUserMsg = dbMessages.filter((m) => m.role === 'user').pop();
      if (lastUserMsg) {
        const chunkCountRows = await db
          .select({ count: sql<number>`count(*)` })
          .from(documentChunks)
          .where(eq(documentChunks.workspaceId, conversation.workspaceId));
        const chunkCount = chunkCountRows[0]?.count ?? 0;

        if (chunkCount > 0) {
          const docCtx = await buildDocumentContext(
            lastUserMsg.content,
            conversation.workspaceId,
            db,
          );
          if (docCtx.section) {
            systemPrompt = `${systemPrompt}\n\n${docCtx.section}`;
            citations = docCtx.citations;
          }
        }
      }
    } catch (err) {
      console.error('[RAG] Error in chat-stream RAG integration:', err);
    }

    // 7. Format messages for Anthropic
    const anthropicMessages = formatMessagesForAnthropic(dbMessages);

    // 8. Get tool definitions
    const tools = getToolDefinitions();
    console.log(
      `[chat-stream] Sending ${tools.length} tools to Claude:`,
      tools.map((t) => t.name).join(', '),
    );
    const toolCtx: ToolContext = { db, userId, workspaceId: conversation.workspaceId };

    // 9. Send message_start event (final assistant message ID)
    const assistantMessageId = randomUUID();
    sendSSE(res, { type: 'message_start', messageId: assistantMessageId });

    // 10. Call Anthropic streaming API (user's own key when configured)
    const auth = { userId, db };
    const byok = await isByokAnthropicUser(userId, db);
    let stream = await streamChatCompletion({
      messages: anthropicMessages,
      systemPrompt,
      model: conversation.model,
      tools,
      auth,
    });

    // 11. Iterate stream
    let result = await iterateStream(stream, res, () => aborted);
    let totalInputTokens = result.inputTokens;
    let totalOutputTokens = result.outputTokens;

    // 12. Tool execution loop
    let round = 0;
    const allMessages = [...anthropicMessages];

    let totalToolExecutions = 0;
    const MAX_TOTAL_TOOL_EXECUTIONS = MAX_TOOL_ROUNDS * MAX_TOOLS_PER_ROUND; // 200

    try {
      while (result.stopReason === 'tool_use' && round < MAX_TOOL_ROUNDS && !aborted) {
        round++;
        const { accumulatedText, toolUseBlocks } = result;

        // No tool_use blocks despite stop_reason='tool_use' — treat as end_turn
        if (toolUseBlocks.length === 0) break;

        // 12a. Persist intermediate assistant message
        const intermediateId = randomUUID();
        await db.insert(messages).values({
          id: intermediateId,
          conversationId,
          userId,
          role: 'assistant',
          content: accumulatedText,
          toolCalls: JSON.stringify(toolUseBlocks),
          tokenCount: null,
          model: conversation.model,
          createdAt: new Date(),
        });

        // 12b. Append assistant content blocks to allMessages
        const assistantContentBlocks: ContentBlockParam[] = [];
        if (accumulatedText) {
          assistantContentBlocks.push({ type: 'text', text: accumulatedText } as ContentBlockParam);
        }
        for (const tb of toolUseBlocks) {
          assistantContentBlocks.push({
            type: 'tool_use',
            id: tb.id,
            name: tb.name,
            input: tb.input,
          } as ContentBlockParam);
        }
        allMessages.push({ role: 'assistant', content: assistantContentBlocks });

        // 12c. Execute tools sequentially
        const toolResultBlocks: ContentBlockParam[] = [];
        const toolsToExecute = toolUseBlocks.slice(0, MAX_TOOLS_PER_ROUND);

        for (const block of toolsToExecute) {
          if (aborted) break;

          totalToolExecutions++;
          if (totalToolExecutions > MAX_TOTAL_TOOL_EXECUTIONS) {
            sendSSE(res, {
              type: 'error',
              message: 'Too many tool calls. Please try a simpler request.',
            });
            break;
          }

          sendSSE(res, {
            type: 'tool_call_start',
            toolName: block.name,
            toolCallId: block.id,
            toolInput: block.input,
          });

          const toolStartTime = Date.now();
          const safeResult = await safeExecuteTool(block.name, block.input, toolCtx);
          const toolResult = safeResult.result;
          const isError = safeResult.isError;

          sendSSE(res, {
            type: 'tool_call_end',
            toolCallId: block.id,
            toolName: block.name,
            durationMs: Date.now() - toolStartTime,
          });

          // Strip _canvasUpdate from result before sending to client/Claude
          const { _canvasUpdate: _stripped, ...cleanResult } = toolResult;

          sendSSE(res, {
            type: 'tool_result',
            toolCallId: block.id,
            toolName: block.name,
            result: cleanResult,
            isError,
          });

          // Persist tool message
          await db.insert(messages).values({
            id: randomUUID(),
            conversationId,
            userId,
            role: 'tool',
            content: JSON.stringify(cleanResult),
            toolCallId: block.id,
            tokenCount: null,
            model: null,
            createdAt: new Date(),
          });

          // Build tool_result content block for Anthropic
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(cleanResult),
            ...(isError && { is_error: true }),
          } as ContentBlockParam);
        }

        if (aborted) break;

        // 12d. Append tool results to allMessages
        allMessages.push({ role: 'user', content: toolResultBlocks });

        // 12e. Call Anthropic again with updated messages
        stream = await streamChatCompletion({
          messages: allMessages,
          systemPrompt,
          model: conversation.model,
          tools,
          auth,
        });

        // 12f. Iterate new stream
        result = await iterateStream(stream, res, () => aborted);
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
      }
    } catch (loopErr) {
      console.error('[Chat Stream] Tool loop error:', loopErr);
      sendSSE(res, {
        type: 'error',
        message: 'An unexpected error occurred while processing tools. Please try again.',
      });
    }

    // 13. Send done event
    if (!aborted) {
      sendSSE(res, {
        type: 'done',
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        ...(citations.length > 0 && { citations }),
      });
    }

    // 14. Persist final assistant message
    const finalText = result.accumulatedText;
    if (finalText.length > 0 || round > 0) {
      await db.insert(messages).values({
        id: assistantMessageId,
        conversationId,
        userId,
        role: 'assistant',
        content: finalText,
        tokenCount: totalInputTokens + totalOutputTokens,
        model: conversation.model,
        citations: citations.length > 0 ? JSON.stringify(citations) : null,
        createdAt: new Date(),
      });

      // 15. Update conversation updatedAt + auto-generate title
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
      await db.update(conversations).set(updateSet).where(eq(conversations.id, conversationId));

      // 16. Log AI usage with summed tokens (BYOK usage costs the house nothing)
      await db.insert(aiUsage).values({
        id: randomUUID(),
        userId,
        conversationId,
        model: conversation.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costCents: byok
          ? 0
          : calculateCostCents(conversation.model, totalInputTokens, totalOutputTokens),
        byok,
        createdAt: new Date(),
      });

      // Fire-and-forget summarization
      summarizeConversation(db, conversationId);
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
