# Arther — Billing & Pricing Assumptions

**Version:** 1.0
**Date:** May 2026
**Status:** Specification complete — assumptions documented, billing UI deferred to post-launch

---

## 1. Overview

### 1.1 Purpose

This document records the pricing model assumptions that constrain Arther's v1 architecture. It is not a full billing platform specification — the billing admin UI is a post-launch placeholder. Its purpose is to establish the seat model, define what is and is not metered, and document the decisions that affect what the system needs to track and enforce from day one.

### 1.2 Model Summary

Arther uses a **seat-based pricing model** in the style of Figma: paid seats for users who create and edit content, free seats for users who only view, comment, and participate in the review workflow. AI generation, document storage, and portal bandwidth are included in the seat price with no per-usage metering at v1.

---

## 2. Seat Model

### 2.1 Two Seat Tiers

| Tier | Cost | Who |
|---|---|---|
| **Editor** | Paid | Owners, Admins, and Members who create or edit documents or manage spec data |
| **Viewer** | Free | Workspace members who only view documents, leave comments, and participate as approvers in the review workflow |

### 2.2 What Each Tier Can Do

| Action | Editor | Viewer |
|---|---|---|
| View documents in the editor | ✓ | ✓ |
| Comment on documents | ✓ | ✓ |
| Approve or reject documents in Review | ✓ | ✓ |
| Create and edit documents | ✓ | — |
| Create products and components in Spec Database | ✓ | — |
| Edit spec field values | ✓ | — |
| Access workspace settings (Admins only) | ✓ | — |
| Manage Document Types and Brand Profiles (Admins only) | ✓ | — |

### 2.3 Viewer Seat Rationale

Hardware companies have a class of stakeholder who participates in document review — regulatory consultants, compliance leads, external approvers — but who never creates or edits documentation themselves. Making these users paid seats creates unnecessary friction at the point of adoption: a company evaluating Arther would need to budget for seats for people who only click Approve. The free Viewer tier removes this barrier without giving away the core value (document creation and editing).

### 2.4 Seat Assignment

When an Admin invites a new workspace member, they select the workspace role (Owner, Admin, Member, Viewer). The seat tier follows automatically from the role: Owner, Admin, and Member roles are Editor seats; Viewer role is a free seat.

Changing a member's role from Member to Viewer (or vice versa) changes their seat tier immediately. The billing system (post-launch) will prorate accordingly.

---

## 3. AI Generation

### 3.1 Included in Seat Price — No Metering at v1

AI document generation and block regeneration are included within the Editor seat price. There is no per-generation charge, no token quota, and no rate limit enforced on users at v1.

### 3.2 Rationale

Arther's target customers — hardware companies maintaining a portfolio of product documentation — generate a predictable and relatively low volume of documents. The typical workflow is a burst of generation at initial setup (creating the document portfolio) followed by ongoing block-level regenerations triggered by spec field changes. This is structurally different from content generation platforms where users produce high volumes of new content daily.

Metering AI generation would add implementation complexity (token counters, quota enforcement, overage handling, billing integration) before there is evidence that any customer's usage would justify the constraint. If a workspace produces anomalously high generation volume, that is a support and policy issue to address case-by-case, not an architecture to build speculatively.

### 3.3 Post-Launch Revisit Trigger

If production usage reveals workspaces consuming AI generation at a volume that materially affects unit economics, metered generation can be added as a post-launch capability. The event model established in the Analytics spec (`document_generated` with `duration_ms`) provides the instrumentation needed to monitor generation volume without a dedicated billing meter.

---

## 4. Storage and Portal Bandwidth

### 4.1 Included at v1 — No Quotas

Document storage (block content, published snapshots, uploaded assets) and portal bandwidth (document serving to external visitors) are included in the seat price with no per-workspace quotas enforced at v1.

### 4.2 Rationale

Hardware product documentation is not storage-intensive. A portfolio of a few dozen datasheets, installation manuals, and quick-start guides — even with images and PDFs — is unlikely to reach a scale where storage costs are material per customer at v1. Portal bandwidth for B2B hardware documentation is similarly predictable: a datasheet does not go viral.

Storage and bandwidth quotas can be introduced post-launch if per-customer costs diverge significantly from assumptions.

---

## 5. Architecture Implications

The following system behaviours are required from v1 to support the billing model:

| Requirement | Details |
|---|---|
| Seat tier enforcement | The system must distinguish Editor seats from Viewer seats and enforce the permission boundary: Viewers cannot create documents, edit content, or manage specs. |
| Seat count tracking | The workspace must track the current count of Editor seats and Viewer seats. This data is required for the billing admin UI when it ships post-launch. |
| Role-to-seat mapping | The seat tier is derived from workspace role. Any role change that crosses the Editor/Viewer boundary must be recorded with a timestamp for billing proration post-launch. |
| No generation metering | No token counters, quota tables, or rate limiters need to be built for v1. The `document_generated` analytics event provides sufficient observability. |
| No storage or bandwidth metering | No quota enforcement infrastructure needed for v1. |

---

## 6. Open Questions (Post-Launch)

The following pricing questions are explicitly deferred to post-launch and should not be specced or built now:

| Question | Notes |
|---|---|
| Free workspace tier | Whether small teams can access Arther with a limited number of Editor seats for free (trial or freemium). To be decided based on go-to-market strategy post-dogfood. |
| Pricing tiers | Whether there is a single paid tier or multiple (e.g. Starter / Pro / Enterprise with different feature access). |
| Enterprise pricing | Custom pricing for large organisations, potentially including SSO, SCIM, and advanced RBAC (all currently deferred features). |
| Annual vs. monthly billing | Discount model for annual commitments. |
| Overage model for AI generation | If metering is introduced post-launch, what happens when a workspace exceeds its quota — hard block, soft cap with notification, or automatic overage charges. |

---

## 7. Design Decisions

| Decision | Rationale |
|---|---|
| Seat-based over usage-based | Seat-based pricing is predictable for both Arther and its customers. Hardware companies can budget for their team size without uncertainty about monthly generation costs. Usage-based pricing is more appropriate for platforms with highly variable consumption patterns, which Arther's use case does not exhibit. |
| Free Viewer tier | Removes the adoption barrier created by charging for participants who only review and approve. Reviewers are not the buyers — making them cost money would create internal friction for the decision-maker evaluating Arther. |
| AI generation included — no metering at v1 | The anticipated generation volume does not justify the implementation complexity of a metering system. The analytics event model provides sufficient observability to detect if assumptions are wrong. |
| Billing UI deferred to post-launch | Arther is being dogfooded internally first. Billing infrastructure has no value before external customers are onboarded. Building it post-dogfood means it can be designed around actual pricing decisions rather than speculative ones. |

---

*Arther — Billing & Pricing Assumptions. Version 1.0, May 2026. Seat-based model: paid Editor seats (create, edit, manage), free Viewer seats (view, comment, approve). AI generation, storage, and portal bandwidth included in seat price with no metering at v1. Billing admin UI is a post-launch placeholder. Free tier, pricing tiers, and enterprise pricing are explicitly deferred open questions.*
