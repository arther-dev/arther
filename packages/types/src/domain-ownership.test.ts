import { describe, expect, it } from 'vitest';
import {
  resolveDomainOwner,
  type OwnershipConfigEntry,
} from './domain-ownership';

const PRODUCT = 'prod-1';
const OTHER_PRODUCT = 'prod-2';
const DOC_OWNER = 'user-doc-owner';
const WS_OWNER = 'user-ws-owner';

const base = {
  category: 'Electrical',
  productId: PRODUCT,
  documentOwnerId: DOC_OWNER,
  workspaceOwnerId: WS_OWNER,
};

describe('resolveDomainOwner (G6.3 four-step fallback)', () => {
  it('1 — a product-specific override wins over everything', () => {
    const config: OwnershipConfigEntry[] = [
      { fieldCategory: 'Electrical', productId: null, ownerUserId: 'user-ws-default' },
      { fieldCategory: 'Electrical', productId: PRODUCT, ownerUserId: 'user-product' },
    ];
    expect(resolveDomainOwner({ ...base, config })).toEqual({
      ownerUserId: 'user-product',
      source: 'product_override',
    });
  });

  it('2 — the workspace category default applies when no product override exists', () => {
    const config: OwnershipConfigEntry[] = [
      { fieldCategory: 'Electrical', productId: null, ownerUserId: 'user-ws-default' },
      // An override for a DIFFERENT product must not match this product.
      { fieldCategory: 'Electrical', productId: OTHER_PRODUCT, ownerUserId: 'user-other' },
    ];
    expect(resolveDomainOwner({ ...base, config })).toEqual({
      ownerUserId: 'user-ws-default',
      source: 'workspace_default',
    });
  });

  it('2 — category is matched exactly (a default for another category does not apply)', () => {
    const config: OwnershipConfigEntry[] = [
      { fieldCategory: 'Mechanical', productId: null, ownerUserId: 'user-mech' },
    ];
    expect(resolveDomainOwner({ ...base, config })).toEqual({
      ownerUserId: DOC_OWNER,
      source: 'document_owner',
    });
  });

  it('3 — the document owner is the fallback when no ownership config matches', () => {
    expect(resolveDomainOwner({ ...base, config: [] })).toEqual({
      ownerUserId: DOC_OWNER,
      source: 'document_owner',
    });
  });

  it('4 — the workspace owner is the final backstop when the document has no owner', () => {
    expect(
      resolveDomainOwner({ ...base, documentOwnerId: null, config: [] }),
    ).toEqual({ ownerUserId: WS_OWNER, source: 'workspace_admin' });
  });

  it('unresolved — null only when nothing at all is configured', () => {
    expect(
      resolveDomainOwner({
        ...base,
        documentOwnerId: null,
        workspaceOwnerId: null,
        config: [],
      }),
    ).toEqual({ ownerUserId: null, source: null });
  });

  it('precedence is strict: workspace default beats document owner', () => {
    const config: OwnershipConfigEntry[] = [
      { fieldCategory: 'Electrical', productId: null, ownerUserId: 'user-ws-default' },
    ];
    expect(resolveDomainOwner({ ...base, config }).source).toBe('workspace_default');
  });
});
