# Arther — Error Handling & Entity Lifecycle Matrix

**Version:** 1.0
**Date:** May 2026
**Status:** Specification complete — greenfield design

---

## 1. Overview

### 1.1 Purpose

Individual feature specs address failure states within their own scope. This document provides the cross-cutting view: what happens when entities are changed, archived, or removed while other parts of the system depend on them. It is the authoritative reference for cascading effects across features and the primary guard against edge case surprises during implementation.

### 1.2 Core Principles

**Archive-only for entities with dependents.** Any entity that other entities reference cannot be hard-deleted while those dependencies exist. The system offers archiving instead. Hard delete is available only when all dependencies are resolved. This prevents orphaned references from producing silent failures.

**Allow the action, surface the consequence.** Where possible, a lifecycle action (archiving a component, removing a workspace member) is allowed to proceed while the system handles the cascade explicitly — notifying owners, flagging documents, or reverting states. Blocking actions creates unexpected friction. Surfacing consequences keeps the user in control.

**Documents in Review are protected.** Any change that would compromise the integrity of a document under active review automatically returns that document to Draft. A document cannot remain in Review with broken or orphaned content. The owner must re-submit after addressing the issue.

**Attribution is permanent.** Archived entities and removed members retain their attribution in the audit trail, comment history, and approval records. Nothing is anonymised or erased retroactively.

---

## 2. Entity Lifecycle Rules

### 2.1 Archive-Only Entities

The following entities may only be archived — not hard-deleted — if they have active dependents. The system blocks hard delete and offers archive instead, surfacing a list of the blocking dependencies.

| Entity | Blocked by |
|---|---|
| Product | Any document that references this product's spec fields |
| Component | Any document that contains spec tokens from this component's fields |
| Spec Field | Any document block that contains a spec token for this field |
| Document Type | Any document generated from this type |
| Brand Profile | Any Document Type that references it as default |
| Snippet | Any document that embeds this snippet via transclusion |

### 2.2 Hard-Deletable Entities

The following entities can be hard-deleted because their removal has no cascading structural effect on other entities.

| Entity | Condition |
|---|---|
| Draft document | Must be in Draft state; no documents in any other state can be deleted |
| Comment thread | By the thread creator, document owner, or an assigned approver |
| Pending workspace invitation | Before the invitation is accepted |
| Workspace member | Only after all document ownership has been transferred (see §6) |

### 2.3 Archiving vs. Deletion Behaviour

An archived entity:
- Is removed from all active lists and pickers (it does not appear as a selection option for new content)
- Retains all historical references — existing documents that were generated from or reference the entity continue to record that association
- Can be unarchived by an Admin, restoring its availability for new content
- Does not affect the current content of documents that already reference it, except where the entity's absence creates an invalid state (see the matrix below)

---

## 3. Entity Lifecycle Matrix

### 3.1 Product

| Event | Cascade |
|---|---|
| **Created** | No cascade. |
| **Spec field value updated** | Smart Spec Tracking flags all blocks in dependent documents that reference this field as stale. Two-speed update applies: structured blocks auto-update; prose blocks are flagged for review. |
| **Spec field type changed** (e.g. scalar → enum) | Smart Spec Tracking flags all blocks referencing this field as stale. Existing values that do not conform to the new type are flagged for manual review. Values are not auto-converted. |
| **Archived** | New documents cannot be generated for this product. Existing documents remain intact and editable. Spec tokens in documents become read-only — they display the last known value. Variants of this product are also archived (see §3.5). |
| **Delete attempted with dependents** | Blocked. System surfaces a list of documents that reference this product. Offers archive instead. |

### 3.2 Component

| Event | Cascade |
|---|---|
| **Created** | No cascade. |
| **Spec field value updated** | Same as Product spec field value updated — Smart Spec Tracking flags stale blocks across all documents that reference this component's fields, across all products that include this component. |
| **Spec field type changed** | Same as Product spec field type change. |
| **Archived** | ProductComponent join records for this component become inactive. Spec tokens in documents that reference this component's fields become orphaned. For each dependent document: **If in Draft:** orphaned tokens are flagged; document owner is notified. **If in Review:** document is automatically returned to Draft; owner is notified with the reason ("A component referenced in this document has been archived"). Owner must resolve orphaned tokens and re-submit. **If Approved:** document is returned to Draft; owner is notified. **If Published:** the published snapshot is unaffected. The working copy (if one exists) is returned to Draft if in Review or Approved. A flag is set on the published document to surface when the next revision is created. |
| **Delete attempted with dependents** | Blocked. Offers archive instead. |

### 3.3 Document Type

