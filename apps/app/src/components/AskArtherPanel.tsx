'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  assistantModuleForPath,
  ASSISTANT_RESULT_KIND_LABELS,
  type AssistantMessage,
  type AssistantResult,
} from '@arther/types';
import { Button } from '@arther/ui';
import { useAssistant } from './AssistantContext';

type UiMessage = AssistantMessage & { results?: AssistantResult[] };

/**
 * K.1/K.2/K.3/K.4 — the Ask Arther panel: a right-edge slide-in that answers
 * questions about Arther and finds the user's content. Each turn sends the
 * conversation + the user's current context (module · page) to /api/assistant,
 * which streams an NDJSON response — optional read-action result cards then the
 * reply token-by-token. Session-scoped: the transcript clears on reload.
 */
export function AskArtherPanel() {
  const { open, close } = useAssistant();
  const pathname = usePathname() ?? '/';
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, pending]);

  // Update the trailing assistant message (the streaming placeholder) in place.
  const patchLast = (patch: Partial<UiMessage>) =>
    setMessages((prev) => {
      if (prev.length === 0 || prev[prev.length - 1]!.role !== 'assistant') return prev;
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1]!, ...patch };
      return copy;
    });

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    const next: UiMessage[] = [...messages, { role: 'user', content: text }];
    setMessages([...next, { role: 'assistant', content: '' }]); // streaming placeholder
    setInput('');
    setPending(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          context: { module: assistantModuleForPath(pathname), page: pathname },
        }),
      });
      if (!res.ok || !res.body) {
        patchLast({ content: 'Sorry — I couldn’t answer that right now.' });
        return;
      }
      // Read the NDJSON stream: `results` once, then `delta` lines token-by-token.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      const handle = (raw: string) => {
        const t = raw.trim();
        if (!t) return;
        let msg: { type?: string; text?: string; results?: AssistantResult[] };
        try {
          msg = JSON.parse(t);
        } catch {
          return;
        }
        if (msg.type === 'delta' && typeof msg.text === 'string') {
          content += msg.text;
          patchLast({ content });
        } else if (msg.type === 'results' && Array.isArray(msg.results)) {
          patchLast({ results: msg.results });
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          handle(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }
      if (buffer.trim()) handle(buffer);
      if (!content) patchLast({ content: 'Sorry — I couldn’t answer that right now.' });
    } catch {
      patchLast({ content: 'Sorry — I couldn’t reach the assistant. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <aside
      aria-label="Ask Arther"
      aria-hidden={!open}
      style={{
        position: 'fixed',
        top: 56,
        right: 0,
        bottom: 0,
        width: 380,
        maxWidth: '92vw',
        background: 'var(--surface, #fff)',
        borderLeft: '1px solid var(--border, #e5e7eb)',
        boxShadow: open ? '-8px 0 24px rgba(0,0,0,0.08)' : 'none',
        transform: open ? 'translateX(0)' : 'translateX(110%)',
        transition: 'transform 250ms ease',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
      }}
    >
      <header className="specs-form--row" style={{ alignItems: 'center', gap: 8, padding: 12 }}>
        <strong>Ask Arther</strong>
        <span style={{ flex: 1 }} />
        <button type="button" className="specs-value-button" aria-label="Close" onClick={close}>
          ×
        </button>
      </header>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 ? (
          <p className="specs-grid__meta">
            Hi — I’m Arther. Ask me how to do something (e.g. “how do variants work?”), or to find your
            content (e.g. “find the datasheet for the servo drive” or “show me voltage fields”).
          </p>
        ) : (
          messages.map((m, i) =>
            // Skip the not-yet-filled streaming placeholder (the "thinking" line covers it).
            m.role === 'assistant' && !m.content && !(m.results && m.results.length > 0) ? null : (
            <div
              key={i}
              style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}
            >
              <div
                className="specs-release"
                style={{
                  background: m.role === 'user' ? 'var(--surface-accent, #eef2ff)' : undefined,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
              {m.results && m.results.length > 0 ? (
                <ul className="specs-form" style={{ listStyle: 'none', padding: 0, marginTop: 6, gap: 4 }}>
                  {m.results.map((r, j) => (
                    <li key={j} className="specs-release" style={{ display: 'block' }}>
                      <Link href={r.href} onClick={close} style={{ display: 'block' }}>
                        <span className="specs-release__tag">{ASSISTANT_RESULT_KIND_LABELS[r.kind]}</span>{' '}
                        <strong>{r.title}</strong>
                        {r.subtitle ? (
                          <span className="specs-grid__meta" style={{ display: 'block' }}>
                            {r.subtitle}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
        {pending && !messages[messages.length - 1]?.content ? (
          <p className="specs-grid__meta">Arther is thinking…</p>
        ) : null}
      </div>

      <div className="specs-form--row" style={{ gap: 6, padding: 12, borderTop: '1px solid var(--border, #e5e7eb)' }}>
        <input
          className="ui-field__input"
          aria-label="Message Arther"
          placeholder="Ask a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button size="sm" onClick={() => void send()} disabled={pending || input.trim().length === 0}>
          Send
        </Button>
      </div>
    </aside>
  );
}
