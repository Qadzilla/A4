import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ChatError, ToolActivity } from '../../hooks/useChat';
import { ChatMessage, type ParsedCitation } from './chat-message';

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24) return relativeTime(date);
  return (
    date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ', ' +
    date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

const SUGGESTION_CHIPS = [
  'Summarize my financial data',
  'What are my biggest expenses?',
  'Help me create a budget',
  'Analyze my cash flow trends',
];

function PaigeAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s =
    size === 'lg' ? 'h-[68px] w-[52px]' : size === 'md' ? 'h-[46px] w-[36px]' : 'h-[30px] w-[23px]';
  return (
    <div className={cn(s, 'shrink-0 text-[var(--color-paige)]')}>
      <svg
        viewBox="0 0 160 208"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <path
          d="M12 196 L12 12 L148 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="miter"
          opacity="0.2"
        />
        <path
          d="M148 12 L148 196 L12 196"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinejoin="miter"
        />
        <circle cx="62" cy="88" r="7" fill="currentColor" />
        <circle cx="98" cy="88" r="7" fill="currentColor" />
        <path
          d="M62 132 Q80 154 98 132"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function getToolLabel(t: ToolActivity, workspaceNames: Record<string, string>): string {
  if (t.toolName === 'list_workspaces') {
    return t.status === 'running' ? 'Listing your workspaces...' : 'Listed workspaces';
  }
  if (t.toolName === 'query_workspace') {
    const wsId = t.toolInput?.workspace_id as string | undefined;
    const wsName = (wsId && workspaceNames[wsId]) || 'another workspace';
    if (t.status === 'running') return `Querying ${wsName}...`;
    if (t.status === 'error') return `Access denied for ${wsName}`;
    return `Retrieved data from ${wsName}`;
  }
  if (t.toolName === 'create_scenario_comparison') {
    const scenarios = t.toolInput?.scenarios as unknown[] | undefined;
    const count = scenarios?.length ?? 0;
    if (t.status === 'running')
      return count > 0 ? `Creating ${count}-scenario comparison…` : 'Creating scenario comparison…';
    if (t.status === 'error') return 'Scenario comparison failed';
    return count > 0 ? `Created ${count}-scenario comparison` : 'Created scenario comparison';
  }
  return t.toolName;
}

const CROSS_WORKSPACE_TOOLS = new Set(['list_workspaces', 'query_workspace']);

function ExternalLinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-2.5 inline ml-0.5 opacity-60"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ToolActivityList({
  items,
  workspaceNames,
}: { items: ToolActivity[]; workspaceNames: Record<string, string> }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-0.5 border-l-2 border-[var(--color-paige)]/20 pl-2">
      {items.map((t) => {
        const label = getToolLabel(t, workspaceNames);
        const isCross = CROSS_WORKSPACE_TOOLS.has(t.toolName);
        return (
          <div
            key={t.toolCallId}
            data-testid="tool-activity-item"
            className="flex items-center gap-1.5 text-[11px] transition-all duration-200"
            style={{ fontFamily: 'var(--font-chat-mono)' }}
          >
            {t.status === 'running' ? (
              <>
                <span className="size-1.5 rounded-full bg-[var(--color-paige)] animate-pulse" />
                <span className="text-muted-foreground">
                  {label}
                  {isCross && <ExternalLinkIcon />}
                </span>
              </>
            ) : t.status === 'error' ? (
              <>
                <span className="text-yellow-600 dark:text-yellow-400">✕</span>
                <span className="text-muted-foreground">
                  {label}
                  {isCross && <ExternalLinkIcon />}
                </span>
              </>
            ) : (
              <>
                <span className="text-muted-foreground/60">✓</span>
                <span className="text-muted-foreground/60">
                  {label}
                  {isCross ? <ExternalLinkIcon /> : ` (${t.durationMs}ms)`}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ChatPanelProps {
  messages: {
    role: string;
    content: string;
    createdAt?: Date;
    parsedCitations?: Array<{
      index: number;
      fileId: string;
      fileName: string;
      chunkContent: string;
      score: number;
    }>;
  }[];
  message: string;
  onMessageChange: (value: string) => void;
  onSend: (text?: string) => void;
  isStreaming: boolean;
  error: ChatError | null;
  onDismissError: () => void;
  onRetry: () => void;
  isLoadingConversation: boolean;
  workspaceName: string;
  onSwitchToTools: () => void;
  onMinimize: () => void;
  conversations: { id: string; title: string | null; updatedAt: Date; messageCount: number }[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  toolActivity: ToolActivity[];
  hasUsedCrossWorkspace: boolean;
  workspaceNames: Record<string, string>;
  onCitationClick?: (fileId: string) => void;
  onCitationDragStart?: (citation: ParsedCitation, e: React.MouseEvent) => void;
  insightBanner?: { title: string } | null;
}

export const ChatPanel = memo(function ChatPanel({
  messages,
  message,
  onMessageChange,
  onSend,
  isStreaming,
  error,
  onDismissError,
  onRetry,
  isLoadingConversation,
  workspaceName,
  onSwitchToTools,
  onMinimize,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  toolActivity,
  hasUsedCrossWorkspace,
  workspaceNames,
  onCitationClick,
  onCitationDragStart,
  insightBanner,
}: ChatPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const justSentRef = useRef(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Reset banner dismissed state when conversation changes
  useEffect(() => {
    setBannerDismissed(false);
  }, [activeConversationId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Smart auto-scroll
  useEffect(() => {
    if (justSentRef.current || isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      justSentRef.current = false;
    }
  }, [messages, isStreaming]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
    isNearBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom && messages.length > 0);
  }, [messages.length]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    isNearBottomRef.current = true;
    setShowScrollButton(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      justSentRef.current = true;
      onSend();
    }
  };

  const handleCopy = useCallback((content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedId(index);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const sendDisabled = !message.trim() || isStreaming;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--color-foreground)]/6">
        <div className="flex items-center gap-2.5">
          <PaigeAvatar size="md" />
          <div className="flex flex-col">
            <span
              className="text-[14px] font-semibold text-foreground"
              style={{ fontFamily: 'var(--font-chat)' }}
            >
              Paige
            </span>
            <span
              className="flex items-center gap-1 text-[10px] text-[var(--color-paige)]"
              style={{ fontFamily: 'var(--font-chat-mono)', letterSpacing: '0.04em' }}
            >
              <span className="size-1.5 bg-[var(--color-paige)] animate-pulse" />
              Online
              {hasUsedCrossWorkspace && (
                <span
                  data-testid="multi-workspace-badge"
                  className="ml-1.5 px-1.5 py-0.5 text-[9px] bg-[var(--color-paige)]/10 text-[var(--color-paige)] rounded-sm"
                  style={{ fontFamily: 'var(--font-chat-mono)' }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-2.5 inline mr-0.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  Multi-workspace
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSwitchToTools}
            className="size-8 flex items-center justify-center border border-[color:var(--color-foreground)]/6 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Switch to tools"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="size-8 flex items-center justify-center border border-[color:var(--color-foreground)]/6 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Minimize panel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Conversation Switcher */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[color:var(--color-foreground)]/6">
        {/* + New conversation button */}
        <button
          type="button"
          onClick={onNewConversation}
          className="shrink-0 px-2 py-1.5 flex items-center justify-center border-b-2 border-[var(--color-paige)] bg-[color:var(--color-paige)]/6 text-muted-foreground hover:text-foreground transition-colors self-stretch"
          title="New conversation"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>

        {/* Current conversation title (styled like active tab) */}
        <div
          data-testid={activeConversationId ? undefined : 'conv-tab-new'}
          className="flex-1 min-w-0 px-3 py-1.5 text-[11px] border-b-2 border-[var(--color-paige)] text-[var(--color-paige)] bg-[color:var(--color-paige)]/6 truncate"
          style={{ fontFamily: 'var(--font-chat-mono)' }}
        >
          {activeConversationId
            ? (conversations.find((c) => c.id === activeConversationId)?.title ?? 'Chat')
            : 'New chat'}
        </div>

        {/* Dropdown to switch conversations */}
        {conversations.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="shrink-0 px-2 py-1.5 flex items-center justify-center border-b-2 border-[var(--color-paige)] bg-[color:var(--color-paige)]/6 text-muted-foreground hover:text-foreground transition-colors self-stretch"
                title="Switch conversation"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {conversations.map((conv) => (
                <DropdownMenuItem
                  key={conv.id}
                  data-testid="conv-tab"
                  onClick={() => onSelectConversation(conv.id)}
                  className={cn(
                    'flex items-center justify-between gap-2 group text-[12px]',
                    conv.id === activeConversationId &&
                      'bg-[color:var(--color-paige)]/6 text-[var(--color-paige)]',
                  )}
                >
                  <span className="truncate flex-1">{conv.title ?? 'Chat'}</span>
                  <button
                    type="button"
                    data-testid="conv-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    className="p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Insight context banner */}
      {insightBanner && !bannerDismissed && (
        <div className="mx-4 mt-3 bg-[var(--color-paige)]/5 border-l-2 border-[var(--color-paige)] rounded p-3 flex items-start gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5 text-[var(--color-paige)] mt-0.5 shrink-0"
          >
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547Z" />
          </svg>
          <p
            className="text-xs text-muted-foreground flex-1"
            style={{ fontFamily: 'var(--font-chat)' }}
          >
            This conversation started from an insight:{' '}
            <span className="font-medium text-foreground">{insightBanner.title}</span>
          </p>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 text-sm leading-none p-0.5"
          >
            ×
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        data-testid="chat-messages"
        className="relative flex-1 overflow-y-auto chat-scrollbar px-5 py-5 space-y-5"
      >
        {isLoadingConversation ? (
          /* Loading skeleton */
          <div className="space-y-4 py-6 animate-pulse">
            <div className="space-y-2">
              <div className="h-3 w-16 bg-muted/60" />
              <div className="h-12 w-3/4 bg-muted/40" />
            </div>
            <div className="flex justify-end">
              <div className="h-8 w-1/2 bg-muted/40" />
            </div>
          </div>
        ) : messages.length === 0 && !isStreaming ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-5 animate-fade-in max-w-[280px]">
              <div className="flex justify-center">
                <PaigeAvatar size="lg" />
              </div>
              <div>
                <p
                  className="text-[14px] font-semibold text-foreground"
                  style={{ fontFamily: 'var(--font-chat)' }}
                >
                  Hi, I'm Paige
                </p>
                <p
                  className="text-[12px] text-muted-foreground mt-1"
                  style={{ fontFamily: 'var(--font-chat)' }}
                >
                  Your AI financial analyst for {workspaceName}
                </p>
              </div>
              <div className="flex flex-col gap-2 text-left">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => onSend(chip)}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-muted-foreground hover:text-[var(--color-paige)] border border-[color:var(--color-foreground)]/6 hover:border-[color:var(--color-paige)]/15 hover:bg-[color:var(--color-paige)]/[0.04] transition-all text-left"
                    style={{ fontFamily: 'var(--font-chat)' }}
                  >
                    <span
                      className="text-[var(--color-paige)]/50 text-[11px]"
                      style={{ fontFamily: 'var(--font-chat-mono)' }}
                    >
                      →
                    </span>
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div
                key={`msg-${msg.role}-${i}`}
                className={cn(
                  'flex animate-slide-up',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {/* Content column */}
                <div
                  className={cn(
                    'max-w-[85%] min-w-0 group',
                    msg.role === 'user' && 'flex flex-col items-end',
                  )}
                >
                  {/* Name label */}
                  <div
                    className={cn(
                      'text-[10px] font-medium mb-1 tracking-[0.04em]',
                      msg.role === 'user' ? 'text-muted-foreground' : 'text-[var(--color-paige)]',
                    )}
                    style={{ fontFamily: 'var(--font-chat-mono)' }}
                  >
                    {msg.role === 'user' ? 'You' : 'Paige'}
                  </div>

                  {/* Message bubble */}
                  <div
                    data-testid={msg.role === 'user' ? 'chat-message' : 'chat-message-assistant'}
                    className={cn(
                      'relative p-3 text-[13px] leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-transparent border border-[color:var(--color-foreground)]/10'
                        : 'bg-[color:var(--color-foreground)]/[0.03] border-t border-l border-[color:var(--color-foreground)]/6 border-b-2 border-r-2 border-b-[color:var(--color-paige)]/10 border-r-[color:var(--color-paige)]/10',
                    )}
                    style={{ fontFamily: 'var(--font-chat)' }}
                  >
                    <ChatMessage
                      role={msg.role}
                      content={msg.content}
                      isLastStreaming={
                        isStreaming &&
                        msg.role === 'assistant' &&
                        i === messages.length - 1 &&
                        !!msg.content
                      }
                      toolCalls={
                        'toolCalls' in msg
                          ? (msg as { toolCalls?: string | null }).toolCalls
                          : undefined
                      }
                      citations={msg.parsedCitations}
                      onCitationClick={onCitationClick}
                      onCitationDragStart={onCitationDragStart}
                    />

                    {/* Copy button (assistant only) */}
                    {msg.role === 'assistant' && msg.content && (
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.content, i)}
                        className="absolute top-1.5 right-1.5 p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                        title="Copy message"
                      >
                        {copiedId === i ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-3.5"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-3.5"
                          >
                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Tool activity indicators (last assistant message only) */}
                  {msg.role === 'assistant' &&
                    i === messages.length - 1 &&
                    toolActivity.length > 0 && (
                      <ToolActivityList items={toolActivity} workspaceNames={workspaceNames} />
                    )}

                  {/* Timestamp (hover-reveal) */}
                  {msg.createdAt && (
                    <div
                      className={cn(
                        'text-[9px] opacity-0 group-hover:opacity-100 transition-opacity mt-1',
                        msg.role === 'user' ? 'text-right' : 'text-left',
                      )}
                      style={{
                        fontFamily: 'var(--font-chat-mono)',
                        color: 'color-mix(in srgb, var(--color-foreground) 20%, transparent)',
                      }}
                    >
                      {formatTimestamp(new Date(msg.createdAt))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator — waiting for first token */}
            {isStreaming &&
              (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
                <div className="animate-slide-up">
                  <div
                    className="text-[10px] font-medium mb-1 text-[var(--color-paige)] tracking-[0.04em]"
                    style={{ fontFamily: 'var(--font-chat-mono)' }}
                  >
                    Paige
                  </div>
                  <div className="inline-block p-3 bg-[color:var(--color-foreground)]/[0.03] border-t border-l border-[color:var(--color-foreground)]/6 border-b-2 border-r-2 border-b-[color:var(--color-paige)]/10 border-r-[color:var(--color-paige)]/10">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="size-[5px] bg-[var(--color-paige)]"
                        style={{ animation: 'dot-bounce 1.4s infinite ease-in-out' }}
                      />
                      <span
                        className="size-[5px] bg-[var(--color-paige)]"
                        style={{
                          animation: 'dot-bounce 1.4s infinite ease-in-out',
                          animationDelay: '160ms',
                        }}
                      />
                      <span
                        className="size-[5px] bg-[var(--color-paige)]"
                        style={{
                          animation: 'dot-bounce 1.4s infinite ease-in-out',
                          animationDelay: '320ms',
                        }}
                      />
                    </div>
                  </div>
                  {toolActivity.length > 0 && (
                    <ToolActivityList items={toolActivity} workspaceNames={workspaceNames} />
                  )}
                </div>
              )}

            <div ref={messagesEndRef} />
          </>
        )}

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 z-10 bg-card border border-[color:var(--color-foreground)]/6 shadow-md px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center gap-1.5"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            New messages
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-5 mb-1 bg-destructive/10 border border-destructive/20 px-3 py-2 flex items-start gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 text-destructive shrink-0 mt-0.5"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <span className="flex-1 text-[12px] text-destructive">{error.message}</span>
          <div className="flex items-center gap-1 shrink-0">
            {error.retryable && (
              <button
                type="button"
                onClick={onRetry}
                className="text-[11px] font-medium text-destructive hover:text-destructive/80 px-1.5 py-0.5 hover:bg-destructive/10 transition-colors"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={onDismissError}
              className="p-0.5 text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Chat input */}
      <div className="border-t border-[color:var(--color-foreground)]/6 px-5 py-3">
        <div
          className={cn(
            'flex items-end border transition-colors',
            message.trim() || inputFocused
              ? 'border-[color:var(--color-paige)]/15 bg-[color:var(--color-foreground)]/[0.04]'
              : 'border-[color:var(--color-foreground)]/6 bg-[color:var(--color-foreground)]/[0.03]',
          )}
        >
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Ask Paige anything..."
            rows={1}
            className="flex-1 min-h-[40px] max-h-[120px] resize-none py-2.5 pl-3 bg-transparent text-[13px] text-foreground placeholder:text-[color:var(--color-foreground)]/20 focus:outline-none"
            style={{ fontFamily: 'var(--font-chat)' }}
          />
          <button
            type="button"
            data-testid="chat-send-btn"
            onClick={() => {
              justSentRef.current = true;
              onSend();
            }}
            disabled={sendDisabled}
            className={cn(
              'size-9 shrink-0 flex items-center justify-center m-0.5 transition-all duration-150',
              !sendDisabled
                ? 'bg-[var(--color-paige)] text-white hover:opacity-90 active:scale-95'
                : 'bg-[color:var(--color-foreground)]/[0.06] text-muted-foreground',
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
        <p
          className="text-center mt-2 text-[color:var(--color-foreground)]/20"
          style={{ fontFamily: 'var(--font-chat-mono)', fontSize: '9px' }}
        >
          Paige can make mistakes. Verify important financial data.
        </p>
      </div>
    </div>
  );
});
