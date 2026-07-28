import { useAuthToken } from '@/auth/useAuthToken';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Salvaged from the A4 chat client (git: apps/web/src/hooks/useChat.ts) —
 * same SSE protocol, minus the canvas/insight/cross-workspace concerns that
 * retired with the old product.
 */

export interface ToolActivity {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'complete' | 'error';
}

export interface ChatError {
  message: string;
  retryable: boolean;
}

export function useChat({ spaceId }: { spaceId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const getToken = useAuthToken();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const lastFailedRef = useRef<string | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const conversationQuery = useQuery({
    ...trpc.chat.getConversation.queryOptions({ id: conversationId ?? '' }),
    enabled: !!conversationId,
  });

  const createConversation = useMutation(trpc.chat.createConversation.mutationOptions());
  const persistMessage = useMutation(trpc.chat.sendMessage.mutationOptions());

  const messages = conversationQuery.data?.messages ?? [];
  const allMessages =
    isStreaming && streamingContent
      ? [
          ...messages,
          {
            id: 'streaming',
            role: 'assistant' as const,
            content: streamingContent,
          },
        ]
      : messages;

  const sendMessage = useCallback(
    async (content: string) => {
      setError(null);
      setToolActivity([]);
      if (isStreaming) {
        abortRef.current?.abort();
        setIsStreaming(false);
        setStreamingContent('');
      }

      try {
        let convId = conversationId;
        if (!convId) {
          const created = await createConversation.mutateAsync({ workspaceId: spaceId });
          convId = created.id;
          setConversationId(convId);
        }

        await persistMessage.mutateAsync({ conversationId: convId, content });
        await queryClient.invalidateQueries({
          queryKey: trpc.chat.getConversation.queryKey({ id: convId }),
        });

        setIsStreaming(true);
        setStreamingContent('');

        const abort = new AbortController();
        abortRef.current = abort;
        const token = await getToken();

        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          body: JSON.stringify({ conversationId: convId }),
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: abort.signal,
        });

        if (!response.ok || !response.body) {
          lastFailedRef.current = content;
          setError({
            message:
              response.status === 429
                ? "You're sending messages too quickly — give it a moment."
                : 'Something went wrong. Try again.',
            retryable: response.status !== 429,
          });
          setIsStreaming(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let event: { type: string; [k: string]: unknown };
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            switch (event.type) {
              case 'text_delta':
                setStreamingContent((prev) => prev + (event.text as string));
                break;
              case 'tool_call_start':
                setToolActivity((prev) => [
                  ...prev,
                  {
                    toolCallId: event.toolCallId as string,
                    toolName: event.toolName as string,
                    status: 'running',
                  },
                ]);
                break;
              case 'tool_call_end':
                setToolActivity((prev) =>
                  prev.map((t) =>
                    t.toolCallId === event.toolCallId
                      ? { ...t, status: event.isError ? 'error' : 'complete' }
                      : t,
                  ),
                );
                break;
              case 'error':
                lastFailedRef.current = content;
                setError({
                  message: (event.message as string) || 'Stream failed.',
                  retryable: true,
                });
                break;
              case 'done':
                break;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          lastFailedRef.current = content;
          setError({ message: 'Unable to connect. Check your connection.', retryable: true });
        }
      } finally {
        setIsStreaming(false);
        setStreamingContent('');
        setToolActivity([]);
        if (conversationId ?? true) {
          await queryClient.invalidateQueries({ queryKey: trpc.chat.pathKey() });
        }
      }
    },
    [
      conversationId,
      spaceId,
      isStreaming,
      createConversation,
      persistMessage,
      getToken,
      queryClient,
      trpc,
    ],
  );

  const retry = useCallback(() => {
    const failed = lastFailedRef.current;
    if (failed) {
      lastFailedRef.current = null;
      void sendMessage(failed);
    }
  }, [sendMessage]);

  return {
    messages: allMessages,
    sendMessage,
    isStreaming,
    isLoadingConversation: !!conversationId && conversationQuery.isLoading,
    error,
    retry,
    toolActivity,
    startNewConversation: () => {
      setConversationId(null);
      setError(null);
    },
  };
}
