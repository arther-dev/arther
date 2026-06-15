'use client';

import { useEffect } from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import type { BrandProfileRow } from '@arther/db';
import { formatPreferredTerms, UNIT_PREFERENCES } from '@arther/types';
import { Button, TextField } from '@arther/ui';
import {
  archiveBrandProfileAction,
  createBrandProfileAction,
  restoreBrandProfileAction,
  setDefaultBrandProfileAction,
  updateBrandProfileAction,
  type BrandProfileFormState,
} from './actions';

/** The shared field set — used by both the create and edit forms. */
function ProfileFields({ profile }: { profile?: BrandProfileRow }) {
  return (
    <>
      <TextField
        id="bp-name"
        name="name"
        label="Name"
        defaultValue={profile?.name ?? ''}
        placeholder="House Style"
      />
      <TextField
        id="bp-logo"
        name="logoUrl"
        label="Logo URL (optional)"
        defaultValue={profile?.logo_url ?? ''}
        placeholder="https://…/logo.svg"
      />
      <TextField
        id="bp-colour"
        name="primaryColour"
        label="Primary colour (hex, optional)"
        defaultValue={profile?.primary_colour ?? ''}
        placeholder="#1A2B3C"
      />
      <div className="specs-form--row">
        <TextField
          id="bp-heading"
          name="headingFont"
          label="Heading font (optional)"
          defaultValue={profile?.typography?.heading_font ?? ''}
        />
        <TextField
          id="bp-body"
          name="bodyFont"
          label="Body font (optional)"
          defaultValue={profile?.typography?.body_font ?? ''}
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="bp-voice">
          Voice descriptors (comma-separated)
        </label>
        <input
          id="bp-voice"
          name="voiceDescriptors"
          className="ui-field__input"
          defaultValue={(profile?.voice_descriptors ?? []).join(', ')}
          placeholder="precise, confident, direct"
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="bp-tone">
          Tone notes (optional)
        </label>
        <textarea
          id="bp-tone"
          name="toneNotes"
          className="ui-field__input"
          rows={2}
          defaultValue={profile?.tone_notes ?? ''}
          placeholder="Freeform guidance for the AI."
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="bp-preferred">
          Preferred terms (one per line: <code>term =&gt; preferred</code>)
        </label>
        <textarea
          id="bp-preferred"
          name="preferredTerms"
          className="ui-field__input"
          rows={3}
          defaultValue={formatPreferredTerms(profile?.glossary?.preferred_terms ?? {})}
          placeholder="motor controller => servo drive"
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="bp-prohibited">
          Prohibited terms (comma-separated)
        </label>
        <input
          id="bp-prohibited"
          name="prohibitedTerms"
          className="ui-field__input"
          defaultValue={(profile?.glossary?.prohibited_terms ?? []).join(', ')}
        />
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="bp-units">
          Unit preference
        </label>
        <select
          id="bp-units"
          name="unitPreference"
          className="ui-field__input"
          defaultValue={profile?.unit_preference ?? 'metric'}
        >
          {UNIT_PREFERENCES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export function CreateBrandProfileForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<BrandProfileFormState, FormData>(
    createBrandProfileAction,
    {},
  );
  useEffect(() => {
    if (state.createdId) router.push(`/settings/brand-profiles/${state.createdId}`);
  }, [state.createdId, router]);

  return (
    <form action={action} className="specs-form" noValidate>
      <ProfileFields />
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Creating…' : 'Create brand profile'}
      </Button>
    </form>
  );
}

export function EditBrandProfileForm({ profile }: { profile: BrandProfileRow }) {
  const [state, action, pending] = useActionState<BrandProfileFormState, FormData>(
    updateBrandProfileAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <input type="hidden" name="id" value={profile.id} />
      <ProfileFields profile={profile} />
      {state.error ? <p className="ui-field__error">{state.error}</p> : null}
      <div className="specs-form--row">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        {state.done ? <span className="specs-grid__meta">Saved.</span> : null}
      </div>
    </form>
  );
}

export function SetDefaultButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<BrandProfileFormState, FormData>(
    setDefaultBrandProfileAction,
    {},
  );
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="specs-value-button" disabled={pending}>
        {pending ? 'Setting…' : 'Make default'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

export function ArchiveBrandProfileButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<BrandProfileFormState, FormData>(
    archiveBrandProfileAction,
    {},
  );
  return (
    <form
      action={action}
      className="specs-form--inline"
      onSubmit={(e) => {
        if (!window.confirm(`Archive “${name}”? It stops appearing in pickers but is kept.`))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={`Archive ${name}`}
        disabled={pending}
      >
        {pending ? 'Archiving…' : 'Archive'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}

export function RestoreBrandProfileButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<BrandProfileFormState, FormData>(
    restoreBrandProfileAction,
    {},
  );
  return (
    <form action={action} className="specs-form--inline">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="specs-value-button"
        aria-label={`Restore ${name}`}
        disabled={pending}
      >
        {pending ? 'Restoring…' : 'Restore'}
      </button>
      {state.error ? <span className="ui-field__error">{state.error}</span> : null}
    </form>
  );
}
