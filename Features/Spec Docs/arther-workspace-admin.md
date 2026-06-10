# Arther — Workspace Settings & Admin: Feature Specification

**Version:** 1.1
**Date:** May 2026 (rev. 4 Jun 2026)
**Status:** Specification complete — greenfield design
**Changes in v1.1 (4 Jun 2026):** §3 Navigation Structure expanded from 6 sections to **9 launch sections + 2 placeholders** — adds **Document Quality Standards** (AI Document Generator), **Domain Ownership** (Smart Spec Tracking), **Spec Categories** and **Units** (Spec Database), and per-user **Notifications** (Collaboration & Review). §7.2 Brand Profiles now also owns **portal branding** (apply, custom CSS, staged apply, preview), moved from Publishing Portal §8. Aligns with the decisions in `Design/IA/arther-app-ia.md` §11.

---

## 1. Overview

### 1.1 Purpose

The Workspace Settings & Admin surface is the configuration layer that governs how an Arther workspace is structured and managed. It is the place where workspace-wide configuration lives: team membership and roles, Document Type definitions and approval role assignments, Brand Profiles, and workspace identity settings.

It is not a product surface that most workspace members will visit regularly. It is the backstage — the place where team leads and administrators configure the conditions under which everyone else works.

### 1.2 Scope

This document specifies the workspace-level settings and administration surface: the workspace role model, the Members management screen, the Document Type configuration screen, the Brand Profile management screen, and the placeholder surfaces for Integrations and Billing (both deferred to post-launch).

Feature-level configuration — such as per-document approval role assignment, per-user notification preferences, and per-product sync configuration — is owned by the relevant feature specs and is not re-specified here. This document defines where each feature's configuration is accessed within the navigation structure, not how it behaves.

### 1.3 Role in Arther

The Workspace Settings surface is a prerequisite for the rest of the product. A workspace must have at least one Document Type and one Brand Profile configured before any member can generate a document. Workspace Settings is therefore the first place a new workspace admin visits, and the primary surface for workspace-level onboarding.

---

## 2. Workspace Role Model

### 2.1 Three Workspace Roles

Every workspace member is assigned exactly one of three workspace roles:

| Role | Seat tier | Description |
|---|---|---|
| **Owner** | Editor (paid) | The workspace creator and primary administrator. Has all Admin permissions plus exclusive control over workspace deletion and ownership transfer. There is exactly one Owner per workspace at any time. |
| **Admin** | Editor (paid) | Team leads and designated administrators. Can manage workspace settings, team membership, Document Types, and Brand Profiles. Multiple Admins are expected — a typical workspace has Admins representing different functional teams (compliance, marketing, engineering, design). |
| **Member** | Editor (paid) | Day-to-day users of Arther. Can create products and components in the Spec Database, generate and edit documents, and participate in the review workflow per their document-level role. Cannot access workspace settings. |
| **Viewer** | Free | Read-only participants. Can view documents in the editor, leave comments, and approve or reject documents in the review workflow. Cannot create or edit documents, cannot manage spec data, cannot access workspace settings. Intended for reviewers, approvers, and stakeholders who participate in the review workflow but do not author documentation. |

### 2.2 Permission Boundaries

| Action | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| Access workspace settings | ✓ | ✓ | — | — |
| Manage workspace name and branding | ✓ | ✓ | — | — |
| Invite workspace members | ✓ | ✓ | — | — |
| Assign / change member roles | ✓ | ✓ | — | — |
| Remove workspace members | ✓ | ✓ | — | — |
| Create and edit Document Types | ✓ | ✓ | — | — |
| Assign approvers to Document Type roles | ✓ | ✓ | — | — |
| Create and edit Brand Profiles | ✓ | ✓ | — | — |
| Create products and components | ✓ | ✓ | ✓ | — |
| Generate and edit documents | ✓ | ✓ | ✓ | — |
| Edit spec field values | ✓ | ✓ | ✓ | — |
| View documents in the editor | ✓ | ✓ | ✓ | ✓ |
| Comment on documents | ✓ | ✓ | ✓ | ✓ |
| Approve or reject documents in Review | ✓ | ✓ | ✓ | ✓ |
| Transfer workspace ownership | ✓ | — | — | — |
| Delete the workspace | ✓ | — | — | — |

