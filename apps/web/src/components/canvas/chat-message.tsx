import { type ReactNode, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ParsedCitation {
  index: number;
  fileId: string;
  fileName: string;
  chunkContent: string;
  score: number;
}

interface ChatMessageProps {
  role: string;
  content: string;
  isLastStreaming: boolean;
  toolCalls?: string | null;
  citations?: ParsedCitation[];
  onCitationDragStart?: (citation: ParsedCitation, e: React.MouseEvent) => void;
  onCitationClick?: (fileId: string) => void;
}

const baseMarkdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-sm font-semibold mt-3 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[13px] font-semibold mt-2 mb-1">{children}</h3>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="text-sm">{children}</li>,
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code
          className="block bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mb-2"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="mb-2">{children}</pre>,
  table: ({ children }) => (
    <table className="w-full border-collapse text-xs mb-2">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold bg-muted/50">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic mb-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border my-3" />,
};

const CITATION_RE = /\[(\d+)\]/g;

function renderTextWithCitations(
  text: string,
  citations: ParsedCitation[],
  onCitationClick?: (fileId: string) => void,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    const num = Number.parseInt(match[1]!, 10);
    const citation = citations.find((c) => c.index === num);
    if (!citation) continue;

    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      <button
        key={`cite-${match.index}`}
        type="button"
        title={citation.fileName}
        onClick={() => onCitationClick?.(citation.fileId)}
        data-testid="citation-badge"
        className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-[var(--color-paige)]/10 text-[var(--color-paige)] hover:bg-[var(--color-paige)]/20 active:scale-[0.97] cursor-pointer transition-colors rounded-sm align-baseline mx-0.5"
      >
        {num}
      </button>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export const ChatMessage = memo(function ChatMessage({
  role,
  content,
  isLastStreaming,
  toolCalls,
  citations,
  onCitationClick,
  onCitationDragStart,
}: ChatMessageProps) {
  if (role === 'user') {
    return <>{content}</>;
  }

  const markdownComponents = useMemo<Components>(() => {
    if (!citations || citations.length === 0) return baseMarkdownComponents;

    return {
      ...baseMarkdownComponents,
      // Override text rendering to inject citation badges
      p: ({ children }) => {
        const processed = processChildren(children, citations, onCitationClick);
        return <p className="mb-2 last:mb-0">{processed}</p>;
      },
      li: ({ children }) => {
        const processed = processChildren(children, citations, onCitationClick);
        return <li className="text-sm">{processed}</li>;
      },
    };
  }, [citations, onCitationClick]);

  return (
    <>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
      {role === 'assistant' &&
        toolCalls &&
        (() => {
          try {
            const calls = JSON.parse(toolCalls) as Array<{
              id: string;
              name: string;
              input: Record<string, unknown>;
            }>;
            return (
              <details
                data-testid="tool-summary"
                className="mt-2 text-[11px] text-muted-foreground border-l-2 border-[var(--color-paige)]/20 pl-2"
              >
                <summary
                  className="cursor-pointer hover:text-foreground transition-colors select-none"
                  style={{ fontFamily: 'var(--font-chat-mono)' }}
                >
                  Used {calls.length} tool{calls.length !== 1 ? 's' : ''}:{' '}
                  {calls.map((c) => c.name).join(', ')}
                </summary>
                <div className="mt-1.5 space-y-1 pl-2 border-l border-border/40">
                  {calls.map((c) => (
                    <div key={c.id}>
                      <div className="font-medium text-foreground/70">{c.name}</div>
                      <pre className="text-[10px] text-muted-foreground/70 overflow-x-auto">
                        {JSON.stringify(c.input, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            );
          } catch {
            return null;
          }
        })()}
      {citations && citations.length > 0 && (
        <details
          data-testid="citation-sources"
          className="mt-3 pt-2 border-t border-border/40 text-[11px] text-muted-foreground"
        >
          <summary
            data-testid="citation-sources-toggle"
            className="cursor-pointer hover:text-foreground transition-colors select-none flex items-center gap-1"
            style={{ fontFamily: 'var(--font-chat-mono)' }}
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
              <path d="m9 18 6-6-6-6" />
            </svg>
            Sources ({citations.length})
          </summary>
          <div className="mt-1.5 space-y-1.5 pl-2">
            {citations.map((c) => (
              <button
                key={c.index}
                type="button"
                onClick={() => onCitationClick?.(c.fileId)}
                onMouseDown={(e) => {
                  // Press-and-drag pins this citation to the canvas; a plain
                  // click still opens the source file
                  if (e.button === 0) onCitationDragStart?.(c, e);
                }}
                data-testid="citation-source-item"
                className="flex items-start gap-2 w-full text-left hover:bg-muted/30 rounded-sm px-1.5 py-1 transition-colors group cursor-grab active:cursor-grabbing"
              >
                <span className="shrink-0 inline-flex items-center justify-center size-4 text-[9px] font-medium bg-[var(--color-paige)]/10 text-[var(--color-paige)] rounded-sm mt-0.5">
                  {c.index}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-foreground/70 group-hover:text-foreground transition-colors">
                      {c.fileName}
                    </span>
                    <span
                      className="shrink-0 text-[9px] text-muted-foreground/60"
                      style={{ fontFamily: 'var(--font-chat-mono)' }}
                    >
                      {Math.round(c.score * 100)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                    {c.chunkContent.slice(0, 120)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </details>
      )}
      {isLastStreaming && (
        <span className="inline-block w-[2px] h-[1em] bg-[var(--color-paige)] ml-0.5 align-text-bottom animate-pulse" />
      )}
    </>
  );
});

function processChildren(
  children: ReactNode,
  citations: ParsedCitation[],
  onCitationClick?: (fileId: string) => void,
): ReactNode {
  if (!Array.isArray(children)) {
    if (typeof children === 'string') {
      const result = renderTextWithCitations(children, citations, onCitationClick);
      return result.length === 1 && typeof result[0] === 'string' ? result[0] : <>{result}</>;
    }
    return children;
  }

  return children.map((child, i) => {
    if (typeof child === 'string') {
      const result = renderTextWithCitations(child, citations, onCitationClick);
      return result.length === 1 && typeof result[0] === 'string' ? (
        result[0]
      ) : (
        <span key={i}>{result}</span>
      );
    }
    return child;
  });
}
