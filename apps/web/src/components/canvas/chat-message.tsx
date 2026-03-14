import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface ChatMessageProps {
  role: string;
  content: string;
  isLastStreaming: boolean;
}

const markdownComponents: Components = {
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
        <code className="block bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto mb-2" {...props}>
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
  table: ({ children }) => <table className="w-full border-collapse text-xs mb-2">{children}</table>,
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold bg-muted/50">{children}</th>
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

export const ChatMessage = memo(function ChatMessage({ role, content, isLastStreaming }: ChatMessageProps) {
  if (role === 'user') {
    return <>{content}</>;
  }

  return (
    <>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
      {isLastStreaming && (
        <span className="inline-block w-[2px] h-[1em] bg-[var(--color-paige)] ml-0.5 align-text-bottom animate-pulse" />
      )}
    </>
  );
});
