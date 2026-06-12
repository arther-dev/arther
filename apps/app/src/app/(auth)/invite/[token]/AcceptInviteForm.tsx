'use client';

import { useActionState } from 'react';
import { Button } from '@arther/ui';
import { acceptInviteAction, type AuthFormState } from '../../actions';

export function AcceptInviteForm({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(acceptInviteAction, {});
  return (
    <form action={action} className="auth-form" noValidate>
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Joining…' : 'Accept invitation'}
      </Button>
      {state.error ? <p className="auth-error">{state.error}</p> : null}
    </form>
  );
}
