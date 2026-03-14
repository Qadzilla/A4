import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthToken } from './useAuthToken';
import { useTRPC } from '../lib/trpc';

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

export function useChat({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const getToken = useAuthToken();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastFailedMessageRef = useRef<string | null>(null);

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
  const messages = conversationData?.messages ?? [];
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
        },
      ]
    : messages;

  const sendMessage = useCallback(
    async (content: string) => {
      setError(null);

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
    createConversation,
    deleteConversation,
    error,
    clearError,
    retryLastMessage,
    isLoadingConversation,
  };
}
