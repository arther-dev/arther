import { z } from 'zod';
import { requiredText } from './text';

/**
 * Approval roles (G0.3) — the named reviewers a Document Type requires before a
 * document of that type can be published. Roles are configured now (Phase 2) and
 * consumed by the Phase 3 review machine: approvals are AND-logic across the
 * `required` roles of the document's type (data model §approvals). Each role is a
 * label ("Engineering", "Compliance") plus a required/optional flag and a set of
 * workspace members assigned to fill it.
 *
 * One schema source (ADR-012) shared by the admin editor (validating writes) and
 * the Phase 3 review wiring.
 */

/** A role label, e.g. "Engineering sign-off". Bounded free text (F8.5). */
export const approvalRoleLabelSchema = requiredText('Name the approval role.');

/** The role form contract, validated at the write boundary. */
export const approvalRoleFormSchema = z.object({
  role_label: approvalRoleLabelSchema,
  required: z.boolean(),
});

export type ApprovalRoleForm = z.infer<typeof approvalRoleFormSchema>;
