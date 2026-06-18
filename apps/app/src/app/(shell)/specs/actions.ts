'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import {
  addComponentToProduct,
  addFieldComment,
  clearComponentOverride,
  DbRuleError,
  createComponent,
  createProduct,
  createRelease,
  createServiceClient,
  createSpecField,
  deleteBriefFragment,
  deleteRelease,
  dispatchNotification,
  flagSnippetsForFieldChange,
  getActiveWorkspace,
  getFieldChangeImpact,
  clearPlaceholder,
  listPlaceholdersForFragment,
  listReferenceEdges,
  membershipLookupFor,
  moveSpecFieldOrder,
  propagateFieldChange,
  recordAnalyticsEvent,
  setArchived,
  setComponentOverride,
  updateFieldValue,
  upsertBriefFragment,
} from '@arther/db';
import {
  briefFragmentFormSchema,
  fieldChangeHasImpact,
  fieldTypeSchema,
  isOverridableFieldType,
  optionalText,
  requiredText,
  TEXT_LIMITS,
  wouldCreateReferenceCycle,
  type ComponentId,
  type FieldChangeImpact,
  type ProductId,
  type ReleaseId,
  type SpecFieldId,
  type UnitId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../lib/supabase/server';
import { regenerateBlockAction } from '../documents/[id]/edit/actions';

export interface SpecsFormState {
  error?: string;
  /**
   * G6.6 — set when a global value change would ripple into documents and the
   * author hasn't confirmed yet: the editor shows the blast radius and asks for
   * confirmation before committing. Cleared (absent) on a committed save.
   */
  impact?: FieldChangeImpact;
  /** G7.2 — after saving a brief fragment, how many placeholder blocks are now
   *  fillable; the editor offers a one-click fill. */
  placeholdersWaiting?: number;
  /** G7.2 — how many placeholders the fill action just regenerated. */
  placeholdersFilled?: number;
}

/**
 * Every mutation routes through canDo (guardrail 1) with RLS behind it
 * (defence in depth) — the single-call-site rule the F3 acceptance greps for.
 * 'spec.write' is editor-gated; 'comment.write' is every member's right
 * (viewers comment — billing/collaboration specs), mirrored by the 0003 RLS.
 */
async function authorize(action: 'spec.write' | 'comment.write' = 'spec.write') {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet — create one first.' as const };

  const canDo = createCanDo(membershipLookupFor(supabase));
  const allowed = await canDo({ id: user.id as UserId }, action, {
    workspaceId: workspace.id,
  });
  if (!allowed) return { error: 'Viewers can’t edit specs — ask for an Editor seat.' as const };
  return { supabase, userId: user.id as UserId, workspace };
}

const productSchema = z.object({ name: requiredText('Name the product.') });

export async function createProductAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  const productId = await createProduct(auth.supabase, {
    workspaceId: auth.workspace.id,
    name: parsed.data.name,
    createdBy: auth.userId,
  });
  revalidatePath('/specs');
  redirect(`/specs?product=${productId}`);
}

const fieldSchema = z
  .object({
    ownerKind: z.enum(['product', 'component']),
    ownerId: z.string().uuid(),
    name: requiredText('Name the field.'),
    type: fieldTypeSchema,
    category: requiredText('Categorise the field.', TEXT_LIMITS.category),
    unitId: z.string().uuid().optional().or(z.literal('')),
    options: optionalText(TEXT_LIMITS.options),
  })
  .superRefine((v, ctx) => {
    if ((v.type === 'enum' || v.type === 'multi_enum') && !parseOptions(v.options).length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'List the options, comma-separated.',
      });
    }
  });

/** Options are defined at field creation and belong to the field (spec §4.6). */
function parseOptions(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
}

