/**
 * G6.3 — domain-owner routing (Smart Spec Tracking, spec §3.4). When a spec
 * field changes and flags prose for review, the resulting review item must be
 * assigned to *someone*. The owner is resolved by a four-step fallback over the
 * changed field's category, the affected document's product, and the
 * document/workspace:
 *
 *   1. product-specific override  — `domain_ownership_config` for this category + product
 *   2. workspace category default — `domain_ownership_config` for this category, no product
 *   3. document owner             — `documents.owner_id`
 *   4. workspace admin            — `workspaces.owner_id` (the final backstop)
 *
 * Domain-ownership config is entirely optional: a workspace that has configured
 * none routes every item to the document owner (step 3), so routing works for
 * small teams without modelling org structure first. Singular owner per
 * (category) at workspace scope and per (category, product) at product scope —
 * the schema's partial-unique indexes enforce that, so `find` is unambiguous.
 *
 * Pure — the DB supplies the config rows + the document/workspace owners (the
 * indexed reads over `domain_ownership_config`); this applies the precedence.
 */

/** One configured (category, scope) → owner mapping. `productId: null` = workspace default. */
export interface OwnershipConfigEntry {
  fieldCategory: string;
  productId: string | null;
  ownerUserId: string;
}

/** Which fallback step produced the owner — powers "routes to … (workspace default)" affordances. */
export type DomainOwnerSource =
  | 'product_override'
  | 'workspace_default'
  | 'document_owner'
  | 'workspace_admin';

export interface DomainOwnerInput {
  /** The changed field's category (`spec_fields.category` — never null). */
  category: string;
  /** The affected document's product (`documents.product_id`). */
  productId: string;
  /** `documents.owner_id` — may be null (document with no assigned owner). */
  documentOwnerId: string | null;
  /** `workspaces.owner_id` — the final backstop (present for every workspace). */
  workspaceOwnerId: string | null;
  /** The workspace's domain-ownership config (any categories/scopes). */
  config: ReadonlyArray<OwnershipConfigEntry>;
}

export interface DomainOwnerResolution {
  /** The resolved owner, or null only when no owner could be determined at all. */
  ownerUserId: string | null;
  /** The fallback step that produced the owner, or null when unresolved. */
  source: DomainOwnerSource | null;
}

export function resolveDomainOwner(input: DomainOwnerInput): DomainOwnerResolution {
  const { category, productId, documentOwnerId, workspaceOwnerId, config } = input;

  const productOverride = config.find(
    (c) => c.fieldCategory === category && c.productId === productId,
  );
  if (productOverride) {
    return { ownerUserId: productOverride.ownerUserId, source: 'product_override' };
  }

  const workspaceDefault = config.find(
    (c) => c.fieldCategory === category && c.productId === null,
  );
  if (workspaceDefault) {
    return { ownerUserId: workspaceDefault.ownerUserId, source: 'workspace_default' };
  }

  if (documentOwnerId) {
    return { ownerUserId: documentOwnerId, source: 'document_owner' };
  }

  if (workspaceOwnerId) {
    return { ownerUserId: workspaceOwnerId, source: 'workspace_admin' };
  }

  return { ownerUserId: null, source: null };
}
