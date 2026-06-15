'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createCanDo } from '@arther/authz';
import { rateLimit } from '@arther/rate-limit';
import {
  cancelWorkspaceDeletion,
  createInvitation,
  getActiveWorkspace,
  listMembers,
  membershipLookupFor,
  removeMember,
  requestWorkspaceDeletion,
  revokeInvitation,
  transferOwnership,
  updateMemberRole,
  updateWorkspaceName,
} from '@arther/db';
import { emailField, requiredText, type UserId, type WorkspaceId } from '@arther/types';
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
  if (!allowed) return { error: 'Only workspace admins can change this.' as const };
  return { supabase, userId: user.id as UserId, workspace };
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
    return {
      error:
        e instanceof Error && e.message.includes('transfer ownership')
          ? 'Transfer ownership before changing the owner’s role.'
          : 'Could not change the role.',
    };
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
    return {
      error:
        e instanceof Error && e.message.includes('owner cannot be removed')
          ? 'The owner can’t be removed — transfer ownership first.'
          : 'Could not remove the member.',
    };
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
    return {
      error:
        e instanceof Error && e.message.includes('only the workspace owner')
          ? 'Only the current owner can transfer ownership.'
          : 'Could not transfer ownership.',
    };
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
  const members = await listMembers(auth.supabase, auth.workspace.id as WorkspaceId);
  if (members.some((m) => m.email.toLowerCase() === parsed.data.email.toLowerCase())) {
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

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    // RESEND_FROM must be on a domain verified in Resend to reach arbitrary
    // recipients; the onboarding default only delivers to the account owner.
    const from = process.env.RESEND_FROM ?? 'Arther <onboarding@resend.dev>';
    const subject = `You're invited to ${auth.workspace.name} on Arther`;
    const line = `${auth.workspace.name} invited you to join as ${parsed.data.role}.`;
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [parsed.data.email],
          subject,
          text: `${line} Accept within 7 days: ${inviteUrl}`,
          html: `<p>${line}</p><p><a href="${inviteUrl}">Accept your invitation</a> — the link expires in 7 days.</p>`,
        }),
      });
    } catch {
      // The invitation row exists either way — the copyable link still works.
    }
  }

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

  const auth = await authorizeManage();
  if ('error' in auth) return { error: auth.error };
  if (auth.workspace.role !== 'owner') {
    return { error: 'Only the workspace owner can delete the workspace.' };
  }
  if (parsed.data.confirmSlug.toLowerCase() !== auth.workspace.slug.toLowerCase()) {
    return { error: 'That doesn’t match the workspace address.' };
  }

  try {
    await requestWorkspaceDeletion(auth.supabase, auth.workspace.id);
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('only the workspace owner')
          ? 'Only the workspace owner can delete the workspace.'
          : 'Could not schedule the workspace for deletion.',
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
        e instanceof Error && e.message.includes('only the workspace owner')
          ? 'Only the workspace owner can restore the workspace.'
          : 'Could not restore the workspace — the grace period may have expired.',
    };
  }
  revalidatePath('/settings');
  return { done: true };
}