export async function createFieldAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = fieldSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  await createSpecField(auth.supabase, {
    workspaceId: auth.workspace.id,
    productId:
      parsed.data.ownerKind === 'product' ? (parsed.data.ownerId as ProductId) : undefined,
    componentId:
      parsed.data.ownerKind === 'component' ? (parsed.data.ownerId as ComponentId) : undefined,
    name: parsed.data.name,
    type: parsed.data.type,
    category: parsed.data.category,
    unitId: parsed.data.unitId ? (parsed.data.unitId as UnitId) : undefined,
    options:
      parsed.data.type === 'enum' || parsed.data.type === 'multi_enum'
        ? parseOptions(parsed.data.options)
        : undefined,
    createdBy: auth.userId,
  });
  revalidatePath('/specs');
  revalidatePath('/specs/library');
  return {};
}

const numberField = z.coerce.number({ message: 'Enter a number.' }).finite();
const unitField = z.string().uuid({ message: 'Pick a unit.' });

/** Build the typed FieldValue from per-type form inputs; Zod re-validates the
 *  whole union in updateFieldValue before anything is written. */
const valueBuilders: Record<string, (form: FormData, field: { options: string[] | null }) => unknown> = {
  scalar: (f) => ({
    value: numberField.parse(f.get('value')),
    unit_id: unitField.parse(f.get('unitId')),
  }),
  range: (f) => ({
    min: numberField.parse(f.get('min')),
    max: numberField.parse(f.get('max')),
    unit_id: unitField.parse(f.get('unitId')),
  }),
  toleranced: (f) => ({
    nominal: numberField.parse(f.get('nominal')),
    tolerance: numberField.parse(f.get('tolerance')),
    tolerance_type: z.enum(['absolute', 'percentage']).parse(f.get('toleranceType')),
    unit_id: unitField.parse(f.get('unitId')),
  }),
  boolean: (f) => ({ value: f.get('value') === 'true' }),
  enum: (f, field) => ({
    selected: z.string().min(1, 'Pick a value.').parse(f.get('selected')),
    options: field.options ?? [],
  }),
  multi_enum: (f, field) => ({
    selected: f.getAll('selected').map(String),
    options: field.options ?? [],
  }),
  // The mini-spreadsheet serializes its draft to one JSON value; the full
  // tableValueSchema (roles, units, row shape) re-validates in updateFieldValue.
  table: (f) => {
    const raw = z.string().min(1, 'The table is empty.').parse(f.get('tableJson'));
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new z.ZodError([
        { code: z.ZodIssueCode.custom, message: 'Could not read the table data.', path: [] },
      ]);
    }
  },
  reference: (f) => ({
    component_id: z.string().uuid({ message: 'Pick a component.' }).parse(f.get('componentId')),
  }),
};