| Event | Cascade |
|---|---|
| **Created** | No cascade. |
| **Approval role added** | New role appears in the approval role configuration. Any documents currently in Review are unaffected — the new role applies to future review submissions only. |
| **Approval role removed** | If no documents are currently in Review using this role: role is removed immediately. If documents are currently in Review using this role: removal is blocked until those documents complete their review cycle or are pulled back to Draft. |
| **Approval role assignment changed** (person reassigned) | If the previous assignee had already approved a document currently in Review: their approval stands. Future approvals for that role require the new assignee. If the role becomes vacant (assignee removed with no replacement): see §6.3. |
| **Archived** | No new documents can be generated from this Document Type. Existing documents are unaffected — they continue through their lifecycle normally. Document Type configuration becomes read-only. |
| **Delete attempted with dependents** | Blocked. Offers archive instead. |

### 3.4 Brand Profile

| Event | Cascade |
|---|---|
| **Created** | If this is the first Brand Profile in the workspace, it is automatically set as the workspace default. |
| **Updated** | Changes apply at render time — all documents that reference this Brand Profile reflect the updated brand on next portal render. No document state changes required. |
| **Set as workspace default** | Previous workspace default is demoted. Document Types that did not have an explicit Brand Profile assignment now implicitly reference the new default. |
| **Archive attempted** | If any Document Type references this Brand Profile as its default: archive is blocked. Admin must reassign those Document Types to a different Brand Profile first. If no Document Types reference it: archive proceeds. |
| **Delete attempted with dependents** | Blocked. Offers archive instead. |

### 3.5 Product Variants

| Event | Cascade |
|---|---|
| **Created** | No cascade. |
| **Variant spec override updated** | Smart Spec Tracking flags stale blocks in variant-scoped documents. Two-speed update applies. |
| **Archived** | Variant-specific documents are flagged. Portal variant picker removes this variant from the published document. If a variant-scoped document is in Review: returned to Draft; owner notified. |
| **Base product archived** | All variants of that product are also archived. Cascade follows §3.1 for the base product plus §3.5 for each variant. |
| **Delete attempted with dependents** | Blocked. Offers archive instead. |

### 3.6 Document

| Event | Cascade |
|---|---|
| **Generated** | No cascade. Document enters Draft state. |
| **Spec-linked block auto-updated** | Audit entry recorded. If document is in Review: update is allowed for structured blocks only (SpecTable, inline spec tokens). Prose blocks are not auto-updated regardless of state. |
| **Pulled back to Draft** (by owner or via cascade) | All collected approvals for the current review cycle are reset. Any assigned approvers are notified. |
| **Published** | Portal performs atomic snapshot swap. Previous published snapshot remains in portal history. |
| **Archive attempted (published document)** | Document is removed from the portal. Published snapshot is retained in workspace history. All working copies in progress continue in their current state. |
| **Delete attempted (non-draft)** | Blocked. Documents not in Draft state cannot be deleted. Owner must pull back to Draft first. |
| **Hard deleted (draft)** | All comment threads on this revision are deleted. No cascade to other entities. |

### 3.7 Snippet (Content Reuse)

| Event | Cascade |
|---|---|
| **Created** | No cascade. |
| **Content updated** | All documents that embed this snippet via live transclusion reflect the updated content immediately. If any such document is in Review: the update is allowed (snippets are content, not spec data; no state change triggered). The update is recorded in the document's edit history. |
| **Archived** | All embedded instances in documents become static copies — they retain the content as it was at archival time but lose the live transclusion link. Documents with embedded instances are flagged; owners are notified. **If in Review:** document is not automatically returned to Draft (snippet archival is less structurally critical than component archival). The orphaned embed is flagged as a warning in the pre-flight check on next submission. |
| **Delete attempted with dependents** | Blocked. Offers archive instead. |

### 3.8 Product Brief (AI Generation)

| Event | Cascade |
|---|---|
| **Created** | No cascade. |
| **Updated** | Documents previously generated from this brief are unaffected. The updated brief applies to future generation runs only. Smart Spec Tracking is unaffected (briefs are not spec fields). |
| **Deleted** | Documents generated from this brief continue to exist normally. The document's generation history records which brief was used (for audit), but no live dependency exists after generation. Future regeneration of those documents using this brief is no longer possible if the brief is deleted. |

---

## 4. Workspace Member Lifecycle

### 4.1 Removal Precondition

A workspace member cannot be removed if they own any documents in any state. The removal flow surfaces a list of all documents owned by the member being removed. The Admin must transfer ownership of each document to another workspace member before removal is permitted. There is no bulk transfer — each document must be individually reassigned. This is intentional: each transfer is an explicit ownership decision, not a wholesale handoff.

### 4.2 After Removal

Once all documents have been transferred and the member is removed:
- Their past comments remain attributed to their name (marked as a former member in the UI)
- Their approval records are permanent and unaffected
- Any approval role assignments they held on Document Types become vacant immediately — the Document Type configuration screen flags these as requiring reassignment
- Pending invitations associated with their email (if they were re-invited) are revoked

### 4.3 Vacant Approval Roles

