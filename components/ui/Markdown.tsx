'use client';

import ReactMarkdown from 'react-markdown';

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className = '' }: MarkdownProps) {
  return (
    <div className={className}>
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <div className="text-sm font-bold mb-2" style={{ color: 'var(--amber)' }}>{children}</div>
        ),
        h2: ({ children }) => (
          <div className="text-xs font-bold mb-1.5 mt-3" style={{ color: 'var(--amber)' }}>{children}</div>
        ),
        h3: ({ children }) => (
          <div className="text-xs font-bold mb-1 mt-2" style={{ color: 'var(--t1)' }}>{children}</div>
        ),
        p: ({ children }) => (
          <p className="text-[13px] leading-relaxed mb-2" style={{ color: 'var(--t1)' }}>{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-bold" style={{ color: 'var(--t1)' }}>{children}</strong>
        ),
        em: ({ children }) => (
          <em style={{ color: 'var(--t2)' }}>{children}</em>
        ),
        ul: ({ children }) => (
          <ul className="space-y-1 mb-2 ml-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="space-y-1 mb-2 ml-1 list-decimal list-inside">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-[12px] leading-relaxed flex gap-1.5" style={{ color: 'var(--t2)' }}>
            <span className="text-t3 shrink-0">•</span>
            <span>{children}</span>
          </li>
        ),
        hr: () => <div className="border-t border-white/[0.06] my-3" />,
        code: ({ children }) => (
          <code className="text-[11px] px-1 py-0.5 rounded bg-white/5" style={{ color: 'var(--teal)' }}>
            {children}
          </code>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
    </div>
  );
}