export async function updateFieldValueAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const head = z
    .object({ fieldId: z.string().uuid(), type: fieldTypeSchema })
    .safeParse({ fieldId: formData.get('fieldId'), type: formData.get('type') });
  if (!head.success) return { error: 'Invalid field reference.' };

  const builder = valueBuilders[head.data.type];
  if (!builder) return { error: `No editor for ${head.data.type} fields yet.` };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  // The field's option list is authoritative for enum values (spec §4.6);
  // component_id identifies the owner for the reference cycle check.
  const { data: fieldRow } = await auth.supabase
    .from('spec_fields')
    .select('options, component_id')
    .eq('id', head.data.fieldId)
    .single();
  if (!fieldRow) return { error: 'Field not found.' };

  let value: unknown;
  try {
    value = builder(formData, fieldRow as { options: string[] | null });
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0]!.message : 'Invalid value.' };
  }

  // F5.9: circular references are rejected at save. Only component-owned
  // reference fields can close a loop — products are never reference targets.
  const ownerComponentId = (fieldRow as { component_id: string | null }).component_id;
  if (head.data.type === 'reference' && ownerComponentId) {
    const target = (value as { component_id: string }).component_id;
    const edges = await listReferenceEdges(auth.supabase, auth.workspace.id);
    const existing = edges.filter((e) => e.field_id !== head.data.fieldId);
    if (wouldCreateReferenceCycle(existing, { from: ownerComponentId, to: target })) {
      return {
        error:
          'That reference would create a loop — the selected component already references this one (directly or through a chain).',
      };
    }
  }

  // G6.6 — pre-commit impact: a global value change ripples into every document
  // that cites this field (its inline tokens go stale). Surface that blast radius
  // and require an explicit confirm before committing. Opt-in via the editor's
  // hidden `impactCheck` (the table editor saves directly); a zero-impact change
  // commits without friction.
  const wantsImpactCheck = formData.get('impactCheck') === 'true';
  const confirmed = formData.get('confirmed') === 'true';
  if (wantsImpactCheck && !confirmed) {
    const impact = await getFieldChangeImpact(auth.supabase, head.data.fieldId as SpecFieldId);
    if (fieldChangeHasImpact(impact)) return { impact };
  }

  try {
    await updateFieldValue(auth.supabase, {
      fieldId: head.data.fieldId as SpecFieldId,
      type: head.data.type,
      value,
    });
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0]!.message : 'Could not save the value.' };
  }

  // G6.2 two-speed propagation: cascade the new value into every citing document's
  // working copy and flag affected prose. Best-effort — the value is already
  // committed, and staleness still reads correctly from the advanced version, so a
  // propagation hiccup must not fail the save. Moves to the durable runner with G1.2.
  try {
    await propagateFieldChange(
      createServiceClient(),
      { workspaceId: auth.workspace.id },
      { fieldId: head.data.fieldId as SpecFieldId, changedBy: auth.userId },
    );
  } catch (e) {
    console.error('[propagate] field change propagation failed', head.data.fieldId, e);
  }

  // R.9 — snippet staleness: a snippet whose prose was written around this field
  // is flagged for its owner (and the indicator surfaces on every embedding doc).
  // Best-effort, like propagation; the value is already committed.
  try {
    const service = createServiceClient();
    const flagged = await flagSnippetsForFieldChange(service, {
      workspaceId: auth.workspace.id,
      fieldId: head.data.fieldId as SpecFieldId,
      changedBy: auth.userId,
    });
    for (const snip of flagged) {
      if (!snip.ownerId || snip.ownerId === auth.userId) continue;
      await dispatchNotification(service, {
        workspaceId: auth.workspace.id,
        recipientIds: [snip.ownerId],
        eventType: 'snippet_stale_prose',
        payload: { libraryItemId: snip.snippetId, snippetName: snip.snippetName },
      });
    }
  } catch (e) {
    console.error('[snippet-staleness] flagging failed', head.data.fieldId, e);
  }

  // G8.2 — metering hook (best-effort; never fails the save).
  try {
    await recordAnalyticsEvent(
      createServiceClient(),
      { workspaceId: auth.workspace.id },
      {
        eventType: 'spec_field_updated',
        actorUserId: auth.userId,
        payload: { fieldId: head.data.fieldId, type: head.data.type },
      },
    );
  } catch (e) {
    console.error('[analytics] spec_field_updated failed', head.data.fieldId, e);
  }

  revalidatePath('/specs');
  revalidatePath('/specs/library');
  return {};
}

const releaseSchema = z.object({
  productId: z.string().uuid(),
  name: requiredText('Name the release.'),
  tag: requiredText('Tag the release (e.g. v2.1).', TEXT_LIMITS.tag),
  notes: optionalText(TEXT_LIMITS.notes),
});

/** Releases are explicit user action only — never automatic on edits (§3.8). */
export async function createReleaseAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = releaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  try {
    await createRelease(auth.supabase, {
      productId: parsed.data.productId as ProductId,
      name: parsed.data.name,
      tag: parsed.data.tag,
      notes: parsed.data.notes || undefined,
    });
  } catch (e) {
    // F8.5 — only surface DB-authored rule messages; raw errors stay generic.
    return { error: e instanceof DbRuleError ? e.message : 'Could not create the release.' };
  }
  revalidatePath('/specs');
  revalidatePath('/specs/releases');
  return {};
}

/** Confirmation happens in the UI; the 0013 guard blocks document-referenced releases. */
export async function deleteReleaseAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = z.object({ releaseId: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid release reference.' };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  try {
    await deleteRelease(auth.supabase, parsed.data.releaseId as ReleaseId);
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('documents generated')
          ? 'This release has documents generated from it — it can’t be deleted.'
          : 'Could not delete the release.',
    };
  }
  revalidatePath('/specs');
  revalidatePath('/specs/releases');
  return {};
}

