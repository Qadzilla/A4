import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthToken } from './useAuthToken';
import { useTRPC } from '../lib/trpc';
import { useCanvasStore } from '../stores/canvas-store';

export interface ToolActivity {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'complete' | 'error';
  startedAt: number;
  durationMs?: number;
  toolInput?: Record<string, unknown>;
}

export type ChatErrorType = 'network' | 'rate_limit' | 'api_error' | 'unknown';

export interface ChatError {
  type: ChatErrorType;
  message: string;
  retryable: boolean;
}

function classifyError(err: unknown, source: 'fetch' | 'response' | 'sse'): ChatError {
  if (source === 'fetch') {
    return { type: 'network', message: 'Unable to connect. Check your connection and try again.', retryable: true };
  }

  if (source === 'response') {
    // HTTP status-based classification (err is the response text)
    const text = typeof err === 'string' ? err : '';
    if (text.includes('429') || text.toLowerCase().includes('rate')) {
      return { type: 'rate_limit', message: "You're sending messages too quickly. Please wait a moment.", retryable: false };
    }
    return { type: 'unknown', message: 'Something went wrong. Please try again.', retryable: true };
  }

  // SSE error event
  const msg = typeof err === 'string' ? err : '';
  const lower = msg.toLowerCase();
  if (lower.includes('busy') || lower.includes('rate')) {
    return { type: 'rate_limit', message: "You're sending messages too quickly. Please wait a moment.", retryable: false };
  }
  if (lower.includes('overloaded')) {
    return { type: 'api_error', message: msg, retryable: true };
  }
  if (lower.includes('configuration')) {
    return { type: 'api_error', message: msg, retryable: false };
  }
  return { type: 'unknown', message: msg || 'Something went wrong. Please try again.', retryable: true };
}

function formatInsightContext(insight: { type: string; summary: string; data: unknown }): string {
  let msg = `[Insight context: ${insight.type}]\n\n${insight.summary}`;
  if (insight.data && typeof insight.data === 'object') {
    const entries = Object.entries(insight.data as Record<string, unknown>);
    if (entries.length > 0) {
      msg += '\n\nInsight data:\n' + entries.map(([k, v]) => `- ${k}: ${v}`).join('\n');
    }
  }
  msg += '\n\nHelp me understand this and what I should do about it.';
  return msg;
}

