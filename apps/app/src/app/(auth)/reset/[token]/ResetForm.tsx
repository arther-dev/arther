'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button, TextField } from '@arther/ui';
import { resetPassword, type AuthFormState } from '../../actions';

export function ResetForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resetPassword, {});
  if (state.done) {
    return (
      <>
        <p className="auth-subtext" role="status">
          Your password has been updated.
        </p>
        <div className="auth-links">
          <span />
          <Link href="/login">Log in</Link>
        </div>
      </>
    );
  }
  return (
    <form action={action} className="auth-form" noValidate>
      {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
      <TextField
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      />
      <TextField
        id="confirm"
        name="confirm"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirm}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Set password'}
      </Button>
    </form>
  );
}