const overrideHeadSchema = z.object({
  productComponentId: z.string().uuid(),
  fieldId: z.string().uuid(),
  type: fieldTypeSchema,
});

/** Product-specific override on a shared component field (§3.5, scalar family only). */
export async function setOverrideAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const head = overrideHeadSchema.safeParse({
    productComponentId: formData.get('productComponentId'),
    fieldId: formData.get('fieldId'),
    type: formData.get('type'),
  });
  if (!head.success) return { error: 'Invalid override reference.' };
  if (!isOverridableFieldType(head.data.type)) {
    return { error: `${head.data.type} fields can’t be overridden per product.` };
  }

  const builder = valueBuilders[head.data.type];
  if (!builder) return { error: `No editor for ${head.data.type} fields yet.` };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  // The field's option list stays authoritative for enum overrides (§4.6).
  const { data: fieldRow } = await auth.supabase
    .from('spec_fields')
    .select('options')
    .eq('id', head.data.fieldId)
    .single();
  if (!fieldRow) return { error: 'Field not found.' };

  let value: unknown;
  try {
    value = builder(formData, fieldRow as { options: string[] | null });
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0]!.message : 'Invalid value.' };
  }

  try {
    await setComponentOverride(auth.supabase, {
      workspaceId: auth.workspace.id,
      productComponentId: head.data.productComponentId,
      fieldId: head.data.fieldId as SpecFieldId,
      type: head.data.type,
      value,
      setBy: auth.userId,
    });
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0]!.message : 'Could not save the override.' };
  }
  revalidatePath('/specs');
  return {};
}

export async function clearOverrideAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = z
    .object({ productComponentId: z.string().uuid(), fieldId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid override reference.' };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  try {
    await clearComponentOverride(auth.supabase, {
      productComponentId: parsed.data.productComponentId,
      fieldId: parsed.data.fieldId as SpecFieldId,
    });
  } catch {
    return { error: 'Could not remove the override.' };
  }
  revalidatePath('/specs');
  return {};
}

const componentSchema = z.object({
  name: requiredText('Name the component.'),
  componentType: z.enum(['assembly', 'module', 'part']).default('part'),
});

export async function createComponentAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = componentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  await createComponent(auth.supabase, {
    workspaceId: auth.workspace.id,
    name: parsed.data.name,
    type: parsed.data.componentType,
    createdBy: auth.userId,
  });
  revalidatePath('/specs/library');
  return {};
}

const moveFieldSchema = z.object({
  fieldId: z.string().uuid(),
  direction: z.coerce.number().int().refine((n) => n === 1 || n === -1, 'Bad direction.'),
});

/** F6 — reorder a spec field one step within its category (editor-gated). */
export async function moveFieldAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = moveFieldSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid move.' };

  const auth = await authorize('spec.write');
  if ('error' in auth) return { error: auth.error };

  try {
    await moveSpecFieldOrder(auth.supabase, {
      fieldId: parsed.data.fieldId as SpecFieldId,
      direction: parsed.data.direction as -1 | 1,
      userId: auth.userId,
    });
  } catch {
    return { error: 'Could not reorder the field.' };
  }
  revalidatePath('/specs');
  revalidatePath('/specs/library');
  return {};
}

const attachSchema = z.object({
  productId: z.string().uuid(),
  componentId: z.string().uuid({ message: 'Pick a component.' }),
  parentEdgeId: z.string().uuid().optional().or(z.literal('')),
  quantity: z.coerce.number().int().positive().default(1),
});

export async function attachComponentAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = attachSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  await addComponentToProduct(auth.supabase, {
    workspaceId: auth.workspace.id,
    productId: parsed.data.productId as ProductId,
    componentId: parsed.data.componentId as ComponentId,
    parentEdgeId: parsed.data.parentEdgeId || undefined,
    quantity: parsed.data.quantity,
    createdBy: auth.userId,
  });
  revalidatePath('/specs');
  return {};
}

const commentSchema = z.object({
  fieldId: z.string().uuid(),
  body: requiredText('Write the comment first.', TEXT_LIMITS.comment),
  // F6 — a reply threads under its parent; absent/empty means a top-level comment.
  parentCommentId: z.string().uuid().optional().or(z.literal('')),
});

