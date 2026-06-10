# Enterprise Readiness — Architectural Guardrails

**Status:** Decision record — not a build spec  
**Scope:** Decisions to make now so enterprise features can be added later without a rewrite  
**Out of scope:** SSO, audit logging, granular RBAC, multi-workspace — none of these will be built at launch

---

## Context

Arther's launch ICP is small hardware companies and startups. Enterprise features (SSO, audit logs, granular access control) are explicitly deferred until customer demand justifies them. This document records the architectural constraints that must be respected during early development to avoid painting into a corner.

---

## Decision 1 — Centralise all permission checks behind a single abstraction

Every action in the product that involves a resource must be gated through a single authorisation function with a consistent signature:

```
canDo(user, action, resource) → boolean
```

At launch, this function can be as simple as checking workspace membership and a flat role (e.g. `owner`, `editor`, `viewer`). The implementation doesn't matter yet — what matters is that no feature bypasses this abstraction by checking user roles inline.

**Why:** When RBAC or attribute-based access control is added later, there is one place to change — not a grep exercise across the codebase.

**Constraint:** No feature spec should assume inline permission logic is acceptable. If a feature needs a new permission check, it goes through `canDo`.

---

## Decision 2 — Every write operation must be attributable to a user and timestamped

All create, update, and delete operations on any significant entity (spec fields, field values, documents, blocks, snippets, published snapshots) must record:

- `created_by` — user ID
- `created_at` — timestamp
- `updated_by` — user ID
- `updated_at` — timestamp

At launch this data doesn't need to be surfaced in a UI. It just needs to exist in the database schema from day one.

**Why:** Retrofitting `created_by` and `updated_by` into an existing schema is painful and lossy — you lose history for everything created before the migration. An audit log feature at enterprise tier is only credible if it has complete history.

**Constraint:** Any entity added to the data model should include these four fields as non-negotiable columns.

---

## Decision 3 — Authentication must be decoupled from identity

The auth layer should treat the identity provider as a pluggable dependency, not a hardcoded integration. At launch, email/password and OAuth (Google) are sufficient. But the session and user model should not embed provider-specific assumptions.

Concretely: the `users` table should store a normalised identity (name, email, workspace role) that is independent of how the user authenticated. Provider-specific data (OAuth tokens, provider user IDs) lives in a separate `auth_providers` table linked to the user.

**Why:** Adding SSO (SAML, OIDC) later requires mapping an external identity to an internal user. If the user model assumes email/password as the identity primitive, that mapping becomes messy. A clean separation means SSO is an additive auth provider, not a schema migration.

**Constraint:** No feature should store or pass around provider-specific auth tokens as a proxy for user identity.

---

## What this does not include

These decisions do not mean building:

- An audit log UI
- Role management screens
- SSO configuration
- Multi-workspace or organisation-level models
- Granular per-resource permissions
- Compliance reporting

Those are enterprise features. They will be designed and built if and when a real enterprise deal requires them.
