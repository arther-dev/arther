'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sendEmail } from '@arther/config';
import { rateLimit } from '@arther/rate-limit';
import {
  cancelWorkspaceDeletion,
  createInvitation,
  DbRuleError,
  isMemberEmail,
  removeMember,
  requestWorkspaceDeletion,
  revokeInvitation,
  transferOwnership,
  updateMemberRole,
  updateWorkspaceLogo,
  updateWorkspaceName,
} from '@arther/db';
import { emailField, requiredText, type UserId, type WorkspaceId } from '@arther/types';
import { authorizeAction } from '../../../lib/authorize';
import { appOrigin } from '../../../lib/origin';
import { getSupabaseServer } from '../../../lib/supabase/server';

export interface SettingsFormState {
  error?: string;
  done?: boolean;
  /** Set after creating an invitation — the copyable accept link (F4.3). */
  inviteUrl?: string;
}

/** Workspace administration is owner/admin (canDo 'workspace.manage', guardrail 1). */
async function authorizeManage() {
  return authorizeAction('workspace.manage', 'Only workspace admins can change this.');
}

export async function renameWorkspaceAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = z
    .object({ name: requiredText('Name the workspace.') })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateWorkspaceName(auth.supabase, {
      workspaceId: auth.workspace.id,
      name: parsed.data.name,
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not rename the workspace.' };
  }
  revalidatePath('/settings');
  return { done: true };
}

const LOGO_BUCKET = 'workspace-logos';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif'];

/**
 * F4.1/F4.5 — upload a workspace logo to Storage (public `workspace-logos`
 * bucket) and pin its public URL on the workspace. Owner/admin-gated; the image
 * is type- and size-capped. A missing bucket degrades to an honest message
 * (PROVISIONING.md) rather than a crash, mirroring the F7 import upload.
 */
export async function uploadWorkspaceLogoAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image file.' };
  if (file.size > MAX_LOGO_BYTES) return { error: 'The logo must be under 2 MB.' };
  if (!LOGO_TYPES.includes(file.type)) return { error: 'Use a PNG, JPEG, SVG, WebP, or GIF.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const key = `${auth.workspace.id}/logo-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploaded = await auth.supabase.storage
    .from(LOGO_BUCKET)
    .upload(key, bytes, { contentType: file.type, upsert: true });
  if (uploaded.error) {
    return {
      error:
        'Could not upload the logo — the “workspace-logos” storage bucket may not exist yet (PROVISIONING.md).',
    };
  }
  const publicUrl = auth.supabase.storage.from(LOGO_BUCKET).getPublicUrl(key).data.publicUrl;

  try {
    await updateWorkspaceLogo(auth.supabase, {
      workspaceId: auth.workspace.id,
      logoUrl: publicUrl,
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not save the logo.' };
  }
  revalidatePath('/settings');
  return { done: true };
}

export async function removeWorkspaceLogoAction(
  _prev: SettingsFormState,
  _formData: FormData,
): Promise<SettingsFormState> {
  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };
  try {
    await updateWorkspaceLogo(auth.supabase, {
      workspaceId: auth.workspace.id,
      logoUrl: null,
      updatedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not remove the logo.' };
  }
  revalidatePath('/settings');
  return { done: true };
}

const roleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(['admin', 'member', 'viewer']),
});

export async function changeRoleAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid role change.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await updateMemberRole(auth.supabase, {
      memberId: parsed.data.memberId,
      role: parsed.data.role,
      updatedBy: auth.userId,
    });
  } catch (e) {
    return { error: e instanceof DbRuleError ? e.message : 'Could not change the role.' };
  }
  revalidatePath('/settings');
  return { done: true };
}

export async function removeMemberAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = z
    .object({ memberId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid member reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await removeMember(auth.supabase, parsed.data.memberId);
  } catch (e) {
    return { error: e instanceof DbRuleError ? e.message : 'Could not remove the member.' };
  }
  revalidatePath('/settings');
  return { done: true };
}

/** Owner-only at the DB layer (0014 RPC re-checks); confirmation lives in the UI. */
export async function transferOwnershipAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = z
    .object({ newOwnerUserId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid transfer target.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await transferOwnership(auth.supabase, {
      workspaceId: auth.workspace.id,
      newOwnerUserId: parsed.data.newOwnerUserId as UserId,
    });
  } catch (e) {
    return { error: e instanceof DbRuleError ? e.message : 'Could not transfer ownership.' };
  }
  revalidatePath('/settings');
  return { done: true };
}

