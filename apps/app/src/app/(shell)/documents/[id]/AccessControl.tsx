'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { DocumentAccessMode } from '@arther/types';
import { issueOpenMagicLinkAction, setDocumentAccessAction } from './lifecycle-actions';

/**
 * C7.1/C7.2 — the owner's portal-access controls for a published document. The
 * access tier (Public ↔ Link-gated) writes `access_config`; when link-gated, the
 * owner can issue an open magic link (a shareable URL shown once — email delivery
 * arrives with the notification system, C3). Rendered only when the viewer may
 * manage the document and a live publication exists (computed server-side).
 */
export function AccessControl({
  documentId,
  access,
}: {
  documentId: string;
  access: DocumentAccessMode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(14);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function setTier(next: DocumentAccessMode) {
    if (next === access) return;
    setError(null);
    setIssuedUrl(null);
    startTransition(async () => {
      const result = await setDocumentAccessAction(documentId, next);
      if (result.ok) router.refresh();
      else setError(result.error ?? 'Could not update access.');
    });
  }

  function issue(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await issueOpenMagicLinkAction(documentId, { email, expiresInDays: days });
      if (result.ok && result.url) {
        setIssuedUrl(result.url);
        setEmail('');
      } else {
        setError(result.error ?? 'Could not issue the link.');
      }
    });
  }

  return (
    <section className="doc-access" aria-label="Portal access">
      <div className="doc-lifecycle__row">
        <span className="specs-grid__meta">Portal access:</span>
        <button
          type="button"
          className={`ui-btn ${access === 'public' ? 'ui-btn--primary' : 'ui-btn--ghost'}`}
          disabled={pending}
          onClick={() => setTier('public')}
        >
          Public
        </button>
        <button
          type="button"
          className={`ui-btn ${access === 'link' ? 'ui-btn--primary' : 'ui-btn--ghost'}`}
          disabled={pending}
          onClick={() => setTier('link')}
        >
          Link-gated
        </button>
      </div>

      {access === 'link' && (
        <form className="doc-access__issue" onSubmit={issue}>
          <p className="specs-grid__meta">
            This document is hidden from the public portal. Issue an access link to share it.
          </p>
          <div className="doc-lifecycle__row">
            <input
              className="ui-field__input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="recipient@example.com"
              aria-label="Recipient email"
              required
            />
            <input
              className="ui-field__input"
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Link expiry in days"
              style={{ width: '5rem' }}
            />
            <span className="specs-grid__meta">days</span>
            <button type="submit" className="ui-btn ui-btn--primary" disabled={pending}>
              {pending ? 'Issuing…' : 'Issue access link'}
            </button>
          </div>
        </form>
      )}

      {issuedUrl && (
        <div className="doc-access__issued" role="status">
          <p className="specs-grid__meta">
            Copy this link now — it’s shown once and grants a 24-hour session:
          </p>
          <div className="doc-lifecycle__row">
            <input className="ui-field__input" readOnly value={issuedUrl} aria-label="Access link" />
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(issuedUrl);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
