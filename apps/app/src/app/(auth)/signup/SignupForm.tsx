'use client';

import { useActionState } from 'react';
import { Button, TextField } from '@arther/ui';
import { signUp, type AuthFormState } from '../actions';

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUp, {});
  return (
    <form action={action} className="auth-form" noValidate>
      {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
      <TextField
        id="name"
        name="name"
        label="Name"
        autoComplete="name"
        error={state.fieldErrors?.name}
      />
      <TextField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        error={state.fieldErrors?.email}
      />
      <TextField
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
