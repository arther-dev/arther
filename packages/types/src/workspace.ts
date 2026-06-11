import { z } from 'zod';
import { invitationIdSchema, membershipIdSchema, userIdSchema, workspaceIdSchema } from './ids';

/** Workspace roles (migration 0002: workspace_members.role). */
export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/** Seat tiers (billing spec): Editor seats are paid, Viewer seats are free. */
export const seatTierSchema = z.enum(['editor', 'viewer']);
export type SeatTier = z.infer<typeof seatTierSchema>;

/** Only admin/member are invitable (0002: owner is not invitable). */
export const invitableRoleSchema = z.enum(['admin', 'member']);
export type InvitableRole = z.infer<typeof invitableRoleSchema>;

/** Immutable after creation — it is the portal subdomain (0002 slug guard). */
export const workspaceSlugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'lowercase alphanumeric with inner hyphens');

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
