'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { MagicLinkSummary } from '@arther/db';
import type { DocumentAccessMode, DocumentAllowlist } from '@arther/types';
import {
  issueMagicLinkAction,
  revokeMagicLinkAction,
  setDocumentAccessAction,
} from './lifecycle-actions';

/**
 * C7.1/C7.3/C7.4 — the owner's portal-access controls for a published document.
 * Sets the access tier (Public · Link-gated · Allowlist), edits the allowlist,
 * issues magic links (a shareable URL shown once), and lists/revokes issued links.
 * Rendered only when the viewer may manage the document and a live publication
 * exists (computed server-side).
 */

const TIERS: { mode: DocumentAccessMode; label: string }[] = [
  { mode: 'public', label: 'Public' },
  { mode: 'link', label: 'Link-gated' },
  { mode: 'allowlist', label: 'Allowlist' },
];

function toLines(values: readonly string[]): string {
  return values.join('\n');
}
function fromLines(text: string): string[] {
  return text.split(/[\n,]/).map((s) => s.trim());
}

export function AccessControl({
  documentId,
  access,
  allowlist,
  links,
}: {
  documentId: string;
  access: DocumentAccessMode;
  allowlist: DocumentAllowlist;
  links: MagicLinkSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [emailsText, setEmailsText] = useState(toLines(allowlist.emails));
  const [domainsText, setDomainsText] = useState(toLines(allowlist.domains));
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(14);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const gated = access === 'link' || access === 'allowlist';

  function setTier(next: DocumentAccessMode) {
    if (next === access) return;
    setError(null);
    setIssuedUrl(null);
    startTransition(async () => {
      const result =
        next === 'allowlist'
          ? await setDocumentAccessAction(documentId, 'allowlist', {
              emails: fromLines(emailsText),
              domains: fromLines(domainsText),
            })
          : await setDocumentAccessAction(documentId, next);
      if (result.ok) router.refresh();
      else setError(result.error ?? 'Could not update access.');
    });
  }

  function saveAllowlist(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await setDocumentAccessAction(documentId, 'allowlist', {
        emails: fromLines(emailsText),
        domains: fromLines(domainsText),
      });
      if (result.ok) router.refresh();
      else setError(result.error ?? 'Could not save the allowlist.');
    });
  }

  function issue(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await issueMagicLinkAction(documentId, { email, expiresInDays: days });
      if (result.ok && result.url) {
        setIssuedUrl(result.url);
        setEmail('');
        router.refresh();
      } else {
        setError(result.error ?? 'Could not issue the link.');
      }
    });
  }

  function revoke(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeMagicLinkAction(documentId, id);
      if (result.ok) router.refresh();
      else setError(result.error ?? 'Could not revoke the link.');
    });
  }

  return (
    <section className="doc-access" aria-label="Portal access">
      <div className="doc-lifecycle__row">
        <span className="specs-grid__meta">Portal access:</span>
        {TIERS.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className={`ui-btn ${access === mode ? 'ui-btn--primary' : 'ui-btn--ghost'}`}
            disabled={pending}
            onClick={() => setTier(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      {access === 'allowlist' && (
        <form className="doc-access__panel" onSubmit={saveAllowlist}>
          <p className="specs-grid__meta">
            Only links issued to an allowlisted email or domain will work. One per line.
          </p>
          <label className="ui-field">
            <span className="ui-field__label">Emails</span>
            <textarea
              className="ui-field__input"
              rows={3}
              value={emailsText}
              onChange={(e) => setEmailsText(e.target.value)}
              placeholder={'alice@acme.com\nbob@acme.com'}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field__label">Domains</span>
            <textarea
              className="ui-field__input"
              rows={2}
              value={domainsText}
              onChange={(e) => setDomainsText(e.target.value)}
              placeholder={'acme.com\npartner.io'}
            />
          </label>
          <div className="doc-lifecycle__row">
            <button type="submit" className="ui-btn ui-btn--primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save allowlist'}
            </button>
          </div>
        </form>
      )}

      {gated && (
        <form className="doc-access__panel" onSubmit={issue}>
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

      {gated && links.length > 0 && (
        <table className="doc-access__links">
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Type</th>
              <th>Expires</th>
              <th>Status</th>
              <th>Views</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={link.id} className={`doc-access__link doc-access__link--${link.status}`}>
                <td>{link.email}</td>
                <td>{link.type === 'allowlist' ? 'Allowlist' : 'Open'}</td>
                <td>{new Date(link.expiresAt).toLocaleDateString()}</td>
                <td>{link.status}</td>
                <td>{link.accessCount}</td>
                <td>
                  {link.status === 'active' ? (
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      disabled={pending}
                      onClick={() => revoke(link.id)}
                    >
                      Revoke
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
