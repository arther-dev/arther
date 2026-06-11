'use client';

import { useActionState } from 'react';
import { Button, TextField } from '@arther/ui';
import { logIn, type AuthFormState } from '../actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(logIn, {});
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
      <TextField
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'}
      </Button>
    </form>
  );
}
