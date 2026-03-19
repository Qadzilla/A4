import { asc, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { conversations, messages } from '../db/schema';
import { chatCompletion } from './anthropic';

const SUMMARIZATION_DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes
const MIN_USER_MESSAGES = 4;
const MAX_MESSAGES = 50;

const SUMMARY_SYSTEM_PROMPT =
  'Summarize this financial conversation in 1-3 sentences. Focus on: what financial topics were discussed, what decisions were made, what data was referenced, and any action items. Be specific with numbers and dates. Do not include greetings or pleasantries.';

export async function summarizeConversation(db: DB, conversationId: string): Promise<void> {
  try {
    // Load conversation
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (!conversation) return;

    // Debounce: skip if summary was updated within last 10 minutes
    if (conversation.summary && conversation.updatedAt) {
      const elapsed = Date.now() - conversation.updatedAt.getTime();
      if (elapsed < SUMMARIZATION_DEBOUNCE_MS) return;
    }

    // Load all messages ordered by creation time
    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    // Count user messages — need at least 4
    const userMessageCount = allMessages.filter((m) => m.role === 'user').length;
    if (userMessageCount < MIN_USER_MESSAGES) return;

    // Filter out tool messages and empty content
    const filtered = allMessages.filter((m) => m.role !== 'tool' && m.content.trim() !== '');

    // Truncate to last 50 messages
    const truncated = filtered.slice(-MAX_MESSAGES);

    // Build prompt text
    const promptText = truncated
      .map((m) => {
        const label = m.role === 'user' ? 'User' : 'Assistant';
        return `${label}: ${m.content}`;
      })
      .join('\n\n');

    // Call Haiku for summarization
    const summary = await chatCompletion({
      messages: [{ role: 'user', content: promptText }],
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 200,
      temperature: 0,
    });

    // Write summary back
    await db
      .update(conversations)
      .set({ summary, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  } catch (error) {
    console.error('Failed to summarize conversation:', error);
  }
}
