import { useAuthToken } from '@/auth/useAuthToken';
import { useTRPC } from '@/lib/trpc';
import {
  PANEL_PAYLOAD_VERSION,
  type Panel,
  type PanelKind,
  mergePanel,
  panelFromToolResult,
  sortPanels,
} from '@/workspace/panel';
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
  // What the conversation leaves on the workspace. Held locally so panels
  // appear the instant a tool returns, and mirrored to the server so the desk
  // is still set when you come back to the thread.
  const [panels, setPanels] = useState<Panel[]>([]);
  /** The conversation the local panels belong to, so a switch can't leak. */
  const panelsForRef = useRef<string | null>(null);
  /** Set by "New" — stops the resume effect dragging the old thread back. */
  const startedFreshRef = useRef(false);

  const abortRef = useRef<AbortController | null>(null);
  const lastFailedRef = useRef<string | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const conversationQuery = useQuery({
    ...trpc.chat.getConversation.queryOptions({ id: conversationId ?? '' }),
    enabled: !!conversationId,
  });

  // Resume the most recent thread on load. Without this the workspace is
  // pointless: the panels are on the server, but a reload starts a blank
  // conversation and there is nothing to hang them on.
  const conversationList = useQuery({
    ...trpc.chat.listConversations.queryOptions({ workspaceId: spaceId }),
    enabled: !conversationId && !startedFreshRef.current,
  });
  const latestConversationId = conversationList.data?.[0]?.id;
  useEffect(() => {
    if (conversationId || startedFreshRef.current || !latestConversationId) return;
    setConversationId(latestConversationId);
  }, [conversationId, latestConversationId]);

  const createConversation = useMutation(trpc.chat.createConversation.mutationOptions());
  const persistMessage = useMutation(trpc.chat.sendMessage.mutationOptions());

  const panelQuery = useQuery({
    ...trpc.panel.list.queryOptions({ conversationId: conversationId ?? '' }),
    enabled: !!conversationId,
  });
  const upsertPanel = useMutation(trpc.panel.upsert.mutationOptions());
  const removePanel = useMutation(trpc.panel.remove.mutationOptions());
  const setPinnedPanel = useMutation(trpc.panel.setPinned.mutationOptions());

  // Hydrate the desk when a conversation loads or changes. Local state is the
  // render source — the server list only seeds it, so a panel that just
  // arrived over the stream is never clobbered by a stale fetch.
  const storedPanels = panelQuery.data;
  useEffect(() => {
    if (!conversationId || !storedPanels) return;
    if (panelsForRef.current === conversationId) return;
    panelsForRef.current = conversationId;
    setPanels(
      sortPanels(
        storedPanels.map((p) => ({
          id: p.id,
          kind: p.kind as PanelKind,
          title: p.title,
          subtitle: p.subtitle,
          data: p.data as Record<string, unknown>,
          createdAt: p.createdAt,
          pinned: p.pinned,
        })),
      ),
    );
  }, [conversationId, storedPanels]);

  // Tool-result rows (role 'tool') and empty intermediate assistant turns are
  // plumbing for the model, not conversation — never render them.
  const messages = (conversationQuery.data?.messages ?? []).filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0,
  );
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
              case 'tool_result': {
                if (event.isError) break;
                const panel = panelFromToolResult(
                  event.toolName as string,
                  event.toolCallId as string,
                  event.result,
                );
                if (!panel) break;
                setPanels((prev) => mergePanel(prev, panel));
                // Mirror to the server. Fire-and-forget: a failed write costs
                // the panel on reload, not the panel you're looking at.
                upsertPanel.mutate({
                  id: panel.id,
                  conversationId: convId,
                  workspaceId: spaceId,
                  kind: panel.kind,
                  title: panel.title,
                  subtitle: panel.subtitle,
                  payload: panel.data,
                  payloadVersion: PANEL_PAYLOAD_VERSION,
                });
                break;
              }
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
      upsertPanel.mutate,
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
    panels,
    dismissPanel: (id: string) => {
      setPanels((prev) => prev.filter((p) => p.id !== id));
      removePanel.mutate({ id });
    },
    togglePinned: (id: string) => {
      // Read the next value from current state, not from inside the updater:
      // React runs updaters later (and twice under StrictMode), so anything
      // assigned in there is stale by the time the mutation fires.
      const next = !(panels.find((p) => p.id === id)?.pinned ?? false);
      setPanels((prev) => sortPanels(prev.map((p) => (p.id === id ? { ...p, pinned: next } : p))));
      setPinnedPanel.mutate({ id, pinned: next });
    },
    startNewConversation: () => {
      startedFreshRef.current = true;
      setConversationId(null);
      setError(null);
      setPanels([]);
      panelsForRef.current = null;
    },
  };
}