### 2.3 Workspace Roles vs. Document-Level Roles

Workspace roles and document-level roles are independent. A workspace Member can be an Approver on a specific Document Type (configured by an Admin in the Document Types screen). An Admin is not automatically an Approver on any Document Type — admin access is about configuration, not document review authority.

This separation is intentional. A compliance lead is an Admin because they manage the regulatory Document Types and their approval role assignments — not because they are personally an approver on every document. Approver assignments are explicit, not inherited from workspace role.

---

## 3. Navigation Structure

The admin surface is accessible via a **Settings** entry in the main navigation, visible only to Owners and Admins — **except** the per-user Notifications section, which every member can reach to manage their own preferences. Members do not see the other Settings sections.

Within Settings, the navigation has **nine launch sections plus two post-launch placeholders**:

| Section | Scope | Status | Owned by |
|---|---|---|---|
| Workspace | Owner/Admin | Available at launch | this spec (§4) |
| Members | Owner/Admin | Available at launch | this spec (§5) |
| Document Types | Owner/Admin | Available at launch | this spec (§6) |
| Document Quality Standards | Owner/Admin | Available at launch | AI Document Generator (Feature 2) |
| Brand Profiles | Owner/Admin | Available at launch | this spec (§7) + AI Document Generator; **includes portal branding** |
| Domain Ownership | Owner/Admin | Available at launch | Smart Spec Tracking (Feature 4) |
| Spec Categories | Owner/Admin | Available at launch | Spec Database (Feature 1) |
| Units | Owner/Admin | Available at launch | Spec Database (Feature 1) |
| Notifications | **Per-user (all members)** | Available at launch | Collaboration & Review (Feature 6) |
| Integrations | Owner/Admin | Placeholder — post-launch | External Sync (Feature 9) |
| Billing | Owner/Admin | Placeholder — post-launch | Billing (Feature 13) |

Five sections beyond this spec's original four are surfaced in Settings but **owned by their feature specs** — this document defines only their placement in the navigation, not their behaviour (consistent with §1.2). **Notifications is the one per-user section** (each member manages their own in-app/email preferences); every other section is Owner/Admin-only. Placeholder sections display a "Coming soon" state. They are included from day one so the navigation structure does not need to change when these features ship.

---

## 4. Workspace Settings

The Workspace section contains workspace-level identity configuration.

### 4.1 Fields

| Field | Description | Constraints |
|---|---|---|
| Workspace name | The display name shown throughout the product and in notification emails | Required; 2–60 characters |
| Workspace logo | Used in the portal header and email notifications | PNG or SVG; max 1 MB; recommended 200×200px minimum |
| Workspace URL slug | The identifier used in portal URLs (`arther.io/[slug]/...`) | Required; lowercase alphanumeric and hyphens; unique across Arther; 3–30 characters; immutable after first set |

### 4.2 URL Slug Immutability

The workspace URL slug cannot be changed after it is first set. Changing the slug would break all existing portal URLs that have been shared with customers, distributors, and sales teams. If a workspace needs a new slug (e.g. due to a company rebrand), workspace deletion and recreation is the supported path. This constraint is surfaced explicitly in the UI when the slug field is first edited.

---

## 5. Members

The Members section is the primary surface for managing who has access to the workspace.

### 5.1 Member List

The member list displays all current workspace members with their name, email address, workspace role, and the date they joined. The list is sorted alphabetically by name by default and is searchable by name or email.

### 5.2 Inviting Members

Admins and Owners can invite new members via email address. The invite flow:

1. Admin enters one or more email addresses and selects a workspace role for the invitees (Admin, Member, or Viewer; Owner cannot be assigned via invite).
2. Arther sends an invitation email. The invited person receives a link valid for 7 days.
3. Accepting the invite creates an Arther account (if the person doesn't have one) and adds them to the workspace with the assigned role.
4. Pending invitations are listed separately below the member list, with the option to revoke or resend.

### 5.3 Role Changes

Admins and Owners can change a member's workspace role at any time. Role changes take effect immediately. An Admin cannot change their own role — this prevents accidental self-demotion. Only the Owner can change an Admin's role.

Changing a member's role from Admin to Member does not affect any document-level Approver assignments that Admin held. Those assignments must be manually removed via the relevant Document Type's configuration screen.

### 5.4 Removing Members

Removing a member revokes their access to the workspace immediately. Their past contributions — documents they authored, comments they left, approvals they recorded — are preserved in full and attributed to their name. Documents they own are not reassigned automatically; an Admin must manually transfer ownership if needed.

A member cannot remove themselves from the workspace. The Owner cannot be removed (ownership must be transferred first).

### 5.5 Ownership Transfer

The Owner can transfer ownership to any current Admin via a dedicated transfer flow. The flow requires the current Owner to confirm the transfer by re-entering their password. After transfer, the previous Owner becomes an Admin. Ownership transfer is irreversible without the new Owner's consent.

---

## 6. Document Types

The Document Types section is where Admins define the document templates that the AI Document Generator uses to produce documents. It is the most configuration-intensive section of the admin surface.

### 6.1 Document Type List

The list displays all Document Types defined in the workspace, with their name, the number of approval roles configured, and the number of documents generated from each type. Document Types cannot be deleted if documents have been generated from them — only archived. Archiving prevents new documents from being generated from that type but preserves all existing documents.

### 6.2 Creating and Editing a Document Type

Each Document Type has the following configuration:

| Field | Description |
|---|---|
| Name | Display name (e.g. "Technical Datasheet", "Installation Manual") |
| Description | Optional — describes what this Document Type is for and who uses it |
| Document Type schema | The structural definition of what sections this document type contains and what spec fields feed into each section. Defined in a structured schema editor. |
| Approval roles | The named roles required to approve a document of this type before publication (see 6.3) |
| Default Brand Profile | The Brand Profile applied by default when generating a document of this type. Can be overridden per document. |

### 6.3 Approval Role Configuration

Within each Document Type, Admins define a set of named approval roles and assign workspace members to each role.

**Defining roles:** Admins create role labels (e.g. "Technical Reviewer", "Regulatory Reviewer", "Brand Reviewer") and set each as required or optional. Required roles must all approve before the document can transition to Approved. Optional roles are notified but their approval is not required.

**Assigning members to roles:** Admins assign one or more workspace members to each role. If a role has multiple members assigned, any one of them can approve on behalf of that role — the role is satisfied when any assigned member approves, not all of them. The AND logic operates at the role level, not the individual level.

**Vacant roles:** A role with no assigned member is flagged as vacant. A document cannot be sent for Review while any required role is vacant. The Document Type configuration screen highlights vacant roles with a warning indicator.

This configuration is the canonical source for the approval role data consumed by the Collaboration & Review feature (Feature 6).

---

## 7. Brand Profiles

The Brand Profiles section is where Admins define the visual and tonal identity configurations used when generating and publishing documents.

### 7.1 Brand Profile List

The list displays all Brand Profiles with their name and the number of Document Types that reference them as their default. Brand Profiles cannot be deleted if any Document Type references them as a default — the reference must be reassigned first.

### 7.2 Brand Profile Configuration

The specific fields within a Brand Profile are defined in the AI Document Generator spec (Feature 2). The admin surface provides the management shell: create, rename, edit, duplicate, and archive Brand Profiles. The Brand Profile editor itself is a dedicated screen with a live preview panel.

As of v1.1, this section also owns **portal branding** — applying a Brand Profile to the published portal, the custom-CSS escape hatch, the staged-apply flow, and the portal preview. These were moved here from the Publishing Portal spec §8, which now only describes how the portal *renders* with these settings. Keeping brand definition and portal application in one place gives a single editor of record.

### 7.3 Default Brand Profile

A workspace can designate one Brand Profile as the workspace default. This is applied to any Document Type that has not been assigned a specific Brand Profile. A workspace cannot have zero Brand Profiles — the first Brand Profile created automatically becomes the workspace default.

---

## 8. Integrations (Post-Launch Placeholder)

The Integrations section will house configuration for External Sync adapters — the connections between Arther's Spec Database and external systems such as Arena PLM. At launch, this section displays a "Coming soon" state. No configuration UI is built.

When External Sync ships post-launch, this section will contain: a list of connected sync sources, connection status and health indicators, sync frequency configuration, and the mapping interface between external system fields and Arther spec fields.

---

## 9. Billing (Post-Launch Placeholder)

The Billing section will house subscription management, seat counts, and payment details. At launch, this section displays a "Coming soon" state. No configuration UI is built. Billing model decisions are documented separately in the Billing & Pricing assumptions document.

---

## 10. Data Model

### 10.1 Workspace

```typescript
interface Workspace {
  id: string
  name: string
  slug: string                    // immutable after first set
  logo_url?: string
  created_at: string
  owner_id: string                // references WorkspaceMember
}
```

### 10.2 Workspace Members

```typescript
interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  invited_by: string              // references WorkspaceMember
  joined_at: string
}

interface WorkspaceInvitation {
  id: string
  workspace_id: string
  email: string
  role: 'admin' | 'member'       // owner cannot be assigned via invite
  invited_by: string
  invited_at: string
  expires_at: string              // 7 days from invited_at
  accepted_at?: string
  revoked_at?: string
}
```

### 10.3 Document Types

```typescript
interface DocumentType {
  id: string
  workspace_id: string
  name: string
  description?: string
  schema: DocumentTypeSchema      // defined in Feature 2 spec
  default_brand_profile_id?: string
  archived_at?: string
  created_by: string
  created_at: string
}

interface DocumentTypeApprovalRole {
  id: string
  document_type_id: string
  role_label: string
  required: boolean               // false = notified but not blocking
  display_order: number
}

interface ApprovalRoleAssignment {
  id: string
  role_id: string                 // references DocumentTypeApprovalRole
  workspace_member_id: string
  assigned_at: string
  assigned_by: string
}
```

### 10.4 Brand Profiles

```typescript
interface BrandProfile {
  id: string
  workspace_id: string
  name: string
  is_workspace_default: boolean
  archived_at?: string
  created_by: string
  created_at: string
  // Brand Profile field schema defined in Feature 2 spec
}
```

---

## 11. Design Decisions

| Decision | Rationale |
|---|---|
| Three fixed workspace roles (Owner, Admin, Member) | More granular role models (e.g. per-department admin scoping) add configuration complexity before it's clear the added control is needed. The three-tier model covers the expected range: a person who owns the workspace, people who configure it, and people who use it. Department scoping is a named post-launch addition if multiple Admins create conflicts in practice. |
| Admins can manage all Document Types regardless of department | Scoping an Admin's configuration access to specific Document Types requires a fourth layer of permissions. At the team sizes likely to use Arther at launch, Admin-on-Admin conflicts are rare. If a compliance Admin edits a marketing Document Type by mistake, the audit trail shows who made the change and it can be corrected. |
| Members can create products and components | Blocking product and component creation behind an Admin gate would make daily work dependent on Admin availability. Products and components are user-generated content, not workspace configuration — the right gate is the review and publish workflow, not creation itself. |
| Approval roles are defined on Document Types, not globally | Global approval roles would require resolving which global roles apply to which document types, which is more configuration overhead than defining them per type. Per-Document-Type configuration matches how hardware companies actually organise sign-off authority: the list for a regulatory datasheet is not the list for a quick-start guide. |
| AND logic at role level, not individual level | Requiring every individual assigned to a role to approve would make review impossible when teams have multiple qualified reviewers covering for each other. Role-level AND (any member of the role can approve) combined with role-level AND (all required roles must approve) produces the right balance: full sign-off coverage without bottlenecking on a single individual. |
| URL slug is immutable | Portal URLs shared with customers and distributors break if the slug changes. A rebrand is a known, manageable event. Accidental or casual slug changes are not. The friction of immutability is justified by the cost of broken links at scale. |
| Placeholder nav entries for Integrations and Billing | Shipping the navigation structure before the features are built prevents a disruptive nav reorganisation when they ship. Workspace members discover that these areas exist and know what's coming. "Coming soon" is honest and sets expectations. |
| Brand Profile cannot be deleted if referenced by a Document Type | Orphaned references (a Document Type pointing to a deleted Brand Profile) would cause silent failures at document generation time. Requiring explicit reassignment before deletion makes the dependency visible and actionable. |

---

*Arther — Workspace Settings & Admin: Feature Specification. Version 1.0, May 2026. Greenfield specification covering the workspace role model, member management, Document Type configuration, Brand Profile management, and post-launch placeholder surfaces for Integrations and Billing. Intended as the authoritative reference for workspace-level configuration. Feature-level configuration (per-document approval role assignment, per-user notification preferences) remains owned by the relevant feature specs.*
