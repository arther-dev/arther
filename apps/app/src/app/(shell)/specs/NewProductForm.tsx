'use client';

import { useActionState } from 'react';
import { Button, TextField } from '@arther/ui';
import { createProductAction, type SpecsFormState } from './actions';

export function NewProductForm() {
  const [state, action, pending] = useActionState<SpecsFormState, FormData>(
    createProductAction,
    {},
  );
  return (
    <form action={action} className="specs-form" noValidate>
      <TextField
        id="new-product-name"
        name="name"
        label="New product"
        placeholder="BLDC Motor X1"
        error={state.error}
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending}
        data-arther-spotlight="add-product"
      >
        {pending ? 'Adding…' : 'Add product'}
      </Button>
    </form>
  );
}