When an approval role on a Document Type has no assigned member (due to member removal, or manual unassignment):
- The vacancy is flagged on the Document Type configuration screen with a warning indicator
- Documents in Review that require this role: the existing review cycle is not interrupted — if the vacant role had already been approved by the departing member in this cycle, that approval stands. If the role has not yet been approved: the document cannot reach Approved state until the role is filled or the owner uses the override mechanism (see Collaboration & Review spec §3.3)
- New documents cannot be sent for Review while any required role is vacant

### 4.4 Role Changes

When a workspace member's role is changed (e.g. Admin → Member):
- Takes effect immediately
- Does not affect document ownership
- Does not affect document-level Approver assignments — those are managed separately on Document Types
- The member loses access to workspace settings if demoted from Admin

---

## 5. AI Generation Failures

### 5.1 Generation Failure Handling

When the AI Document Generator fails to complete a generation run:

| Failure type | Handling |
|---|---|
| LLM provider error (timeout, rate limit, service outage) | Generation attempt is recorded as failed. User is shown an error message with a retry button. No partial content is saved. |
| Empty spec fields (all required fields null) | Generation proceeds with placeholders for all empty fields. Not treated as a failure — see AI Document Generator spec. |
| Document Type schema invalid | Generation is blocked before the LLM call. User is shown which schema fields are invalid. Admin must fix the Document Type configuration before generation can proceed. |
| Content policy violation in generated output | Generation is recorded as failed. User is shown a generic error message. The specific violation is logged internally for review but not surfaced to the user. Retry is available. |

### 5.2 Partial Generation

Partial generation — where some blocks are produced and others fail — is not supported. Generation is atomic: either all blocks are produced and the document is created, or nothing is saved and the user retries. This avoids partially populated documents entering the workspace in an ambiguous state.

---

## 6. Pre-Flight Checks at Review Submission

The Publishing Portal's pre-flight check (specified in Feature 5) is the last line of defence before a document enters Review. It surfaces the following error states as non-blocking warnings:

| Warning | Condition |
|---|---|
| Placeholder blocks present | One or more blocks contain placeholder content from a null spec field at generation time |
| Orphaned spec tokens | A spec token references a field whose component or product has been archived |
| Stale blocks | One or more spec-linked blocks have not been updated since a spec field value changed |
| Unresolved comment threads | Comment threads from the previous revision were carried forward and remain unresolved |
| Document Quality Standard violations | One or more sections exceed length, reading level, or structural rules defined in the Document Type (advisory only — see synthesis decision §2.5) |
| Vacant approval role | A required approval role on the Document Type has no assigned member |

Vacant approval role is the only item that **blocks** submission rather than warns. All others are warnings the document owner can acknowledge and proceed past.

---

## 7. Design Decisions

| Decision | Rationale |
|---|---|
| Archive-only for entities with dependents | Hard-deleting an entity with dependents produces orphaned references that surface as silent failures at render or generation time. Archiving preserves the reference integrity while removing the entity from active use. The dependency list surfaced at archive time is the information the admin needs to make the decision consciously. |
| Documents in Review are returned to Draft on component archive | A document under active review should not contain content whose spec source has disappeared. Returning it to Draft ensures the owner reviews and resolves the orphaned content before re-submitting. Leaving it in Review would mean approvers are signing off on a document with a broken foundation. |
| Snippets in Review are flagged but not returned to Draft | Snippet archival is a content change, not a structural one. The embedded content becomes static rather than live — it doesn't disappear. The document remains coherent; the loss of the live connection is a maintenance concern, not an integrity one. The pre-flight check on next submission surfaces it. |
| Member removal blocked until ownership transferred | Automatically transferring document ownership to an Admin on member removal removes a decision that should be made explicitly. Who should own a given document is a team decision, not a system default. The transfer list makes the decision unavoidable without making it unmanageable. |
| Approval records are permanent | Approval records are audit evidence. Deleting or anonymising them when a member leaves would compromise the compliance audit trail that regulated-industry customers depend on. Attribution to a former member is honest and traceable. |
| Generation is atomic — no partial saves | A partially populated document in Draft is ambiguous: is it a work in progress or a failed generation? Atomic generation means the document either exists in a complete (if placeholder-filled) state or doesn't exist at all. The user's mental model stays clean. |
| Vacant approval role is the only blocking pre-flight item | A document with placeholder content or stale blocks can still be reviewed — those are content issues the approvers will catch. A document with a vacant required approval role structurally cannot complete the approval cycle. Blocking at submission rather than at approval time surfaces this earlier, when it is cheaper to fix. |

---

*Arther — Error Handling & Entity Lifecycle Matrix. Version 1.0, May 2026. Cross-cutting reference for cascading effects of entity lifecycle events across all features. Core principles: archive-only for entities with dependents; documents in Review are returned to Draft on component archive; member removal blocked until document ownership is transferred; attribution is permanent. Covers Products, Components, Document Types, Brand Profiles, Variants, Documents, Snippets, Product Briefs, and Workspace Members.*
