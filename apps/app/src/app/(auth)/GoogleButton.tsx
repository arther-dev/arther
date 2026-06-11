'use client';

import { useActionState } from 'react';
import { Button } from '@arther/ui';
import { continueWithGoogle, type AuthFormState } from './actions';

/** Parallel auth method on Log in / Sign up / Accept invite (auth IA §7). */
export function GoogleButton() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    async (_prev, _formData) => continueWithGoogle(),
    {},
  );
  return (
    <form action={action} className="auth-form">
      {state.error ? <p className="auth-error">{state.error}</p> : null}
      <Button variant="secondary" type="submit" disabled={pending}>
        Continue with Google
      </Button>
    </form>
  );
}
