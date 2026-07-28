import { useChat } from '@/chat/useChat';
import { useSpaceId } from '@/surfaces/layout';
import { ArrowUp, Loader2, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SUGGESTIONS = [
  'What do I actually own right now?',
  'How much would I owe in taxes if the year ended today?',
  "What's the 10-year picture if I invest $200/month instead?",
];

export function ChatSurface() {
  const spaceId = useSpaceId();
  const {
    messages,
    sendMessage,
    isStreaming,
    isLoadingConversation,
    error,
    retry,
    toolActivity,
    startNewConversation,
  } = useChat({ spaceId });
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  const submit = () => {
    const content = draft.trim();
    if (!content || isStreaming) return;
    setDraft('');
    void sendMessage(content);
  };

  return (
    <div className="flex h-dvh flex-col md:h-screen">
      <header className="flex items-center justify-between border-b border-hairline bg-surface px-5 py-3">
        <p className="eyebrow">Chat</p>
        <button
          type="button"
          onClick={startNewConversation}
          className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          <Plus size={14} /> New conversation
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-2xl">
          {isLoadingConversation && messages.length === 0 && (
            <div className="mt-8 animate-pulse space-y-4">
              <div className="ml-auto h-9 w-1/2 rounded-card bg-hairline/50" />
              <div className="h-4 w-4/5 rounded-card bg-hairline/40" />
              <div className="h-4 w-3/5 rounded-card bg-hairline/40" />
            </div>
          )}

          {!isLoadingConversation && messages.length === 0 && (
            <div className="rise mt-8">
              <h1 className="mb-2 text-2xl font-bold tracking-tight">
                Ask about your actual money.
              </h1>
              <p className="mb-6 max-w-md text-sm text-muted">
                Grounded in your real holdings, transactions, and documents — with receipts for
                every number. Never advice; always the full picture.
              </p>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendMessage(s)}
                    className="rounded-card border border-hairline bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`mb-5 ${m.role === 'user' ? 'flex justify-end' : ''}`}>
              {m.role === 'user' ? (
                <div className="max-w-[85%] rounded-card bg-accent-soft px-4 py-2.5 text-sm">
                  {m.content}
                </div>
              ) : (
                <div className="prose prose-sm max-w-none text-sm leading-relaxed [&_table]:tnum [&_code]:font-mono">
                  <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
                </div>
              )}
            </div>
          ))}

          {isStreaming && toolActivity.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {toolActivity.map((t) => (
                <span
                  key={t.toolCallId}
                  className={`eyebrow flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 ${
                    t.status === 'running' ? 'text-accent' : ''
                  }`}
                >
                  {t.status === 'running' && <Loader2 size={10} className="animate-spin" />}
                  {t.toolName.replaceAll('_', ' ')}
                </span>
              ))}
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-bad/30 bg-bad-soft px-4 py-2.5 text-sm text-bad">
              <span>{error.message}</span>
              {error.retryable && (
                <button type="button" onClick={retry} className="shrink-0 font-semibold underline">
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-hairline bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Ask anything about your money…"
            className="max-h-32 flex-1 resize-none rounded-card border border-hairline bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || isStreaming}
            className="flex h-10 w-10 items-center justify-center rounded-card bg-accent text-white transition-opacity disabled:opacity-30"
          >
            {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
