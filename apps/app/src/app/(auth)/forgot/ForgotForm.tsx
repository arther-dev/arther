'use client';

import { useActionState } from 'react';
import { Button, TextField } from '@arther/ui';
import { requestPasswordReset, type AuthFormState } from '../actions';

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    {},
  );
  if (state.done) {
    return (
      <p className="auth-subtext" role="status">
        If an account exists for that email, a reset link is on its way. Links expire after one
        hour.
      </p>
    );
  }
  return (
    <form action={action} className="auth-form" noValidate>
      {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
      <TextField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        error={state.fieldErrors?.email}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
