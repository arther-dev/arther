'use client';

import { useActionState, useState } from 'react';
import { slugifyWorkspaceName } from '@arther/types';
import { Button, TextField } from '@arther/ui';
import { createWorkspace, type AuthFormState } from '../actions';

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(createWorkspace, {});
  const [name, setName] = useState('');
  const slug = slugifyWorkspaceName(name);
  return (
    <form action={action} className="auth-form" noValidate>
      {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
      <TextField
        id="name"
        name="name"
        label="Workspace name"
        placeholder="Acme Motors"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={state.fieldErrors?.name}
      />
      <p className="auth-slug-preview" data-testid="slug-preview">
        {/* Live preview; the slug is immutable after creation (portal subdomain). */}
        Portal address: <code>{`${slug || '…'}.arther.io`}</code>
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create workspace'}
      </Button>
    </form>
  );
}
