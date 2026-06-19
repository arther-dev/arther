import { z } from 'zod';
import { invitationIdSchema, membershipIdSchema, userIdSchema, workspaceIdSchema } from './ids';

/** Workspace roles (migration 0002: workspace_members.role). */
export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/** Seat tiers (billing spec): Editor seats are paid, Viewer seats are free. */
export const seatTierSchema = z.enum(['editor', 'viewer']);
export type SeatTier = z.infer<typeof seatTierSchema>;

/**
 * H.4 — the role→seat mapping the (post-launch) billing UI reads. Owner, Admin,
 * and Member are paid Editor seats; Viewer is a free seat (billing spec §2.4).
 * The seat tier follows the workspace role automatically, so a role change that
 * crosses this boundary is a billable seat change.
 */
export function seatTierForRole(role: WorkspaceRole): SeatTier {
  return role === 'viewer' ? 'viewer' : 'editor';
}

export const SEAT_TIER_LABELS: Record<SeatTier, string> = {
  editor: 'Editor',
  viewer: 'Viewer',
};

/** Current seat counts for a workspace — what the billing admin UI tracks (§6). */
export interface WorkspaceSeatSummary {
  editorSeats: number;
  viewerSeats: number;
  total: number;
}

/** Count editor vs viewer seats from a list of member roles. Pure. */
export function summarizeSeats(roles: WorkspaceRole[]): WorkspaceSeatSummary {
  let editorSeats = 0;
  let viewerSeats = 0;
  for (const role of roles) {
    if (seatTierForRole(role) === 'editor') editorSeats += 1;
    else viewerSeats += 1;
  }
  return { editorSeats, viewerSeats, total: roles.length };
}

/** Only admin/member are invitable (0002: owner is not invitable). */
export const invitableRoleSchema = z.enum(['admin', 'member']);
export type InvitableRole = z.infer<typeof invitableRoleSchema>;

/** Immutable after creation — it is the portal subdomain (0002 slug guard). */
export const workspaceSlugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'lowercase alphanumeric with inner hyphens');

/** Derive a portal-safe slug from a workspace name (live preview on /welcome). */
export function slugifyWorkspaceName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

export const workspaceSchema = z.object({
  id: workspaceIdSchema,
  name: z.string().min(1),
  slug: workspaceSlugSchema,
  logo_url: z.string().url().nullable(),
  owner_id: userIdSchema,
  deleted_at: z.coerce.date().nullable(),
  purge_after: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const workspaceMemberSchema = z.object({
  id: membershipIdSchema,
  workspace_id: workspaceIdSchema,
  user_id: userIdSchema,
  role: workspaceRoleSchema,
  joined_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;

export const workspaceInvitationSchema = z.object({
  id: invitationIdSchema,
  workspace_id: workspaceIdSchema,
  email: z.string().email(),
  role: invitableRoleSchema,
  invited_by: userIdSchema,
  invited_at: z.coerce.date(),
  expires_at: z.coerce.date(),
  accepted_at: z.coerce.date().nullable(),
  revoked_at: z.coerce.date().nullable(),
});
export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>;