const inviteSchema = z.object({
  email: emailField(),
  role: z.enum(['admin', 'member']),
});

/**
 * F4.3: the invitation row + accept link work today; email delivery rides on
 * Resend and activates the moment RESEND_API_KEY exists (ADR-011 — no SDK,
 * one fetch). Until then the admin copies the link from the success state.
 */
export async function inviteMemberAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  // F8.2 — cap invitations per inviter so the email path can't be a spam relay.
  const throttle = await rateLimit('invitation', auth.userId);
  if (!throttle.success) {
    return { error: `Too many invitations just now — wait ${throttle.retryAfterSeconds}s and try again.` };
  }

  // Inviting an existing member is a no-op worth a friendly message.
  if (await isMemberEmail(auth.supabase, auth.workspace.id as WorkspaceId, parsed.data.email)) {
    return { error: 'That person is already a member.' };
  }

  let invitationId: string;
  try {
    invitationId = await createInvitation(auth.supabase, {
      workspaceId: auth.workspace.id,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedBy: auth.userId,
    });
  } catch {
    return { error: 'Could not create the invitation.' };
  }

  const inviteUrl = `${await appOrigin()}/invite/${invitationId}`;

  // Best-effort — the invitation row exists either way and the copyable link
  // still works (sendEmail degrades to false while Resend is unprovisioned).
  const line = `${auth.workspace.name} invited you to join as ${parsed.data.role}.`;
  await sendEmail({
    to: parsed.data.email,
    subject: `You're invited to ${auth.workspace.name} on Arther`,
    text: `${line} Accept within 7 days: ${inviteUrl}`,
    html: `<p>${line}</p><p><a href="${inviteUrl}">Accept your invitation</a> — the link expires in 7 days.</p>`,
  });

  revalidatePath('/settings');
  return { done: true, inviteUrl };
}

export async function revokeInvitationAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = z
    .object({ invitationId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid invitation reference.' };

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };

  try {
    await revokeInvitation(auth.supabase, parsed.data.invitationId);
  } catch {
    return { error: 'Could not revoke the invitation.' };
  }
  revalidatePath('/settings');
  return { done: true };
}

/**
 * F8.7 Danger Zone — request soft deletion. Owner-only (the 0002 RPC re-checks),
 * and the typed slug must match so deletion is never a one-click accident. The
 * 14-day grace + restore lives in the RPC; this just gates and dispatches.
 */
export async function requestWorkspaceDeletionAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = z
    .object({ confirmSlug: z.string().trim().min(1) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Type the workspace address to confirm.' };

  const auth = await authorizeAction(
    'workspace.delete',
    'Only the workspace owner can delete the workspace.',
  );
  if ('error' in auth) return { error: auth.error };
  if (parsed.data.confirmSlug.toLowerCase() !== auth.workspace.slug.toLowerCase()) {
    return { error: 'That doesn’t match the workspace address.' };
  }

  try {
    await requestWorkspaceDeletion(auth.supabase, auth.workspace.id);
  } catch (e) {
    return {
      error:
        e instanceof DbRuleError ? e.message : 'Could not schedule the workspace for deletion.',
    };
  }
  revalidatePath('/settings');
  return { done: true };
}

/**
 * F8.7 — restore a workspace inside its grace window. The active workspace is
 * RLS-hidden once soft-deleted, so the id comes from the banner (the 0016
 * definer lookup surfaced it) and the 0002 RPC enforces owner-only.
 */
export async function cancelWorkspaceDeletionAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = z
    .object({ workspaceId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid workspace reference.' };

  const supabase = await getSupabaseServer();
  if (!supabase) return { error: 'Not configured in this environment yet.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  try {
    await cancelWorkspaceDeletion(supabase, parsed.data.workspaceId as WorkspaceId);
  } catch (e) {
    return {
      error:
        e instanceof DbRuleError
          ? e.message
          : 'Could not restore the workspace — the grace period may have expired.',
    };
  }
  revalidatePath('/settings');
  return { done: true };
}
