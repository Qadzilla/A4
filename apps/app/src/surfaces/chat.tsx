import { BasisMark } from '@/brand-mark';
import { useChat } from '@/chat/useChat';
import { useSpaceId } from '@/surfaces/layout';
import { DeskChecklist } from '@/workspace/checklist';
import { isSummonKind } from '@/workspace/panel';
import { PanelCard } from '@/workspace/panels';
import { ArrowUp, Loader2, MessageSquare, Plus, Table2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { useSearchParams } from 'react-router';
import remarkGfm from 'remark-gfm';

/**
 * The workspace. Conversation on the right, and on the left whatever the
 * conversation was actually about — the lots, the tax picture, the benchmark,
 * the documents. Bip's tools already return this data; here it stops being
 * prose and becomes something you can look at.
 */

/** The persona's name — server-side twin lives in ai-context.ts (AI_NAME). */
const AI_NAME = 'Bip';

const SUGGESTIONS = [
  'What happens tax-wise if I sell my biggest position?',
  'How much would I owe in taxes if the year ended today?',
  'Am I actually beating the S&P 500?',
  'How much long-term gain could I realize at 0% tax this year?',
];

/** Years you can have a desk for. The tax pillar's data stops at 2025. */
const DESK_YEARS = [2026, 2025] as const;

export function ChatSurface() {
  const spaceId = useSpaceId();
  const [taxYear, setTaxYear] = useState<number>(DESK_YEARS[0]);
  const {
    messages,
    sendMessage,
    isStreaming,
    isLoadingConversation,
    error,
    retry,
    toolActivity,
    panels,
    openDocument,
    summon,
    dismissPanel,
    togglePinned,
    startNewConversation,
  } = useChat({ spaceId, taxYear });
  const [draft, setDraft] = useState('');
  /** Below md only one pane fits; this is which one you're looking at. */
  const [mobilePane, setMobilePane] = useState<'chat' | 'workspace'>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  // A new panel is the answer arriving — on mobile, go look at it
  const panelCount = panels.length;
  useEffect(() => {
    if (panelCount > 0) setMobilePane('workspace');
  }, [panelCount]);

  // Arriving with ?doc=<id> from Documents, or ?panel=<kind> from a dashboard:
  // place it, then drop the param so a reload doesn't keep re-opening it. The
  // refs guard against the effect firing twice before the URL settles.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDoc = searchParams.get('doc');
  const requestedPanel = searchParams.get('panel');
  const openedDocRef = useRef<string | null>(null);
  const summonedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedDoc || openedDocRef.current === requestedDoc) return;
    openedDocRef.current = requestedDoc;
    void openDocument(requestedDoc);
    setSearchParams({}, { replace: true });
  }, [requestedDoc, openDocument, setSearchParams]);
  useEffect(() => {
    if (!requestedPanel || summonedRef.current === requestedPanel) return;
    if (!isSummonKind(requestedPanel)) return;
    summonedRef.current = requestedPanel;
    summon(requestedPanel);
    setSearchParams({}, { replace: true });
  }, [requestedPanel, summon, setSearchParams]);

  const submit = () => {
    const content = draft.trim();
    if (!content || isStreaming) return;
    setDraft('');
    void sendMessage(content);
  };

  return (
    <div className="flex h-dvh flex-col md:h-screen md:flex-row-reverse">
      {/* Conversation */}
      <section
        className={`flex min-h-0 flex-1 flex-col border-hairline md:max-w-[420px] md:border-l ${
          mobilePane === 'chat' ? 'flex' : 'hidden md:flex'
        }`}
      >
        <header className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <p className="eyebrow flex items-center gap-1.5">
            <BasisMark size={13} /> {AI_NAME}
          </p>
          <button
            type="button"
            onClick={startNewConversation}
            className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink"
          >
            <Plus size={14} /> New
          </button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {isLoadingConversation && messages.length === 0 && (
            <div className="mt-8 animate-pulse space-y-4">
              <div className="ml-auto h-9 w-1/2 rounded-card bg-hairline/50" />
              <div className="h-4 w-4/5 rounded-card bg-hairline/40" />
            </div>
          )}

          {!isLoadingConversation && messages.length === 0 && (
            <div className="rise">
              <h1 className="mb-2 text-xl font-bold tracking-tight">
                Ask {AI_NAME} about your actual money.
              </h1>
              <p className="mb-6 text-sm leading-relaxed text-muted">
                Grounded in your real holdings, trades and documents. What {AI_NAME} looks at
                appears on the left.
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
                <div className="prose prose-sm max-w-none text-sm leading-relaxed [&_code]:font-mono [&_table]:block [&_table]:overflow-x-auto [&_table]:tnum">
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

        <div className="border-t border-hairline px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2">
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
      </section>

      {/* Workspace */}
      <section
        className={`min-h-0 flex-1 overflow-y-auto ${
          mobilePane === 'workspace' ? 'block' : 'hidden md:block'
        }`}
      >
        <div className="mx-auto max-w-2xl px-5 py-6">
          {/* The desk is a tax year. Switching years switches desks. */}
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <p className="eyebrow">Desk</p>
            <label className="flex items-center gap-2">
              <span className="eyebrow">Tax year</span>
              <select
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
                className="tnum rounded-card border border-hairline bg-surface px-2 py-1 font-mono text-xs outline-none transition-colors focus:border-accent"
              >
                {DESK_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Standing state first: the desk knows where the year is before
              anyone asks it anything. */}
          <div className="mb-4">
            <DeskChecklist spaceId={spaceId} taxYear={taxYear} onOpen={summon} />
          </div>

          {panels.length === 0 ? (
            <p className="px-1 text-xs leading-relaxed text-muted">
              Ask {AI_NAME} about any of these, or about a position or a document, and what it reads
              to answer lands here.
            </p>
          ) : (
            <div className="space-y-4">
              {panels.map((p) => (
                <PanelCard
                  key={p.id}
                  panel={p}
                  taxYear={taxYear}
                  onDismiss={dismissPanel}
                  onTogglePin={togglePinned}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Pane switch — small screens only */}
      <div className="fixed bottom-20 left-1/2 z-10 -translate-x-1/2 md:hidden">
        <button
          type="button"
          onClick={() => setMobilePane((p) => (p === 'chat' ? 'workspace' : 'chat'))}
          className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-white shadow-card"
        >
          {mobilePane === 'chat' ? (
            <>
              <Table2 size={13} /> Workspace{panels.length > 0 ? ` (${panels.length})` : ''}
            </>
          ) : (
            <>
              <MessageSquare size={13} /> Conversation
            </>
          )}
        </button>
      </div>
    </div>
  );
}
