'use client';

import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/// Renders assistant output as markdown.
///
/// react-markdown, not `dangerouslySetInnerHTML` with a hand-rolled parser.
/// This text comes from a model that has just read tool output containing
/// customer-supplied strings — the least trusted content in the product. In
/// react-markdown, HTML in the source is inert unless `rehype-raw` is added
/// (which it deliberately is not), so a model persuaded to emit
/// `<img onerror=…>` renders it as literal text rather than executing it.
///
/// remark-gfm buys the three things the prompt asks the model for: tables,
/// strikethrough, and autolinks.
///
/// Memoised on `content`: streaming re-renders this on every token, and
/// re-parsing the whole markdown tree per character is the difference between a
/// smooth stream and a janky one on a long answer.
export const MarkdownMessage = memo(function MarkdownMessage({ content }: { content: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert',
        // The design system's tokens, not prose's own greys, so the bubble
        // matches the app in both themes.
        'prose-p:my-2 prose-p:leading-relaxed prose-p:text-foreground',
        'prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2',
        'prose-strong:text-foreground prose-li:text-foreground prose-li:my-0.5',
        'prose-a:text-brand prose-a:underline hover:prose-a:opacity-80',
        'prose-ul:my-2 prose-ol:my-2',
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          table: ({ children }) => (
            // Tables are the model's answer to "compare these" and routinely
            // exceed the bubble; without its own scroller the page itself
            // scrolls sideways.
            <div className="my-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/50 px-3 py-2 text-foreground">{children}</td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              // The model can emit a link to anywhere. noreferrer stops the
              // target learning where it came from; noopener stops it reaching
              // back through window.opener.
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function CodeBlock({ inline, className, children }: CodeProps) {
  const [copied, setCopied] = useState(false);
  const text = String(children ?? '').replace(/\n$/, '');
  const language = /language-(\w+)/.exec(className ?? '')?.[1];

  if (inline) {
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
        {children}
      </code>
    );
  }

  const copy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-3">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-surface px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{language ?? 'text'}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-b-lg border border-border bg-muted/50 p-3">
        <code className="font-mono text-xs text-foreground">{text}</code>
      </pre>
    </div>
  );
}
