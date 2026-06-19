'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  assistantModuleForPath,
  ASSISTANT_RESULT_KIND_LABELS,
  describeAssistantAction,
  spotlightTargetById,
  type AssistantAction,
  type AssistantExecutedAction,
  type AssistantMessage,
  type AssistantResult,
} from '@arther/types';
import { Button } from '@arther/ui';
import { useAssistant } from './AssistantContext';

type ProposalState = 'pending' | 'running' | 'done' | 'cancelled';

type UiMessage = AssistantMessage & {
  results?: AssistantResult[];
  /** K.5 — immediate navigation suggestions, rendered as one-tap links. */
  navigates?: AssistantAction[];
  /** K.5 — proposed write actions awaiting explicit confirmation. */
  proposal?: AssistantAction[];
  proposalState?: ProposalState;
  /** K.5 — per-action outcomes once the user confirms the batch. */
  executed?: AssistantExecutedAction[];
  /** K.6 — an on-screen control this reply points to (highlightable on demand). */
  spotlight?: string;
};

/**
 * K.1/K.2/K.3/K.4/K.5/K.6 — the Ask Arther panel: a right-edge slide-in that
 * answers questions about Arther, finds the user's content, takes gated actions,
 * and points at on-screen controls. Each turn sends the conversation + the user's
 * current context (module · page) to /api/assistant, which streams an NDJSON
 * response — read-action result cards, navigation links, a write-action
 * confirmation card, the reply token-by-token, then an optional spotlight target.
 * Confirming a write batch POSTs to /api/assistant/execute (which re-checks canDo
 * per action); a spotlight highlights the control via the K.6 overlay.
 * Session-scoped: the transcript clears on reload.
 */
export function AskArtherPanel() {
  const { open, close, requestSpotlight } = useAssistant();
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

  // Patch a specific message by index (a confirmation can land after later turns).
  const patchAt = (index: number, patch: Partial<UiMessage>) =>
    setMessages((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const copy = [...prev];
      copy[index] = { ...copy[index]!, ...patch };
      return copy;
    });

  // K.5 — the user confirmed the proposed write batch: run it through the
  // execute route (which re-checks canDo per action) and show per-item outcomes.
  async function confirmProposal(index: number, actions: AssistantAction[]) {
    patchAt(index, { proposalState: 'running' });
    const fallback = (error: string): AssistantExecutedAction[] =>
      actions.map((a) => ({ kind: a.kind, label: describeAssistantAction(a), ok: false, error }));
    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      });
      if (!res.ok) {
        patchAt(index, { proposalState: 'done', executed: fallback('Couldn’t run that just now.') });
        return;
      }
      const data = (await res.json()) as { results?: AssistantExecutedAction[] };
      patchAt(index, { proposalState: 'done', executed: data.results ?? fallback('No result.') });
    } catch {
      patchAt(index, { proposalState: 'done', executed: fallback('Couldn’t reach the server.') });
    }
  }

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
        let msg: {
          type?: string;
          text?: string;
          results?: AssistantResult[];
          actions?: AssistantAction[];
          target?: string;
        };
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
        } else if (msg.type === 'navigate' && Array.isArray(msg.actions)) {
          patchLast({ navigates: msg.actions });
        } else if (msg.type === 'proposal' && Array.isArray(msg.actions)) {
          patchLast({ proposal: msg.actions, proposalState: 'pending' });
        } else if (msg.type === 'spotlight' && typeof msg.target === 'string') {
          // K.6 — fire the highlight now, and keep a re-trigger link on the reply.
          patchLast({ spotlight: msg.target });
          requestSpotlight(msg.target);
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
            m.role === 'assistant' &&
            !m.content &&
            !(m.results && m.results.length > 0) &&
            !(m.navigates && m.navigates.length > 0) &&
            !(m.proposal && m.proposal.length > 0) ? null : (
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
              {/* K.5 — immediate navigation suggestions: one-tap, no confirmation. */}
              {m.navigates && m.navigates.length > 0 ? (
                <div className="specs-form--row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {m.navigates.map((a, j) =>
                    a.kind === 'navigate' ? (
                      <Link key={j} href={a.path} onClick={close} className="specs-value-button">
                        Go to {a.label} →
                      </Link>
                    ) : null,
                  )}
                </div>
              ) : null}
              {/* K.6 — re-trigger the spotlight for the control this reply points to. */}
              {m.spotlight ? (
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="specs-value-button"
                    onClick={() => requestSpotlight(m.spotlight!)}
                  >
                    Show me {spotlightTargetById(m.spotlight)?.label ?? 'where'} →
                  </button>
                </div>
              ) : null}
              {/* K.5 — proposed write actions: nothing runs until the user confirms. */}
              {m.proposal && m.proposal.length > 0 ? (
                <div
                  className="specs-release"
                  style={{ display: 'block', marginTop: 6, borderColor: 'var(--border-strong, #cbd5e1)' }}
                >
                  <span className="specs-release__tag">Proposed changes</span>
                  <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                    {m.proposal.map((a, j) => (
                      <li key={j}>{describeAssistantAction(a)}</li>
                    ))}
                  </ul>
                  {(!m.proposalState || m.proposalState === 'pending') ? (
                    <div className="specs-form--row" style={{ gap: 6 }}>
                      <Button size="sm" onClick={() => void confirmProposal(i, m.proposal!)}>
                        Confirm
                      </Button>
                      <button
                        type="button"
                        className="specs-value-button"
                        onClick={() => patchAt(i, { proposalState: 'cancelled' })}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                  {m.proposalState === 'running' ? (
                    <span className="specs-grid__meta">Working…</span>
                  ) : null}
                  {m.proposalState === 'cancelled' ? (
                    <span className="specs-grid__meta">Cancelled — nothing was changed.</span>
                  ) : null}
                  {m.proposalState === 'done' && m.executed ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {m.executed.map((r, j) => (
                        <li key={j} className="specs-grid__meta">
                          {r.ok ? '✓ ' : '✕ '}
                          {r.ok && r.href ? (
                            <Link href={r.href} onClick={close}>
                              {r.label}
                            </Link>
                          ) : (
                            r.label
                          )}
                          {!r.ok && r.error ? ` — ${r.error}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
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