/** F5.8 — commenting is a member right (viewers included). */
export async function addCommentAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize('comment.write');
  if ('error' in auth) return { error: auth.error };

  try {
    await addFieldComment(auth.supabase, {
      workspaceId: auth.workspace.id,
      fieldId: parsed.data.fieldId as SpecFieldId,
      body: parsed.data.body,
      authorId: auth.userId,
      parentCommentId: parsed.data.parentCommentId || undefined,
    });
  } catch {
    return { error: 'Could not post the comment.' };
  }
  revalidatePath('/specs');
  revalidatePath('/specs/library');
  return {};
}

/**
 * G0.6 — save (or clear) a Product Brief fragment. Briefs are authoring
 * content, so this is editor-gated (`spec.write`, matching the 0004 RLS). The
 * key + body are bounded at the boundary (F8.5); an empty body clears the
 * fragment back to "not yet added" rather than persisting a blank.
 */
export async function saveBriefFragmentAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = briefFragmentFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  const content = parsed.data.content.trim();
  try {
    if (content.length === 0) {
      await deleteBriefFragment(auth.supabase, {
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        key: parsed.data.key,
      });
    } else {
      await upsertBriefFragment(auth.supabase, {
        workspaceId: auth.workspace.id,
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        key: parsed.data.key,
        content,
        userId: auth.userId,
      });
    }
  } catch {
    return { error: 'Could not save the brief fragment.' };
  }
  revalidatePath('/specs');
  revalidatePath('/specs/library');

  // G7.2 — once the fragment has content, surface the placeholder blocks waiting
  // on it so the author can fill them in one click.
  if (content.length > 0) {
    try {
      const waiting = await listPlaceholdersForFragment(
        auth.supabase,
        parsed.data.entityType,
        parsed.data.entityId,
        parsed.data.key,
      );
      if (waiting.length > 0) return { placeholdersWaiting: waiting.length };
    } catch {
      // Best-effort — never fail the save over the offer.
    }
  }
  return {};
}

/**
 * G7.2 — fill the placeholder blocks waiting on a just-saved brief fragment:
 * regenerate each (now that the fragment has content) and drop its placeholder
 * marker. Reuses the G7.1 single-block regeneration; gated/rate-limited inside it.
 */
export async function fillPlaceholdersAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = z
    .object({
      entityType: z.enum(['product', 'component']),
      entityId: z.string().uuid(),
      key: requiredText('Missing the fragment key.'),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid request.' };

  const auth = await authorize('spec.write');
  if ('error' in auth) return { error: auth.error };

  let filled = 0;
  try {
    const waiting = await listPlaceholdersForFragment(
      auth.supabase,
      parsed.data.entityType,
      parsed.data.entityId,
      parsed.data.key,
    );
    for (const ph of waiting) {
      const res = await regenerateBlockAction(ph.blockId);
      if (res.ok) {
        await clearPlaceholder(auth.supabase, ph.blockId, auth.userId);
        filled += 1;
      }
    }
  } catch {
    return { error: 'Could not fill the waiting blocks.' };
  }
  revalidatePath('/specs');
  revalidatePath('/specs/library');
  return { placeholdersFilled: filled };
}

const archiveSchema = z.object({
  entity: z.enum(['products', 'components', 'spec_fields']),
  id: z.string().uuid(),
  archived: z.enum(['true', 'false']),
});

/** F5.10 — soft archive/restore; hard delete stays DB-guarded with no UI. */
export async function setArchivedAction(
  _prev: SpecsFormState,
  formData: FormData,
): Promise<SpecsFormState> {
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid archive request.' };

  const auth = await authorize();
  if ('error' in auth) return { error: auth.error };

  try {
    await setArchived(auth.supabase, {
      entity: parsed.data.entity,
      id: parsed.data.id,
      archived: parsed.data.archived === 'true',
      userId: auth.userId,
    });
  } catch {
    return { error: 'Could not change the archive state.' };
  }
  revalidatePath('/specs');
  revalidatePath('/specs/library');
  return {};
}