export function useChat({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const getToken = useAuthToken();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [workspaceNames, setWorkspaceNames] = useState<Record<string, string>>({});
  const [hasUsedCrossWorkspace, setHasUsedCrossWorkspace] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastFailedMessageRef = useRef<string | null>(null);
  const pendingInsightRef = useRef<{ conversationId: string; insight: { type: string; title: string; summary: string; data: unknown } } | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Auto-dismiss rate limit errors after 30s
  useEffect(() => {
    if (error?.type === 'rate_limit') {
      const timer = setTimeout(() => setError(null), 30_000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Queries
  const { data: conversations = [] } = useQuery(
    trpc.chat.listConversations.queryOptions({ workspaceId }),
  );

  const conversationQuery = useQuery({
    ...trpc.chat.getConversation.queryOptions({ id: activeConversationId! }),
    enabled: !!activeConversationId,
  });

  const conversationData = conversationQuery.data;
  const isLoadingConversation = !!activeConversationId && conversationQuery.isLoading;

  // Mutations
  const createConversationMutation = useMutation(
    trpc.chat.createConversation.mutationOptions(),
  );

  const sendMessageMutation = useMutation(
    trpc.chat.sendMessage.mutationOptions(),
  );

  const deleteConversationMutation = useMutation(
    trpc.chat.deleteConversation.mutationOptions(),
  );

  // Build messages array: persisted + optional streaming assistant message
  const rawMessages = conversationData?.messages ?? [];
  const messages = rawMessages.map((msg) => ({
    ...msg,
    parsedCitations: msg.citations ? (JSON.parse(msg.citations) as Array<{ index: number; fileId: string; fileName: string; chunkContent: string; score: number }>) : undefined,
  }));
  const allMessages = isStreaming && streamingContent
    ? [
        ...messages,
        {
          id: 'streaming',
          conversationId: activeConversationId!,
          userId: '',
          role: 'assistant' as const,
          content: streamingContent,
          tokenCount: null,
          model: null,
          createdAt: new Date(),
          parsedCitations: undefined as Array<{ index: number; fileId: string; fileName: string; chunkContent: string; score: number }> | undefined,
        },
      ]
    : messages;

  const sendMessage = useCallback(
    async (content: string) => {
      setError(null);
      setToolActivity([]);
      setHasUsedCrossWorkspace(false);
      setWorkspaceNames({});

      // Abort any in-flight stream
      if (isStreaming) {
        abortControllerRef.current?.abort();
        setIsStreaming(false);
        setStreamingContent('');
      }

      let conversationId = activeConversationId;

      try {
        // Create conversation if needed
        if (!conversationId) {
          const result = await createConversationMutation.mutateAsync({
            workspaceId,
          });
          conversationId = result.id;
          setActiveConversationId(conversationId);
        }

        // Persist user message
        await sendMessageMutation.mutateAsync({
          conversationId,
          content,
        });

        // Show user message immediately
        await queryClient.invalidateQueries({
          queryKey: trpc.chat.getConversation.queryKey({ id: conversationId }),
        });

        // Start streaming
        setIsStreaming(true);
        setStreamingContent('');

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const token = await getToken();

        let response: Response;
        try {
          response = await fetch('/api/chat/stream', {
            method: 'POST',
            body: JSON.stringify({ conversationId }),
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: abortController.signal,
          });
        } catch (fetchErr) {
          if ((fetchErr as Error).name === 'AbortError') return;
          console.error('[useChat] fetch failed:', fetchErr, 'conversationId:', conversationId);
          lastFailedMessageRef.current = content;
          setError(classifyError(fetchErr, 'fetch'));
          setIsStreaming(false);
          setStreamingContent('');
          return;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => 'Stream request failed');
          if (response.status === 429) {
            lastFailedMessageRef.current = content;
            setError({ type: 'rate_limit', message: "You're sending messages too quickly. Please wait a moment.", retryable: false });
          } else {
            lastFailedMessageRef.current = content;
            setError(classifyError(text, 'response'));
          }
          setIsStreaming(false);
          setStreamingContent('');
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            try {
              const event = JSON.parse(line.slice(6));

              switch (event.type) {
                case 'text_delta':
                  setStreamingContent((prev) => prev + event.text);
                  break;
                case 'tool_call_start':
                  setToolActivity((prev) => [
                    ...prev,
                    { toolCallId: event.toolCallId, toolName: event.toolName, toolInput: event.toolInput, status: 'running', startedAt: Date.now() },
                  ]);
                  if (event.toolName === 'query_workspace') {
                    setHasUsedCrossWorkspace(true);
                  }
                  break;
                case 'tool_call_end':
                  setToolActivity((prev) =>
                    prev.map((t) =>
                      t.toolCallId === event.toolCallId
                        ? { ...t, status: 'complete', durationMs: Date.now() - t.startedAt }
                        : t,
                    ),
                  );
                  break;
                case 'tool_result':
                  if (event.isError) {
                    setToolActivity((prev) =>
                      prev.map((t) =>
                        t.toolCallId === event.toolCallId ? { ...t, status: 'error' } : t,
                      ),
                    );
                  }
                  // Populate workspace name cache from list_workspaces result
                  if (event.toolName === 'list_workspaces' && !event.isError) {
                    const data = event.result as { workspaces?: { id: string; name: string }[] };
                    if (data?.workspaces) {
                      setWorkspaceNames((prev) => {
                        const next = { ...prev };
                        for (const ws of data.workspaces!) next[ws.id] = ws.name;
                        return next;
                      });
                    }
                  }
                  break;
                case 'canvas_update':
                  useCanvasStore.getState().addItemDirect(event.item);
                  break;
                case 'done':
                  setIsStreaming(false);
                  setStreamingContent('');
                  lastFailedMessageRef.current = null;
                  // Refresh persisted messages and conversation list
                  queryClient.invalidateQueries({
                    queryKey: trpc.chat.getConversation.queryKey({ id: conversationId! }),
                  });
                  queryClient.invalidateQueries({
                    queryKey: trpc.chat.listConversations.queryKey({ workspaceId }),
                  });
                  break;
                case 'error':
                  lastFailedMessageRef.current = content;
                  setError(classifyError(event.message, 'sse'));
                  setIsStreaming(false);
                  setStreamingContent('');
                  break;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[useChat] outer catch:', err);
        lastFailedMessageRef.current = content;
        setError(classifyError(err, 'fetch'));
        setIsStreaming(false);
        setStreamingContent('');
      }
    },
    [
      activeConversationId,
      isStreaming,
      workspaceId,
      createConversationMutation,
      sendMessageMutation,
      queryClient,
      trpc,
      getToken,
    ],
  );

  // Auto-send insight context message when conversation loads
  useEffect(() => {
    const pending = pendingInsightRef.current;
    if (!pending) return;
    if (!conversationData) return;
    if (conversationData.id !== pending.conversationId) return;

    // Clear ref immediately to prevent re-firing
    pendingInsightRef.current = null;

    // If conversation already has messages, just open it (re-engaged insight)
    if (conversationData.messages.length > 0) return;

    sendMessage(formatInsightContext(pending.insight));
  }, [conversationData, sendMessage]);

  const startFromInsight = useCallback(
    (conversationId: string, insight: { type: string; title: string; summary: string; data: unknown }) => {
      pendingInsightRef.current = { conversationId, insight };
      setActiveConversationId(conversationId);
      // Invalidate to ensure fresh conversation data loads, triggering the effect above
      queryClient.invalidateQueries({
        queryKey: trpc.chat.getConversation.queryKey({ id: conversationId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.chat.listConversations.queryKey({ workspaceId }),
      });
    },
    [queryClient, trpc, workspaceId],
  );

  const retryLastMessage = useCallback(() => {
    const msg = lastFailedMessageRef.current;
    if (msg) {
      lastFailedMessageRef.current = null;
      sendMessage(msg);
    }
  }, [sendMessage]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const createConversation = useCallback(async () => {
    const result = await createConversationMutation.mutateAsync({ workspaceId });
    setActiveConversationId(result.id);
    queryClient.invalidateQueries({
      queryKey: trpc.chat.listConversations.queryKey({ workspaceId }),
    });
    return result.id;
  }, [workspaceId, createConversationMutation, queryClient, trpc]);

  const deleteConversation = useCallback(
    async (id: string) => {
      await deleteConversationMutation.mutateAsync({ id });
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
      queryClient.invalidateQueries({
        queryKey: trpc.chat.listConversations.queryKey({ workspaceId }),
      });
    },
    [activeConversationId, workspaceId, deleteConversationMutation, queryClient, trpc],
  );

  return {
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages: allMessages,
    streamingContent,
    isStreaming,
    sendMessage,
    startFromInsight,
    createConversation,
    deleteConversation,
    error,
    clearError,
    retryLastMessage,
    isLoadingConversation,
    toolActivity,
    hasUsedCrossWorkspace,
    workspaceNames,
  };
}
