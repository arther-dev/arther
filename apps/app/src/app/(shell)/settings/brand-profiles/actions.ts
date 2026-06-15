'use server';

import { revalidatePath } from 'next/cache';
import { createCanDo } from '@arther/authz';
import {
  archiveBrandProfile,
  createBrandProfile,
  getActiveWorkspace,
  membershipLookupFor,
  restoreBrandProfile,
  setDefaultBrandProfile,
  updateBrandProfile,
  type BrandProfileInput,
} from '@arther/db';
import {
  brandProfileFormSchema,
  brandProfileIdSchema,
  parsePreferredTerms,
  parseStringList,
  type BrandProfileForm,
  type BrandProfileId,
  type UserId,
} from '@arther/types';
import { getSupabaseServer } from '../../../../lib/supabase/server';

export interface BrandProfileFormState {
  error?: string;
  done?: boolean;
  /** Set after a successful create so the form can route to the new editor. */
  createdId?: string;
}

/** Brand Profiles are owner/admin (canDo 'workspace.manage', matching the 0004 RLS). */
async function authorizeManage() {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) return { error: 'No workspace yet — create one first.' as const };

  const canDo = createCanDo(membershipLookupFor(supabase));
  const allowed = await canDo({ id: user.id as UserId }, 'workspace.manage', {
    workspaceId: workspace.id,
  });
  if (!allowed) return { error: 'Only workspace admins can manage brand profiles.' as const };
  return { supabase, userId: user.id as UserId, workspace };
}

/** Turn the validated free-text form into the stored JSONB shapes (G0.4). */
function toInput(form: BrandProfileForm): BrandProfileInput {
  const typography: BrandProfileInput['typography'] = {};
  if (form.headingFont) typography.heading_font = form.headingFont;
  if (form.bodyFont) typography.body_font = form.bodyFont;
  return {
    name: form.name,
    logoUrl: form.logoUrl ? form.logoUrl : null,
    primaryColour: form.primaryColour ? form.primaryColour : null,
    typography,
    voiceDescriptors: parseStringList(form.voiceDescriptors ?? ''),
    toneNotes: form.toneNotes ? form.toneNotes : null,
    glossary: {
      preferred_terms: parsePreferredTerms(form.preferredTerms ?? ''),
      prohibited_terms: parseStringList(form.prohibitedTerms ?? ''),
    },
    unitPreference: form.unitPreference,
  };
}

export async function createBrandProfileAction(
  _prev: BrandProfileFormState,
  formData: FormData,
): Promise<BrandProfileFormState> {
  const parsed = brandProfileFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  let createdId: BrandProfileId;
  try {
    createdId = await createBrandProfile(auth.supabase, {
      workspaceId: auth.workspace.id,
      createdBy: auth.userId,
      ...toInput(parsed.data),
    });
  } catch {
    return { error: 'Could not create the brand profile.' };
  }
  revalidatePath('/settings/brand-profiles');
  return { done: true, createdId };
}

export async function updateBrandProfileAction(
  _prev: BrandProfileFormState,
  formData: FormData,
): Promise<BrandProfileFormState> {
  const idParsed = brandProfileIdSchema.safeParse(formData.get('id'));
  const parsed = brandProfileFormSchema.safeParse(Object.fromEntries(formData));
  if (!idParsed.success) return { error: 'Invalid brand profile reference.' };
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateBrandProfile(auth.supabase, {
      id: idParsed.data,
      updatedBy: auth.userId,
      ...toInput(parsed.data),
    });
  } catch {
    return { error: 'Could not save the brand profile.' };
  }
  revalidatePath('/settings/brand-profiles');
  revalidatePath(`/settings/brand-profiles/${idParsed.data}`);
  return { done: true };
}

export async function setDefaultBrandProfileAction(
  _prev: BrandProfileFormState,
  formData: FormData,
): Promise<BrandProfileFormState> {
  const idParsed = brandProfileIdSchema.safeParse(formData.get('id'));
  if (!idParsed.success) return { error: 'Invalid brand profile reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await setDefaultBrandProfile(auth.supabase, {
      workspaceId: auth.workspace.id,
      id: idParsed.data,
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not set the workspace default.' };
  }
  revalidatePath('/settings/brand-profiles');
  return { done: true };
}

export async function archiveBrandProfileAction(
  _prev: BrandProfileFormState,
  formData: FormData,
): Promise<BrandProfileFormState> {
  const idParsed = brandProfileIdSchema.safeParse(formData.get('id'));
  if (!idParsed.success) return { error: 'Invalid brand profile reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    const result = await archiveBrandProfile(auth.supabase, {
      workspaceId: auth.workspace.id,
      id: idParsed.data,
      archivedBy: auth.userId,
    });
    if (result.blocked === 'last-profile') {
      return { error: 'A workspace needs at least one brand profile — create another first.' };
    }
  } catch {
    return { error: 'Could not archive the brand profile.' };
  }
  revalidatePath('/settings/brand-profiles');
  return { done: true };
}

export async function restoreBrandProfileAction(
  _prev: BrandProfileFormState,
  formData: FormData,
): Promise<BrandProfileFormState> {
  const idParsed = brandProfileIdSchema.safeParse(formData.get('id'));
  if (!idParsed.success) return { error: 'Invalid brand profile reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await restoreBrandProfile(auth.supabase, { id: idParsed.data, updatedBy: auth.userId });
  } catch {
    return { error: 'Could not restore the brand profile.' };
  }
  revalidatePath('/settings/brand-profiles');
  return { done: true };
}
